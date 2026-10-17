// Contract pin — the terrain-facing publish shape from lib/iterra.ts.
// Runs in plain node: window.iterra + localStorage are stubbed before the
// module under test is imported (its ambient layer wires at import time).
import { beforeEach, describe, expect, it, vi } from 'vitest';

type FeedItem = { text: string; url?: string; course?: string; topic?: string };
type Entity = {
  t: string; id: string; title: string; sub?: string;
  course?: string; topic?: string; url?: string; at: number;
};

let feedCalls: FeedItem[];
let indexSets: { entities: Entity[] }[];
let sharedFields: Record<string, unknown>;
let docs: Map<string, { get: () => unknown; set: (v: unknown) => void; setField: (f: string, v: unknown) => void; subscribe: (cb: (v: unknown) => void) => () => void }>;

const installStubs = () => {
  feedCalls = [];
  indexSets = [];
  sharedFields = {};
  docs = new Map();
  const mem = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  const docFor = (ns: string) => {
    if (!docs.has(ns)) {
      let store: Record<string, unknown> = {};
      docs.set(ns, {
        get: () => store,
        set: (v: unknown) => {
          store = v as Record<string, unknown>;
          if (ns === 'index.rhythm') indexSets.push(v as { entities: Entity[] });
        },
        setField: (f: string, v: unknown) => {
          store = { ...store, [f]: v };
          if (ns === 'shared') sharedFields[f] = v;
        },
        subscribe: () => () => {},
      });
    }
    return docs.get(ns)!;
  };
  (globalThis as Record<string, unknown>).localStorage = localStorageStub;
  (globalThis as Record<string, unknown>).window = {
    iterra: {
      register: vi.fn(),
      feed: (item: FeedItem) => feedCalls.push(item),
      doc: docFor,
    },
    location: { search: '', href: 'http://localhost/apps/rhythm/' },
    history: { replaceState: () => {} },
    localStorage: localStorageStub,
  };
};

const seed = async () => {
  const { useRegister } = await import('../store');
  useRegister.setState({
    routines: {
      r1: {
        id: 'r1', name: 'Cards', measure: 'check', target: { perWeek: 3 },
        weekdays: [0, 1, 2, 3, 4, 5, 6], accent: 'indigo', status: 'active',
        createdAt: '2026-10-01T00:00:00Z', courseId: 'c1',
      } as never,
      r2: {
        id: 'r2', name: 'Walk', measure: 'check', target: { perWeek: 5 },
        weekdays: [0, 1, 2, 3, 4, 5, 6], accent: 'teal', status: 'active',
        createdAt: '2026-10-01T00:00:00Z',
      } as never,
    },
    courses: {
      c1: { id: 'c1', name: 'Calculus', code: 'MTH151', createdAt: '2026-10-01T00:00:00Z' } as never,
    },
    experiments: {
      ex1: {
        id: 'ex1', routineId: 'r1', hypothesis: 'cards before dinner lifts the hit rate',
        change: 'before dinner', startDate: '2026-10-05', endDate: '2026-10-18',
        status: 'active', createdAt: '2026-10-05T00:00:00Z',
      } as never,
    },
    entries: {},
  });
  return useRegister;
};

beforeEach(() => {
  vi.resetModules();
  installStubs();
});

describe('iterra publish contract', () => {
  it('publishes routine + experiment entities in the documented shape', async () => {
    const store = await seed();
    await import('./iterra');
    // import-time baseline has no routines; a later tick carries the seed —
    // force one publish by touching the store
    store.setState({ settings: { ...store.getState().settings } });
    const entities = indexSets[indexSets.length - 1]?.entities ?? [];
    const routine = entities.find((e) => e.id === 'r1');
    const uncoursed = entities.find((e) => e.id === 'r2');
    const experiment = entities.find((e) => e.id === 'ex1');

    expect(routine).toMatchObject({
      t: 'routine',
      title: 'Cards',
      sub: '3×/wk',
      course: 'MTH151',
      url: `/apps/rhythm/?routine=${encodeURIComponent('Cards')}`,
    });
    expect(uncoursed?.t).toBe('routine');
    expect(uncoursed?.course).toBeUndefined();
    expect(uncoursed?.url).toBe(`/apps/rhythm/?routine=${encodeURIComponent('Walk')}`);
    expect(experiment).toMatchObject({
      t: 'experiment',
      title: 'cards before dinner lifts the hit rate',
      sub: 'active · before dinner',
      course: 'MTH151',
      url: '/apps/rhythm/?experiment=ex1',
    });
  });

  it('emits a coursed hit feed item when a new entry lands', async () => {
    const store = await seed();
    await import('./iterra');
    store.setState({ settings: { ...store.getState().settings } }); // baseline
    feedCalls.length = 0;
    store.getState().checkIn('r1');
    const hit = feedCalls.find((f) => /hit/.test(f.text));
    expect(hit).toMatchObject({ text: 'Cards hit', url: `/apps/rhythm/?routine=${encodeURIComponent('Cards')}`, course: 'MTH151' });
  });

  it('tags register-complete by course when all coursed marks agree', async () => {
    const store = await seed();
    await import('./iterra');
    store.setState({ settings: { ...store.getState().settings } });
    feedCalls.length = 0;
    store.getState().checkIn('r1'); // MTH151
    store.getState().checkIn('r2'); // uncoursed — doesn't veto the tag
    const complete = feedCalls.find((f) => f.text.startsWith('register complete'));
    expect(complete?.text).toBe('register complete — 2/2 for today');
    expect(complete?.course).toBe('MTH151');
  });

  it('leaves register-complete untagged when the day spans two courses', async () => {
    const store = await seed();
    store.setState({
      courses: {
        ...store.getState().courses,
        c2: { id: 'c2', name: 'History', code: 'HST201', createdAt: '2026-10-01T00:00:00Z' } as never,
      },
      routines: {
        ...store.getState().routines,
        r2: { ...store.getState().routines.r2, courseId: 'c2' },
      },
    });
    await import('./iterra');
    store.setState({ settings: { ...store.getState().settings } });
    feedCalls.length = 0;
    store.getState().checkIn('r1'); // MTH151
    store.getState().checkIn('r2'); // HST201 — no shared key
    const complete = feedCalls.find((f) => f.text.startsWith('register complete'));
    expect(complete?.course).toBeUndefined();
  });

  it('publishes shared.register with the {marked, pending} commons shape', async () => {
    const store = await seed();
    await import('./iterra');
    store.getState().checkIn('r1');
    const reg = sharedFields['register'] as { v: { marked: number; pending: number }; by: string; at: number } | undefined;
    expect(reg?.by).toBe('rhythm');
    expect(reg?.v.marked).toBeGreaterThanOrEqual(0);
    expect(typeof reg?.v.pending).toBe('number');
  });
});
