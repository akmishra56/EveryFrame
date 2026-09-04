# EveryFrame — System Architecture & Diagrams

This document is the technical reference for implementation. It reflects the approved UX (`docs/everyframe-ux-mockup.html` and the published design canvas) including the expanded scope agreed during design review: multi-user accounts with login/session/MFA, a per-login legal disclaimer, an onboarding nudge, date-range + weekday + time-window scheduling, and storage archiving to a local folder past a configurable threshold.

This supersedes the single-user assumptions in `docs/everyframe-claude-code-kickoff-prompt.md` and `docs/everyframe-handout-brief.md` on exactly one point — auth/multi-user is now in scope. Everything else in those documents (CDP-attach tab targeting, Node/TS/Fastify/SQLite stack, "keep the footprint small" ethos, single tab→channel pair per user) still holds.

## 1. Key architectural decision: shared Chrome, isolated accounts

CDP attach (`playwright.chromium.connectOverCDP`) only reaches a Chrome instance on the same machine as the backend process. Multi-user accounts do **not** mean multiple Chrome instances or multiple machines — that would require a remote-agent architecture, which is out of scope here.

**Assumption (flag if wrong): all users share one Chrome instance on the machine running the EveryFrame backend.** The `GET /api/cdp/targets` list is the same for every logged-in user; each user independently picks a tab from that shared list and gets fully isolated config, schedule, and capture history. If genuinely separate machines per user are needed later, that's a distinct project (a lightweight per-user relay agent), not an extension of this one.

## 2. Tech stack (extends the original locked stack)

Unchanged: Node.js + TypeScript, Fastify, `playwright` (chromium, `connectOverCDP`), `setInterval`-per-job scheduler, raw `fetch` to the Telegram Bot API, SQLite via `better-sqlite3`, React + Vite frontend, REST + WebSocket.

Added for auth/session/MFA/storage:
- **Password hashing:** `argon2`
- **Sessions:** `@fastify/session` + `@fastify/cookie`, backed by a small SQLite-backed session store (no Redis — same "keep the footprint small" reasoning as the original brief)
- **MFA:** `otplib` (TOTP) for codes, `qrcode` for enrollment QR generation, plus hashed one-time recovery codes. Enrollment encodes a standard `otpauth://totp/...` URI (RFC 6238) — works with Google Authenticator, Microsoft Authenticator, or any standard TOTP app, with no per-app special-casing needed.
- **Login hardening:** `@fastify/rate-limit` on `/api/auth/*`, `@fastify/csrf-protection` on state-changing routes
- **Frontend routing/code-splitting:** React Router, with `Login`, `Settings`, and `Storage` routes loaded via `React.lazy` + `Suspense` so they aren't in the initial bundle for the main capture screen ("accessible on lazy load")
- **Structured server logging:** Fastify's built-in Pino logger, writing full-detail logs (including stack traces) to disk/console for developers — separate from the sanitized, user-facing `ACTIVITY_LOG` table described in §5 and §11

## 2a. Two-tier error logging

Every error is logged twice, at two different levels of detail, for two different audiences:

1. **Full detail, developer-facing:** every caught exception goes through Pino (stack trace, internal error codes, request context). Lives in server logs only — never reaches the API or the browser.
2. **Sanitized summary, user-facing:** the same error also gets a short, human-readable summary written to `ACTIVITY_LOG` (capture failures instead use `CAPTURE_LOG.error_message`, already sanitized by the same rule) and surfaced in **Settings → Logs**. Never includes secrets, raw stack traces, or internal identifiers — the same "never leak the bot token" discipline the original brief already established, generalized to all errors.

`ACTIVITY_LOG` also carries non-error events worth showing the user: schedule configuration changes. It deliberately does **not** duplicate Telegram-send events — those already live in `CAPTURE_LOG` with full status/error detail. The Settings → Logs page merges both tables into one chronological, filterable view (see §11).

## 3. High-level system design

```mermaid
flowchart TB
    subgraph Client["Browser — multiple user accounts"]
        UI["React SPA<br/>Login (eager) · Capture (eager)<br/>Settings · Storage (lazy-loaded)"]
    end

    subgraph Backend["Node.js + TypeScript backend — Fastify, single process"]
        Auth["Auth &amp; Session<br/>login, MFA, cookies"]
        Cfg["Config Service<br/>per-user capture config"]
        Sched["Scheduler<br/>one interval loop per active user"]
        Cdp["CDP Target Service<br/>connectOverCDP"]
        Cap["Capture + Namer<br/>screenshot, sanitize, timestamp"]
        Tg["Telegram Client<br/>sendPhoto"]
        Arc["Archive Service<br/>threshold check + move"]
        Log["Capture Log Service"]
    end

    DB[("SQLite<br/>everyframe.db")]
    FS[("Local filesystem<br/>captures/&lt;user_id&gt;/")]
    ArchFolder[("Archive folder<br/>per-user configurable path")]
    Chrome["Chrome instance<br/>--remote-debugging-port=9222<br/>(one, shared by all users)"]
    Telegram["Telegram Bot API"]

    UI -- "REST + WebSocket" --> Auth
    UI -- "REST" --> Cfg
    UI -- "REST" --> Cdp
    UI -- "REST (start/stop/status)" --> Sched
    UI -- "WebSocket (live log)" --> Log
    UI -- "REST" --> Arc

    Auth --> DB
    Cfg --> DB
    Log --> DB
    Arc --> DB

    Sched --> Cfg
    Sched --> Cdp
    Sched --> Cap
    Sched --> Tg
    Sched --> Log
    Sched --> Arc

    Cdp <--> Chrome
    Cap --> FS
    Tg --> Telegram
    Arc --> FS
    Arc --> ArchFolder
```

## 4. Low-level component diagram (backend module boundaries)

```mermaid
flowchart LR
    subgraph Routes["src/routes/"]
        R_Auth["auth.routes.ts"]
        R_Cfg["config.routes.ts"]
        R_Cdp["cdp.routes.ts"]
        R_Tg["telegram.routes.ts"]
        R_Cap["capture.routes.ts"]
        R_Storage["storage.routes.ts"]
        R_Logs["logs.routes.ts"]
        R_Ws["ws/log.ts"]
    end
    subgraph Services["src/ (services)"]
        S_Auth["auth/<br/>AuthService, MfaService, SessionManager"]
        S_Cfg["config/<br/>ConfigService"]
        S_Sched["scheduler/<br/>SchedulerService"]
        S_Cdp["cdp/<br/>CdpTargetService"]
        S_Cap["capture/<br/>CaptureService, Namer"]
        S_Tg["telegram/<br/>TelegramClient"]
        S_Log["log/<br/>CaptureLogService"]
        S_Arc["archive/<br/>ArchiveService"]
        S_Act["activity/<br/>ActivityLogService"]
    end
    subgraph Data["src/db/"]
        Repo["repo.ts — better-sqlite3 queries"]
        Schema["schema.ts"]
        SessStore["sessionStore.ts"]
    end

    R_Auth --> S_Auth
    R_Cfg --> S_Cfg
    R_Cdp --> S_Cdp
    R_Tg --> S_Tg
    R_Cap --> S_Sched
    R_Storage --> S_Arc
    R_Logs --> S_Act
    R_Logs --> S_Log
    R_Ws --> S_Log

    S_Auth --> Repo
    S_Auth --> SessStore
    S_Cfg --> Repo
    S_Cfg --> S_Act
    S_Sched --> S_Cfg
    S_Sched --> S_Cdp
    S_Sched --> S_Cap
    S_Sched --> S_Tg
    S_Sched --> S_Log
    S_Sched --> S_Arc
    S_Sched --> S_Act
    S_Cdp --> S_Act
    S_Arc --> S_Act
    S_Cap --> S_Cdp
    S_Arc --> Repo
    S_Log --> Repo
    S_Act --> Repo
    Repo --> Schema
```

## 5. Entity-relationship diagram

```mermaid
erDiagram
    USER ||--o| CONFIG : "has one"
    USER ||--o{ CAPTURE_LOG : "owns"
    USER ||--o{ DISCLAIMER_ACCEPTANCE : "acknowledges"
    USER ||--o{ MFA_RECOVERY_CODE : "has"
    USER ||--o| STORAGE_SETTINGS : "configures"
    USER ||--o{ ARCHIVE_EVENT : "triggers"
    USER ||--o{ ACTIVITY_LOG : "generates"
    CONFIG ||--o{ CAPTURE_LOG : "produces"

    USER {
        int id PK
        string email UK
        string password_hash
        string display_name
        boolean mfa_enabled
        string mfa_secret_encrypted
        datetime created_at
        datetime last_login_at
    }
    CONFIG {
        int id PK
        int user_id FK
        string tab_target_id
        string tab_display_name
        int interval_seconds
        string name_pattern
        string start_time
        string end_time
        json active_days
        date schedule_start_date
        date schedule_end_date
        string bot_token_encrypted
        string channel_id
        string caption_label
        string caption_template
        int failure_alert_threshold
        datetime created_at
        datetime updated_at
    }
    CAPTURE_LOG {
        int id PK
        int config_id FK
        int user_id FK
        string filename
        datetime captured_at
        string status
        string error_message
    }
    DISCLAIMER_ACCEPTANCE {
        int id PK
        int user_id FK
        datetime accepted_at
    }
    MFA_RECOVERY_CODE {
        int id PK
        int user_id FK
        string code_hash
        datetime used_at
    }
    STORAGE_SETTINGS {
        int user_id PK
        int threshold_mb
        string archive_path
        datetime updated_at
    }
    ARCHIVE_EVENT {
        int id PK
        int user_id FK
        datetime archived_at
        int file_count
        int total_size_mb
        string destination_path
    }
    ACTIVITY_LOG {
        int id PK
        int user_id FK
        string category
        string summary
        string detail
        datetime created_at
    }
```

Notes:
- `CONFIG.user_id` is unique — one tab/channel pair per user, per original scope (unchanged; multi-pair-per-user is still out of scope).
- `STORAGE_SETTINGS.user_id` is both primary key and foreign key to `USER` (one row per user).
- `active_days` stores a JSON array of weekday ids (`["mon","tue",...]`).
- `bot_token_encrypted` / `mfa_secret_encrypted`: AES-256-GCM at rest, per the original brief's "keep secrets out of plaintext where reasonable" guidance.
- `caption_label` / `caption_template`: drive the Telegram photo caption (see §9.1). `caption_template` default: `"{label} generated at {time} on {date}"`, with `{label}` filled from `caption_label` (defaults to the tab's display name, user-editable) and `{time}`/`{date}` computed at send time.
- `failure_alert_threshold`: consecutive failed ticks (capture failure, or delivery failure after its one retry) before the scheduler auto-pauses the job and sends a one-time Telegram text alert. Default `3`; `0` disables the behavior entirely. See §7.2 and §11.
- **`CAPTURE_LOG` never stores the screenshot's binary content — only the filename reference.** The image lives solely in `captures/<user_id>/` (and later, the archive folder). The caption actually sent isn't persisted either: it's reconstructible from `captured_at` + the `Config` row's `caption_label`/`caption_template` at the time, so it isn't duplicated into the log.
- `ACTIVITY_LOG.category` is `'error'` or `'schedule_change'` (extensible later). `summary` is the short, sanitized line shown in the UI; `detail` is optional extra sanitized context (e.g. which schedule fields changed) — never a raw stack trace or a secret. See §2a and §11.

## 6. Class diagram (backend domain/service classes)

```mermaid
classDiagram
    class User {
        +int id
        +string email
        +string displayName
        +boolean mfaEnabled
    }
    class AuthService {
        +login(email, password) LoginResult
        +verifyMfa(userId, code) boolean
        +hashPassword(password) string
    }
    class SessionManager {
        +create(userId) Session
        +validate(sessionId) User
        +destroy(sessionId) void
    }
    class MfaService {
        +generateSecret() string
        +verifyCode(secret, code) boolean
        +generateRecoveryCodes() string[]
    }
    class Config {
        +int id
        +int userId
        +string tabTargetId
        +int intervalSeconds
        +string startTime
        +string endTime
        +string[] activeDays
        +Date scheduleStartDate
        +Date scheduleEndDate
        +string namePattern
    }
    class ConfigService {
        +getForUser(userId) Config
        +upsert(userId, data) Config
    }
    class SchedulerService {
        -Map~int,Timer~ activeJobs
        +start(userId) void
        +stop(userId) void
        +isWithinSchedule(config, now) boolean
        -tick(userId) void
    }
    class CdpTargetService {
        +listTargets() Target[]
        +getPage(targetId) Page
    }
    class Namer {
        +sanitize(name) string
        +formatDate(date) string
        +formatTime(date) string
        +formatTimestamp(date) string
    }
    class CaptionRenderer {
        +render(template, label, date) string
    }
    class CaptureService {
        +capture(config) ScreenshotResult
    }
    class TelegramClient {
        +sendPhoto(token, channelId, filePath, caption) Result
        +sendMessage(token, channelId, text) Result
        +testConnection(token, channelId) Result
    }
    class CaptureLogService {
        +record(entry) void
        +listForUser(userId) CaptureLog[]
    }
    class ArchiveService {
        +checkThreshold(userId) boolean
        +runArchive(userId) ArchiveEvent
    }
    class ActivityLogService {
        +logError(userId, summary, detail) void
        +logScheduleChange(userId, summary, detail) void
        +listForUser(userId, category) ActivityLog[]
    }

    AuthService --> SessionManager
    AuthService --> MfaService
    AuthService --> User
    SchedulerService --> ConfigService
    SchedulerService --> CdpTargetService
    SchedulerService --> CaptureService
    SchedulerService --> TelegramClient
    SchedulerService --> CaptureLogService
    SchedulerService --> ArchiveService
    SchedulerService --> ActivityLogService
    CdpTargetService --> ActivityLogService
    ArchiveService --> ActivityLogService
    ConfigService --> ActivityLogService
    CaptureService --> Namer
    CaptureService --> CdpTargetService
    SchedulerService --> CaptionRenderer
    CaptionRenderer --> Namer
    ConfigService --> Config
    ArchiveService --> CaptureLogService
```

## 7. Activity diagrams

### 7.1 Login → disclaimer → onboarding

```mermaid
flowchart TD
    Start([User opens EveryFrame]) --> Creds[Enter email + password]
    Creds --> CredsValid{Valid?}
    CredsValid -- No --> CredsErr[Show error] --> Creds
    CredsValid -- Yes --> MfaEnabled{MFA enabled<br/>for this account?}
    MfaEnabled -- No --> Session[Create session]
    MfaEnabled -- Yes --> MfaCode[Enter 6-digit code]
    MfaCode --> MfaValid{Code valid?}
    MfaValid -- No --> MfaErr[Show error] --> MfaCode
    MfaValid -- Yes --> Session
    Session --> Disclaimer[Show disclaimer modal]
    Disclaimer --> Agree[User clicks Agree]
    Agree --> LogAccept[Record disclaimer acceptance]
    LogAccept --> HasSchedule{User has an<br/>active Config?}
    HasSchedule -- No --> Nudge[Show onboarding nudge]
    HasSchedule -- Yes --> Main[Show capture screen]
    Nudge --> Main
```

### 7.2 Scheduler tick / capture cycle

```mermaid
flowchart TD
    Tick([Interval fires for user's job]) --> DateCheck{Today within<br/>schedule_start_date /<br/>schedule_end_date?}
    DateCheck -- No --> Skip1[Skip this tick]
    DateCheck -- Yes --> DayCheck{Today in<br/>active_days?}
    DayCheck -- No --> Skip1
    DayCheck -- Yes --> TimeCheck{Now within<br/>start_time / end_time?}
    TimeCheck -- No --> Skip1
    TimeCheck -- Yes --> LogSending[Write CaptureLog row: sending]
    LogSending --> Screenshot[Capture screenshot via CDP target]
    Screenshot --> ScreenshotOk{Succeeded?}
    ScreenshotOk -- No --> LogFailed1[Update row: failed]
    ScreenshotOk -- Yes --> Rename[Sanitize name + apply timestamp]
    Rename --> Send[Send to Telegram]
    Send --> SendOk{Delivered?}
    SendOk -- Yes --> LogSent[Update row: sent]
    SendOk -- No --> Retry[Retry once immediately]
    Retry --> RetryOk{Delivered?}
    RetryOk -- Yes --> LogSent
    RetryOk -- No --> LogFailed2[Update row: failed + error]
    LogSent --> Reset[Reset consecutive-failure count to 0]
    Reset --> ThresholdCheck[ArchiveService checks storage threshold]
    LogFailed1 --> Count1[Increment consecutive-failure count]
    LogFailed2 --> Count2[Increment consecutive-failure count]
    Count2 --> ThresholdCheck
    Count1 --> PauseCheck1{Count >= failure_alert_threshold?<br/>threshold 0 = never}
    ThresholdCheck --> PauseCheck2{Count >= failure_alert_threshold?}
    PauseCheck1 -- No --> Skip1
    PauseCheck2 -- No --> End
    PauseCheck1 -- Yes --> AutoPause[Stop job · log ACTIVITY_LOG error<br/>· send one Telegram text alert]
    PauseCheck2 -- Yes --> AutoPause
    AutoPause --> End
    Skip1 --> End
    End([Wait for next tick / job stopped])
```

### 7.3 Storage archive run

```mermaid
flowchart TD
    A([ArchiveService.checkThreshold]) --> B{Used space ><br/>threshold_mb?}
    B -- No --> Z([Done])
    B -- Yes --> C[Select oldest captures<br/>until under threshold]
    C --> D[Move files to archive_path]
    D --> E{Move succeeded<br/>for all files?}
    E -- No --> F[Log partial failure,<br/>keep unmoved files in place]
    E -- Yes --> G[Remove moved files<br/>from captures folder]
    F --> H[Write ArchiveEvent row]
    G --> H
    H --> Z
```

## 8. State diagrams

### 8.1 CaptureLog row status

```mermaid
stateDiagram-v2
    [*] --> sending
    sending --> sent: delivery succeeds
    sending --> retrying: delivery fails
    retrying --> sent: retry succeeds
    retrying --> failed: retry fails
    sent --> [*]
    failed --> [*]
```

### 8.2 Per-user scheduler job

```mermaid
stateDiagram-v2
    [*] --> Stopped
    Stopped --> Running: user clicks Start
    Running --> Paused: outside active window / day / date range
    Paused --> Running: back within window / day / date range
    Running --> Stopped: user clicks Stop
    Paused --> Stopped: user clicks Stop
    Running --> AutoPaused: consecutive failures reach failure_alert_threshold
    AutoPaused --> Running: user clicks Start (resumes, clears failure count + alert state)
```

`AutoPaused` is distinct from the schedule-window `Paused` above: it's a hard stop the scheduler makes itself, not a normal outside-the-window skip, and it comes with a logged reason (`ACTIVITY_LOG`) and a one-time Telegram text alert (see §7.2, §11).

### 8.3 Session / auth lifecycle

```mermaid
stateDiagram-v2
    [*] --> LoggedOut
    LoggedOut --> CredentialsPending: submit email + password
    CredentialsPending --> LoggedOut: invalid credentials
    CredentialsPending --> MfaPending: valid, MFA enabled
    CredentialsPending --> Authenticated: valid, MFA disabled
    MfaPending --> Authenticated: valid code
    MfaPending --> LoggedOut: too many failed attempts
    Authenticated --> DisclaimerPending: session created
    DisclaimerPending --> Active: user clicks Agree
    Active --> LoggedOut: logout / session expires
```

## 9. Sequence diagrams

### 9.1 Capture + send (one scheduler tick, window/day/date checks already passed)

```mermaid
sequenceDiagram
    participant S as SchedulerService
    participant C as CdpTargetService
    participant Ch as Chrome (CDP)
    participant N as Namer
    participant Cp as CaptionRenderer
    participant FS as Filesystem
    participant T as TelegramClient
    participant TG as Telegram API
    participant L as CaptureLogService
    participant DB as SQLite

    S->>L: insert row (status: sending)
    L->>DB: INSERT CaptureLog
    S->>C: getPage(targetId)
    C->>Ch: CDP screenshot command
    Ch-->>C: PNG buffer
    C-->>S: buffer
    S->>N: sanitize(name) + formatTimestamp(now)
    N-->>S: filename
    S->>FS: write captures/&lt;user_id&gt;/&lt;filename&gt;
    S->>Cp: render(config.caption_template, config.caption_label, now)
    Cp-->>S: caption text
    S->>T: sendPhoto(token, channelId, filepath, caption)
    T->>TG: POST sendPhoto
    TG-->>T: 200 OK / error
    T-->>S: result
    alt delivered
        S->>L: update row (status: sent)
    else failed
        S->>T: retry sendPhoto once
        T->>TG: POST sendPhoto
        TG-->>T: 200 OK / error
        T-->>S: result
        S->>L: update row (sent | failed + error)
    end
    L->>DB: UPDATE CaptureLog
```

### 9.2 Login + MFA

```mermaid
sequenceDiagram
    participant U as Browser
    participant A as AuthService
    participant M as MfaService
    participant Sm as SessionManager
    participant DB as SQLite

    U->>A: POST /api/auth/login {email, password}
    A->>DB: SELECT user WHERE email
    DB-->>A: user row (password_hash, mfa_enabled)
    A->>A: verify password hash
    alt invalid
        A-->>U: 401 Unauthorized
    else valid, mfa disabled
        A->>Sm: create(userId)
        Sm-->>A: session cookie
        A-->>U: 200 OK + Set-Cookie
    else valid, mfa enabled
        A-->>U: 200 OK {mfaRequired: true}
        U->>A: POST /api/auth/mfa {code}
        A->>M: verifyCode(secret, code)
        M-->>A: boolean
        alt valid code
            A->>Sm: create(userId)
            Sm-->>A: session cookie
            A-->>U: 200 OK + Set-Cookie
        else invalid code
            A-->>U: 401 Unauthorized
        end
    end
```

## 10. Settings → Logs

A new sub-menu under Settings, alongside Profile and Security. It merges three sources into one chronological, filterable timeline scoped to the logged-in user — nothing here is ever cross-user:

- `ACTIVITY_LOG` rows where `category = 'error'` — sanitized system-level errors (CDP connection lost, archive failure, etc.)
- `ACTIVITY_LOG` rows where `category = 'schedule_change'` — "capture schedule updated," written whenever `ConfigService.upsert()` succeeds
- `CAPTURE_LOG` rows — every Telegram send attempt, already carrying filename, timestamp, and status/error

```mermaid
flowchart LR
    E1["CdpTargetService / ArchiveService /<br/>SchedulerService errors"] -- "sanitized summary" --> AL[("ACTIVITY_LOG<br/>category: error")]
    E2["ConfigService.upsert()<br/>succeeds"] -- "sanitized summary" --> AL2[("ACTIVITY_LOG<br/>category: schedule_change")]
    E3["Every Telegram<br/>send attempt"] --> CL[("CAPTURE_LOG<br/>filename + status")]
    AL --> Merge["GET /api/logs<br/>merge + sort by time"]
    AL2 --> Merge
    CL --> Merge
    Merge --> UI["Settings → Logs<br/>filter chips: All · Errors · Telegram sends · Schedule changes"]
```

Each row shows a timestamp, a category chip (color-coded — brick for errors, teal for a successful Telegram send, brick for a failed one, amber/neutral for a schedule change), and the summary text (plus filename, for capture rows). No raw stack traces or secrets ever reach this page — see §2a.

## 11. Confirmed decisions and open items

Confirmed:
- **Timezone:** schedule times (`start_time`/`end_time`, weekday checks) are interpreted in the server's local timezone. No per-user timezone setting in this iteration.
- **Recovery codes:** MFA enrollment issues one-time recovery codes (hashed at rest) as a standard TOTP safety net.
- **Disclaimer audit log:** each "Agree" click is recorded (`DISCLAIMER_ACCEPTANCE`) with a timestamp.
- **MFA app support:** standard TOTP (`otpauth://` URI) — Google Authenticator, Microsoft Authenticator, or any RFC 6238 app works, no special-casing per app.
- **No screenshot binary in the log:** `CAPTURE_LOG` and any Telegram-send record hold only the filename, never the image bytes (see §5).
- **Telegram caption:** each send includes a caption rendered from the user's `caption_template`/`caption_label` at send time (see §5, §9.1).
- **User-visible logs:** Settings → Logs shows sanitized error summaries, Telegram send history, and schedule-change events, merged and filterable (see §10). Full error detail stays server-side in Pino logs only (see §2a).
- **Failure alerting & auto-pause:** added after a competitive scan of similar open-source tools (`changedetection.io` and smaller Telegram screenshot bots) surfaced a real gap — EveryFrame's whole point is unattended background capture, but a dead tab or broken bot token previously just failed silently in Settings → Logs, with no way to notice unless the user happened to check. Now, `Config.failure_alert_threshold` (default 3, 0 = disabled) counts consecutive failed ticks; on hitting it, `SchedulerService` stops the job, writes an `ACTIVITY_LOG` entry, and sends one plain-text Telegram message via `TelegramClient.sendMessage()` explaining what happened — using the same bot/channel already configured, so no new credentials are needed. The job stays stopped until the user fixes the issue and presses Start again (§8.2's `AutoPaused` state), which also resets the failure count. The alert send is best-effort: if Telegram itself is unreachable, the pause and its reason are still recorded locally.

Still open:
- **Shared Chrome instance:** see §1 — the single biggest architectural assumption introduced by going multi-user. Confirm before building the tab picker against multi-user data.
- **Session store:** SQLite-backed rather than in-memory, so sessions survive a backend restart (consistent with "no Redis" but still durable).
