# Grok-powered X Scheduler (Chrome Extension MV3)

A personal-use Chrome extension with a Node.js backend. Grok drafts posts; the official X API publishes them at scheduled times.

## Architecture
- `extension/`: Manifest V3 popup and service worker; uses `chrome.alarms` as a wake-up mechanism and stores schedule settings in `chrome.storage.local`.
- `server/`: Express backend, Grok draft generation, X OAuth 2.0 PKCE, scheduled publishing, and SQLite persistence.
- The backend is the authoritative scheduler, so jobs can run while Chrome is closed. The extension alarm only refreshes status.

## Requirements
- Node.js 20+
- An xAI API key
- An X developer app with OAuth 2.0 enabled, callback URL `http://127.0.0.1:8787/auth/x/callback`, and the required user-auth scopes for reading the authenticated user's identity and publishing posts. Confirm exact scopes and API access in the current X developer docs.

## 1. Configure backend
```bash
cd server
cp .env.example .env
# Edit .env; set X_CLIENT_ID, X_CLIENT_SECRET if your app is a confidential client,
# X_REDIRECT_URI, X_SCOPES, X_API_BASE_URL if needed, and XAI_API_KEY.
npm install
npm run dev
```
Default backend URL: `http://127.0.0.1:8787`.

For local development, configure the X callback URL exactly as shown above. For production, use HTTPS and a durable hosted backend; update the callback URL and extension API base URL.

### OAuth notes
This implementation uses OAuth 2.0 Authorization Code with PKCE. X OAuth app settings vary; public clients should not embed a client secret. The server stores access/refresh tokens in SQLite for a personal local setup. For production, encrypt tokens at rest and add CSRF protection, access controls, and a proper secrets manager. Never expose the backend port to the public internet without authentication.

## 2. Load extension
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `extension/` folder.
5. Open the extension popup, set backend URL to `http://127.0.0.1:8787`, and click **Connect X account**.
6. Authorize the app in X.
7. Enter topics and a schedule, then save.

## Scheduling
- Times are local browser/backend machine time (backend machine timezone).
- The backend checks due jobs every 15 seconds and stores jobs in SQLite.
- Configure a minimum interval that respects current X API limits and policy. The sample enforces at least 30 minutes between scheduled posts; adjust only after checking the current API rules and your intended use.
- This is not a guarantee of delivery at an exact second. Network outages, API limits, and server downtime can delay a post.
- The extension's service worker may be suspended by Chrome; the backend handles actual scheduling independently.

## Security and operations
- Keep `.env` private.
- Do not expose `GET /api/status` or other endpoints publicly without authentication. The local sample binds to loopback by default.
- OAuth state is validated and PKCE is used. This is a personal-use starter, not a security-audited production service.
- The sample stores tokens and post history in local SQLite. Back up the database securely.
- Review generated posts before enabling automatic posting. AI output may be inaccurate or inappropriate.
- Stop scheduling by disabling the schedule in the popup or calling `POST /api/schedule/disable`.

## API
- `GET /api/status`
- `GET /api/settings`
- `PUT /api/settings`
- `POST /api/generate`
- `GET /api/posts?limit=20`
- `POST /api/schedule/enable`
- `POST /api/schedule/disable`
- `GET /auth/x/start` (begin OAuth)
- `GET /auth/x/callback` (OAuth callback)

## Troubleshooting
- **OAuth error:** check client ID, redirect URL, scopes, app type, and X API access.
- **Grok error:** verify `XAI_API_KEY` and current xAI API model availability.
- **Post failed:** inspect backend logs and post history; common causes include expired authorization, insufficient API access, rate limits, or content validation.
- **Extension cannot connect:** verify backend is running and URL matches. If you change backend host/port, update the popup setting.
