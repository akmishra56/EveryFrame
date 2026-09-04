import { insertActivityLog } from '../db/activityLogRepo.js';

export function logScheduleChange(userId: number, summary: string, detail?: string): void {
  insertActivityLog(userId, 'schedule_change', summary, detail ?? null);
}

/** Sanitized, one-line summary only - never a raw stack trace or a secret. The full exception still goes through Pino server-side. */
export function logError(userId: number, summary: string, detail?: string): void {
  insertActivityLog(userId, 'error', summary, detail ?? null);
}
