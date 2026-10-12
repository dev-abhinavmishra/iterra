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
  };
})();
