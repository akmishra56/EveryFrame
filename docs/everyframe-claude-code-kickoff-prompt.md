# EveryFrame — Claude Code Kickoff Prompt

Paste everything below into Claude Code (or hand to a developer) to start the base build. Single-agent scope — this project doesn't need multi-agent orchestration; it's one backend service plus one small web UI.

---

## Context

You're building **EveryFrame**, a small web-based utility. It watches one specific open browser tab, screenshots it on a configured interval using Playwright, renames each screenshot to `<tabname>_<YYYY_MM_DD_HH_MM_SS>.png`, and sends it to a Telegram channel through a bot already added to that channel.

Read `docs/design/everyframe-handout-brief.md` in full before writing any code — it covers requirements, the CDP-attach architecture assumption, the data model, and the design direction for the UI. Do not skip the "Architecture note" section; it determines how tab targeting works end to end.

## Scope for this build (base version only)

In scope:
- Web UI: configure target tab, interval, name pattern, Telegram bot token + channel ID; send a test frame; start/stop capture; live capture log.
- Backend: connect to a Chrome instance over CDP (`connectOverCDP`), list its open tabs/targets, screenshot the selected target on a schedule, rename per convention, send via Telegram Bot API `sendPhoto`, log each attempt with status.
- Local persistence (SQLite) for config and capture history.

Out of scope for this build (do not implement yet):
- Multiple simultaneous tab→channel pairs.
- Any auth/multi-user support.
- Native desktop packaging.
- Retry backoff policies beyond a simple immediate retry on failed sends.

## Tech stack (locked)

- Backend: Node.js + TypeScript, Fastify
- Automation: `playwright` (chromium, `connectOverCDP`)
- Scheduler: `setInterval` per active job — no cron library needed at this scale
- Telegram: raw `fetch` calls to `https://api.telegram.org/bot<token>/sendPhoto` — no bot framework
- Storage: SQLite (e.g. `better-sqlite3`)
- Frontend: React + Vite, plain CSS (no UI kit) — follow the visual direction in `everyframe-ux-mockup.html` (attached alongside the brief) rather than defaulting to a generic component library look
- Communication: REST for config CRUD, WebSocket (or short-poll if simpler) for live capture log updates

## Build order

1. **Backend skeleton + CDP connection.** Stand up the Fastify service. Implement an endpoint that connects to a locally running Chrome (assume the user has launched it with `--remote-debugging-port=9222`) and lists its open pages/targets (title, URL). Prove this works against a real Chrome instance before building anything else.
2. **Config storage.** SQLite schema for `Config` and `CaptureLog` per the data model in the brief. CRUD endpoints for config.
3. **Capture + naming.** Given a target and a name pattern, take a screenshot via Playwright and write it to `captures/<sanitized-name>_<timestamp>.png`. Unit-test the sanitization and timestamp formatting in isolation — this is the one piece with an exact contractual output format (`<tabname>_<YYYY_MM_DD_HH_MM_SS>.png`), so get it right and pin it with tests before wiring up the rest.
4. **Telegram delivery.** `sendPhoto` call, plus a `/test` endpoint the UI can call to validate credentials before scheduling starts. Never log the raw bot token.
5. **Scheduler.** Start/stop a per-config interval loop that runs steps 3–4 and writes a `CaptureLog` row per attempt (sent / failed / sending) with error detail on failure.
6. **Frontend.** Build the config screen and live log against the running backend, following `everyframe-ux-mockup.html`'s layout and visual direction (instrument-panel styling: charcoal background, single amber accent for the live state, monospace for all timestamp/filename/credential fields, numbered setup steps, sprocket-hole divider between the config rail and the log). Wire it to real data — no more mock/demo data once the backend is live.
7. **End-to-end pass.** With a real Chrome (CDP-enabled), a real tab, and a real Telegram bot+channel: configure, test-send, start capture, confirm correctly-named frames arrive in the channel on schedule, stop capture, confirm the log reflects reality.

## Definition of done for this base version

A user can, without touching code: launch Chrome with remote debugging on, open EveryFrame's web UI, pick that tab, set an interval, confirm the filename pattern, enter working Telegram credentials, click Start, and watch correctly-named screenshots land in the Telegram channel on schedule — with the on-screen log accurately reflecting sent/failed status for each one.

## Notes for whoever picks this up

- Confirm the CDP-attach assumption with the requester before building the tab picker — it's called out explicitly in the brief's §5 because it changes what "select an open tab" means in practice.
- Keep the bot token out of logs, out of the SQLite file in plaintext if you can reasonably avoid it (basic encryption-at-rest is a nice-to-have, not a blocker for this scope), and out of any error messages surfaced to the UI.
- Don't reach for Redis/Postgres/cron infra here — this is a single-user local utility, not the multi-tenant device-farm style build; keep the footprint small on purpose.
