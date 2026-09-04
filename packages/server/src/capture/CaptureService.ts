import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPageByTargetId } from '../cdp/targets.js';
import { buildFilename } from './namer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAPTURES_ROOT = process.env.EVERYFRAME_CAPTURES_DIR ?? join(__dirname, '..', '..', 'captures');

export interface CaptureResult {
  filename: string;
  filePath: string;
}

/** Screenshots the exact target tab and writes it to captures/<user_id>/<name>_<timestamp>.png. */
export async function captureScreenshot(
  userId: number,
  targetId: string,
  namePattern: string,
  now: Date = new Date(),
): Promise<CaptureResult> {
  const page = await getPageByTargetId(targetId);
  const buffer = await page.screenshot({ type: 'png' });

  const filename = buildFilename(namePattern, now);
  const userDir = join(CAPTURES_ROOT, String(userId));
  await mkdir(userDir, { recursive: true });
  const filePath = join(userDir, filename);
  await writeFile(filePath, buffer);

  return { filename, filePath };
}
