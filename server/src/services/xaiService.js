// AI writing helpers used for both scheduled posts and short human-sounding replies.
import { APP_CONFIG } from '../config.js';

const buildPostPrompt = ({ topics, tone, recentPosts = [] }) => [
  'Write one original X post for a personal account.',
  `Topic area: ${topics}`,
  `Tone: ${tone}`,
  'Make it useful, specific, natural, and concise. Avoid fabricated personal experiences, unsupported factual claims, hashtags overload, and engagement bait.',
  'Return only the post text, without quotation marks or explanation.',
  `Avoid repeating these recent posts: ${recentPosts.slice(0, 8).join(' | ')}`,
].join('\n');

const buildReplyPrompt = ({ topic, context, tone }) => [
  'Write exactly one short reply to a tech post.',
  `Target topic: ${topic}`,
  `Tone: ${tone}`,
  'Keep it human, polished, and brief. No emojis, no hashtags, no CTA, and no copy-paste tone. It should read like a real developer replying in a thread.',
  `Context: ${context || 'A relevant technical discussion.'}`,
  `Length limit: ${APP_CONFIG.maxReplyCharacters} characters.`,
  'Return only the reply text without quotes or extra commentary.',
].join('\n');

export const generatePost = async ({ topics, tone, recentPosts = [] }) => {
  if (!process.env.XAI_API_KEY) {
    throw new Error('XAI_API_KEY is not configured.');
  }

  const prompt = buildPostPrompt({ topics, tone, recentPosts });
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.XAI_MODEL || 'grok-3-mini',
      messages: [
        { role: 'system', content: 'You are a careful social media writing assistant.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 180,
    }),
    signal: AbortSignal.timeout(30000),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Grok API error (${response.status}): ${data?.error?.message || JSON.stringify(data)}`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('Grok returned an empty post.');
  }
  if (text.length > APP_CONFIG.maxPostCharacters) {
    throw new Error(`Generated post is ${text.length} characters; maximum is ${APP_CONFIG.maxPostCharacters}.`);
  }

  return text;
};

export const generateHumanReply = async ({ topic, context, tone = 'technical and conversational' }) => {
  if (!process.env.XAI_API_KEY) {
    throw new Error('XAI_API_KEY is not configured.');
  }

  const prompt = buildReplyPrompt({ topic, context, tone });
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.XAI_MODEL || 'grok-3-mini',
      messages: [
        { role: 'system', content: 'Write like a thoughtful developer replying naturally to a technical thread.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.85,
      max_tokens: 80,
    }),
    signal: AbortSignal.timeout(30000),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Grok reply generation failed (${response.status}): ${data?.error?.message || JSON.stringify(data)}`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('Grok returned an empty reply.');
  }

  const cleaned = text.replace(/^['"`]+|['"`]+$/g, '').trim();
  if (cleaned.length > APP_CONFIG.maxReplyCharacters) {
    throw new Error(`Generated reply is ${cleaned.length} characters; maximum is ${APP_CONFIG.maxReplyCharacters}.`);
  }

  return cleaned;
};
