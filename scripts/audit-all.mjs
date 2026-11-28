import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8123';
const dir = 'C:/Users/pmsma/AppData/Local/ms-playwright';
let exe = null;
for (const h of fs.readdirSync(dir).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
  for (const r of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe']) {
    const p = path.join(dir, h, r);
    if (fs.existsSync(p)) { exe = p; break; }
  }
  if (exe) break;
}

// collect all page routes from dist
const routes = ['/404.html'];
function walk(d, base) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, base);
    else if (f === 'index.html') {
      let r = path.relative('dist', path.dirname(p)).split(path.sep).join('/');
      routes.push(r === '' ? '/' : '/' + r + '/');
    }
  }
}
walk('dist', '');

const browser = await chromium.launch({ headless: true, executablePath: exe });
const issues = [];
for (const vp of [{ width: 1440, height: 900, tag: 'd' }, { width: 390, height: 844, tag: 'm' }]) {
  const page = await browser.newPage({ viewport: vp });
  for (const r of routes) {
    const errs = [];
    const onErr = (e) => errs.push(String(e));
    const onFail = (rq) => { if (rq.url().includes('iterra') || rq.url().includes('127.0.0.1')) errs.push('REQFAIL ' + rq.url()); };
    page.on('pageerror', onErr);
    page.on('requestfailed', onFail);
    try {
      await page.goto(BASE + r, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(350);
      const res = await page.evaluate(() => ({
        ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:')).length,
      }));
      if (res.ov > 1 || res.broken > 0 || errs.length) {
        issues.push(`${vp.tag} ${r} ov:${res.ov} broken:${res.broken} errs:${errs.slice(0, 2).join('|')}`);
      }
    } catch (e) {
      issues.push(`${vp.tag} ${r} NAVFAIL ${String(e).slice(0, 80)}`);
    }
    page.off('pageerror', onErr);
    page.off('requestfailed', onFail);
  }
  await page.close();
}
await browser.close();
console.log('pages:', routes.length, 'issues:', issues.length);
issues.slice(0, 30).forEach((x) => console.log(x));
