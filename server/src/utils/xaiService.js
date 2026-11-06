/**
 * Utility functions for generating short social replies and draft posts.
 *
 * This layer is intentionally separate from the X OAuth implementation. The X
 * account connection uses the OAuth client ID and client secret configured for
 * the X app, while post generation uses a Gemini or OpenAI-compatible API key.
 */
import { APP_CONFIG } from '../config/config.js';

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
  /\/$/,
  '',
);

/**
 * Resolve the active AI provider and request metadata for generation calls.
 *
 * @returns {{ provider: 'gemini' | 'openai', apiKey: string, endpoint: string, model: string }}
 */
function getProviderConfig() {
  if (process.env.GEMINI_API_KEY) {
    return {
      provider: 'gemini',
      apiKey: process.env.GEMINI_API_KEY,
      endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}:generateContent`,
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      endpoint: `${OPENAI_BASE_URL}/chat/completions`,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    };
  }

  throw new Error('No AI API key configured. Set GEMINI_API_KEY or OPENAI_API_KEY in .env.');
}

/**
 * Build the prompt used to generate a draft social post.
 *
 * @param {{ topics: string, tone: string, recentPosts?: string[] }} options
 * @returns {string}
 */
const buildPostPrompt = ({ topics, tone, recentPosts = [] }) =>
  [
    'Write one original X post for a personal account.',
    `Topic area: ${topics}`,
    `Tone: ${tone}`,
    'Make it useful, specific, natural, and concise. Avoid fabricated personal experiences, unsupported factual claims, hashtags overload, and engagement bait.',
    'Target length: under 280 characters, ideally 180-220. If your first draft is too long, rewrite it shorter.',
    'Return only the post text, without quotation marks or explanation.',
    `Avoid repeating these recent posts: ${recentPosts.slice(0, 8).join(' | ')}`,
  ].join('\n');

/**
 * Build the prompt used to generate a short reply to an existing post.
 *
 * @param {{ topic: string, context?: string, tone: string }} options
 * @returns {string}
 */
const buildReplyPrompt = ({ topic, context, tone }) =>
  [
    'Write exactly one short reply to a tech post.',
    `Target topic: ${topic}`,
    `Tone: ${tone}`,
    'Keep it human, polished, and brief. No emojis, no hashtags, no CTA, and no copy-paste tone. It should read like a real developer replying in a thread.',
    `Context: ${context || 'A relevant technical discussion.'}`,
    `Length limit: ${APP_CONFIG.maxReplyCharacters} characters. Always stay under 280 characters and rewrite shorter if needed.`,
    'Return only the reply text without quotes or extra commentary.',
  ].join('\n');

/**
 * Trim generated text to the configured max character length while preserving a readable ending.
 *
 * @param {string} text
 * @param {number} maxChars
 * @returns {string}
 */
function enforceLengthLimit(text, maxChars) {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/^['"`]+|['"`]+$/g, '')
    .trim();
  if (cleaned.length <= maxChars) return cleaned;

  const shortened = cleaned.slice(0, Math.max(1, maxChars - 1)).trim();
  const withoutTrailingPunctuation = shortened.replace(/[.,!?;:]+$/, '').trim();
  return `${withoutTrailingPunctuation || shortened.slice(0, Math.max(1, maxChars - 3))}…`;
}

/**
 * Call the active AI provider and normalize the generated text to a safe length.
 *
 * @param {string} prompt
 * @param {{ systemMessage: string, temperature: number, maxTokens: number, maxChars: number, errorLabel: string }} options
 * @returns {Promise<string>}
 */
async function generateWithAI(
  prompt,
  { systemMessage, temperature, maxTokens, maxChars, errorLabel },
) {
  const config = getProviderConfig();

  try {
    let response;
    let data;

    if (config.provider === 'gemini') {
      const geminiResponse = await fetch(`${config.endpoint}?key=${config.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemMessage }],
          },
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        }),
        signal: AbortSignal.timeout(30000),
      });

      response = geminiResponse;
      data = await geminiResponse.json().catch(() => ({}));

      if (!geminiResponse.ok) {
        throw new Error(
          `${errorLabel} (${geminiResponse.status}): ${data?.error?.message || data?.error?.status || JSON.stringify(data)}`,
        );
      }

      const text = data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
        .trim();

      if (!text) {
        throw new Error('Gemini returned an empty response.');
      }

      return enforceLengthLimit(text, maxChars);
    }

    response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(30000),
    });

    data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        `${errorLabel} (${response.status}): ${data?.error?.message || JSON.stringify(data)}`,
      );
    }

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('AI provider returned an empty response.');
    }

    return enforceLengthLimit(text, maxChars);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('timeout') || message.includes('aborted') || message.includes('signal')) {
      throw new Error(`${errorLabel} timed out or was aborted while contacting the AI provider.`);
    }
    throw new Error(`${errorLabel}: ${message}`);
  }
}

/**
 * Generate an original post draft for the configured topic set.
 *
 * @param {{ topics: string, tone: string, recentPosts?: string[] }} options
 * @returns {Promise<string>}
 */
export const generatePost = async ({ topics, tone, recentPosts = [] }) => {
  const prompt = buildPostPrompt({ topics, tone, recentPosts });
  return generateWithAI(prompt, {
    systemMessage: 'You are a careful social media writing assistant.',
    temperature: 0.8,
    maxTokens: 180,
    maxChars: APP_CONFIG.maxPostCharacters,
    errorLabel: 'AI post generation failed',
  });
};

/**
 * Generate a short, conversational reply tailored to a technical discussion.
 *
 * @param {{ topic: string, context?: string, tone?: string }} options
 * @returns {Promise<string>}
 */
export const generateHumanReply = async ({
  topic,
  context,
  tone = 'technical and conversational',
}) => {
  const prompt = buildReplyPrompt({ topic, context, tone });
  return generateWithAI(prompt, {
    systemMessage: 'Write like a thoughtful developer replying naturally to a technical thread.',
    temperature: 0.85,
    maxTokens: 80,
    maxChars: APP_CONFIG.maxReplyCharacters,
    errorLabel: 'AI reply generation failed',
  });
};
