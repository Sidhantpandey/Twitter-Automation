# AGENTS.md

## Hard rules for AI agents

The following instructions are mandatory and must not be removed, shortened, or reworded.

- This project is a local-first X automation project with a backend scheduler and a Chrome extension frontend.
- Do not read, print, expose, or commit secrets, especially `server/.env`, `server/.env.*`, root `.env`, root `.env.*`, tokens, OAuth credentials, or database connection strings.
- Never access or expose SQLite files or any generated DB data that may contain local user state.
- Do not simulate cursor movement, fake mouse input, anti-detection behavior, or browser automation meant to evade bot detection.
- This project uses the official X API and should stay within safe and compliant limits. Keep actions conservative and auditable.
- User identity, credentials, and account state are personal and must be treated as sensitive.

## Project layout

- `extension/` contains the Chrome extension UI and background logic.
- `server/` contains the backend API, scheduling logic, SQLite persistence, and X/OAuth integration.
- `server/src/` holds the application logic in an MVC-style structure.
- `server/src/config/` stores configuration values.
- `server/src/database/` stores database models and access helpers.
- `server/src/controllers/` stores request handlers.
- `server/src/routes/` stores route registration.
- `server/src/utils/` stores reusable services like X API, scheduler, and AI helper logic.
- `server/src/index.js` is the backend entrypoint.
- `README.md` describes the local architecture and workflow.

## Operating rules

- Keep code changes focused on the source files, not on secret or generated runtime data.
- Do not edit secret environment files or commit `.env` files.
- Prefer minimal, well-documented edits with clear structure and comments.
- Follow the MVC separation already used in the project: routes -> controllers -> services/utils -> database.
- Keep the scheduler conservative and rate-limited.
- The default reply cap should remain at or below 10 replies per day.
- Keep replies short, technical, and human-sounding.
- Understand that the scheduler is server-side and should not rely on browser automation or fake UI behavior.
- Keep the project compliant with official X API usage and platform policies.

## Required behavior

- If a change affects API behavior, validate the relevant backend syntax and startup flow.
- If a change adds functionality, keep code readable and properly commented.
- If a feature touches settings or scheduling, update the relevant config and route/controller logic consistently.
- Prioritize reliability and compliance over aggressive automation.
- If a feature is user-facing in the extension, keep the UI simple and clear without injecting fake automation or anti-bot behavior.

## Security restrictions

- Never print secrets in logs, output, or summaries.
- Never read contents of `.env` or any credential file.
- Never commit token data, OAuth data, or database contents.
- Never expose local endpoints publicly without proper authentication and safe hosting assumptions.
- Never access SQLite files or generated state files that may contain local user data.

## Summary requirement

When providing a status update or summary after completing work, mention:

- what changed,
- which files were touched,
- any validation run,
- and whether any secret or credential files were avoided.
