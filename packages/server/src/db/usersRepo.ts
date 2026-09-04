import { db } from './connection.js';

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  mfa_enabled: number;
  mfa_secret_encrypted: string | null;
  created_at: string;
  last_login_at: string | null;
}

const insertUserStmt = db.prepare<{
  email: string;
  password_hash: string;
  display_name: string;
}>(
  `INSERT INTO users (email, password_hash, display_name) VALUES (@email, @password_hash, @display_name)`,
);

const findByEmailStmt = db.prepare<{ email: string }, UserRow>(
  `SELECT * FROM users WHERE email = @email`,
);

const findByIdStmt = db.prepare<{ id: number }, UserRow>(`SELECT * FROM users WHERE id = @id`);

const touchLastLoginStmt = db.prepare<{ id: number }>(
  `UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = @id`,
);

const setMfaSecretStmt = db.prepare<{ id: number; secret: string | null }>(
  `UPDATE users SET mfa_secret_encrypted = @secret WHERE id = @id`,
);

const setMfaEnabledStmt = db.prepare<{ id: number; enabled: number }>(
  `UPDATE users SET mfa_enabled = @enabled WHERE id = @id`,
);

const updatePasswordStmt = db.prepare<{ id: number; password_hash: string }>(
  `UPDATE users SET password_hash = @password_hash WHERE id = @id`,
);

const updateDisplayNameStmt = db.prepare<{ id: number; display_name: string }>(
  `UPDATE users SET display_name = @display_name WHERE id = @id`,
);

export function createUser(email: string, passwordHash: string, displayName: string): UserRow {
  const info = insertUserStmt.run({ email, password_hash: passwordHash, display_name: displayName });
  return findById(Number(info.lastInsertRowid))!;
}

export function findByEmail(email: string): UserRow | undefined {
  return findByEmailStmt.get({ email });
}

export function findById(id: number): UserRow | undefined {
  return findByIdStmt.get({ id });
}

export function touchLastLogin(id: number): void {
  touchLastLoginStmt.run({ id });
}

export function setMfaSecret(id: number, secret: string | null): void {
  setMfaSecretStmt.run({ id, secret });
}

export function setMfaEnabled(id: number, enabled: boolean): void {
  setMfaEnabledStmt.run({ id, enabled: enabled ? 1 : 0 });
}

export function updatePassword(id: number, passwordHash: string): void {
  updatePasswordStmt.run({ id, password_hash: passwordHash });
}

export function updateDisplayName(id: number, displayName: string): void {
  updateDisplayNameStmt.run({ id, display_name: displayName });
}
