/**
 * X OAuth and API utilities.
 *
 * This service is responsible for connecting the user's X account and publishing
 * posts/replies using the official X APIs. The X client ID and secret are used
 * here for account authentication, while the AI generation layer uses Gemini or
 * an OpenAI-compatible key from a separate environment configuration.
 */
import crypto from 'node:crypto';
import { db } from '../database/db.js';

const base = () => (process.env.X_API_BASE_URL || 'https://api.x.com/2').replace(/\/$/, '');
const tokenUrl = 'https://api.x.com/2/oauth2/token';
const authUrl = 'https://twitter.com/i/oauth2/authorize';

/**
 * Encode a buffer using URL-safe base64.
 *
 * @param {Buffer} buffer
 * @returns {string}
 */
function b64url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Create a PKCE verifier/challenge pair for the OAuth authorization code flow.
 *
 * @returns {{ verifier: string, challenge: string }}
 */
export const createPkce = () => {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
};

/**
 * Build the X OAuth authorization URL.
 *
 * @returns {string}
 */
export const beginOAuth = () => {
  if (!process.env.X_CLIENT_ID || !process.env.X_REDIRECT_URI) {
    throw new Error('Set X_CLIENT_ID and X_REDIRECT_URI in .env.');
  }

  const { verifier, challenge } = createPkce();
  const state = b64url(crypto.randomBytes(24));

  db.prepare('INSERT INTO oauth_state(state, verifier, created_at) VALUES (?, ?, ?)').run(
    state,
    verifier,
    Date.now(),
  );

  const url = new URL(authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.X_CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.X_REDIRECT_URI);
  url.searchParams.set(
    'scope',
    process.env.X_SCOPES || 'tweet.read tweet.write users.read offline.access',
  );
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
};

/**
 * Exchange an OAuth code for tokens.
 *
 * @param {Record<string, string>} params
 * @returns {Promise<Record<string, unknown>>}
 */
async function tokenRequest(params) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  if (process.env.X_CLIENT_SECRET) {
    headers.Authorization =
      'Basic ' +
      Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64');
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20000),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`X token exchange failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Perform a GET request to a X API endpoint with the stored access token.
 *
 * @param {string} pathname
 * @param {string} accessToken
 * @returns {Promise<Record<string, unknown>>}
 */
async function xGet(pathname, accessToken) {
  const response = await fetch(`${base()}${pathname}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20000),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`X API error (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Complete the OAuth flow and persist the access token for subsequent publishing.
 *
 * @param {{ code: string, state: string }} params
 * @returns {Promise<Record<string, unknown>>}
 */
export const finishOAuth = async ({ code, state }) => {
  const row = db.prepare('SELECT * FROM oauth_state WHERE state=?').get(state);
  if (!row || Date.now() - row.created_at > 10 * 60 * 1000) {
    throw new Error('Invalid or expired OAuth state. Try connecting again.');
  }

  db.prepare('DELETE FROM oauth_state WHERE state=?').run(state);

  const token = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.X_REDIRECT_URI,
    code_verifier: row.verifier,
    client_id: process.env.X_CLIENT_ID,
  });

  const user = await xGet('/users/me', token.access_token);
  db.prepare(
    `INSERT INTO oauth_tokens(id, access_token, refresh_token, expires_at, scope, user_id, username, updated_at)
    VALUES(1,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET access_token=excluded.access_token, refresh_token=excluded.refresh_token,
      expires_at=excluded.expires_at, scope=excluded.scope, user_id=excluded.user_id,
      username=excluded.username, updated_at=CURRENT_TIMESTAMP`,
  ).run(
    token.access_token,
    token.refresh_token || null,
    token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    token.scope || '',
    user?.data?.id || null,
    user?.data?.username || null,
  );

  return user?.data || {};
};

/**
 * Load the active X access token, refreshing it when needed.
 *
 * @returns {Promise<string>}
 */
async function getAccessToken() {
  const row = db.prepare('SELECT * FROM oauth_tokens WHERE id=1').get();
  if (!row) {
    throw new Error('X account is not connected. Click Connect X account in the extension.');
  }

  if (row.expires_at && row.expires_at < Date.now() + 60_000) {
    if (!row.refresh_token) {
      throw new Error('X access token expired. Reconnect the X account.');
    }

    const token = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
      client_id: process.env.X_CLIENT_ID,
    });

    db.prepare(
      `UPDATE oauth_tokens SET access_token=?, refresh_token=?, expires_at=?, scope=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`,
    ).run(
      token.access_token,
      token.refresh_token || row.refresh_token,
      token.expires_in ? Date.now() + token.expires_in * 1000 : null,
      token.scope || row.scope,
    );

    return token.access_token;
  }

  return row.access_token;
}

/**
 * Publish a new X post.
 *
 * @param {string} text
 * @returns {Promise<Record<string, unknown>>}
 */
export const publishPost = async (text) => {
  const accessToken = await getAccessToken();
  const response = await fetch(`${base()}/tweets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(20000),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`X publish failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return data?.data;
};

/**
 * Publish a reply to an existing X post.
 *
 * @param {{ text: string, inReplyToTweetId: string }} params
 * @returns {Promise<Record<string, unknown>>}
 */
export const publishReply = async ({ text, inReplyToTweetId }) => {
  if (!inReplyToTweetId) {
    throw new Error('A reply target tweet id is required.');
  }

  const accessToken = await getAccessToken();
  const response = await fetch(`${base()}/tweets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      reply: {
        in_reply_to_tweet_id: inReplyToTweetId,
      },
    }),
    signal: AbortSignal.timeout(20000),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`X reply failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return data?.data;
};

/**
 * Return the connected X user record if an account has been authenticated.
 *
 * @returns {{ connected: boolean, userId?: string | null, username?: string | null }}
 */
export const getXAccount = () => {
  const row = db.prepare('SELECT user_id, username FROM oauth_tokens WHERE id=1').get();
  return row
    ? { connected: true, userId: row.user_id, username: row.username }
    : { connected: false };
};

/**
 * Disconnect the active X account by clearing the persisted OAuth token state.
 *
 * @returns {{ connected: boolean }}
 */
export const disconnectXAccount = () => {
  db.prepare('DELETE FROM oauth_tokens WHERE id = 1').run();
  db.prepare('DELETE FROM oauth_state WHERE created_at < ?').run(Date.now() - 60 * 60 * 1000);
  return { connected: false };
};
