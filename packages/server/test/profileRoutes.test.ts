import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.EVERYFRAME_DB_PATH = ':memory:';
process.env.EVERYFRAME_SESSION_SECRET = 'test-only-secret-32-characters-min-abcd';
process.env.NODE_ENV = 'test';

const { buildApp } = await import('../src/app.js');

describe('profile + password endpoints', () => {
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

  it('rejects unauthenticated profile updates', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/auth/profile', payload: { displayName: 'X' } });
    expect(res.statusCode).toBe(401);
  });

  it('updates the display name', async () => {
    await req('POST', '/api/auth/register', { email: 'profile@example.com', password: 'correct-horse-battery-staple' });
    await req('POST', '/api/auth/login', { email: 'profile@example.com', password: 'correct-horse-battery-staple' });
    const token = await csrf();

    const res = await req('PUT', '/api/auth/profile', { displayName: 'New Name' }, { 'x-csrf-token': token });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.displayName).toBe('New Name');

    const me = await req('GET', '/api/auth/me');
    expect(me.json().user.displayName).toBe('New Name');
  });

  it('rejects an empty display name', async () => {
    const token = await csrf();
    const res = await req('PUT', '/api/auth/profile', { displayName: '   ' }, { 'x-csrf-token': token });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a password change with the wrong current password', async () => {
    const token = await csrf();
    const res = await req(
      'POST',
      '/api/auth/change-password',
      { currentPassword: 'wrong', newPassword: 'new-correct-horse-battery' },
      { 'x-csrf-token': token },
    );
    expect(res.statusCode).toBe(401);
  });

  it('rejects a too-short new password', async () => {
    const token = await csrf();
    const res = await req(
      'POST',
      '/api/auth/change-password',
      { currentPassword: 'correct-horse-battery-staple', newPassword: 'short' },
      { 'x-csrf-token': token },
    );
    expect(res.statusCode).toBe(400);
  });

  it('changes the password, and the old password no longer works', async () => {
    const token = await csrf();
    const res = await req(
      'POST',
      '/api/auth/change-password',
      { currentPassword: 'correct-horse-battery-staple', newPassword: 'new-correct-horse-battery' },
      { 'x-csrf-token': token },
    );
    expect(res.statusCode).toBe(200);

    const logoutToken = await csrf();
    await req('POST', '/api/auth/logout', undefined, { 'x-csrf-token': logoutToken });

    const oldLogin = await req('POST', '/api/auth/login', {
      email: 'profile@example.com',
      password: 'correct-horse-battery-staple',
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await req('POST', '/api/auth/login', {
      email: 'profile@example.com',
      password: 'new-correct-horse-battery',
    });
    expect(newLogin.statusCode).toBe(200);
  });
});
