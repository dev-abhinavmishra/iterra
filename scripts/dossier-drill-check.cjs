// dossier-drill: #/c/<course> 'start a session →' verb → timer.start send
// resolves (direct if timer mounted, else a queued ?intake= the timer drains
// on boot) and lands the user on the instruments bound to the course.
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
  const btnInfo = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^start a session →$/.test(x.textContent.trim()));
    return { rendered: !!b, buttons: [...document.querySelectorAll('button')].map((x) => x.textContent.trim()).filter(Boolean).slice(0, 15) };
  });
  console.log('start-session button rendered:', btnInfo.rendered, '| visible buttons:', btnInfo.buttons.join(' · '));
  if (!btnInfo.rendered) { console.error('FAIL: no start-session verb on the dossier'); process.exit(1); }
  await page.click('button:has-text("start a session →")');
  // delivery may be direct (warm frame) or a queued ?intake= the cold frame
  // drains then navigates to the bound deep link — poll for the outcome.
  let tFrame, body = '', fsrc = '';
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(800);
    tFrame = page.frames().find((f) => f.url().includes('/apps/timer/'));
    if (tFrame) {
      try { body = await tFrame.evaluate(() => document.body.innerText); fsrc = tFrame.url(); } catch { /* mid-nav */ }
      if (/drill mth|← terrain|elapsed/i.test(body) || /intake=|intent=/i.test(fsrc)) break;
    }
  }
  const state = { hash: await page.evaluate(() => location.hash) };
  console.log('timer mounted:', !!tFrame, '| hash:', state.hash, '| src:', fsrc);
  console.log('| bound session:', /drill mth|← terrain|elapsed/i.test(body), '| errs:', errs.join(';') || 'none');
  const ok = !!tFrame && state.hash === '#/p/timer' && /drill mth|← terrain|elapsed|intake=|intent=/i.test(fsrc + body);
  console.log(ok ? 'PASS' : 'FAIL');
  await page.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
