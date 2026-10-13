/* appcheck: flashcards — clickpath regression probe for the cardfile,
   driven through the terrain shell (not the bare app URL).

   Covers the first-use path + the terrain contract flashcards owns:
     library empty-state → cards.create intake → deck lands + ?deck= deep
     link → deck view + mode tabs → card flip + grading → canonical
     flashcards:{deck,card} entities + index.flashcards + presence →
     feed → 390px overflow.

   BASE selects the deployment under test:
     BASE=http://localhost:8090  → integrated shell (frames)
     BASE=http://localhost:3007  → flashcards standalone (drives the same
                                  UI in-document; shell-only checks skip)
   CDP overrides the chrome debugging endpoint (default :29304). */

const BASE = process.env.BASE || 'http://localhost:8090';
const CDP = process.env.CDP || 'http://localhost:29304';
const { chromium } = require('playwright-core');
let page = null;

(async () => {
  const browser = await chromium.connectOverCDP(CDP);
  page = await browser.contexts()[0].newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('page: ' + e.message));
  const results = [];
  const row = (name, ok, detail) => results.push([name, ok === 'skip' ? 'skip' : !!ok, detail]);
  const RUN = 'fc' + Date.now().toString(36);
  const until = async (fn, ms = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await fn()) return true;
      await page.waitForTimeout(600);
    }
    return false;
  };

  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);

  /* ── mode detect: shell = an /apps/flashcards/ frame; else standalone ── */
  const hasHub = await page.evaluate(() => typeof window.iterra === 'object' && !!window.iterra?.send);
  await page.evaluate(() => { window.location.hash = '/p/flashcards'; });
  let app = null;
  await page.waitForTimeout(2500);
  const frameOf = () => page.frames().find((f) => f.url().includes('/apps/flashcards/'));
  let shell = !!frameOf();
  if (!shell) {
    const bodyIsFc = await page.evaluate(() => /deck|flashcard|cardfile|new deck/i.test(document.body.innerText || ''));
    if (bodyIsFc) { app = page; shell = false; }
    else if (await until(() => !!frameOf(), 8000)) { shell = true; }
  }
  if (shell) app = frameOf();
  row('mounts', !!app, shell ? 'shell frame /apps/flashcards/' : (app ? 'standalone document' : 'no flashcards surface'));

  const appText = async () => { try { return await app.evaluate(() => document.body.innerText); } catch { return ''; } };
  const clickId = (id) => app.evaluate((i) => {
    const b = document.getElementById(i);
    if (b) { b.click(); return true; } return false;
  }, id);
  const decks = () => app.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('cardfile.decks.v1') || '{}'); } catch { return {}; }
  });
  const send = (opts) => page.evaluate(async (o) => {
    try { return await window.iterra.send(o); } catch (e) { return { ok: false, error: String(e) }; }
  }, opts);
  const honor = async (r, waitMs = 3500) => {
    if (shell && r?.delivered === 'direct' && r.url && r.url.includes('?')) {
      await page.evaluate((u) => window.postMessage({ type: 'iterra:open', url: u }, location.origin), r.url);
    } else if (shell) {
      await page.evaluate(() => { window.location.hash = '/p/flashcards'; });
    } else if (r?.url) {
      await page.goto(`${BASE}${r.url}`.replace(`${BASE}/apps/flashcards`, `${BASE}`), { waitUntil: 'load' });
    }
    await page.waitForTimeout(waitMs);
    app = shell ? frameOf() : page;
  };

  /* clean slate — an empty cardfile so first-use paths run */
  if (app) {
    await app.evaluate(() => {
      localStorage.removeItem('cardfile.decks.v1');
      localStorage.removeItem('cardfile.lastDeck');
    });
    if (shell) { await page.evaluate(() => { window.location.hash = '/p/flashcards'; }); }
    await app.evaluate(() => location.reload());
    await page.waitForTimeout(2500);
    if (shell) app = frameOf();
  }

  /* ── 1. library empty-state renders ── */
  let t = await appText();
  const libUp = /new deck/i.test(t);
  row('library boots', libUp, t.slice(0, 90));
  row('empty-state hint on clean cardfile', !libUp || /no decks|starts one|Import/i.test(t), t.slice(0, 120));

  /* ── 2. cards.create intake → deck + cards + deep link ── */
  let deckId = null;
  if (hasHub) {
    const r = await send({
      to: 'flashcards', action: 'cards.create',
      entity: { app: 'margin', type: 'note', id: `src-${RUN}`, title: `fc-source-${RUN}` },
      payload: {
        deckTitle: `appcheck-${RUN}`,
        cards: [
          { q: `q1 ${RUN}`, a: `a1 ${RUN}`, ex: 'ex one' },
          { q: `q2 ${RUN}`, a: `a2 ${RUN}` },
        ],
      },
    });
    const made = await until(async () => JSON.stringify(await decks()).includes(`appcheck-${RUN}`), 10000);
    await honor(r, 3500);
    deckId = r?.url ? (r.url.match(/deck=([^&]+)/) || [])[1] : null;
    const d = (await decks())[decodeURIComponent(deckId || '')] ||
      Object.values(await decks()).find((x) => x.title === `appcheck-${RUN}`);
    t = await appText();
    row('cards.create files a deck + opens it', r.ok && !!d && (d.cards || []).length === 2 && new RegExp(`appcheck-${RUN}`).test(t),
      `ok=${r.ok} deck=${d?.title || '-'} cards=${d?.cards?.length}`);
    /* canonical entities + index + presence */
    const entOk = await until(async () => {
      const rows = await page.evaluate(() => window.iterra.store.list({ app: 'flashcards' }));
      return rows.some((e) => e.type === 'deck') && rows.some((e) => e.type === 'card' && (e.title || e.sub || '').includes(RUN));
    }, 14000);
    row('canonical flashcards:{deck,card} entities', entOk, '');
    const idx = await page.evaluate(() => window.iterra.doc('index.flashcards').get());
    row('index.flashcards lists the deck', !!idx?.entities?.some((e) => (e.title || '').includes(`appcheck-${RUN}`)),
      `entities=${idx?.entities?.length}`);
    const pres = await page.evaluate(() => (window.iterra.apps() || {})['flashcards']);
    row('presence registered', !!pres, JSON.stringify(pres?.summary || {}));
    /* lineage: intake entity links to every produced card */
    const linksOk = await until(async () => {
      const links = await page.evaluate(async (k) => {
        try { const r = await window.iterra.links.for(k); return r?.out || []; } catch { return []; }
      }, `margin:note:src-${RUN}`);
      return links.some((l) => String(l.to || '').startsWith('flashcards:card:'));
    }, 10000);
    row('derived links on the source entity', linksOk, '');
  } else {
    row('cards.create files a deck + opens it', 'skip', 'no hub');
    row('canonical flashcards:{deck,card} entities', 'skip', 'no hub');
    row('index.flashcards lists the deck', 'skip', 'no hub');
    row('presence registered', 'skip', 'no hub');
    row('derived links on the source entity', 'skip', 'no hub');
  }

  /* ── 3. review mode: flip a card + grade it ── */
  if (deckId) {
    /* deck view should already be open via selectDeck — the mode tabs prove it */
    t = await appText();
    const inDeck = /review|learn|quiz|write/i.test(t) && new RegExp(RUN).test(t);
    row('deck view shows the new cards', inDeck, t.slice(0, 80));
    /* flip the review card (the stage card element), then grade */
    await app.evaluate(() => {
      const el = document.querySelector('.stage-card, .card-face, [id*="card"], .flashcard');
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(600);
    t = await appText();
    const flippedOrGraded = new RegExp(`a1 ${RUN}|got it|again|easy|hard|grade`, 'i').test(t);
    row('card flips / grade controls appear', flippedOrGraded, t.slice(0, 100));
  } else {
    row('deck view shows the new cards', 'skip', 'no deck');
    row('card flips / grade controls appear', 'skip', 'no deck');
  }

  /* ── 4. ?deck= deep link re-opens the deck (shell only) ── */
  if (shell && hasHub && deckId) {
    const url = `/apps/flashcards/?deck=${encodeURIComponent(deckId)}`;
    await page.evaluate((u) => window.postMessage({ type: 'iterra:open', url: u }, location.origin), url);
    await page.waitForTimeout(3500);
    app = frameOf();
    t = await appText();
    row('?deck=<id> re-opens the deck', new RegExp(`appcheck-${RUN}`).test(t), t.slice(0, 80));
  } else row('?deck=<id> re-opens the deck', 'skip', 'no hub/id');

  /* ── 5. 390px overflow ── */
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(700);
  const m1 = await app.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: document.documentElement.clientWidth }));
  row('390px cardfile has no horizontal overflow', m1.doc <= m1.win + 1, `scrollW=${m1.doc} win=${m1.win}`);
  await page.setViewportSize({ width: 1280, height: 820 });

  /* ── 6. card.created activity reaches the feed (hub only) ── */
  if (hasHub) {
    const fed = await until(async () => {
      const items = await page.evaluate(() =>
        (window.iterra.feedItems?.() || window.iterra.doc('feed').get()?.items || []));
      return items.some((i) => /flashcard|card/i.test(`${i.app || ''} ${i.from || ''} ${i.type || ''} ${JSON.stringify(i)}`));
    }, 12000);
    row('card.created reaches the feed', fed, '');
  } else row('card.created reaches the feed', 'skip', 'no hub');

  row('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ').slice(0, 200));

  /* ── report ── */
  console.log(`\nappcheck:flashcards  ${BASE}${shell ? '' : ' (standalone)'}\n`);
  let pass = 0, fail = 0, skip = 0;
  for (const [name, ok, detail] of results) {
    if (ok === 'skip') { skip++; console.log(`SKIP  ${name} — ${detail || ''}`); }
    else if (ok) { pass++; console.log(`PASS  ${name}`); }
    else { fail++; console.log(`FAIL  ${name} — ${detail || ''}`); }
  }
  console.log(`\n${pass}/${pass + fail} pass · ${skip} skipped · mode=${shell ? 'shell' : 'standalone'} · BASE=${BASE}`);
  try { await page.close(); } catch {}
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('appcheck crashed:', e); try { await page?.close(); } catch {} process.exit(2); });
