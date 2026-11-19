import { describe, expect, it } from 'vitest';
import { parseQuick } from './QuickAdd';
import type { Course } from '../lib/types';

const courses: Course[] = [
  { id: 'c1', code: 'MATH 241', name: 'Calculus IV' } as Course,
  { id: 'c2', code: 'STAT 220', name: 'Statistics' } as Course,
];

function isoNDaysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('parseQuick', () => {
  it('parses @course #type due:+Nd ~min', () => {
    const p = parseQuick('PS4 @math241 #assignment due:+7 ~120m', courses);
    expect(p.title).toBe('PS4');
    expect(p.course?.code).toBe('MATH 241');
    expect(p.type).toBe('assignment');
    expect(p.due).toBe(isoNDaysAhead(7));
    expect(p.minutes).toBe(120);
  });

  it('parses hour estimates without treating them as minutes', () => {
    const fourHours = parseQuick('Read chapter @math241 ~4h', courses);
    expect(fourHours.minutes).toBe(240);
    expect(fourHours.title).toBe('Read chapter');
    const ninetyMinutes = parseQuick('Review notes @math241 ~1.5h', courses);
    expect(ninetyMinutes.minutes).toBe(90);
    expect(ninetyMinutes.title).toBe('Review notes');
  });

  it('keeps bare exclamation punctuation in the title', () => {
    expect(parseQuick('What a result! @math241 ~45m', courses).title).toBe('What a result!');
  });

  it('resolves due:today and due:tomorrow', () => {
    expect(parseQuick('x @math241 due:today', courses).due).toBe(isoNDaysAhead(0));
    expect(parseQuick('x @math241 due:tomorrow', courses).due).toBe(isoNDaysAhead(1));
  });

  it('resolves weekday names to the next occurrence', () => {
    const today = new Date().getDay();
    const nextMonday = ((1 - today + 7) % 7) || 7;
    expect(parseQuick('x @math241 due:monday', courses).due).toBe(isoNDaysAhead(nextMonday));
    expect(parseQuick('x @math241 due:mon', courses).due).toBe(isoNDaysAhead(nextMonday));
    expect(parseQuick('x @math241 due:thurs', courses).due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('a weekday token never survives into the title', () => {
    const p = parseQuick('Lab writeup @stat220 due:friday', courses);
    expect(p.title).not.toContain('due:');
    expect(p.title).toBe('Lab writeup');
    expect(p.course?.code).toBe('STAT 220');
  });

  it('an unrecognized due: token stays in the title rather than corrupting dates', () => {
    const p = parseQuick('Read about due:processes @math241', courses);
    expect(p.title).toBe('Read about due:processes');
  });
});
