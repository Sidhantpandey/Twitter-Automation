import { beginOAuth, finishOAuth, getXAccount } from '../utils/xService.js';
import { getSettings } from '../database/db.js';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[ch]));

export const startXAuthController = (req, res, next) => {
  try {
    res.redirect(302, beginOAuth());
  } catch (error) {
    next(error);
  }
};

export const xOAuthCallbackController = async (req, res) => {
  if (req.query.error) {
    return res.status(400).send(`X authorization failed: ${String(req.query.error_description || req.query.error)}`);
  }

  if (!req.query.code || !req.query.state) {
    return res.status(400).send('Missing OAuth code/state.');
  }

  const user = await finishOAuth({
    code: String(req.query.code),
    state: String(req.query.state),
  });

  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>X connected</title></head><body style="font:16px system-ui;max-width:600px;margin:4rem auto;padding:1rem"><h1>X account connected</h1><p>Connected as @${escapeHtml(user.username || 'your account')}.</p><p>You can close this tab and return to the extension.</p></body></html>`);
};

export const statusController = (_req, res) => {
  const settings = getSettings();
  const xAccount = getXAccount();
  res.json({ settings, xAccount });
};
