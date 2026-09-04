import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.EVERYFRAME_DB_PATH = ':memory:';
process.env.EVERYFRAME_SESSION_SECRET = 'test-only-secret-32-characters-min-abcd';
process.env.NODE_ENV = 'test';

const { buildApp } = await import('../src/app.js');

describe('POST /api/disclaimer/accept', () => {
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

  async function req(method: 'GET' | 'POST', url: string, payload?: unknown, extra: Record<string, string> = {}) {
    const res = await app.inject({ method, url, payload, headers: { cookie: cookieHeader(), ...extra } });
    for (const c of res.cookies) jar.set(c.name, c.value as string);
    return res;
  }

  it('rejects unauthenticated acceptance', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/disclaimer/accept' });
    expect(res.statusCode).toBe(401);
  });

  it('records an acceptance for the logged-in user, repeatably (every login shows it again)', async () => {
    await req('POST', '/api/auth/register', { email: 'disclaimer@example.com', password: 'correct-horse-battery-staple' });
    await req('POST', '/api/auth/login', { email: 'disclaimer@example.com', password: 'correct-horse-battery-staple' });
    const token = (await req('GET', '/api/auth/csrf-token')).json().csrfToken;

    const first = await req('POST', '/api/disclaimer/accept', undefined, { 'x-csrf-token': token });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ ok: true });

    const second = await req('POST', '/api/disclaimer/accept', undefined, { 'x-csrf-token': token });
    expect(second.statusCode).toBe(200);
  });
});
