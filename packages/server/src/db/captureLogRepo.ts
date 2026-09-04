import { db } from './connection.js';

export interface CaptureLogRow {
  id: number;
  config_id: number;
  user_id: number;
  filename: string;
  captured_at: string;
  status: string;
  error_message: string | null;
}

const insertStmt = db.prepare<{ config_id: number; user_id: number; filename: string; status: string }>(
  `INSERT INTO capture_log (config_id, user_id, filename, status) VALUES (@config_id, @user_id, @filename, @status)`,
);

const updateStatusStmt = db.prepare<{ id: number; status: string; error_message: string | null }>(
  `UPDATE capture_log SET status = @status, error_message = @error_message WHERE id = @id`,
);

const listForUserStmt = db.prepare<{ user_id: number; limit: number }, CaptureLogRow>(
  `SELECT * FROM capture_log WHERE user_id = @user_id ORDER BY captured_at DESC LIMIT @limit`,
);

const getByIdStmt = db.prepare<{ id: number }, CaptureLogRow>(`SELECT * FROM capture_log WHERE id = @id`);

export function insertCaptureLog(configId: number, userId: number, filename: string, status: string): number {
  const info = insertStmt.run({ config_id: configId, user_id: userId, filename, status });
  return Number(info.lastInsertRowid);
}

export function updateCaptureLogStatus(id: number, status: string, errorMessage: string | null): void {
  updateStatusStmt.run({ id, status, error_message: errorMessage });
}

export function listCaptureLogForUser(userId: number, limit = 100): CaptureLogRow[] {
  return listForUserStmt.all({ user_id: userId, limit });
}

export function getCaptureLogById(id: number): CaptureLogRow | undefined {
  return getByIdStmt.get({ id });
}
