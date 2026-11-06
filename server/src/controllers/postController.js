/**
 * Controller endpoints for draft generation and existing post listing.
 *
 * These actions are server-side and use a Gemini/OpenAI-compatible generation
 * model for content creation. The X OAuth client ID and secret are used only for
 * authenticating the X account connection.
 */
import { db, getSettings } from '../database/db.js';
import { generatePost } from '../utils/xaiService.js';
import { publishPost } from '../utils/xService.js';

/**
 * Return recent draft/published posts for the extension status panel.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const getPostsController = async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const rows = db
    .prepare(
      'SELECT id,text,status,scheduled_for,x_post_id,error,created_at,published_at FROM posts ORDER BY id DESC LIMIT ?',
    )
    .all(limit);

  res.json(rows);
};

/**
 * Save an edited draft or queued post back into the local database.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const saveDraftController = async (req, res) => {
  const postId = Number(req.params.id);
  const text = String(req.body?.text ?? '').trim();

  if (!Number.isInteger(postId) || postId < 1) {
    return res.status(400).json({ error: 'Invalid draft id.' });
  }

  if (!text) {
    return res.status(400).json({ error: 'Draft text cannot be empty.' });
  }

  const row = db.prepare('SELECT id, status FROM posts WHERE id = ?').get(postId);
  if (!row) {
    return res.status(404).json({ error: 'Draft not found.' });
  }

  const status = row.status === 'queued' ? 'queued' : 'draft';
  db.prepare('UPDATE posts SET text = ?, status = ? WHERE id = ?').run(text, status, postId);

  const saved = db
    .prepare(
      'SELECT id,text,status,scheduled_for,x_post_id,error,created_at,published_at FROM posts WHERE id = ?',
    )
    .get(postId);

  res.json(saved);
};

/**
 * Publish a draft or queued post immediately and remove it from local storage.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const instantPublishController = async (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isInteger(postId) || postId < 1) {
    return res.status(400).json({ error: 'Invalid post id.' });
  }

  const row = db
    .prepare(
      'SELECT id,text,status,scheduled_for,x_post_id,error,created_at,published_at FROM posts WHERE id = ?',
    )
    .get(postId);

  if (!row) {
    return res.status(404).json({ error: 'Post not found.' });
  }

  const published = await publishPost(row.text);
  db.prepare('DELETE FROM posts WHERE id = ?').run(postId);

  res.json({
    id: row.id,
    deleted: true,
    xPostId: published?.id || null,
    text: row.text,
  });
};

/**
 * Generate a draft post and store it locally for review before publishing.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const generateDraftController = async (req, res) => {
  const settings = getSettings();
  const text = await generatePost({
    topics: String(req.body?.topics || settings.topics),
    tone: String(req.body?.tone || settings.tone),
    recentPosts: db
      .prepare('SELECT text FROM posts ORDER BY id DESC LIMIT 8')
      .all()
      .map((row) => row.text),
  });

  const result = db.prepare("INSERT INTO posts(text,status) VALUES(?, 'draft')").run(text);
  res.json({ id: result.lastInsertRowid, text });
};
