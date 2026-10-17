// Contract pin — the sample semester's seed/remove semantics.
//   seed     → folio/cardfile/timer envelopes get demo-prefixed rows merged
//              into whatever was already there; hub entities go through
//              store.put; intakes land in the LS bucket when no IDB exists.
//   idempotent → a second seed is a no-op ({already:true}), never doubles rows.
//   remove   → every demo-prefixed row is swept from every lane; user data
//              written before or after the seed survives untouched.
// Runs in plain node like record-session-outcome.test.ts: localStorage and
// window.iterra stubbed BEFORE importing the module under test.
import { beforeEach, describe, expect, it, vi } from 'vitest';

let store: Map<string, string>;
let puts: Record<string, unknown>[];

const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  /* the doc-index sweep enumerates keys via the storage API, not a list */
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

const installStubs = () => {
  store = new Map();
  puts = [];
  (globalThis as Record<string, unknown>).localStorage = localStorageStub;
  (globalThis as Record<string, unknown>).window = {
    iterra: {
      ready: Promise.resolve(),
      store: {
        put: (e: Record<string, unknown>) => { puts.push(e); return Promise.resolve({ ok: true }); },
        list: () => Promise.resolve(puts.map((e) => ({ key: `${e.app}:${e.type}:${e.id}`, id: e.id }))),
      },
    },
  };
};

const load = async () => {
  vi.resetModules();
  return import('./demo');
};

const folioState = () =>
  (JSON.parse(store.get('syllabus.folio.v1') ?? '{}') as { state?: Record<string, Record<string, { id: string }>> }).state ?? {};

beforeEach(installStubs);

describe('seedDemoSemester', () => {
  it('plants courses, commitments, blocks, decks, sessions and sets the flag', async () => {
    const demo = await load();
    const res = await demo.seedDemoSemester();
    expect(res.ok).toBe(true);

    const s = folioState();
    expect(Object.keys(s.courses).filter((k) => k.startsWith('demo-'))).toHaveLength(3);
    expect(Object.keys(s.commitments).filter((k) => k.startsWith('demo-')).length).toBeGreaterThanOrEqual(7);
    expect(Object.keys(s.blocks).filter((k) => k.startsWith('demo-'))).toHaveLength(2);
    expect(s.terms['demo-fall']).toBeTruthy();
    expect(s.activeTermId).toBe('demo-fall');

    const decks = JSON.parse(store.get('cardfile.decks.v1') ?? '{}');
    expect(Object.keys(decks).filter((k) => k.startsWith('demo-'))).toHaveLength(2);
    expect(decks['demo-deck-bio'].cards).toHaveLength(6);

    const sessions = JSON.parse(store.get('timer.sessions.v1') ?? '[]');
    expect(sessions.filter((x: { id: string }) => x.id.startsWith('demo-'))).toHaveLength(5);

    expect(demo.isDemoLoaded()).toBe(true);
  });

  it('merges into existing folio data instead of replacing it', async () => {
    localStorageStub.setItem('syllabus.folio.v1', JSON.stringify({
      state: {
        terms: { 'real-term': { id: 'real-term' } },
        activeTermId: 'real-term',
        courses: { 'real-course': { id: 'real-course' } },
        commitments: { 'real-c1': { id: 'real-c1' } },
        blocks: {}, links: {}, reviews: {}, dismissed: {},
      },
      version: 1,
    }));
    const demo = await load();
    await demo.seedDemoSemester();
    const s = folioState();
    expect(s.courses['real-course']).toBeTruthy();
    expect(s.commitments['real-c1']).toBeTruthy();
    /* user's active term is never hijacked */
    expect(s.activeTermId).toBe('real-term');
    expect(s.courses['demo-bio201']).toBeTruthy();
  });

  it('is idempotent — a second seed changes nothing', async () => {
    const demo = await load();
    await demo.seedDemoSemester();
    const snapshot = store.get('syllabus.folio.v1');
    const putCount = puts.length;
    const again = await demo.seedDemoSemester();
    expect(again.ok).toBe(true);
    expect(again.already).toBe(true);
    expect(store.get('syllabus.folio.v1')).toBe(snapshot);
    expect(puts.length).toBe(putCount);
  });

  it('publishes course entities the registry can resolve by code', async () => {
    const demo = await load();
    await demo.seedDemoSemester();
    const courses = puts.filter((e) => e.type === 'course');
    expect(courses).toHaveLength(3);
    for (const c of courses) {
      expect(c.app).toBe('syllabus');
      expect(typeof (c.data as { code?: string }).code).toBe('string');
    }
    /* commitments carry the canonical course key like the real adapter */
    const commits = puts.filter((e) => e.type === 'commitment');
    expect(commits.length).toBeGreaterThanOrEqual(7);
    for (const c of commits) {
      expect(String(c.courseId)).toMatch(/^syllabus:course:demo-/);
    }
  });

  it('queues intake rows with deterministic demo ids in the LS bucket', async () => {
    const demo = await load();
    await demo.seedDemoSemester();
    const bucket = JSON.parse(store.get('iterra.v1.store.intakes') ?? '{}');
    const ids = Object.keys(bucket).filter((k) => k.startsWith('in-demo-'));
    expect(ids.length).toBe(4);
    expect(bucket['in-demo-ink1'].to).toBe('ink');
    expect(bucket['in-demo-ink1'].delivered).toBeNull();
    expect(bucket['in-demo-proof1'].action).toBe('problem.create');
  });
});

describe('removeDemoData', () => {
  it('sweeps every lane and preserves user rows', async () => {
    const demo = await load();
    /* user data present before the seed */
    localStorageStub.setItem('cardfile.decks.v1', JSON.stringify({
      'user-deck': { id: 'user-deck', title: 'Mine', cards: [] },
    }));
    localStorageStub.setItem('timer.sessions.v1', JSON.stringify([
      { id: 'user-ses', type: 'focus', duration: 1500, timestamp: 1 },
    ]));
    await demo.seedDemoSemester();

    /* simulate a delivered intake artifact: an ink note created from the
       demo intake carries the intake-derived demo id */
    localStorageStub.setItem('ink-notes-storage', JSON.stringify({
      state: {
        notes: [
          { id: 'intake-in-demo-ink1', title: 'Lecture notes' },
          { id: 'user-note', title: 'Mine' },
        ],
        activeNoteId: 'intake-in-demo-ink1',
      },
      version: 4,
    }));

    const res = await demo.removeDemoData();
    expect(res.ok).toBe(true);
    expect(demo.isDemoLoaded()).toBe(false);

    const s = folioState();
    expect(Object.keys(s.courses ?? {})).toEqual([]);
    expect(Object.keys(s.commitments ?? {}).filter((k) => k.startsWith('demo-'))).toEqual([]);

    const decks = JSON.parse(store.get('cardfile.decks.v1') ?? '{}');
    expect(Object.keys(decks)).toEqual(['user-deck']);

    const sessions = JSON.parse(store.get('timer.sessions.v1') ?? '[]');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('user-ses');

    const ink = JSON.parse(store.get('ink-notes-storage') ?? '{}');
    expect(ink.state.notes.map((n: { id: string }) => n.id)).toEqual(['user-note']);
    expect(ink.state.activeNoteId).toBeNull();

    const bucket = JSON.parse(store.get('iterra.v1.store.intakes') ?? '{}');
    expect(Object.keys(bucket).filter((k) => k.startsWith('in-demo-'))).toEqual([]);

    /* feed items tagged demo:true are gone too */
    const feed = JSON.parse(store.get('iterra.v1.doc.feed') ?? '{}');
    expect((feed.items ?? []).every((i: { demo?: boolean }) => i.demo !== true)).toBe(true);
  });

  it('sweeps doc-index mirrors — dossiers/search read these, not the store', async () => {
    const demo = await load();
    await demo.seedDemoSemester();
    /* what syllabus's adapter publishes on mount — demo rows plus one real */
    localStorageStub.setItem('iterra.v1.doc.index.syllabus', JSON.stringify({
      entities: [
        { t: 'block', id: 'demo-blk-bio', title: 'Quiz review', url: '/apps/syllabus/?block=demo-blk-bio' },
        { t: 'note', id: 'intake-in-demo-ink1', title: 'Lecture notes' },
        { t: 'block', id: 'user-block', title: 'Mine', url: '/apps/syllabus/?block=user-block' },
      ],
    }));
    await demo.removeDemoData();
    const idx = JSON.parse(store.get('iterra.v1.doc.index.syllabus') ?? '{}');
    expect(idx.entities).toHaveLength(1);
    expect(idx.entities[0].id).toBe('user-block');
  });

  it('drops shared-context fields pointing at demo courses — the ambient COURSE chip', async () => {
    const demo = await load();
    await demo.seedDemoSemester();
    /* what syllabus publishes while focused: field map {v,by,at} — the
       active course carries the display code, not a demo id */
    localStorageStub.setItem('iterra.v1.doc.shared', JSON.stringify({
      activeCourse: { v: { code: 'BIO 201', name: 'Cell Biology' }, by: 'syllabus', at: 1 },
      today: { v: { slips: 1, nextBlock: { id: 'demo-blk-bio', course: 'BIO 201' } }, by: 'syllabus', at: 1 },
      mood: { v: { note: 'user-set field' }, by: 'rhythm', at: 1 },
    }));
    await demo.removeDemoData();
    const shared = JSON.parse(store.get('iterra.v1.doc.shared') ?? '{}');
    expect(shared.activeCourse).toBeUndefined();
    expect(shared.today).toBeUndefined();
    expect(shared.mood).toBeTruthy();
  });

  it('sweeps feed stirs adapters emitted while draining demo intakes', async () => {
    const demo = await load();
    await demo.seedDemoSemester();
    localStorageStub.setItem('iterra.v1.doc.feed', JSON.stringify({
      items: [
        { app: 'ink', text: 'note set down: Lecture notes — enzyme kinetics', url: '/apps/ink/?note=intake-in-demo-ink1', at: 1 },
        { app: 'timer', text: 'focus · 45m — Essay 2 draft', url: '/apps/timer/', course: 'ENGL 210', at: 2, demo: true },
        { app: 'ink', text: 'note set down: real note', url: '/apps/ink/?note=user-note', at: 3 },
      ],
    }));
    await demo.removeDemoData();
    const feed = JSON.parse(store.get('iterra.v1.doc.feed') ?? '{}');
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].url).toBe('/apps/ink/?note=user-note');
  });

  it('sweeps LS entity/intake buckets carrying intake-derived demo ids', async () => {
    const demo = await load();
    localStorageStub.setItem('iterra.v1.store.entities', JSON.stringify({
      'ink:note:intake-in-demo-ink1': { id: 'intake-in-demo-ink1', key: 'ink:note:intake-in-demo-ink1' },
      'proof:problem:p_in-demo-proof1': { id: 'p_in-demo-proof1', key: 'proof:problem:p_in-demo-proof1' },
      'ink:note:user-note': { id: 'user-note', key: 'ink:note:user-note' },
    }));
    await demo.removeDemoData();
    const ents = JSON.parse(store.get('iterra.v1.store.entities') ?? '{}');
    expect(Object.keys(ents)).toEqual(['ink:note:user-note']);
  });

  it('on an empty terrain removes cleanly and stays ok', async () => {
    const demo = await load();
    const res = await demo.removeDemoData();
    expect(res.ok).toBe(true);
  });
});
