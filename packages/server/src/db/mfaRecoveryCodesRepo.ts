import { db } from './connection.js';

export interface MfaRecoveryCodeRow {
  id: number;
  user_id: number;
  code_hash: string;
  used_at: string | null;
}

const insertStmt = db.prepare<{ user_id: number; code_hash: string }>(
  `INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES (@user_id, @code_hash)`,
);
const deleteForUserStmt = db.prepare<{ user_id: number }>(
  `DELETE FROM mfa_recovery_codes WHERE user_id = @user_id`,
);
const listUnusedForUserStmt = db.prepare<{ user_id: number }, MfaRecoveryCodeRow>(
  `SELECT * FROM mfa_recovery_codes WHERE user_id = @user_id AND used_at IS NULL`,
);
const markUsedStmt = db.prepare<{ id: number }>(
  `UPDATE mfa_recovery_codes SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = @id`,
);

export function replaceRecoveryCodes(userId: number, hashedCodes: string[]): void {
  const tx = db.transaction((codes: string[]) => {
    deleteForUserStmt.run({ user_id: userId });
    for (const code_hash of codes) insertStmt.run({ user_id: userId, code_hash });
  });
  tx(hashedCodes);
}

export function listUnusedRecoveryCodes(userId: number): MfaRecoveryCodeRow[] {
  return listUnusedForUserStmt.all({ user_id: userId });
}

export function markRecoveryCodeUsed(id: number): void {
  markUsedStmt.run({ id });
}

export function clearRecoveryCodes(userId: number): void {
  deleteForUserStmt.run({ user_id: userId });
}
