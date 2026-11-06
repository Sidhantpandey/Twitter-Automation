/**
 * Shared application configuration for the scheduler and API server.
 *
 * This project intentionally uses the official X OAuth flow for account
 * connection and Gemini/OpenAI-compatible models for text generation.
 */
export const APP_CONFIG = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 8787),
  defaultTopics: 'Backend engineering, AWS, system design, AI',
  defaultTone: 'technical and conversational',
  defaultTimezone: 'Asia/Kolkata',
  maxRepliesPerDay: Number(process.env.MAX_REPLIES_PER_DAY || 10),
  replyCooldownMinutes: Number(process.env.REPLY_COOLDOWN_MINUTES || 1),
  maxReplyCharacters: 180,
  maxPostCharacters: 280,
  defaultScheduleTimes: ['10:00'],
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
};
