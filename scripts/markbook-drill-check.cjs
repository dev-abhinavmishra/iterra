// markbook-drill: TestHistory row timer icon → framed timer consumes 'study <name>' + course
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:29229');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8090/', { waitUntil: 'networkidle' });

  await page.evaluate(() => {
    localStorage.setItem('gradestack-storage', JSON.stringify({
      state: { tests: [{ id: 't1', name: 'Derivatives Quiz', courseName: 'MTH', date: '2026-10-01', numQuestions: 20, format: 'mcq', includeStudentId: false }], scans: [] },
      version: 0,
    }));
  });
  // mount gradestack straight onto /history
  await page.evaluate(() => {
    window.iterra_mount = '/apps/gradestack/history'; // hint for any custom mount
    window.location.hash = '/p/gradestack';
  });
  await page.waitForTimeout(3000);
  let g = page.frames().find((f) => f.url().includes('/apps/gradestack'));
  console.log('gradestack frame:', g ? g.url() : 'NONE');
  // navigate inside the frame to /history via the router link (sidebar), else pushState
  await g.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find((x) => x.getAttribute('href') === '/apps/gradestack/history' || x.href.endsWith('/history'));
    if (a) a.click(); else location.pathname = '/apps/gradestack/history';
  });
  await page.waitForTimeout(1500);
  const sawTest = await g.evaluate(() => document.body.innerText.includes('Derivatives Quiz'));
  console.log('test row rendered:', sawTest);

  const clicked = await g.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('title') === 'Study in the timer');
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log('drill clicked:', clicked);
  await page.waitForTimeout(2500);
  const tFrame = page.frames().find((f) => f.url().includes('/apps/timer/'));
  const body = tFrame ? await tFrame.evaluate(() => document.body.innerText.slice(0, 500)) : '';
  console.log('PASS:', !!tFrame && /study Derivatives Quiz/i.test(body) && /\bMTH\b/.test(body) && errs.length === 0, '| intent:', /study Derivatives Quiz/i.test(body), '| course:', /\bMTH\b/.test(body), '| errs:', errs.join(';') || 'none');
  await page.close();
  await browser.close();
})();
