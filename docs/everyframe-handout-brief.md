# EveryFrame — Handout Brief

**One-liner:** A web-based tool that periodically screenshots one specific open browser tab via Playwright, names the file `<tabname>_<timestamp>`, and pushes it to a Telegram channel through a bot.

Working name used throughout this brief and the mockup: **EveryFrame**. Rename freely.

---

## 1. Problem & goal

Someone wants a lightweight "set it and forget it" watcher: point it at one tab (a dashboard, a build status page, a livestream chat, whatever), tell it how often to look, and have the frames show up in a Telegram channel automatically — without keeping a terminal window open or writing one-off scripts each time.

**Exit criterion for a base version:** a user can configure a tab, an interval, and Telegram credentials once, click Start, and see correctly-named screenshots arrive in the configured Telegram channel on schedule, with visible status per capture (sent / failed).

## 2. Core user flow

1. Open EveryFrame in a browser → configuration screen.
2. Pick which open tab to watch.
3. Pick a capture interval (or set a custom one).
4. Confirm/edit the name that will prefix each screenshot.
5. Paste bot token + channel ID, send a test frame to confirm delivery.
6. Click **Start capturing**. EveryFrame screenshots the tab on schedule, renames each file, and sends it to the channel. A log shows each capture with timestamp and delivery status.
7. Click **Stop capturing** any time; config persists for next time.

## 3. Functional requirements

- **Tab targeting** — user selects one specific already-open browser tab during setup; that tab (not "whatever's focused") is the one captured on every cycle.
- **Interval configuration** — a fixed set of common intervals plus a custom numeric interval (seconds/minutes), set once at configuration time.
- **Screenshot capture** — Playwright takes the screenshot of the targeted tab only, not the full desktop.
- **File naming** — every screenshot is renamed to `<tabname>_<YYYY_MM_DD_HH_MM_SS>.png` before delivery. `<tabname>` is user-editable, sanitized to remove spaces/special characters (e.g. "Grafana — Prod Dashboard" → `grafana-prod-dashboard`).
- **Telegram delivery** — each screenshot is sent as a photo to a single pre-configured Telegram channel, using a bot that has already been added to that channel. Credentials (bot token, channel ID) are entered once at setup.
- **Delivery feedback** — user can see, per capture, whether it was captured and sent successfully, still sending, or failed (with a retry option).
- **Test connection** — a "send test frame" action at setup time so bad credentials surface before the schedule starts, not on the first missed capture.

## 4. Non-functional requirements

- **Web-based only** — no native desktop packaging for v1. The configuration UI is a web page; Playwright automation runs on a backend process behind it.
- **Reliability of the schedule** — a missed or slow capture shouldn't silently kill the loop; failures should log and the schedule should continue.
- **Credential handling** — the bot token is a secret; it should never render in plaintext in the log or be logged to console/disk unmasked.
- **Low operational footprint** — this is a single-user utility, not a multi-tenant product. No need for auth, billing, or multi-tenancy in the base version.

## 5. Architecture note — the one assumption that shapes everything else

Playwright normally automates browser instances **it launches or connects to**, not arbitrary tabs a user already has open in their everyday browser. "Select a particular open browser tab" therefore has two honest implementations, and the brief assumes the first unless you say otherwise:

- **Option A (assumed default): CDP attach.** The user launches Chrome/Edge with remote debugging enabled (`--remote-debugging-port=9222`), and EveryFrame connects to that running browser over the Chrome DevTools Protocol (`playwright.chromium.connectOverCDP`). EveryFrame can then list and target real open tabs, including ones the user is actively using. Slightly more setup friction (one flag, one launch step), but it matches "select a tab I already have open" literally.
- **Option B (fallback): managed browser window.** EveryFrame launches its own Playwright-controlled browser window; the user navigates within that window instead of their normal browser. Zero setup friction, but it's a separate window the user has to keep open and work in — not really "an open tab" in the everyday sense.

The mockup and brief below assume **Option A**, since it's the one that actually matches the request. Flag this early with whoever builds it — it's a five-minute conversation now versus a rebuilt config screen later.

## 6. Proposed architecture (base version)

```
┌─────────────────────────────────────────────┐
│  Web UI (config + live log)                  │
│  — tab picker, interval, naming, Telegram     │
└───────────────┬───────────────────────────────┘
                │ REST / WebSocket
┌───────────────▼───────────────────────────────┐
│  Backend service (Node.js + TypeScript)        │
│  ├─ Playwright: connectOverCDP → target tab     │
│  ├─ Scheduler: interval loop per config          │
│  ├─ Namer: sanitize + timestamp filename         │
│  ├─ Telegram sender: Bot API sendPhoto           │
│  └─ Capture log: in-memory + SQLite persistence  │
└───────────────┬───────────────────────────────┘
                │
        Telegram Bot API → configured channel
```

**Suggested stack:**
- Backend: Node.js + TypeScript, Fastify or Express, `playwright` package (chromium channel, `connectOverCDP`)
- Scheduler: simple `setInterval` per active job for v1 (swap for `node-cron` only if multiple concurrent jobs are needed later)
- Telegram: direct calls to `https://api.telegram.org/bot<token>/sendPhoto` — no need for a full bot framework since EveryFrame only sends, never receives, messages
- Storage: SQLite (config + capture history) is enough; no need for Postgres/Redis at this scale
- Frontend: a single-page app (React + Vite, or plain HTML/JS) talking to the backend over REST for config and a WebSocket (or polling) for the live capture log
- Temp files: screenshots write to a local `captures/` folder, get renamed per the convention, upload, then optionally get pruned after a retention window

**Data model (minimal):**
- `Config`: target tab identifier (CDP target ID or URL pattern), tab display name, interval (seconds), name pattern override, bot token, channel ID
- `CaptureLog`: id, filename, captured_at, status (`sent` / `failed` / `sending`), error message (nullable)

## 7. UX research — Dribbble inspiration

Looked across Dribbble's automation-dashboard, automation-app, dashboard-ui, and settings-screen tags for patterns relevant to a small config-and-monitor tool like this one. Recurring patterns worth borrowing (in spirit, not literally):

- **Automation/workflow dashboards** (tags: automation-dashboard, automation-ui) consistently pair a **left-hand setup rail** with a **right-hand live status feed** — configuration and monitoring live side by side rather than as separate pages, so the user can watch the effect of a setting change immediately.
- **Status is color-coded and terse.** Across monitoring-style dashboards, delivery/health states use one small colored dot or chip per row (sent/pending/failed) rather than long text — good fit for a capture log where the interesting signal is just "did it work."
- **Settings screens** (tag: settings-screen) favor **segmented pill controls** for small fixed choices (like interval presets) over dropdowns, and reserve free-text fields for the one or two values that are genuinely open-ended (here: custom interval, bot token, channel ID).
- **Numbered setup steps** show up often in onboarding-style configuration screens when the configuration is genuinely sequential (connect → configure → confirm) — appropriate here since tab → interval → naming → Telegram is a real order of operations, not decoration.
- A weaker pattern to avoid importing wholesale: many of these shots lean on generic **rounded-card-grid dashboards with soft drop shadows and gradient washes** — visually pleasant but generic, and not particularly suited to a single-purpose utility with one real job. The design direction below deliberately steps away from that toward something more specific to what this tool actually does.

## 8. Design direction: "instrument panel," not "dashboard"

Rather than a generic SaaS dashboard, the mockup leans into what this tool literally is: something that captures **frames** on a schedule and reads out **timestamps** — closer to a camera's control panel than a business analytics dashboard.

- **Palette:** warm charcoal background (not pure black), a single amber accent reserved for the "live/recording" state and the primary action, a muted teal for successful delivery, and a muted brick red for failures — functional color, not decoration.
- **Type:** a serif display face for the wordmark/hero only; a monospace face for everything data-shaped — timestamps, filenames, the bot token/channel ID fields, the countdown — because that data genuinely resembles a camera's readout. General UI chrome (buttons, nav, body text) stays in the same monospace family so the whole interface reads as one instrument rather than a serif brand layer glued onto a generic dashboard.
- **Structural motif:** a column of small circles between the config rail and the capture log, styled like film sprocket holes — a literal nod to frames advancing through a reel, used as the panel divider rather than as pure decoration.
- **Log as contact sheet:** capture history renders as a simple bordered strip of rows (filename, timestamp, status), not a grid of shadowed cards — closer to a photographic contact sheet than a metrics dashboard.

A working mockup implementing this direction is attached separately (`everyframe-ux-mockup.html`) — open it in a browser. Tab selection, interval pills, the live filename preview, and Start/Stop with a simulated capture log are all interactive so you can react to the actual feel, not just a static image.

## 9. Open questions before build

1. **CDP attach vs. managed window** (see §5) — confirm Option A is acceptable given the extra one-time setup step for the user.
2. Should capture history persist across restarts (SQLite), or is in-memory fine for a true v1?
3. Is one tab/one channel enough for v1, or should the config support multiple tab→channel pairs from the start? (Brief above assumes single pair; multi-pair is a straightforward v2 extension of the same data model.)
4. Any desired retention/cleanup policy for local screenshot files after successful delivery?
