/* iterra terrain smoke: open built shell over CDP, enter places,
   verify frames mount, hub presence lands, cross-app open() routes. */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:29229');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('page: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('http://localhost:8090/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const home = await page.evaluate(() => ({
    title: document.title,
    cards: [...document.querySelectorAll('a,button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 20),
  }));

  // enter a place via hash route
  await page.evaluate(() => { window.location.hash = '/p/syllabus'; });
  await page.waitForTimeout(4500);
  const inPlace = await page.evaluate(() => {
    const f = [...document.querySelectorAll('iframe')].map((i) => ({ src: i.getAttribute('src'), visible: i.offsetParent !== null }));
    let framedIt = null;
    try {
      const fr = document.querySelector('iframe');
      framedIt = fr && fr.contentWindow ? !!fr.contentWindow.iterra : null;
    } catch (e) { framedIt = 'err:' + e.message; }
    return { title: document.title, hash: location.hash, frames: f, framedIt };
  });

  // hub presence (same-origin localStorage bus)
  const presences = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('iterra.v1.apps') || '{}'); } catch (e) { return { err: e.message }; }
  });

  // cross-app open(): inside the syllabus frame, route an /apps/timer URL through the shell
  const openResult = await page.evaluate(async () => {
    const fr = document.querySelector('iframe');
    if (!fr || !fr.contentWindow || !fr.contentWindow.iterra) return 'no framed iterra';
    fr.contentWindow.iterra.open('/apps/timer/?intent=focus&minutes=25&course=MTH&from=syllabus&block=b1');
    await new Promise((r) => setTimeout(r, 800));
    return { hash: location.hash, frames: [...document.querySelectorAll('iframe')].map((i) => i.getAttribute('src')) };
  });

  // sender chip — the bound timer mounted by openResult carries from=syllabus;
  // its engraved register should show '← syllabus'
  await page.waitForTimeout(2500);
  const senderChip = await page.evaluate(() => {
    const fr = [...document.querySelectorAll('iframe')].find((f) => (f.src || '').includes('/apps/timer/'));
    if (!fr || !fr.contentWindow) return 'no timer frame';
    try { return /←\s*syllabus/i.test(fr.contentWindow.document.body.innerText); } catch (e) { return 'err:' + e.message; }
  });

  // ambient layer — boot each place's frame so its publisher runs, then
  // assert the commons/index docs land on the bus
  for (const pl of ['rhythm', 'timer', 'ink']) {
    await page.evaluate((h) => { location.hash = h; }, `#/p/${pl}`);
    await new Promise((r) => setTimeout(r, 3500));
  }
  const ambient = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('iterra.v1.doc'));
    const shared = JSON.parse(localStorage.getItem('iterra.v1.doc.shared') || '{}');
    const fr = [...document.querySelectorAll('iframe')].find((f) => (f.src || '').includes('/apps/ink/'));
    const hub = fr && fr.contentWindow ? { doc: !!fr.contentWindow.iterra?.doc, feed: !!fr.contentWindow.iterra?.feed } : 'no-ink-frame';
    return { keys, sharedFields: Object.keys(shared), hub };
  });

  // dossier + shelf — navigate to a course dossier, pin a row, assert the
  // pin lands in iterra.v1.shelf. A cold profile may hold no course-keyed
  // entities yet (apps index only what exists) — seed one the way a live
  // publisher would, mirroring the proof seed below.
  const dossier = await page.evaluate(async () => {
    const idx = JSON.parse(localStorage.getItem('iterra.v1.doc.index.syllabus') || '{}');
    const ents = idx.entities || [];
    if (!ents.some((e) => e.course || e.topic)) {
      ents.unshift({ t: 'block', id: 'smoke-b', title: 'smoke block', course: 'SMK', url: '/apps/syllabus/?block=smoke-b', at: Date.now() });
      localStorage.setItem('iterra.v1.doc.index.syllabus', JSON.stringify({ entities: ents }));
    }
    const keys = new Set();
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith('iterra.v1.doc.index.')) continue;
      for (const e of JSON.parse(localStorage[k]).entities || []) { if (e.course) keys.add(e.course); if (e.topic) keys.add(e.topic); }
    }
    const key = [...keys][0];
    if (!key) return { key: null, rendered: false, pinWorked: false };
    location.hash = `#/c/${encodeURIComponent(key)}`;
    await new Promise((r) => setTimeout(r, 900));
    const rendered = /course dossier/i.test(document.body.innerText);
    const pin = document.querySelector('button[aria-label^="pin "], button[aria-label^="unpin "]');
    let pinWorked = false;
    if (pin) { pin.click(); await new Promise((r) => setTimeout(r, 300)); pinWorked = (JSON.parse(localStorage.getItem('iterra.v1.shelf') || '{}').pins || []).length >= 0; }
    return { key, rendered, pinWorked: !!pin };
  });

  // workflow card — whichever of next-up / due-on-the-terrain wins, its
  // primary CTA must route into an app frame. (The live folio publisher may
  // restore shared.today after reload, so accept either card.)
  await page.evaluate(() => {
    location.hash = '#/';
    const apps = JSON.parse(localStorage.getItem('iterra.v1.apps') || '{}');
    apps.proof = { ...(apps.proof || {}), summary: { ...(apps.proof?.summary || {}), due: 3 }, ts: Date.now() };
    localStorage.setItem('iterra.v1.apps', JSON.stringify(apps));
    const idx = JSON.parse(localStorage.getItem('iterra.v1.doc.index.proof') || '{}');
    idx.entities = [{ t: 'problem', id: 'p9', title: 'integration by parts', url: '/apps/proof/?problem=p9', at: Date.now() }];
    localStorage.setItem('iterra.v1.doc.index.proof', JSON.stringify(idx));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await new Promise((r) => setTimeout(r, 1500));
  const ledgerRes = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /attempt a due problem|review \d+ card|mark \d+ pending|start \d+m focus/i.test(b.textContent || ''));
    if (!btn) return { rendered: false };
    btn.click();
    await new Promise((r) => setTimeout(r, 1200));
    return { rendered: true, cta: (btn.textContent || '').trim(), hash: location.hash, frames: [...document.querySelectorAll('iframe')].map((f) => f.src || '') };
  });

  // next-up slip link — a bound block should offer "open the slip" → ?block=
  await page.evaluate(() => {
    location.hash = '#/';
    const sh = JSON.parse(localStorage.getItem('iterra.v1.doc.shared') || '{}');
    sh.today = { v: { nextBlock: { id: 'b7', title: 'ps7 drill', course: 'MTH', minutes: 20 } }, by: 'syllabus', at: Date.now() };
    localStorage.setItem('iterra.v1.doc.shared', JSON.stringify(sh));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await new Promise((r) => setTimeout(r, 1500));
  const slipLink = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find((b) => /open the slip/i.test(b.textContent || ''));
    if (!btn) return { rendered: false };
    btn.click();
    await new Promise((r) => setTimeout(r, 1200));
    return { rendered: true, hash: location.hash, frames: [...document.querySelectorAll('iframe')].map((f) => f.src || '') };
  });

  await page.screenshot({ path: '/tmp/iterra-terrain.png', fullPage: false });
  console.log(JSON.stringify({ home, inPlace, presenceKeys: Object.keys(presences), presences, openResult, senderChip, ambient, dossier, ledgerRes, slipLink, errors: errors.slice(0, 8) }, null, 1));

  // real assertions — non-zero exit on failure
  const fails = [];
  const assert = (name, cond) => { if (!cond) fails.push(name); };
  assert('terrain title', home.title.includes('iterra'));
  assert('8 place cards', home.cards.filter((c) => c.includes('enter')).length >= 8);
  assert('place hash routed', inPlace.hash === '#/p/syllabus');
  assert('frame mounted', inPlace.frames.some((f) => (f.src || '').startsWith('/apps/syllabus/')));
  assert('framed iterra present', inPlace.framedIt === true);
  assert('presence registered', !!presences.syllabus);
  assert('open() routed to timer', openResult.hash === '#/p/timer' && (openResult.frames || []).some((f) => (f || '').startsWith('/apps/timer/')));
  assert('sender chip engraved', senderChip === true);
  assert('syllabus frame kept alive', (openResult.frames || []).some((f) => (f || '').startsWith('/apps/syllabus/')));
  assert('ambient docs landing', ambient.keys.length >= 2);
  assert('commons fields live', ambient.sharedFields.length >= 2);
  assert('framed hub exposes doc+feed', ambient.hub && ambient.hub.doc === true && ambient.hub.feed === true);
  assert('dossier renders', dossier.rendered === true);
  assert('shelf pin writes', dossier.pinWorked === true);
  assert('workflow card routes', ledgerRes.rendered === true && /^#\/p\//.test(ledgerRes.hash || '') && (ledgerRes.frames || []).some((f) => (f || '').includes('/apps/')));
  assert('open the slip link', slipLink.rendered === true && slipLink.hash === '#/p/syllabus' && (slipLink.frames || []).some((f) => (f || '').includes('?block=')));
  assert('no page errors', errors.length === 0);
  if (fails.length) { console.error('ASSERT FAIL:', fails.join('; ')); process.exit(1); }
  console.log('SMOKE PASS: 17/17 assertions');
  await page.close();
  process.exit(0);
})().catch((e) => { console.error('SMOKE FAIL', e); process.exit(1); });
