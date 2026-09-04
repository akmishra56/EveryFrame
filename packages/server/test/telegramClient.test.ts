import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage, sendPhoto } from '../src/telegram/TelegramClient.js';

describe('sendPhoto', () => {
  let tmpDir: string;
  let filePath: string;
  const fakeToken = '123456:AAsecretTokenValueXYZ';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'everyframe-test-'));
    filePath = join(tmpDir, 'frame.png');
    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('returns ok:true on a successful send', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(url).toContain(fakeToken);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    const result = await sendPhoto(fakeToken, '@channel', filePath, 'a caption');
    expect(result.ok).toBe(true);
  });

  it('returns ok:false with a sanitized error on API failure, never leaking the token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: false, description: `Bad Request: chat not found (token was ${fakeToken})` }),
          { status: 400 },
        ),
      ),
    );
    const result = await sendPhoto(fakeToken, '@bad-channel', filePath);
    expect(result.ok).toBe(false);
    expect(result.errorDescription).not.toContain(fakeToken);
    expect(result.errorDescription).toContain('[REDACTED]');
  });

  it('returns ok:false and never leaks the token when fetch itself throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(`connect ECONNREFUSED - bad url https://api.telegram.org/bot${fakeToken}/sendPhoto`);
      }),
    );
    const result = await sendPhoto(fakeToken, '@channel', filePath);
    expect(result.ok).toBe(false);
    expect(result.errorDescription).not.toContain(fakeToken);
  });

  it('returns ok:false when the file cannot be read, without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await sendPhoto(fakeToken, '@channel', join(tmpDir, 'does-not-exist.png'));
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('sendMessage', () => {
  const fakeToken = '123456:AAsecretTokenValueXYZ';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns ok:true on a successful send', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(url).toContain(fakeToken);
        expect(url).toContain('/sendMessage');
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    const result = await sendMessage(fakeToken, '@channel', 'capture paused');
    expect(result.ok).toBe(true);
  });

  it('never leaks the token in a failure response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: false, description: `Bad Request: chat not found (token was ${fakeToken})` }),
          { status: 400 },
        ),
      ),
    );
    const result = await sendMessage(fakeToken, '@bad-channel', 'capture paused');
    expect(result.ok).toBe(false);
    expect(result.errorDescription).not.toContain(fakeToken);
    expect(result.errorDescription).toContain('[REDACTED]');
  });
});
