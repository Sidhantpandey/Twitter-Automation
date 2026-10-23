import { db, getSettings } from '../database/db.js';
import { generatePost } from '../utils/xaiService.js';

export const getPostsController = async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const rows = db.prepare('SELECT id,text,status,scheduled_for,x_post_id,error,created_at,published_at FROM posts ORDER BY id DESC LIMIT ?').all(limit);
  res.json(rows);
};

export const generateDraftController = async (req, res) => {
  const settings = getSettings();
  const text = await generatePost({
    topics: String(req.body?.topics || settings.topics),
    tone: String(req.body?.tone || settings.tone),
    recentPosts: db.prepare('SELECT text FROM posts ORDER BY id DESC LIMIT 8').all().map((row) => row.text),
  });

  const result = db.prepare("INSERT INTO posts(text,status) VALUES(?, 'draft')").run(text);
  res.json({ id: result.lastInsertRowid, text });
};
