/* iterra adapter — Flashcards (workflow A tail + retest target).
   Publishes each deck as {type:'deck'} and each card as a light
   {type:'card'} entity, emits 'card.reviewed' on status transitions and
   forwards the same beat to rhythm ('log.activity'). Handles the
   'cards.create' + 'problem.retest' intakes: find-or-create a deck,
   append the sent cards due-now (status 'new'), link retest cards back
   to the entity they came from.
   This file loads BEFORE app.js — every touch of app internals goes
   through lazy lookups so standalone and any load order keep working. */
(function () {
  'use strict';

  const hub = () => (typeof window !== 'undefined' ? window.iterra : undefined);

  /* ── lazy reach into app.js globals ─────────────────────────────────
     const bindings (state) live in the shared global lexical env — they
     resolve inside function bodies once app.js has evaluated. typeof on
     an undeclared/TDZ name throws, so probe inside try/catch. */
  function model() {
    try { if (typeof state === 'object' && state && state.decks) return state; } catch {}
    return null;
  }
  const fn = (n) => (typeof window !== 'undefined' && typeof window[n] === 'function' ? window[n] : null);

  let appReady = null;
  function whenApp() {
    if (appReady) return appReady;
    appReady = new Promise((res) => {
      let n = 0;
      const tick = () => {
        const s = model();
        if (s) return res(s);
        if (++n > 240) return res(null);
        setTimeout(tick, 25);
      };
      tick();
    });
    return appReady;
  }

  /* ── pure helpers (contract-tested) ─────────────────────────────── */

  const normLite = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  function deckUrl(d) { return '/apps/flashcards/?deck=' + encodeURIComponent(d.id); }

  function deckEntity(d, bound) {
    bound = bound || {};
    return {
      app: 'flashcards', type: 'deck', id: d.id,
      courseId: bound.courseId ?? d.courseId,
      course: bound.course ?? d.course,
      title: d.title,
      sub: `${d.cards.filter((c) => c.status !== 'mastered').length} due`,
      url: deckUrl(d),
      createdAt: d.createdAt,
      data: {
        count: d.cards.length,
        due: d.cards.filter((c) => c.status !== 'mastered').length,
      },
    };
  }

  function cardEntity(c, d, bound) {
    bound = bound || {};
    return {
      app: 'flashcards', type: 'card', id: c.id,
      courseId: bound.courseId ?? d.courseId,
      course: bound.course ?? d.course,
      title: String(c.q || '').slice(0, 160),
      sub: String(c.a || '').slice(0, 200),
      url: deckUrl(d),
      createdAt: d.createdAt,
      data: {
        deckId: d.id,
        status: c.status,
        /* the deck model schedules by status, not timestamps:
           0 = due now, null = mastered (not due) */
        dueAt: c.status === 'mastered' ? null : 0,
      },
    };
  }

  /* deterministic field signature — used to skip redundant puts and to
     compare against entities already in the store at boot */
  function sig(e) {
    return JSON.stringify([e.app, e.type, e.id, e.courseId, e.course, e.topic,
      e.title, e.sub, e.url, e.data, e.createdAt]);
  }

  /* intake payload → clean card list (keeps {q,a,ex}, drops unusable) */
  function intakeCards(payload) {
    const raw = payload && Array.isArray(payload.cards) ? payload.cards : [];
    return raw
      .map((c) => ({
        q: String((c && c.q) ?? '').trim(),
        a: String((c && c.a) ?? '').trim(),
        ex: String((c && c.ex) ?? '').trim(),
      }))
      .filter((c) => c.q && c.a);
  }

  /* ── course binding ─────────────────────────────────────────────── */

  async function boundCourse(courseId, course) {
    const it = hub();
    if (!it?.courses) return { courseId, course };
    try {
      const ref = courseId ? { courseId } : course;
      if (!ref) return {};
      const c = await it.courses.resolve(ref);
      return {
        courseId: (c && c.key) || courseId,
        course: (c && (c.data && c.data.code || c.course)) || (c && c.id) || course,
      };
    } catch { return { courseId, course }; }
  }

  /* ── mirror: local cardfile store → canonical entities ──────────── */

  const shadow = new Map();   // entity key -> sig of last published entity
  const lastStatus = new Map(); // card id -> last published status
  let mirroring = false;
  let mirrorQueued = false;

  async function putIfChanged(ent) {
    const key = `${ent.app}:${ent.type}:${ent.id}`;
    const s = sig(ent);
    if (shadow.get(key) === s) return false;
    shadow.set(key, s);
    try { await hub().store.put(ent); return true; } catch { return false; }
  }

  async function reviewed(c, d, bound) {
    const it = hub();
    if (!it) return;
    const url = deckUrl(d);
    try {
      it.events?.emit('card.reviewed', {
        cardId: c.id, deckId: d.id,
        courseId: bound.courseId, course: bound.course,
        text: `card reviewed — ${d.title}`, url,
      });
    } catch {}
    /* workflow A tail — rhythm keeps the activity register */
    try {
      await it.send?.({
        to: 'rhythm', action: 'log.activity',
        payload: {
          kind: 'card.reviewed',
          courseId: bound.courseId,
          course: bound.course,
          label: 'card review · ' + d.title,
        },
      });
    } catch {}
  }

  async function mirror() {
    const it = hub();
    const s = model();
    if (!it?.store || !s) return;
    if (mirroring) { mirrorQueued = true; return; }
    mirroring = true;
    try {
      const live = new Set();
      for (const d of Object.values(s.decks)) {
        if (!d || !d.id || !Array.isArray(d.cards)) continue;
        const bound = await boundCourse(d.courseId, d.course);
        live.add('flashcards:deck:' + d.id);
        await putIfChanged(deckEntity(d, bound));
        for (const c of d.cards) {
          if (!c || !c.id) continue;
          live.add('flashcards:card:' + c.id);
          const prev = lastStatus.get(c.id);
          const wrote = await putIfChanged(cardEntity(c, d, bound));
          /* a review = status left 'new' — transitions to 'new' (resets)
             don't count */
          if (prev && prev !== c.status && c.status !== 'new') {
            await reviewed(c, d, bound);
          }
          lastStatus.set(c.id, c.status);
        }
      }
      /* orphans: published once, gone locally now */
      for (const key of Array.from(shadow.keys())) {
        if (live.has(key)) continue;
        shadow.delete(key);
        try { await it.store.remove(key); } catch {}
      }
    } catch {
      /* best-effort mirror */
    } finally {
      mirroring = false;
      if (mirrorQueued) { mirrorQueued = false; void mirror(); }
    }
  }

  /* ── intake: cards.create + problem.retest ───────────────────────── */

  async function handleCards(rec) {
    const it = hub();
    const s = await whenApp();
    if (!s) throw new Error('flashcards app not ready');
    const p = (rec && rec.payload) || {};
    const cards = intakeCards(p);
    if (!cards.length) return null;

    const title = String(p.deckTitle || p.course || 'Sent cards').slice(0, 200) || 'Sent cards';
    const bound = await boundCourse(p.courseId, p.course);
    const want = normLite(title);
    let d = Object.values(s.decks).find((x) => normLite(x && x.title) === want) || null;

    const createDeck = fn('createDeck'), newCard = fn('newCard'),
      diacritics = fn('diacritics') || ((x) => x),
      saveStore = fn('saveStore'), selectDeck = fn('selectDeck');
    if (!createDeck || !newCard) throw new Error('flashcards app not ready');

    if (!d) {
      d = createDeck(title, []);
      if (bound.course || p.course) d.course = bound.course || p.course;
      if (bound.courseId || p.courseId) d.courseId = bound.courseId || p.courseId;
    }

    const seen = new Set(d.cards.map((c) => normLite(c.q) + '' + normLite(c.a)));
    const created = [];
    for (const c of cards) {
      const q = diacritics(c.q), a = diacritics(c.a), ex = diacritics(c.ex);
      const fp = normLite(q) + '' + normLite(a);
      if (seen.has(fp)) continue;
      seen.add(fp);
      const card = newCard(q, a, ex);   // status 'new' = due now
      d.cards.push(card);
      created.push(card);
    }

    saveStore && saveStore();            // wrapper runs mirror()
    try { selectDeck && selectDeck(d.id); } catch {}

    /* lineage: the sent entity links to every card it produced —
       'retest' for problem.retest (workflow C), 'derived' for cards.create
       (workflow A — a margin note's selection becomes real cards). */
    if (rec && rec.entity && rec.entity.key && it?.links?.add) {
      const kind = rec.action === 'problem.retest' ? 'retest' : 'derived';
      for (const c of created) {
        try { await it.links.add(rec.entity.key, `flashcards:card:${c.id}`, kind); } catch {}
      }
    }

    if (created.length) {
      try {
        it?.events?.emit('card.created', {
          deckId: d.id, count: created.length,
          courseId: bound.courseId, course: bound.course,
          text: `${created.length} card${created.length > 1 ? 's' : ''} → ${d.title}`,
          url: deckUrl(d),
        });
      } catch {}
    }
    return { url: deckUrl(d) };
  }

  /* ── boot: seed shadow from the store, wrap saveStore, first mirror ─ */

  let hooked = false;
  function hookStore() {
    if (hooked) return;
    const orig = fn('saveStore');
    if (!orig) return;
    hooked = true;
    window.saveStore = function () {
      const r = orig.apply(this, arguments);
      try { void mirror(); } catch {}
      return r;
    };
  }

  async function prime() {
    const it = hub();
    if (!it?.store?.list) return;
    try {
      const rows = await it.store.list({ app: 'flashcards' });
      for (const e of rows || []) {
        if (!e || !e.key) continue;
        shadow.set(e.key, sig(e));
        if (e.type === 'card' && e.data && e.data.status) lastStatus.set(e.id, e.data.status);
      }
    } catch {}
  }

  function boot() {
    hookStore();
    void (async () => { await prime(); await mirror(); })();
  }

  function registerAdapter() {
    const it = hub();
    if (!it?.adapter) return;
    it.adapter({
      name: 'flashcards',
      title: 'Flashcards',
      summary: () => {
        const s = model();
        if (!s) return {};
        const decks = Object.values(s.decks);
        return {
          decks: decks.length,
          due: decks.reduce((n, d) => n + d.cards.filter((c) => c.status !== 'mastered').length, 0),
        };
      },
      intakes: {
        'cards.create': handleCards,
        'problem.retest': handleCards,
      },
      wake: () => { hookStore(); void mirror(); },
    });
    boot();
  }

  /* debug/test handle — same names the contract test drives */
  if (typeof window !== 'undefined') {
    window.__fcAdapter = {
      hub, model, whenApp, deckEntity, cardEntity, sig, intakeCards,
      boundCourse, mirror, handleCards, hookStore, shadow, lastStatus,
    };
  }

  if (typeof window !== 'undefined') {
    if (window.iterra) registerAdapter();
    else window.addEventListener('load', registerAdapter);
    /* app.js evaluates after us — wrap saveStore once it's there even if
       the hub never loads */
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', hookStore);
    else hookStore();
  }
})();
