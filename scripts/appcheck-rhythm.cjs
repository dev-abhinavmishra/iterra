/* appcheck: rhythm — clickpath regression probe for the habit register,
   driven through the terrain shell (not the bare app URL).

   Covers the first-use path + the terrain contract rhythm owns:
     onboarding RoutineForm → Today tab → canonical rhythm:routine entity →
     log.activity intake → Signal-received receipt → routine.plan intake →
     ?routine= deep link → tabs render → feed → 390px overflow.

   BASE selects the deployment under test:
     BASE=http://localhost:8090  → integrated shell (frames)
     BASE=http://localhost:3001  → rhythm standalone dev server (drives the
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
  const RUN = 'rh' + Date.now().toString(36);
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

  /* ── mode detect: shell = an /apps/rhythm/ frame; else standalone ── */
  const hasHub = await page.evaluate(() => typeof window.iterra === 'object' && !!window.iterra?.send);
  await page.evaluate(() => { window.location.hash = '/p/rhythm'; });
  let app = null;
  await page.waitForTimeout(2500);
  const frameOf = () => page.frames().find((f) => f.url().includes('/apps/rhythm/'));
  let shell = !!frameOf();
  if (!shell) {
    const bodyIsRhythm = await page.evaluate(() => /rhythm|register|routine|today/i.test(document.body.innerText || ''));
    if (bodyIsRhythm) { app = page; shell = false; }
    else if (await until(() => !!frameOf(), 8000)) { shell = true; }
  }
  if (shell) app = frameOf();
  row('mounts', !!app, shell ? 'shell frame /apps/rhythm/' : (app ? 'standalone document' : 'no rhythm surface'));

  const appText = async () => { try { return await app.evaluate(() => document.body.innerText); } catch { return ''; } };
  const appClickText = (txt, exact = true) => app.evaluate(({ t, ex }) => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      ex ? (x.textContent || '').trim() === t : (x.textContent || '').includes(t));
    if (b && !b.disabled) { b.click(); return true; }
    return false;
  }, { t: txt, ex: exact });
  const clickRole = (name) => app.evaluate((n) => {
    const b = [...document.querySelectorAll('[role="tab"], button, a')].find((x) =>
      (x.textContent || '').trim() === n || x.getAttribute('aria-label') === n || x.getAttribute('title') === n);
    if (b && !b.disabled) { b.click(); return true; }
    return false;
  }, name);
  const reg = () => app.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('rhythm.register.v1') || '{}').state || {}; } catch { return {}; }
  });
  const send = (opts) => page.evaluate(async (o) => {
    try { return await window.iterra.send(o); } catch (e) { return { ok: false, error: String(e) }; }
  }, opts);
  const honor = async (r, waitMs = 4000) => {
    if (shell && r?.delivered === 'direct' && r.url && r.url.includes('?')) {
      await page.evaluate((u) => window.postMessage({ type: 'iterra:open', url: u }, location.origin), r.url);
    } else if (shell) {
      await page.evaluate(() => { window.location.hash = '/p/rhythm'; });
    } else if (r?.url) {
      await page.goto(`${BASE}${r.url}`.replace(`${BASE}/apps/rhythm`, `${BASE}`), { waitUntil: 'load' });
    }
    await page.waitForTimeout(waitMs);
    app = shell ? frameOf() : page;
  };

  /* clean slate — deterministic from an empty register */
  if (app) {
    await app.evaluate(() => { localStorage.removeItem('rhythm.register.v1'); });
    if (shell) { await page.evaluate(() => { window.location.hash = '/p/rhythm'; }); }
    await app.evaluate(() => location.reload());
    await page.waitForTimeout(2800);
    if (shell) app = frameOf();
  }

  /* ── 1. onboarding: RoutineForm on an empty register ── */
  let t = await appText();
  const onboard = /Patch it in|first routine|onboard/i.test(t);
  row('onboarding on empty register', onboard, t.slice(0, 90));
  if (onboard) {
    const nameInput = app.locator('input').first();
    await nameInput.fill(`focus-block-${RUN}`);
    await appClickText('Patch it in');
    await page.waitForTimeout(900);
    t = await appText();
  }
  const st1 = await reg();
  const rid = Object.keys(st1.routines || {})[0];
  row('routine files to the register', !!rid, `routines=${Object.keys(st1.routines || {}).length}`);

  /* ── 2. canonical entity + index + presence (hub only) ── */
  if (hasHub) {
    const entOk = await until(async () => {
      const rows = await page.evaluate(() => window.iterra.store.list({ app: 'rhythm' }));
      return rows.some((e) => e.type === 'routine' && (e.id === rid || (e.title || '').includes(RUN)));
    }, 12000);
    row('canonical rhythm:routine entity', entOk, `rhythm:routine:${rid}`);
    const idx = await page.evaluate(() => window.iterra.doc('index.rhythm').get());
    row('index.rhythm lists the routine', !!idx?.entities?.some((e) => e.id === rid || (e.title || '').includes(RUN)),
      `entities=${idx?.entities?.length}`);
    const pres = await page.evaluate(() => (window.iterra.apps() || {})['rhythm']);
    row('presence registered', !!pres, JSON.stringify(pres?.summary || {}));
  } else {
    row('canonical rhythm:routine entity', 'skip', 'no hub');
    row('index.rhythm lists the routine', 'skip', 'no hub');
    row('presence registered', 'skip', 'no hub');
  }

  /* ── 3. mark the routine hit today (pad click on Today) ── */
  await clickRole('Today');
  await page.waitForTimeout(700);
  const padClicked = await app.evaluate(() => {
    /* the hit pad's label lives on the button itself ('Hit <name>' /
       'Unhit <name>'); the inner Pad element carries the title */
    const b = [...document.querySelectorAll('button[aria-label]')].find((x) =>
      /^Hit |^Unhit |^Log another /.test(x.getAttribute('aria-label') || ''));
    if (b) { b.click(); return true; }
    return false;
  });
  await page.waitForTimeout(700);
  const st2 = await reg();
  const marked = Object.keys(st2.entries || {}).length > 0 || Object.keys(st2.marks || {}).length > 0;
  row('pad click marks the routine', padClicked && marked, `clicked=${padClicked} entries=${Object.keys(st2.entries || {}).length}`);

  /* ── 4. log.activity intake → signal receipt ── */
  if (hasHub) {
    const r = await send({
      to: 'rhythm', action: 'log.activity',
      entity: { app: 'timer', type: 'session', id: `t-${RUN}`, title: `focus ${RUN}` },
      payload: { kind: 'timer.session.completed', minutes: 25, label: `signal-${RUN}` },
    });
    const evOk = await until(async () => {
      const s = await reg();
      return Object.keys(s.events || {}).length > 0 ||
        JSON.stringify(s).includes(`signal-${RUN}`);
    }, 12000);
    t = await appText();
    row('log.activity lands a register event', r.ok && evOk, `ok=${r.ok} delivered=${r.delivered}`);
    /* runtime intakes write events (receipt cards are a boot-only deep-link
       affordance) — the evidence row lives on the Signal in tab */
    await clickRole('Signal in');
    await page.waitForTimeout(800);
    t = await appText();
    row('event evidence on Signal in', /timer|1 event|session\.completed/i.test(t), t.slice(0, 90));
    await clickRole('Today');
    await page.waitForTimeout(500);
  } else {
    row('log.activity lands a register event', 'skip', 'no hub');
    row('event evidence on Signal in', 'skip', 'no hub');
  }

  /* ── 5. routine.plan intake → a routine lands + ?routine= deep link ── */
  if (hasHub) {
    const r = await send({
      to: 'rhythm', action: 'routine.plan',
      entity: { app: 'syllabus', type: 'commitment', id: `c-${RUN}`, title: `plan-${RUN}` },
      payload: { name: `planned-${RUN}`, perWeek: 2, minutes: 30 },
    });
    const planOk = await until(async () => {
      const s = await reg();
      return Object.values(s.routines || {}).some((x) => (x.name || '').includes(`planned-${RUN}`));
    }, 12000);
    row('routine.plan files a routine', r.ok && planOk, `ok=${r.ok} url=${r.url || '-'}`);
    if (r?.url?.includes('routine=')) {
      await honor(r, 4000);
      t = await appText();
      row('?routine=<name> lands on the routine', new RegExp(`planned-${RUN}`).test(t), (shell ? frameOf()?.url() : page.url()).slice(-80));
    } else row('?routine=<name> lands on the routine', 'skip', `no deep-link url (${r?.url || 'none'})`);
    if (shell) {
      await page.evaluate(() => { window.location.hash = '/p/rhythm'; });
      await page.waitForTimeout(800);
      app = frameOf();
    }
  } else {
    row('routine.plan files a routine', 'skip', 'no hub');
    row('?routine=<name> lands on the routine', 'skip', 'no hub');
  }

  /* ── 6. tabs render ── */
  for (const [tab, probe] of [
    ['Pattern', /pattern|heat|week|day/i],
    ['Weekly review', /review|week|entries|hit/i],
    ['Signal in', /signal|inbox|mapping|event/i],
    ['Setup', /routine|settings|course|export|import/i],
  ]) {
    const clicked = await clickRole(tab);
    await page.waitForTimeout(800);
    t = await appText();
    row(`${tab} tab renders`, clicked && probe.test(t), clicked ? t.slice(0, 70) : 'tab missing');
  }
  await clickRole('Today');
  await page.waitForTimeout(600);

  /* ── 7. 390px overflow ── */
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(700);
  const m1 = await app.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: document.documentElement.clientWidth }));
  row('390px register has no horizontal overflow', m1.doc <= m1.win + 1, `scrollW=${m1.doc} win=${m1.win}`);
  await page.setViewportSize({ width: 1280, height: 820 });

  /* ── 8. rhythm activity reaches the feed (hub only) ── */
  if (hasHub) {
    const fed = await until(async () => {
      const items = await page.evaluate(() =>
        (window.iterra.feedItems?.() || window.iterra.doc('feed').get()?.items || []));
      return items.some((i) => /rhythm/i.test(`${i.app || ''} ${i.from || ''} ${JSON.stringify(i)}`));
    }, 12000);
    row('rhythm activity reaches the feed', fed, '');
  } else row('rhythm activity reaches the feed', 'skip', 'no hub');

  row('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ').slice(0, 200));

  /* ── report ── */
  console.log(`\nappcheck:rhythm  ${BASE}${shell ? '' : ' (standalone)'}\n`);
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
