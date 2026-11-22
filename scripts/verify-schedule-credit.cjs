const { chromium } = require('../node_modules/playwright-core');
const { readFileSync, existsSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
mkdirSync(path.join(root, 'tmp'), { recursive: true });
const output = path.join(root, process.env.ITERRA_SMOKE_OUTPUT ?? 'shell/node_modules/.cache/iterra-schedule-final');
const origin = process.env.ITERRA_BASE || 'http://iterra.test';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };

async function context(browser, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
  if (!process.env.ITERRA_BASE) await ctx.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const file = url.pathname === '/iterra-hub.js'
      ? path.join(root, 'packages/hub/iterra-hub.js')
      : path.join(output, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'Missing asset' });
    return route.fulfill({ contentType: types[path.extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  return ctx;
}
const readFolio = page => page.evaluate(() => JSON.parse(localStorage.getItem('syllabus.folio.v1')).state);
const schedule = [
  'BIO 215 — Cell Biology',
  'Course schedule',
  '2026-11-20 — Midterm',
  'November 21 — Lab report',
  'Lab report due 11/21/2026',
  'Reading: Chapter 4 due Nov 24, 2026 at 7 pm',
  'Presentation Nov 25 or Nov 26',
].join('\n');

async function boot(page) {
  await page.clock.install({ time: new Date('2026-11-19T14:05:00Z') });
  await page.goto(origin + '/#/p/syllabus?p=today');
  await page.getByRole('button', { name: /continue to courses/i }).click();
  await page.getByRole('textbox', { name: 'Course 1 code' }).fill('BIO 215');
  await page.getByRole('textbox', { name: 'Course 1 name' }).fill('Cell Biology');
  await page.getByRole('button', { name: 'Start planning' }).click();
}

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const mobile = await context(browser, 390);
    const p = await mobile.newPage();
    const errors = [];
    p.on('pageerror', error => errors.push(error.message));
    p.setDefaultTimeout(15000);
    await boot(p);
    const bio = Object.values((await readFolio(p)).courses).find(c => c.code.replace(/\s/g, '') === 'BIO215');
    assert.ok(bio);
    await p.goto(origin + '/#/');
    const plan = p.getByRole('region', { name: 'Your next study session' });
    await plan.getByRole('button', { name: 'Paste schedule' }).click();
    const sheet = p.getByRole('dialog', { name: 'Import course schedule' });
    const paste = sheet.getByRole('textbox', { name: 'Paste course schedule' });
    await paste.waitFor();
    assert.equal(await paste.evaluate(el => el === document.activeElement), true);
    await p.keyboard.press('Escape');
    await sheet.waitFor({ state: 'hidden' });
    await p.getByRole('button', { name: 'Paste schedule', exact: true }).click();
    await paste.fill(schedule);
    await sheet.getByRole('button', { name: 'Preview assignments' }).click();
    await sheet.getByRole('heading', { name: 'Review assignments' }).waitFor();
    assert.equal(await sheet.getByLabel('Course', { exact: true }).inputValue(), bio.id);
    assert.equal(Object.keys((await readFolio(p)).commitments ?? {}).length, 0);
    await sheet.getByText('1 line needs a clear date and title').click();
    await sheet.getByText(/Presentation Nov 25 or Nov 26/).waitFor();
    assert.equal(await sheet.getByText('Already included for this date.').count(), 1);
    const midterm = sheet.getByRole('listitem').filter({ has: p.getByRole('checkbox', { name: 'Include Midterm' }) });
    await midterm.getByText(/150 min estimated/).click();
    await midterm.getByLabel('Due time').fill('10:30');
    await midterm.getByLabel('Estimated minutes').fill('90');
    await sheet.getByRole('checkbox', { name: 'Include Reading: Chapter 4' }).uncheck();
    assert.equal(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await p.screenshot({ path: path.join(root, 'tmp/course-schedule-credit-mobile.png') });
    await sheet.getByRole('button', { name: 'Add 2 assignments' }).click();
    await sheet.getByText('2 assignments added.').waitFor();
    const added = Object.values((await readFolio(p)).commitments);
    assert.deepEqual(added.map(row => [row.courseId, row.title, row.type, row.estimatedMinutes]), [
      [bio.id, 'Midterm', 'exam', 90], [bio.id, 'Lab report', 'lab', 75],
    ]);
    assert.ok(await p.evaluate(date => new Date(date).getHours() === 10 && new Date(date).getMinutes() === 30, added[0].dueAt));
    await sheet.getByRole('button', { name: 'See Today’s plan' }).click();
    await p.waitForURL('**/#/');
    await plan.getByRole('paragraph').filter({ hasText: /^Work on: Midterm$/ }).waitFor();
    await plan.getByRole('button', { name: 'Start study session' }).click();
    const active = p.getByRole('region', { name: 'Session study plan' });
    await active.getByRole('button', { name: 'Work on: Midterm' }).waitFor();
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('timer.session.live.v1')).syllabus.commitmentId), added[0].id);
    const live = await p.evaluate(() => JSON.parse(localStorage.getItem('timer.session.live.v1')));
    await p.clock.fastForward(live.totalMin * 60000 + 1000);
    await p.waitForFunction(id => {
      const c = JSON.parse(localStorage.getItem('syllabus.folio.v1')).state.commitments[id];
      return c && c.loggedMinutes > 0;
    }, added[0].id, { timeout: 30000 });
    const credited = await readFolio(p);
    assert.equal(credited.commitments[added[0].id].loggedMinutes, live.totalMin);
    assert.equal(credited.commitments[added[1].id].loggedMinutes || 0, 0);
    assert.equal(credited.commitments[added[0].id].status, 'open');
    const timerRow = await p.evaluate(id => JSON.parse(localStorage.getItem('timer.sessions.v1') || '[]').find(row => row.id === id), live.sessionId);
    assert.equal(timerRow.commitmentId, added[0].id);
    assert.equal(timerRow.duration, live.totalMin * 60);
    const canonical = await p.evaluate(id => window.iterra.store.get('timer:session:' + id), live.sessionId);
    assert.equal(canonical.data.commitmentId, added[0].id);
    assert.equal(canonical.data.outcome, 'completed');
    await p.reload();
    assert.equal((await readFolio(p)).commitments[added[0].id].loggedMinutes, live.totalMin);
    await p.goto(origin + '/#/settings');
    const downloadPromise = p.waitForEvent('download', { timeout: 60000 });
    await p.getByRole('button', { name: /^Download backup/ }).click();
    const download = await downloadPromise;
    const backup = path.join(root, 'tmp/schedule-credit-backup.json');
    await download.saveAs(backup);
    await p.locator('input[type=file]').setInputFiles(backup);
    await p.getByRole('dialog', { name: 'Restore this backup?' }).getByRole('button', { name: 'Cancel' }).click();
    assert.equal((await readFolio(p)).commitments[added[0].id].loggedMinutes, live.totalMin);
    await p.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{') });
    await p.getByText("That file isn't valid JSON.").waitFor();
    const malformed = { format: 'iterra-backup', v: 1, at: Date.now(), localStorage: {}, idb: {
      iterra: { name: 'iterra', version: 1, stores: { entities: { keyPath: null, autoIncrement: false, keys: [{}], records: ['bad'] } } },
    } };
    await p.locator('input[type=file]').setInputFiles({ name: 'malformed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(malformed)) });
    await p.getByText('This backup has invalid saved data.').waitFor();
    assert.equal(await p.getByRole('dialog', { name: 'Restore this backup?' }).count(), 0);
    assert.equal((await readFolio(p)).commitments[added[0].id].loggedMinutes, live.totalMin);
    const restored = await context(browser, 390);
    const rp = await restored.newPage();
    rp.setDefaultTimeout(15000);
    rp.on('pageerror', error => errors.push(error.message));
    await rp.goto(origin + '/#/settings');
    await rp.locator('input[type=file]').setInputFiles(backup);
    await rp.getByRole('button', { name: 'Replace everything' }).click();
    await rp.waitForLoadState('load');
    await rp.waitForFunction(id => {
      const raw = localStorage.getItem('syllabus.folio.v1');
      return raw && JSON.parse(raw).state.commitments[id];
    }, added[0].id);
    const afterRestore = await readFolio(rp);
    assert.equal(afterRestore.commitments[added[0].id].loggedMinutes, live.totalMin);
    assert.equal(afterRestore.commitments[added[1].id].loggedMinutes || 0, 0);
    assert.equal(afterRestore.commitments[added[0].id].courseId, bio.id);
    const restoredTimer = await rp.evaluate(id => JSON.parse(localStorage.getItem('timer.sessions.v1') || '[]').find(row => row.id === id), live.sessionId);
    assert.equal(restoredTimer.commitmentId, added[0].id);
    assert.equal(restoredTimer.duration, live.totalMin * 60);
    const restoredCanonical = await rp.evaluate(id => window.iterra.store.get('timer:session:' + id), live.sessionId);
    assert.equal(restoredCanonical.data.commitmentId, added[0].id);
    assert.equal(restoredCanonical.data.outcome, 'completed');
    await rp.reload();
    assert.equal((await readFolio(rp)).commitments[added[0].id].loggedMinutes, live.totalMin);
    await rp.getByText('Load a sample semester', { exact: false }).first().click();
    await rp.getByRole('button', { name: 'Load sample', exact: true }).click();
    await rp.getByText('Remove sample data', { exact: false }).first().waitFor({ timeout: 60000 });
    assert.equal((await readFolio(rp)).commitments[added[0].id].loggedMinutes, live.totalMin);
    await rp.getByText('Remove sample data', { exact: false }).first().click();
    await rp.getByRole('button', { name: 'Remove sample data', exact: true }).click();
    await rp.getByText('Load a sample semester', { exact: false }).first().waitFor({ timeout: 60000 });
    assert.equal((await readFolio(rp)).commitments[added[0].id].loggedMinutes, live.totalMin);
    assert.equal((await rp.evaluate(id => JSON.parse(localStorage.getItem('timer.sessions.v1') || '[]').find(row => row.id === id), live.sessionId)).commitmentId, added[0].id);
    await restored.close();

    // A legacy backup without IndexedDB must replace existing app-owned stores,
    // while leaving unrelated databases on the same origin alone.
    const legacy = await context(browser, 390);
    const lp = await legacy.newPage();
    lp.setDefaultTimeout(15000);
    await lp.goto(origin + '/#/settings');
    await lp.evaluate(async () => {
      const open = (name, store) => new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      for (const [name, store] of [['ModularAINotesDB', 'sentinel'], ['unrelated-test-db', 'sentinel']]) {
        const db = await open(name, store);
        await new Promise((resolve, reject) => {
          const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put('present', 'key');
          tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
        }); db.close();
      }
      await window.iterra.store.put({ app: 'ink', type: 'note', id: 'legacy-sentinel', title: 'stale', data: {} });
    });
    const legacyBackup = { format: 'iterra-backup', v: 1, at: Date.now(), localStorage: { 'legacy-proof': 'restored' } };
    await lp.locator('input[type=file]').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacyBackup)) });
    await lp.getByRole('button', { name: 'Replace everything' }).click();
    await lp.waitForLoadState('load');
    await lp.waitForFunction(() => localStorage.getItem('legacy-proof') === 'restored');
    const legacyState = await lp.evaluate(async () => {
      const get = name => new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('sentinel', 'readonly');
          const read = tx.objectStore('sentinel').get('key');
          read.onsuccess = () => { resolve(read.result ?? null); db.close(); };
          read.onerror = () => reject(read.error);
        };
      });
      return { notes: await get('ModularAINotesDB'), unrelated: await get('unrelated-test-db'),
        canonical: await window.iterra.store.get('ink:note:legacy-sentinel') };
    });
    assert.equal(legacyState.notes, null);
    assert.equal(legacyState.unrelated, 'present');
    assert.ok(!legacyState.canonical);
    await legacy.close();
    await p.goto(origin + '/#/p/syllabus?importSchedule=' + encodeURIComponent(bio.id));
    await paste.fill('2026-11-20 — Midterm\nNovember 21 — Lab report');
    await sheet.getByRole('button', { name: 'Preview assignments' }).click();
    await sheet.getByText('0 of 2 ready to add').waitFor();
    assert.equal(await sheet.getByRole('button', { name: 'Add 0 assignments' }).isDisabled(), true);
    await p.reload();
    assert.equal(Object.keys((await readFolio(p)).commitments).length, 2);
    await mobile.close();

    const desktop = await context(browser, 1280);
    const q = await desktop.newPage();
    q.on('pageerror', error => errors.push(error.message));
    await boot(q);
    await q.goto(origin + '/#/p/syllabus?p=semester');
    await q.getByRole('button', { name: 'Import', exact: true }).click();
    const importer = q.getByRole('dialog', { name: 'Import course schedule' });
    await importer.getByRole('textbox', { name: 'Paste course schedule' }).fill(
      'CHEM 310 — Organic Chemistry\n2026-11-25 — Reaction quiz\n2026-11-27 — Lab report',
    );
    await importer.getByRole('button', { name: 'Preview assignments' }).click();
    assert.equal(await importer.getByLabel('Course name').inputValue(), 'Organic Chemistry');
    assert.equal(await importer.getByLabel('Course code').inputValue(), 'CHEM 310');
    await q.screenshot({ path: path.join(root, 'tmp/course-schedule-credit-desktop.png') });
    await importer.getByRole('button', { name: 'Add 2 assignments' }).click();
    await importer.getByText('2 assignments added.').waitFor();
    const folio = await readFolio(q);
    const chem = Object.values(folio.courses).find(course => course.code === 'CHEM 310');
    assert.ok(chem);
    assert.equal(Object.values(folio.commitments).filter(row => row.courseId === chem.id).length, 2);
    assert.deepEqual(errors, []);
    console.log('PASS imported assignment Timer completion, exact credit, reload, and clean-profile backup/restore. PASS desktop course creation from a pasted schedule.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
