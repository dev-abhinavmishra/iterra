import { describe, expect, it } from 'vitest';
import { importIdentity, parseSchedulePaste } from './schedulePaste';
import { dueDateISO, localTimeHHMM } from './utils';

describe('pasted course schedules', () => {
  const term = { startDate: '2026-11-12', endDate: '2027-04-15' };

  it('finds course details and parses date-first, title-first, and tabular assignments', () => {
    const { payload, skipped } = parseSchedulePaste([
      'BIO 201 — Cell Biology',
      'Course schedule',
      '2026-12-04 — Midterm',
      'Essay draft due March 11, 2027 at 5 p.m.',
      'Jan 7\tLab report',
      'Reading: Chapter 3\t04/10/2027 18:30',
    ].join('\n'), term);
    expect(skipped).toEqual([]);
    expect(payload).toMatchObject({ code: 'BIO 201', courseName: 'Cell Biology' });
    expect(payload.rows.map(row => [row.title, row.type, dueDateISO(row.dueAt), localTimeHHMM(row.dueAt), row.weight])).toEqual([
      ['Midterm', 'exam', '2026-12-04', '23:59', 0],
      ['Essay draft', 'assignment', '2027-03-11', '17:00', 0],
      ['Lab report', 'lab', '2027-01-07', '23:59', 0],
      ['Reading: Chapter 3', 'reading', '2027-04-10', '18:30', 0],
    ]);
  });

  it('reports ambiguous or invalid dates and protects against accidental rollover', () => {
    const { payload, skipped } = parseSchedulePaste([
      '2027-02-30 — Impossible quiz',
      'Group work Feb 3 or Feb 7',
      'Essay 3/4/27',
      'Reading due September 12',
      '2027-03-04T09:15 — Valid',
    ].join('\n'), term);
    expect(payload.rows.map(row => row.title)).toEqual(['Valid']);
    expect(skipped.map(row => row.line)).toEqual([1, 2, 3, 4]);
    expect(localTimeHHMM(payload.rows[0].dueAt)).toBe('09:15');
  });

  it('compares repeat entries by normalized title and local due date', () => {
    const { payload } = parseSchedulePaste('Jan 7 — LAB report\nlab   report due 2027-01-07 at noon\nJan 8 — Lab report', term);
    const [first, second, next] = payload.rows;
    expect(importIdentity(first)).toBe(importIdentity(second));
    expect(localTimeHHMM(second.dueAt)).toBe('12:00');
    expect(importIdentity(first)).not.toBe(importIdentity(next));
  });
});
