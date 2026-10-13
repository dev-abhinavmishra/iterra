// Contract pin — margin's terrain publish shape from iterra.ts.
// The publisher is interval+service driven: notes come from setMarginSource
// (what App supplies), decks/quizzes from storageService — mocked here so no
// IndexedDB is needed. window.iterra is stubbed before import, like siblings.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./services/storageService', () => ({
  getAllDecks: vi.fn(async () => [
    { id: 'dk1', title: 'Renal deck', cards: [{}, {}], createdAt: '2026-10-10T00:00:00Z' },
  ]),
  getAllQuizzes: vi.fn(async () => [
    { id: 'qz1', title: 'Renal check', questions: [{}], createdAt: '2026-10-10T00:00:00Z' },
  ]),
}));

type FeedItem = { text: string; url?: string; course?: string; topic?: string };
type Entity = {
  t: string; id: string; title: string; sub?: string;
  url?: string; at: number;
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
          if (ns === 'index.margin') indexSets.push(v as { entities: Entity[] });
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
      isFramed: () => true,
    },
    location: { search: '', href: 'http://localhost/apps/margin/', pathname: '/apps/margin/' },
    history: { replaceState: () => {} },
    localStorage: localStorageStub,
  };
};

const makeNote = (over: Record<string, unknown> = {}) => ({
  id: `n_${Math.random().toString(36).slice(2, 8)}`,
  title: 'a margin note',
  date: 'Oct 11',
  content: 'body',
  transcript: '',
  type: 'TEXT' as const,
  tags: [] as string[],
  lastAccessed: '2026-10-11T12:00:00.000Z',
  ...over,
});

const flush = async () => {
  // one real interval tick — the import-time publish fires before any source
  // is installed, so tests advance to the first tick that sees it
  await vi.advanceTimersByTimeAsync(3000);
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  installStubs();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('margin publish contract', () => {
  it('publishes note + deck + quiz entities in the documented shape', async () => {
    const { setMarginSource } = await import('./iterra');
    const note = makeNote({ id: 'note1', title: 'Renal notes', type: 'TEXT' });
    setMarginSource(() => ({ notes: [note] }));
    await flush();
    const entities = indexSets[indexSets.length - 1]?.entities ?? [];
    expect(entities.find((e) => e.id === 'note1')).toMatchObject({
      t: 'note',
      title: 'Renal notes',
      sub: 'TEXT',
      url: '/apps/margin/?note=note1',
    });
    expect(entities.find((e) => e.id === 'dk1')).toMatchObject({
      t: 'deck',
      title: 'Renal deck',
      sub: '2 cards',
      url: '/apps/margin/?deck=dk1',
    });
    expect(entities.find((e) => e.id === 'qz1')).toMatchObject({
      t: 'quiz',
      title: 'Renal check',
      sub: '1 questions',
      url: '/apps/margin/?quiz=qz1',
    });
  });

  it('emits margin-note stir for new ids, baseline stays silent', async () => {
    const mod = await import('./iterra');
    const first = makeNote({ id: 'seeded' });
    mod.setMarginSource(() => ({ notes: [first] }));
    await flush(); // baseline — no stir for the pre-existing note
    feedCalls.length = 0;
    const added = makeNote({ id: 'fresh', title: 'typed note' });
    mod.setMarginSource(() => ({ notes: [first, added] }));
    await vi.advanceTimersByTimeAsync(3000); // next interval tick
    const stir = feedCalls.find((f) => f.text.startsWith('margin note'));
    expect(stir).toMatchObject({
      text: 'margin note: typed note',
      url: '/apps/margin/?note=fresh',
    });
  });

  it('publishes noteActive v.at from the latest lastAccessed', async () => {
    const mod = await import('./iterra');
    mod.setMarginSource(() => ({
      notes: [
        makeNote({ id: 'older', lastAccessed: '2026-10-11T10:00:00.000Z' }),
        makeNote({ id: 'newest', title: 'openest', lastAccessed: '2026-10-11T18:30:00.000Z' }),
      ],
    }));
    await flush();
    const entry = sharedFields['noteActive'] as
      | { v: { app: string; id: string; title: string; at: number }; by: string; at: number }
      | undefined;
    expect(entry?.by).toBe('margin');
    expect(entry?.v).toMatchObject({ app: 'margin', id: 'newest', title: 'openest' });
    expect(entry?.v.at).toBe(new Date('2026-10-11T18:30:00.000Z').getTime());
    expect(entry?.at).toBeGreaterThanOrEqual(entry!.v.at);
  });
});
