/* probe-today.cjs — seed, open Today, dump review-section inputs vs DOM.
   Needs a running dev server: `npm run dev` then `npm run probe:today`
   (optional arg: base URL, default http://localhost:5173). */
const { chromium } = require('playwright-core');
const fs = require('fs');
const EXE = [
  'C:/Users/pmsma/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));
const BASE = process.argv[2] || 'http://localhost:5173';
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text()); });

  await page.goto(`${BASE}/#/settings`, { waitUntil: 'load', timeout: 60000 });
  await page.getByText('Load a sample semester', { exact: false }).first().click();
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.waitForLoadState('load');
  await page.waitForTimeout(2500);

  /* drain intakes like the verifier does — visit each app briefly */
  for (const app of ['ink', 'margin', 'proof', 'rhythm']) {
    await page.goto(`${BASE}/#/p/${app}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(2500);
  }
  await page.goto(`${BASE}/#/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(6000);

  const state = await page.evaluate(async () => {
    const ls = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
    const ents = await window.iterra.store.list({});
    return {
      entityCount: ents.length,
      followups: ents.filter((e) => e.type === 'followup').map((e) => ({ key: e.key, title: e.title, status: e.data?.status })),
      routines: ents.filter((e) => e.app === 'rhythm').map((e) => ({ key: e.key, title: e.title, type: e.type })),
      fuMap: Object.keys(ls('iterra.v1.followups') || {}),
      presence: (ls('iterra.v1.apps') || {}).rhythm?.summary,
      register: ls('iterra.v1.doc.shared')?.register?.v,
      idxRhythm: ls('iterra.v1.doc.index.rhythm'),
      courseFilter: sessionStorage.getItem('iterra.courseFilter'),
    };
  });
  console.log('STATE', JSON.stringify(state, null, 1));

  /* entity→subscription→render takes longer than a fixed settle (mirror
     passes, index writes, keep-alive wakes) — poll like verify-demo does */
  let review = null;
  for (let i = 0; i < 15; i++) {
    review = await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btns = [...document.querySelectorAll('button')].filter(vis).map((b) => b.textContent?.trim()).filter(Boolean);
      const txt = document.body.innerText;
      return {
        hasReview: txt.includes('Retry the two-sample'),
        hasLogRoutine: btns.some((b) => b.includes('Log routine')),
        reviewSection: txt.includes('Review') ? txt.slice(Math.max(0, txt.indexOf('Review') - 50), txt.indexOf('Review') + 800) : '<none>',
        buttons: btns.slice(0, 40),
      };
    });
    if (review.hasReview && review.hasLogRoutine) break;
    await page.waitForTimeout(1500);
  }
  console.log('REVIEW', JSON.stringify(review, null, 1));
  console.log('ERRORS', JSON.stringify(errors.slice(0, 10), null, 1));
  await browser.close();
})();
