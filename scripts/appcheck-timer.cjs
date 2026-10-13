/* appcheck: timer — clickpath regression probe for the focus instrument,
   driven through the terrain shell (not the bare app URL).

   Covers the boot path + the terrain contract timer owns:
     boot sequence → timer face → timer.start intake → bound ?intent&minutes
     landing → synthetic focus session → canonical timer:session entity +
     session.completed → nav views (Watch/Clock/Routes/Departures/Ledger/
     Settings) → feed → 390px overflow.

   BASE selects the deployment under test:
     BASE=http://localhost:8090  → integrated shell (frames)
     BASE=http://localhost:3005  → timer standalone dev server (drives the
                                  same UI in-document; shell-only checks skip)
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
  const RUN = 'tm' + Date.now().toString(36);
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

  /* ── mode detect: shell = an /apps/timer/ frame; else standalone ── */
  const hasHub = await page.evaluate(() => typeof window.iterra === 'object' && !!window.iterra?.send);
  await page.evaluate(() => { window.location.hash = '/p/timer'; });
  let app = null;
  await page.waitForTimeout(3500); // BootSequence animates in
  const frameOf = () => page.frames().find((f) => f.url().includes('/apps/timer/'));
  let shell = !!frameOf();
  if (!shell) {
    const bodyIsTimer = await page.evaluate(() => /timer|focus|watch|departures/i.test(document.body.innerText || ''));
    if (bodyIsTimer) { app = page; shell = false; }
    else if (await until(() => !!frameOf(), 8000)) { shell = true; }
  }
  if (shell) app = frameOf();
  row('mounts', !!app, shell ? 'shell frame /apps/timer/' : (app ? 'standalone document' : 'no timer surface'));

  const appText = async () => { try { return await app.evaluate(() => document.body.innerText); } catch { return ''; } };
  const clickLabel = (label) => app.evaluate((l) => {
    const b = [...document.querySelectorAll('button,[role="button"],a')].find((x) =>
      x.getAttribute('aria-label') === l || x.getAttribute('title') === l ||
      (x.textContent || '').trim() === l);
    if (b && !b.disabled) { b.click(); return true; }
    return false;
  }, label);
  const send = (opts) => page.evaluate(async (o) => {
    try { return await window.iterra.send(o); } catch (e) { return { ok: false, error: String(e) }; }
  }, opts);
  const honor = async (r, waitMs = 4000) => {
    if (shell && r?.delivered === 'direct' && r.url && r.url.includes('?')) {
      await page.evaluate((u) => window.postMessage({ type: 'iterra:open', url: u }, location.origin), r.url);
    } else if (shell) {
      await page.evaluate(() => { window.location.hash = '/p/timer'; });
    } else if (r?.url) {
      await page.goto(`${BASE}${r.url}`.replace(`${BASE}/apps/timer`, `${BASE}`), { waitUntil: 'load' });
    }
    await page.waitForTimeout(waitMs);
    app = shell ? frameOf() : page;
  };

  /* clean slate — sessions + ops so probes are deterministic */
  if (app) {
    await app.evaluate(() => {
      localStorage.removeItem('timer.sessions.v1');
      localStorage.removeItem('timer.ops.v1');
    });
    if (shell) { await page.evaluate(() => { window.location.hash = '/p/timer'; }); }
    await app.evaluate(() => location.reload());
    await page.waitForTimeout(3500); // boot sequence replays
    if (shell) app = frameOf();
  }

  /* ── 1. boot clears to the timer face ── */
  let t = await appText();
  const booted = /timer|focus|departures|watch/i.test(t) &&
    await app.evaluate(() => !!document.querySelector('button[title*="Start"], button[title*="Pause"]'));
  row('boot sequence clears to the timer face', booted, t.slice(0, 90));

  /* ── 2. timer.start intake → bound deep-link landing ── */
  if (hasHub) {
    const r = await send({
      to: 'timer', action: 'timer.start',
      from: 'margin',
      entity: { app: 'margin', type: 'note', id: `n-${RUN}`, title: `bound-${RUN}` },
      payload: { intent: `focus-${RUN}`, minutes: 45, label: `bound-${RUN}` },
    });
    row('timer.start returns a bound url', r.ok && /intent=|minutes=45/.test(r.url || ''), `url=${r.url || '-'}`);
    await honor(r, 4500);
    t = await appText();
    /* the bound landing shows the intent + the bound-from chip */
    const boundOk = new RegExp(`focus-${RUN}|bound-${RUN}|Bound from`, 'i').test(t);
    row('bound landing shows the intent', boundOk, t.slice(0, 110));
  } else {
    row('timer.start returns a bound url', 'skip', 'no hub');
    row('bound landing shows the intent', 'skip', 'no hub');
  }

  /* ── 3. synthetic focus session → canonical entity + session.completed ── */
  if (hasHub) {
    /* saveSession is the app's own write-point — it stamps ids, persists
       timer.sessions.v1 AND dispatches timer:session the adapter mirrors */
    const sid = await app.evaluate((run) => {
      const s = { duration: 25 * 60, type: 'focus', label: `probe-${run}`, timestamp: Date.now(), id: `probe-${run}` };
      const arr = JSON.parse(localStorage.getItem('timer.sessions.v1') || '[]');
      arr.push(s);
      localStorage.setItem('timer.sessions.v1', JSON.stringify(arr));
      window.dispatchEvent(new CustomEvent('timer:session', { detail: s }));
      return s.id;
    }, RUN);
    const entOk = await until(async () => {
      const rows = await page.evaluate(() => window.iterra.store.list({ app: 'timer' }));
      return rows.some((e) => e.type === 'session' && e.id === sid);
    }, 12000);
    row('focus session mirrors to timer:session entity', entOk, `timer:session:${sid}`);
    const pres = await page.evaluate(() => (window.iterra.apps() || {})['timer']);
    row('presence registered', !!pres, JSON.stringify(pres?.summary || {}));
  } else {
    row('focus session mirrors to timer:session entity', 'skip', 'no hub');
    row('presence registered', 'skip', 'no hub');
  }

  /* ── 4. nav views render ── */
  for (const [nav, probe] of [
    ['Watch', /stopwatch|watch|0:0|lap/i],
    ['Clock', /clock|alarm|zone|:/i],
    ['Routes', /route|interval|routine|sequence/i],
    ['Departures', /departure|preset|routine|minutes/i],
    ['Ledger', /ledger|session|stats|history|focus/i],
    ['Settings', /settings|sound|theme|motion/i],
  ]) {
    const clicked = await clickLabel(nav);
    await page.waitForTimeout(900);
    t = await appText();
    row(`${nav} view renders`, clicked && probe.test(t), clicked ? t.slice(0, 70) : 'nav button missing');
  }
  await clickLabel('Timer');
  await page.waitForTimeout(600);

  /* ── 5. 390px overflow ── */
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(700);
  const m1 = await app.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: document.documentElement.clientWidth }));
  row('390px timer has no horizontal overflow', m1.doc <= m1.win + 1, `scrollW=${m1.doc} win=${m1.win}`);
  await page.setViewportSize({ width: 1280, height: 820 });

  /* ── 6. session.completed activity reaches the feed (hub only) ── */
  if (hasHub) {
    const fed = await until(async () => {
      const items = await page.evaluate(() =>
        (window.iterra.feedItems?.() || window.iterra.doc('feed').get()?.items || []));
      return items.some((i) => /timer|session/i.test(`${i.app || ''} ${i.from || ''} ${i.type || ''} ${JSON.stringify(i)}`));
    }, 12000);
    row('session activity reaches the feed', fed, '');
  } else row('session activity reaches the feed', 'skip', 'no hub');

  row('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ').slice(0, 200));

  /* ── report ── */
  console.log(`\nappcheck:timer  ${BASE}${shell ? '' : ' (standalone)'}\n`);
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
