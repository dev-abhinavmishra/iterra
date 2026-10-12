// Contract pin — ink's terrain publish shape from lib/iterra.ts.
// Same node-stub pattern as rhythm's pin: window.iterra + localStorage exist
// before the module imports (its ambient layer wires at import time).
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
          if (ns === 'index.ink') indexSets.push(v as { entities: Entity[] });
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
    location: { search: '', href: 'http://localhost/apps/ink/', pathname: '/apps/ink/' },
    history: { replaceState: () => {} },
    localStorage: localStorageStub,
  };
};

const makeNote = (over: Record<string, unknown> = {}) => ({
  id: `n_${Math.random().toString(36).slice(2, 8)}`,
  title: 'a page',
  content: '{"type":"doc","content":[]}',
  folder: 'Unfiled',
  tags: [] as string[],
  lastModified: Date.now(),
  createdAt: Date.now(),
  wordCount: 3,
  isPinned: false,
  trashedAt: null,
  dailyKey: null,
  ...over,
});

const freshStore = async () => {
  const { useStore } = await import('../store');
  useStore.setState({ notes: [], folders: [], drafts: {}, activeNoteId: null, activeFolder: 'All Notes' });
  return useStore;
};

beforeEach(() => {
  vi.resetModules();
  installStubs();
});

describe('ink publish contract', () => {
  it('publishes note entities in the documented shape — live notes only', async () => {
    const store = await freshStore();
    const live = makeNote({ title: 'Desk page', folder: 'Work' });
    const trashed = makeNote({ title: 'binned', trashedAt: Date.now() });
    await import('./iterra');
    store.setState({ notes: [live, trashed] });
    const entities = indexSets[indexSets.length - 1]?.entities ?? [];
    const e = entities.find((x) => x.id === live.id);
    expect(e).toMatchObject({
      t: 'note',
      title: 'Desk page',
      sub: 'Work',
      url: `/apps/ink/?note=${live.id}`,
      at: live.lastModified,
    });
    expect(entities.find((x) => x.id === trashed.id)).toBeUndefined();
  });

  it('republishes entity sub when a note changes folder', async () => {
    const store = await freshStore();
    const note = makeNote({ title: 'movable', folder: 'Unfiled' });
    await import('./iterra');
    store.setState({ notes: [note] });
    const first = indexSets[indexSets.length - 1]?.entities?.[0];
    expect(first?.sub).toBe('Unfiled');
    store.setState({ notes: [{ ...note, folder: 'Journal' }] });
    const last = indexSets[indexSets.length - 1]?.entities?.[0];
    expect(last?.sub).toBe('Journal');
  });

  it('emits the set-down stir for a new note id only after baseline', async () => {
    const store = await freshStore();
    const seeded = makeNote({ title: 'already on file' });
    await import('./iterra');
    store.setState({ notes: [seeded] }); // baseline captures this id silently
    feedCalls.length = 0;
    const added = makeNote({ title: 'fresh thought' });
    store.setState({ notes: [seeded, added] });
    const stir = feedCalls.find((f) => f.text.startsWith('note set down'));
    expect(stir).toMatchObject({
      text: 'note set down: fresh thought',
      url: `/apps/ink/?note=${added.id}`,
    });
    expect(feedCalls.filter((f) => f.text.startsWith('note set down'))).toHaveLength(1);
  });

  it('publishes noteActive with v.at = the note’s own lastModified', async () => {
    const store = await freshStore();
    const written = Date.now() - 60_000;
    const note = makeNote({ id: 'n_active', title: 'open page', lastModified: written });
    await import('./iterra');
    store.setState({ notes: [note], activeNoteId: 'n_active' });
    const entry = sharedFields['noteActive'] as
      | { v: { app: string; id: string; title: string; at: number }; by: string; at: number }
      | undefined;
    expect(entry?.by).toBe('ink');
    expect(entry?.v).toMatchObject({ app: 'ink', id: 'n_active', title: 'open page' });
    expect(entry?.v.at).toBe(written); // write-time, not publish-time
    expect(entry?.at).toBeGreaterThan(entry!.v.at); // entry.at stays publish-time
  });
});
