import type { SessionStore } from '@fastify/session';
import type { Session } from 'fastify';
import { db } from './connection.js';

const setStmt = db.prepare<{ sid: string; user_id: number | null; expires_at: number; data: string }>(
  `INSERT INTO sessions (sid, user_id, expires_at, data) VALUES (@sid, @user_id, @expires_at, @data)
   ON CONFLICT(sid) DO UPDATE SET user_id = excluded.user_id, expires_at = excluded.expires_at, data = excluded.data`,
);
const getStmt = db.prepare<{ sid: string }, { data: string; expires_at: number }>(
  `SELECT data, expires_at FROM sessions WHERE sid = @sid`,
);
const destroyStmt = db.prepare<{ sid: string }>(`DELETE FROM sessions WHERE sid = @sid`);
const pruneStmt = db.prepare<{ now: number }>(`DELETE FROM sessions WHERE expires_at < @now`);

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24; // 24h fallback if the cookie carries no explicit expiry

/** better-sqlite3 is synchronous, but @fastify/session expects a Node-style callback store. */
export class SqliteSessionStore implements SessionStore {
  set(sessionId: string, session: Session, callback: (err?: Error) => void): void {
    try {
      const expiresAt = session.cookie?.expires
        ? new Date(session.cookie.expires).getTime()
        : Date.now() + DEFAULT_TTL_MS;
      setStmt.run({
        sid: sessionId,
        user_id: session.userId ?? null,
        expires_at: expiresAt,
        data: JSON.stringify(session),
      });
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  get(sessionId: string, callback: (err: Error | null, session?: Session | null) => void): void {
    try {
      pruneStmt.run({ now: Date.now() });
      const row = getStmt.get({ sid: sessionId });
      if (!row) {
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err as Error);
    }
  }

  destroy(sessionId: string, callback: (err?: Error) => void): void {
    try {
      destroyStmt.run({ sid: sessionId });
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }
}
