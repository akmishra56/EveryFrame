import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.EVERYFRAME_DB_PATH = ':memory:';
process.env.EVERYFRAME_SESSION_SECRET = 'test-only-secret-32-characters-min-abcd';
process.env.NODE_ENV = 'test';

const { buildApp } = await import('../src/app.js');

function validConfigBody(overrides: Record<string, unknown> = {}) {
  return {
    tabTargetId: 'ABCDEF1234567890',
    tabDisplayName: 'localhost:3000',
    intervalSeconds: 60,
    namePattern: 'localhost-3000',
    startTime: '00:00',
    endTime: '23:59',
    activeDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    scheduleStartDate: null,
    scheduleEndDate: null,
    botToken: '7839201:AAtestBotToken1234567890',
    channelId: '@test-channel',
    captionLabel: 'localhost-3000',
    captionTemplate: '{label} generated at {time} on {date}',
    ...overrides,
  };
}

describe('config storage - per-user isolation', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function makeSession(email: string) {
    const jar = new Map<string, string>();
    const cookieHeader = () =>
      Array.from(jar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    const req = async (method: 'GET' | 'PUT' | 'POST', url: string, payload?: unknown, extra: Record<string, string> = {}) => {
      const res = await app.inject({ method, url, payload, headers: { cookie: cookieHeader(), ...extra } });
      for (const c of res.cookies) jar.set(c.name, c.value as string);
      return res;
    };
    await req('POST', '/api/auth/register', { email, password: 'correct-horse-battery-staple' });
    await req('POST', '/api/auth/login', { email, password: 'correct-horse-battery-staple' });
    const csrf = (await req('GET', '/api/auth/csrf-token')).json().csrfToken;
    return { req, csrf };
  }

  it('returns 404 for a user with no config yet', async () => {
    const { req } = await makeSession('no-config@example.com');
    const res = await req('GET', '/api/config');
    expect(res.statusCode).toBe(404);
  });

  it('rejects invalid input', async () => {
    const { req, csrf } = await makeSession('invalid@example.com');
    const res = await req('PUT', '/api/config', validConfigBody({ intervalSeconds: 0 }), {
      'x-csrf-token': csrf,
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates a config and masks the bot token on read-back', async () => {
    const { req, csrf } = await makeSession('creator@example.com');
    const put = await req('PUT', '/api/config', validConfigBody(), { 'x-csrf-token': csrf });
    expect(put.statusCode).toBe(200);
    const config = put.json().config;
    expect(config.tabDisplayName).toBe('localhost:3000');
    expect(config.botTokenMasked).toMatch(/^••••/);
    expect(config.botTokenMasked).not.toContain('AAtestBotToken');

    const get = await req('GET', '/api/config');
    expect(get.statusCode).toBe(200);
    expect(get.json().config.channelId).toBe('@test-channel');
  });

  it('keeps two users completely isolated from each other', async () => {
    const alice = await makeSession('alice@example.com');
    const bob = await makeSession('bob@example.com');

    await alice.req('PUT', '/api/config', validConfigBody({ tabDisplayName: 'Alice tab', channelId: '@alice-channel' }), {
      'x-csrf-token': alice.csrf,
    });
    await bob.req('PUT', '/api/config', validConfigBody({ tabDisplayName: 'Bob tab', channelId: '@bob-channel' }), {
      'x-csrf-token': bob.csrf,
    });

    const aliceConfig = (await alice.req('GET', '/api/config')).json().config;
    const bobConfig = (await bob.req('GET', '/api/config')).json().config;

    expect(aliceConfig.tabDisplayName).toBe('Alice tab');
    expect(aliceConfig.channelId).toBe('@alice-channel');
    expect(bobConfig.tabDisplayName).toBe('Bob tab');
    expect(bobConfig.channelId).toBe('@bob-channel');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(401);
  });

  it('keeps the existing bot token when updating other fields without one', async () => {
    const { req, csrf } = await makeSession('keeptoken@example.com');
    const first = await req('PUT', '/api/config', validConfigBody(), { 'x-csrf-token': csrf });
    const firstMasked = first.json().config.botTokenMasked;

    const second = await req(
      'PUT',
      '/api/config',
      validConfigBody({ botToken: undefined, tabDisplayName: 'renamed tab' }),
      { 'x-csrf-token': csrf },
    );
    expect(second.statusCode).toBe(200);
    expect(second.json().config.botTokenMasked).toBe(firstMasked);
    expect(second.json().config.tabDisplayName).toBe('renamed tab');
  });

  it('defaults failureAlertThreshold to 3 when omitted, and rejects an out-of-range value', async () => {
    const { req, csrf } = await makeSession('failurealert@example.com');

    const defaulted = await req('PUT', '/api/config', validConfigBody(), { 'x-csrf-token': csrf });
    expect(defaulted.json().config.failureAlertThreshold).toBe(3);

    const invalid = await req('PUT', '/api/config', validConfigBody({ failureAlertThreshold: 51 }), {
      'x-csrf-token': csrf,
    });
    expect(invalid.statusCode).toBe(400);

    const updated = await req('PUT', '/api/config', validConfigBody({ failureAlertThreshold: 0 }), {
      'x-csrf-token': csrf,
    });
    expect(updated.json().config.failureAlertThreshold).toBe(0);
  });
});
