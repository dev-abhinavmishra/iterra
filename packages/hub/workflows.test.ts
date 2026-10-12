/* Workflows A–G at the canonical-store contract level: each pins the shape
   the apps' adapters speak to each other through (docs/ADAPTER.md). App
   internals are stubbed with the same window/localStorage harness as
   core.test.ts — a lane that breaks a contract fails here, not in prod. */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function makeLocalStorage() {
  const m = new Map<string, string>();
  const listeners: ((ev: any) => void)[] = [];
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); for (const l of listeners) l({ key: k, newValue: String(v) }); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _onStorage: (l: (ev: any) => void) => listeners.push(l),
  };
}

function freshHub() {
  const ls = makeLocalStorage();
  const listeners: Record<string, ((ev: any) => void)[]> = {};
  const win: any = {
    localStorage: ls,
    location: { href: 'http://localhost/', origin: 'http://localhost', pathname: '/', search: '', hash: '' },
    parent: null,
    document: { readyState: 'complete', addEventListener: () => {}, dispatchEvent: () => true },
    addEventListener: (t: string, fn: any) => {
      (listeners[t] = listeners[t] || []).push(fn);
      if (t === 'storage') ls._onStorage(fn);
    },
    removeEventListener: () => {},
    dispatchEvent: (ev: any) => { for (const fn of listeners[ev.type] || []) fn(ev); return true; },
    CustomEvent: class { type: string; detail: any; constructor(t: string, o: any) { this.type = t; this.detail = o?.detail; } },
    setInterval, clearInterval, setTimeout, clearTimeout,
    BroadcastChannel: undefined, indexedDB: undefined, console, JSON, Math, Date, Promise, URL, URLSearchParams,
  };
  win.window = win; win.parent = win;
  const src = readFileSync(join(__dirname, 'iterra-hub.js'), 'utf8');
  new Function('window', 'document', 'localStorage', 'location', 'history',
    'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
    'console', 'indexedDB', 'BroadcastChannel',
    src)(win, win.document, ls, win.location, { replaceState: () => {} },
    setInterval, clearInterval, setTimeout, clearTimeout,
    console, undefined, undefined);
  return { win, ls };
}

let H: { win: any; ls: ReturnType<typeof makeLocalStorage> };
const T = () => H.win.iterra;
const tick = () => new Promise((r) => setTimeout(r, 30));

async function seedCourse() {
  await T().store.put({ app: 'syllabus', type: 'course', id: 'c-1', title: 'Calculus', data: { code: 'MTH' } });
  return 'syllabus:course:c-1';
}

describe('workflows A–G (store contract)', () => {
  beforeEach(() => { H = freshHub(); });

  it('A — margin note → flashcards cards.create → rhythm logs the review', async () => {
    const cid = await seedCourse();
    // flashcards side: cards.create makes a card and returns its url
    let madeCard: any = null;
    T().intakes.onDeliver('flashcards', 'cards.create', async (rec: any) => {
      madeCard = { app: 'flashcards', type: 'card', id: 'k-9', courseId: rec.entity.courseId, title: rec.payload.cards[0].q };
      await T().store.put({ ...madeCard, data: { dueAt: Date.now() } });
      if (rec.entity?.key) await T().links.add(rec.entity.key, 'flashcards:card:k-9', 'derived');
      return { url: '/apps/flashcards/?deck=d-1' };
    });
    // margin side: send the selection
    const note = { app: 'margin', type: 'note', id: 'n-1', title: 'chain rule', courseId: cid, key: 'margin:note:n-1' };
    const r = await T().send({ to: 'flashcards', action: 'cards.create', entity: note, payload: { courseId: cid, cards: [{ q: 'chain rule?', a: 'dy/dx = dy/du·du/dx' }] } });
    expect(r.delivered).toBe('direct');
    expect(r.url).toContain('deck=d-1');
    // the card exists, linked back to the note
    expect((await T().store.get('flashcards:card:k-9')).courseId).toBe(cid);
    expect((await T().links.for('flashcards:card:k-9')).inn[0].from).toBe('margin:note:n-1');
    // review → card.reviewed event → rhythm's subscription logs it
    const logged: any[] = [];
    T().events.on('card.reviewed', (ev: any) => logged.push(ev));
    await T().events.emit('card.reviewed', { cardId: 'k-9', courseId: cid, text: 'card reviewed — chain rule' });
    expect(logged.length).toBe(1);
    expect(logged[0].payload.cardId).toBe('k-9');
  });

  it('B — ink page region → margin note.create / flashcards card / proof step', async () => {
    const got: Record<string, any> = {};
    for (const [app, action] of [['margin', 'note.create'], ['flashcards', 'cards.create'], ['proof', 'step.append']] as const) {
      T().intakes.onDeliver(app, action, (rec: any) => { got[app] = rec.entity; return { url: `/apps/${app}/` }; });
    }
    const sel = { app: 'ink', type: 'note', id: 'pg-1', title: 'a region of the page' };
    for (const [app, action] of [['margin', 'note.create'], ['flashcards', 'cards.create'], ['proof', 'step.append']] as const) {
      const r = await T().send({ to: app, action, entity: sel });
      expect(r.delivered).toBe('direct');
    }
    expect(got.margin.title).toBe('a region of the page');
    expect(got.proof.app).toBe('ink');
  });

  it('C — proof attempt diverges → retest card lands in flashcards, linked', async () => {
    const cid = await seedCourse();
    T().intakes.onDeliver('flashcards', 'problem.retest', async (rec: any) => {
      await T().store.put({ app: 'flashcards', type: 'card', id: 'k-r1', courseId: cid, title: rec.payload.cards[0].q, data: { dueAt: Date.now() } });
      if (rec.entity?.key) await T().links.add(rec.entity.key, 'flashcards:card:k-r1', 'retest');
      return { url: '/apps/flashcards/?card=k-r1' };
    });
    await T().store.put({ app: 'proof', type: 'attempt', id: 'at-1', courseId: cid, data: { diverged: true, topic: 'limits' } });
    const evs: any[] = [];
    T().events.on('attempt.diverged', (e: any) => evs.push(e));
    await T().events.emit('attempt.diverged', { attemptId: 'at-1', topic: 'limits', courseId: cid, text: 'attempt diverged — limits' });
    expect(evs.length).toBe(1);
    const r = await T().send({
      to: 'flashcards', action: 'problem.retest',
      entity: { app: 'proof', type: 'attempt', id: 'at-1', key: 'proof:attempt:at-1', courseId: cid },
      payload: { deckTitle: 'Retest · limits', courseId: cid, cards: [{ q: 'evaluate lim x→0 sin x / x', a: '1', ex: 'diverged at squeeze' }] },
    });
    expect(r.url).toContain('k-r1');
    expect((await T().links.for('proof:attempt:at-1')).out[0].to).toBe('flashcards:card:k-r1');
  });

  it('D — syllabus due → timer.start → session.completed → visible everywhere', async () => {
    const cid = await seedCourse();
    await T().store.put({ app: 'syllabus', type: 'commitment', id: 'cm-1', courseId: cid, title: 'ps4', data: { dueAt: Date.now() + 3600000, status: 'open' } });
    // timer side: bound session writes a session entity + emits completed
    T().intakes.onDeliver('timer', 'timer.start', async (rec: any) => {
      const p = rec.payload;
      await T().store.put({ app: 'timer', type: 'session', id: 's-1', courseId: p.courseId, title: p.label, data: { minutes: 45, commitmentId: p.commitmentId } });
      await T().events.emit('session.completed', { sessionId: 's-1', minutes: 45, courseId: p.courseId, text: 'focus · 45m — ps4' });
      return { url: '/apps/timer/?s=s-1' };
    });
    // rhythm side: listens for session.completed → register entry
    T().events.on('session.completed', async (ev: any) => {
      await T().store.put({ app: 'rhythm', type: 'entry', id: 'e-' + ev.payload.sessionId, courseId: ev.payload.courseId, title: ev.payload.text });
    });
    const r = await T().send({ to: 'timer', action: 'timer.start', payload: { label: 'ps4', minutes: 45, commitmentId: 'cm-1', courseId: cid } });
    expect(r.url).toContain('s=s-1');
    await tick();
    expect((await T().store.get('timer:session:s-1')).data.minutes).toBe(45);
    expect((await T().store.get('rhythm:entry:e-s-1')).title).toContain('45m');
    // gradestack side: time spent beside the grade = sessions by courseId
    const mins = (await T().store.list({ type: 'session', courseId: cid })).reduce((n, e) => n + (e.data?.minutes || 0), 0);
    expect(mins).toBe(45);
  });

  it('E — study plan inputs are all queryable from the store', async () => {
    const cid = await seedCourse();
    await T().store.put({ app: 'flashcards', type: 'card', id: 'k-1', courseId: cid, title: 'c1', data: { dueAt: Date.now() - 1 } });
    await T().store.put({ app: 'flashcards', type: 'card', id: 'k-2', courseId: cid, title: 'c2', data: { dueAt: Date.now() - 1 } });
    await T().store.put({ app: 'proof', type: 'attempt', id: 'a-1', courseId: cid, data: { diverged: true, topic: 'limits' } });
    await T().store.put({ app: 'timer', type: 'session', id: 's-1', courseId: cid, data: { minutes: 40 } });
    const due = await T().store.list({ type: 'card', courseId: cid });
    const weak = (await T().store.list({ type: 'attempt', courseId: cid })).filter((e) => e.data?.diverged);
    const avail = await T().store.list({ type: 'session', courseId: cid });
    expect(due.length).toBe(2);
    expect(weak[0].data?.topic).toBe('limits');
    expect(avail[0].data?.minutes).toBe(40);
  });

  it('F — weights import pulls syllabus course data; grade.entered updates dossier+rhythm', async () => {
    const cid = await seedCourse();
    await T().store.put({ app: 'syllabus', type: 'course', id: 'c-1', title: 'Calculus', data: { code: 'MTH', categories: [{ name: 'exams', weight: 0.6 }, { name: 'psets', weight: 0.4 }] } });
    let imported: any = null;
    T().intakes.onDeliver('gradestack', 'weights.import', async (rec: any) => {
      const c = await T().store.get(rec.payload.courseId);
      imported = c?.data?.categories;
      return { url: '/apps/gradestack/' };
    });
    await T().send({ to: 'gradestack', action: 'weights.import', payload: { courseId: cid } });
    await tick();
    expect(imported).toEqual([{ name: 'exams', weight: 0.6 }, { name: 'psets', weight: 0.4 }]);
    const seen: any[] = [];
    T().events.on('grade.entered', (e: any) => seen.push(e));
    await T().store.put({ app: 'gradestack', type: 'grade', id: 'g-1', courseId: cid, title: 'midterm', data: { score: 88 } });
    await T().events.emit('grade.entered', { gradeId: 'g-1', courseId: cid, course: 'MTH', score: 88, text: 'grade entered: midterm' });
    expect(seen[0].payload.score).toBe(88);
    // dossier reads grades by courseId — mounted or not
    expect((await T().store.list({ type: 'grade', courseId: cid }))[0].title).toBe('midterm');
  });

  it('G — one courseId answers every dossier question without mounting an app', async () => {
    const cid = await seedCourse();
    await T().store.put({ app: 'syllabus', type: 'commitment', id: 'cm-1', courseId: cid, title: 'ps4', url: '/apps/syllabus/?c=cm-1', data: { dueAt: Date.now() + 86400000, status: 'open' } });
    await T().store.put({ app: 'flashcards', type: 'card', id: 'k-1', courseId: cid, title: 'q', data: { dueAt: Date.now() - 1 } });
    await T().store.put({ app: 'timer', type: 'session', id: 's-1', courseId: cid, data: { minutes: 30 } });
    await T().store.put({ app: 'gradestack', type: 'grade', id: 'g-1', courseId: cid, data: { score: 91 } });
    const all = await T().store.list({ courseId: cid });
    expect(all.filter((e) => e.type === 'commitment')[0].title).toBe('ps4');
    expect(all.filter((e) => e.type === 'card').length).toBe(1);
    expect(all.filter((e) => e.type === 'session')[0].data?.minutes).toBe(30);
    expect(all.filter((e) => e.type === 'grade')[0].data?.score).toBe(91);
  });
});
