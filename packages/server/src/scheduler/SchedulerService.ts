import { logError } from '../activity/ActivityLogService.js';
import { CdpConnectionError, TargetNotFoundError } from '../cdp/targets.js';
import { captureFrame, deliverFrame } from '../capture/DeliveryService.js';
import { buildFilename } from '../capture/namer.js';
import { getRawForUser } from '../config/ConfigService.js';
import { decryptSecret } from '../crypto/secretBox.js';
import type { ConfigRow } from '../db/configRepo.js';
import { insertCaptureLog, updateCaptureLogStatus } from '../db/captureLogRepo.js';
import { checkThreshold } from '../storage/ArchiveService.js';
import { sendMessage } from '../telegram/TelegramClient.js';
import { broadcastToUser } from '../ws/log.js';
import { isWithinSchedule } from './scheduleWindow.js';

export class NoConfigError extends Error {
  constructor() {
    super('Save a capture configuration before starting.');
  }
}

interface JobRuntimeState {
  intervalId: NodeJS.Timeout;
  intervalSeconds: number;
  lastCaptureAt: string | null;
  lastStatus: 'sent' | 'failed' | null;
  nextTickAt: string;
  consecutiveFailures: number;
}

interface PausedInfo {
  reason: string;
  pausedAt: string;
}

const activeJobs = new Map<number, JobRuntimeState>();
const pausedJobs = new Map<number, PausedInfo>();

function sanitizeCaptureError(err: unknown): string {
  if (err instanceof TargetNotFoundError || err instanceof CdpConnectionError) return err.message;
  return 'Screenshot capture failed.';
}

/** After N consecutive failed ticks, stop the job and alert the user via Telegram (best-effort) - an unattended job that keeps silently failing is worse than one that stops and says why. threshold <= 0 disables this. */
async function maybeAutoPause(userId: number, config: ConfigRow, job: JobRuntimeState, lastError: string): Promise<void> {
  const threshold = config.failure_alert_threshold;
  if (threshold <= 0 || job.consecutiveFailures < threshold) return;

  stop(userId);
  const pausedAt = new Date().toISOString();
  pausedJobs.set(userId, { reason: lastError, pausedAt });
  logError(userId, `Capture auto-paused after ${threshold} consecutive failures.`, lastError);

  try {
    const botToken = decryptSecret(config.bot_token_encrypted);
    await sendMessage(
      botToken,
      config.channel_id,
      `⚠️ EveryFrame paused capturing "${config.tab_display_name}" after ${threshold} consecutive failures.\nLast error: ${lastError}\nOpen EveryFrame to fix the issue and resume.`,
    );
  } catch {
    // Best-effort - if Telegram itself is the failure mode, this alert can't land anyway.
    // The pause and the reason are still recorded locally (activity log + capture status).
  }
}

async function runTick(userId: number): Promise<void> {
  const config = getRawForUser(userId);
  if (!config) return; // config was deleted mid-run - nothing to do

  const now = new Date();
  if (!isWithinSchedule(config, now)) return; // outside window/day/date-range - no-op, not a failure

  const filename = buildFilename(config.name_pattern, now);
  const logId = insertCaptureLog(config.id, userId, filename, 'sending');
  broadcastToUser(userId, { id: logId, filename, status: 'sending', capturedAt: now.toISOString() });

  const job = activeJobs.get(userId);

  let filePath: string;
  try {
    filePath = (await captureFrame(userId, config, now)).filePath;
  } catch (err) {
    const message = sanitizeCaptureError(err);
    updateCaptureLogStatus(logId, 'failed', message);
    if (job) {
      job.lastStatus = 'failed';
      job.lastCaptureAt = now.toISOString();
      job.consecutiveFailures += 1;
    }
    broadcastToUser(userId, { id: logId, filename, status: 'failed', error: message });
    if (job) await maybeAutoPause(userId, config, job, message);
    return;
  }

  let result = await deliverFrame(config, filePath, now);
  if (!result.ok) {
    result = await deliverFrame(config, filePath, now); // one immediate retry, same captured frame
  }

  const status = result.ok ? 'sent' : 'failed';
  const errorMessage = result.ok ? null : (result.errorDescription ?? 'Delivery failed.');
  updateCaptureLogStatus(logId, status, errorMessage);
  if (job) {
    job.lastStatus = status;
    job.lastCaptureAt = now.toISOString();
    job.consecutiveFailures = status === 'sent' ? 0 : job.consecutiveFailures + 1;
  }
  broadcastToUser(userId, { id: logId, filename, status, error: errorMessage });

  // A file was written either way (send succeeded or failed after retry) - check
  // storage regardless of delivery outcome, per architecture.md §7.2.
  await checkThreshold(userId);

  if (status === 'failed' && job) await maybeAutoPause(userId, config, job, errorMessage ?? 'Delivery failed.');
}

/** Idempotent - calling start() on an already-running job is a no-op. Also clears any prior auto-pause, since a fresh start is the user's resume action. */
export function start(userId: number): void {
  pausedJobs.delete(userId);
  if (activeJobs.has(userId)) return;
  const config = getRawForUser(userId);
  if (!config) throw new NoConfigError();

  const intervalMs = config.interval_seconds * 1000;
  const job: JobRuntimeState = {
    intervalId: setInterval(() => {
      const current = activeJobs.get(userId);
      if (current) current.nextTickAt = new Date(Date.now() + intervalMs).toISOString();
      // runTick handles and logs its own expected failures; this catch only
      // guarantees a genuinely unexpected throw here can never kill the interval
      // timer itself - it still gets a sanitized activity-log entry.
      runTick(userId).catch(() => {
        logError(userId, 'Unexpected scheduler error - this capture was skipped.');
      });
    }, intervalMs),
    intervalSeconds: config.interval_seconds,
    lastCaptureAt: null,
    lastStatus: null,
    nextTickAt: new Date(Date.now() + intervalMs).toISOString(),
    consecutiveFailures: 0,
  };
  activeJobs.set(userId, job);
}

export function stop(userId: number): void {
  const job = activeJobs.get(userId);
  if (job) {
    clearInterval(job.intervalId);
    activeJobs.delete(userId);
  }
}

export interface CaptureStatus {
  running: boolean;
  lastCaptureAt: string | null;
  lastStatus: 'sent' | 'failed' | null;
  nextTickAt: string | null;
  /** True when the scheduler stopped itself after too many consecutive failures (see failureAlertThreshold). Cleared by calling start() again. */
  paused: boolean;
  pauseReason: string | null;
}

export function getStatus(userId: number): CaptureStatus {
  const job = activeJobs.get(userId);
  const paused = pausedJobs.get(userId);
  return {
    running: Boolean(job),
    lastCaptureAt: job?.lastCaptureAt ?? null,
    lastStatus: job?.lastStatus ?? null,
    nextTickAt: job?.nextTickAt ?? null,
    paused: Boolean(paused),
    pauseReason: paused?.reason ?? null,
  };
}
