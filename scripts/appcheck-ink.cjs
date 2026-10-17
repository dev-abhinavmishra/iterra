/* appcheck: ink — clickpath regression probe for the notes desk, driven
   through the terrain shell (not the bare app URL).

   Covers the first-use path + the terrain contract ink owns:
     note list → New note → editor typing → canonical ink:note entity →
     index.ink + presence → note.create intake → ?note= deep link →
     nav surfaces (Tags / Ink web / Deep work / Insights) → feed → 390px.

   BASE selects the deployment under test:
     BASE=http://localhost:8090  → integrated shell (frames)
     BASE=http://localhost:3006  → ink standalone dev server (drives the
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
  const RUN = 'ik' + Date.now().toString(36);
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

  /* ── mode detect: shell = an /apps/ink/ frame; else standalone ── */
  const hasHub = await page.evaluate(() => typeof window.iterra === 'object' && !!window.iterra?.send);
  await page.evaluate(() => { window.location.hash = '/p/ink'; });
  let app = null;
  await page.waitForTimeout(2500);
  const frameOf = () => page.frames().find((f) => f.url().includes('/apps/ink/'));
  let shell = !!frameOf();
  if (!shell) {
    const bodyIsInk = await page.evaluate(() => /ink|notes|prose/i.test(document.body.innerText || ''));
    if (bodyIsInk) { app = page; shell = false; }
    else if (await until(() => !!frameOf(), 8000)) { shell = true; }
  }
  if (shell) app = frameOf();
  row('mounts', !!app, shell ? 'shell frame /apps/ink/' : (app ? 'standalone document' : 'no ink surface'));

  const appText = async () => { try { return await app.evaluate(() => document.body.innerText); } catch { return ''; } };
  const clickAria = (label) => app.evaluate((l) => {
    const b = [...document.querySelectorAll('button,[role="button"],a')].find((x) =>
      x.getAttribute('aria-label') === l || x.getAttribute('title') === l ||
      (x.textContent || '').trim() === l);
    if (b && !b.disabled) { b.click(); return true; }
    return false;
  }, label);
  const store = () => app.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('ink-notes-storage') || '{}').state || {}; } catch { return {}; }
  });
  const send = (opts) => page.evaluate(async (o) => {
    try { return await window.iterra.send(o); } catch (e) { return { ok: false, error: String(e) }; }
  }, opts);
  const honor = async (r, waitMs = 4000) => {
    if (shell && r?.delivered === 'direct' && r.url && r.url.includes('?')) {
      await page.evaluate((u) => window.postMessage({ type: 'iterra:open', url: u }, location.origin), r.url);
    } else if (shell) {
      await page.evaluate(() => { window.location.hash = '/p/ink'; });
    } else if (r?.url) {
      await page.goto(`${BASE}${r.url}`.replace(`${BASE}/apps/ink`, `${BASE}`), { waitUntil: 'load' });
    }
    await page.waitForTimeout(waitMs);
    app = shell ? frameOf() : page;
  };

  /* clean slate — drop ink's persisted notes so first-use paths run */
  if (app) {
    await app.evaluate(() => { localStorage.removeItem('ink-notes-storage'); });
    if (shell) { await page.evaluate(() => { window.location.hash = '/p/ink'; }); }
    await app.evaluate(() => location.reload());
    await page.waitForTimeout(2800);
    if (shell) app = frameOf();
  }

  /* ── 1. note list boots (seeded welcome note or empty state) ── */
  let t = await appText();
  row('note list boots', /all notes|welcome|new note|untitled/i.test(t), t.slice(0, 90));

  /* ── 2. New note → editor opens → type → persisted ── */
  const newOk = await clickAria('New note') || await app.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /new note/i.test(x.textContent || ''));
    if (b) { b.click(); return true; } return false;
  });
  await page.waitForTimeout(900);
  const ed = app.locator('[contenteditable="true"], .ProseMirror').first();
  const edOpen = await ed.count();
  row('new note opens the editor', !!newOk && edOpen > 0, `editor=${edOpen}`);
  if (edOpen) {
    await ed.click();
    await page.waitForTimeout(200);
    await ed.evaluate((el, run) => {
      el.innerHTML = `<h2>appcheck ${run}</h2><p>ink body written by the probe ${run}</p>`;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, RUN);
    await page.waitForTimeout(1400);
    const s = await store();
    const wrote = (s.notes || []).some((n) => /appcheck|probe/.test(`${n.title || ''} ${JSON.stringify(n.content || '')}`));
    row('typed content persists to the store', wrote, `notes=${(s.notes || []).length}`);
  } else row('typed content persists to the store', 'skip', 'editor not open');

  /* ── 3. canonical entity + index + presence (hub only) ── */
  if (hasHub) {
    const entOk = await until(async () => {
      const rows = await page.evaluate(() => window.iterra.store.list({ app: 'ink' }));
      return rows.some((e) => e.type === 'note' && /appcheck|probe/.test(`${e.title || ''} ${e.sub || ''} ${JSON.stringify(e)}`));
    }, 14000);
    row('canonical ink:note entity', entOk, '');
    const idx = await page.evaluate(() => window.iterra.doc('index.ink').get());
    row('index.ink lists notes', !!idx?.entities && idx.entities.length >= 1, `entities=${idx?.entities?.length}`);
    const pres = await page.evaluate(() => (window.iterra.apps() || {})['ink']);
    row('presence registered', !!pres, JSON.stringify(pres?.summary || {}));
  } else {
    row('canonical ink:note entity', 'skip', 'no hub');
    row('index.ink lists notes', 'skip', 'no hub');
    row('presence registered', 'skip', 'no hub');
  }

  /* ── 4. note.create intake → seeded page opens via ?note= ── */
  if (hasHub) {
    const r = await send({
      to: 'ink', action: 'note.create',
      entity: { app: 'margin', type: 'note', id: `m-${RUN}`, title: `intake-${RUN}` },
      payload: { text: `seeded from margin ${RUN}` },
    });
    /* the intake returns ?note=<id> — honor it through the sender-side
       contract so the frame navigates the deep link */
    await honor(r, 4000);
    const s = await store();
    const made = (s.notes || []).some((n) => (n.title || '').includes(`intake-${RUN}`));
    const activeIs = s.activeNoteId;
    const opened = (s.notes || []).find((n) => n.id === activeIs);
    row('note.create files + opens the page', r.ok && made && (opened?.title || '').includes(`intake-${RUN}`),
      `ok=${r.ok} made=${made} active=${opened?.title || '-'}`);
  } else row('note.create files + opens the page', 'skip', 'no hub');

  /* ── 5. nav surfaces render (Tags / Ink web / Deep work / Insights) ── */
  for (const [nav, probe] of [
    ['All Notes', /notes|untitled|appcheck|intake/i],
    ['Tags', /tag|organiz|label/i],
    ['Ink web', /web|graph|link|node/i],
    ['Deep work', /deep|focus|work/i],
    ['Insights', /insight|word|streak|stat|organiz/i],
  ]) {
    const clicked = await clickAria(nav);
    await page.waitForTimeout(900);
    t = await appText();
    row(`${nav} surface renders`, clicked && probe.test(t), clicked ? t.slice(0, 70) : 'nav item missing');
  }

  /* ── 6. 390px overflow ── */
  await clickAria('All Notes');
  await page.waitForTimeout(600);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(700);
  const m1 = await app.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: document.documentElement.clientWidth }));
  row('390px desk has no horizontal overflow', m1.doc <= m1.win + 1, `scrollW=${m1.doc} win=${m1.win}`);
  await page.setViewportSize({ width: 1280, height: 820 });

  /* ── 7. ink activity reaches the feed (hub only) ── */
  if (hasHub) {
    const fed = await until(async () => {
      const items = await page.evaluate(() =>
        (window.iterra.feedItems?.() || window.iterra.doc('feed').get()?.items || []));
      return items.some((i) => /ink/i.test(`${i.app || ''} ${i.from || ''} ${JSON.stringify(i)}`));
    }, 12000);
    row('ink activity reaches the feed', fed, '');
  } else row('ink activity reaches the feed', 'skip', 'no hub');

  row('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ').slice(0, 200));

  /* ── report ── */
  console.log(`\nappcheck:ink  ${BASE}${shell ? '' : ' (standalone)'}\n`);
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
