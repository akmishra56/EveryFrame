import { db } from './connection.js';

export interface ArchiveEventRow {
  id: number;
  user_id: number;
  archived_at: string;
  file_count: number;
  total_size_mb: number;
  destination_path: string;
}

const insertStmt = db.prepare<{
  user_id: number;
  file_count: number;
  total_size_mb: number;
  destination_path: string;
}>(
  `INSERT INTO archive_events (user_id, file_count, total_size_mb, destination_path)
   VALUES (@user_id, @file_count, @total_size_mb, @destination_path)`,
);

const listForUserStmt = db.prepare<{ user_id: number; limit: number }, ArchiveEventRow>(
  `SELECT * FROM archive_events WHERE user_id = @user_id ORDER BY archived_at DESC LIMIT @limit`,
);

export function insertArchiveEvent(
  userId: number,
  fileCount: number,
  totalSizeMb: number,
  destinationPath: string,
): void {
  insertStmt.run({ user_id: userId, file_count: fileCount, total_size_mb: totalSizeMb, destination_path: destinationPath });
}

export function listArchiveEvents(userId: number, limit = 50): ArchiveEventRow[] {
  return listForUserStmt.all({ user_id: userId, limit });
}
