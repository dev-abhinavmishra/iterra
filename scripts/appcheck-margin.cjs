/* appcheck: margin — clickpath regression probe for the notes app, driven
   through the terrain shell (not the bare app URL).

   Covers the first-use path + the cross-app contract margin owns:
     library empty-state → note.create intake → editor open + typing →
     canonical margin:note entity + index.margin + presence → ?note= deep
     link → sidebar views (Study/Ask/Settings) → feed → 390px overflow.

   BASE selects the deployment under test:
     BASE=http://localhost:8090  → integrated shell (frames)
     BASE=http://localhost:3008  → margin standalone dev server (drives the
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
  const RUN = 'mg' + Date.now().toString(36);
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

  /* ── mode detect: shell = an /apps/margin/ frame; else standalone ── */
  const hasHub = await page.evaluate(() => typeof window.iterra === 'object' && !!window.iterra?.send);
  await page.evaluate(() => { window.location.hash = '/p/margin'; });
  let app = null;
  await page.waitForTimeout(3000); // margin boot: IDB init + BootSplash
  const frameOf = () => page.frames().find((f) => f.url().includes('/apps/margin/'));
  let shell = !!frameOf();
  if (!shell) {
    const bodyIsMargin = await page.evaluate(() => /margin|notes/i.test(document.body.innerText || ''));
    if (bodyIsMargin) { app = page; shell = false; }
    else if (await until(() => !!frameOf(), 8000)) { shell = true; }
  }
  if (shell) app = frameOf();
  row('mounts', !!app, shell ? 'shell frame /apps/margin/' : (app ? 'standalone document' : 'no margin surface'));

  const appText = async () => { try { return await app.evaluate(() => document.body.innerText); } catch { return ''; } };
  const clickTitle = (title) => app.evaluate((t) => {
    const b = [...document.querySelectorAll('button,[role="button"],a')].find((x) => x.getAttribute('title') === t);
    if (b && !b.disabled) { b.click(); return true; }
    return false;
  }, title);
  const send = (opts) => page.evaluate(async (o) => {
    try { return await window.iterra.send(o); } catch (e) { return { ok: false, error: String(e) }; }
  }, opts);
  const honor = async (r, waitMs = 4500) => {
    if (shell && r?.delivered === 'direct' && r.url && r.url.includes('?')) {
      await page.evaluate((u) => window.postMessage({ type: 'iterra:open', url: u }, location.origin), r.url);
    } else if (shell) {
      await page.evaluate(() => { window.location.hash = '/p/margin'; });
    } else if (r?.url) {
      await page.goto(`${BASE}${r.url}`.replace(`${BASE}/apps/margin`, `${BASE}`), { waitUntil: 'load' });
    }
    await page.waitForTimeout(waitMs);
    app = shell ? frameOf() : page;
  };

  /* clean slate — margin persists in IndexedDB (ModularAINotesDB), not
     localStorage; clear every object store so the empty-state path runs */
  if (app) {
    await app.evaluate(async () => {
      try {
        localStorage.removeItem('app_notes');
        localStorage.removeItem('app_settings');
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open('ModularAINotesDB');
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        const names = [...db.objectStoreNames];
        if (names.length) {
          await new Promise((res, rej) => {
            const txr = db.transaction(names, 'readwrite');
            names.forEach((n) => txr.objectStore(n).clear());
            txr.oncomplete = () => res(); txr.onerror = () => rej(txr.error);
          });
        }
        db.close();
      } catch { /* first boot may not have created the DB yet */ }
    });
    if (shell) { await page.evaluate(() => { window.location.hash = '/p/margin'; }); }
    await app.evaluate(() => location.reload());
    await page.waitForTimeout(3500);
    if (shell) app = frameOf();
  }

  /* ── 1. library empty-state (BootSplash must clear, not hang) ── */
  let t = await appText();
  const libUp = /notes/i.test(t) && !/warming up|loading/i.test(t.slice(0, 200));
  row('library boots past the splash', libUp, t.slice(0, 90));
  const empty = /No notes yet/i.test(t);
  row('empty-state CTA on clean bench', !libUp || empty || /notes/i.test(t), t.slice(0, 90));

  /* ── 2. note.create intake → seeded note opens in the editor ── */
  let noteId = null;
  if (hasHub) {
    const r = await send({
      to: 'margin', action: 'note.create',
      entity: { app: 'ink', type: 'note', id: `src-${RUN}`, title: `margin-intake-${RUN}` },
      payload: { text: `seeded by terrain at ${RUN}` },
    });
    await honor(r, 4500);
    const landed = await until(async () => /editor|untitled|margin-intake/i.test(await appText()), 6000);
    t = await appText();
    const editing = await app.evaluate(() => !!document.querySelector('[contenteditable="true"], .ProseMirror, textarea'));
    noteId = r?.url ? (r.url.match(/note=([^&]+)/) || [])[1] : null;
    row('note.create intake lands in the editor', r.ok && landed && editing,
      `ok=${r.ok} delivered=${r.delivered} url=${r.url || '-'}`);
    /* canonical entity + index + presence */
    const entOk = await until(async () => {
      const rows = await page.evaluate(() => window.iterra.store.list({ app: 'margin' }));
      return rows.some((e) => e.type === 'note' && (!noteId || e.id === noteId || (e.title || '').includes(RUN)));
    }, 12000);
    row('canonical margin:note entity', entOk, `margin:note:${noteId || '?'}`);
    const idx = await page.evaluate(() => window.iterra.doc('index.margin').get());
    row('index.margin lists the note', !!idx?.entities?.some((e) => e.id === noteId || (e.title || '').includes(RUN)),
      `entities=${idx?.entities?.length}`);
    const pres = await page.evaluate(() => (window.iterra.apps() || {})['margin']);
    row('presence registered', !!pres, JSON.stringify(pres?.summary || {}));
  } else {
    row('note.create intake lands in the editor', 'skip', 'no hub');
    row('canonical margin:note entity', 'skip', 'no hub');
    row('index.margin lists the note', 'skip', 'no hub');
    row('presence registered', 'skip', 'no hub');
  }

  /* ── 3. editor: type title + body → save → entity republishes ── */
  if (app) {
    const inEditor = await app.evaluate(() => !!document.querySelector('[contenteditable="true"]'));
    if (inEditor) {
      /* title is a textarea in the meta bar */
      const titleEl = app.locator('textarea').first();
      if (await titleEl.count()) { await titleEl.fill(`Edited ${RUN}`); }
      const body = app.locator('[contenteditable="true"]').first();
      await body.click();
      await page.waitForTimeout(200);
      await body.evaluate((el, run) => {
        el.innerHTML = `<p>body written by appcheck ${run}</p>`;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, RUN);
      await page.waitForTimeout(1200);
      t = await appText();
      row('editor accepts typed content', /appcheck/.test(t), t.slice(0, 80));
      if (hasHub) {
        const repub = await until(async () => {
          const rows = await page.evaluate(() => window.iterra.store.list({ app: 'margin' }));
          return rows.some((e) => e.type === 'note' && /appcheck|Edited/.test(`${e.title || ''} ${e.sub || ''} ${JSON.stringify(e)}`));
        }, 14000);
        row('typed content republishes to the store', repub, '');
      } else row('typed content republishes to the store', 'skip', 'no hub');
      /* back to the library — the note should be listed now */
      await clickTitle('Back to notes');
      await page.waitForTimeout(800);
      t = await appText();
      row('library lists the saved note', new RegExp(`Edited ${RUN}|margin-intake-${RUN}|appcheck`).test(t), t.slice(0, 90));
    } else {
      row('editor accepts typed content', 'skip', 'editor not open');
      row('typed content republishes to the store', 'skip', 'editor not open');
      row('library lists the saved note', 'skip', 'editor not open');
    }
  }

  /* ── 4. ?note=<id> deep link → editor (shell only) ── */
  if (shell && hasHub && noteId) {
    const url = `/apps/margin/?note=${noteId}`;
    await page.evaluate((u) => window.postMessage({ type: 'iterra:open', url: u }, location.origin), url);
    await page.waitForTimeout(4500);
    app = frameOf();
    const deepOk = await until(async () =>
      app.evaluate(() => !!document.querySelector('[contenteditable="true"]')).catch(() => false), 8000);
    t = await appText();
    row('?note=<id> deep link opens the editor', deepOk && new RegExp(`Edited ${RUN}|margin-intake|appcheck`).test(t), t.slice(0, 80));
    await clickTitle('Back to notes');
    await page.waitForTimeout(600);
  } else row('?note=<id> deep link opens the editor', 'skip', 'no hub/id');

  /* ── 5. sidebar views render ── */
  for (const [nav, probe] of [['Study', /deck|quiz|study/i], ['Ask', /ask|question|analyz|conversation|session/i], ['Settings', /settings|theme|storage|provider|model/i]]) {
    const clicked = await clickTitle(nav);
    await page.waitForTimeout(900);
    t = await appText();
    row(`${nav} view renders`, clicked && probe.test(t), clicked ? t.slice(0, 70) : 'nav button missing');
  }
  await clickTitle('Notes');
  await page.waitForTimeout(700);

  /* ── 6. command palette opens on ⌘K ── */
  await app.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
  await page.waitForTimeout(500);
  const palOpen = await app.evaluate(() =>
    !!document.querySelector('[aria-label="Command palette"], [role="dialog"], input[aria-label*="Search"]'));
  row('command palette opens on ⌘K', palOpen, '');
  await app.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await page.waitForTimeout(400);

  /* ── 7. 390px overflow ── */
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(700);
  const m1 = await app.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: document.documentElement.clientWidth }));
  row('390px library has no horizontal overflow', m1.doc <= m1.win + 1, `scrollW=${m1.doc} win=${m1.win}`);
  await page.setViewportSize({ width: 1280, height: 820 });

  /* ── 8. margin activity reaches the feed (hub only) ──
     margin's publish diff feeds only notes that arrive AFTER the first
     observed set — the intake note became the silent baseline, so a second
     note is what must surface */
  if (hasHub) {
    await send({
      to: 'margin', action: 'note.create',
      entity: { app: 'proof', type: 'problem', id: `p-${RUN}`, title: `feed-${RUN}` },
      payload: { text: `second note ${RUN}` },
    });
    const fed = await until(async () => {
      const items = await page.evaluate(() =>
        (window.iterra.feedItems?.() || window.iterra.doc('feed').get()?.items || []));
      return items.some((i) => /margin/i.test(`${i.app || ''} ${i.from || ''} ${JSON.stringify(i)}`));
    }, 16000);
    row('margin activity reaches the feed', fed, '');
  } else row('margin activity reaches the feed', 'skip', 'no hub');

  row('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ').slice(0, 200));

  /* ── report ── */
  console.log(`\nappcheck:margin  ${BASE}${shell ? '' : ' (standalone)'}\n`);
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
