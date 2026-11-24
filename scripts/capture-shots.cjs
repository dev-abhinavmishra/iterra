/* capture-shots.cjs — professional screenshots of every place + workspace
   surface for the landing page mosaic. Seeds the sample semester first so
   every tool renders real content, then captures each .it-place-<id> root.

   Usage: node scripts/capture-shots.cjs [baseUrl] [outDir]
   Requires a running build (npm run build) served at baseUrl. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:8099';
const OUT = process.argv[3] || path.join(__dirname, '..', 'shell', 'public', 'shots');
const EXE = [
  'C:/Users/pmsma/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!EXE) { console.log('FAIL: no chromium-family browser found'); process.exit(1); }

const PLACES = ['boxed', 'syllabus', 'rhythm', 'flashcards', 'ink', 'margin', 'gradestack', 'timer', 'proof'];
const SURFACES = [
  ['today', '/#/'],
  ['courses', '/#/courses'],
  ['library', '/#/library'],
];

async function shot(page, sel, file) {
  const el = page.locator(sel).first();
  await el.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(3200); // fonts, lazy chunks, presence heartbeat
  try {
    await el.screenshot({ path: file, type: 'webp', quality: 82 });
  } catch {
    await el.screenshot({ path: file.replace(/\.webp$/, '.png'), type: 'png' });
    return file.replace(/\.webp$/, '.png');
  }
  return file;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  pageerror:', String(e).slice(0, 160)));

  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  const title = await page.title();
  if (!/iterra/i.test(title)) {
    console.log('FAIL:', BASE, 'is not serving Iterra (title:', JSON.stringify(title), ')');
    process.exit(1);
  }

  /* ── seed the sample semester through the real settings UI ── */
  await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
  await page.getByText('Load a sample semester', { exact: false }).first().click();
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.waitForLoadState('load');
  await page.waitForTimeout(1800);
  console.log('seeded sample semester');

  /* ── workspace surfaces ── */
  for (const [name, hash] of SURFACES) {
    await page.goto(`${BASE}${hash}`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const file = path.join(OUT, `${name}.webp`);
    try {
      await page.screenshot({ path: file, type: 'webp', quality: 82 });
      console.log('shot', name);
    } catch {
      await page.screenshot({ path: file.replace(/\.webp$/, '.png'), type: 'png' });
      console.log('shot', name, '(png)');
    }
  }

  /* ── every place ── */
  for (const id of PLACES) {
    await page.goto(`${BASE}/#/p/${id}`, { waitUntil: 'load' });
    const file = path.join(OUT, `${id}.webp`);
    try {
      const out = await shot(page, `.it-place-${id}`, file);
      console.log('shot', id, '→', path.basename(out));
    } catch (e) {
      console.log('FAIL', id, String(e).slice(0, 200));
    }
  }

  await browser.close();
  console.log('done →', OUT);
})();
