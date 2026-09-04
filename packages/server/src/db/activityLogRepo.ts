import { db } from './connection.js';

export interface ActivityLogRow {
  id: number;
  user_id: number;
  category: string;
  summary: string;
  detail: string | null;
  created_at: string;
}

const insertStmt = db.prepare<{ user_id: number; category: string; summary: string; detail: string | null }>(
  `INSERT INTO activity_log (user_id, category, summary, detail) VALUES (@user_id, @category, @summary, @detail)`,
);

const listForUserStmt = db.prepare<{ user_id: number; limit: number }, ActivityLogRow>(
  `SELECT * FROM activity_log WHERE user_id = @user_id ORDER BY created_at DESC LIMIT @limit`,
);

const listForUserByCategoryStmt = db.prepare<{ user_id: number; category: string; limit: number }, ActivityLogRow>(
  `SELECT * FROM activity_log WHERE user_id = @user_id AND category = @category ORDER BY created_at DESC LIMIT @limit`,
);

export function insertActivityLog(
  userId: number,
  category: string,
  summary: string,
  detail: string | null = null,
): void {
  insertStmt.run({ user_id: userId, category, summary, detail });
}

export function listActivityLog(userId: number, category?: string, limit = 100): ActivityLogRow[] {
  return category
    ? listForUserByCategoryStmt.all({ user_id: userId, category, limit })
    : listForUserStmt.all({ user_id: userId, limit });
}
