import { db } from './connection.js';

export interface ConfigRow {
  id: number;
  user_id: number;
  tab_target_id: string;
  tab_display_name: string;
  interval_seconds: number;
  name_pattern: string;
  start_time: string;
  end_time: string;
  active_days: string; // JSON-encoded string[]
  schedule_start_date: string | null;
  schedule_end_date: string | null;
  bot_token_encrypted: string;
  channel_id: string;
  caption_label: string;
  caption_template: string;
  failure_alert_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface ConfigWriteInput {
  tab_target_id: string;
  tab_display_name: string;
  interval_seconds: number;
  name_pattern: string;
  start_time: string;
  end_time: string;
  active_days: string;
  schedule_start_date: string | null;
  schedule_end_date: string | null;
  bot_token_encrypted: string;
  channel_id: string;
  caption_label: string;
  caption_template: string;
  failure_alert_threshold: number;
}

const findByUserIdStmt = db.prepare<{ user_id: number }, ConfigRow>(
  `SELECT * FROM config WHERE user_id = @user_id`,
);

const upsertStmt = db.prepare<{ user_id: number } & ConfigWriteInput>(`
  INSERT INTO config (
    user_id, tab_target_id, tab_display_name, interval_seconds, name_pattern,
    start_time, end_time, active_days, schedule_start_date, schedule_end_date,
    bot_token_encrypted, channel_id, caption_label, caption_template, failure_alert_threshold
  ) VALUES (
    @user_id, @tab_target_id, @tab_display_name, @interval_seconds, @name_pattern,
    @start_time, @end_time, @active_days, @schedule_start_date, @schedule_end_date,
    @bot_token_encrypted, @channel_id, @caption_label, @caption_template, @failure_alert_threshold
  )
  ON CONFLICT(user_id) DO UPDATE SET
    tab_target_id = excluded.tab_target_id,
    tab_display_name = excluded.tab_display_name,
    interval_seconds = excluded.interval_seconds,
    name_pattern = excluded.name_pattern,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    active_days = excluded.active_days,
    schedule_start_date = excluded.schedule_start_date,
    schedule_end_date = excluded.schedule_end_date,
    bot_token_encrypted = excluded.bot_token_encrypted,
    channel_id = excluded.channel_id,
    caption_label = excluded.caption_label,
    caption_template = excluded.caption_template,
    failure_alert_threshold = excluded.failure_alert_threshold,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
`);

export function getConfigByUserId(userId: number): ConfigRow | undefined {
  return findByUserIdStmt.get({ user_id: userId });
}

export function upsertConfigRow(userId: number, input: ConfigWriteInput): ConfigRow {
  upsertStmt.run({ user_id: userId, ...input });
  return getConfigByUserId(userId)!;
}
