/* Isolated GradeStack PDF identity regression. Run only against a local candidate:
   $env:ITERRA_BASE='http://127.0.0.1:PORT'; node scripts/verify-gradestack-pdf.cjs
   Uses synthetic assessments and generated form PDFs, never provider services. */
const { chromium } = require('../node_modules/playwright-core');
const { PDFDocument } = require('../shell/node_modules/pdf-lib');
const { existsSync, readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const origin = process.env.ITERRA_BASE;
if (!origin) throw Error('Set ITERRA_BASE to the local release server.');
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);

async function pdf(kind) {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const form = doc.getForm();
  if (kind === 'unrelated') {
    form.createTextField('unrelated').addToPage(page);
  } else {
    doc.setProducer(kind === 'matching' ? 'Third-party filler' : 'GradeStack');
    doc.setTitle(kind === 'wrong-test' ? 'Other assessment' : 'Target assessment');
    doc.setKeywords([JSON.stringify({ sections: [{ id: 's1', count: kind === 'layout' ? 1 : 2, format: 'A-D' }], includeStudentId: true,
      ...(kind === 'legacy' ? {} : { format: 'gradestack-sheet', assessmentId: kind === 'wrong-test' ? 'other-assessment' : 'target-assessment', formatVersion: 2 }) })]);
    form.createTextField('student_name').setText('Synthetic Student');
    form.createTextField('student_id').setText('synthetic-1');
    form.getTextField('student_name').addToPage(page);
    form.getTextField('student_id').addToPage(page);
    for (const [n, selected] of [[1, 'A'], [2, 'B']]) {
      const radio = form.createRadioGroup('q.' + n);
      for (const option of ['A', 'B', 'C', 'D']) radio.addOptionToPage(option, page);
      radio.select(selected);
    }
  }
  return Buffer.from(await doc.save());
}

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(origin + '/#/');
    await page.evaluate(() => localStorage.setItem('gradestack-storage', JSON.stringify({ state: {
      tests: [{ id: 'target-assessment', name: 'Target assessment', courseName: 'TEST101', date: '2026-11-20',
        numQuestions: 2, format: 'A-D', sections: [{ id: 's1', count: 2, format: 'A-D' }], includeStudentId: true, answerKey: { 1: 'A', 2: 'B' } }], scans: [],
    }, version: 0 })));
    await page.goto(origin + '/?pdfIdentityQA=1#/p/gradestack');
    const download = page.waitForEvent('download');
    await page.getByTitle('Download sheet PDF').click();
    const downloaded = await download;
    const actualExport = await PDFDocument.load(readFileSync(await downloaded.path()), { updateMetadata: false });
    const metadata = JSON.parse(actualExport.getKeywords());
    assert.equal(metadata.format, 'gradestack-sheet');
    assert.equal(metadata.assessmentId, 'target-assessment');
    const form = actualExport.getForm();
    form.getTextField('student_name').setText('Synthetic Student');
    form.getTextField('student_id').setText('synthetic-1');
    form.getRadioGroup('q.1').select('A');
    form.getRadioGroup('q.2').select('B');
    actualExport.setProducer('Third-party filler');
    const filledExport = Buffer.from(await actualExport.save());
    await page.goto(origin + '/?pdfIdentityQA=1#/p/gradestack?p=scan&testId=target-assessment');
    const input = page.locator('input[type=file][multiple]');
    await input.waitFor({ state: 'attached' });
    const count = () => page.evaluate(() => JSON.parse(localStorage.getItem('gradestack-storage')).state.scans.length);
    for (const kind of ['unrelated', 'wrong-test', 'layout']) {
      await input.setInputFiles({ name: kind + '.pdf', mimeType: 'application/pdf', buffer: await pdf(kind) });
      await page.waitForFunction(() => document.querySelector('input[type=file][multiple]')?.value === '');
      const expectedError = kind === 'wrong-test' ? /belongs to a different assessment/ :
        kind === 'layout' ? /different question layout/ : /could not be read as a filled GradeStack sheet/i;
      await page.getByText(expectedError).first().waitFor();
      assert.equal(await count(), 0, kind + ' PDF must not create a scan');
    }
    await input.setInputFiles({ name: 'matching.pdf', mimeType: 'application/pdf', buffer: filledExport });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('gradestack-storage')).state.scans.length === 1);
    let scans = await page.evaluate(() => JSON.parse(localStorage.getItem('gradestack-storage')).state.scans);
    assert.equal(scans[0].testId, 'target-assessment');
    assert.equal(scans[0].rawScore, 2);
    assert.equal(scans[0].studentId, 'synthetic-1');
    await input.setInputFiles({ name: 'legacy.pdf', mimeType: 'application/pdf', buffer: await pdf('legacy') });
    const legacy = page.getByRole('dialog', { name: 'Confirm older sheet' });
    await legacy.getByRole('button', { name: 'Cancel' }).click();
    assert.equal(await count(), 1);
    await input.setInputFiles({ name: 'legacy.pdf', mimeType: 'application/pdf', buffer: await pdf('legacy') });
    // A second upload while the legacy confirmation is open must not start
    // another batch or replace the pending confirmation callback.
    await input.setInputFiles({ name: 'overlap.pdf', mimeType: 'application/pdf', buffer: await pdf('legacy') });
    await legacy.getByRole('button', { name: 'Grade for this assessment' }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('gradestack-storage')).state.scans.length === 2);
    await legacy.waitFor({ state: 'hidden' });
    await page.waitForTimeout(500);
    assert.equal(await legacy.isVisible(), false, 'overlapping upload must not start a second legacy confirmation');
    assert.equal(await count(), 2, 'overlapping upload must not create a duplicate scan');
    scans = await page.evaluate(() => JSON.parse(localStorage.getItem('gradestack-storage')).state.scans);
    assert.equal(scans[0].needsReview, true);
    assert.equal(scans[0].pdfProvenance, 'unverified-legacy');
    await page.reload();
    assert.equal(await count(), 2);
    console.log('PASS PDF identity rejection, matching score, explicit legacy confirmation and persistence');
    await ctx.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
