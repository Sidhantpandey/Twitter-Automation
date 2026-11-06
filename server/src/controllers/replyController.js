import { APP_CONFIG } from '../config/config.js';
import {
  db,
  getSettings,
  getTodayReplyCount,
  getLastReplyAt,
  recordReplyEvent,
} from '../database/db.js';
import { generateHumanReply } from '../utils/xaiService.js';
import { publishReply } from '../utils/xService.js';

export const replyStatsController = (_req, res) => {
  const settings = getSettings();
  const count = getTodayReplyCount();
  const lastReplyAt = getLastReplyAt();

  res.json({
    limit: settings.replyLimitPerDay || APP_CONFIG.maxRepliesPerDay,
    usedToday: count,
    remaining: Math.max(0, (settings.replyLimitPerDay || APP_CONFIG.maxRepliesPerDay) - count),
    lastReplyAt,
    cooldownMinutes: APP_CONFIG.replyCooldownMinutes,
  });
};

export const publishHumanReplyController = async (req, res) => {
  const { tweetId, topic, tone, context } = req.body || {};
  if (!tweetId) {
    return res.status(400).json({ error: 'tweetId is required.' });
  }

  const settings = getSettings();
  const limit = settings.replyLimitPerDay || APP_CONFIG.maxRepliesPerDay;
  const usedToday = getTodayReplyCount();
  const lastReplyAt = getLastReplyAt();
  const cooldownMs = (APP_CONFIG.replyCooldownMinutes || 1) * 60 * 1000;

  if (usedToday >= limit) {
    return res.status(429).json({
      error: `Daily reply limit reached (${limit}/day).`,
      limit,
      usedToday,
    });
  }

  if (lastReplyAt && Date.now() - lastReplyAt < cooldownMs) {
    const remainingMs = cooldownMs - (Date.now() - lastReplyAt);
    return res.status(429).json({
      error: `Reply cooldown active. Wait ${Math.ceil(remainingMs / 60000)} minute(s).`,
      cooldownMinutes: APP_CONFIG.replyCooldownMinutes,
      retryAfterMs: remainingMs,
    });
  }

  const replyText = await generateHumanReply({
    topic: topic || settings.topics,
    tone: tone || settings.tone,
    context: context || 'A relevant technical thread or product insight.',
  });

  const result = await publishReply({
    text: replyText,
    inReplyToTweetId: String(tweetId),
  });

  recordReplyEvent({
    tweetId: String(result?.id || ''),
    inReplyToTweetId: String(tweetId),
    text: replyText,
    status: 'published',
  });

  res.json({
    ok: true,
    replyId: result?.id || null,
    text: replyText,
    remaining: Math.max(0, limit - (usedToday + 1)),
    cooldownMinutes: APP_CONFIG.replyCooldownMinutes,
  });
};
