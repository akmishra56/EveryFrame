import { formatDate, formatTime } from '../capture/namer.js';
import type { ConfigRow } from '../db/configRepo.js';

const WEEKDAY_IDS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * schedule date range -> active weekday -> active time window, per architecture.md §7.2.
 * Handles a time window that wraps past midnight (start_time > end_time).
 */
export function isWithinSchedule(config: ConfigRow, now: Date): boolean {
  const today = formatDate(now);
  if (config.schedule_start_date && today < config.schedule_start_date) return false;
  if (config.schedule_end_date && today > config.schedule_end_date) return false;

  const activeDays: string[] = JSON.parse(config.active_days);
  if (!activeDays.includes(WEEKDAY_IDS[now.getDay()])) return false;

  const nowTime = formatTime(now).slice(0, 5); // HH:MM
  const { start_time: start, end_time: end } = config;
  return start <= end ? nowTime >= start && nowTime <= end : nowTime >= start || nowTime <= end;
}
