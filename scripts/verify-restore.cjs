/* verify-restore.cjs — end-to-end backup→wipe→restore round trip.
   Seeds the demo semester, downloads a backup, removes the demo data,
   restores the backup file, and confirms the terrain returns intact. */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:5173';
const EXE = [
  'C:/Users/pmsma/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!EXE) { console.log('FAIL: no chromium-family browser found'); process.exit(1); }
const OUT = path.join(__dirname, '.verify-downloads');

const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.log('FAIL:', m); process.exitCode = 1; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

  /* seed + drain the ink intake so the backup has delivered rows too */
  await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.getByText('Load a sample semester', { exact: false }).first().click();
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.waitForLoadState('load');
  await page.waitForTimeout(1200);
  await page.goto(`${BASE}/#/p/ink`, { waitUntil: 'load' });
  await page.waitForTimeout(3000); // let the ink intake drain + mirror
  ok('seeded + ink drained');

  /* download the backup */
  await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const dl = page.waitForEvent('download', { timeout: 60000 }); /* collectBackup walks every IDB store — slow disks stretch it */
  await page.getByText('Download backup', { exact: false }).first().click();
  const file = await dl;
  const backupPath = path.join(OUT, file.suggestedFilename());
  await file.saveAs(backupPath);
  const parsed = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  console.log('  backup:', file.suggestedFilename(), '| keys:', parsed.localStorage ? Object.keys(parsed.localStorage).length : '?', '| dbs:', parsed.idb ? Object.keys(parsed.idb).length : 0);
  ok('backup downloaded');

  /* wipe: remove demo data entirely */
  await page.getByText('Remove sample data', { exact: false }).first().click();
  await page.getByRole('button', { name: 'Remove sample data', exact: true }).click();
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  const wiped = await page.evaluate(async () => ({
    courses: await window.iterra.store.list({ type: 'course' }).then((r) => r.length).catch(() => -1),
    flag: localStorage.getItem('iterra.v1.demo'),
  }));
  console.log('  after wipe:', JSON.stringify(wiped));
  if (wiped.courses !== 0) fail('courses should be 0 after wipe');
  ok('demo fully removed');

  /* restore the backup */
  await page.getByText('Restore from file', { exact: false }).first().click();
  await page.locator('input[type=file]').setInputFiles(backupPath);
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Replace everything' }).click();
  await page.waitForLoadState('load');
  await page.waitForTimeout(2000);
  ok('restored + reloaded');

  /* verify the terrain came back */
  const after = await page.evaluate(async () => ({
    courses: await window.iterra.store.list({ type: 'course' }).then((r) => r.map((e) => e.data?.code || e.id)).catch(() => ['ERR']),
    flag: localStorage.getItem('iterra.v1.demo'),
    inkNotes: JSON.parse(localStorage.getItem('ink-notes-storage') || '{}').state?.notes?.length ?? -1,
    folioCourses: Object.keys(JSON.parse(localStorage.getItem('syllabus.folio.v1') || '{}').state?.courses ?? {}),
  }));
  console.log('  after restore:', JSON.stringify(after));
  if (!after.courses || !after.courses.includes('BIO 201')) fail('courses missing after restore');
  else ok('courses restored: ' + after.courses.join(', '));
  if (after.inkNotes < 1) fail('ink notes missing after restore');
  else ok(`ink notes restored (${after.inkNotes})`);
  if (!after.folioCourses.includes('demo-bio201')) fail('folio courses missing after restore');
  else ok('folio restored: ' + after.folioCourses.join(','));

  await page.goto(`${BASE}/#/courses`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const txt = await page.evaluate(() => document.body.innerText);
  if (!txt.includes('BIO 201')) fail('courses page empty after restore');
  else ok('courses index renders restored data');

  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  await browser.close();
  console.log(process.exitCode ? 'DONE — failures above' : 'DONE — restore round-trip verified');
})().catch((e) => { console.log('FATAL', e.message || e); process.exit(1); });
