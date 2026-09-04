import { listActivityLog } from '../db/activityLogRepo.js';
import { listCaptureLogForUser } from '../db/captureLogRepo.js';

export interface LogEntry {
  id: string;
  category: 'error' | 'schedule_change' | 'telegram_send';
  summary: string;
  detail: string | null;
  filename: string | null;
  createdAt: string;
}

/**
 * Merges ActivityLog (errors, schedule changes) with CaptureLog (every Telegram
 * send attempt) into one chronological, filterable view - architecture.md §10.
 * Telegram sends are never duplicated into ActivityLog; this is the only place
 * they're combined.
 */
export function getMergedLogs(userId: number, category?: string, limit = 100): LogEntry[] {
  const entries: LogEntry[] = [];

  if (category === undefined || category === 'error' || category === 'schedule_change') {
    const activityCategory = category === 'error' || category === 'schedule_change' ? category : undefined;
    for (const row of listActivityLog(userId, activityCategory, limit)) {
      entries.push({
        id: `activity:${row.id}`,
        category: row.category as 'error' | 'schedule_change',
        summary: row.summary,
        detail: row.detail,
        filename: null,
        createdAt: row.created_at,
      });
    }
  }

  if (category === undefined || category === 'telegram_send') {
    for (const row of listCaptureLogForUser(userId, limit)) {
      const summary = row.status === 'sent' ? 'Sent' : row.status === 'sending' ? 'Sending…' : 'Failed';
      entries.push({
        id: `capture:${row.id}`,
        category: 'telegram_send',
        summary,
        detail: row.error_message,
        filename: row.filename,
        createdAt: row.captured_at,
      });
    }
  }

  entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return entries.slice(0, limit);
}
