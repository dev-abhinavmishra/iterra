// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';

/* Canonical-store adapter contract — workflow A tail (card.reviewed →
   rhythm) + the cards.create / problem.retest intakes.
   Runs the REAL iterra-adapter.js as a <script> element in a fresh JSDOM,
   then a faithful app-model shim as a second <script> — the exact load
   order of index.html (adapter before app.js), so the adapter reaches
   app.js's top-level const/function bindings through the shared global
   lexical environment the same way it does in production. */

const dir = path.dirname(fileURLToPath(import.meta.url));
const adapterJs = readFileSync(path.join(dir, '..', 'iterra-adapter.js'), 'utf8');

const shim = `
  const state = { decks: {}, currentId: null };
  let _uid = 0;
  function uid() { return 'u' + (++_uid); }
  function newCard(q, a, ex) { return { id: uid(), q: q || '', a: a || '', ex: ex || '', starred: false, status: 'new' }; }
  function createDeck(title, cards) {
    const d = { id: uid(), title: title || 'Untitled deck', cards: cards || [], flipped: false, createdAt: 100, lastStudiedAt: 0 };
    state.decks[d.id] = d;
    return d;
  }
  function diacritics(t) { return t || ''; }
  function saveStore() { try { localStorage.setItem('cardfile.decks.v1', JSON.stringify(state.decks)); } catch (e) {} }
  function selectDeck(id) { state.currentId = id; }
  window.__app = { get state() { return state; } };
`;

function scriptEl(w, src) {
  const el = w.document.createElement('script');
  el.textContent = src;
  w.document.body.appendChild(el);
}

function boot() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/apps/flashcards/',
    runScripts: 'dangerously',
  });
  const w = dom.window;
  const calls = { puts: [], emits: [], sends: [], links: [], removes: [], opts: null };
  w.iterra = {
    adapter: (o) => { calls.opts = o; },
    store: {
      put: async (e) => { calls.puts.push(e); return { ok: true }; },
      list: async () => [],
      remove: async (k) => { calls.removes.push(k); return { ok: true }; },
    },
    events: { emit: (t, p) => calls.emits.push({ t, p }) },
    links: { add: async (from, to, kind) => { calls.links.push({ from, to, kind }); return { ok: true }; } },
    courses: { resolve: async () => null },
    send: async (o) => { calls.sends.push(o); return { ok: true, delivered: 'queued' }; },
  };
  scriptEl(w, adapterJs);   // adapter registers + boots against an empty model
  scriptEl(w, shim);        // app internals arrive — same order as index.html
  w.__fcAdapter.hookStore();
  return { w, calls, api: w.__fcAdapter, state: w.__app.state };
}

const tick = () => new Promise((r) => setTimeout(r, 15));

const seedDeck = (w, title = 'Bio terms', status = 'new') => {
  const d = w.createDeck(title, [w.newCard('Q1', 'A1', ''), w.newCard('Q2', 'A2', 'ex')]);
  d.cards[0].status = status;
  w.saveStore();
  return d.id;
};

describe('pure helpers', () => {
  it('deckEntity + cardEntity carry the documented shape', () => {
    const { api } = boot();
    const d = { id: 'd1', title: 'Bio', createdAt: 7, cards: [{ id: 'c1', status: 'new' }, { id: 'c2', status: 'mastered' }] };
    expect(api.deckEntity(d, { courseId: 'k', course: 'BIO' })).toMatchObject({
      app: 'flashcards', type: 'deck', id: 'd1', courseId: 'k', course: 'BIO',
      title: 'Bio', sub: '1 due', url: '/apps/flashcards/?deck=d1',
      data: { count: 2, due: 1 },
    });
    const card = { id: 'c1', q: 'Q?', a: 'A!', status: 'new' };
    expect(api.cardEntity(card, d, {}).data).toMatchObject({ deckId: 'd1', status: 'new', dueAt: 0 });
    card.status = 'mastered';
    expect(api.cardEntity(card, d, {}).data.dueAt).toBeNull();
  });

  it('intakeCards keeps {q,a,ex} and drops unusable rows', () => {
    const { api } = boot();
    expect(api.intakeCards({ cards: [{ q: ' a ', a: ' b ', ex: ' c ' }, { q: '', a: 'x' }, { a: 'y' }, null] }))
      .toEqual([{ q: 'a', a: 'b', ex: 'c' }]);
    expect(api.intakeCards({})).toEqual([]);
  });
});

describe('cards.create intake', () => {
  it('creates a deck, appends cards due-now, returns the deck url', async () => {
    const { w, calls, api, state } = boot();
    const res = await api.handleCards({
      action: 'cards.create', from: 'ink',
      payload: { deckTitle: 'Chapter 4', course: 'BIO', cards: [{ q: 'Q1', a: 'A1', ex: 'see p.9' }] },
    });
    const decks = Object.values(state.decks);
    expect(decks).toHaveLength(1);
    expect(decks[0]).toMatchObject({ title: 'Chapter 4', course: 'BIO' });
    expect(decks[0].cards).toHaveLength(1);
    expect(decks[0].cards[0]).toMatchObject({ q: 'Q1', a: 'A1', ex: 'see p.9', status: 'new' });
    expect(res.url).toBe(`/apps/flashcards/?deck=${encodeURIComponent(decks[0].id)}`);
    expect(state.currentId).toBe(decks[0].id);
    await tick();
    expect(calls.puts.find(e => e.type === 'deck')).toMatchObject({ id: decks[0].id, course: 'BIO' });
    expect(calls.emits.find(e => e.t === 'card.created')?.p.count).toBe(1);
  });

  it('finds the existing deck by title and appends without duplicating', async () => {
    const { w, api, state } = boot();
    const deckId = seedDeck(w, 'Shared set');
    const res = await api.handleCards({
      action: 'cards.create', from: 'ink',
      payload: { deckTitle: 'Shared set', cards: [{ q: 'Q1', a: 'A1' }, { q: 'Q3', a: 'A3' }] },
    });
    const decks = Object.values(state.decks);
    expect(decks).toHaveLength(1);                             // no second deck
    expect(decks[0].cards.map(c => c.q)).toEqual(['Q1', 'Q2', 'Q3']); // Q1 deduped
    expect(res.url).toBe(`/apps/flashcards/?deck=${encodeURIComponent(deckId)}`);
  });

  it('falls back to course then "Sent cards" for the deck title', async () => {
    const { api, state } = boot();
    await api.handleCards({ action: 'cards.create', from: 'ink', payload: { course: 'HST', cards: [{ q: 'q', a: 'a' }] } });
    expect(Object.values(state.decks)[0].title).toBe('HST');
    await api.handleCards({ action: 'cards.create', from: 'ink', payload: { cards: [{ q: 'q2', a: 'a2' }] } });
    const titles = Object.values(state.decks).map(d => d.title);
    expect(titles).toContain('Sent cards');
  });
});

describe('problem.retest links', () => {
  it('links each created card back to the source entity as retest', async () => {
    const { calls, api } = boot();
    await api.handleCards({
      action: 'problem.retest', from: 'proof',
      entity: { key: 'proof:attempt:a_9', type: 'attempt', app: 'proof' },
      payload: { deckTitle: 'Retest · kinematics', cards: [{ q: 'Q1', a: 'A1' }, { q: 'Q2', a: 'A2' }] },
    });
    expect(calls.links).toHaveLength(2);
    for (const l of calls.links) {
      expect(l.from).toBe('proof:attempt:a_9');
      expect(l.to).toMatch(/^flashcards:card:u\d+$/);
      expect(l.kind).toBe('retest');
    }
  });
});

describe('card.reviewed + rhythm tail', () => {
  it('a status transition emits card.reviewed and sends log.activity to rhythm', async () => {
    const { w, calls, api, state } = boot();
    seedDeck(w, 'Bio terms');
    await tick();                  // let the saveStore-triggered mirror settle
    await api.mirror();            // baseline publish seeds statuses
    await tick();
    calls.emits.length = 0; calls.sends.length = 0;
    Object.values(state.decks)[0].cards[0].status = 'learning';
    w.saveStore();
    await tick();
    expect(calls.emits.find(e => e.t === 'card.reviewed')?.p).toMatchObject({
      text: 'card reviewed — Bio terms',
    });
    expect(calls.sends.find(s => s.to === 'rhythm')).toMatchObject({
      action: 'log.activity',
      payload: { kind: 'card.reviewed', label: 'card review · Bio terms' },
    });
  });

  it('a reset back to new does not count as a review', async () => {
    const { w, calls, api, state } = boot();
    seedDeck(w, 'Bio terms', 'mastered');
    await tick();
    await api.mirror();
    await tick();
    calls.emits.length = 0; calls.sends.length = 0;
    Object.values(state.decks)[0].cards[0].status = 'new';
    w.saveStore();
    await tick();
    expect(calls.emits.find(e => e.t === 'card.reviewed')).toBeUndefined();
    expect(calls.sends.find(s => s.to === 'rhythm')).toBeUndefined();
  });
});
