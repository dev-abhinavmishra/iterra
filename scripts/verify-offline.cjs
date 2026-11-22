/* Production service worker smoke: prime, reload offline, inspect sample data,
   then reconnect. Run against a loopback server serving the root dist. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const base = process.argv[2] || 'http://localhost:8090';
const exe = [
  'C:/Users/pmsma/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!exe) throw new Error('No Chromium-family browser found');

(async () => {
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [], failed = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('requestfailed', r => failed.push(`${r.url()} ${r.failure()?.errorText}`));
    await page.goto(`${base}/#/settings`, { waitUntil: 'load' });
    await page.getByText('Load a sample semester', { exact: false }).first().click();
    await page.getByRole('button', { name: 'Load sample' }).click();
    await page.waitForLoadState('load');
    await page.waitForTimeout(1500); // The sample action reloads asynchronously.
    await page.evaluate(() => Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker did not become ready within 20 seconds')), 20000)),
    ]));
    await page.reload({ waitUntil: 'load' });
    if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) throw new Error('No controlling service worker');
    // Prime the Planning tool and its code before testing an offline edit.
    await page.goto(`${base}/#/p/syllabus?p=semester`, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Import', exact: true }).waitFor();
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    // Reload normalizes the hash to the Planning Today view; use its visible
    // Semester navigation to reach the importer while still offline.
    await page.getByRole('button', { name: 'Semester', exact: true }).click();
    try { await page.getByRole('button', { name: 'Import', exact: true }).click({ timeout: 15000 }); }
    catch (error) {
      await page.screenshot({ path: 'tmp/offline-diagnostic.png' });
      console.log('diagnostic:', JSON.stringify({ url: page.url(), body: await page.locator('body').innerText(), errors, failed,
        controlled: await page.evaluate(() => !!navigator.serviceWorker.controller), caches: await page.evaluate(async () => Promise.all((await caches.keys()).map(async name => [name, (await (await caches.open(name)).keys()).length]))) }));
      throw error;
    }
    const importer = page.getByRole('dialog', { name: 'Import course schedule' });
    await importer.getByRole('textbox', { name: 'Paste course schedule' }).fill('OFF 101 — Offline Course\n2026-11-25 — Offline verification assignment');
    await importer.getByRole('button', { name: 'Preview assignments' }).click();
    await importer.getByRole('button', { name: 'Add 1 assignment', exact: true }).click();
    await importer.getByText('1 assignment added.').waitFor();
    await page.reload({ waitUntil: 'load' });
    const hasOfflineAssignment = () => page.evaluate(() => (localStorage.getItem('syllabus.folio.v1') || '').includes('Offline verification assignment'));
    if (!await hasOfflineAssignment()) throw new Error('Offline assignment missing after reload');
    console.log('PASS: created an assignment offline and retained it after offline reload');
    await page.goto(`${base}/#/courses`, { waitUntil: 'load' });
    await page.getByText('BIO 201', { exact: false }).locator('visible=true').first().waitFor({ timeout: 15000 });
    console.log('PASS: controlled offline reload retained sample course');
    await context.setOffline(false);
    await page.reload({ waitUntil: 'load' });
    await page.getByText('BIO 201', { exact: false }).locator('visible=true').first().waitFor({ timeout: 15000 });
    if (!await hasOfflineAssignment()) throw new Error('Offline assignment missing after reconnect');
    console.log('PASS: sample course remained visible after reconnect');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
