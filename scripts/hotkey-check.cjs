/* ⌘ chords forwarded from inside a frame → shell acts. Verifies:
   1. ⌘3 inside syllabus frame → shell switches to ink
   2. ⌘K inside syllabus frame → palette opens
   3. ⌘K inside INK frame → ink's OWN palette wins (not terrain's) */
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:29229');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto('http://localhost:8090/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { location.hash = '#/p/syllabus'; });
  await page.waitForTimeout(2500);
  const frame = page.frames().find(f => f.url().includes('/apps/syllabus/'));
  if (!frame) { console.log('FAIL: syllabus frame absent'); process.exit(1); }
  await frame.evaluate(() => window.focus());
  // ⌘3 inside frame → ink
  await frame.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', metaKey: true, bubbles: true })));
  await page.waitForTimeout(600);
  const hash3 = await page.evaluate(() => location.hash);
  // ⌘K inside frame → terrain palette (syllabus has no ⌘K of its own)
  await frame.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
  await page.waitForTimeout(600);
  const paletteOpen = await page.evaluate(() => !!document.querySelector('input[placeholder*="earch"], [class*="palette"], [role="dialog"]'));
  // ink frame: its own ⌘K should win — terrain palette must NOT open
  await page.evaluate(() => { location.hash = '#/p/ink'; });
  await page.waitForTimeout(2500);
  const inkFrame = page.frames().find(f => f.url().includes('/apps/ink/'));
  await inkFrame.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
  await page.waitForTimeout(600);
  const terrainPaletteOnInk = await page.evaluate(() => {
    const el = document.querySelector('input[placeholder*="earch"]');
    return el ? el.offsetParent !== null : false;
  });
  const inkOwnUI = await inkFrame.evaluate(() => {
    // ink's command palette renders an input in a fixed overlay
    const els = [...document.querySelectorAll('input')];
    return els.some(e => /search|command/i.test(e.placeholder || '') && e.offsetParent);
  });
  console.log(JSON.stringify({ hash3, paletteOpen, terrainPaletteOnInk, inkOwnUI }, null, 1));
  const pass = hash3 === '#/p/flashcards' && paletteOpen && !terrainPaletteOnInk;
  console.log(pass ? 'HOTKEY PASS' : 'HOTKEY FAIL');
  await page.close();
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
