const { chromium } = require('playwright-core');
const fs = require('fs');
const EXE = ['C:/Users/pmsma/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await (await browser.newContext()).newPage();
  await page.goto('http://localhost:5455/#/settings', { waitUntil: 'load' });
  await page.getByText('Load a sample semester', { exact: false }).first().click();
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.waitForLoadState('load');
  await page.waitForTimeout(1200);
  await page.goto('http://localhost:5455/#/p/syllabus', { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  const out = await page.evaluate(async () => {
    const it = window.iterra;
    const blocks = await it.store.list({ app: 'syllabus', type: 'block' });
    const blk = (blocks || []).find((b) => String(b.id).includes('demo') && b.data?.state !== 'done');
    if (!blk) return { err: 'no demo block', keys: (blocks || []).map((b) => b.id) };
    await it.send({ to: 'syllabus', action: 'block.done', entity: blk, payload: { blockId: blk.id } });
    for (let i = 0; i < 40; i++) {
      const folio = JSON.parse(localStorage.getItem('syllabus.folio.v1') || '{}');
      const st = folio.state?.blocks?.[blk.id]?.state;
      if (st === 'done') return { blockId: blk.id, state: st, tries: i };
      await new Promise((r) => setTimeout(r, 400));
    }
    return { blockId: blk.id, state: 'never-done' };
  });
  console.log(JSON.stringify(out));
  await browser.close();
  process.exit(out.state === 'done' ? 0 : 1);
})();
