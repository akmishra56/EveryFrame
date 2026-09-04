import { decryptSecret } from '../crypto/secretBox.js';
import type { ConfigRow } from '../db/configRepo.js';
import { sendPhoto } from '../telegram/TelegramClient.js';
import { renderCaption } from './CaptionRenderer.js';
import { captureScreenshot, type CaptureResult } from './CaptureService.js';

export interface SendResult {
  ok: boolean;
  errorDescription?: string;
}

export interface DeliveryResult extends SendResult {
  filename: string;
}

/** Screenshots the configured tab. `name_pattern` (the user's editable name override), not `tab_display_name`, names the file. */
export async function captureFrame(userId: number, config: ConfigRow, now: Date = new Date()): Promise<CaptureResult> {
  return captureScreenshot(userId, config.tab_target_id, config.name_pattern, now);
}

/** Sends an already-captured file. Safe to call more than once for the same frame (retry). */
export async function deliverFrame(config: ConfigRow, filePath: string, now: Date = new Date()): Promise<SendResult> {
  const caption = renderCaption(config.caption_template, config.caption_label, now);
  const botToken = decryptSecret(config.bot_token_encrypted);
  return sendPhoto(botToken, config.channel_id, filePath, caption);
}

/** Capture + single send attempt, no retry - used by the test-send endpoint. The scheduler (phase 8) calls captureFrame/deliverFrame directly for its retry-once behavior. */
export async function captureAndSend(userId: number, config: ConfigRow, now: Date = new Date()): Promise<DeliveryResult> {
  const capture = await captureFrame(userId, config, now);
  const result = await deliverFrame(config, capture.filePath, now);
  return { filename: capture.filename, ok: result.ok, errorDescription: result.errorDescription };
}
