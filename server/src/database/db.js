import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// Model layer: read/write SQLite state for settings, OAuth, posts, and reply activity.
const dbPath = process.env.DATABASE_PATH || './data.sqlite';
const absolute = path.resolve(dbPath);
fs.mkdirSync(path.dirname(absolute), { recursive: true });

export const db = new Database(absolute);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    topics TEXT NOT NULL DEFAULT 'Backend engineering, AWS, system design, AI',
    posts_per_day INTEGER NOT NULL DEFAULT 3,
    reply_limit_per_day INTEGER NOT NULL DEFAULT 10,
    schedule_times TEXT NOT NULL DEFAULT '10:00',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    tone TEXT NOT NULL DEFAULT 'technical and conversational',
    next_run_at TEXT,
    last_error TEXT
  );
  INSERT OR IGNORE INTO settings (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS oauth_tokens (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at INTEGER,
    scope TEXT,
    user_id TEXT,
    username TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS oauth_state (
    state TEXT PRIMARY KEY,
    verifier TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    scheduled_for TEXT,
    x_post_id TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT
  );

  CREATE TABLE IF NOT EXISTS reply_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id TEXT,
    in_reply_to_tweet_id TEXT NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

export const getSettings = () => {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  if (!row) {
    return {
      enabled: false,
      topics: '',
      postsPerDay: 3,
      replyLimitPerDay: 10,
      scheduleTimes: ['10:00'],
      timezone: 'Asia/Kolkata',
      tone: 'technical and conversational',
      nextRunAt: null,
      lastError: null,
    };
  }

  return {
    enabled: Boolean(row.enabled),
    topics: row.topics,
    postsPerDay: Number(row.posts_per_day),
    replyLimitPerDay: Number(row.reply_limit_per_day || 10),
    scheduleTimes: String(row.schedule_times || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    timezone: row.timezone,
    tone: row.tone,
    nextRunAt: row.next_run_at,
    lastError: row.last_error,
  };
};

export const saveSettings = (settings) => {
  db.prepare(
    `
    UPDATE settings
    SET enabled = ?,
        topics = ?,
        posts_per_day = ?,
        reply_limit_per_day = ?,
        schedule_times = ?,
        timezone = ?,
        tone = ?
    WHERE id = 1
  `,
  ).run(
    settings.enabled ? 1 : 0,
    settings.topics,
    settings.postsPerDay,
    settings.replyLimitPerDay ?? 10,
    (settings.scheduleTimes || []).join(','),
    settings.timezone,
    settings.tone,
  );
};

export const getTodayReplyCount = () => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const result = db
    .prepare('SELECT COUNT(*) AS count FROM reply_log WHERE created_at >= ?')
    .get(startOfDay.toISOString());
  return Number(result?.count || 0);
};

export const getLastReplyAt = () => {
  const row = db.prepare('SELECT created_at FROM reply_log ORDER BY created_at DESC LIMIT 1').get();
  return row ? new Date(row.created_at).getTime() : null;
};

export const recordReplyEvent = ({ tweetId, inReplyToTweetId, text, status = 'published' }) => {
  db.prepare(
    `
    INSERT INTO reply_log(tweet_id, in_reply_to_tweet_id, text, status, created_at)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(
    String(tweetId || ''),
    String(inReplyToTweetId || ''),
    String(text || ''),
    status,
    new Date().toISOString(),
  );
};
