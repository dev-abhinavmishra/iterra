const { chromium } = require('playwright-core');
const fs = require('fs');
const EXE = ['C:/Users/pmsma/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5175/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const measure = async (label) => page.evaluate(async (l) => {
    let frames = 0; const t0 = performance.now();
    await new Promise(res => { const loop = () => { frames++; if (performance.now()-t0 < 1500) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    console.log(l, (frames/1.5).toFixed(0));
  }, label).catch(()=>{});
  // can't console.log inside evaluate easily — return instead
  const fps = async () => page.evaluate(async () => {
    let frames = 0; const t0 = performance.now();
    await new Promise(res => { const loop = () => { frames++; if (performance.now()-t0 < 1500) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    return frames/1.5;
  });
  console.log('baseline:', (await fps()).toFixed(0));
  await page.evaluate(() => { document.querySelector('.mosaic-pixelated').style.filter = 'none'; });
  console.log('no css filter:', (await fps()).toFixed(0));
  await page.evaluate(() => { document.querySelector('.mosaic-pixelated').style.animation = 'none'; });
  console.log('no anim too:', (await fps()).toFixed(0));
  await browser.close();
})();
