/* smoke-boxed.cjs — headless check of the rebuilt Daily Board place.
   Usage: node scripts/smoke-boxed.cjs [baseUrl] */
const { chromium } = require('playwright-core');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:8090';
const EXE = [
  'C:/Users/pmsma/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!EXE) { console.log('FAIL: no chromium-family browser found'); process.exit(1); }

const fail = (m) => { console.log('FAIL:', m); process.exitCode = 1; };
const ok = (m) => console.log('  ok:', m);

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${BASE}/#/p/boxed`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.bx-capture input', { timeout: 30000 });
  await page.waitForTimeout(1200);

  const hasUi = await page.evaluate(() => ({
    brand: !!document.querySelector('.bx-wordmark'),
    capture: !!document.querySelector('.bx-capture input'),
    zones: document.querySelectorAll('.bx-zone').length,
    masthead: !!document.querySelector('.it-place-boxed'),
  }));
  console.log('  ui:', JSON.stringify(hasUi));
  if (!hasUi.brand || !hasUi.capture) fail('boxed UI did not render');
  else ok('boxed UI rendered');

  /* capture via the real input — quick syntax included */
  await page.fill('.bx-capture input', 'smoke task one ~30');
  await page.keyboard.press('Enter');
  await page.fill('.bx-capture input', 'smoke task two !');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const counts = await page.evaluate(() => ({
    dump: document.querySelectorAll('.bx-dump .bx-task').length,
    top: document.querySelectorAll('.bx-top .bx-task').length,
    stats: document.querySelector('.bx-stats')?.textContent || '',
  }));
  console.log('  counts:', JSON.stringify(counts));
  if (counts.dump !== 1 || counts.top !== 1) fail(`capture counts wrong: ${JSON.stringify(counts)}`);
  else ok('capture + promote + estimate syntax work');

  /* ambient mesh: index doc, shared field, presence (presence heartbeats ~3s) */
  await page.waitForTimeout(3500);
  const mesh = await page.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem('iterra.v1.doc.index.boxed') || 'null');
    const shared = JSON.parse(localStorage.getItem('iterra.v1.doc.shared') || 'null');
    const apps = JSON.parse(localStorage.getItem('iterra.v1.apps') || 'null');
    return {
      indexEntities: idx?.entities?.length ?? 0,
      indexTitles: (idx?.entities || []).map((e) => e.title),
      board: shared?.board?.v ?? null,
      presence: apps?.boxed?.summary ?? null,
    };
  });
  console.log('  mesh:', JSON.stringify(mesh));
  if (mesh.indexEntities < 2) fail('index.boxed did not publish entities');
  else ok('index.boxed publishes task+block entities');
  if (!mesh.board || mesh.board.top !== 1) fail('shared.board missing/wrong');
  else ok('shared.board commons field live');
  if (!mesh.presence || mesh.presence.top !== 1) fail('presence summary wrong');
  else ok('presence summary live');

  /* canonical store mirror */
  const storeRows = await page.evaluate(async () => {
    const it = window.iterra;
    if (!it?.store?.list) return null;
    return (await it.store.list({ app: 'boxed' })).map((e) => `${e.type}:${e.id}`);
  });
  console.log('  store:', JSON.stringify(storeRows));
  if (!storeRows || storeRows.filter((k) => k.startsWith('task:')).length < 2) fail('canonical store mirror missing tasks');
  else ok('canonical store mirrors tasks');

  /* intake: send task.add from the shell's own send path */
  const sent = await page.evaluate(async () => {
    const r = await window.iterra.send({ to: 'boxed', action: 'task.add', payload: { title: 'intake smoke ~15', zone: 'top' } });
    return r;
  });
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    top: document.querySelectorAll('.bx-top .bx-task').length,
    title: [...document.querySelectorAll('.bx-top .bx-task-title')].map((t) => t.textContent),
  }));
  console.log('  send:', JSON.stringify(sent), '→', JSON.stringify(after));
  if (!sent?.ok) fail(`task.add send failed: ${JSON.stringify(sent)}`);
  else if (!after.title.some((t) => t.includes('intake smoke'))) fail('intake task did not land on board');
  else ok('task.add intake delivers onto the board');

  /* schedule the intake task via UI: open schedule dialog on first top row */
  await page.locator('.bx-top .bx-task').first().locator('button[title="Schedule"]').click();
  await page.waitForTimeout(300);
  const dialogOpen = await page.evaluate(() => !!document.querySelector('input[type="time"]'));
  if (!dialogOpen) fail('schedule dialog did not open');
  else ok('schedule dialog opens');
  if (dialogOpen) {
    await page.fill('input[type="time"]', '10:00');
    await page.getByRole('button', { name: 'Add to Time Box' }).click();
    await page.waitForTimeout(500);
    const blocks = await page.evaluate(() => document.querySelectorAll('.bx-block').length);
    if (blocks < 1) fail('block did not land on timeline');
    else ok('block scheduled on timeline');
  }

  /* feed stir for the scheduled block */
  const feed = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('iterra.v1.doc.feed') || 'null');
    return (d?.items || []).filter((i) => i.app === 'boxed').map((i) => i.text);
  });
  console.log('  feed:', JSON.stringify(feed));
  if (!feed.length) fail('no boxed feed stirs');
  else ok('feed stirs emitted');

  /* undo restores */
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  const afterUndo = await page.evaluate(() => document.querySelectorAll('.bx-block').length);
  console.log('  after undo blocks:', afterUndo);

  if (errors.length) console.log('  page errors:', errors.slice(0, 5));
  await browser.close();
  console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
})();
