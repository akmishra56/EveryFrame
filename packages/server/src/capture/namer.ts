function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Lowercase, non-alphanumeric runs -> single hyphen, no leading/trailing hyphen. */
export function sanitize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** YYYY-MM-DD, for captions. */
export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** HH:MM:SS, for captions. */
export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** YYYY_MM_DD_HH_MM_SS - the exact filename timestamp contract from the brief. */
export function formatTimestamp(date: Date): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('_');
}

/** <sanitized-name>_<YYYY_MM_DD_HH_MM_SS>.png */
export function buildFilename(namePattern: string, date: Date): string {
  return `${sanitize(namePattern)}_${formatTimestamp(date)}.png`;
}
