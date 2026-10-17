const { chromium } = require('playwright-core');
const fs = require('fs');
const CANDIDATES = [
  'C:/Users/pmsma/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const EXE = CANDIDATES.find((p) => fs.existsSync(p));
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await (await browser.newContext()).newPage();
  await page.goto('http://localhost:5455/#/today', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.iterra?.store?.put, { timeout: 15000 });
  const out = await page.evaluate(async () => {
    const it = window.iterra;
    const A = 'shell:probe:cascade-a', B = 'shell:probe:cascade-b';
    await it.store.put({ app: 'shell', type: 'probe', id: 'cascade-a', key: A, title: 'probe A' });
    await it.store.put({ app: 'shell', type: 'probe', id: 'cascade-b', key: B, title: 'probe B' });
    await it.links.add(A, B, 'derivedFrom');
    const before = await it.links.for(B);
    const innBefore = (before?.inn || []).length;
    await it.store.remove(A);
    const after = await it.links.for(B);
    const innAfter = (after?.inn || []).length;
    await it.store.remove(B);
    return { innBefore, innAfter };
  });
  console.log(JSON.stringify(out));
  await browser.close();
  process.exit(out.innBefore === 1 && out.innAfter === 0 ? 0 : 1);
})();
