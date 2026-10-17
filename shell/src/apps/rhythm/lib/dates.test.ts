import { describe, expect, it } from 'vitest';
import {
  addDaysISO,
  dateOfInstant,
  diffDaysISO,
  fmtDay,
  fmtMinutes,
  fmtWeekRange,
  parseISO,
  todayISO,
  weekDatesISO,
  weekStartISO,
  weekdayOf,
} from './dates';

describe('civil dates', () => {
  it('parses and rejects malformed dates', () => {
    expect(parseISO('2026-10-11')).toEqual({ y: 2026, m: 10, d: 11 });
    expect(parseISO('2026-13-01')).toBeNull();
    expect(parseISO('10-11-2026')).toBeNull();
    expect(parseISO('2026-10-11T00:00:00Z')).toBeNull();
  });

  it('addDays crosses month and year boundaries', () => {
    expect(addDaysISO('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysISO('2024-02-28', 1)).toBe('2024-02-29'); // leap year
    expect(addDaysISO('2026-10-11', 0)).toBe('2026-10-11');
  });

  it('diffDays is symmetric and DST-safe', () => {
    expect(diffDaysISO('2026-10-11', '2026-10-04')).toBe(7);
    expect(diffDaysISO('2026-10-04', '2026-10-11')).toBe(-7);
    // US DST spring forward 2026-03-08; a week is still 7 civil days
    expect(diffDaysISO('2026-03-15', '2026-03-08')).toBe(7);
    expect(diffDaysISO('2026-11-08', '2026-11-01')).toBe(7); // fall back
  });

  it('weekdayOf matches known dates', () => {
    expect(weekdayOf('2026-10-11')).toBe(0); // Sunday
    expect(weekdayOf('2026-10-12')).toBe(1); // Monday
  });

  it('weekStartISO honors Monday and Sunday starts', () => {
    expect(weekStartISO('2026-10-11', 1)).toBe('2026-10-05'); // Sun → back to Mon
    expect(weekStartISO('2026-10-11', 0)).toBe('2026-10-11'); // Sun → itself
    expect(weekStartISO('2026-10-07', 1)).toBe('2026-10-05'); // Wed
    expect(weekStartISO('2026-10-05', 1)).toBe('2026-10-05'); // already Mon
  });

  it('weekDatesISO yields exactly 7 days starting on the boundary', () => {
    const wk = weekDatesISO('2026-10-08', 1);
    expect(wk).toHaveLength(7);
    expect(wk[0]).toBe('2026-10-05');
    expect(wk[6]).toBe('2026-10-11');
  });

  it('dateOfInstant keeps the local civil date, not the UTC one', () => {
    // 11pm local on Oct 10 must not roll to Oct 11
    const iso = dateOfInstant('2026-10-10T23:30:00');
    const expected = todayISO(new Date('2026-10-10T23:30:00'));
    expect(iso).toBe(expected);
    expect(iso).not.toBe('2026-10-11'); // unless the machine is in a far-eastern TZ this stays local
  });

  it('formats in the register voice', () => {
    expect(fmtDay('2026-10-11')).toBe('OCT 11');
    expect(fmtWeekRange('2026-10-05')).toBe('OCT 5 – 11');
    expect(fmtWeekRange('2026-10-26')).toBe('OCT 26 – NOV 1');
    expect(fmtMinutes(45)).toBe('45m');
    expect(fmtMinutes(60)).toBe('1h');
    expect(fmtMinutes(85)).toBe('1h 25m');
  });
});
