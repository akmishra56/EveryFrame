import { describe, expect, it } from 'vitest';
import { buildFilename, formatDate, formatTime, formatTimestamp, sanitize } from '../src/capture/namer.js';

describe('sanitize', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(sanitize('Grafana — Prod Dashboard')).toBe('grafana-prod-dashboard');
  });

  it('collapses runs of special characters into one hyphen', () => {
    expect(sanitize('foo!!!bar___baz')).toBe('foo-bar-baz');
  });

  it('strips leading and trailing special characters', () => {
    expect(sanitize('  --Weird Name--  ')).toBe('weird-name');
  });

  it('handles unicode/accented characters by dropping them to hyphens', () => {
    expect(sanitize('Café Münü')).toBe('caf-m-n');
  });

  it('leaves already-clean names untouched', () => {
    expect(sanitize('localhost-3000')).toBe('localhost-3000');
  });

  it('handles a purely numeric or alphanumeric name', () => {
    expect(sanitize('Build #482')).toBe('build-482');
  });

  it('collapses to empty string for input with no alphanumerics', () => {
    expect(sanitize('###')).toBe('');
  });
});

describe('formatDate / formatTime / formatTimestamp', () => {
  const fixed = new Date(2026, 8, 4, 14, 5, 9); // 2026-09-04 14:05:09 local

  it('formats the date as YYYY-MM-DD, zero-padded', () => {
    expect(formatDate(fixed)).toBe('2026-09-04');
  });

  it('formats the time as HH:MM:SS, zero-padded', () => {
    expect(formatTime(fixed)).toBe('14:05:09');
  });

  it('formats the filename timestamp as YYYY_MM_DD_HH_MM_SS', () => {
    expect(formatTimestamp(fixed)).toBe('2026_09_04_14_05_09');
  });

  it('zero-pads single-digit month, day, hour, minute, second', () => {
    const early = new Date(2026, 0, 5, 3, 2, 1); // Jan 5, 03:02:01
    expect(formatTimestamp(early)).toBe('2026_01_05_03_02_01');
  });
});

describe('buildFilename', () => {
  it('matches the exact contract: <sanitized-name>_<timestamp>.png', () => {
    const fixed = new Date(2026, 8, 4, 14, 30, 0);
    expect(buildFilename('Grafana — Prod Dashboard', fixed)).toBe(
      'grafana-prod-dashboard_2026_09_04_14_30_00.png',
    );
  });

  it('falls back to an empty base name if the pattern has no alphanumerics', () => {
    const fixed = new Date(2026, 8, 4, 14, 30, 0);
    expect(buildFilename('###', fixed)).toBe('_2026_09_04_14_30_00.png');
  });
});
