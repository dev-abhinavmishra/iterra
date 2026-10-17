// Contract pin — the canonical-store mirror + intakes from iterra-adapter.ts.
// Runs in plain node: window.iterra + localStorage are stubbed BEFORE the
// module under test is imported (its subscribe/adapter() calls wire at import
// time); vi.resetModules per test re-baselines the adapter's diff memory.
import { beforeEach, describe, expect, it, vi } from 'vitest';

let puts: any[];
let removes: string[];
let events: { type: string; payload: any }[];
let entities: Map<string, any>;
let adapterOpts: any;
let lists: (f: any) => any[];

const installStubs = () => {
  puts = [];
  removes = [];
  events = [];
  entities = new Map();
  adapterOpts = null;
  lists = () => [];
  const mem = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  (globalThis as Record<string, unknown>).localStorage = localStorageStub;
  (globalThis as Record<string, unknown>).window = {
    iterra: {
      register: vi.fn(),
      adapter: (o: any) => {
        adapterOpts = o;
        return { name: o.name };
      },
      feed: () => {},
      doc: () => ({ get: () => null, set: () => {}, setField: () => {}, subscribe: () => () => {} }),
      store: {
        put: (e: any) => {
          puts.push(e);
          entities.set(`${e.app}:${e.type}:${e.id}`, e);
          return Promise.resolve({ ok: true });
        },
        get: (k: string) => Promise.resolve(entities.get(k) ?? null),
        list: (f: any) => Promise.resolve(lists(f)),
        remove: (k: string) => {
          removes.push(k);
          entities.delete(k);
          return Promise.resolve({ ok: true });
        },
        subscribe: () => () => {},
        search: () => Promise.resolve([]),
      },
      events: {
        emit: (type: string, payload: any) => {
          events.push({ type, payload });
          return Promise.resolve({ ok: true });
        },
        list: () => Promise.resolve([]),
        on: () => () => {},
      },
      courses: { byCode: () => Promise.resolve(null), list: () => Promise.resolve([]) },
      send: () => Promise.resolve({ ok: true, delivered: 'direct', url: '/apps/timer/' }),
      open: () => {},
      isFramed: () => true,
    },
    localStorage: localStorageStub,
    location: { href: 'http://localhost/apps/syllabus/', search: '' },
    history: { replaceState: () => {} },
  };
};

const mkTerm = () =>
  ({ id: 't1', name: 'Fall 2026', startDate: '2026-09-01', endDate: '2026-12-20', timezone: 'America/New_York', createdAt: '2026-10-01T00:00:00Z' }) as any;
const mkCourse = (id: string, code: string, name = 'Calculus') =>
  ({ id, termId: 't1', name, code, color: 'navy', archived: false, createdAt: '2026-10-01T00:00:00Z' }) as any;
const mkCommitment = (id: string, courseId: string, over: Record<string, any> = {}) =>
  ({
    id, courseId, type: 'exam', title: 'Midterm', dueAt: '2026-12-01T23:59:00',
    weight: 40, estimatedMinutes: 120, loggedMinutes: 0, status: 'open',
    pinned: false, dependencies: [], createdAt: '2026-10-01T00:00:00Z', ...over,
  }) as any;
const mkBlock = (id: string, commitmentId: string, over: Record<string, any> = {}) =>
  ({
    id, commitmentId, plannedDate: '2026-10-12', plannedStart: '16:00', plannedMinutes: 45,
    state: 'planned', phase: 'review', reasons: ['seeded'], score: 10, deferCount: 0,
    order: 1, createdAt: '2026-10-01T00:00:00Z', ...over,
  }) as any;

/** seed the folio, then import the adapter fresh — its first booted pass is
 *  the baseline (mirrors everything, emits nothing). */
const seedAndWire = async (data: Record<string, any>) => {
  const { useFolio, DEFAULT_SETTINGS } = await import('../store');
  useFolio.setState({
    terms: {}, courses: {}, commitments: {}, blocks: {}, links: {}, reviews: {},
    dismissed: {}, settings: DEFAULT_SETTINGS, booted: true, ...data,
  } as any);
  const adapter = await import('./iterra-adapter');
  return { useFolio, adapter };
};

beforeEach(() => {
  vi.resetModules();
  installStubs();
});

describe('syllabus canonical-store mirror', () => {
  it('mirrors term/course/commitment/block entities in the documented shape', async () => {
    await seedAndWire({
      terms: { t1: mkTerm() },
      courses: { c1: mkCourse('c1', 'MTH151') },
      commitments: { k1: mkCommitment('k1', 'c1') },
      blocks: { b1: mkBlock('b1', 'k1') },
    });

    expect(entities.get('syllabus:term:t1')).toMatchObject({
      type: 'term', id: 't1', title: 'Fall 2026',
      data: { startDate: '2026-09-01', endDate: '2026-12-20' },
    });
    const course = entities.get('syllabus:course:c1');
    expect(course).toMatchObject({ type: 'course', id: 'c1', title: 'Calculus', course: 'MTH151' });
    expect(course.data).toMatchObject({ code: 'MTH151', termId: 't1', categories: { exam: 40 } });

    const commitment = entities.get('syllabus:commitment:k1');
    expect(commitment).toMatchObject({
      type: 'commitment', id: 'k1', courseId: 'syllabus:course:c1', course: 'MTH151',
      title: 'Midterm', sub: 'exam', url: '/apps/syllabus/?commitment=k1',
    });
    expect(commitment.data).toMatchObject({ type: 'exam', status: 'open', weight: 40, estimatedMinutes: 120 });

    const block = entities.get('syllabus:block:b1');
    expect(block).toMatchObject({ type: 'block', id: 'b1', courseId: 'syllabus:course:c1', course: 'MTH151', url: '/apps/syllabus/?block=b1' });
    expect(block.data).toMatchObject({ commitmentId: 'k1', plannedDate: '2026-10-12', state: 'planned', phase: 'review' });

    expect(events).toEqual([]); // the baseline pass stays quiet
  });

  it('puts only the changed entity on later passes', async () => {
    const { useFolio } = await seedAndWire({
      terms: { t1: mkTerm() },
      courses: { c1: mkCourse('c1', 'MTH151') },
      commitments: { k1: mkCommitment('k1', 'c1'), k2: mkCommitment('k2', 'c1', { title: 'Quiz' }) },
    });
    puts.length = 0;
    useFolio.setState({
      commitments: { ...useFolio.getState().commitments, k2: { ...useFolio.getState().commitments.k2, title: 'Quiz 2' } },
    } as any);
    expect(puts.map((e) => `${e.type}:${e.id}`)).toEqual(['commitment:k2']);
  });

  it('removes entities whose records disappear', async () => {
    const { useFolio } = await seedAndWire({
      commitments: { k1: mkCommitment('k1', 'c1') },
      blocks: { b1: mkBlock('b1', 'k1') },
    });
    removes.length = 0;
    useFolio.setState({ blocks: {} } as any);
    expect(removes).toContain('syllabus:block:b1');
    expect(entities.has('syllabus:block:b1')).toBe(false);
  });

  it('emits course.registered only for courses filed after baseline', async () => {
    const { useFolio } = await seedAndWire({ courses: { cA: mkCourse('cA', 'MTH151') } });
    useFolio.setState({
      courses: { ...useFolio.getState().courses, cB: mkCourse('cB', 'HST201', 'History') },
    } as any);
    const reg = events.filter((e) => e.type === 'course.registered');
    expect(reg).toHaveLength(1);
    expect(reg[0].payload).toMatchObject({ courseId: 'syllabus:course:cB', course: 'HST201', title: 'History' });
  });

  it('emits assignment.completed on an open → done transition', async () => {
    const { useFolio } = await seedAndWire({
      courses: { c1: mkCourse('c1', 'MTH151') },
      commitments: { k1: mkCommitment('k1', 'c1') },
    });
    useFolio.getState().setCommitmentStatus('k1', 'done');
    const done = events.filter((e) => e.type === 'assignment.completed');
    expect(done).toHaveLength(1);
    expect(done[0].payload).toMatchObject({ commitmentId: 'k1', courseId: 'syllabus:course:c1', course: 'MTH151', title: 'Midterm' });
  });

  it('emits assignment.due when a commitment moves inside the 24h window, once', async () => {
    const soon = new Date(Date.now() + 6 * 3600_000).toISOString();
    const later = new Date(Date.now() + 72 * 3600_000).toISOString();
    const { useFolio } = await seedAndWire({
      courses: { c1: mkCourse('c1', 'MTH151') },
      commitments: { k1: mkCommitment('k1', 'c1', { dueAt: later }) },
    });
    useFolio.setState({
      commitments: { k1: { ...useFolio.getState().commitments.k1, dueAt: soon } },
    } as any);
    const due = events.filter((e) => e.type === 'assignment.due');
    expect(due).toHaveLength(1);
    expect(due[0].payload).toMatchObject({ commitmentId: 'k1', courseId: 'syllabus:course:c1', dueAt: soon });
    events.length = 0;
    useFolio.setState({ commitments: { k1: { ...useFolio.getState().commitments.k1, weight: 41 } } } as any);
    expect(events.filter((e) => e.type === 'assignment.due')).toEqual([]);
  });
});

describe('study-plan.request intake', () => {
  it('is registered on the adapter and generates real slips from cross-app signals', async () => {
    const { useFolio } = await seedAndWire({
      terms: { t1: mkTerm() },
      courses: { c1: mkCourse('c1', 'MTH151') },
      commitments: { exam1: mkCommitment('exam1', 'c1', { title: 'Final', dueAt: '2026-12-05T23:59:00' }) },
    });
    lists = (f: any) => {
      if (f.app === 'flashcards' && f.type === 'card') {
        return [
          { id: 'card1', data: { dueAt: '2020-01-01T00:00:00Z' } },
          { id: 'card2', data: { dueAt: '2020-01-02T00:00:00Z' } },
          { id: 'card3', data: { dueAt: '2999-01-01T00:00:00Z' } }, // not due — excluded
        ];
      }
      if (f.app === 'proof') return [{ type: 'attempt', title: 'chain rule', data: { status: 'diverged' } }];
      if (f.app === 'timer' && f.type === 'session') return [{ data: { minutes: 30 } }, { data: { minutes: 40 } }];
      return [];
    };

    const handler = adapterOpts?.intakes?.['study-plan.request'];
    expect(typeof handler).toBe('function');
    const res = await handler({ id: 'in1', action: 'study-plan.request', payload: { courseId: 'syllabus:course:c1' } });
    expect(res).toEqual({ url: '/apps/syllabus/' });

    const made = Object.values(useFolio.getState().blocks);
    expect(made.length).toBeGreaterThan(0);
    // card pace: ceil(2 due / 40) = 1 card block/day + one weak-topic block on day 1
    expect(made.some((b: any) => b.label === 'review due cards' && b.phase === 'review')).toBe(true);
    expect(made.some((b: any) => b.label === 'weak topic: chain rule' && b.phase === 'practice')).toBe(true);
    // median session 35m → clamped into [20,60]
    expect(made.every((b: any) => b.plannedMinutes === 35)).toBe(true);
    expect(made.every((b: any) => b.commitmentId === 'exam1')).toBe(true);
    // mirrored into the canonical store by the same subscription
    expect(entities.has(`syllabus:block:${(made[0] as any).id}`)).toBe(true);
  });

  it('explains when there is nothing to plan', async () => {
    const { useFolio, adapter } = await seedAndWire({ courses: { c1: mkCourse('c1', 'MTH151') } });
    const res = await adapter.studyPlan({ id: 'in2', action: 'study-plan.request', payload: { courseId: 'syllabus:course:c1' } });
    expect(res).toEqual({ url: null, toast: 'Nothing to plan — no due cards or weak topics found for that course' });
    expect(Object.keys(useFolio.getState().blocks)).toHaveLength(0);
  });

  it('explains when the course is unknown', async () => {
    const { adapter } = await seedAndWire({});
    const res = await adapter.studyPlan({ id: 'in3', action: 'study-plan.request', payload: { courseId: 'syllabus:course:nope' } });
    expect(res).toEqual({ url: null, toast: 'No course “nope” in Planning — add it first' });
  });
});
