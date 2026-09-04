import { mkdtempSync, rmSync, writeFileSync, utimesSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

process.env.EVERYFRAME_DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

// Must be set before src/storage/ArchiveService.ts is evaluated (it reads this
// env var once, at module load, into a top-level constant) - hence setting it
// here at top level, synchronously, before the dynamic import below, rather
// than in a beforeAll (whose body runs after the module graph is already loaded).
const capturesRoot = mkdtempSync(join(tmpdir(), 'everyframe-captures-'));
const archiveRoot = mkdtempSync(join(tmpdir(), 'everyframe-archive-'));
process.env.EVERYFRAME_CAPTURES_DIR = capturesRoot;

afterAll(() => {
  rmSync(capturesRoot, { recursive: true, force: true });
  rmSync(archiveRoot, { recursive: true, force: true });
});

const { getUsageMb, runArchive } = await import('../src/storage/ArchiveService.js');
const { upsertStorageSettings } = await import('../src/db/storageSettingsRepo.js');
const { listArchiveEvents } = await import('../src/db/archiveEventsRepo.js');
const { createUser } = await import('../src/db/usersRepo.js');
const { hashPassword } = await import('../src/auth/password.js');

const USER_ID = createUser('archive-test@example.com', await hashPassword('correct-horse-battery-staple'), 'Archive Test').id;

function userDir(): string {
  return join(capturesRoot, String(USER_ID));
}

function writeFakeCapture(name: string, sizeBytes: number, ageMinutesAgo: number): void {
  const dir = userDir();
  writeFileSync(join(dir, name), Buffer.alloc(sizeBytes, 1));
  const mtime = new Date(Date.now() - ageMinutesAgo * 60_000);
  utimesSync(join(dir, name), mtime, mtime);
}

describe('ArchiveService', () => {
  afterEach(() => {
    rmSync(userDir(), { recursive: true, force: true });
  });

  it('reports zero usage when nothing has been captured yet', async () => {
    expect(await getUsageMb(USER_ID)).toBe(0);
  });

  it('is a no-op when no archive_path is configured', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(userDir(), { recursive: true });
    writeFakeCapture('a.png', 2 * 1024 * 1024, 10);
    upsertStorageSettings(USER_ID, 1, null); // 1 MB threshold but no destination

    const result = await runArchive(USER_ID);
    expect(result).toBeNull();
    expect(readdirSync(userDir())).toHaveLength(1); // nothing moved
  });

  it('is a no-op when usage is already under the threshold', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(userDir(), { recursive: true });
    writeFakeCapture('a.png', 1024, 10);
    upsertStorageSettings(USER_ID, 100, archiveRoot);

    const result = await runArchive(USER_ID);
    expect(result).toBeNull();
  });

  it('moves the oldest files first until back under the threshold', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(userDir(), { recursive: true });
    // 3 files, 2 MB each, threshold 3 MB -> must move the two oldest to get under
    writeFakeCapture('oldest.png', 2 * 1024 * 1024, 30);
    writeFakeCapture('middle.png', 2 * 1024 * 1024, 20);
    writeFakeCapture('newest.png', 2 * 1024 * 1024, 10);
    upsertStorageSettings(USER_ID, 3, archiveRoot);

    const result = await runArchive(USER_ID);
    expect(result).not.toBeNull();
    expect(result!.moved).toBe(2);
    expect(result!.destinationPath).toBe(archiveRoot);

    const remaining = readdirSync(userDir());
    expect(remaining).toEqual(['newest.png']);

    const archived = readdirSync(archiveRoot);
    expect(archived.sort()).toEqual(['middle.png', 'oldest.png']);

    const history = listArchiveEvents(USER_ID);
    expect(history[0].file_count).toBe(2);
  });

});
