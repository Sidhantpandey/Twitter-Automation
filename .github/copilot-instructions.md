# Project context for AI assistants

This project is a local-first X automation project with a backend scheduler and a Chrome extension frontend.

## What this is

This repo is built for automating X activity in a controlled and auditable way:
- a Node.js backend handles scheduling, OAuth, SQLite persistence, and API logic
- a Chrome extension provides the UI and refreshes status from the backend
- the backend uses the official X API and keeps activity conservative and rate-limited

## Where things are

- `extension/` contains the Chrome extension UI and background logic.
- `server/` contains the backend API, scheduler, SQLite persistence, and X/OAuth integration.
- `server/src/` holds the application logic in a simple MVC structure.
- `server/src/config/` stores app config values.
- `server/src/database/` stores database models and access helpers.
- `server/src/controllers/` stores request handlers.
- `server/src/routes/` stores route registration.
- `server/src/utils/` stores reusable services such as X auth, scheduler, and AI generation helpers.
- `server/src/index.js` is the backend entrypoint.
- `README.md` contains the architecture and local workflow.

## Commands

Typical project workflow:
- install backend dependencies: `cd server && npm install`
- run the app in dev mode: `cd server && npm run dev`
- start the server normally: `cd server && npm run start`
- keep validation simple: `cd server && node --check src/index.js` and related syntax checks

## Hard rules for AI agents

The following instructions are mandatory and must not be removed, shortened, or reworded.

- This project is a local-first X automation project with a backend scheduler and a Chrome extension frontend.
- Do not read, print, expose, or commit secrets, especially `server/.env`, `server/.env.*`, root `.env`, root `.env.*`, tokens, OAuth credentials, or database connection strings.
- Never access or expose SQLite files or any generated DB data that may contain local user state.
- Do not simulate cursor movement, fake mouse input, anti-detection behavior, or browser automation meant to evade bot detection.
- This project uses the official X API and should stay within safe and compliant limits. Keep actions conservative and auditable.
- User identity, credentials, and account state are personal and must be treated as sensitive.

## Rules

- Never read, print, or commit `server/.env`, any password, token, or connection string.
- Keep code changes focused on source files and non-secret configuration.
- Follow the project’s MVC structure: routes -> controllers -> utils/services -> database.
- Keep the scheduler conservative and low-volume.
- The default reply cap should remain at or below 10 replies per day.
- Keep replies short, technical, and human-sounding.
- Do not rely on browser automation or fake UI behavior.
- Keep the project compliant with official X API usage and platform policies.
- Prefer small, focused changes; avoid broad refactors without reason.
- Match the surrounding code style and comment density.

## Security and project notes

- Do not edit or commit `.env` files.
- Never expose local endpoints publicly without authentication and safe hosting assumptions.
- Never access generated state files that may contain local user data.
- If a change affects API behavior, validate the relevant backend startup and syntax flow.
- If a feature touches settings or scheduling, update the related config, route, and controller logic consistently.

## Summary requirement

When giving a status update or summary for this project, include:
- what changed,
- which files were touched,
- what validation was run,
- whether any secret or credential files were avoided.
