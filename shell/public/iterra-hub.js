/* ── iterra hub ─────────────────────────────────────────────────────────────
   The shared environment bus. One canonical file, served at /iterra-hub.js
   (each app's public dir carries a copy; the build assembles them).
   Sets window.iterra. Safe to load standalone: everything no-ops when the
   page is not inside the iterra shell.

   Provides:
     iterra.register(app, opts)   announce this place + publish summaries
     iterra.open(url)             navigate inside the environment
     iterra.openApp(name, url)    jump to another place
     iterra.selfBase()            '/apps/<name>' when framed, else origin
     iterra.interceptNav()        route window.open / _blank clicks via shell
     iterra.doc(ns)               shared document store (same-origin localStorage)
     iterra.isFramed()            true when running inside the shell
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.iterra) return;

  var APPS_KEY = 'iterra.v1.apps';
  var DOC_PREFIX = 'iterra.v1.doc.';
  var framed = false;
  try { framed = window.parent && window.parent !== window; } catch (e) { framed = false; }
  /* integrated terrain: the shell mounts the places as components in this
     same document — no frame, but the environment contract (say/open/
     hotkeys) still routes through postMessage-to-self. */
  if (!framed && window.__iterraIntegrated === true) framed = true;

  var me = null;
  /* per-app registry — the integrated terrain mounts every place in this
     one document, so register() must hold independent identities, not a
     single global pair. regs[app] = {title, summary, own, timer};
     lastSummary/lastWrite are keyed per app for the same reason. `me`
     stays the *focused* place — open()/feed() attribution — and follows
     iterra.focus() as the terrain switches places. */
  var regs = {};
  var lastSummary = {};
  var lastWrite = {};
  /* pristine window.open, captured before interceptNav patches it — the
     standalone passthroughs must call the real one or they recurse. */
  var origWindowOpen = window.open ? window.open.bind(window) : function () {};

  function readApps() {
    try { return JSON.parse(localStorage.getItem(APPS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function writeApps(map) {
    try { localStorage.setItem(APPS_KEY, JSON.stringify(map)); } catch (e) {}
  }

  function publishSummaryFor(app) {
    var r = regs[app];
    if (!r || !r.summary) return;
    var s;
    try { s = r.summary() || null; } catch (e) { s = null; }
    var j = JSON.stringify(s);
    // heartbeat: identical summaries still refresh `at` every ~10s so the
    // rail can tell a live-but-static place from a dead one's last state
    if (j === lastSummary[app]) {
      var now = Date.now();
      if (now - lastWrite[app] < 10000) return;
      lastWrite[app] = now;
    } else {
      lastSummary[app] = j;
      lastWrite[app] = Date.now();
    }
    var map = readApps();
    var cur = map[app];
    // a solo (unframed) copy never overwrites the framed instance's live
    // presence — but a framed entry gone stale (>35s, writer dead) no
    // longer blocks solo publication
    if (!framed && cur && cur.framed && Date.now() - (cur.at || 0) < 35000) return;
    map[app] = { app: app, title: r.title || app, summary: s, at: Date.now(), framed: framed };
    writeApps(map);
  }
  function publishSummary() { publishSummaryFor(me); }

  function say(msg) {
    if (!framed) return;
    try { window.parent.postMessage(msg, window.location.origin); } catch (e) {}
  }

  /* A navigation request inside the environment. url may be absolute or
     relative; anything under /apps/<place>/ is routed by the shell, other
     same-origin paths are rebased onto this place. */
  function open(url) {
    if (!framed) {
      var solo;
      try { solo = new URL(url, window.location.href); } catch (e) { return; }
      /* http(s)/mailto only — javascript:/data: must never reach window.open */
      if (solo.protocol !== 'http:' && solo.protocol !== 'https:' && solo.protocol !== 'mailto:') return;
      origWindowOpen(solo.href, '_blank', 'noopener'); return;
    }
    /* terrain hash routes ('#/c/<key>' dossier, '#/p/<place>', '#/') pass
       straight through — they address the shell, not a place path */
    if (/^#\//.test(String(url))) {
      say({ type: 'iterra:open', from: me || undefined, url: String(url) });
      return;
    }
    var abs;
    try { abs = new URL(url, window.location.href); } catch (e) { return; }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:' && abs.protocol !== 'mailto:') return;
    if (abs.origin !== window.location.origin) { origWindowOpen(abs.href, '_blank', 'noopener'); return; }
    // '/apps/<name>' with or without a trailing slash both count as place
    // paths — selfBase() emits the bare form and file-back relies on it
    if (!/^\/apps\/[^/]+(\/|$)/.test(abs.pathname) && me) {
      abs = new URL(selfBase() + abs.pathname + abs.search + abs.hash, window.location.origin);
    }
    say({ type: 'iterra:open', from: me || undefined, url: abs.pathname + abs.search + abs.hash });
  }

  function selfBase() {
    // any page served under /apps/<name>/ on this host belongs to the
    // deployment — return links land there framed or solo, so a standalone
    // timer can still file back to a standalone syllabus. Upstream apps
    // (no register call, no /apps/ path) keep the plain origin.
    if (me && (/^\/apps\/[^/]+(\/|$)/.test(window.location.pathname) || window.__iterraIntegrated)) return '/apps/' + me;
    return window.location.origin.replace(/\/$/, '');
  }

  /* Intercept window.open + target=_blank clicks so suite links stay in the
     environment instead of escaping to a bare top-level tab. */
  var navIntercepted = false;
  function interceptNav() {
    if (navIntercepted) return;
    navIntercepted = true;

    var origOpen = window.open;
    window.open = function (url, target, features) {
      var u = String(url || '');
      // popup-document pattern (window.open('') + doc.write) can't be
      // shell-routed — pass it straight through to a real blank window
      if (u.trim() === '' || u === 'about:blank') return origOpen.call(window, url, target, features);
      var abs;
      try { abs = new URL(u, window.location.href); } catch (e) { abs = null; }
      if (abs && abs.protocol !== 'http:' && abs.protocol !== 'https:' && abs.protocol !== 'mailto:') return null;
      if (abs && abs.origin === window.location.origin) {
        open(abs.pathname + abs.search + abs.hash);
        return { closed: false, focus: function () {}, close: function () {}, location: { href: abs.href } };
      }
      return origOpen.call(window, url, target, features);
    };

    document.addEventListener('click', function (ev) {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a) return;
      var abs;
      try { abs = new URL(a.getAttribute('href') || '', window.location.href); } catch (e) { return; }
      if (abs.origin !== window.location.origin) return;
      var m = abs.pathname.match(/^\/apps\/([a-z]+)(\/|$)/); // bare '/apps/x' counts too — open() routes it
      // in-frame navigations only get intercepted when they cross to another
      // place (or to _blank) — own-app links behave normally
      if (!m || (m[1] === me && a.target !== '_blank')) return;
      ev.preventDefault();
      ev.stopPropagation();
      open(abs.pathname + abs.search + abs.hash);
    }, true);

    /* Terrain chords a focused frame would otherwise eat: ⌘K palette,
       ⌘0/` home, ⌘1-8 places. An app shipping its own chord declares it
       at register() via ownKeys (ink/margin own ⌘K) and the terrain
       yields it — a plain defaultPrevented check can't work here because
       app listeners sit at window, which fires AFTER this document one.
       Skipped in the integrated terrain: the shell IS the parent and
       handles the chords itself (ownKeys consulted via iterra.ownKeys). */
    if (!window.__iterraIntegrated) document.addEventListener('keydown', function (ev) {
      if (!framed || ev.defaultPrevented) return;
      if (!(ev.metaKey || ev.ctrlKey) || ev.altKey || ev.shiftKey) return;
      var k = ev.key;
      var fwd = k === 'k' || k === 'K' || k === '`' || k === '0' || (k >= '1' && k <= '8');
      if (!fwd) return;
      var own = (me && regs[me] && regs[me].own) || [];
      if (own.indexOf(k.toLowerCase()) >= 0) return;
      ev.preventDefault();
      say({ type: 'iterra:hotkey', key: k.toLowerCase() });
    });
  }

  function register(app, o) {
    /* keep-alive world: registering doesn't mean you're in front — a lazy
       chunk mounts whenever its place is visited, sometimes while another
       place is focused. `me` belongs to wantMe (set by focus()); a register
       claims it only when this app is the one the terrain wants, or when
       nobody's claimed it yet (standalone/legacy first-register). An
       explicit focus(null) — terrain home — is NOT 'nobody': a background
       register mustn't light up while no place is in front. */
    if (wantMe === undefined || wantMe === app) me = app;
    o = o || {};
    var cur = regs[app];
    regs[app] = { title: o.title || (cur && cur.title), summary: o.summary || (cur && cur.summary), own: o.ownKeys || (cur && cur.own) || [], live: true };
    publishSummaryFor(app);
    say({ type: 'iterra:hello', app: app, url: window.location.pathname + window.location.search });
    if (cur && cur.live) return; // re-registration refreshes summary only —
    // a second heartbeat/listener would double-write the same presence key
    // keep the presence fresh; summaries are cheap (JSON-diffed)
    setInterval(function () { publishSummaryFor(app); }, 3000);
    window.addEventListener('focus', function () { publishSummaryFor(app); });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { publishSummaryFor(app); });
    }
    interceptNav();
  }

  /* the terrain tells the hub which place is in front — `me` follows so
     open()/feed() attribute correctly even when background places stay
     mounted (keep-alive). wantMe remembers the intent when the place's
       chunk is still loading: register() applies it on arrival, and `me`
       drops to null in the gap so the hidden place's key handlers die
       immediately rather than keep firing until the next register.
       undefined = no intent expressed yet; null = intent is 'no place'. */
  var wantMe = undefined;
  function focus(app) {
    wantMe = app || null;
    me = app && regs[app] ? app : null;
  }

  /* the shell's own chord handler asks which keys the active place owns */
  function ownKeys(app) { return (regs[app] && regs[app].own) || []; }

  /* keep-alive places gate their window-level key handlers on this — an
     inactive place's DOM can't hold focus but its listeners still fire. */
  function active() { return me; }

  /* Shared per-namespace documents — the hub store siblings can read.
     Convention: `iterra.doc('shared')` is the commons — every app may read
     and write namespaced fields there (see docs/WIRING.md §7): e.g.
     shared.focus (timer), shared.activeCourse (syllabus), shared.noteActive
     (ink/margin). `iterra.doc('<app>')` is that app's public context doc.
     `shared` values are plain JSON; writers stamp {v, by, at}. */
  function doc(ns) {
    var key = DOC_PREFIX + ns;
    var emit = function (v) {
      try { window.dispatchEvent(new CustomEvent('iterra:doc', { detail: { ns: ns, value: v } })); } catch (e) {}
    };
    return {
      get: function () {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
      },
      set: function (v) {
        try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
        emit(v);
      },
      /* convenience: merge a single field into the doc's object value */
      setField: function (field, v) {
        var cur;
        try { cur = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { cur = null; }
        if (!cur || typeof cur !== 'object' || Array.isArray(cur)) cur = {};
        cur[field] = v;
        try { localStorage.setItem(key, JSON.stringify(cur)); } catch (e) {}
        emit(cur);
      },
      subscribe: function (cb) {
        var h = function (ev) { if (ev.key === key) { try { cb(ev.newValue ? JSON.parse(ev.newValue) : null); } catch (e) {} } };
        var h2 = function (ev) { if (ev.detail && ev.detail.ns === ns) { try { cb(ev.detail.value); } catch (e) {} } };
        window.addEventListener('storage', h);
        window.addEventListener('iterra:doc', h2);
        return function () { window.removeEventListener('storage', h); window.removeEventListener('iterra:doc', h2); };
      },
    };
  }

  /* Read a sibling's live presence entry (or all of them). Entries carry
     {app,title,summary,at,framed}; a `stale` flag is added when the writer
     has been quiet >35s — treat stale data as possibly-dead, not current. */
  function presence(name) {
    var map = readApps();
    var now = Date.now();
    if (name) {
      var e = map[name] || null;
      if (e) e = Object.assign({}, e, { stale: now - e.at > 35000 });
      return e;
    }
    var out = {};
    for (var k in map) { out[k] = Object.assign({}, map[k], { stale: now - map[k].at > 35000 }); }
    return out;
  }

  /* The activity feed — notable events from any app, newest first, capped
     at 30: {app,text,url?,course?,topic?,at}. Apps call iterra.feed({text,url?,course?,topic?}) —
     course/topic tag the stir with its linkage key so dossiers file it. */
  var FEED_KEY = DOC_PREFIX + 'feed';
  function feed(item) {
    var cur;
    try { cur = JSON.parse(localStorage.getItem(FEED_KEY) || 'null'); } catch (e) { cur = null; }
    if (!cur || !Array.isArray(cur.items)) cur = { items: [] };
    /* dedupe: several mounted frames of the same app rehydrating from the
       same store would otherwise each emit the same new event */
    var text = String(item.text || '');
    var now = Date.now();
    for (var i = 0; i < Math.min(cur.items.length, 5); i++) {
      var it0 = cur.items[i];
      if (it0 && it0.app === (me || '?') && it0.text === text && now - it0.at < 2000) return;
    }
    cur.items.unshift({ app: item.app || me || '?', text: text, url: item.url || undefined, course: item.course || undefined, topic: item.topic || undefined, at: now });
    cur.items = cur.items.slice(0, 30);
    try { localStorage.setItem(FEED_KEY, JSON.stringify(cur)); } catch (e) {}
  }
  function readFeedItems() {
    try {
      var d = JSON.parse(localStorage.getItem(FEED_KEY) || 'null');
      return (d && Array.isArray(d.items)) ? d.items : [];
    } catch (e) { return []; }
  }
  function onFeed(cb) {
    var h = function (ev) {
      if (ev.key !== FEED_KEY) return;
      try { cb(readFeedItems()); } catch (e) {}
    };
    window.addEventListener('storage', h);
    return function () { window.removeEventListener('storage', h); };
  }

  /* Subscribe to sibling presence changes (storage-event driven). */
  function onPresence(cb) {
    var h = function (ev) {
      if (ev.key !== APPS_KEY) return;
      try { cb(presence()); } catch (e) {}
    };
    window.addEventListener('storage', h);
    return function () { window.removeEventListener('storage', h); };
  }

  /* Entity indexes — index.<app> docs under the same namespace; apps read
     siblings without knowing the key convention (§7). */
  var INDEX_PREFIX = DOC_PREFIX + 'index.';
  function readIndex(name) {
    var key = INDEX_PREFIX + name;
    try {
      var d = JSON.parse(localStorage.getItem(key) || 'null');
      return (d && Array.isArray(d.entities)) ? d.entities : [];
    } catch (e) { return []; }
  }
  function readIndexes() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(INDEX_PREFIX) === 0) {
          var name = k.slice(INDEX_PREFIX.length);
          if (/^[a-z]+$/.test(name)) out[name] = readIndex(name);
        }
      }
    } catch (e) {}
    return out;
  }

  function onIndex(cb) {
    var h = function (ev) {
      if (!ev.key || ev.key.indexOf(INDEX_PREFIX) !== 0) return;
      try { cb(readIndexes()); } catch (e) {}
    };
    window.addEventListener('storage', h);
    return function () { window.removeEventListener('storage', h); };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     THE CANONICAL STORE (iterra.core v1)

     One entity graph shared by every place and the terrain — the layer the
     index/commons/feed docs were only mirrors of. Entities are typed,
     validated, versioned records:

       { key:'<app>:<type>:<id>', id, type, app, courseId?, course?, topic?,
         title?, sub?, url?, data?, createdAt, updatedAt, v:1 }

     - `key` is the composite primary key (app-namespaced ids may repeat).
     - `courseId` is a foreign key into a `course`-type entity (syllabus owns
       course creation; other apps resolve code → id via iterra.courses).
     - `course`/`topic` remain string display/linkage labels — never
       fabricated ids.
     - `data` carries the app's own payload (≤64KB JSON) — the canonical
       record mirrors enough for the terrain; the app stays the system of
       record for its own internals.

     Persistence: IndexedDB `iterra` (stores: entities, events, links,
     intakes, meta). Falls back to localStorage buckets when IDB is absent —
     same API either way. Cross-frame propagation: BroadcastChannel
     'iterra.core.v1' + a localStorage poke so LS-fallback and non-BC
     environments still see writes. Same-window: 'iterra:store' CustomEvent.

     Validation: writes that fail the schema are REJECTED (return
     {ok:false,error}) and the offender is quarantined to
     iterra.v1.quarantine (cap 20) so a bad publisher can't corrupt readers.
     ═══════════════════════════════════════════════════════════════════════ */

  var SCHEMA_V = 1;
  var DB_NAME = 'iterra';
  var DB_V = 1;
  var ENTITY_TYPES = {
    course: 1, term: 1, assignment: 1, source: 1, note: 1, card: 1,
    deck: 1, quiz: 1, problem: 1, attempt: 1, session: 1, goal: 1,
    grade: 1, routine: 1, experiment: 1, assessment: 1, block: 1,
    commitment: 1, link: 1, event: 1, scan: 1, entry: 1,
  };

  /* The documented event catalogue. emit() accepts only these — an unknown
     verb is a contract bug and gets rejected like a malformed entity. */
  var EVENT_TYPES = {
    'entity.upserted': 1, 'entity.removed': 1,
    'link.added': 1, 'link.removed': 1,
    'course.registered': 1, 'course.renamed': 1,
    'session.started': 1, 'session.completed': 1,
    'card.created': 1, 'card.reviewed': 1,
    'attempt.made': 1, 'attempt.diverged': 1,
    'assignment.due': 1, 'assignment.completed': 1,
    'grade.entered': 1, 'note.created': 1,
    'routine.logged': 1, 'routine.completed': 1, 'routine.planned': 1,
    'session.paused': 1, 'session.resumed': 1,
    'deck.imported': 1, 'send.delivered': 1, 'intake.resolved': 1, 'stir': 1,
  };

  var STORE_BUCKETS = ['entities', 'events', 'links', 'intakes', 'meta'];

  /* ── persistence: IDB with a localStorage mirror-fallback ── */

  var _dbp = null;
  var _dbMode = null; // 'idb' | 'ls'
  function openDB() {
    if (_dbp) return _dbp;
    if (typeof indexedDB === 'undefined') { _dbMode = 'ls'; _dbp = Promise.resolve(null); return _dbp; }
    _dbp = new Promise(function (res) {
      var req;
      try { req = indexedDB.open(DB_NAME, DB_V); } catch (e) { _dbMode = 'ls'; res(null); return; }
      req.onupgradeneeded = function () {
        var d = req.result;
        var e = d.createObjectStore('entities', { keyPath: 'key' });
        e.createIndex('type', 'type', { unique: false });
        e.createIndex('app', 'app', { unique: false });
        e.createIndex('courseId', 'courseId', { unique: false });
        e.createIndex('updatedAt', 'updatedAt', { unique: false });
        var v = d.createObjectStore('events', { keyPath: 'seq', autoIncrement: true });
        v.createIndex('type', 'type', { unique: false });
        v.createIndex('at', 'at', { unique: false });
        var l = d.createObjectStore('links', { keyPath: 'key' });
        l.createIndex('from', 'from', { unique: false });
        l.createIndex('to', 'to', { unique: false });
        var i = d.createObjectStore('intakes', { keyPath: 'id' });
        i.createIndex('to', 'to', { unique: false });
        i.createIndex('at', 'at', { unique: false });
        d.createObjectStore('meta', { keyPath: 'k' });
      };
      req.onsuccess = function () { _dbMode = 'idb'; res(req.result); };
      req.onerror = function () { _dbMode = 'ls'; res(null); };
      req.onblocked = function () { _dbMode = 'ls'; res(null); };
    });
    return _dbp;
  }

  function idbTx(d, store, mode, fn) {
    return new Promise(function (res, rej) {
      var t = d.transaction(store, mode);
      var s = t.objectStore(store);
      var out = fn(s);
      /* only unwrap .result off a real IDBRequest — a get-miss leaves
         result undefined, and resolving the request object itself made
         store.get('missing') truthy (callers' !rec checks lied). */
      t.oncomplete = function () {
        res(typeof IDBRequest !== 'undefined' && out instanceof IDBRequest ? out.result : out);
      };
      t.onerror = function () { rej(t.error); };
      t.onabort = function () { rej(t.error); };
    });
  }
  function idbAll(d, store, indexName, query) {
    return new Promise(function (res, rej) {
      var t = d.transaction(store, 'readonly');
      var s = indexName ? t.objectStore(store).index(indexName) : t.objectStore(store);
      var rq = s.getAll(query === undefined ? undefined : query);
      rq.onsuccess = function () { res(rq.result || []); };
      rq.onerror = function () { rej(rq.error); };
    });
  }

  /* localStorage fallback bucket — whole bucket under one key, cap-guarded. */
  var LS_BUCKET_PREFIX = 'iterra.v1.store.';
  function lsRead(bucket) {
    try { return JSON.parse(localStorage.getItem(LS_BUCKET_PREFIX + bucket) || '{}') || {}; } catch (e) { return {}; }
  }
  function lsWrite(bucket, obj) {
    try { localStorage.setItem(LS_BUCKET_PREFIX + bucket, JSON.stringify(obj)); } catch (e) {}
  }
  var LS_CAPS = { entities: 2000, events: 400, links: 2000, intakes: 100, meta: 100 };
  /* IDB keeps a deeper journal than the LS fallback, still bounded. */
  var IDB_EVENT_CAP = 2000;

  /* ── validation + quarantine ── */

  function badWrite(reason, raw) {
    var q;
    try { q = JSON.parse(localStorage.getItem('iterra.v1.quarantine') || '[]'); } catch (e) { q = []; }
    q.unshift({ reason: reason, raw: raw && raw.key, at: Date.now() });
    try { localStorage.setItem('iterra.v1.quarantine', JSON.stringify(q.slice(0, 20))); } catch (e) {}
    /* `invalid` marks a VALIDATION reject — quarantined, skipped by design,
       never retried. The sync merge checks for it explicitly: any other
       {ok:false} result is a storage-layer failure, which must hold the
       pull checkpoint and be retried, not silently skipped. */
    return { ok: false, error: reason, invalid: true };
  }

  function validateEntity(raw, opts) {
    if (!raw || typeof raw !== 'object') return badWrite('entity not an object', raw);
    if (typeof raw.id !== 'string' || !raw.id || raw.id.length > 200) return badWrite('entity.id required (string ≤200)', raw);
    if (typeof raw.type !== 'string' || !ENTITY_TYPES[raw.type]) return badWrite('entity.type not in schema: ' + raw.type, raw);
    if (typeof raw.app !== 'string' || !/^[a-z]+$/.test(raw.app)) return badWrite('entity.app required ([a-z]+)', raw);
    var opt = ['courseId', 'course', 'topic', 'title', 'sub', 'url', 'lang'];
    for (var i = 0; i < opt.length; i++) {
      var k = opt[i];
      if (raw[k] !== undefined && raw[k] !== null && typeof raw[k] !== 'string') return badWrite('entity.' + k + ' must be a string', raw);
    }
    if (raw.data !== undefined && raw.data !== null) {
      var j;
      try { j = JSON.stringify(raw.data); } catch (e) { return badWrite('entity.data not JSON-serializable', raw); }
      if (j && j.length > 65536) return badWrite('entity.data >64KB', raw);
    }
    var now = Date.now();
    /* opts.preserveUpdatedAt is the sync-merge path only: a remote row must
       keep ITS edit stamp — restamping to now would inflate local recency
       and flip per-key last-writer-wins comparisons (a merely-re-written
       local row could outrank a genuinely newer remote edit). */
    var keepTs = !!(opts && opts.preserveUpdatedAt) && typeof raw.updatedAt === 'number';
    return {
      ok: true,
      entity: {
        key: raw.app + ':' + raw.type + ':' + raw.id,
        id: raw.id, type: raw.type, app: raw.app,
        courseId: raw.courseId || undefined, course: raw.course || undefined,
        topic: raw.topic || undefined, title: raw.title || undefined,
        sub: raw.sub || undefined, url: raw.url || undefined,
        lang: raw.lang || undefined, data: raw.data === undefined ? undefined : raw.data,
        createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
        updatedAt: keepTs ? raw.updatedAt : now,
        v: typeof raw.v === 'number' ? raw.v : SCHEMA_V,
      },
    };
  }

  function validateEvent(type, payload) {
    if (typeof type !== 'string' || !EVENT_TYPES[type]) return badWrite('event type not in catalogue: ' + type, { type: type });
    var p = payload && typeof payload === 'object' ? payload : {};
    try { JSON.stringify(p); } catch (e) { return badWrite('event payload not serializable', p); }
    return { ok: true, type: type, payload: p };
  }

  function validateRef(ref) {
    // refs are 'app:type:id' strings or {app,type,id}
    if (typeof ref === 'string' && ref.split(':').length === 3) return ref;
    if (ref && typeof ref === 'object' && typeof ref.app === 'string' && typeof ref.type === 'string' && typeof ref.id === 'string') {
      return ref.app + ':' + ref.type + ':' + ref.id;
    }
    return null;
  }

  /* ── broadcast ── */

  var _bc = null;
  try { if (typeof BroadcastChannel !== 'undefined') _bc = new BroadcastChannel('iterra.core.v1'); } catch (e) { _bc = null; }
  var _subs = { entity: [], event: [], link: [], intake: [], any: [] };
  function _notify(kind, data) {
    var msg = { kind: kind, data: data, at: Date.now(), by: me || undefined };
    try { if (_bc) _bc.postMessage(msg); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('iterra:store', { detail: msg })); } catch (e) {}
    /* localStorage poke: keeps LS-fallback + BC-less environments live and
       wakes intake subscribers in sibling frames. */
    try {
      localStorage.setItem('iterra.v1.poke', JSON.stringify({ k: kind, app: (data && data.to) || undefined, t: Date.now() }));
    } catch (e) {}
    /* NO direct _dispatch here — the 'iterra:store' listener above routes
       the same CustomEvent back through _onMsg → _dispatch; calling both
       delivers every notification twice. */
  }
  function _dispatch(kind, data) {
    var lists = [_subs[kind] || [], _subs.any];
    for (var li = 0; li < lists.length; li++) {
      for (var i = 0; i < lists[li].length; i++) {
        try { lists[li][i](data); } catch (e) {}
      }
    }
    if (kind === 'intake' && data && data.to && _subs.intake.length) {
      for (var j = 0; j < _subs.intake.length; j++) {
        try { _subs.intake[j](data); } catch (e) {}
      }
    }
  }
  function _onMsg(msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.kind !== 'string') return;
    _dispatch(msg.kind, msg.data);
  }
  if (_bc) { try { _bc.onmessage = function (ev) { _onMsg(ev.data); }; } catch (e) {} }
  try {
    window.addEventListener('iterra:store', function (ev) { _onMsg(ev.detail); });
    window.addEventListener('storage', function (ev) {
      if (ev.key !== 'iterra.v1.poke' || !ev.newValue) return;
      try {
        var p = JSON.parse(ev.newValue);
        /* a poke only carries {k,app,t} — the payload lives in the store;
           subscribers re-read via the API (intake drains, queries refresh) */
        _dispatch(p.k, { _poke: true, to: p.app, at: p.t });
      } catch (e) {}
    });
    /* the shell wakes a hidden frame so views re-read the store */
    window.addEventListener('message', function (ev) {
      /* real cross-window messages always carry origin — a missing one
         means a same-origin script dispatched the event itself */
      if (ev.origin && ev.origin !== window.location.origin) return;
      var d = ev && ev.data;
      if (d && d.type === 'iterra:wake') _dispatch('wake', { at: Date.now() });
      if (d && d.type === 'iterra:invoke' && typeof d.intake === 'string') {
        /* direct delivery from a live sender — resolve through the queue so
           ordering stays single-path (drain marks it delivered). */
        drainIntakes(d.to || me || '', function () {});
      }
    });
    /* a dying page releases its claims instead of orphaning them for the
       60s stale window — pagehide still lets started IDB writes flush.
       Quiet: nothing failed, so no attempts++/lastError noise. */
    window.addEventListener('pagehide', function () {
      var ids = Object.keys(_claimed);
      for (var i = 0; i < ids.length; i++) {
        try { intakeRelease(ids[i], null, { quiet: true }); } catch (e) {}
      }
    });
  } catch (e) {}
  _subs.wake = [];

  /* ── entities ── */

  function storeReady() {
    return openDB().then(function () { return _dbMode; });
  }

  function storePut(raw, opts) {
    var v = validateEntity(raw, opts);
    if (!v.ok) return Promise.resolve(v);
    var e = v.entity;
    return openDB().then(function (d) {
      if (d) {
        if (opts && opts.base !== undefined) {
          /* Compare-and-swap: the caller (a sync merge) resolved the winner
             against `base` — if the row moved under it, a local write raced
             the merge window and must NOT be clobbered. Read + check + put
             in ONE transaction so nothing interleaves. */
          return new Promise(function (res, rej) {
            var t = d.transaction('entities', 'readwrite');
            var s = t.objectStore('entities');
            var g = s.get(e.key);
            var outcome = { ok: true };
            g.onsuccess = function () {
              var cur = g.result || null;
              var base = opts.base || null;
              if ((cur ? canonEntity(cur) : 'null') !== (base ? canonEntity(base) : 'null')) {
                outcome = { ok: false, raced: true };
                try { t.abort(); } catch (x) {}
                return;
              }
              if (cur && cur.createdAt) e.createdAt = cur.createdAt;
              s.put(e);
            };
            g.onerror = function () { try { t.abort(); } catch (x) {} };
            t.oncomplete = function () { res(outcome); };
            t.onerror = function () { rej(t.error); };
            t.onabort = function () { res(outcome); };
          });
        }
        return idbTx(d, 'entities', 'readonly', function (s) { return s.get(e.key); }).then(function (prev) {
          if (prev && prev.createdAt) e.createdAt = prev.createdAt;
          return idbTx(d, 'entities', 'readwrite', function (s) { s.put(e); });
        }).then(function () { return { ok: true }; });
      }
      var b = lsRead('entities');
      var cur = b[e.key] || null;
      if (opts && opts.base !== undefined) {
        var base = opts.base || null;
        if ((cur ? canonEntity(cur) : 'null') !== (base ? canonEntity(base) : 'null')) {
          return { ok: false, raced: true };
        }
      }
      if (cur && cur.createdAt) e.createdAt = cur.createdAt;
      b[e.key] = e;
      /* cap: evict oldest-updated beyond LS_CAPS.entities */
      var keys = Object.keys(b);
      if (keys.length > LS_CAPS.entities) {
        keys.sort(function (a, b2) { return (b[a].updatedAt || 0) - (b[b2].updatedAt || 0); });
        for (var i = LS_CAPS.entities; i < keys.length; i++) delete b[keys[i]];
      }
      lsWrite('entities', b);
      return { ok: true };
    }).then(function (r) {
      if (r && r.raced) return r; // CAS miss — no notify, no push; caller re-resolves
      /* propagate failures verbatim — mapping a non-raced {ok:false} to a
         success-shaped result would fire _notify/syncPush for a write that
         never committed */
      if (r && r.ok === false) return r;
      _notify('entity', { op: 'put', entity: e });
      syncPush(e);
      return { ok: true, entity: e };
    }).catch(function (err) {
      /* IDB mid-flight failure → drop to LS and retry once. Forward opts —
         a sync merge's preserveUpdatedAt must survive the retry or the
         remote stamp gets restamped to now and the row wins comparisons it
         shouldn't. */
      if (_dbMode === 'idb') {
        _dbMode = 'ls'; _dbp = Promise.resolve(null);
        return storePut(raw, opts);
      }
      return { ok: false, error: String(err) };
    });
  }

  function storeGet(key) {
    return openDB().then(function (d) {
      if (d) return idbTx(d, 'entities', 'readonly', function (s) { return s.get(key); }).then(function (r) { return r || null; });
      var b = lsRead('entities');
      return b[key] || null;
    });
  }

  function storeList(q) {
    q = q || {};
    var filter = function (e) {
      if (!e) return false;
      if (q.app && e.app !== q.app) return false;
      if (q.type && e.type !== q.type) return false;
      if (q.courseId && e.courseId !== q.courseId) return false;
      if (q.course && String(e.course || '').toLowerCase() !== String(q.course).toLowerCase()) return false;
      if (q.topic && String(e.topic || '').toLowerCase() !== String(q.topic).toLowerCase()) return false;
      return true;
    };
    var sort = function (arr) {
      arr.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      return typeof q.limit === 'number' ? arr.slice(0, q.limit) : arr;
    };
    return openDB().then(function (d) {
      if (d) {
        var idx = q.app ? 'app' : q.type ? 'type' : q.courseId ? 'courseId' : null;
        var val = q.app || q.type || q.courseId;
        return (idx ? idbAll(d, 'entities', idx, val) : idbAll(d, 'entities')).then(function (rows) { return sort(rows.filter(filter)); });
      }
      var b = lsRead('entities');
      return sort(Object.keys(b).map(function (k) { return b[k]; }).filter(filter));
    });
  }

  function storeSearch(text, q) {
    q = q || {};
    var needle = String(text || '').trim().toLowerCase();
    if (!needle) return Promise.resolve([]);
    return storeList({ app: q.app, type: q.type, courseId: q.courseId }).then(function (rows) {
      return rows.filter(function (e) {
        var hay = [e.title, e.sub, e.course, e.topic, e.id].filter(Boolean).join(' ').toLowerCase();
        return hay.indexOf(needle) >= 0;
      });
    });
  }

  function storeRemove(key, opts) {
    return openDB().then(function (d) {
      if (d) {
        if (opts && opts.base !== undefined) {
          /* Same CAS contract as storePut — a tombstone merge removes only
             while the row still matches what it resolved against. */
          return new Promise(function (res, rej) {
            var t = d.transaction('entities', 'readwrite');
            var s = t.objectStore('entities');
            var g = s.get(key);
            var outcome = { ok: true };
            g.onsuccess = function () {
              var cur = g.result || null;
              var base = opts.base || null;
              if ((cur ? canonEntity(cur) : 'null') !== (base ? canonEntity(base) : 'null')) {
                outcome = { ok: false, raced: true };
                try { t.abort(); } catch (x) {}
                return;
              }
              s.delete(key);
            };
            g.onerror = function () { try { t.abort(); } catch (x) {} };
            t.oncomplete = function () { res(outcome); };
            t.onerror = function () { rej(t.error); };
            t.onabort = function () { res(outcome); };
          });
        }
        return idbTx(d, 'entities', 'readwrite', function (s) { s.delete(key); }).then(function () { return { ok: true }; });
      }
      var b = lsRead('entities');
      if (opts && opts.base !== undefined) {
        var cur = b[key] || null;
        var base = opts.base || null;
        if ((cur ? canonEntity(cur) : 'null') !== (base ? canonEntity(base) : 'null')) {
          return { ok: false, raced: true };
        }
      }
      delete b[key];
      lsWrite('entities', b);
      return { ok: true };
    }).then(function (r) {
      if (r && r.raced) return r;
      if (r && r.ok === false) return r; // never map a failure to a committed remove
      _notify('entity', { op: 'remove', key: key });
      syncPushRemove(key);
      return { ok: true };
    });
  }

  /* due-ordered query — 'what's due' is the terrain's most common read:
     entities whose data.dueAt (ms or ISO) is at-or-before `before`,
     soonest first. The one place callers should look for due state. */
  function storeDue(q) {
    q = q || {};
    var before = typeof q.before === 'number' ? q.before : Date.now();
    var asMs = function (d) {
      if (typeof d === 'number') return d;
      var t = Date.parse(d);
      return isNaN(t) ? null : t;
    };
    return storeList({ app: q.app, type: q.type || 'card', courseId: q.courseId, course: q.course }).then(function (rows) {
      return rows.filter(function (e) {
        var d = asMs(e && e.data && e.data.dueAt !== undefined ? e.data.dueAt : e && e.dueAt);
        return d !== null && d <= before;
      }).sort(function (a, b) {
        return asMs(a.data && a.data.dueAt !== undefined ? a.data.dueAt : a.dueAt) - asMs(b.data && b.data.dueAt !== undefined ? b.data.dueAt : b.dueAt);
      });
    });
  }

  function storeSubscribe(cb) {
    _subs.entity.push(cb);
    return function () { _subs.entity = _subs.entity.filter(function (f) { return f !== cb; }); };
  }

  /* ── events — the bus. feed() below stays as the terrain-facing stream;
        emit() journals every event to the events store AND mirrors notable
        ones to the feed doc (same shape the terrain reads today). ── */

  /* the journal is lossy by design — cap IDB like the LS path so
     events.list() (which loads all rows) stays bounded. Runs inside the
     write tx: count + ascending cursor deletes the oldest seqs. */
  function capEventsStore(s) {
    var count = s.count();
    count.onsuccess = function () {
      var excess = count.result - IDB_EVENT_CAP;
      if (excess <= 0) return;
      var cur = s.openCursor(); /* ascending seq — oldest first */
      cur.onsuccess = function () {
        var c = cur.result;
        if (!c || excess <= 0) return;
        c.delete(); excess--; c.continue();
      };
    };
  }

  function eventEmit(type, payload) {
    var v = validateEvent(type, payload);
    if (!v.ok) return Promise.resolve(v);
    var rec = {
      type: type, app: (v.payload && v.payload.app) || me || '?',
      payload: v.payload, at: Date.now(),
    };
    return openDB().then(function (d) {
      if (d) {
        return idbTx(d, 'events', 'readwrite', function (s) { s.add(rec); capEventsStore(s); });
      }
      var b = lsRead('events');
      var seq = (b._seq || 0) + 1;
      b._seq = seq;
      rec.seq = seq;
      b[seq] = rec;
      var keys = Object.keys(b).filter(function (k) { return k !== '_seq'; }).map(Number).sort(function (a, b2) { return b2 - a; });
      for (var i = LS_CAPS.events; i < keys.length; i++) delete b[keys[i]];
      lsWrite('events', b);
    }).then(function () {
      _notify('event', rec);
      /* feed compat: stirs are the terrain's stream — emit() with a text
         payload lands in the feed doc exactly like feed() did. */
      if (v.payload && typeof v.payload.text === 'string') {
        /* the raw doc writer — NOT the wrapped feed(), which would journal
           a duplicate 'stir' event on top of this typed record. */
        _feedOrig({ text: v.payload.text, url: v.payload.url, course: v.payload.course, topic: v.payload.topic });
      }
      return { ok: true, event: rec };
    });
  }

  function eventsList(q) {
    q = q || {};
    return openDB().then(function (d) {
      var collect;
      if (d) {
        collect = idbAll(d, 'events');
      } else {
        var b = lsRead('events');
        collect = Promise.resolve(Object.keys(b).filter(function (k) { return k !== '_seq'; }).map(function (k) { return b[k]; }));
      }
      return collect.then(function (rows) {
        rows = (rows || []).filter(function (r) {
          if (!r) return false;
          if (q.type && r.type !== q.type) return false;
          if (q.app && r.app !== q.app) return false;
          if (q.since && r.at < q.since) return false;
          return true;
        });
        rows.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
        return typeof q.limit === 'number' ? rows.slice(0, q.limit) : rows;
      });
    });
  }

  function eventsOn(type, cb) {
    if (typeof type === 'function') { cb = type; type = '*'; }
    var h = function (rec) {
      if (rec && rec._poke) { /* poke wakeups carry no record — re-read */ return; }
      if (type === '*' || (rec && rec.type === type)) cb(rec);
    };
    _subs.event.push(h);
    return function () { _subs.event = _subs.event.filter(function (f) { return f !== h; }); };
  }

  /* ── links — generic edges between entities. Backlinks queryable. ── */

  function linkKey(from, to, kind) { return from + '|' + (kind || 'related') + '|' + to; }
  function linkAdd(fromRef, toRef, kind) {
    var from = validateRef(fromRef), to = validateRef(toRef);
    if (!from || !to) return Promise.resolve(badWrite('link refs must be app:type:id', { from: fromRef, to: toRef }));
    var rec = { key: linkKey(from, to, kind), from: from, to: to, kind: kind || 'related', by: me || '?', at: Date.now() };
    return openDB().then(function (d) {
      if (d) return idbTx(d, 'links', 'readwrite', function (s) { s.put(rec); });
      var b = lsRead('links');
      b[rec.key] = rec;
      var keys = Object.keys(b);
      if (keys.length > LS_CAPS.links) for (var i = LS_CAPS.links; i < keys.length; i++) delete b[keys[i]];
      lsWrite('links', b);
    }).then(function () {
      _notify('link', { op: 'add', link: rec });
      return { ok: true, link: rec };
    });
  }
  function linkRemove(fromRef, toRef, kind) {
    var from = validateRef(fromRef), to = validateRef(toRef);
    if (!from || !to) return Promise.resolve(badWrite('link refs', null));
    var key = linkKey(from, to, kind);
    return openDB().then(function (d) {
      if (d) return idbTx(d, 'links', 'readwrite', function (s) { s.delete(key); });
      var b = lsRead('links');
      delete b[key];
      lsWrite('links', b);
    }).then(function () {
      _notify('link', { op: 'remove', key: key });
      return { ok: true };
    });
  }
  function linksFor(ref) {
    var key = validateRef(ref);
    if (!key) return Promise.resolve({ out: [], inn: [] });
    var collect = function (rows) {
      var out = [], inn = [];
      (rows || []).forEach(function (l) {
        if (l.from === key) out.push(l);
        if (l.to === key) inn.push(l);
      });
      return { out: out, inn: inn };
    };
    return openDB().then(function (d) {
      if (d) return idbAll(d, 'links').then(collect);
      var b = lsRead('links');
      return collect(Object.keys(b).map(function (k) { return b[k]; }));
    });
  }

  function linksList() {
    return openDB().then(function (d) {
      if (d) return idbAll(d, 'links');
      var b = lsRead('links');
      return Object.keys(b).map(function (k) { return b[k]; });
    });
  }

  /* ── intakes — typed send-to queue. A sender queues {to,action,entity,
        payload}; the target's adapter drains (creating real entities) on
        poke / boot. Every send is journaled; delivery resolves a result
        (deep-link url) the sender can navigate to. ── */

  var INTAKE_CAP = 100;
  /* delivered rows only — pending rows are actionable and never evict.
     IDB keeps a wider window (500) since senders may poll a result late;
     the lossy events journal carries the long audit trail anyway. */
  var INTAKE_IDB_DELIVERED_CAP = 500;
  function intakePruneDelivered(d) {
    return idbAll(d, 'intakes').then(function (rows) {
      var del = (rows || []).filter(function (r) { return r && r.delivered; })
        .sort(function (a, b) { return (b.delivered || 0) - (a.delivered || 0); });
      if (del.length <= INTAKE_IDB_DELIVERED_CAP) return;
      var drop = del.slice(INTAKE_IDB_DELIVERED_CAP);
      return idbTx(d, 'intakes', 'readwrite', function (s) {
        drop.forEach(function (r) { s.delete(r.id); });
      });
    }).catch(function () { /* prune is housekeeping — never block resolve */ });
  }
  function intakeSend(opts) {
    opts = opts || {};
    var to = opts.to, action = opts.action;
    if (typeof to !== 'string' || !/^[a-z]+$/.test(to)) return Promise.resolve(badWrite('intake.to required', opts));
    if (typeof action !== 'string' || !action) return Promise.resolve(badWrite('intake.action required', opts));
    var entity;
    if (opts.entity !== undefined) {
      var v = validateEntity(opts.entity);
      if (!v.ok) return Promise.resolve(v);
      entity = v.entity;
    }
    var rec = {
      id: 'in-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      to: to, action: action,
      entity: entity, payload: opts.payload === undefined ? undefined : opts.payload,
      from: me || (opts.from || '?'), at: Date.now(),
      delivered: null, result: undefined,
    };
    return openDB().then(function (d) {
      if (d) return idbTx(d, 'intakes', 'readwrite', function (s) { s.put(rec); });
      var b = lsRead('intakes');
      b[rec.id] = rec;
      var keys = Object.keys(b);
      if (keys.length > INTAKE_CAP) {
        /* never evict pending rows — a queued send must survive to drain;
           drop the oldest delivered instead */
        var delKeys = keys.filter(function (k) { return b[k] && b[k].delivered; })
          .sort(function (x, y) { return (b[x].delivered || 0) - (b[y].delivered || 0); });
        var dropN = Math.min(keys.length - INTAKE_CAP, delKeys.length);
        for (var i = 0; i < dropN; i++) delete b[delKeys[i]];
      }
      lsWrite('intakes', b);
    }).then(function () {
      _notify('intake', { to: to, id: rec.id, action: action });
      return { ok: true, id: rec.id };
    });
  }

  function intakesPending(app) {
    return openDB().then(function (d) {
      var collect;
      if (d) collect = idbAll(d, 'intakes', 'to', app);
      else {
        var b = lsRead('intakes');
        collect = Promise.resolve(Object.keys(b).map(function (k) { return b[k]; }).filter(function (r) { return r.to === app; }));
      }
      return collect.then(function (rows) {
        return (rows || []).filter(function (r) { return r && !r.delivered; })
          .sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
      });
    });
  }

  function intakeResolve(id, result) {
    delete _claimed[id];
    return openDB().then(function (d) {
      var write = function (cur) {
        /* a claim that went stale (>60s) can be taken by another page and
           delivered there — a late handler finishing here must not
           double-stamp or clobber the winning drain's result. */
        if (!cur || cur.delivered) return;
        cur.delivered = Date.now();
        cur.result = result;
        delete cur.claimedBy;
        delete cur.claimedAt;
        if (d) return idbTx(d, 'intakes', 'readwrite', function (s) { s.put(cur); });
        var b = lsRead('intakes');
        b[cur.id] = cur;
        lsWrite('intakes', b);
      };
      if (d) return idbTx(d, 'intakes', 'readonly', function (s) { return s.get(id); })
        .then(write)
        .then(function () { return intakePruneDelivered(d); });
      var b = lsRead('intakes');
      return write(b[id]);
    }).then(function () {
      _notify('intake', { id: id, delivered: true });
    });
  }

  function intakeGet(id) {
    return openDB().then(function (d) {
      if (d) return idbTx(d, 'intakes', 'readonly', function (s) { return s.get(id); });
      var b = lsRead('intakes');
      return b[id] || null;
    });
  }

  /* the target app's delivery handler, registered by the adapter. Drains
     pending intakes newest-oldest order preserved (at-sorted), calls the
     handler per record, resolves with whatever the handler returns. */
  var _deliveries = {};
  var _launchChecked = false;
  /* per-page identity for intake claims + per-app drain serialization:
     a poke arrives once per registered action, so an app with N intakes
     fired N concurrent drains over the same pending rows — every handler
     re-ran and one send created N entities. One drain at a time per app;
     late callers coalesce into a follow-up pass. */
  var _instance = 'pg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  var _drainBusy = {}, _drainMore = {}, _drainWaiters = {};
  var _claimed = {}; /* ids this page holds — released quietly on pagehide */
  var CLAIM_STALE_MS = 60000;
  /* atomically claim a pending record for this page: get + conditional
     put inside one readwrite tx so concurrent drains (other tabs, other
     frames) can't both take it. Stale claims (>60s, e.g. a page that died
     mid-handler) are reclaimable. */
  function intakeClaim(id) {
    var won = false;
    var decide = function (cur) {
      if (!cur || cur.delivered) return null;
      var now = Date.now();
      if (cur.claimedBy && cur.claimedBy !== _instance && (now - (cur.claimedAt || 0)) < CLAIM_STALE_MS) return null;
      cur.claimedBy = _instance;
      cur.claimedAt = now;
      won = true;
      _claimed[id] = 1;
      return cur;
    };
    return openDB().then(function (d) {
      if (d) {
        return idbTx(d, 'intakes', 'readwrite', function (s) {
          var rq = s.get(id);
          rq.onsuccess = function () {
            var cur = decide(rq.result);
            if (cur) s.put(cur);
          };
        }).then(function () { return won; });
      }
      var b = lsRead('intakes');
      var cur = decide(b[id]);
      if (cur) { b[id] = cur; lsWrite('intakes', b); }
      return won;
    });
  }
  /* a handler declined by throwing or returning {retry:true}: the record
     was never delivered — release the claim (attempts++ for observability)
     so a later drain can deliver it. Pending means pending: the queue
     does not fake delivery when the target isn't ready. opts.quiet skips
     the attempt bookkeeping (pagehide release — nothing failed). */
  function intakeRelease(id, err, opts) {
    delete _claimed[id];
    return openDB().then(function (d) {
      var apply = function (cur) {
        if (!cur || cur.delivered) return null;
        /* only release our own claim — a claim that went stale may have
           been taken by another page whose delivery must not be broken */
        if (cur.claimedBy && cur.claimedBy !== _instance) return null;
        delete cur.claimedBy;
        delete cur.claimedAt;
        if (!opts || !opts.quiet) {
          cur.attempts = (cur.attempts || 0) + 1;
          if (err) cur.lastError = String(err).slice(0, 200);
        }
        return cur;
      };
      if (d) {
        return idbTx(d, 'intakes', 'readwrite', function (s) {
          var rq = s.get(id);
          rq.onsuccess = function () {
            var cur = apply(rq.result);
            if (cur) s.put(cur);
          };
        });
      }
      var b = lsRead('intakes');
      var cur = apply(b[id]);
      if (cur) { b[id] = cur; lsWrite('intakes', b); }
    });
  }
  var _retryTimers = {};
  function scheduleRedrain(app) {
    if (_retryTimers[app]) return;
    _retryTimers[app] = setTimeout(function () {
      _retryTimers[app] = null;
      drainIntakes(app, function () {});
    }, 4000);
  }
  function drainIntakes(app, done) {
    if (typeof done !== 'function') done = function () {};
    if (_drainBusy[app]) {
      _drainMore[app] = true;
      (_drainWaiters[app] = _drainWaiters[app] || []).push(done);
      return;
    }
    _drainBusy[app] = true;
    var release = function () {
      _drainBusy[app] = false;
      var again = _drainMore[app];
      _drainMore[app] = false;
      var w = _drainWaiters[app] || [];
      _drainWaiters[app] = [];
      if (again) { drainIntakes(app, function () { w.forEach(function (f) { try { f(); } catch (e) {} }); }); return; }
      w.forEach(function (f) { try { f(); } catch (e) {} });
    };
    intakesPending(app).then(function (rows) {
      var i = 0;
      /* a frame launched at ?intake=<id> exists to receive that intake —
         the handler's result.url is where delivery lands (e.g. a bound
         autostart timer, the new note). Navigate only for that record so a
         routine boot draining background intakes isn't hijacked. */
      var launchedFor = null;
      try { launchedFor = new URLSearchParams(window.location.search).get('intake'); } catch (e) {}
      var landOnce = !!(launchedFor && !_launchChecked);
      if (launchedFor) _launchChecked = true;
      /* handler results are app code, but a returned url may carry mirrored
         entity data another app wrote — the drain navigates this frame
         directly, so only ever land on a same-origin link (blocks
         javascript:/data:/external result.urls reaching location.assign). */
      var safeLand = function (u) {
        try {
          var abs = new URL(String(u || ''), window.location.href);
          if (abs.origin !== window.location.origin) return null;
          return abs.pathname + abs.search + abs.hash;
        } catch (e) { return null; }
      };
      var next = function () {
        if (i >= rows.length) {
          /* launched at ?intake=<id> but the row was already delivered —
             or claimed out from under this drain (a poke/invoke/other tab
             won the claim). Its resolve still stores result.url: wait
             briefly for delivery and land on it once, so a launch is never
             evaporated by losing the claim race. */
          if (launchedFor && landOnce) {
            var tries = 10;
            var awaitLanding = function () {
              intakeGet(launchedFor).then(function (rec) {
                var landUrl = rec && rec.delivered && rec.result && safeLand(rec.result.url);
                if (rec && rec.to === app && landUrl) {
                  try { window.location.assign(landUrl); } catch (e) {}
                } else if (rec && !rec.delivered && tries-- > 0) {
                  setTimeout(awaitLanding, 300);
                  return;
                }
                release(); done();
              }, function () { release(); done(); });
            };
            awaitLanding();
            return;
          }
          release(); done();
          return;
        }
        var rec = rows[i++];
        intakeClaim(rec.id).then(function (claimed) {
          if (!claimed) { next(); return; }
          var h = _deliveries[app + ':' + rec.action] || _deliveries[app + ':*'];
          var finish = function (result) {
            /* {toast} contract — a handler may return a one-line toast the
               terrain surfaces wherever the resolve landed (ambient rail
               reads intake.resolved events). The emit must SETTLE before
               the launched-record navigation below: location.assign
               unloads the page and a fire-and-forget emit loses the race —
               the toast would never surface (the original dead-emit bug). */
            var settled = [Promise.resolve(intakeResolve(rec.id, result)).catch(function () {})];
            /* journal every delivery — send.delivered is the always-on
               record; intake.resolved below carries the optional toast */
            try {
              settled.push(Promise.resolve(eventEmit('send.delivered', { to: rec.to, action: rec.action, id: rec.id, url: (result && result.url) || undefined, by: me || undefined })).catch(function () {}));
            } catch (e) {}
            if (result && typeof result.toast === 'string') {
              try {
                settled.push(Promise.resolve(eventEmit('intake.resolved', { to: rec.to, action: rec.action, toast: result.toast, url: result.url || undefined, by: me || undefined })).catch(function () {}));
              } catch (e) {}
            }
            Promise.all(settled).then(function () {
              var landUrl = launchedFor && rec.id === launchedFor && result && safeLand(result.url);
              if (landUrl) {
                try { window.location.assign(landUrl); return; } catch (e) {}
              }
              next();
            }, function () { next(); });
          };
          var retry = function (e) {
            /* 'not ready' is not 'delivered': release the claim so the
               record stays pending, and schedule a bounded re-drain — a
               boot drain racing store hydration lands on the retry, not
               on the user re-entering the place. */
            intakeRelease(rec.id, e && (e.message || String(e))).then(function () {
              if ((rec.attempts || 0) < 8) scheduleRedrain(app);
              next();
            }, function () { next(); });
          };
          /* no handler registered for this action → stays pending (the
             documented contract), not a fake delivery. */
          if (!h) { retry(new Error('no handler for ' + rec.action)); return; }
          /* a handler may hang forever (e.g. awaiting courses.resolve from
             an unmounted app) — bound it so the claim can't be held
             hostage: timeout → release + retry like any 'not ready'. */
          var settled = false;
          var htimeout = setTimeout(function () {
            if (!settled) { settled = true; retry(new Error('handler timed out')); }
          }, 20000);
          var done_ = function (fn, arg) {
            if (settled) return;
            settled = true;
            clearTimeout(htimeout);
            fn(arg);
          };
          try {
            var r = h(rec);
            if (r && typeof r.then === 'function') r.then(function (v) {
              if (v && v.retry === true) done_(retry, new Error('retry requested'));
              else done_(finish, v);
            }, function (e) { done_(retry, e); });
            else if (r && r.retry === true) done_(retry, new Error('retry requested'));
            else done_(finish, r);
          } catch (e) { done_(retry, e); }
        }, function () { next(); });
      };
      next();
    });
  }

  function intakeOnDeliver(app, action, handler) {
    if (typeof action === 'function') { handler = action; action = '*'; }
    _deliveries[app + ':' + action] = handler;
    /* drain anything already queued + keep draining on pokes */
    drainIntakes(app, function () {});
    var h = function (data) {
      if (!data || data.to !== app) return;
      drainIntakes(app, function () {});
    };
    _subs.intake.push(h);
    return function () { _subs.intake = _subs.intake.filter(function (f) { return f !== h; }); };
  }

  /* poll helper for senders — resolves the intake record once delivered. */
  function intakeWhen(id, timeoutMs) {
    var deadline = Date.now() + (timeoutMs || 8000);
    return new Promise(function (res) {
      var poll = function () {
        intakeGet(id).then(function (rec) {
          if (rec && rec.delivered) { res(rec); return; }
          if (Date.now() > deadline) { res(rec || null); return; }
          setTimeout(poll, 120);
        });
      };
      poll();
    });
  }

  /* ── course registry — courses are first-class entities; syllabus owns
        creation, everyone else resolves code → id. ── */

  function coursesList() { return storeList({ type: 'course' }); }
  function courseByCode(code) {
    var c = String(code || '').trim().toLowerCase();
    if (!c) return Promise.resolve(null);
    return coursesList().then(function (rows) {
      for (var i = 0; i < rows.length; i++) {
        var e = rows[i];
        if (String((e.data && e.data.code) || e.course || e.title || '').toLowerCase() === c) return e;
      }
      return null;
    });
  }
  function courseResolve(codeOrEntity) {
    /* accept a code string or {code}|{courseId}|entity — always resolves to
       the registry entity or null. Never fabricates an id. */
    if (!codeOrEntity) return Promise.resolve(null);
    if (typeof codeOrEntity === 'object') {
      if (codeOrEntity.type === 'course' && codeOrEntity.key) return Promise.resolve(codeOrEntity);
      if (codeOrEntity.courseId) return storeGet(courseKeyGuess(codeOrEntity));
      if (codeOrEntity.code) return courseByCode(codeOrEntity.code);
      if (codeOrEntity.course) return courseByCode(codeOrEntity.course);
      return Promise.resolve(null);
    }
    return courseByCode(codeOrEntity);
  }
  function courseKeyGuess(obj) { return obj.key || (obj.courseId || ''); }

  /* ── the adapter contract ──
     iterra.adapter({ name, title, summary, intakes:{action:handler}, wake })
     is THE one-documented way an app joins the environment: it registers
     presence, wires delivery handlers for send-to actions, drains queued
     intakes at boot, and subscribes wake for store-refresh. The build check
     (scripts/check-adapters.sh) fails when a place lacks an adapter file. */
  function adapter(opts) {
    opts = opts || {};
    var name = opts.name;
    if (typeof name !== 'string' || !name) { console.warn('iterra.adapter: name required'); return null; }
    register(name, { title: opts.title || name, summary: opts.summary });
    if (opts.intakes && typeof opts.intakes === 'object') {
      for (var action in opts.intakes) {
        if (Object.prototype.hasOwnProperty.call(opts.intakes, action)) {
          intakeOnDeliver(name, action, opts.intakes[action]);
        }
      }
    }
    if (typeof opts.wake === 'function') _subs.wake.push(opts.wake);
    return { name: name };
  }

  /* convenience send: queue the intake, wake the target, tell the caller
     where the delivery landed. Callers navigate after this resolves —
     result.url is the created entity's deep-link when the target reported
     one; a queued (undelivered) send resolves with the ?intake= param so a
     cold target focuses the thing it creates on boot. */
  function send(opts) {
    var to = opts && opts.to;
    return intakeSend(opts).then(function (r) {
      if (!r.ok) return r;
      return intakeWhen(r.id, 700).then(function (rec) {
        if (rec && rec.delivered) {
          return { ok: true, delivered: 'direct', url: (rec.result && rec.result.url) || ('/apps/' + to + '/'), id: rec.id };
        }
        return { ok: true, delivered: 'queued', url: '/apps/' + to + '/?intake=' + r.id, id: r.id };
      });
    });
  }

  /* ── optional sync adapter ──
     The store is local-first; sync is opt-in behind one interface so the
     WHOLE store can sync, not just margin's tables. Any adapter
     (Supabase or otherwise) implements:

       adapter = {
         name: 'supabase',
         // called once on attach — return entities newer than `since`
         pull: (since) => Promise<Entity[]>,
         // called on every local entity put/remove
         put: (entity) => Promise<void>,
         remove: (key) => Promise<void>,           // optional
         onConflict: (local, remote) => remote,    // optional resolver
       }

     iterra.sync.attach(adapter) wires it: pulls remote entities newer than
     the last successful pull (a persisted checkpoint — NOT the local entity
     watermark, which would silently miss remote updates to older entities),
     merges each key against its local copy through onConflict + storePut
     (validation + quarantine still apply — bad remote data can't bypass the
     contract), then mirrors every subsequent local put/remove outward. One
     adapter at a time; attach() again replaces it.

     adapter.pull contract: `pull(since)` returns either a bare Entity[]
     (legacy — the checkpoint then falls back to the local pull-start clock)
     or { rows: Entity[], watermark: number }, where watermark is the highest
     stamp observed this pull in the ADAPTER's own stamp domain — e.g. a
     server-written `synced_at` column. The checkpoint must never live in a
     different clock domain than the rows it filters: comparing the reader's
     local pull-start against writer-side edit stamps means a row committed
     late (retry-queue drain, slow push, skewed device clock) carries a stamp
     older than the checkpoint and is permanently invisible to every peer.
     Rows may instead carry { key, __deleted: true, deletedAt?, updatedAt? }
     tombstones — a remote delete is merged as a local remove (a newer local
     edit wins and is pushed back out to resurrect the remote row). */
  var _sync = { adapter: null, attachedAt: 0, lastPull: 0, error: null, merging: {}, pulling: false, pullTimer: null, out: [] };

  /* A bound adapter re-pulls on this interval — remote edits from OTHER
     devices only arrive via pull, so without it the mirror is stale between
     reloads. The pull is incremental (checkpointed), so idle ticks are a
     cheap no-row query. */
  var SYNC_POLL_MS = 60000;

  /* The persisted checkpoint is the adapter watermark MINUS this overlap:
     a row can be stamped (or committed by a still-open transaction) just
     before the watermark was observed yet only become visible after it —
     backing the checkpoint up re-fetches that trailing window instead of
     permanently skipping it. Re-fetched rows are per-key idempotent merges,
     so the overlap costs a few extra rows, never a missed update. */
  var SYNC_CK_OVERLAP_MS = 60000;

  /* pull checkpoints persist per adapter name — a restart picks up where the
     last pull stopped instead of re-fetching (or missing) remote history.
     v2: the stamp domain changed (adapter watermark, not local pull-start),
     so the key bumped — first attach re-pulls everything once (idempotent). */
  var SYNC_CK_KEY = 'iterra.v2.sync.ck';
  function syncCkRead(name) {
    try {
      var d = JSON.parse(localStorage.getItem(SYNC_CK_KEY) || '{}') || {};
      var v = d[name];
      return typeof v === 'number' ? v : 0;
    } catch (e) { return 0; }
  }
  function syncCkWrite(name, ms) {
    try {
      var d = JSON.parse(localStorage.getItem(SYNC_CK_KEY) || '{}') || {};
      d[name] = ms;
      localStorage.setItem(SYNC_CK_KEY, JSON.stringify(d));
    } catch (e) {}
  }

  /* ── outbound retry queue ──
     A put/remove whose adapter call failed is held and re-attempted on the
     next successful pull tick — a transient outage must not silently strand
     a local write forever. Deduped by key (a newer op for the same key
     supersedes the stale one), capped, and persisted per adapter name so an
     offline write survives a reload. Entries carry ONLY {op,key} — no
     snapshot: at drain time the CURRENT local entity is re-read, so a stale
     body can never clobber a newer remote row. */
  var SYNC_OUT_KEY = 'iterra.v1.sync.out';
  var SYNC_OUT_MAX = 500;

  function syncOutRead(name) {
    try {
      var d = JSON.parse(localStorage.getItem(SYNC_OUT_KEY) || '{}') || {};
      var v = d[name];
      if (!Array.isArray(v)) return [];
      return v.filter(function (q) {
        return q && typeof q.key === 'string' && (q.op === 'put' || q.op === 'remove');
      }).slice(-SYNC_OUT_MAX);
    } catch (e) { return []; }
  }
  function syncOutWrite(name, ops) {
    try {
      var d = JSON.parse(localStorage.getItem(SYNC_OUT_KEY) || '{}') || {};
      if (ops && ops.length) d[name] = ops; else delete d[name];
      localStorage.setItem(SYNC_OUT_KEY, JSON.stringify(d));
    } catch (e) {}
  }
  function syncOutName() { var a = _sync.adapter; return (a && a.name) || 'sync'; }
  function syncOutEnqueue(op, key, at) {
    _sync.out = _sync.out.filter(function (q) { return q.key !== key; });
    var e = { op: op, key: key };
    /* 'remove' entries carry the delete's own clock: a live key only cancels
       the remove when its stamp is NEWER than the delete — a copy the sync
       itself resurrected (stamp ≤ delete time) must not cancel it, or a
       failed remote delete quietly un-deletes. */
    if (typeof at === 'number') e.at = at;
    _sync.out.push(e);
    if (_sync.out.length > SYNC_OUT_MAX) _sync.out.shift();
    syncOutWrite(syncOutName(), _sync.out);
  }
  /* A successful adapter op for a key discharges anything still owed for it —
     the remote just got the newer truth. */
  function syncOutDrop(key) {
    if (!_sync.out.length) return;
    var next = _sync.out.filter(function (q) { return q.key !== key; });
    if (next.length !== _sync.out.length) {
      _sync.out = next;
      syncOutWrite(syncOutName(), _sync.out);
    }
  }
  /* Retry every owed op, in order, against CURRENT local state:
     - 'put' re-reads the entity — deleted or merged-away keys drop out
       instead of sending a stale body.
     - 'remove' whose live key is stamped NEWER than the delete (q.at) was
       genuinely re-created — a user write or a fresher remote edit merged
       in — and becomes a put of that entity. A live key stamped at-or-
       before the delete is just the sync resurrecting a copy the failed
       remote delete never erased: the remove is re-attempted AND the local
       copy is re-deleted so the user's delete isn't lost. */
  function syncOutDrain() {
    var a = _sync.adapter;
    if (!a || !_sync.out.length) return Promise.resolve();
    var batch = _sync.out.slice();
    _sync.out = [];
    var failed = [];
    var chain = Promise.resolve();
    batch.forEach(function (q) {
      chain = chain.then(function () {
        var attempt = storeGet(q.key).then(function (ent) {
          if (q.op === 'remove') {
            if (ent && (ent.updatedAt || 0) > (q.at || 0)) return a.put(ent);
            var remote = (typeof a.remove === 'function') ? a.remove(q.key) : undefined;
            if (!ent) return remote;
            /* sync-resurrected copy — re-apply the delete locally once the
               remote remove lands. storeRemove→syncPushRemove issues the
               remote remove again (idempotent) and keeps books clean. */
            return Promise.resolve(remote).then(function () { return storeRemove(q.key); });
          }
          return ent ? a.put(ent) : undefined;
        });
        return Promise.resolve(attempt).catch(function (e) {
          _sync.error = String(e && e.message || e);
          failed.push(q);
        });
      });
    });
    return chain.then(function () {
      if (failed.length) {
        /* ops enqueued mid-drain for the same key already supersede the
           older failed attempt — keep the newer one only */
        var newer = {};
        _sync.out.forEach(function (q) { newer[q.key] = true; });
        _sync.out = failed.filter(function (q) { return !newer[q.key]; })
          .concat(_sync.out)
          .slice(-SYNC_OUT_MAX);
      }
      syncOutWrite(syncOutName(), _sync.out);
    });
  }

  /* Deterministic content comparison for stamp ties. Plain JSON.stringify is
     NOT usable here: the remote body round-trips through Postgres jsonb (or
     any store) which doesn't preserve key order, so identical content
     stringifies differently — every equal-stamp refetch would fire a
     spurious push-back. Sort keys recursively and drop undefined, matching
     how JSON.stringify serializes each side. */
  function canonStr(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (v instanceof Array) return '[' + v.map(canonStr).join(',') + ']';
    var keys = Object.keys(v).filter(function (k) { return typeof v[k] !== 'undefined'; }).sort();
    return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + canonStr(v[k]); }).join(',') + '}';
  }
  /* Sync-meta fields ('__deleted', adapter stamps) are transport, not
     content — strip them before comparing. */
  function canonEntity(e) {
    if (!e || typeof e !== 'object') return 'null';
    var c = {};
    Object.keys(e).forEach(function (k) {
      if (!(k.charAt(0) === '_' && k.charAt(1) === '_')) c[k] = e[k];
    });
    return canonStr(c);
  }

  /* A local copy that wins LWW is pushed back out so the remote converges
     without a local write (no push→pull loop). Convergence pushes owe the
     remote too — a failure queues the key so the next tick re-attempts it,
     same as syncPush. */
  function syncPushBack(adapter, rkey, ent) {
    try {
      Promise.resolve(adapter.put(ent)).then(
        function () { syncOutDrop(rkey); },
        function (e) {
          _sync.error = String(e && e.message || e);
          syncOutEnqueue('put', rkey);
        });
    } catch (e) {
      _sync.error = String(e && e.message || e);
      syncOutEnqueue('put', rkey);
    }
  }

  /* Merge one batch of remote rows against their local copies — shared by the
     attach pull and every periodic re-pull. Resolves to the number of HARD
     merge failures (storage errors, not validation skips): the caller must
     NOT advance the pull checkpoint past them, or a transient local failure
     permanently skips a remote row. */
  function syncMergeAll(adapter, remote) {
    remote = remote || [];
    var chain = Promise.resolve();
    var failures = 0;
    remote.forEach(function (re) {
      chain = chain.then(function () {
        /* entity keys are 'app:type:id' — derive it when the adapter returns
           rows that carry parts but not the joined key */
        var rkey = re && (typeof re.key === 'string' ? re.key
          : (re.app && re.type && re.id ? re.app + ':' + re.type + ':' + re.id : null));
        if (!rkey) return;
        /* Per-key last-writer-wins, resolved under compare-and-swap: the
           winner is chosen against the local copy read at decision time, and
           the write commits only while that copy is still current — a user
           write racing the merge aborts it (raced) and the winner is
           re-resolved against the NEWER local instead of being clobbered.
           A local that strictly wins is pushed back out so the remote
           converges without a local write (no push→pull loop). */
        var racedRetry = function (depth, priorOwed) {
          delete _sync.merging[rkey];
          if (depth >= 3) {
            /* still racing — owe the freshest local state to the drain
               rather than spin a live writer */
            return storeGet(rkey).then(function (cur) {
              if (cur) syncOutEnqueue('put', rkey);
              else syncOutEnqueue('remove', rkey, (priorOwed && priorOwed.at) || Date.now());
            });
          }
          return storeGet(rkey).then(function (cur) { return attempt(cur, depth + 1); });
        };
        var attempt = function (local, depth) {
          /* Whatever was already owed for this key BEFORE the merge — the
             merge's own suppressed echo will overwrite the queue entry via
             dedupe, and reconcile needs the REAL owed op to restore (an owed
             remove with a newer stamp must not be dropped just because the
             merge wrote cleanly). */
          var priorOwed = _sync.out.filter(function (q) { return q.key === rkey; })[0] || null;
          /* Remote tombstone: the delete propagates locally UNLESS the local
             copy was edited after the remote delete — that edit wins and is
             pushed back out, resurrecting the remote row. deletedAt is the
             writer's clock at delete time; a missing stamp falls back to the
             deleted entity's own updatedAt, and failing that to 0 — an
             unstamped delete loses to ANY local copy rather than silently
             erasing it. */
          if (re.__deleted === true) {
            if (!local) return;
            var delAt = typeof re.deletedAt === 'number' ? re.deletedAt : (re.updatedAt || 0);
            if ((local.updatedAt || 0) > delAt) {
              syncPushBack(adapter, rkey, local);
              return;
            }
            /* same per-key echo suppression as merge puts — the applied
               remove must not push a remote delete back out */
            _sync.merging[rkey] = true;
            return storeRemove(rkey, { base: local }).then(
              function (r2) {
                if (r2 && r2.raced) return racedRetry(depth, priorOwed);
                /* If a user put re-created the key while the tombstone
                   merged, owe a put so the remote row resurrects with the
                   newest body. Otherwise restore whatever was owed before
                   (or discharge the echo the suppressed remove just made —
                   the remote is already deleted, it's what sent the
                   tombstone). */
                return storeGet(rkey).then(function (cur) {
                  delete _sync.merging[rkey];
                  if (cur) syncOutEnqueue('put', rkey);
                  else if (priorOwed) syncOutEnqueue(priorOwed.op, rkey, priorOwed.at);
                  else syncOutDrop(rkey);
                }, function (e) {
                  /* a leaked merging flag would suppress this key's pushes
                     into the owed queue forever — release it, then let the
                     rejection fail the pull (checkpoint held, retried). */
                  delete _sync.merging[rkey];
                  throw e;
                });
              },
              function (e) {
                delete _sync.merging[rkey];
                failures++;
                _sync.error = 'merge-remove ' + rkey + ': ' + String(e && e.message || e);
              });
          }
          var merged;
          if (local && (local.updatedAt || 0) > (re.updatedAt || 0)) {
            syncPushBack(adapter, rkey, local);
            return;
          }
          if (local && (local.updatedAt || 0) === (re.updatedAt || 0)) {
            /* Stamp tie with divergent content: resolve it canonically — the
               canonically-LARGER body wins, identically on every replica. A
               per-device "local wins" rule would leave two replicas holding
               different bodies forever. The adapter's onConflict is bypassed
               here: a custom resolver could pick differently per device and
               break convergence. */
            var lc = canonEntity(local), rc = canonEntity(re);
            if (lc === rc) return;
            if (lc > rc) {
              syncPushBack(adapter, rkey, local);
              return;
            }
            merged = re;
          } else {
            merged = typeof adapter.onConflict === 'function' ? adapter.onConflict(local, re) : re;
            if (!merged) return;
          }
          /* Per-key echo suppression: only pushes of THIS key are held
             while its merge put is in flight — a global flag would
             silently drop unrelated local writes happening mid-pull.
             preserveUpdatedAt keeps the remote edit stamp so future
             comparisons stay honest. `base` makes the write a CAS. */
          _sync.merging[rkey] = true;
          return storePut(merged, { preserveUpdatedAt: true, base: local }).then(
            function (res) {
              if (res && res.raced) return racedRetry(depth, priorOwed);
              /* A validation REJECT ({ok:false,invalid:true}) is not a
                 diverged store to reconcile — storePut already quarantined
                 the row, and the contract is skip-by-design. Enqueueing ops
                 here was the exact opposite: 'remove' tombstoned the remote
                 row outright (the tombstone then propagated to every peer)
                 and 'put' overwrote it with the stale local copy — remote
                 data loss on schema skew (a newer entity type, an oversized
                 data payload, a non-schema row written out-of-band). Skip it
                 wholesale; the owed ops captured before the merge stay owed.
                 But {ok:false} WITHOUT `invalid` is a storage-layer failure
                 (storePut's catch — LS/IDB error), not a quarantine: count
                 it so the pull checkpoint holds and the row re-fetches next
                 pull instead of being silently skipped forever. */
              if (res && res.ok === false) {
                delete _sync.merging[rkey];
                if (res.invalid) return;
                failures++;
                _sync.error = 'merge ' + rkey + ': ' + String(res.error || 'write failed');
                return;
              }
              var stored = res && res.entity;
              return storeGet(rkey).then(function (cur) {
                delete _sync.merging[rkey];
                /* Reconcile the owed entry the suppressed syncPush made:
                   store still holds exactly the merged body → it was our
                   own echo → put back what was owed BEFORE the merge (an
                   owed remove outranking this row's stamp still deletes it)
                   or discharge outright. Anything else (a user write or
                   delete raced the merge) → owe the matching op so the
                   drain pushes/removes the freshest truth. */
                if (cur && stored && canonEntity(cur) === canonEntity(stored)) {
                  if (priorOwed && !(priorOwed.op === 'remove' && (cur.updatedAt || 0) > (priorOwed.at || 0))) {
                    syncOutEnqueue(priorOwed.op, rkey, priorOwed.at);
                  } else syncOutDrop(rkey);
                }
                else if (cur) syncOutEnqueue('put', rkey);
                else syncOutEnqueue('remove', rkey, Date.now());
              }, function (e) {
                /* same flag-release as the tombstone path — a stuck
                   _sync.merging entry would queue-gate this key forever */
                delete _sync.merging[rkey];
                throw e;
              });
            },
            function (e) {
              delete _sync.merging[rkey];
              /* a storage-layer failure (quota, IDB abort) must hold the
                 checkpoint — the row is re-fetched next pull. A validation
                 reject ({ok:false}) resolves normally instead: quarantined
                 rows are skipped by design, not retried forever. */
              failures++;
              _sync.error = 'merge ' + rkey + ': ' + String(e && e.message || e);
            });
        };
        return storeGet(rkey).then(function (local) { return attempt(local, 0); });
      });
    });
    return chain.then(function () { return failures; });
  }

  /* One incremental pull+merge against the bound adapter. The checkpoint is
     the adapter-reported WATERMARK (its own stamp domain — a server-side
     commit stamp like synced_at), backed off by SYNC_CK_OVERLAP_MS so a row
     stamped by a still-committing writer isn't permanently skipped. A bare
     array response is the legacy contract and falls back to the local
     pull-start clock. The checkpoint only advances when every row merged
     cleanly — a hard merge failure re-fetches the window next pull instead
     of losing the row. */
  function syncPullNow() {
    var a = _sync.adapter;
    var name = a.name || 'sync';
    var pullStart = Date.now();
    var pending;
    try {
      pending = a.pull(syncCkRead(name));
    } catch (e) {
      /* a synchronously-throwing pull must surface like a rejected one —
         otherwise it escapes as a plain throw and wedges the pulling flag */
      _sync.error = String(e && e.message || e);
      return Promise.resolve({ ok: false, error: _sync.error });
    }
    return Promise.resolve(pending).then(function (res) {
      /* normalize {rows, watermark} | bare array */
      var rows = res && res.rows ? res.rows : (res || []);
      var watermark = res && typeof res.watermark === 'number' && isFinite(res.watermark)
        ? res.watermark : pullStart;
      return syncMergeAll(a, rows).then(function (failures) {
        return { pulled: rows.length, watermark: watermark, failures: failures };
      });
    }).then(function (r) {
      _sync.lastPull = Date.now();
      if (!r.failures) {
        var next = Math.max(0, r.watermark - SYNC_CK_OVERLAP_MS);
        /* never regress — an earlier adapter generation (or a lower
           watermark from a thin pull) must not re-open already-merged
           history */
        if (next > syncCkRead(name)) syncCkWrite(name, next);
      }
      /* remote is reachable — flush anything owed. A queued op that fails
         again re-enqueues itself; drain errors never fail the pull. */
      return syncOutDrain().then(function () { return { ok: true, pulled: r.pulled }; });
    }).catch(function (e) {
      _sync.error = String(e && e.message || e);
      return { ok: false, error: _sync.error };
    });
  }

  /* Interval wrapper: never overlap two pulls, and a failed tick lands in
     status().error while the next tick retries — sync doesn't silently die. */
  function syncPullTick() {
    if (!_sync.adapter || _sync.pulling) return;
    _sync.pulling = true;
    syncPullNow().then(function () { _sync.pulling = false; });
  }

  function syncAttach(adapter, opts) {
    if (!adapter || typeof adapter.pull !== 'function' || typeof adapter.put !== 'function') {
      return Promise.resolve({ ok: false, error: 'adapter needs pull(since) and put(entity)' });
    }
    if (_sync.pullTimer) { clearInterval(_sync.pullTimer); _sync.pullTimer = null; }
    _sync.adapter = adapter;
    _sync.attachedAt = Date.now();
    _sync.error = null;
    var name = adapter.name || 'sync';
    /* this adapter's owed ops — the previous adapter's backlog stays
       persisted under its own name until it's bound again */
    _sync.out = syncOutRead(name);
    return syncPullNow().then(function (r) {
      if (!r.ok) return { ok: false, error: r.error };
      /* bound — keep polling so remote edits from other devices land between
         reloads. unref'd so the timer can't hold a node/test process open. */
      var ms = (opts && typeof opts.pollMs === 'number' && opts.pollMs > 0) ? opts.pollMs : SYNC_POLL_MS;
      var t = setInterval(syncPullTick, ms);
      if (t && typeof t.unref === 'function') t.unref();
      _sync.pullTimer = t;
      return { ok: true, pulled: r.pulled, adapter: name };
    });
  }

  function syncPush(entity) {
    var a = _sync.adapter;
    if (!a) return;
    /* Merge-suppressed puts — both the merge's own write AND any user write
       racing it — enqueue an owed 'put'. The merge completion reconciles:
       if the store still holds exactly what was merged in, the entry is
       discharged (no echo); a differing body means a real local write raced
       the merge and the freshest state must go out. */
    if (_sync.merging[entity.key]) { syncOutEnqueue('put', entity.key); return; }
    try {
      Promise.resolve(a.put(entity)).then(
        function () { syncOutDrop(entity.key); },
        /* a rejected adapter call is recorded AND owed — the next pull tick
           drains the queue instead of the write being silently stranded */
        function (e) {
          _sync.error = String(e && e.message || e);
          syncOutEnqueue('put', entity.key);
        });
    } catch (e) {
      _sync.error = String(e && e.message || e);
      syncOutEnqueue('put', entity.key);
    }
  }

  function syncPushRemove(key) {
    /* Tombstone merges DO produce removes — a remote delete applied locally
       must not echo a remote delete back out (it would be harmless —
       idempotent — but could clobber a concurrent remote resurrection). */
    var a = _sync.adapter;
    if (!a) return;
    /* Same merge-window accounting as syncPush: owe the remove so a user
       delete racing a merge isn't dropped; the merge completion reconciles
       it against whatever the store holds afterwards. */
    if (_sync.merging[key]) { syncOutEnqueue('remove', key, Date.now()); return; }
    if (typeof a.remove !== 'function') return;
    try {
      Promise.resolve(a.remove(key)).then(
        function () { syncOutDrop(key); },
        function (e) {
          _sync.error = String(e && e.message || e);
          syncOutEnqueue('remove', key, Date.now());
        });
    } catch (e) {
      _sync.error = String(e && e.message || e);
      syncOutEnqueue('remove', key, Date.now());
    }
  }

  function syncStatus() {
    return {
      attached: !!_sync.adapter,
      adapter: _sync.adapter ? (_sync.adapter.name || 'sync') : null,
      attachedAt: _sync.attachedAt || null,
      lastPull: _sync.lastPull || null,
      error: _sync.error,
      /* outbound ops still owed to the remote (deduped, persisted) */
      queued: _sync.out.length,
    };
  }

  /* feed() also journals into the events store as a 'stir' — new code should
     call iterra.events.emit() directly; this stays the compat path. */
  var _feedOrig = feed;
  feed = function (item) {
    _feedOrig(item);
    /* journal only — no re-emit to feed (that would double-write) */
    openDB().then(function (d) {
      var rec = { type: 'stir', app: me || '?', payload: { text: item && item.text, url: item && item.url, course: item && item.course, topic: item && item.topic }, at: Date.now() };
      if (d) { idbTx(d, 'events', 'readwrite', function (s) { s.add(rec); capEventsStore(s); }).then(function () { _notify('event', rec); }); return; }
      var b = lsRead('events');
      var seq = (b._seq || 0) + 1;
      b._seq = seq;
      rec.seq = seq;
      b[seq] = rec;
      var keys = Object.keys(b).filter(function (k) { return k !== '_seq'; }).map(Number).sort(function (a, b2) { return b2 - a; });
      for (var i = LS_CAPS.events; i < keys.length; i++) delete b[keys[i]];
      lsWrite('events', b);
      _notify('event', rec);
    });
  };

  window.iterra = {
    register: register,
    focus: focus,
    ownKeys: ownKeys,
    active: active,
    open: open,
    openApp: function (name, url) { open(url || ('/apps/' + name + '/')); },
    selfBase: selfBase,
    interceptNav: interceptNav,
    doc: doc,
    presence: presence,
    onPresence: onPresence,
    feed: feed,
    feedItems: readFeedItems,
    onFeed: onFeed,
    index: readIndex,
    indexes: readIndexes,
    onIndex: onIndex,
    apps: readApps,
    isFramed: function () { return framed; },
    /* ── the canonical store ── */
    store: {
      ready: storeReady,
      put: storePut,
      get: storeGet,
      list: storeList,
      search: storeSearch,
      due: storeDue,
      remove: storeRemove,
      subscribe: storeSubscribe,
    },
    courses: {
      list: coursesList,
      byCode: courseByCode,
      resolve: courseResolve,
    },
    events: {
      emit: eventEmit,
      list: eventsList,
      on: eventsOn,
    },
    links: {
      add: linkAdd,
      remove: linkRemove,
      for: linksFor,
      list: linksList,
    },
    intakes: {
      send: intakeSend,
      pending: intakesPending,
      get: intakeGet,
      resolve: intakeResolve,
      onDeliver: intakeOnDeliver,
      when: intakeWhen,
      drain: drainIntakes,
    },
    send: send,
    adapter: adapter,
    sync: { attach: syncAttach, status: syncStatus },
    core: { version: SCHEMA_V, eventTypes: EVENT_TYPES, entityTypes: ENTITY_TYPES },
  };
})();
