/* Canonical store contract — runs the REAL iterra-hub.js in plain node with
   window/localStorage stubbed (the same pattern as the apps' publish pins).
   No IndexedDB in node → exercises the localStorage fallback path; the IDB
   path is covered by terrain smoke over CDP. */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function makeLocalStorage() {
  const m = new Map<string, string>();
  const listeners: ((ev: any) => void)[] = [];
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
      for (const l of listeners) l({ key: k, newValue: String(v) });
    },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _fire: (k: string, v: string | null) => { for (const l of listeners) l({ key: k, newValue: v }); },
    _onStorage: (l: (ev: any) => void) => listeners.push(l),
    _m: m,
  };
}

declare global {
  // eslint-disable-next-line no-var
  var window: any;
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
    removeEventListener: (t: string, fn: any) => {
      listeners[t] = (listeners[t] || []).filter((f) => f !== fn);
    },
    dispatchEvent: (ev: any) => {
      for (const fn of listeners[ev.type] || []) fn(ev);
      return true;
    },
    CustomEvent: class { type: string; detail: any; constructor(t: string, o: any) { this.type = t; this.detail = o?.detail; } },
    MessageEvent: class { type = 'message'; data: any; constructor(_t: string, o: any) { this.data = o?.data; } },
    setInterval, clearInterval, setTimeout, clearTimeout,
    BroadcastChannel: undefined, indexedDB: undefined,
    console, JSON, Math, Date, Promise, URL, URLSearchParams,
  };
  win.window = win;
  win.parent = win; // not framed
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

describe('canonical store (localStorage fallback)', () => {
  beforeEach(() => { H = freshHub(); });

  it('validates + persists entities; composite key', async () => {
    const r = await T().store.put({ app: 'syllabus', type: 'course', id: 'c-1', title: 'Calculus', data: { code: 'MTH' } });
    expect(r.ok).toBe(true);
    expect(r.entity.key).toBe('syllabus:course:c-1');
    const got = await T().store.get('syllabus:course:c-1');
    expect(got.title).toBe('Calculus');
    expect(got.v).toBe(1);
  });

  it('preserves createdAt on re-put, bumps updatedAt', async () => {
    await T().store.put({ app: 'ink', type: 'note', id: 'n1', title: 'a', createdAt: 1000 });
    const r = await T().store.put({ app: 'ink', type: 'note', id: 'n1', title: 'b' });
    expect(r.entity.createdAt).toBe(1000);
    expect(r.entity.title).toBe('b');
  });

  it('rejects malformed writes + quarantines them', async () => {
    const r = await T().store.put({ app: 'x', type: 'not-a-type', id: '1' });
    expect(r.ok).toBe(false);
    const q = JSON.parse(H.ls.getItem('iterra.v1.quarantine') || '[]');
    expect(q.length).toBe(1);
    expect(q[0].reason).toMatch(/type/);
  });

  it('list filters by app/type/courseId; search hits title+sub', async () => {
    await T().store.put({ app: 'syllabus', type: 'course', id: 'c-1', title: 'Calculus', data: { code: 'MTH' } });
    await T().store.put({ app: 'proof', type: 'problem', id: 'p-1', title: 'limits drill', courseId: 'syllabus:course:c-1' });
    await T().store.put({ app: 'ink', type: 'note', id: 'n-1', title: 'unrelated' });
    expect((await T().store.list({ type: 'problem' })).length).toBe(1);
    expect((await T().store.list({ courseId: 'syllabus:course:c-1' })).length).toBe(1);
    expect((await T().store.search('limits')).length).toBe(1);
    expect((await T().store.list({})).length).toBe(3);
  });

  it('courses.byCode resolves case-insensitively on data.code', async () => {
    await T().store.put({ app: 'syllabus', type: 'course', id: 'c-1', title: 'Calculus', data: { code: 'MTH' } });
    const c = await T().courses.byCode('mth');
    expect(c.key).toBe('syllabus:course:c-1');
    expect(await T().courses.byCode('nope')).toBe(null);
  });

  it('events: emit journals, rejects unknown types, feed() stays compat', async () => {
    const bad = await T().events.emit('bogus.thing', {});
    expect(bad.ok).toBe(false);
    await T().events.emit('session.completed', { text: 'focus · 45m', course: 'MTH', sessionId: 's1' });
    const evs = await T().events.list({});
    expect(evs.length).toBe(1);
    expect(evs[0].type).toBe('session.completed');
    const feedDoc = JSON.parse(H.ls.getItem('iterra.v1.doc.feed') || '{}');
    expect(feedDoc.items[0].text).toBe('focus · 45m');
    expect(feedDoc.items[0].course).toBe('MTH');
  });

  it('links: add, backlinks, remove', async () => {
    await T().links.add('margin:note:n1', 'flashcards:card:k1', 'derived');
    const ls = await T().links.for('flashcards:card:k1');
    expect(ls.inn.length).toBe(1);
    expect(ls.inn[0].from).toBe('margin:note:n1');
    expect((await T().links.for('margin:note:n1')).out.length).toBe(1);
    await T().links.remove('margin:note:n1', 'flashcards:card:k1', 'derived');
    expect((await T().links.for('flashcards:card:k1')).inn.length).toBe(0);
  });

  it('send-to: queues for unmounted, delivers to a registered handler', async () => {
    const r = await T().send({ to: 'flashcards', action: 'cards.create', entity: { app: 'margin', type: 'note', id: 'n1', title: 'Sel' } });
    expect(r.ok).toBe(true);
    expect(r.delivered).toBe('queued');
    expect(r.url).toContain('?intake=');
    const pend = await T().intakes.pending('flashcards');
    expect(pend.length).toBe(1);
    expect(pend[0].action).toBe('cards.create');

    let seen: any = null;
    T().intakes.onDeliver('flashcards', 'cards.create', (rec: any) => {
      seen = rec;
      return { url: '/apps/flashcards/?deck=d-9' };
    });
    await new Promise((r2) => setTimeout(r2, 30));
    expect(seen.entity.id).toBe('n1');
    expect((await T().intakes.pending('flashcards')).length).toBe(0);
    const rec = await T().intakes.get(r.id);
    expect(rec.delivered).toBeTruthy();
    expect(rec.result.url).toBe('/apps/flashcards/?deck=d-9');
  });

  it('adapter() registers presence + intake handlers + wake', async () => {
    let woke = false;
    let delivered: any = null;
    T().adapter({
      name: 'rhythm', title: 'Rhythm', summary: () => ({ pending: 1 }),
      intakes: { 'log.activity': (rec: any) => { delivered = rec; return { url: '/apps/rhythm/' }; } },
      wake: () => { woke = true; },
    });
    const apps = JSON.parse(H.ls.getItem('iterra.v1.apps') || '{}');
    expect(apps.rhythm.title).toBe('Rhythm');
    await T().send({ to: 'rhythm', action: 'log.activity', payload: { kind: 'card.reviewed' } });
    await new Promise((r2) => setTimeout(r2, 30));
    expect(delivered.payload.kind).toBe('card.reviewed');
    // wake dispatch via window message
    for (const fn of (T() && (H.win as any)._lsn ? [] : [])) void fn;
    // simulate the shell's postMessage
    const handlers = (H as any).win;
    (handlers as any).dispatchEvent({ type: 'message', data: { type: 'iterra:wake' } });
    await new Promise((r2) => setTimeout(r2, 10));
    expect(woke).toBe(true);
  });
});
