import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.EVERYFRAME_DB_PATH = ':memory:';
process.env.EVERYFRAME_SESSION_SECRET = 'test-only-secret-32-characters-min-abcd';
process.env.NODE_ENV = 'test';

const { buildApp } = await import('../src/app.js');

describe('capture start/stop/status', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const jar = new Map<string, string>();

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  function cookieHeader(): string {
    return Array.from(jar.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  async function req(method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, extra: Record<string, string> = {}) {
    const res = await app.inject({ method, url, payload, headers: { cookie: cookieHeader(), ...extra } });
    for (const c of res.cookies) jar.set(c.name, c.value as string);
    return res;
  }

  async function csrf(): Promise<string> {
    return (await req('GET', '/api/auth/csrf-token')).json().csrfToken;
  }

  it('rejects starting capture with no saved config', async () => {
    await req('POST', '/api/auth/register', { email: 'nojob@example.com', password: 'correct-horse-battery-staple' });
    await req('POST', '/api/auth/login', { email: 'nojob@example.com', password: 'correct-horse-battery-staple' });
    const token = await csrf();
    const res = await req('POST', '/api/capture/start', undefined, { 'x-csrf-token': token });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('no_config');
  });

  it('reports not running before start', async () => {
    const res = await req('GET', '/api/capture/status');
    expect(res.json().status.running).toBe(false);
  });

  it('starts, reports running, then stops - using a long interval so no real tick fires', async () => {
    const token = await csrf();
    await req(
      'PUT',
      '/api/config',
      {
        tabTargetId: 'FAKE-TARGET-ID',
        tabDisplayName: 'Fake tab',
        intervalSeconds: 3600,
        namePattern: 'fake-tab',
        startTime: '00:00',
        endTime: '23:59',
        activeDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        botToken: 'fake:token',
        channelId: '@fake',
        captionLabel: 'fake-tab',
        captionTemplate: '{label} generated at {time} on {date}',
      },
      { 'x-csrf-token': token },
    );

    const start = await req('POST', '/api/capture/start', undefined, { 'x-csrf-token': token });
    expect(start.statusCode).toBe(200);
    expect(start.json().status.running).toBe(true);

    // starting again is idempotent, not an error
    const startAgain = await req('POST', '/api/capture/start', undefined, { 'x-csrf-token': token });
    expect(startAgain.statusCode).toBe(200);
    expect(startAgain.json().status.running).toBe(true);

    const status = await req('GET', '/api/capture/status');
    expect(status.json().status.running).toBe(true);

    const stop = await req('POST', '/api/capture/stop', undefined, { 'x-csrf-token': token });
    expect(stop.statusCode).toBe(200);
    expect(stop.json().status.running).toBe(false);
  });

  it('rejects unauthenticated status checks', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/capture/status' });
    expect(res.statusCode).toBe(401);
  });
});
