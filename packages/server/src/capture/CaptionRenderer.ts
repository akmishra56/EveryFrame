import { formatDate, formatTime } from './namer.js';

/** Tokens: {label}, {time}, {date}. Reuses Namer's date/time formatting so captions and filenames stay consistent. */
export function renderCaption(template: string, label: string, date: Date): string {
  return template
    .replace(/\{label\}/g, label)
    .replace(/\{time\}/g, formatTime(date))
    .replace(/\{date\}/g, formatDate(date));
}
