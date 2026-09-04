import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.EVERYFRAME_DB_PATH = ':memory:';
process.env.EVERYFRAME_SESSION_SECRET = 'test-only-secret-32-characters-min-abcd';
process.env.NODE_ENV = 'test';

const { buildApp } = await import('../src/app.js');
const { insertActivityLog } = await import('../src/db/activityLogRepo.js');
const { insertCaptureLog } = await import('../src/db/captureLogRepo.js');
const { upsertConfigRow } = await import('../src/db/configRepo.js');
const { createUser } = await import('../src/db/usersRepo.js');
const { hashPassword } = await import('../src/auth/password.js');

function fakeConfigInput() {
  return {
    tab_target_id: 'x',
    tab_display_name: 'x',
    interval_seconds: 60,
    name_pattern: 'x',
    start_time: '00:00',
    end_time: '23:59',
    active_days: JSON.stringify(['mon']),
    schedule_start_date: null,
    schedule_end_date: null,
    bot_token_encrypted: 'x',
    channel_id: 'x',
    caption_label: 'x',
    caption_template: 'x',
    failure_alert_threshold: 3,
  };
}

describe('GET /api/logs', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const jar = new Map<string, string>();
  let userId: number;
  let otherUserId: number;

  beforeAll(async () => {
    app = await buildApp();
    userId = createUser('logs@example.com', await hashPassword('correct-horse-battery-staple'), 'Logs Test').id;
    otherUserId = createUser('other-logs@example.com', await hashPassword('correct-horse-battery-staple'), 'Other').id;

    const configId = upsertConfigRow(userId, fakeConfigInput()).id;
    insertActivityLog(userId, 'error', 'Chrome connection lost while listing tabs.');
    insertActivityLog(userId, 'schedule_change', 'Capture schedule created');
    insertCaptureLog(configId, userId, 'demo_2026_01_01_00_00_00.png', 'sent');
    insertCaptureLog(configId, userId, 'demo_2026_01_01_00_01_00.png', 'failed');

    // Belongs to a different user - must never appear in userId's results.
    insertActivityLog(otherUserId, 'error', 'Some other user error');
  });

  afterAll(async () => {
    await app.close();
  });

  function cookieHeader(): string {
    return Array.from(jar.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/logs' });
    expect(res.statusCode).toBe(401);
  });

  it('returns all four log entries for the authenticated user, newest first, none from another user', async () => {
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'logs@example.com', password: 'correct-horse-battery-staple' },
    });
    for (const c of registerRes.cookies) jar.set(c.name, c.value as string);

    const res = await app.inject({ method: 'GET', url: '/api/logs', headers: { cookie: cookieHeader() } });
    expect(res.statusCode).toBe(200);
    const logs = res.json().logs;
    expect(logs).toHaveLength(4);
    expect(logs.every((l: { summary: string }) => l.summary !== 'Some other user error')).toBe(true);
    // newest first
    for (let i = 1; i < logs.length; i++) {
      expect(logs[i - 1].createdAt >= logs[i].createdAt).toBe(true);
    }
  });

  it('filters to only errors', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/logs?category=error', headers: { cookie: cookieHeader() } });
    const logs = res.json().logs;
    expect(logs).toHaveLength(1);
    expect(logs[0].category).toBe('error');
  });

  it('filters to only schedule changes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/logs?category=schedule_change',
      headers: { cookie: cookieHeader() },
    });
    const logs = res.json().logs;
    expect(logs).toHaveLength(1);
    expect(logs[0].category).toBe('schedule_change');
  });

  it('filters to only telegram sends, mapping capture_log status to a summary', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/logs?category=telegram_send',
      headers: { cookie: cookieHeader() },
    });
    const logs = res.json().logs;
    expect(logs).toHaveLength(2);
    expect(logs.every((l: { category: string }) => l.category === 'telegram_send')).toBe(true);
    expect(logs.some((l: { summary: string }) => l.summary === 'Sent')).toBe(true);
    expect(logs.some((l: { summary: string }) => l.summary === 'Failed')).toBe(true);
  });

  it('rejects an unknown category filter', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/logs?category=bogus', headers: { cookie: cookieHeader() } });
    expect(res.statusCode).toBe(400);
  });
});
