import { describe, expect, it } from 'vitest';
import { renderCaption } from '../src/capture/CaptionRenderer.js';

describe('renderCaption', () => {
  const fixed = new Date(2026, 8, 4, 14, 30, 5); // 2026-09-04 14:30:05

  it('substitutes label, time, and date tokens', () => {
    const out = renderCaption('{label} generated at {time} on {date}', 'localhost-3000', fixed);
    expect(out).toBe('localhost-3000 generated at 14:30:05 on 2026-09-04');
  });

  it('supports a template that repeats a token', () => {
    const out = renderCaption('{label} - {label}', 'dup', fixed);
    expect(out).toBe('dup - dup');
  });

  it('leaves the template unchanged if it has no tokens', () => {
    expect(renderCaption('static caption', 'ignored', fixed)).toBe('static caption');
  });
});
