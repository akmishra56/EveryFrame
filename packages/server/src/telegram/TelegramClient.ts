import { readFile } from 'node:fs/promises';

export interface TelegramSendResult {
  ok: boolean;
  errorDescription?: string;
}

/** Strips the bot token out of any string before it can reach a log or an API response. */
function redactToken(botToken: string, text: string): string {
  return text.split(botToken).join('[REDACTED]');
}

export async function sendPhoto(
  botToken: string,
  channelId: string,
  filePath: string,
  caption?: string,
): Promise<TelegramSendResult> {
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch (err) {
    return { ok: false, errorDescription: `Could not read the captured file: ${(err as Error).message}` };
  }

  const form = new FormData();
  form.set('chat_id', channelId);
  if (caption) form.set('caption', caption);
  form.set('photo', new Blob([new Uint8Array(buffer)], { type: 'image/png' }), 'frame.png');

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;

    if (!res.ok || !json?.ok) {
      const raw = json?.description ?? `Telegram returned HTTP ${res.status}`;
      return { ok: false, errorDescription: redactToken(botToken, raw) };
    }
    return { ok: true };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, errorDescription: redactToken(botToken, raw) };
  }
}

/** Plain text message - used for out-of-band alerts (e.g. "capture auto-paused"), not for frame delivery. */
export async function sendMessage(botToken: string, channelId: string, text: string): Promise<TelegramSendResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: channelId, text }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;

    if (!res.ok || !json?.ok) {
      const raw = json?.description ?? `Telegram returned HTTP ${res.status}`;
      return { ok: false, errorDescription: redactToken(botToken, raw) };
    }
    return { ok: true };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, errorDescription: redactToken(botToken, raw) };
  }
}
