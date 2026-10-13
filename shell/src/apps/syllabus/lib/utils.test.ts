import { describe, it, expect } from 'vitest';
import { isoAtTime, dueDateISO, localDateISO, localTimeHHMM, addDaysISO } from './utils';

/* Civil-date correctness — dueAt is stored as a UTC instant produced by
 * isoAtTime(), but the folio reasons about the local civil day. Slicing the
 * '…T…Z' prefix lands a day late anywhere behind UTC; these tests pin the
 * local-time conversion every view now uses. */

describe('civil-date conversion', () => {
  it('round-trips a local 23:59 deadline through UTC without losing the day', () => {
    const dueAt = isoAtTime('2026-10-20', '23:59');
    expect(dueAt.endsWith('Z')).toBe(true);
    expect(dueDateISO(dueAt)).toBe('2026-10-20');
  });

  it('reads naive local strings and Z-instants alike', () => {
    expect(dueDateISO('2027-03-04T17:00')).toBe('2027-03-04');
    expect(dueDateISO(isoAtTime('2027-03-04', '17:00'))).toBe('2027-03-04');
  });

  it('localDateISO gives the local civil day of a true instant', () => {
    const ts = new Date(2026, 9, 20, 22, 30).toISOString(); // Oct 20, 22:30 local
    expect(localDateISO(ts)).toBe('2026-10-20');
  });

  it('localTimeHHMM recovers wall-clock time from an instant', () => {
    const ts = new Date(2026, 0, 5, 9, 7).toISOString(); // Jan 5, 09:07 local
    expect(localTimeHHMM(ts)).toBe('09:07');
  });

  it('weekly recurrence lands on the same weekday and wall clock', () => {
    const dueAt = isoAtTime('2026-10-20', '23:59');
    const next = isoAtTime(addDaysISO(dueDateISO(dueAt), 7), localTimeHHMM(dueAt));
    expect(dueDateISO(next)).toBe('2026-10-27');
    expect(localTimeHHMM(next)).toBe('23:59');
  });
});
