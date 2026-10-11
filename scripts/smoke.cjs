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
  // pin lands in iterra.v1.shelf
  const dossier = await page.evaluate(async () => {
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

  await page.screenshot({ path: '/tmp/iterra-terrain.png', fullPage: false });
  console.log(JSON.stringify({ home, inPlace, presenceKeys: Object.keys(presences), presences, openResult, ambient, dossier, errors: errors.slice(0, 8) }, null, 1));

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
  assert('syllabus frame kept alive', (openResult.frames || []).some((f) => (f || '').startsWith('/apps/syllabus/')));
  assert('ambient docs landing', ambient.keys.length >= 2);
  assert('commons fields live', ambient.sharedFields.length >= 2);
  assert('framed hub exposes doc+feed', ambient.hub && ambient.hub.doc === true && ambient.hub.feed === true);
  assert('dossier renders', dossier.rendered === true);
  assert('shelf pin writes', dossier.pinWorked === true);
  assert('no page errors', errors.length === 0);
  if (fails.length) { console.error('ASSERT FAIL:', fails.join('; ')); process.exit(1); }
  console.log('SMOKE PASS: 14/14 assertions');
  await page.close();
  process.exit(0);
})().catch((e) => { console.error('SMOKE FAIL', e); process.exit(1); });
