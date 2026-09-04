import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.EVERYFRAME_DB_PATH = ':memory:';
process.env.EVERYFRAME_SESSION_SECRET = 'test-only-secret-32-characters-min-abcd';
process.env.NODE_ENV = 'test';

const { buildApp } = await import('../src/app.js');

describe('storage settings + history', () => {
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

  it('returns default settings before anything is configured', async () => {
    await req('POST', '/api/auth/register', { email: 'storage@example.com', password: 'correct-horse-battery-staple' });
    await req('POST', '/api/auth/login', { email: 'storage@example.com', password: 'correct-horse-battery-staple' });

    const res = await req('GET', '/api/storage/settings');
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.thresholdMb).toBe(5000);
    expect(res.json().settings.archivePath).toBeNull();
    expect(res.json().settings.usedMb).toBe(0);
  });

  it('rejects an invalid threshold', async () => {
    const token = await csrf();
    const res = await req('PUT', '/api/storage/settings', { thresholdMb: 0 }, { 'x-csrf-token': token });
    expect(res.statusCode).toBe(400);
  });

  it('saves valid settings and reads them back', async () => {
    const token = await csrf();
    const res = await req(
      'PUT',
      '/api/storage/settings',
      { thresholdMb: 2000, archivePath: '/tmp/everyframe-archive' },
      { 'x-csrf-token': token },
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.thresholdMb).toBe(2000);
    expect(res.json().settings.archivePath).toBe('/tmp/everyframe-archive');
  });

  it('starts with empty archive history', async () => {
    const res = await req('GET', '/api/storage/history');
    expect(res.statusCode).toBe(200);
    expect(res.json().history).toEqual([]);
  });

  it('a manual archive run is a no-op when there is nothing to archive', async () => {
    const token = await csrf();
    const res = await req('POST', '/api/storage/archive', undefined, { 'x-csrf-token': token });
    expect(res.statusCode).toBe(200);
    expect(res.json().ran).toBe(false);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/storage/settings' });
    expect(res.statusCode).toBe(401);
  });
});
