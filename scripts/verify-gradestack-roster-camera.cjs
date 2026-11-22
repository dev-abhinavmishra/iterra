/* Isolated GradeStack gradebook/roster export and camera fallback QA.
   Run against an immutable local release candidate only:
   ITERRA_BASE=http://127.0.0.1:8090 node scripts/verify-gradestack-roster-camera.cjs
   Synthetic data only; no camera hardware, API key, or external account. */
const { chromium } = require('../node_modules/playwright-core');
const { PDFDocument } = require('../shell/node_modules/pdf-lib');
const { existsSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const origin = process.env.ITERRA_BASE;
if (!origin) throw Error('Set ITERRA_BASE to the local release server.');
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const outDir = path.resolve('tmp/gradestack-roster-camera');
mkdirSync(outDir, { recursive: true });

async function filledSheet(name, id) {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  doc.setProducer('GradeStack');
  doc.setTitle('Roster QA');
  doc.setKeywords([JSON.stringify({ format: 'gradestack-sheet', assessmentId: 'roster-qa', formatVersion: 2,
    sections: [{ id: 'sec-1', count: 2, format: 'A-D' }] })]);
  const form = doc.getForm();
  form.createTextField('student_name').setText(name);
  form.createTextField('student_id').setText(id);
  form.getTextField('student_name').addToPage(page);
  form.getTextField('student_id').addToPage(page);
  for (const [n, answer] of [[1, 'A'], [2, 'B']]) {
    const radio = form.createRadioGroup(`q.${n}`);
    for (const option of ['A', 'B', 'C', 'D']) radio.addOptionToPage(option, page);
    radio.select(answer);
  }
  return Buffer.from(await doc.save());
}

function parseCsvLine(line) {
  const values = [];
  let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted && char === '"' && line[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(value); value = ''; }
    else value += char;
  }
  values.push(value);
  return values;
}

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(origin + '/#/');
    await page.evaluate(() => localStorage.setItem('gradestack-storage', JSON.stringify({ state: {
      tests: [{ id: 'roster-qa', name: 'Roster QA', courseName: 'QA101', date: '2026-11-20', numQuestions: 2,
        format: 'A-D', sections: [{ id: 'sec-1', count: 2, format: 'A-D' }], includeStudentId: true, answerKey: { 1: 'A', 2: 'B' } }],
      scans: [], geminiKey: '', theme: 'light',
    }, version: 0 })));

    // Import synthetic, digitally-filled sheets through GradeStack's real PDF workflow.
    await page.goto(origin + '/?rosterQA=1#/p/gradestack?p=scan&testId=roster-qa');
    const pdfInput = page.locator('input[type=file][multiple]');
    await pdfInput.waitFor({ state: 'attached' });
    await page.getByPlaceholder('e.g. Period 1').fill('Period 1');
    const fullName = 'Doe, Jane';
    const leadingZeroId = '0000123';
    const goodPdf = await filledSheet(fullName, leadingZeroId);
    await pdfInput.setInputFiles({ name: 'jane-doe.pdf', mimeType: 'application/pdf', buffer: goodPdf });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('gradestack-storage')).state.scans.length === 1);
    let scans = await page.evaluate(() => JSON.parse(localStorage.getItem('gradestack-storage')).state.scans);
    assert.equal(scans[0].studentName, fullName);
    assert.equal(scans[0].studentId, leadingZeroId);
    assert.equal(scans[0].rawScore, 2);
    assert.equal(scans[0].maxScore, 2);
    assert.equal(scans[0].percentage, 100);
    assert.equal(scans[0].batchName, 'Period 1');

    // The history contract allows rescanning the same student: it creates a
    // distinct sheet row; it does not silently deduplicate by student ID.
    await pdfInput.setInputFiles({ name: 'jane-doe-repeat.pdf', mimeType: 'application/pdf', buffer: goodPdf });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('gradestack-storage')).state.scans.length === 2);
    scans = await page.evaluate(() => JSON.parse(localStorage.getItem('gradestack-storage')).state.scans);
    assert.notEqual(scans[0].id, scans[1].id);
    assert.equal(scans.filter(scan => scan.studentId === leadingZeroId).length, 2);
    await page.reload();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('gradestack-storage')).state.scans.length === 2);
    await page.goto(origin + '/?rosterQA=1#/p/gradestack?p=analytics&testId=roster-qa');
    await page.getByRole('button', { name: 'Gradebook CSV' }).waitFor();
    const closeDetails = page.getByRole('button', { name: 'Close details panel' });
    if (await closeDetails.isVisible().catch(() => false)) await closeDetails.click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Gradebook CSV' }).click();
    const downloaded = await download;
    const csv = await (await import('node:fs/promises')).readFile(await downloaded.path(), 'utf8');
    const rows = csv.trim().split(/\r?\n/).map(parseCsvLine);
    assert.equal(rows.length, 3, 'header plus two rescanned sheets');
    assert.deepEqual(rows[0].slice(0, 8), ['Student', 'ID', 'Batch', 'Raw score', 'Out of', 'Percent', 'Grade', 'Needs review']);
    for (const row of rows.slice(1)) {
      assert.equal(row[0], fullName, 'quoted-comma student name round-trips');
      assert.equal(row[1], leadingZeroId, 'leading-zero ID remains text');
      assert.equal(row[2], 'Period 1');
      assert.equal(row[3], '2');
      assert.equal(row[4], '2');
      assert.equal(row[5], '100%');
      assert.equal(row[7], 'no');
    }
    await page.screenshot({ path: path.join(outDir, 'gradebook-1280-paper.png'), fullPage: true });
    const settleMobileView = async () => {
      await page.waitForTimeout(350);
      const appNav = page.locator('.it-place-gradestack nav');
      const navClass = await appNav.getAttribute('class').catch(() => '');
      if (navClass.includes('translate-x-0 w-64')) await appNav.locator('button[title="Close menu"]').click();
      await page.waitForTimeout(350);
    };
    await page.setViewportSize({ width: 390, height: 844 });
    await settleMobileView();
    await page.screenshot({ path: path.join(outDir, 'gradebook-390-paper.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    await settleMobileView();
    await page.screenshot({ path: path.join(outDir, 'gradebook-320-paper.png'), fullPage: true });
    await page.evaluate(() => {
      localStorage.setItem('iterra.v1.theme', 'graphite');
      document.documentElement.dataset.theme = 'graphite';
      window.dispatchEvent(new CustomEvent('iterra:theme', { detail: 'graphite' }));
    });
    await page.screenshot({ path: path.join(outDir, 'gradebook-320-graphite.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await settleMobileView();
    await page.screenshot({ path: path.join(outDir, 'gradebook-390-graphite.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: path.join(outDir, 'gradebook-1280-graphite.png'), fullPage: true });
    await page.evaluate(() => {
      localStorage.setItem('iterra.v1.theme', 'paper');
      document.documentElement.dataset.theme = 'paper';
      window.dispatchEvent(new CustomEvent('iterra:theme', { detail: 'paper' }));
    });

    // Deny browser camera permission via CDP; no real camera device is requested.
    await page.goto(origin + '/?cameraQA=1#/p/gradestack?p=scan&testId=roster-qa');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Browser.setPermission', { permission: { name: 'camera' }, setting: 'denied', origin: new URL(origin).origin });
    await page.getByRole('button', { name: 'Use camera' }).click();
    await page.getByText("Camera was blocked or isn't available — upload a photo instead.").waitFor();
    await page.screenshot({ path: path.join(outDir, 'camera-denied-1280.png'), fullPage: true });

    // Upload a tiny synthetic raster to validate the photo/crop fallback with
    // no Gemini key. The UI should accept/crop it and then report reader setup
    // failure without creating a score or calling an external provider.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/9ioAAAAASUVORK5CYII=', 'base64');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('dialog', { name: 'Frame the sheet' }).waitFor();
    await page.screenshot({ path: path.join(outDir, 'photo-crop-1280-paper.png'), fullPage: true });
    await page.getByRole('button', { name: 'Grade this sheet' }).click();
    await page.getByText(/No Gemini key — add one in Settings, or upload a digitally filled PDF instead\./i).waitFor();
    await page.getByRole('dialog', { name: 'Frame the sheet' }).waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gradestack-storage')).state.scans.length), 2,
      'photo fallback with empty provider key must not create a fake grade');
    await page.screenshot({ path: path.join(outDir, 'photo-no-key-1280.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(outDir, 'photo-no-key-390.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.screenshot({ path: path.join(outDir, 'photo-no-key-320.png'), fullPage: true });
    assert.deepEqual(pageErrors, [], 'unexpected browser page errors');
    await context.close();
    console.log(`PASS GradeStack scored-sheet/gradebook export, repeated-ID history, camera denial and no-key photo fallback; screenshots ${outDir}`);
    console.log('Scope: roster CSV import is not present; tested native filled-PDF input and gradebook CSV export. Actual camera and provider remain unverified.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
