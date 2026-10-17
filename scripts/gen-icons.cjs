/* Rasterize the iterra leaf mark (same SVG as the inline favicon) into the
   icon files a manifest/apple touch icon need: PNG at 180, 192, 512.

   Browser resolution order:
     1. PLAYWRIGHT_CHROMIUM_EXE env var (explicit override)
     2. playwright-core's bundled chromium (after `npx playwright install`)
     3. a system Chrome/Edge install at the usual locations
   Dev-time tool only — not part of the build or deploy path. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'shell', 'public');

const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
  <rect width='32' height='32' rx='7' fill='#2f5d46'/>
  <path d='M9 21c2.5-5 6.5-9 14-9-1 6-4 11-9 11-2 0-4-1-5-2z' fill='#efe9dc'/>
</svg>`;

function findExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXE) return process.env.PLAYWRIGHT_CHROMIUM_EXE;
  try {
    const bundled = chromium.executablePath();
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch { /* playwright browsers not installed */ }
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return candidates.find(fs.existsSync);
}

(async () => {
  fs.writeFileSync(path.join(OUT, 'icon.svg'), svg.replace(/\n\s*/g, '') + '\n');
  const executablePath = findExecutable();
  const browser = await chromium.launch(
    executablePath ? { executablePath } : {},
  );
  const page = await browser.newPage();
  for (const size of [180, 192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><body style="margin:0;display:flex">${svg
        .replace('<svg ', `<svg width='${size}' height='${size}' `)
        .replace(/\n\s*/g, ' ')}</body>`,
    );
    await page.screenshot({
      path: path.join(OUT, `icon-${size}.png`),
      omitBackground: false,
    });
    console.log(`icon-${size}.png`);
  }
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(
    `<!doctype html><body style="margin:0;display:flex">${svg
      .replace('<svg ', `<svg width='180' height='180' `)
      .replace(/\n\s*/g, ' ')}</body>`,
  );
  await page.screenshot({ path: path.join(OUT, 'apple-touch-icon.png') });
  console.log('apple-touch-icon.png (180)');
  await browser.close();
})();
