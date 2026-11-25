/* probe-ui.cjs — quick visual/DOM sanity pass over the places after UI fixes.
   Usage: node scripts/probe-ui.cjs [baseUrl] */
const { chromium } = require('playwright-core');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:5173';
const EXE = [
  'C:/Users/pmsma/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!EXE) { console.log('FAIL: no chromium-family browser found'); process.exit(1); }

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  /* ── margin: slim masthead height ── */
  await page.goto(`${BASE}/#/p/margin`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);
  const mast = await page.evaluate(() => {
    const el = document.querySelector('.atlas-masthead');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { h: Math.round(r.height), cls: el.className, slim: el.classList.contains('slim') };
  });
  console.log('margin masthead:', JSON.stringify(mast));

  /* ── boxed: capture-button centering ── */
  await page.goto(`${BASE}/#/p/boxed`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.bx-capture input', { timeout: 30000 });
  await page.waitForTimeout(800);
  const cap = await page.evaluate(() => {
    const btn = document.querySelector('.bx-capture button');
    const svg = btn?.querySelector('svg');
    if (!btn || !svg) return null;
    const b = btn.getBoundingClientRect();
    const s = svg.getBoundingClientRect();
    return {
      display: getComputedStyle(btn).display,
      dx: Math.round((s.left + s.width / 2) - (b.left + b.width / 2)),
      dy: Math.round((s.top + s.height / 2) - (b.top + b.height / 2)),
    };
  });
  console.log('boxed capture btn:', JSON.stringify(cap));

  /* ── every place: boot errors ── */
  for (const place of ['boxed', 'margin', 'ink', 'flashcards', 'gradestack', 'proof', 'rhythm', 'syllabus', 'timer']) {
    const before = errors.length;
    await page.goto(`${BASE}/#/p/${place}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(3500);
    const fresh = errors.slice(before);
    console.log(`${place}: ${fresh.length ? 'ERRORS ' + JSON.stringify(fresh) : 'clean'}`);
  }

  await browser.close();
})();
