import { describe, expect, it } from 'vitest';
import { bandFor } from './bands';
import { dayState, exceptionFor, isPausedOn, routineWeek, weeklyScorecard } from './register';
import type { DayException, Entry, Experiment, Routine } from './types';

const TODAY = '2026-10-11'; // a Sunday

function mkRoutine(patch: Partial<Routine> = {}): Routine {
  return {
    id: 'rtn_1',
    name: 'Focus',
    measure: 'check',
    target: { perWeek: 3 },
    weekdays: [1, 3, 5], // Mon/Wed/Fri
    accent: 'indigo',
    status: 'active',
    createdAt: '2026-09-14T12:00:00Z',
    ...patch,
  };
}

function entry(routineId: string, date: string, value = 1, patch: Partial<Entry> = {}): Entry {
  return { id: `ent_${routineId}_${date}_${value}_${Math.random().toString(36).slice(2, 6)}`, routineId, date, value, source: 'manual', createdAt: '2026-10-11T00:00:00Z', ...patch };
}

const NO_EXC: Record<string, DayException> = {};
const NO_EXP: Record<string, Experiment> = {};

describe('dayState', () => {
  const r = mkRoutine();

  it('marks entries by shape', () => {
    const e = { a: entry(r.id, '2026-10-05') }; // Monday
    expect(dayState(r, '2026-10-05', e, NO_EXC, TODAY)).toBe('full');
    const m = { a: entry(r.id, '2026-10-05', 1, { isMinimum: true }) };
    expect(dayState(r, '2026-10-05', m, NO_EXC, TODAY)).toBe('minimum');
  });

  it('missed vs unscheduled vs future', () => {
    expect(dayState(r, '2026-10-07', {}, NO_EXC, TODAY)).toBe('missed'); // Wed, past
    expect(dayState(r, '2026-10-10', {}, NO_EXC, TODAY)).toBe('unscheduled'); // Sat, not a weekday
    expect(dayState(r, '2026-10-12', {}, NO_EXC, TODAY)).toBe('future'); // tomorrow
  });

  it('an entry on an unscheduled day still counts', () => {
    const e = { a: entry(r.id, '2026-10-10') }; // Saturday — not scheduled
    expect(dayState(r, '2026-10-10', e, NO_EXC, TODAY)).toBe('full');
  });

  it('exception and pause take their shapes', () => {
    const exc: Record<string, DayException> = {
      x: { id: 'x', routineId: r.id, date: '2026-10-07', kind: 'travel', createdAt: '2026-10-07T00:00:00Z' },
    };
    expect(dayState(r, '2026-10-07', {}, exc, TODAY)).toBe('exception');
    const paused = mkRoutine({ pauses: [{ from: '2026-10-01', to: '2026-10-10' }] });
    expect(dayState(paused, '2026-10-05', {}, NO_EXC, TODAY)).toBe('paused');
    expect(isPausedOn(paused, '2026-10-10')).toBe(false); // 'to' is exclusive — resume day counts again
    expect(exceptionFor(exc, r.id, '2026-10-07')?.kind).toBe('travel');
  });
});

describe('routineWeek + scorecard', () => {
  const r = mkRoutine(); // M/W/F, target 3
  const weekStart = '2026-10-05';

  it('hits when all scheduled days are stamped', () => {
    const entries: Record<string, Entry> = {
      a: entry(r.id, '2026-10-05'),
      b: entry(r.id, '2026-10-07'),
      c: entry(r.id, '2026-10-09'),
    };
    const w = routineWeek(r, weekStart, entries, NO_EXC, '2026-10-12');
    expect(w.availableDays).toBe(3);
    expect(w.actual).toBe(3);
    expect(w.effectiveTarget).toBe(3);
    expect(w.hit).toBe(true);
    expect(w.exempt).toBe(false);
  });

  it('misses honestly without erasing anything', () => {
    const entries = { a: entry(r.id, '2026-10-05') };
    const w = routineWeek(r, weekStart, entries, NO_EXC, '2026-10-12');
    expect(w.hit).toBe(false);
    expect(w.actual).toBe(1);
  });

  it('exceptions exempt the day and shrink the denominator, not the record', () => {
    const exc: Record<string, DayException> = {
      x: { id: 'x', routineId: r.id, date: '2026-10-07', kind: 'exam', createdAt: '2026-10-07T00:00:00Z' },
    };
    const entries = { a: entry(r.id, '2026-10-05') };
    const w = routineWeek(r, weekStart, entries, exc, '2026-10-12');
    expect(w.availableDays).toBe(2); // Mon + Fri; Wed excused
    expect(w.effectiveTarget).toBe(2);
    expect(w.exceptionDays).toBe(1);
    expect(w.hit).toBe(false); // still needs Friday
    const entries2 = { ...entries, b: entry(r.id, '2026-10-09') };
    expect(routineWeek(r, weekStart, entries2, exc, '2026-10-12').hit).toBe(true);
  });

  it('a fully-excepted week is exempt — no judgment recorded', () => {
    const exc: Record<string, DayException> = {
      x: { id: 'x', routineId: 'all', date: '2026-10-05', kind: 'travel', createdAt: '2026-10-05T00:00:00Z' },
      y: { id: 'y', routineId: 'all', date: '2026-10-07', kind: 'travel', createdAt: '2026-10-05T00:00:00Z' },
      z: { id: 'z', routineId: 'all', date: '2026-10-09', kind: 'travel', createdAt: '2026-10-05T00:00:00Z' },
    };
    const w = routineWeek(r, weekStart, {}, exc, '2026-10-12');
    expect(w.exempt).toBe(true);
    expect(w.hit).toBe(false);
    const card = weeklyScorecard([r], weekStart, {}, exc, '2026-10-12');
    expect(card.scored).toBe(0);
    expect(card.hitRate).toBeNull();
  });

  it('amount routines score on weekly totals', () => {
    const q = mkRoutine({ measure: 'quantity', unit: 'cards', target: { perWeek: 90, perDay: 30 } });
    const entries: Record<string, Entry> = {
      a: entry(q.id, '2026-10-05', 30),
      b: entry(q.id, '2026-10-08', 40), // Thursday — unscheduled but still counts
      c: entry(q.id, '2026-10-09', 25),
    };
    const w = routineWeek(q, weekStart, entries, NO_EXC, '2026-10-12');
    expect(w.actual).toBe(95);
    expect(w.hit).toBe(true);
    expect(w.partialDays).toBe(1); // 25 < the 30/day bar
  });

  it('creation-week clamp: no judgment before the routine existed', () => {
    const fresh = mkRoutine({ createdAt: '2026-10-08T12:00:00Z' }); // born Thursday
    const entries = { a: entry(fresh.id, '2026-10-09') };
    const w = routineWeek(fresh, weekStart, entries, NO_EXC, '2026-10-12');
    expect(w.availableDays).toBe(1); // only Friday existed for it
    expect(w.effectiveTarget).toBe(1);
    expect(w.hit).toBe(true);
  });
});

describe('bands', () => {
  const r = mkRoutine();

  it('established after 3 straight hit weeks', () => {
    const entries: Record<string, Entry> = {};
    for (const [i, dates] of [
      ['2026-09-14', '2026-09-16', '2026-09-18'],
      ['2026-09-21', '2026-09-23', '2026-09-25'],
      ['2026-09-28', '2026-09-30', '2026-10-02'],
    ].entries()) {
      dates.forEach((d, j) => (entries[`w${i}d${j}`] = entry(r.id, d)));
    }
    const b = bandFor(r, entries, NO_EXC, NO_EXP, TODAY);
    expect(b.band).toBe('established');
    expect(b.hitsAtTail).toBe(3);
  });

  it('building while history is short', () => {
    const young = mkRoutine({ createdAt: '2026-10-05T12:00:00Z' });
    const entries = { a: entry(young.id, '2026-10-05') };
    expect(bandFor(young, entries, NO_EXC, NO_EXP, TODAY).band).toBe('building');
  });

  it('recovery after two straight missed weeks on an older routine', () => {
    const entries: Record<string, Entry> = {
      // a hit in its first week, then two empty weeks in a row
      a: entry(r.id, '2026-09-14'),
      b: entry(r.id, '2026-09-16'),
      c: entry(r.id, '2026-09-18'),
    };
    const b = bandFor(r, entries, NO_EXC, NO_EXP, TODAY);
    expect(b.band).toBe('recovery');
    expect(b.missesAtTail).toBe(2);
    expect(b.suggestMinimum).toBe(false); // no minimum defined
    const withMin = mkRoutine({ minimum: { label: 'open the deck' } });
    expect(bandFor(withMin, entries, NO_EXC, NO_EXP, TODAY).suggestMinimum).toBe(true);
  });

  it('paused and experimenting short-circuit judgment', () => {
    const paused = mkRoutine({ status: 'paused' });
    expect(bandFor(paused, {}, NO_EXC, NO_EXP, TODAY).band).toBe('paused');
    const exp: Record<string, Experiment> = {
      e1: { id: 'e1', routineId: r.id, hypothesis: 'h', change: 'c', startDate: '2026-10-05', endDate: '2026-10-18', status: 'active', createdAt: '2026-10-05T00:00:00Z' },
    };
    expect(bandFor(r, {}, NO_EXC, exp, TODAY).band).toBe('experimenting');
  });
});
