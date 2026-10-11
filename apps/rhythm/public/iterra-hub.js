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
    if (j === lastSummaryJson) return;
    lastSummaryJson = j;
    var map = readApps();
    map[me] = { app: me, title: (opts && opts.title) || me, summary: s, at: Date.now() };
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
    if (!framed) { window.open(url, '_blank', 'noopener'); return; }
    var abs;
    try { abs = new URL(url, window.location.href); } catch (e) { return; }
    if (abs.origin !== window.location.origin) { window.open(abs.href, '_blank', 'noopener'); return; }
    if (!/^\/apps\/[^/]+\//.test(abs.pathname) && me) {
      abs = new URL(selfBase() + abs.pathname + abs.search + abs.hash, window.location.origin);
    }
    say({ type: 'iterra:open', from: me || undefined, url: abs.pathname + abs.search + abs.hash });
  }

  function selfBase() {
    if (framed && me) return '/apps/' + me;
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
      var abs;
      try { abs = new URL(u, window.location.href); } catch (e) { abs = null; }
      if (abs && abs.origin === window.location.origin) {
        open(abs.pathname + abs.search + abs.hash);
        return { closed: false, focus: function () {}, close: function () {}, location: { href: abs.href } };
      }
      return origOpen.call(window, url, target, features);
    };

    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[target="_blank"]') : null;
      if (!a) return;
      var abs;
      try { abs = new URL(a.getAttribute('href') || '', window.location.href); } catch (e) { return; }
      if (abs.origin !== window.location.origin) return;
      ev.preventDefault();
      ev.stopPropagation();
      open(abs.pathname + abs.search + abs.hash);
    }, true);
  }

  function register(app, o) {
    me = app;
    opts = o || {};
    publishSummary();
    say({ type: 'iterra:hello', app: app, url: window.location.pathname + window.location.search });
    // keep the presence fresh; summaries are cheap (JSON-diffed)
    setInterval(publishSummary, 3000);
    window.addEventListener('focus', publishSummary);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', publishSummary);
    }
    interceptNav();
  }

  /* Shared per-namespace documents — the hub store siblings can read. */
  function doc(ns) {
    var key = DOC_PREFIX + ns;
    return {
      get: function () {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
      },
      set: function (v) {
        try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
      },
      subscribe: function (cb) {
        var h = function (ev) { if (ev.key === key) cb(ev.newValue ? JSON.parse(ev.newValue) : null); };
        window.addEventListener('storage', h);
        return function () { window.removeEventListener('storage', h); };
      },
    };
  }

  window.iterra = {
    register: register,
    open: open,
    openApp: function (name, url) { open(url || ('/apps/' + name + '/')); },
    selfBase: selfBase,
    interceptNav: interceptNav,
    doc: doc,
    apps: readApps,
    isFramed: function () { return framed; },
  };
})();
