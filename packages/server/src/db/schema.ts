import type Database from 'better-sqlite3';

// Full schema per docs/architecture.md §5 (ERD). Tables for later build-plan
// phases are created now too (e.g. config, activity_log) since they're just
// empty DDL until their owning service lands - see build-plan.md step 5.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  mfa_secret_encrypted TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user_id ON mfa_recovery_codes(user_id);

CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  tab_target_id TEXT NOT NULL,
  tab_display_name TEXT NOT NULL,
  interval_seconds INTEGER NOT NULL,
  name_pattern TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  active_days TEXT NOT NULL,
  schedule_start_date TEXT,
  schedule_end_date TEXT,
  bot_token_encrypted TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  caption_label TEXT NOT NULL,
  caption_template TEXT NOT NULL,
  failure_alert_threshold INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS capture_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_id INTEGER NOT NULL REFERENCES config(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status TEXT NOT NULL,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_capture_log_user_id ON capture_log(user_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS disclaimer_acceptances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_disclaimer_acceptances_user_id ON disclaimer_acceptances(user_id);

CREATE TABLE IF NOT EXISTS storage_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  threshold_mb INTEGER NOT NULL DEFAULT 5000,
  archive_path TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS archive_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archived_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  file_count INTEGER NOT NULL,
  total_size_mb INTEGER NOT NULL,
  destination_path TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_archive_events_user_id ON archive_events(user_id, archived_at DESC);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id, created_at DESC);
`;

/** Adds a column to an already-existing table when CREATE TABLE IF NOT EXISTS can't (the table predates the column). */
function ensureColumn(db: Database.Database, table: string, column: string, columnDdl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDdl}`);
  }
}

export function runMigrations(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  ensureColumn(db, 'config', 'failure_alert_threshold', 'failure_alert_threshold INTEGER NOT NULL DEFAULT 3');
}
