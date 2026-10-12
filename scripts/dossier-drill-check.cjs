// dossier-drill: #/c/<course> 'drill <course>' button → framed timer consumes intent+course
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:29229');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8090/', { waitUntil: 'networkidle' });

  // seed an entity so the dossier has something to group (also asserts button on a real dossier)
  await page.evaluate(() => {
    localStorage.setItem('iterra.v1.doc.index.syllabus', JSON.stringify({
      entities: [{ t: 'block', id: 'b1', title: 'ps4', course: 'MTH', url: '/apps/syllabus/?block=b1', at: Date.now() }],
    }));
    window.location.hash = '/c/mth';
  });
  await page.waitForTimeout(1200);
  const btn = await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^drill MTH →$/.test(b.textContent.trim())));
  console.log('drill button rendered:', !!btn);
  await page.click('button:has-text("drill MTH →")');
  await page.waitForTimeout(2500);

  const tFrame = page.frames().find((f) => f.url().includes('/apps/timer/'));
  const body = tFrame ? await tFrame.evaluate(() => document.body.innerText.slice(0, 500)) : '';
  console.log('timer mounted:', !!tFrame, '| intent:', /drill MTH/i.test(body), '| course:', /\bMTH\b/.test(body), '| errs:', errs.join(';') || 'none');
  await page.close();
  await browser.close();
})();
