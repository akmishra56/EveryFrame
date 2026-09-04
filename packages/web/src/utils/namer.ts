// Mirrors packages/server/src/capture/namer.ts and CaptionRenderer.ts for live preview only.
// The server is the source of truth for the actual filenames/captions it sends.

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function sanitize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatTimestamp(date: Date): string {
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate()), pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join(
    '_',
  );
}

export function renderCaption(template: string, label: string, date: Date): string {
  return template.replace(/\{label\}/g, label).replace(/\{time\}/g, formatTime(date)).replace(/\{date\}/g, formatDate(date));
}
