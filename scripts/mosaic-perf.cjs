const { chromium } = require('playwright-core');
const fs = require('fs');
const EXE = ['C:/Users/pmsma/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:5175/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    const c = document.querySelector('canvas');
    // measure rAF fps over 2s
    let frames = 0; const t0 = performance.now();
    await new Promise(res => { const loop = () => { frames++; if (performance.now()-t0 < 2000) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    // check fish/kite/firefly presence: sample pixels for their colors
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let fish=0, kite=0, fly=0;
    for (let i = 0; i < d.length; i += 16) { // every 4th px
      const R=d[i],G=d[i+1],B=d[i+2];
      if (R>25&&R<50&&G>75&&G<105&&B>85&&B<115) fish++;
      if (R>190&&R<240&&G>85&&G<125&&B>50&&B<90) kite++;
      if (R>230&&G>200&&B>100&&B<180) fly++;
    }
    return { fps: frames/2, w: c.width, h: c.height, fish, kite, fly, errs: null };
  });
  console.log(JSON.stringify(r));
  // glass optics check
  const g = await page.evaluate(() => {
    const fx = document.querySelector('header gl-fx .b');
    return fx ? getComputedStyle(fx).backdropFilter.slice(0,140) : 'none';
  });
  console.log('GLASS:', g);
  await page.screenshot({ path: 'scripts/mosaic-v3.png' });
  console.log('ERRORS:', errs.length ? errs : 'none');
  await browser.close();
})();
