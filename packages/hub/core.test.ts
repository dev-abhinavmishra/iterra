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

describe('sync attach — per-key merge + persisted checkpoint', () => {
  beforeEach(() => { H = freshHub(); });

  const remoteEntity = (key: string, updatedAt: number, title = 'r', extra: any = {}): any => {
    const [app, type, id] = key.split(':');
    return { key, app, type, id, title, updatedAt, v: 1, ...extra };
  };

  it('regression: remote rows older than the newest LOCAL entity still merge (no global watermark)', async () => {
    // Local already has a fresh entity — under the old max-local watermark a
    // remote row stamped before it would never be pulled. Now `since` is the
    // persisted pull checkpoint (0 on first attach), so the row arrives.
    await T().store.put({ app: 'margin', type: 'note', id: 'fresh', title: 'local' });
    const pulled: number[] = [];
    const r = await T().sync.attach({
      name: 't',
      pull: async (since: number) => { pulled.push(since); return [remoteEntity('margin:note:old', 1)]; },
      put: async () => {},
    });
    expect(r.ok).toBe(true);
    expect(pulled[0]).toBe(0); // first attach pulls from the beginning
    const got = await T().store.get('margin:note:old');
    expect(got?.title).toBe('r');
  });

  it('per-key LWW: local-newer is kept and pushed back out; remote-newer wins', async () => {
    const put = await T().store.put({ app: 'margin', type: 'note', id: 'n1', title: 'local-new' });
    const localTs = put.entity.updatedAt;
    const pushed: any[] = [];
    const r = await T().sync.attach({
      name: 't',
      pull: async () => [
        remoteEntity('margin:note:n1', localTs - 5000, 'remote-old'),   // local wins
        remoteEntity('margin:note:n2', localTs + 5000, 'remote-new'),   // remote wins
      ],
      put: async (e: any) => { pushed.push(e); },
    });
    expect(r.ok).toBe(true);
    expect((await T().store.get('margin:note:n1'))?.title).toBe('local-new');
    expect((await T().store.get('margin:note:n2'))?.title).toBe('remote-new');
    expect(pushed.length).toBe(1);
    expect(pushed[0].title).toBe('local-new'); // converge the remote toward local
  });

  it('onConflict receives the real local copy; merge puts do not echo back out', async () => {
    await T().store.put({ app: 'margin', type: 'note', id: 'n1', title: 'local-old' });
    const seen: any[] = [];
    const pushed: any[] = [];
    await T().sync.attach({
      name: 't',
      pull: async () => [remoteEntity('margin:note:n1', Date.now() + 5000, 'remote-new')],
      put: async (e: any) => { pushed.push(e); },
      onConflict: (l: any, r: any) => { seen.push([l?.title || null, r.title]); return r; },
    });
    expect(seen).toEqual([['local-old', 'remote-new']]);
    await new Promise((r2) => setTimeout(r2, 20));
    expect(pushed.length).toBe(0); // applied remote rows must not re-push
  });

  it('checkpoint persists per adapter — second attach resumes from pull-start, not 0', async () => {
    const pulls: number[] = [];
    const adapter = {
      name: 'ck',
      pull: async (since: number) => { pulls.push(since); return []; },
      put: async () => {},
    };
    await T().sync.attach(adapter);
    await T().sync.attach(adapter);
    expect(pulls[0]).toBe(0);
    expect(pulls[1]).toBeGreaterThan(0);
    expect(pulls[1]).toBeLessThanOrEqual(Date.now());
    // a different adapter name starts its own checkpoint from 0
    const pulls2: number[] = [];
    await T().sync.attach({ name: 'other', pull: async (s: number) => { pulls2.push(s); return []; }, put: async () => {} });
    expect(pulls2[0]).toBe(0);
  });

  it('merged rows keep the remote updatedAt stamp — LWW compares real edit times', async () => {
    await T().sync.attach({
      name: 't',
      pull: async () => [remoteEntity('margin:note:r1', 40000, 'r')],
      put: async () => {},
    });
    const got = await T().store.get('margin:note:r1');
    /* validateEntity restamps updatedAt on a normal put — a merge must
       preserve the remote stamp or the local copy masquerades as the
       freshest edit forever after. */
    expect(got?.updatedAt).toBe(40000);
  });

  it('echo suppression is per-key: a concurrent put on another key still pushes', async () => {
    const pushed: any[] = [];
    await T().sync.attach({
      name: 't',
      pull: async () => [remoteEntity('margin:note:m', Date.now() + 5000, 'remote')],
      put: async (e: any) => { pushed.push(e); },
      onConflict: (_l: any, r: any) => {
        /* A local write to a DIFFERENT key inside the merge window — under a
           global merging flag this put could be swallowed and never push. */
        void T().store.put({ app: 'margin', type: 'note', id: 'live', title: 'concurrent edit' });
        return r;
      },
    });
    await new Promise((r2) => setTimeout(r2, 30));
    expect(pushed.some((e) => e.id === 'm')).toBe(false);   // merged row didn't echo
    expect(pushed.some((e) => e.id === 'live')).toBe(true); // concurrent local put DID push
  });

  it('async put/remove rejections surface in sync.status().error', async () => {
    await T().sync.attach({ name: 't', pull: async () => [], put: async () => { throw new Error('boom'); } });
    await T().store.put({ app: 'margin', type: 'note', id: 'x', title: 'x' });
    await new Promise((r2) => setTimeout(r2, 20));
    expect(T().sync.status().error).toMatch(/boom/);
  });

  it('same-stamp divergence resolves canonically — canon-max wins on EVERY replica', async () => {
    const put = await T().store.put({ app: 'margin', type: 'note', id: 'n1', title: 'zzz-local' });
    const pushed: any[] = [];
    /* Remote ties the stamp AND createdAt — only the title differs, so the
       canonical comparison reduces to it: '"title":"zzz-local"' is the larger
       canon, so LOCAL wins deterministically and is pushed back out. A
       per-device "local wins" rule would leave two replicas permanently
       diverged; canon order picks the same body everywhere. */
    await T().sync.attach({
      name: 't',
      pull: async () => [remoteEntity('margin:note:n1', put.entity.updatedAt, 'aaa-remote', { createdAt: put.entity.createdAt })],
      put: async (e: any) => { pushed.push(e); },
    });
    await new Promise((r2) => setTimeout(r2, 20));
    expect((await T().store.get('margin:note:n1'))?.title).toBe('zzz-local');
    expect(pushed.some((e) => e.id === 'n1' && e.title === 'zzz-local')).toBe(true);
  });

  it('same-stamp divergence — a remote canon-max merges in WITHOUT echoing back', async () => {
    const put = await T().store.put({ app: 'margin', type: 'note', id: 'n2', title: 'aaa-local' });
    const pushed: any[] = [];
    await T().sync.attach({
      name: 't',
      // 'zzz-remote' beats 'aaa-local' canon-wise — the remote body wins and
      // is merged locally; being a merge it must NOT be pushed back out.
      pull: async () => [remoteEntity('margin:note:n2', put.entity.updatedAt, 'zzz-remote', { createdAt: put.entity.createdAt })],
      put: async (e: any) => { pushed.push(e); },
    });
    await new Promise((r2) => setTimeout(r2, 20));
    expect((await T().store.get('margin:note:n2'))?.title).toBe('zzz-remote');
    expect(pushed.length).toBe(0);
  });

  it('a remote tombstone removes the local copy — and does not echo a delete', async () => {
    await T().store.put({ app: 'margin', type: 'note', id: 'd1', title: 'gone' });
    const removed: string[] = [];
    await T().sync.attach({
      name: 't',
      pull: async () => [{ key: 'margin:note:d1', __deleted: true, deletedAt: Date.now() + 5000 }],
      put: async () => {},
      remove: async (k: string) => { removed.push(k); },
    });
    await new Promise((r2) => setTimeout(r2, 20));
    expect(await T().store.get('margin:note:d1')).toBeFalsy();
    expect(removed.length).toBe(0); // merge-applied remove is echo-suppressed
  });

  it('a local edit newer than the tombstone survives and resurrect-pushes', async () => {
    const put = await T().store.put({ app: 'margin', type: 'note', id: 'd2', title: 'alive' });
    const pushed: any[] = [];
    await T().sync.attach({
      name: 't',
      // remote deleted an older revision — our local edit is newer, so it
      // wins and is pushed back to un-tombstone the remote row
      pull: async () => [{ key: 'margin:note:d2', __deleted: true, deletedAt: put.entity.updatedAt - 1000, updatedAt: 1 }],
      put: async (e: any) => { pushed.push(e); },
      remove: async () => { throw new Error('must not be called'); },
    });
    await new Promise((r2) => setTimeout(r2, 20));
    expect((await T().store.get('margin:note:d2'))?.title).toBe('alive');
    expect(pushed.some((e) => e.id === 'd2')).toBe(true);
  });

  it('checkpoint lives in the adapter watermark domain, backed off by the overlap', async () => {
    const pulls: number[] = [];
    const adapter = {
      name: 'wm',
      // {rows, watermark}: the stamp domain is the adapter's (e.g. a
      // server-side synced_at), NOT the reader's local pull-start clock —
      // that's what lets late-committed rows still arrive.
      pull: async (since: number) => { pulls.push(since); return { rows: [], watermark: 100000 }; },
      put: async () => {},
    };
    await T().sync.attach(adapter);
    await T().sync.attach(adapter);
    expect(pulls[0]).toBe(0);
    expect(pulls[1]).toBe(100000 - 60000); // watermark minus SYNC_CK_OVERLAP_MS
  });

  it('the checkpoint never regresses to a lower watermark', async () => {
    const pulls: number[] = [];
    const mk = (watermark: number) => ({
      name: 'nr',
      pull: async (s: number) => { pulls.push(s); return { rows: [] as any[], watermark }; },
      put: async () => {},
    });
    await T().sync.attach(mk(200000));
    await T().sync.attach(mk(50000)); // a thin/older watermark must not reopen history
    expect(pulls[1]).toBe(200000 - 60000);
  });

  it('a failed merge does NOT advance the checkpoint — the window re-pulls', async () => {
    const pulls: number[] = [];
    let bomb = true;
    const put = await T().store.put({ app: 'margin', type: 'note', id: 'fc', title: 'l' });
    const adapter = {
      name: 'failck',
      pull: async (s: number) => { pulls.push(s); return [remoteEntity('margin:note:fc', put.entity.updatedAt + 5000, 'fc')]; },
      put: async () => {},
      onConflict: (_l: any, r: any) => {
        if (bomb) { bomb = false; throw new Error('merge blew up'); }
        return r;
      },
    };
    const r1 = await T().sync.attach(adapter);
    expect(r1.ok).toBe(false); // the merge threw — pull counts as failed
    const r2 = await T().sync.attach(adapter);
    expect(r2.ok).toBe(true);
    expect(pulls).toEqual([0, 0]); // checkpoint held — nothing skipped
    expect((await T().store.get('margin:note:fc'))?.title).toBe('fc');
  });

  it('a user write racing a merge is not clobbered — CAS aborts and re-resolves', async () => {
    const put = await T().store.put({ app: 'margin', type: 'note', id: 'r1', title: 'old' });
    const pushed: any[] = [];
    let raced = false;
    /* ensure a write made NOW stamps newer than the remote row's */
    await new Promise((r) => setTimeout(r, 10));
    await T().sync.attach({
      name: 't',
      // remote stamp beats the OLD local (wins the decision) but loses to
      // a write made during the merge — the CAS must catch the race and
      // re-resolve instead of silently overwriting the user's edit.
      pull: async () => [remoteEntity('margin:note:r1', put.entity.updatedAt + 5, 'remote-new')],
      put: async (e: any) => { pushed.push(e); },
      onConflict: (_l: any, r: any) => {
        if (!raced) {
          raced = true;
          void T().store.put({ app: 'margin', type: 'note', id: 'r1', title: 'user-race' });
        }
        return r;
      },
    });
    await new Promise((r) => setTimeout(r, 40));
    expect((await T().store.get('margin:note:r1'))?.title).toBe('user-race');
    expect(pushed.some((e) => e.id === 'r1' && e.title === 'user-race')).toBe(true);
  });

  it('a remote row failing validation is quarantined-and-skipped — never remotely deleted', async () => {
    const calls: string[] = [];
    await T().sync.attach({
      name: 'v1',
      // 'bogus' is not a catalogued entity type → storePut quarantines it.
      // The merge must NOT enqueue a remove: that would tombstone the remote
      // row and propagate the delete to every peer — data loss, not quarantine.
      pull: async () => [{ key: 'margin:note:bad', app: 'margin', type: 'bogus', id: 'bad', title: 'x', updatedAt: Date.now() + 5000 }],
      put: async (e: any) => { calls.push('put:' + e.key); },
      remove: async (k: string) => { calls.push('remove:' + k); },
    });
    await new Promise((r2) => setTimeout(r2, 20));
    expect(calls).toEqual([]);
    expect(await T().store.get('margin:note:bad')).toBeFalsy();
    /* …but the row IS quarantined locally for inspection */
    const q = JSON.parse(H.ls.getItem('iterra.v1.quarantine') || '[]');
    expect(q.some((r: any) => r.raw === 'margin:note:bad')).toBe(true);
  });

  it('a remote row failing validation does not get clobbered by the stale local copy', async () => {
    const put = await T().store.put({ app: 'margin', type: 'note', id: 'same', title: 'local-old' });
    const calls: string[] = [];
    await T().sync.attach({
      name: 'v2',
      // remote wins the stamp compare but fails validation — pushing the
      // older local body back out would clobber the remote's newer write
      pull: async () => [{ key: 'margin:note:same', app: 'margin', type: 'bogus', id: 'same', updatedAt: put.entity.updatedAt + 5000 }],
      put: async (e: any) => { calls.push('put:' + e.key); },
      remove: async (k: string) => { calls.push('remove:' + k); },
    });
    await new Promise((r2) => setTimeout(r2, 20));
    expect(calls).toEqual([]);
    expect((await T().store.get('margin:note:same'))?.title).toBe('local-old'); // local untouched
  });

  it('a validation-skipped merge releases the per-key suppression — later puts still push', async () => {
    const pushed: any[] = [];
    await T().sync.attach({
      name: 'v3',
      pull: async () => [{ key: 'margin:note:flag', app: 'margin', type: 'bogus', id: 'flag', updatedAt: Date.now() + 5000 }],
      put: async (e: any) => { pushed.push(e); },
    });
    /* _sync.merging[key] left set by a skipped merge would swallow this push */
    await T().store.put({ app: 'margin', type: 'note', id: 'flag', title: 'now-valid' });
    await new Promise((r2) => setTimeout(r2, 20));
    expect(pushed.some((e) => e.id === 'flag' && e.title === 'now-valid')).toBe(true);
  });

  it('a validation-skipped merge leaves prior owed ops intact', async () => {
    let down = true;
    const calls: string[] = [];
    let remoteRows: any[] = [];
    await T().sync.attach({
      name: 'v4',
      pull: async () => remoteRows,
      put: async (e: any) => { calls.push('put:' + e.key); },
      remove: async (k: string) => {
        if (down) throw new Error('down');
        calls.push('remove:' + k);
      },
    }, { pollMs: 10 });
    /* a remote delete that hasn't landed yet — owed {remove, k, at} */
    await T().store.put({ app: 'margin', type: 'note', id: 'k', title: 'x' });
    await T().store.remove('margin:note:k');
    await new Promise((r2) => setTimeout(r2, 10));
    expect(T().sync.status().queued).toBe(1);
    /* the remote then offers a bogus row for the SAME key — the merge must
       skip it WITHOUT clobbering the owed remove; the next drain still lands
       the delete remotely. */
    remoteRows = [{ key: 'margin:note:k', app: 'margin', type: 'bogus', id: 'k', updatedAt: Date.now() + 5000 }];
    down = false;
    await new Promise((r2) => setTimeout(r2, 80));
    expect(calls).toContain('remove:margin:note:k');
    expect(T().sync.status().queued).toBe(0);
  });

  it('a bound adapter keeps re-pulling on its interval — remote edits land without re-attach', async () => {
    let remoteRows: any[] = [];
    let pulls = 0;
    await T().sync.attach({
      name: 't',
      pull: async () => { pulls++; return remoteRows; },
      put: async () => {},
    }, { pollMs: 10 });
    expect(pulls).toBe(1);
    // a remote write arrives after attach — the interval must fetch it
    remoteRows = [remoteEntity('margin:note:late', Date.now(), 'late')];
    await new Promise((r2) => setTimeout(r2, 80));
    expect(pulls).toBeGreaterThanOrEqual(2);
    expect((await T().store.get('margin:note:late'))?.title).toBe('late');
  });
});

describe('outbound retry queue — failed pushes are owed, not dropped', () => {
  beforeEach(() => { H = freshHub(); });

  const remoteEntity = (key: string, updatedAt: number, title = 'r'): any => {
    const [app, type, id] = key.split(':');
    return { key, app, type, id, title, updatedAt, v: 1 };
  };

  it('a failed put is queued and delivered on a later tick once the remote recovers', async () => {
    let down = true;
    const pushed: any[] = [];
    await T().sync.attach({
      name: 'q1',
      pull: async () => [],
      put: async (e: any) => { if (down) throw new Error('down'); pushed.push(e); },
    }, { pollMs: 10 });
    await T().store.put({ app: 'margin', type: 'note', id: 'k1', title: 'v1' });
    await new Promise((r) => setTimeout(r, 40));
    expect(pushed.length).toBe(0);                       // every attempt failed so far
    expect(T().sync.status().queued).toBe(1);            // …but the write is still owed
    down = false;
    await new Promise((r) => setTimeout(r, 60));
    expect(pushed.some((e) => e.id === 'k1')).toBe(true);
    expect(T().sync.status().queued).toBe(0);
  });

  it('the queue dedupes by key and re-reads current state — only the freshest body goes out', async () => {
    let down = true;
    const pushed: any[] = [];
    await T().sync.attach({
      name: 'q2',
      pull: async () => [],
      put: async (e: any) => { if (down) throw new Error('down'); pushed.push(e); },
    }, { pollMs: 10 });
    await T().store.put({ app: 'margin', type: 'note', id: 'k2', title: 'stale' });
    await T().store.put({ app: 'margin', type: 'note', id: 'k2', title: 'fresh' });
    await new Promise((r) => setTimeout(r, 30));
    down = false;
    await new Promise((r) => setTimeout(r, 60));
    const titles = pushed.filter((e) => e.id === 'k2').map((e) => e.title);
    expect(titles).toEqual(['fresh']); // one owed op, carrying current truth
  });

  it('a queued op is discharged by a later successful write to the same key', async () => {
    let removeDown = true;
    const calls: string[] = [];
    await T().sync.attach({
      name: 'q3',
      pull: async () => [],
      put: async (e: any) => { calls.push('put:' + e.id); },
      remove: async (k: string) => { calls.push('remove:' + k); if (removeDown) throw new Error('down'); },
    }, { pollMs: 10 });
    await T().store.put({ app: 'margin', type: 'note', id: 'k3', title: 'v1' });
    await T().store.remove('margin:note:k3');   // remove fails → owed
    await T().store.put({ app: 'margin', type: 'note', id: 'k3', title: 'reborn' }); // put succeeds
    removeDown = false;
    await new Promise((r) => setTimeout(r, 60));
    /* The successful reborn put discharges the stale remove — the remote
       must NEVER receive a delete for a live key. */
    expect(calls.filter((c) => c === 'remove:margin:note:k3').length).toBe(1);
    expect((await T().store.get('margin:note:k3'))?.title).toBe('reborn');
  });

  it('a queued remove does not delete a key a remote merge resurrected', async () => {
    let remoteRows: any[] = [];
    const calls: string[] = [];
    await T().sync.attach({
      name: 'q4',
      pull: async () => remoteRows,
      put: async (e: any) => { calls.push('put:' + e.id); },
      remove: async (k: string) => { calls.push('remove:' + k); throw new Error('down'); },
    }, { pollMs: 10 });
    await T().store.put({ app: 'margin', type: 'note', id: 'k4', title: 'v1' });
    await T().store.remove('margin:note:k4');   // remove fails → owed {remove,k4}
    /* A merge-applied remote row lands under echo suppression — no push, so
       the queued remove survives… but the key is alive again. */
    remoteRows = [remoteEntity('margin:note:k4', Date.now() + 5000, 'remote-back')];
    await new Promise((r) => setTimeout(r, 60));
    expect(calls.filter((c) => c === 'remove:margin:note:k4').length).toBe(1); // only the original attempt
    expect((await T().store.get('margin:note:k4'))?.title).toBe('remote-back');
  });

  it('an owed remove outranks a sync-resurrected copy older than the delete', async () => {
    const calls: string[] = [];
    let down = true;
    /* honest remote: the row stays live until a remove actually lands, then
       pulls report the tombstone */
    let remote: 'live' | 'gone' = 'live';
    await T().sync.attach({
      name: 'q6',
      pull: async () => remote === 'live'
        ? [remoteEntity('margin:note:k6', Date.now() - 60000, 'zombie')]
        : [{ key: 'margin:note:k6', __deleted: true, deletedAt: Date.now() }],
      put: async (e: any) => { calls.push('put:' + e.id); },
      remove: async (k: string) => {
        calls.push('remove:' + k);
        if (down) throw new Error('down');
        remote = 'gone';
      },
    }, { pollMs: 10 });
    await T().store.put({ app: 'margin', type: 'note', id: 'k6', title: 'v1' });
    await T().store.remove('margin:note:k6');   // remote remove fails → owed {remove,k6,at}
    /* The remote never got the delete — its copy (stamped BEFORE the delete)
       pulls back in and resurrects locally. The owed remove must still win:
       re-delete the local copy AND keep retrying the remote tombstone —
       without this, every failed delete quietly un-deletes. */
    await new Promise((r) => setTimeout(r, 40));
    down = false;
    await new Promise((r) => setTimeout(r, 80));
    expect(await T().store.get('margin:note:k6')).toBeFalsy();
    expect(calls.filter((c) => c === 'remove:margin:note:k6').length).toBeGreaterThan(1);
  });

  it('owed ops persist under the adapter name across re-attach (reload-safe)', async () => {
    let down = true;
    const pushed: any[] = [];
    const mk = (name: string) => ({
      name,
      pull: async (): Promise<any[]> => [],
      put: async (e: any) => { if (down) throw new Error('down'); pushed.push(e); },
    });
    await T().sync.attach(mk('q5'));
    await T().store.put({ app: 'margin', type: 'note', id: 'k5', title: 'v' });
    await new Promise((r) => setTimeout(r, 30));
    expect(pushed.length).toBe(0);
    /* Re-attach (as after a reload): 'q5's backlog was persisted and is
       still owed — the first successful tick drains it. */
    down = false;
    await T().sync.attach(mk('q5'));
    await new Promise((r) => setTimeout(r, 60));
    expect(pushed.some((e) => e.id === 'k5')).toBe(true);
    expect(T().sync.status().queued).toBe(0);
  });
});
