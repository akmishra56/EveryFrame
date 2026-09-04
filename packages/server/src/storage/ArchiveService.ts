import { copyFile, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logError } from '../activity/ActivityLogService.js';
import { insertArchiveEvent } from '../db/archiveEventsRepo.js';
import { getOrDefaultStorageSettings } from '../db/storageSettingsRepo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAPTURES_ROOT = process.env.EVERYFRAME_CAPTURES_DIR ?? join(__dirname, '..', '..', 'captures');

export class ArchiveDestinationError extends Error {}

export interface ArchiveRunResult {
  moved: number;
  totalSizeMb: number;
  destinationPath: string;
}

interface CaptureFile {
  name: string;
  path: string;
  size: number;
  mtimeMs: number;
}

function userCaptureDir(userId: number): string {
  return join(CAPTURES_ROOT, String(userId));
}

async function listCaptureFiles(userId: number): Promise<CaptureFile[]> {
  const dir = userCaptureDir(userId);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const files: CaptureFile[] = [];
  for (const name of entries) {
    const path = join(dir, name);
    const info = await stat(path);
    if (info.isFile()) files.push({ name, path, size: info.size, mtimeMs: info.mtimeMs });
  }
  return files;
}

export async function getUsageMb(userId: number): Promise<number> {
  const files = await listCaptureFiles(userId);
  return files.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024);
}

/** rename() fails with EXDEV across filesystems/drives (common when archiving to an external drive) - fall back to copy+delete. */
async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      await copyFile(src, dest);
      await unlink(src);
    } else {
      throw err;
    }
  }
}

/** Moves the oldest captures out until usage is back under the configured threshold. No-op if no archive_path is set, or nothing needs moving. */
export async function runArchive(userId: number): Promise<ArchiveRunResult | null> {
  const settings = getOrDefaultStorageSettings(userId);
  if (!settings.archive_path) return null;

  const files = await listCaptureFiles(userId);
  if (files.length === 0) return null;

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const thresholdBytes = settings.threshold_mb * 1024 * 1024;
  if (totalBytes <= thresholdBytes) return null;

  try {
    await mkdir(settings.archive_path, { recursive: true });
  } catch (err) {
    throw new ArchiveDestinationError(`Could not reach archive destination: ${(err as Error).message}`);
  }

  files.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first

  let remainingBytes = totalBytes;
  let movedBytes = 0;
  let movedCount = 0;

  for (const file of files) {
    if (remainingBytes <= thresholdBytes) break;
    await moveFile(file.path, join(settings.archive_path, file.name));
    remainingBytes -= file.size;
    movedBytes += file.size;
    movedCount++;
  }

  if (movedCount === 0) return null;

  const totalSizeMb = Math.round(movedBytes / (1024 * 1024));
  insertArchiveEvent(userId, movedCount, totalSizeMb, settings.archive_path);

  return { moved: movedCount, totalSizeMb, destinationPath: settings.archive_path };
}

/** Called after a capture attempt writes a file (architecture.md §7.2), win or lose on delivery. Never lets an archive failure look like a capture failure. */
export async function checkThreshold(userId: number): Promise<void> {
  try {
    await runArchive(userId);
  } catch (err) {
    // Never let an archive failure surface as a capture failure - log it separately.
    const message = err instanceof ArchiveDestinationError ? err.message : 'Archive run failed.';
    logError(userId, message);
  }
}
