# EveryFrame

A web-based utility that watches one open browser tab, screenshots it on a schedule via Playwright/CDP, and sends each frame to a Telegram channel through a bot — with multi-user accounts, MFA, a configurable schedule (interval, active hours, weekdays, date range), a configurable Telegram caption, storage archiving, and an activity/error log.

Full design and technical reference:
- [`docs/architecture.md`](docs/architecture.md) — system architecture, HLD/LLD, ERD, class/activity/state/sequence diagrams
- [`docs/build-plan.md`](docs/build-plan.md) — the phased build order this codebase follows
- [`docs/everyframe-handout-brief.md`](docs/everyframe-handout-brief.md) — original product brief
- [`docs/everyframe-claude-code-kickoff-prompt.md`](docs/everyframe-claude-code-kickoff-prompt.md) — original kickoff scope

The approved UI design (interactive canvas) and a rendered architecture doc were published as Claude Artifacts during design review. Their source lives in `design-canvas/` and is **not** committed to git (see [Design artifacts](#design-artifacts) below) — local PDF snapshots are kept in `artifacts-local/` instead, also gitignored.

## Project status

This is under active build, following `docs/build-plan.md`'s phased order. Currently implemented and verified against real Chrome/HTTP calls.


## Prerequisites

- **Node.js 20+** (developed against Node 24)
- **npm** (workspaces-based monorepo — no separate package manager needed)
- **Google Chrome or Chromium**, launched with remote debugging enabled, for anything that touches `/api/cdp/*`. The launch command is platform-specific - see [Running it](#running-it) below (there's no bare `chrome` command on macOS by default, unlike some Linux setups).
- **A Telegram bot token and channel ID** (once Telegram delivery is built) — create a bot via [@BotFather](https://t.me/BotFather) and add it to your channel.

## Setup

```bash
git clone <this repo>
cd EveryFrame
npm install                 # installs all workspaces (packages/server, packages/web)
cp packages/server/.env.example packages/server/.env
# edit packages/server/.env - at minimum set EVERYFRAME_SESSION_SECRET
```

`npm run dev -w packages/server` (and `start`) load that `.env` via Node's `--env-file-if-exists` flag - fine to skip entirely for local dev (safe in-code defaults kick in), but anything you put in `.env` only takes effect this way, not via some other auto-loader.

Playwright needs its own browser binary the first time (used for the CDP client library, not to launch a browser for you - EveryFrame connects to *your* Chrome):

```bash
npx --workspace packages/server playwright install chromium
```

## Running it

```bash
# 1. Launch Chrome with remote debugging on (separate terminal, stays open):

# macOS:
open -a "Google Chrome" --args --remote-debugging-port=9222

# Windows (if chrome.exe isn't on PATH, use its full path instead):
chrome --remote-debugging-port=9222

# Linux:
google-chrome --remote-debugging-port=9222

# 2. Start the backend:
npm run dev -w packages/server

# 3. Start the frontend (separate terminal):
npm run dev -w packages/web
```

The frontend serves on `https://localhost:5173` (self-signed dev cert, generated automatically on first run - your browser will warn once, click through it) and proxies `/api`/`/ws` to the backend. The backend listens on `http://localhost:4000` by default (override with `PORT` in `.env`); SQLite data lives in `packages/server/data/everyframe.db` (auto-created, gitignored), captures in `packages/server/captures/` (also gitignored).

### Running the backend over https too

By default only the frontend dev server is https (the browser never talks to the backend directly, so this is enough for a normal browser padlock). If you want the backend itself to also serve https - e.g. to hit `https://localhost:4000` directly, outside the Vite proxy:

```bash
npm run generate-cert -w packages/server   # one-time - writes packages/server/certs/*.pem (gitignored)
# then in packages/server/.env:
EVERYFRAME_HTTPS=true
```

Restart the backend after changing `.env`. `EVERYFRAME_TLS_CERT_PATH`/`EVERYFRAME_TLS_KEY_PATH` can point at a different cert/key pair if you'd rather not use the generated one.

## Testing

```bash
npm test -w packages/server        # vitest
npm run typecheck -w packages/server
```

## Project structure

```
EveryFrame/
  docs/                    # architecture, build plan, original brief - versioned
  design-canvas/           # design tool source + published artifact HTML - gitignored, see below
  artifacts-local/         # local PDF snapshots of published artifacts - gitignored
  packages/
    server/                # Node.js + TypeScript + Fastify backend
      src/
        auth/              # AuthService, password hashing, session helpers
        cdp/                # CDP target discovery (connectOverCDP)
        db/                 # SQLite schema + per-domain query modules
        routes/             # Fastify route handlers
      data/                # SQLite database file - gitignored
      captures/            # captured screenshots - gitignored
    web/                   # React + Vite frontend (not yet built)
```

## Dependencies

This is a Node.js project - `package.json` (per workspace) plus the committed `package-lock.json` are the authoritative dependency manifest; `npm install` at the repo root reads both and installs everything for every workspace in one step. There's no Python-style `requirements.txt` here since this isn't a Python project, but here's what's in play and why, for anyone forking:

**Backend (`packages/server`)**

| Package | Purpose |
|---|---|
| `fastify` | HTTP server / router |
| `playwright` | Chromium automation - connects to your Chrome over CDP, takes screenshots |
| `better-sqlite3` | Synchronous SQLite driver - config, capture history, sessions, logs |
| `argon2` | Password hashing |
| `@fastify/session`, `@fastify/cookie` | Cookie-based sessions, backed by a custom SQLite session store |
| `@fastify/rate-limit` | Brute-force protection on auth endpoints |
| `@fastify/csrf-protection` | CSRF tokens on state-changing routes |
| `otplib`, `qrcode` | TOTP MFA + enrollment QR codes |
| `typescript`, `tsx` | Type checking / running TS directly in dev |
| `vitest` | Unit tests |

**Frontend (`packages/web`, not yet scaffolded)**

React + Vite, plain CSS (no UI kit - see `docs/architecture.md` for why), React Router with lazy-loaded routes.
