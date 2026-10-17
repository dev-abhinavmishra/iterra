import { describe, expect, it } from 'vitest';
import { entriesFromSource, intakeEvent, mappingMatches, newMapping, normalizeEvent } from './events';
import type { Routine, RoutineEvent } from './types';
import { nowISO } from './dates';

const routine: Routine = {
  id: 'rtn_1',
  name: 'Focus session',
  measure: 'check',
  target: { perWeek: 4 },
  weekdays: [1, 2, 3, 4, 5],
  accent: 'indigo',
  status: 'active',
  createdAt: nowISO(),
};

const durationRoutine: Routine = {
  ...routine,
  id: 'rtn_2',
  name: 'Deep work',
  measure: 'duration',
  unit: 'min',
};

const raw = {
  id: 'evt_1',
  type: 'timer.session.completed',
  occurredAt: '2026-10-10T20:00:00-05:00',
  sourceApp: 'timer',
  durationSeconds: 840,
  metrics: { reviewed: 32, correct: 27 },
};

describe('normalizeEvent', () => {
  it('accepts a well-formed event', () => {
    const r = normalizeEvent(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event.id).toBe('evt_1');
      expect(r.event.sourceApp).toBe('timer');
      expect(r.event.durationSeconds).toBe(840);
      expect(r.event.metrics?.reviewed).toBe(32);
      expect(r.event.receivedAt).toBeTruthy();
    }
  });

  it('rejects missing fields without throwing', () => {
    expect(normalizeEvent(null).ok).toBe(false);
    expect(normalizeEvent({}).ok).toBe(false);
    expect(normalizeEvent({ id: 'x' }).ok).toBe(false);
    expect(normalizeEvent({ id: 'x', type: 't', occurredAt: 'not-a-date' }).ok).toBe(false);
  });

  it('normalizes unknown sourceApp to other and drops junk metrics', () => {
    const r = normalizeEvent({ ...raw, sourceApp: 'my-cron', metrics: { good: 1, bad: 'x' } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event.sourceApp).toBe('other');
      expect(r.event.metrics).toEqual({ good: 1 });
    }
  });
});

describe('mappings', () => {
  it('matches exact and wildcard patterns', () => {
    const exact = newMapping('timer.session.completed', 'rtn_1');
    const wild = newMapping('timer.*', 'rtn_1');
    const other = newMapping('ink.focus.completed', 'rtn_1');
    expect(mappingMatches(exact, 'timer.session.completed')).toBe(true);
    expect(mappingMatches(exact, 'timer.other')).toBe(false);
    expect(mappingMatches(wild, 'timer.anything')).toBe(true);
    expect(mappingMatches(other, 'timer.session.completed')).toBe(false);
    expect(mappingMatches({ ...exact, enabled: false }, 'timer.session.completed')).toBe(false);
  });
});

describe('intakeEvent', () => {
  const events: Record<string, RoutineEvent> = {};

  it('accepts and derives entries through a mapping', () => {
    const m = newMapping('timer.session.completed', 'rtn_1');
    const res = intakeEvent(raw, events, [m], { rtn_1: routine });
    expect(res.kind).toBe('accepted');
    if (res.kind === 'accepted') {
      expect(res.entries).toHaveLength(1);
      expect(res.entries[0].source).toBe('event');
      expect(res.entries[0].eventId).toBe('evt_1');
      expect(res.entries[0].value).toBe(1);
    }
  });

  it('deduplicates by id', () => {
    const n = normalizeEvent(raw);
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    const existing = { evt_1: n.event };
    const res = intakeEvent(raw, existing, [newMapping('timer.session.completed', 'rtn_1')], { rtn_1: routine });
    expect(res.kind).toBe('duplicate');
  });

  it('stores unmapped events as unmapped, not dropped', () => {
    const res = intakeEvent({ ...raw, id: 'evt_2' }, events, [], { rtn_1: routine });
    expect(res.kind).toBe('unmapped');
  });

  it('invalid payloads are rejected', () => {
    const res = intakeEvent({ garbage: true }, events, [], {});
    expect(res.kind).toBe('invalid');
  });

  it('duration rule writes minutes; missing duration yields no entry', () => {
    const m = newMapping('timer.session.completed', 'rtn_2');
    m.valueRule = 'duration';
    const res = intakeEvent(raw, events, [m], { rtn_2: durationRoutine });
    expect(res.kind).toBe('accepted');
    if (res.kind === 'accepted') expect(res.entries[0].value).toBe(14); // 840s
    const res2 = intakeEvent({ ...raw, id: 'evt_3', durationSeconds: undefined }, events, [m], { rtn_2: durationRoutine });
    expect(res2.kind).toBe('unmapped');
  });

  it('metric rule picks the named metric', () => {
    const m = newMapping('flashcards.review.completed', 'rtn_2');
    m.valueRule = 'metric';
    m.metricKey = 'reviewed';
    const res = intakeEvent(
      { id: 'evt_4', type: 'flashcards.review.completed', occurredAt: '2026-10-10T20:00:00Z', sourceApp: 'flashcards', metrics: { reviewed: 32 } },
      events,
      [m],
      { rtn_2: durationRoutine },
    );
    expect(res.kind).toBe('accepted');
    if (res.kind === 'accepted') expect(res.entries[0].value).toBe(32);
  });
});

describe('removal by source', () => {
  it('finds every entry derived from a source app', () => {
    const events: Record<string, RoutineEvent> = {
      e1: { id: 'e1', type: 'timer.session.completed', occurredAt: '2026-10-10T20:00:00Z', sourceApp: 'timer', receivedAt: nowISO() },
      e2: { id: 'e2', type: 'ink.focus.completed', occurredAt: '2026-10-10T21:00:00Z', sourceApp: 'ink', receivedAt: nowISO() },
    };
    const entries = {
      a: { id: 'a', routineId: 'rtn_1', date: '2026-10-10', value: 1, source: 'event', eventId: 'e1', createdAt: nowISO() },
      b: { id: 'b', routineId: 'rtn_1', date: '2026-10-10', value: 1, source: 'event', eventId: 'e2', createdAt: nowISO() },
      c: { id: 'c', routineId: 'rtn_1', date: '2026-10-10', value: 1, source: 'manual', createdAt: nowISO() },
    } as never;
    expect(entriesFromSource(entries, events, 'timer')).toEqual(['a']);
    expect(entriesFromSource(entries, events, 'ink')).toEqual(['b']);
    expect(entriesFromSource(entries, events, 'proof')).toEqual([]);
  });
});
