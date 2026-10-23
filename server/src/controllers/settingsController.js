import { getSettings, saveSettings } from '../database/db.js';

export const getSettingsController = async (_req, res) => {
  res.json(getSettings());
};

export const updateSettingsController = async (req, res) => {
  const body = req.body || {};
  const current = getSettings();
  const topics = String(body.topics ?? current.topics).trim();
  const tone = String(body.tone ?? current.tone).trim();
  const timezone = String(body.timezone ?? current.timezone).trim();
  const times = Array.isArray(body.scheduleTimes) ? body.scheduleTimes.map(String) : current.scheduleTimes;
  const postsPerDay = Number(body.postsPerDay ?? current.postsPerDay);
  const replyLimitPerDay = Number(body.replyLimitPerDay ?? current.replyLimitPerDay ?? 10);

  if (!topics || topics.length > 1000) {
    return res.status(400).json({ error: 'Topics must be 1–1000 characters.' });
  }

  if (!tone || tone.length > 200) {
    return res.status(400).json({ error: 'Tone must be 1–200 characters.' });
  }

  if (!Number.isInteger(postsPerDay) || postsPerDay < 1 || postsPerDay > 8) {
    return res.status(400).json({ error: 'postsPerDay must be between 1 and 8.' });
  }

  if (!Number.isInteger(replyLimitPerDay) || replyLimitPerDay < 1 || replyLimitPerDay > 10) {
    return res.status(400).json({ error: 'replyLimitPerDay must be between 1 and 10.' });
  }

  if (!times.length || times.length > 8 || times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) {
    return res.status(400).json({ error: 'Schedule times must be valid HH:MM values.' });
  }

  if (new Set(times).size !== times.length) {
    return res.status(400).json({ error: 'Schedule times must be unique.' });
  }

  const minutes = times.map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))).sort((a, b) => a - b);
  if (minutes.some((m, index) => index > 0 && m - minutes[index - 1] < 30) ||
      (minutes.length > 1 && minutes[0] + 1440 - minutes[minutes.length - 1] < 30)) {
    return res.status(400).json({ error: 'Scheduled posts must be at least 30 minutes apart, including across midnight.' });
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch (_error) {
    return res.status(400).json({ error: 'Invalid IANA timezone.' });
  }

  const nextSettings = {
    ...current,
    topics,
    tone,
    timezone,
    postsPerDay,
    replyLimitPerDay,
    scheduleTimes: times,
  };

  saveSettings(nextSettings);
  res.json(getSettings());
};
