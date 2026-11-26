// UX audit screenshots — captures every SEO page type at desktop + mobile.
// Usage: node scripts/ux-shots.mjs [baseUrl]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:8123';
const OUT = path.resolve('tmp/ux');
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['home', '/'],
  ['tools-index', '/tools'],
  ['tool-flashcards', '/tools/flashcards'],
  ['tool-timer', '/tools/timer'],
  ['guides-index', '/guides'],
  ['guide-plan-semester', '/guides/plan-a-semester'],
  ['guide-spaced', '/guides/spaced-repetition-explained'],
  ['compare-index', '/compare'],
  ['compare-vs-notion', '/compare/iterra-vs-notion'],
  ['alt-index', '/alternatives'],
  ['alt-best', '/alternatives/best-study-apps'],
  ['tool-boxed-tour', '/tools/boxed'],
  ['guide-finals', '/guides/how-to-study-for-finals-week'],
];

function findExe() {
  const dir = 'C:/Users/pmsma/AppData/Local/ms-playwright';
  if (fs.existsSync(dir)) {
    const hits = fs.readdirSync(dir).filter((d) => d.startsWith('chromium-')).sort().reverse();
    for (const h of hits) {
      const exe = path.join(dir, h, 'chrome-win', 'chrome.exe');
      if (fs.existsSync(exe)) return exe;
      const exe2 = path.join(dir, h, 'chrome-win64', 'chrome.exe');
      if (fs.existsSync(exe2)) return exe2;
    }
  }
  return null;
}

let exe = findExe()
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(exe)) exe = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) });

for (const [name, url] of PAGES) {
  for (const [label, viewport] of [['d', { width: 1440, height: 900 }], ['m', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    // full-page for reading-flow review
    await page.screenshot({ path: path.join(OUT, `${name}-${label}.png`), fullPage: true });
    await page.close();
    console.log('shot', name, label);
  }
}
await browser.close();
