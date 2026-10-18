// Contract pin — Flashcards' canonical-store adapter:
// the mirror must only manage the types it publishes (deck + card). A
// foreign flashcards-scoped entity parked by another flow (e.g. a
// flashcards:followup:* row) must survive prime + mirror — the same bug
// class that ate proof:followup:* entities before their prime was scoped.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Ent = Record<string, any>;
let puts: Ent[];
let removes: string[];
let listRows: Ent[];
let adapterOpts: any;

const installStubs = () => {
  puts = [];
  removes = [];
  listRows = [];
  adapterOpts = null;
  const mem = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  (globalThis as any).localStorage = localStorageStub;
  (globalThis as any).window = {
    iterra: {
      register: vi.fn(),
      adapter: (o: any) => { adapterOpts = o; },
      store: {
        put: async (e: Ent) => { puts.push(e); return { ok: true }; },
        list: async () => listRows,
        remove: async (k: string) => { removes.push(k); return { ok: true }; },
      },
      events: { emit: vi.fn() },
      links: { add: async () => ({ ok: true }) },
      courses: { resolve: async () => null },
      send: async () => ({ ok: true, delivered: 'queued' }),
      doc: () => null,
    },
    location: { search: '', href: 'http://localhost/apps/flashcards/', hash: '' },
    localStorage: localStorageStub,
    addEventListener: () => {},
    /* the app internals the adapter reaches for lazily — one live deck so
       the mirror pass has something real to publish */
    __fcApp: {
      state: {
        decks: {
          d1: {
            id: 'd1', title: 'Bio deck', createdAt: 't0',
            cards: [{ id: 'c1', q: 'Q1', a: 'A1', status: 'new' }],
          },
        },
      },
      createDeck: vi.fn(),
      newCard: vi.fn(),
      diacritics: (x: any) => x,
      saveStore: vi.fn(),
      selectDeck: vi.fn(),
      renderAll: vi.fn(),
    },
  };
};

const tick = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  vi.resetModules();
  installStubs();
});

describe('flashcards adapter mirror', () => {
  it('publishes live decks and cards as canonical entities', async () => {
    const { wireFlashcardsAdapter } = await import('./iterra-adapter');
    wireFlashcardsAdapter();
    await tick();
    expect(adapterOpts?.name).toBe('flashcards');
    expect(puts.find((e) => e.type === 'deck' && e.id === 'd1')).toMatchObject({
      app: 'flashcards', title: 'Bio deck', url: '/apps/flashcards/?deck=d1',
    });
    expect(puts.find((e) => e.type === 'card' && e.id === 'c1')).toMatchObject({
      data: { deckId: 'd1', status: 'new', dueAt: 0 },
    });
  });

  it('prime-prune keeps foreign flashcards:* entities — only stale decks/cards retract', async () => {
    /* the shadow seed used to list EVERY flashcards:* entity — a follow-up
       or other parked row would be mirror-pruned the moment the app woke,
       retracting an entity another flow owns (observed live with proof's
       identical prime; same class fixed here). */
    listRows = [
      { key: 'flashcards:followup:fu1', app: 'flashcards', type: 'followup', id: 'fu1', data: { status: 'open' } },
      { key: 'flashcards:deck:gone', app: 'flashcards', type: 'deck', id: 'gone', data: {} },
      { key: 'flashcards:card:gone-c', app: 'flashcards', type: 'card', id: 'gone-c', data: {} },
    ];
    const { wireFlashcardsAdapter } = await import('./iterra-adapter');
    wireFlashcardsAdapter();
    await tick();
    expect(removes).toContain('flashcards:deck:gone');
    expect(removes).toContain('flashcards:card:gone-c');
    expect(removes).not.toContain('flashcards:followup:fu1');
  });
});
