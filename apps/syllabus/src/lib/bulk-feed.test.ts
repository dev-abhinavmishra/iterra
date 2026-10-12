import { describe, it, expect, beforeEach } from 'vitest';
import { useFolio, beginBulkFeed, endBulkFeed, stir } from '../store';

/* Pins the bulk-suppression emit contract (WIRING §7): a filing wave is
   ONE event — per-row stirs are suppressed inside begin/endBulkFeed and
   the caller emits a single summary stir after end. Node env: the hub is
   stubbed on globalThis.window per-test; zustand-persist degrades to
   in-memory (its "storage unavailable" stderr notes are expected). */

const feedCalls: { text: string; url?: string; course?: string }[] = [];

beforeEach(() => {
  feedCalls.length = 0;
  (globalThis as any).window = { iterra: { feed: (item: any) => feedCalls.push(item) } };
  useFolio.setState({
    terms: {},
    courses: {},
    commitments: {},
    blocks: {},
    links: {},
    reviews: {},
    dismissed: {},
    settings: useFolio.getState().settings,
    booted: false,
  });
});

const TERM = { name: 'Fall 2026', startDate: '2026-09-01', endDate: '2026-12-15', timezone: 'America/New_York' };
const mkCommitment = (courseId: string, n: number) =>
  ({ courseId, title: `Row ${n}`, type: 'assignment' as const, dueAt: '2026-12-01T17:00', weight: 10, estimatedMinutes: 60 });

describe('bulk feed suppression', () => {
  it('suppresses per-row stirs inside begin/endBulkFeed; one summary stir emits after', () => {
    const term = useFolio.getState().createTerm(TERM);
    const course = useFolio.getState().addCourse({ code: 'HIST 140', name: 'History', color: 'navy', termId: term.id });
    feedCalls.length = 0; // ignore the real term/course emits

    beginBulkFeed();
    try {
      for (let i = 0; i < 3; i++) useFolio.getState().addCommitment(mkCommitment(course.id, i));
    } finally {
      endBulkFeed();
    }
    expect(feedCalls).toHaveLength(0); // zero per-row stirs during the wave

    stir(`commitments filed: 3 · ${course.code}`, '/apps/syllabus/', course.code);
    expect(feedCalls).toEqual([{ text: 'commitments filed: 3 · HIST 140', url: '/apps/syllabus/', course: 'HIST 140' }]);
    expect(Object.keys(useFolio.getState().commitments)).toHaveLength(3); // suppressed rows still commit
  });

  it('emits per-row stirs normally outside a wave', () => {
    const term = useFolio.getState().createTerm(TERM);
    const course = useFolio.getState().addCourse({ code: 'MATH 241', name: 'Calc', color: 'oxblood', termId: term.id });
    feedCalls.length = 0;

    useFolio.getState().addCommitment(mkCommitment(course.id, 1));
    expect(feedCalls).toEqual([{ text: 'commitment filed: Row 1', url: '/apps/syllabus/', course: 'MATH 241' }]);
  });

  it('depth counter nests: suppression holds until depth returns to zero', () => {
    const term = useFolio.getState().createTerm(TERM);
    const course = useFolio.getState().addCourse({ code: 'PHYS 221', name: 'Phys', color: 'slate', termId: term.id });
    feedCalls.length = 0;

    beginBulkFeed();
    beginBulkFeed(); // nested wave
    useFolio.getState().addCommitment(mkCommitment(course.id, 1));
    endBulkFeed(); // depth 1 — still suppressed
    useFolio.getState().addCommitment(mkCommitment(course.id, 2));
    endBulkFeed(); // depth 0 — emits resume
    useFolio.getState().addCommitment(mkCommitment(course.id, 3));

    expect(feedCalls).toEqual([{ text: 'commitment filed: Row 3', url: '/apps/syllabus/', course: 'PHYS 221' }]);
  });
});
