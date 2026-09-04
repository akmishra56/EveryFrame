import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

process.env.EVERYFRAME_DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const capturesRoot = mkdtempSync(join(tmpdir(), 'everyframe-captures-exdev-'));
const archiveRoot = mkdtempSync(join(tmpdir(), 'everyframe-archive-exdev-'));
process.env.EVERYFRAME_CAPTURES_DIR = capturesRoot;

afterAll(() => {
  rmSync(capturesRoot, { recursive: true, force: true });
  rmSync(archiveRoot, { recursive: true, force: true });
});

// Isolated in its own file: mocking node:fs/promises' rename() globally would
// break the other (real cross-device-free) archive tests if shared with them.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: vi.fn(async () => {
      throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' });
    }),
  };
});

const { runArchive } = await import('../src/storage/ArchiveService.js');
const { upsertStorageSettings } = await import('../src/db/storageSettingsRepo.js');
const { createUser } = await import('../src/db/usersRepo.js');
const { hashPassword } = await import('../src/auth/password.js');

describe('ArchiveService - cross-device archive destination', () => {
  it('falls back to copy+delete when rename() reports EXDEV (e.g. archiving to an external drive)', async () => {
    const userId = createUser(
      'exdev@example.com',
      await hashPassword('correct-horse-battery-staple'),
      'Exdev Test',
    ).id;
    const dir = join(capturesRoot, String(userId));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'cross-device.png'), Buffer.alloc(2 * 1024 * 1024, 1));
    upsertStorageSettings(userId, 1, archiveRoot);

    const result = await runArchive(userId);
    expect(result).not.toBeNull();
    expect(result!.moved).toBe(1);
    expect(existsSync(join(archiveRoot, 'cross-device.png'))).toBe(true);
    expect(existsSync(join(dir, 'cross-device.png'))).toBe(false);
  });
});
