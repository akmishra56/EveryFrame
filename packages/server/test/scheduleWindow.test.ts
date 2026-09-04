import { describe, expect, it } from 'vitest';
import type { ConfigRow } from '../src/db/configRepo.js';
import { isWithinSchedule } from '../src/scheduler/scheduleWindow.js';

function fixture(overrides: Partial<ConfigRow> = {}): ConfigRow {
  return {
    id: 1,
    user_id: 1,
    tab_target_id: 'x',
    tab_display_name: 'x',
    interval_seconds: 60,
    name_pattern: 'x',
    start_time: '00:00',
    end_time: '23:59',
    active_days: JSON.stringify(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']),
    schedule_start_date: null,
    schedule_end_date: null,
    bot_token_encrypted: 'x',
    channel_id: 'x',
    caption_label: 'x',
    caption_template: 'x',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('isWithinSchedule', () => {
  // Wednesday 2026-09-02, 14:30
  const wednesdayAfternoon = new Date(2026, 8, 2, 14, 30);

  it('is true with default wide-open config', () => {
    expect(isWithinSchedule(fixture(), wednesdayAfternoon)).toBe(true);
  });

  it('respects an active-days list that excludes today', () => {
    const config = fixture({ active_days: JSON.stringify(['mon', 'tue']) });
    expect(isWithinSchedule(config, wednesdayAfternoon)).toBe(false);
  });

  it('respects an active-days list that includes today', () => {
    const config = fixture({ active_days: JSON.stringify(['wed']) });
    expect(isWithinSchedule(config, wednesdayAfternoon)).toBe(true);
  });

  it('is inside a normal same-day window', () => {
    const config = fixture({ start_time: '09:00', end_time: '17:00' });
    expect(isWithinSchedule(config, wednesdayAfternoon)).toBe(true);
  });

  it('is outside a normal same-day window before it opens', () => {
    const config = fixture({ start_time: '15:00', end_time: '17:00' });
    expect(isWithinSchedule(config, wednesdayAfternoon)).toBe(false);
  });

  it('is outside a normal same-day window after it closes', () => {
    const config = fixture({ start_time: '09:00', end_time: '10:00' });
    expect(isWithinSchedule(config, wednesdayAfternoon)).toBe(false);
  });

  it('handles a window that wraps past midnight - time falls in the late segment', () => {
    const config = fixture({ start_time: '22:00', end_time: '06:00' });
    const lateNight = new Date(2026, 8, 2, 23, 30);
    expect(isWithinSchedule(config, lateNight)).toBe(true);
  });

  it('handles a window that wraps past midnight - time falls in the early segment', () => {
    const config = fixture({ start_time: '22:00', end_time: '06:00' });
    const earlyMorning = new Date(2026, 8, 2, 3, 0);
    expect(isWithinSchedule(config, earlyMorning)).toBe(true);
  });

  it('handles a window that wraps past midnight - time falls outside both segments', () => {
    const config = fixture({ start_time: '22:00', end_time: '06:00' });
    expect(isWithinSchedule(config, wednesdayAfternoon)).toBe(false);
  });

  it('is true on the exact schedule_start_date', () => {
    const config = fixture({ schedule_start_date: '2026-09-02' });
    expect(isWithinSchedule(config, wednesdayAfternoon)).toBe(true);
  });

  it('is false before schedule_start_date', () => {
    const config = fixture({ schedule_start_date: '2026-09-03' });
    expect(isWithinSchedule(config, wednesdayAfternoon)).toBe(false);
  });

  it('is true on the exact schedule_end_date', () => {
    const config = fixture({ schedule_end_date: '2026-09-02' });
    expect(isWithinSchedule(config, wednesdayAfternoon)).toBe(true);
  });

  it('is false after schedule_end_date', () => {
    const config = fixture({ schedule_end_date: '2026-09-01' });
    expect(isWithinSchedule(config, wednesdayAfternoon)).toBe(false);
  });

  it('is true when inside an open date range', () => {
    const config = fixture({ schedule_start_date: '2026-08-01', schedule_end_date: '2026-12-31' });
    expect(isWithinSchedule(config, wednesdayAfternoon)).toBe(true);
  });
});
