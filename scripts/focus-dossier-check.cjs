/* dossier live-focus check: bind a timer session with ?course=MTH&block=<id>,
   start it, assert shared.focus carries course+blockId, then open the MTH
   dossier and look for the 'focus:' line. */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:29229');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('page: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('http://localhost:8090/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  // mount a bound timer session inside the terrain
  await page.evaluate(() => {
    window.location.hash = '/p/timer';
  });
  await page.waitForTimeout(4000);
  // give it a bound-session url (simulate the syllabus 'next up' click path)
  await page.evaluate(async () => {
    const fr = [...document.querySelectorAll('iframe')].find((f) => (f.src || '').includes('/apps/timer/'));
    if (fr && fr.contentWindow) fr.contentWindow.location.href = '/apps/timer/?intent=ps4%20drill&minutes=25&course=MTH&from=syllabus&block=b1';
    await new Promise((r) => setTimeout(r, 2500));
  });
  // start the session: the timer's set-but-not-started state starts on Enter
  const started = await page.evaluate(async () => {
    const fr = [...document.querySelectorAll('iframe')].find((f) => (f.src || '').includes('/apps/timer/'));
    if (!fr || !fr.contentWindow) return 'no-frame';
    fr.contentWindow.focus();
    fr.contentWindow.dispatchEvent(new fr.contentWindow.KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    await new Promise((r) => setTimeout(r, 2500));
    return 'space-sent';
  });

  const focus = await page.evaluate(() => {
    const shared = JSON.parse(localStorage.getItem('iterra.v1.doc.shared') || '{}');
    return shared.focus || null;
  });

  // open the MTH dossier and read the live-commons card
  await page.evaluate(() => { window.location.hash = '/c/mth'; });
  await page.waitForTimeout(1500);
  const dossier = await page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].find((d) => (d.textContent || '').includes('live in the commons'));
    const focusBtn = [...document.querySelectorAll('button')].find((b) => /^focus:/.test((b.textContent || '').trim()));
    return {
      hash: location.hash,
      cardText: card ? card.textContent.slice(0, 200) : null,
      focusLine: focusBtn ? focusBtn.textContent.trim() : null,
    };
  });

  console.log(JSON.stringify({ started, focus, dossier, errors }, null, 2));
  await page.close();
  process.exit(0);
})();
