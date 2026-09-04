import { db } from './connection.js';

export interface StorageSettingsRow {
  user_id: number;
  threshold_mb: number;
  archive_path: string | null;
  updated_at: string;
}

const getStmt = db.prepare<{ user_id: number }, StorageSettingsRow>(
  `SELECT * FROM storage_settings WHERE user_id = @user_id`,
);

const upsertStmt = db.prepare<{ user_id: number; threshold_mb: number; archive_path: string | null }>(`
  INSERT INTO storage_settings (user_id, threshold_mb, archive_path)
  VALUES (@user_id, @threshold_mb, @archive_path)
  ON CONFLICT(user_id) DO UPDATE SET
    threshold_mb = excluded.threshold_mb,
    archive_path = excluded.archive_path,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
`);

export function getStorageSettings(userId: number): StorageSettingsRow | undefined {
  return getStmt.get({ user_id: userId });
}

export function upsertStorageSettings(
  userId: number,
  thresholdMb: number,
  archivePath: string | null,
): StorageSettingsRow {
  upsertStmt.run({ user_id: userId, threshold_mb: thresholdMb, archive_path: archivePath });
  return getStorageSettings(userId)!;
}

/** Default settings for a user who hasn't configured storage yet - matches the schema's own default threshold. */
export function getOrDefaultStorageSettings(userId: number): StorageSettingsRow {
  return getStorageSettings(userId) ?? { user_id: userId, threshold_mb: 5000, archive_path: null, updated_at: '' };
}
