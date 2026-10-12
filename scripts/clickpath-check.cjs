/* composed click path: dossier row ?block=<id> click → shell remounts the
   syllabus frame with the param → intake selects that slip. */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:29229');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('page: ' + e.message));

  await page.goto('http://localhost:8090/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  // the folio seeded by intake-check persists (same profile, same origin).
  // Mount syllabus once so its index republishes with ?block=<id> urls.
  await page.evaluate(() => { window.location.hash = '/p/syllabus'; });
  await page.waitForTimeout(4000);
  await page.evaluate(() => { window.location.hash = '/c/mth'; });
  await page.waitForTimeout(1500);

  // find the 'read ch. 7' syllabus row and click it
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const row = btns.find((b) => (b.textContent || '').includes('read ch. 7') && !(b.textContent || '').includes('pin '));
    if (!row) return 'no-row:' + btns.map((b) => (b.textContent || '').trim().slice(0, 24)).filter(Boolean).slice(0, 20).join('|');
    row.click();
    return 'clicked';
  });
  await page.waitForTimeout(4500);
  const result = await page.evaluate(async () => {
    const fr = [...document.querySelectorAll('iframe')].find((f) => (f.src || '').includes('/apps/syllabus/'));
    if (!fr || !fr.contentWindow) return { err: 'no-frame', src: [...document.querySelectorAll('iframe')].map((f) => f.src) };
    const doc = fr.contentWindow.document;
    return {
      frameSrc: fr.getAttribute('src'),
      hash: location.hash,
      slips: [...doc.querySelectorAll('[data-block]')].map((el) => ({ id: el.getAttribute('data-block'), sel: (el.className || '').includes('ring-2') })),
    };
  });
  console.log(JSON.stringify({ clicked, result, errors }, null, 2));
  await page.close();
  process.exit(0);
})();
