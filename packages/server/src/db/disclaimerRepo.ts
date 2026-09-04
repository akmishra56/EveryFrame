import { db } from './connection.js';

const insertStmt = db.prepare<{ user_id: number }>(
  `INSERT INTO disclaimer_acceptances (user_id) VALUES (@user_id)`,
);

/** Every "Agree" click is recorded - the disclaimer's purpose is accountability, so it's shown (and logged) on every login. */
export function insertDisclaimerAcceptance(userId: number): void {
  insertStmt.run({ user_id: userId });
}
