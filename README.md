# EveryFrame

A web-based utility that watches one open browser tab, screenshots it on a schedule via Playwright/CDP, and sends each frame to a Telegram channel through a bot — with multi-user accounts, MFA, a configurable schedule (interval, active hours, weekdays, date range), a configurable Telegram caption, storage archiving, and an activity/error log.

Full design and technical reference:
- [`docs/architecture.md`](docs/architecture.md) — system architecture, HLD/LLD, ERD, class/activity/state/sequence diagrams
- [`docs/build-plan.md`](docs/build-plan.md) — the phased build order this codebase follows
- [`docs/everyframe-handout-brief.md`](docs/everyframe-handout-brief.md) — original product brief
- [`docs/everyframe-claude-code-kickoff-prompt.md`](docs/everyframe-claude-code-kickoff-prompt.md) — original kickoff scope

The approved UI design (interactive canvas) and a rendered architecture doc were published as Claude Artifacts during design review. Their source lives in `design-canvas/` and is **not** committed to git (see [Design artifacts](#design-artifacts) below) — local PDF snapshots are kept in `artifacts-local/` instead, also gitignored.

## Project status

This is under active build, following `docs/build-plan.md`'s phased order. Currently implemented and verified against real Chrome/HTTP calls:

- **Phase 1 — Backend skeleton + CDP connection**: `GET /api/cdp/targets` connects to a real Chrome instance over CDP and lists open tabs; fails gracefully (503, no crash) when Chrome isn't reachable.
- **Phase 3 — Auth & session foundation**: register, login, logout, `GET /api/auth/me`, SQLite-backed sessions, CSRF-protected mutating routes, rate-limited auth endpoints.
- **Phase 4 — MFA**: TOTP enroll/confirm/verify/disable, QR-code enrollment (Google/Microsoft Authenticator compatible), one-time recovery codes, secrets encrypted at rest.
- **Phase 5 — Multi-user config storage**: `GET/PUT /api/config`, one row per user, bot token masked on read-back and preserved across updates that don't resend it, every save logged to `activity_log`.
- **Phase 6 — Capture + naming**: `Namer` (sanitize/format, unit-tested first per the exact `<name>_<YYYY_MM_DD_HH_MM_SS>.png` contract) and `CaptureService`, verified against a real Chrome tab (real PNG written to `captures/<user_id>/`).
- **Phase 7 — Telegram delivery**: `TelegramClient.sendPhoto()` with a rendered, configurable caption; `POST /api/telegram/test`; bot token redacted from every error path (unit-tested). Verified end-to-end against a real Chrome tab and the real Telegram API (using a fake token, so delivery correctly fails with a sanitized "Unauthorized" rather than succeeding - full credentials needed to verify actual delivery).
- **Phase 8 — Scheduler**: `SchedulerService.start/stop/getStatus`, one `setInterval` per active user job; each tick checks schedule date range → weekday → time window (handles overnight-wrapping windows) before capturing; one immediate retry on a failed send; every tick writes/updates a `CaptureLog` row and broadcasts it live over `WS /ws/log`. Verified against real Chrome across multiple real ticks - confirmed the loop keeps running through repeated failures (never crashes), and the WebSocket delivers `sending` → `failed`/`sent` events in real time.
- **Phase 9 — Storage & archiving**: `ArchiveService` moves the oldest captures to a configurable local folder once usage crosses a per-user threshold, oldest-first, with a cross-device (`EXDEV`) fallback for archiving to an external drive; wired to run after every capture tick. `GET/PUT /api/storage/settings`, `POST /api/storage/archive` (manual trigger), `GET /api/storage/history`.
- **Phase 10 — Activity & error logging**: `GET /api/logs` merges `ActivityLog` (sanitized errors, schedule changes) with `CaptureLog` (every Telegram send) into one chronological, filterable feed - never duplicating a send event into both tables. CDP connection loss, archive failures, and unexpected scheduler errors all now write a sanitized one-line summary; full detail stays in server-side logs only. Also fixed a real gap: `/api/cdp/targets` had no auth guard until now (it predated the auth system).

Covered by the committed test suite (`packages/server/test/`, run via `npm test -w packages/server`, 74 tests): auth/session/MFA flows, config CRUD with cross-user isolation, filename/caption formatting, Telegram error-path sanitization, schedule-window logic (date range, weekday, normal and midnight-wrapping time windows), archive threshold/ordering/cross-device behavior, and the merged/filtered logs feed - all against an in-memory database with no external dependencies, so `npm test` is fully self-contained.

- **Phase 11 — Disclaimer backend**: `POST /api/disclaimer/accept` records every "Agree" click (the onboarding nudge needed no new endpoint - the frontend just reads the existing `GET /api/config` 404).
- **Phase 12 — Frontend**: React + Vite app matching the approved design canvas - full-screen shell, Login (email/password + TOTP/recovery-code MFA), the main capture screen (disclaimer modal, onboarding nudge, live tab picker, schedule/naming/Telegram config, live WebSocket capture log), and `Settings`/`Storage` loaded via `React.lazy`. Along the way, added two backend routes the UI needed that hadn't been wired yet (`PUT /api/auth/profile`, `POST /api/auth/change-password` - the DB functions existed since phase 3 but nothing called them).

Verified with a real Playwright-driven browser against both real dev servers and a real Chrome instance: unauthenticated redirect, login, disclaimer, onboarding nudge, live tab picker, saving config, starting capture, a real WebSocket log row arriving, stopping capture, and both lazy-loaded pages (Settings' three tabs, Storage) all loading real data - 11 checks, all passing, screenshots visually confirmed against the approved design.
- **Phase 13 — End-to-end pass (definition of done)**: two real accounts, two real simultaneous scheduler jobs against a real Chrome tab, run concurrently. Confirmed: each account's capture log, config, and storage history stay fully isolated under real concurrent load; the storage-archive check runs after every real tick without ever breaking the pipeline (its move-on-threshold logic was already proven separately with controlled file sizes, since real screenshots are far smaller than the 1 MB minimum threshold - not practical to cross organically in a quick check).

**All 13 build-plan phases are now built and verified.** Both packages type-check clean, and the full stack has been exercised through a real browser against real Chrome. What's left is real-world use: a real Telegram bot/channel (everything up to the actual send has been verified against the live Telegram API; only genuine delivery needs real credentials to confirm), and the usual judgment calls a first real deployment surfaces.

- **Phase 14 — Failure alerting & auto-pause.** Added after checking EveryFrame against comparable open-source projects (`changedetection.io`, and smaller Telegram screenshot bots) — those alert the user when a scheduled job keeps failing; EveryFrame's original scope didn't, so a dead tab or bad bot token just piled up silent `failed` rows that nobody would see unless they opened Settings → Logs. Now `failureAlertThreshold` (configurable per user, default 3 consecutive failures, `0` disables it) auto-stops the job and sends one plain-text Telegram alert - through the same bot/channel already configured - explaining what went wrong. The capture screen shows a distinct "Paused — needs attention" state with the reason; pressing "Start capturing" again clears it and resumes.
- **Phase 15 — Signup flow.** `Login.tsx` now offers "Create an account" alongside sign-in - email/password/display-name registration (auto-signs in right after, since `/api/auth/register` doesn't itself start a session), followed by an optional, skippable MFA setup step reusing the existing enroll/confirm/recovery-code endpoints (QR + secret, confirm code, one-time recovery codes shown once). No new backend routes were needed - only the shared QR/recovery-code CSS moved from `settings.css` into the global `theme.css` so both Settings → Security and the signup flow can use it. Verified end to end with a real TOTP code generated from the enrollment secret: create account → enroll MFA → land on the capture screen → log out → log back in and confirm the account now correctly demands the 2FA code before letting them in.

**89 backend tests pass** (`npm test -w packages/server`); the signup flow itself was verified live end-to-end (no new backend surface to unit-test) rather than via the committed suite.

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

## Design artifacts

Two categories of design deliverable exist from the design/review phase, and neither is meant to live in application source control:

1. **The interactive design canvas** (`design-canvas/*.dc.html`, `canvas.json`, and the seeded `everyframe-capture-ui.html`) - authored for Claude Design's canvas editor, published as a Claude Artifact for review. The seeded output is a large, mostly-generated payload, not something you'd diff in a PR.
2. **The rendered architecture doc and roadmap** - also published as Claude Artifacts (interactive, with Mermaid diagrams).

Local PDF snapshots of the architecture doc and roadmap are kept in `artifacts-local/` for offline reference. The design canvas's own PDF export didn't come through in an automated headless export (its editor payload expects to run inside the hosted Claude Artifact environment, not as a bare local file) - to get a real PDF of the UI mockups, open the published artifact link and use its own **Export PDF** option in the toolbar.
