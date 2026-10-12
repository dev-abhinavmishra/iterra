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

  var me = null;
  var opts = {};
  var lastSummaryJson = '';
  var lastWriteAt = 0;
  /* pristine window.open, captured before interceptNav patches it — the
     standalone passthroughs must call the real one or they recurse. */
  var origWindowOpen = window.open ? window.open.bind(window) : function () {};

  function readApps() {
    try { return JSON.parse(localStorage.getItem(APPS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function writeApps(map) {
    try { localStorage.setItem(APPS_KEY, JSON.stringify(map)); } catch (e) {}
  }

  function publishSummary() {
    if (!me || !opts.summary) return;
    var s;
    try { s = opts.summary() || null; } catch (e) { s = null; }
    var j = JSON.stringify(s);
    // heartbeat: identical summaries still refresh `at` every ~10s so the
    // rail can tell a live-but-static place from a dead one's last state
    if (j === lastSummaryJson) {
      var now = Date.now();
      if (now - lastWriteAt < 10000) return;
      lastWriteAt = now;
    } else {
      lastSummaryJson = j;
      lastWriteAt = Date.now();
    }
    var map = readApps();
    var cur = map[me];
    // a solo (unframed) copy never overwrites the framed instance's live
    // presence — but a framed entry gone stale (>35s, writer dead) no
    // longer blocks solo publication
    if (!framed && cur && cur.framed && Date.now() - (cur.at || 0) < 35000) return;
    map[me] = { app: me, title: (opts && opts.title) || me, summary: s, at: Date.now(), framed: framed };
    writeApps(map);
  }

  function say(msg) {
    if (!framed) return;
    try { window.parent.postMessage(msg, window.location.origin); } catch (e) {}
  }

  /* A navigation request inside the environment. url may be absolute or
     relative; anything under /apps/<place>/ is routed by the shell, other
     same-origin paths are rebased onto this place. */
  function open(url) {
    if (!framed) { origWindowOpen(url, '_blank', 'noopener'); return; }
    /* terrain hash routes ('#/c/<key>' dossier, '#/p/<place>', '#/') pass
       straight through — they address the shell, not a place path */
    if (/^#\//.test(String(url))) {
      say({ type: 'iterra:open', from: me || undefined, url: String(url) });
      return;
    }
    var abs;
    try { abs = new URL(url, window.location.href); } catch (e) { return; }
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
    if (me && /^\/apps\/[^/]+(\/|$)/.test(window.location.pathname)) return '/apps/' + me;
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
       ⌘0/` home, ⌘1-8 places. Bubble phase so the app's own shortcuts get
       first claim — a defaultPrevented ⌘K (ink/margin palettes) stays
       theirs; anything unclaimed goes to the shell. Framed only. */
    document.addEventListener('keydown', function (ev) {
      if (!framed || ev.defaultPrevented) return;
      if (!(ev.metaKey || ev.ctrlKey) || ev.altKey || ev.shiftKey) return;
      var k = ev.key;
      var fwd = k === 'k' || k === 'K' || k === '`' || k === '0' || (k >= '1' && k <= '8');
      if (!fwd) return;
      ev.preventDefault();
      say({ type: 'iterra:hotkey', key: k.toLowerCase() });
    });
  }

  var registered = false;
  function register(app, o) {
    me = app;
    opts = o || opts || {};
    publishSummary();
    say({ type: 'iterra:hello', app: app, url: window.location.pathname + window.location.search });
    if (registered) return; // re-registration refreshes summary only —
    // a second heartbeat/listener would double-write the same presence key
    registered = true;
    // keep the presence fresh; summaries are cheap (JSON-diffed)
    setInterval(publishSummary, 3000);
    window.addEventListener('focus', publishSummary);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', publishSummary);
    }
    interceptNav();
  }

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
    cur.items.unshift({ app: me || '?', text: text, url: item.url || undefined, course: item.course || undefined, topic: item.topic || undefined, at: now });
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
      t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
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

  /* ── validation + quarantine ── */

  function badWrite(reason, raw) {
    var q;
    try { q = JSON.parse(localStorage.getItem('iterra.v1.quarantine') || '[]'); } catch (e) { q = []; }
    q.unshift({ reason: reason, raw: raw && raw.key, at: Date.now() });
    try { localStorage.setItem('iterra.v1.quarantine', JSON.stringify(q.slice(0, 20))); } catch (e) {}
    return { ok: false, error: reason };
  }

  function validateEntity(raw) {
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
        updatedAt: now,
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
      var d = ev && ev.data;
      if (d && d.type === 'iterra:wake') _dispatch('wake', { at: Date.now() });
      if (d && d.type === 'iterra:invoke' && typeof d.intake === 'string') {
        /* direct delivery from a live sender — resolve through the queue so
           ordering stays single-path (drain marks it delivered). */
        drainIntakes(d.to || me || '', function () {});
      }
    });
  } catch (e) {}
  _subs.wake = [];

  /* ── entities ── */

  function storeReady() {
    return openDB().then(function () { return _dbMode; });
  }

  function storePut(raw) {
    var v = validateEntity(raw);
    if (!v.ok) return Promise.resolve(v);
    var e = v.entity;
    return openDB().then(function (d) {
      if (d) {
        return idbTx(d, 'entities', 'readonly', function (s) { return s.get(e.key); }).then(function (prev) {
          if (prev && prev.createdAt) e.createdAt = prev.createdAt;
          return idbTx(d, 'entities', 'readwrite', function (s) { s.put(e); });
        });
      }
      var b = lsRead('entities');
      if (b[e.key] && b[e.key].createdAt) e.createdAt = b[e.key].createdAt;
      b[e.key] = e;
      /* cap: evict oldest-updated beyond LS_CAPS.entities */
      var keys = Object.keys(b);
      if (keys.length > LS_CAPS.entities) {
        keys.sort(function (a, b2) { return (b[a].updatedAt || 0) - (b[b2].updatedAt || 0); });
        for (var i = LS_CAPS.entities; i < keys.length; i++) delete b[keys[i]];
      }
      lsWrite('entities', b);
    }).then(function () {
      _notify('entity', { op: 'put', entity: e });
      syncPush(e);
      return { ok: true, entity: e };
    }).catch(function (err) {
      /* IDB mid-flight failure → drop to LS and retry once */
      if (_dbMode === 'idb') {
        _dbMode = 'ls'; _dbp = Promise.resolve(null);
        return storePut(raw);
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

  function storeRemove(key) {
    return openDB().then(function (d) {
      if (d) return idbTx(d, 'entities', 'readwrite', function (s) { s.delete(key); });
      var b = lsRead('entities');
      delete b[key];
      lsWrite('entities', b);
    }).then(function () {
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

  function eventEmit(type, payload) {
    var v = validateEvent(type, payload);
    if (!v.ok) return Promise.resolve(v);
    var rec = {
      type: type, app: (v.payload && v.payload.app) || me || '?',
      payload: v.payload, at: Date.now(),
    };
    return openDB().then(function (d) {
      if (d) {
        return idbTx(d, 'events', 'readwrite', function (s) { s.add(rec); });
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
      if (keys.length > INTAKE_CAP) for (var i = INTAKE_CAP; i < keys.length; i++) delete b[keys[i]];
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
    return openDB().then(function (d) {
      var write = function (cur) {
        if (!cur) return;
        cur.delivered = Date.now();
        cur.result = result;
        if (d) return idbTx(d, 'intakes', 'readwrite', function (s) { s.put(cur); });
        var b = lsRead('intakes');
        b[cur.id] = cur;
        lsWrite('intakes', b);
      };
      if (d) return idbTx(d, 'intakes', 'readonly', function (s) { return s.get(id); }).then(write);
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
  function drainIntakes(app, done) {
    intakesPending(app).then(function (rows) {
      var i = 0;
      /* a frame launched at ?intake=<id> exists to receive that intake —
         the handler's result.url is where delivery lands (e.g. a bound
         autostart timer, the new note). Navigate only for that record so a
         routine boot draining background intakes isn't hijacked. */
      var launchedFor = null;
      try { launchedFor = new URLSearchParams(window.location.search).get('intake'); } catch (e) {}
      if (launchedFor && !_launchChecked) {
        _launchChecked = true;
        if (!rows.some(function (r) { return r.id === launchedFor; })) {
          /* launched at ?intake=<id> but the record already resolved — a
             drain on another mount beat the sender's 'direct' deadline and
             nobody navigated to the result. Land on it once so this reload
             doesn't evaporate the delivery. */
          intakeGet(launchedFor).then(function (rec) {
            if (rec && rec.to === app && rec.delivered && rec.result && rec.result.url) {
              try { window.location.assign(rec.result.url); } catch (e) {}
            }
          });
        }
      }
      var next = function () {
        if (i >= rows.length) { done(); return; }
        var rec = rows[i++];
        var h = _deliveries[app + ':' + rec.action] || _deliveries[app + ':*'];
        var finish = function (result) {
          intakeResolve(rec.id, result).then(function () {
            /* {toast} contract — a handler may return a one-line toast the
               terrain surfaces wherever the resolve landed (ambient rail
               reads intake.resolved events). */
            if (result && typeof result.toast === 'string') {
              try { emit('intake.resolved', { to: rec.to, action: rec.action, toast: result.toast, by: me || undefined }); } catch (e) {}
            }
            if (launchedFor && rec.id === launchedFor && result && result.url) {
              try { window.location.assign(result.url); return; } catch (e) {}
            }
            next();
          });
        };
        if (!h) { finish(undefined); return; }
        try {
          var r = h(rec);
          if (r && typeof r.then === 'function') r.then(finish, function () { finish(undefined); });
          else finish(r);
        } catch (e) { finish(undefined); }
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
     the local clock, merges them through storePut (validation + quarantine
     still apply — bad remote data can't bypass the contract), then mirrors
     every subsequent local put/remove outward. One adapter at a time;
     attach() again replaces it. */
  var _sync = { adapter: null, attachedAt: 0, lastPull: 0, error: null };

  function syncAttach(adapter) {
    if (!adapter || typeof adapter.pull !== 'function' || typeof adapter.put !== 'function') {
      return Promise.resolve({ ok: false, error: 'adapter needs pull(since) and put(entity)' });
    }
    _sync.adapter = adapter;
    _sync.attachedAt = Date.now();
    _sync.error = null;
    return storeList({}).then(function (all) {
      var newest = 0;
      for (var i = 0; i < all.length; i++) if ((all[i].updatedAt || 0) > newest) newest = all[i].updatedAt;
      return adapter.pull(newest).then(function (remote) {
        remote = remote || [];
        var chain = Promise.resolve();
        remote.forEach(function (re) {
          chain = chain.then(function () {
            /* resolver may swap the remote copy; validation still gates it */
            var merged = typeof adapter.onConflict === 'function' ? adapter.onConflict(null, re) : re;
            if (merged) return storePut(merged).then(function () {});
          });
        });
        return chain.then(function () {
          _sync.lastPull = Date.now();
          return { ok: true, pulled: remote.length, adapter: adapter.name || 'sync' };
        });
      }).catch(function (e) {
        _sync.error = String(e && e.message || e);
        return { ok: false, error: _sync.error };
      });
    });
  }

  function syncPush(entity) {
    var a = _sync.adapter;
    if (!a) return;
    try { a.put(entity); } catch (e) { _sync.error = String(e && e.message || e); }
  }

  function syncPushRemove(key) {
    var a = _sync.adapter;
    if (!a || typeof a.remove !== 'function') return;
    try { a.remove(key); } catch (e) { _sync.error = String(e && e.message || e); }
  }

  function syncStatus() {
    return {
      attached: !!_sync.adapter,
      adapter: _sync.adapter ? (_sync.adapter.name || 'sync') : null,
      attachedAt: _sync.attachedAt || null,
      lastPull: _sync.lastPull || null,
      error: _sync.error,
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
      if (d) { idbTx(d, 'events', 'readwrite', function (s) { s.add(rec); }).then(function () { _notify('event', rec); }); return; }
      var b = lsRead('events');
      var seq = (b._seq || 0) + 1;
      b._seq = seq;
      rec.seq = seq;
      b[seq] = rec;
      lsWrite('events', b);
      _notify('event', rec);
    });
  };

  window.iterra = {
    register: register,
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
