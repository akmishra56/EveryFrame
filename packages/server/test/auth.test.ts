import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Must be set before src/db/connection.ts is evaluated - hence the dynamic
// imports below, after these assignments run.
process.env.EVERYFRAME_DB_PATH = ':memory:';
process.env.EVERYFRAME_SESSION_SECRET = 'test-only-secret-32-characters-min-abcd';
process.env.NODE_ENV = 'test';

const { buildApp } = await import('../src/app.js');
const { generate } = await import('otplib');

describe('auth + session + MFA', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let stashedRecoveryCodes: string[] = [];
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

  async function req(
    method: 'GET' | 'POST',
    url: string,
    payload?: unknown,
    extraHeaders: Record<string, string> = {},
  ) {
    const res = await app.inject({
      method,
      url,
      payload,
      headers: { cookie: cookieHeader(), ...extraHeaders },
    });
    for (const c of res.cookies) jar.set(c.name, c.value as string);
    return res;
  }

  async function csrfToken(): Promise<string> {
    const res = await req('GET', '/api/auth/csrf-token');
    return res.json().csrfToken;
  }

  const email = 'vitest@example.com';
  const password = 'correct-horse-battery-staple';

  it('registers a new user', async () => {
    const res = await req('POST', '/api/auth/register', { email, password, displayName: 'Vitest User' });
    expect(res.statusCode).toBe(201);
    expect(res.json().user.email).toBe(email);
  });

  it('rejects a duplicate registration', async () => {
    const res = await req('POST', '/api/auth/register', { email, password });
    expect(res.statusCode).toBe(409);
  });

  it('rejects a short password', async () => {
    const res = await req('POST', '/api/auth/register', { email: 'short@example.com', password: '123' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a wrong password on login', async () => {
    const res = await req('POST', '/api/auth/login', { email, password: 'nope' });
    expect(res.statusCode).toBe(401);
  });

  it('logs in and creates a session', async () => {
    const res = await req('POST', '/api/auth/login', { email, password });
    expect(res.statusCode).toBe(200);
    expect(res.json().mfaRequired).toBe(false);
  });

  it('rejects /me without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('allows /me with a valid session', async () => {
    const res = await req('GET', '/api/auth/me');
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(email);
  });

  it('enrolls MFA, rejects a wrong confirm code, then confirms with a real TOTP code', async () => {
    const csrf = await csrfToken();
    const enroll = await req('POST', '/api/auth/mfa/enroll', undefined, { 'x-csrf-token': csrf });
    expect(enroll.statusCode).toBe(200);
    const { secret } = enroll.json();
    expect(secret).toBeTruthy();

    const wrongConfirm = await req('POST', '/api/auth/mfa/confirm', { code: '000000' }, { 'x-csrf-token': csrf });
    expect(wrongConfirm.statusCode).toBe(401);

    const code = await generate({ secret });
    const confirm = await req('POST', '/api/auth/mfa/confirm', { code }, { 'x-csrf-token': csrf });
    expect(confirm.statusCode).toBe(200);
    const body = confirm.json();
    expect(body.recoveryCodes).toHaveLength(8);
    stashedRecoveryCodes = body.recoveryCodes;

    (globalThis as { __mfaSecret?: string }).__mfaSecret = secret;
  });

  it('requires MFA on the next login, rejects a wrong code, accepts the right one', async () => {
    const logoutCsrf = await csrfToken();
    await req('POST', '/api/auth/logout', undefined, { 'x-csrf-token': logoutCsrf });

    const login = await req('POST', '/api/auth/login', { email, password });
    expect(login.json().mfaRequired).toBe(true);

    const mfaCsrf = await csrfToken();
    const wrongMfa = await req('POST', '/api/auth/mfa', { code: '000000' }, { 'x-csrf-token': mfaCsrf });
    expect(wrongMfa.statusCode).toBe(401);

    const secret = (globalThis as { __mfaSecret?: string }).__mfaSecret!;
    const goodCode = await generate({ secret });
    const verify = await req('POST', '/api/auth/mfa', { code: goodCode }, { 'x-csrf-token': mfaCsrf });
    expect(verify.statusCode).toBe(200);
    expect(verify.json().user.mfaEnabled).toBe(true);
  });

  it('accepts a recovery code once and rejects reuse', async () => {
    const logoutCsrf = await csrfToken();
    await req('POST', '/api/auth/logout', undefined, { 'x-csrf-token': logoutCsrf });
    await req('POST', '/api/auth/login', { email, password });

    const csrf = await csrfToken();
    const code = stashedRecoveryCodes[0];
    const first = await req('POST', '/api/auth/mfa', { recoveryCode: code }, { 'x-csrf-token': csrf });
    expect(first.statusCode).toBe(200);

    const logoutCsrf2 = await csrfToken();
    await req('POST', '/api/auth/logout', undefined, { 'x-csrf-token': logoutCsrf2 });
    await req('POST', '/api/auth/login', { email, password });
    const csrf2 = await csrfToken();
    const second = await req('POST', '/api/auth/mfa', { recoveryCode: code }, { 'x-csrf-token': csrf2 });
    expect(second.statusCode).toBe(401);
  });
});

describe('health + cdp', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports healthy', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('rejects unauthenticated tab listing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/cdp/targets' });
    expect(res.statusCode).toBe(401);
  });

  it('fails gracefully when Chrome is unreachable', async () => {
    const jar = new Map<string, string>();
    const cookieHeader = () =>
      Array.from(jar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'cdp-test@example.com', password: 'correct-horse-battery-staple' },
    });
    for (const c of registerRes.cookies) jar.set(c.name, c.value as string);
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'cdp-test@example.com', password: 'correct-horse-battery-staple' },
      headers: { cookie: cookieHeader() },
    });
    for (const c of loginRes.cookies) jar.set(c.name, c.value as string);

    const res = await app.inject({ method: 'GET', url: '/api/cdp/targets', headers: { cookie: cookieHeader() } });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('chrome_unreachable');
  });
});
