// drills-check: deck → "Drill in timer" → timer mounts framed with the bound intent
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:29229');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('page: ' + e.message));
  await page.goto('http://localhost:8090/', { waitUntil: 'networkidle' });

  // seed a deck with course so the intake params can be asserted
  // store shape: cardfile.decks.v1 = {<id>: deck}, cardfile.lastDeck = id
  await page.evaluate(() => {
    localStorage.setItem('cardfile.decks.v1', JSON.stringify({
      d1: { id: 'd1', title: 'MTH derivatives', course: 'MTH', cards: [{ id: 'c1', q: 'd/dx x²', a: '2x', ex: null, starred: false, status: 'new' }] },
    }));
    localStorage.setItem('cardfile.lastDeck', 'd1');
  });

  const fr = await page.evaluate(() => {
    window.location.hash = '/p/flashcards';
    return true;
  });
  await page.waitForTimeout(2500);
  const frame = page.frames().find((f) => f.url().includes('/apps/flashcards/'));
  if (!frame) { console.log('FAIL: no flashcards frame'); process.exit(1); }

  const deckTitle = await frame.evaluate(() => document.getElementById('deck-title')?.textContent);
  console.log('deck title:', deckTitle);

  // open the deck menu, click "Drill in timer…"
  await frame.evaluate(() => document.getElementById('deck-menu-btn').click());
  await page.waitForTimeout(300);
  const drillVisible = await frame.evaluate(() => !document.getElementById('menu-drill')?.closest('#deck-menu')?.hidden);
  console.log('drill item visible:', drillVisible);
  await frame.evaluate(() => document.getElementById('menu-drill').click());
  await page.waitForTimeout(2500);

  // iterra.open('/apps/timer/?...') inside the frame should re-mount timer in the shell
  const tFrame = page.frames().find((f) => f.url().includes('/apps/timer/'));
  const url = tFrame ? tFrame.url() : 'NONE';
  console.log('timer frame url:', url, '(params are stripped on consume — assert on state)');
  const timerBody = tFrame ? await tFrame.evaluate(() => document.body.innerText.slice(0, 500)) : '';
  // intake consumed: intent text = "drill MTH derivatives", label = course 'MTH'
  const inUrl = /drill mth derivatives/i.test(timerBody);
  const course = /\bMTH\b/.test(timerBody);
  console.log('PASS:', url !== 'NONE' && inUrl && errs.length === 0 ? 'yes' : 'no', '| intent:', inUrl, '| course:', course, '| errs:', errs.join(';'));
  console.log('timer shows:', timerBody.split('\n').filter(Boolean).slice(0, 4).join(' / '));
  await page.close();
  await browser.close();
})();
