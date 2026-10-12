// Contract pin — rhythm's canonical-store adapter shapes.
// Pure helpers only: entity builders, kind mapping, dedup ids.
import { describe, expect, it } from 'vitest';
import {
  busEventDraft,
  canonEventId,
  canonType,
  entryEntity,
  logActivityDraft,
  routineEntity,
  streakDays,
} from './iterra-adapter';
import type { Entry, Routine } from './types';

const routine = (over: Partial<Routine> = {}): Routine => ({
  id: 'r1',
  name: 'Cards',
  measure: 'check',
  target: { perWeek: 3 },
  weekdays: [1, 2, 3, 4, 5],
  accent: 'indigo',
  status: 'active',
  createdAt: '2026-10-01T00:00:00Z',
  courseId: 'c1',
  ...over,
});

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  routineId: 'r1',
  date: '2026-10-11',
  value: 1,
  source: 'manual',
  createdAt: '2026-10-11T09:00:00Z',
  ...over,
});

describe('kind → canonical type', () => {
  it('maps the sender vocabulary', () => {
    expect(canonType('session')).toBe('session.completed');
    expect(canonType('card.reviewed')).toBe('card.reviewed');
    expect(canonType('grade')).toBe('grade.entered');
    expect(canonType('diverged')).toBe('attempt.diverged');
  });
});

describe('entity builders', () => {
  it('routine entity carries days + streak + coursed labels', () => {
    const e = routineEntity(routine(), { course: 'MTH', courseId: 'syllabus:course:c9', streak: 4 });
    expect(e).toMatchObject({
      app: 'rhythm', type: 'routine', id: 'r1', title: 'Cards',
      course: 'MTH', courseId: 'syllabus:course:c9',
      url: '/apps/rhythm/?routine=Cards',
    });
    expect((e.data as Record<string, unknown>).days).toEqual([1, 2, 3, 4, 5]);
    expect((e.data as Record<string, unknown>).streak).toBe(4);
  });

  it('entry entity carries day/kind/minutes + course labels', () => {
    const r = routine({ measure: 'duration', unit: 'minutes' });
    const e = entryEntity(entry({ value: 45 }), r, { course: 'MTH', courseId: 'syllabus:course:c9' });
    expect(e).toMatchObject({ app: 'rhythm', type: 'entry', id: 'e1', course: 'MTH', courseId: 'syllabus:course:c9' });
    const d = e.data as Record<string, unknown>;
    expect(d).toMatchObject({ day: '2026-10-11', kind: 'duration', minutes: 45 });
  });

  it('minimum marks and event-derived entries read differently', () => {
    const min = entryEntity(entry({ isMinimum: true }), routine());
    expect((min.data as Record<string, unknown>).kind).toBe('minimum');
    const ev = entryEntity(entry({ eventId: 'evt_1', source: 'event' }), routine(), { eventKind: 'card.reviewed' });
    expect((ev.data as Record<string, unknown>).kind).toBe('card.reviewed');
  });
});

describe('dedup identity', () => {
  it('a card.reviewed gets the same id via intake and bus', () => {
    const bus = busEventDraft({
      type: 'card.reviewed', app: 'flashcards',
      payload: { cardId: 'k9', course: 'MTH' }, at: 1760000000000,
    });
    const intake = logActivityDraft({
      id: 'in-1', from: 'flashcards',
      payload: { kind: 'card.reviewed', cardId: 'k9', course: 'MTH' }, at: 1760000001000,
    });
    expect(bus!.id).toBe(intake!.id);
    expect(bus!.type).toBe('flashcards.card.reviewed');
  });

  it('id falls back to seq/id/at when no payload entity id', () => {
    expect(canonEventId({ app: 'timer', type: 'session.completed', seq: 41, at: 1 }))
      .toBe('evt_hub_timer_session.completed_s41');
    expect(canonEventId({ app: 'timer', type: 'session.completed', at: 99 }))
      .toBe('evt_hub_timer_session.completed_t99');
  });
});

describe('event drafts', () => {
  it('bus draft maps minutes + resource id', () => {
    const d = busEventDraft({
      type: 'session.completed', app: 'timer',
      payload: { minutes: 45, sessionId: 's7' }, at: 1760000000000,
    })!;
    expect(d.type).toBe('timer.session.completed');
    expect(d.sourceApp).toBe('timer');
    expect(d.durationSeconds).toBe(2700);
    expect(d.resourceId).toBe('s7');
    expect((d.metrics as Record<string, number>).minutes).toBe(45);
  });

  it('log.activity draft maps unknown senders to other', () => {
    const d = logActivityDraft({ from: 'margin', payload: { kind: 'note.created', noteId: 'n1' }, at: 5 })!;
    expect(d.sourceApp).toBe('other');
    expect(d.type).toBe('other.note.created');
  });

  it('streak walks back through unscheduled days but breaks on a miss', () => {
    const r = routine({ weekdays: [0, 6], createdAt: '2026-09-01T00:00:00Z' }); // weekends only
    const entries: Record<string, Entry> = {
      a: entry({ id: 'a', date: '2026-10-10' }), // Sat
      b: entry({ id: 'b', date: '2026-10-04' }), // Sun
    };
    // today param pinned to Sunday 2026-10-11: Sat(10)=marked, Fri(9) unsched-skip,
    // Thu..Mon(8..5) unsched-skip, Sun(4)=marked, Sat(3) missed → break. streak=2.
    expect(streakDays(r, entries, {}, '2026-10-11')).toBe(2);
  });
});
