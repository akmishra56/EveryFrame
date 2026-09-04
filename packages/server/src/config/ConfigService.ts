import { logScheduleChange } from '../activity/ActivityLogService.js';
import { encryptSecret } from '../crypto/secretBox.js';
import { getConfigByUserId, upsertConfigRow, type ConfigRow } from '../db/configRepo.js';

const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ConfigInput {
  tabTargetId: string;
  tabDisplayName: string;
  intervalSeconds: number;
  namePattern: string;
  startTime: string;
  endTime: string;
  activeDays: string[];
  scheduleStartDate?: string | null;
  scheduleEndDate?: string | null;
  /** Plaintext - encrypted before storage. Omit/blank on update to keep the existing token. */
  botToken?: string;
  channelId: string;
  captionLabel: string;
  captionTemplate: string;
  /** Consecutive capture/send failures before EveryFrame auto-pauses and alerts via Telegram. 0 disables both. Defaults to 3 when omitted. */
  failureAlertThreshold?: number;
}

export interface PublicConfig {
  tabTargetId: string;
  tabDisplayName: string;
  intervalSeconds: number;
  namePattern: string;
  startTime: string;
  endTime: string;
  activeDays: string[];
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  botTokenMasked: string;
  channelId: string;
  captionLabel: string;
  captionTemplate: string;
  failureAlertThreshold: number;
  updatedAt: string;
}

export class ConfigValidationError extends Error {}

/** A stable, non-reversible display hint - never the real token. */
function maskToken(encrypted: string): string {
  const tail = encrypted.slice(-4).replace(/[^a-zA-Z0-9]/g, '');
  return `••••${tail || '????'}`;
}

function toPublicConfig(row: ConfigRow): PublicConfig {
  return {
    tabTargetId: row.tab_target_id,
    tabDisplayName: row.tab_display_name,
    intervalSeconds: row.interval_seconds,
    namePattern: row.name_pattern,
    startTime: row.start_time,
    endTime: row.end_time,
    activeDays: JSON.parse(row.active_days),
    scheduleStartDate: row.schedule_start_date,
    scheduleEndDate: row.schedule_end_date,
    botTokenMasked: maskToken(row.bot_token_encrypted),
    channelId: row.channel_id,
    captionLabel: row.caption_label,
    captionTemplate: row.caption_template,
    failureAlertThreshold: row.failure_alert_threshold,
    updatedAt: row.updated_at,
  };
}

function validate(input: ConfigInput): void {
  if (!input.tabTargetId?.trim()) throw new ConfigValidationError('tabTargetId is required.');
  if (!input.tabDisplayName?.trim()) throw new ConfigValidationError('tabDisplayName is required.');
  if (!Number.isInteger(input.intervalSeconds) || input.intervalSeconds < 1) {
    throw new ConfigValidationError('intervalSeconds must be a positive integer.');
  }
  if (!input.namePattern?.trim()) throw new ConfigValidationError('namePattern is required.');
  if (!TIME_RE.test(input.startTime)) throw new ConfigValidationError('startTime must be HH:MM.');
  if (!TIME_RE.test(input.endTime)) throw new ConfigValidationError('endTime must be HH:MM.');
  if (
    !Array.isArray(input.activeDays) ||
    input.activeDays.length === 0 ||
    !input.activeDays.every((d) => VALID_DAYS.includes(d))
  ) {
    throw new ConfigValidationError('activeDays must be a non-empty list of weekday ids.');
  }
  if (input.scheduleStartDate && !DATE_RE.test(input.scheduleStartDate)) {
    throw new ConfigValidationError('scheduleStartDate must be YYYY-MM-DD.');
  }
  if (input.scheduleEndDate && !DATE_RE.test(input.scheduleEndDate)) {
    throw new ConfigValidationError('scheduleEndDate must be YYYY-MM-DD.');
  }
  if (input.scheduleStartDate && input.scheduleEndDate && input.scheduleStartDate > input.scheduleEndDate) {
    throw new ConfigValidationError('scheduleStartDate must not be after scheduleEndDate.');
  }
  if (!input.channelId?.trim()) throw new ConfigValidationError('channelId is required.');
  if (!input.captionLabel?.trim()) throw new ConfigValidationError('captionLabel is required.');
  if (!input.captionTemplate?.trim()) throw new ConfigValidationError('captionTemplate is required.');
  if (
    input.failureAlertThreshold !== undefined &&
    (!Number.isInteger(input.failureAlertThreshold) || input.failureAlertThreshold < 0 || input.failureAlertThreshold > 50)
  ) {
    throw new ConfigValidationError('failureAlertThreshold must be an integer between 0 and 50.');
  }
}

export function getForUser(userId: number): PublicConfig | undefined {
  const row = getConfigByUserId(userId);
  return row ? toPublicConfig(row) : undefined;
}

/** Unmasked row, including the encrypted bot token - for trusted server-side use only (delivery, scheduler). Never expose via a public route. */
export function getRawForUser(userId: number): ConfigRow | undefined {
  return getConfigByUserId(userId);
}

export function upsert(userId: number, input: ConfigInput): PublicConfig {
  validate(input);
  const existing = getConfigByUserId(userId);

  const botTokenEncrypted = input.botToken?.trim()
    ? encryptSecret(input.botToken.trim())
    : existing?.bot_token_encrypted;
  if (!botTokenEncrypted) {
    throw new ConfigValidationError('botToken is required when creating a new configuration.');
  }

  const row = upsertConfigRow(userId, {
    tab_target_id: input.tabTargetId.trim(),
    tab_display_name: input.tabDisplayName.trim(),
    interval_seconds: input.intervalSeconds,
    name_pattern: input.namePattern.trim(),
    start_time: input.startTime,
    end_time: input.endTime,
    active_days: JSON.stringify(input.activeDays),
    schedule_start_date: input.scheduleStartDate ?? null,
    schedule_end_date: input.scheduleEndDate ?? null,
    bot_token_encrypted: botTokenEncrypted,
    channel_id: input.channelId.trim(),
    caption_label: input.captionLabel.trim(),
    caption_template: input.captionTemplate.trim(),
    failure_alert_threshold: input.failureAlertThreshold ?? existing?.failure_alert_threshold ?? 3,
  });

  logScheduleChange(userId, existing ? 'Capture schedule updated' : 'Capture schedule created');

  return toPublicConfig(row);
}
