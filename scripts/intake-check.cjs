/* ?block= intake + dossier coverage check:
   seeds a 2-block folio + a courseName'd gradestack test, then asserts:
   1. /apps/syllabus/?block=b2 lands the cursor on slip b2 + strips the param
   2. gradestack test with courseName 'MTH' groups on the mth dossier */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:29229');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('page: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const today = new Date().toISOString().slice(0, 10);
  await page.goto('http://localhost:8090/', { waitUntil: 'load' });
  await page.evaluate((today) => {
    const folio = {
      terms: { t1: { id: 't1', name: 'Fall', startDate: today, endDate: '2026-12-20', timezone: 'UTC', createdAt: today + 'T00:00:00Z' } },
      activeTermId: 't1',
      courses: { c1: { id: 'c1', termId: 't1', name: 'Math', code: 'MTH', color: 'hunter', archived: false, createdAt: today + 'T00:00:00Z' } },
      commitments: {
        k1: { id: 'k1', courseId: 'c1', type: 'assignment', title: 'ps4 problem set', dueAt: today + 'T23:59:00', weight: 30, estimatedMinutes: 120, loggedMinutes: 0, status: 'open', pinned: false, dependencies: [], createdAt: today + 'T00:00:00Z' },
        k2: { id: 'k2', courseId: 'c1', type: 'reading', title: 'read ch. 7', dueAt: today + 'T23:59:00', weight: 10, estimatedMinutes: 30, loggedMinutes: 0, status: 'open', pinned: false, dependencies: [], createdAt: today + 'T00:00:00Z' },
      },
      blocks: {
        b1: { id: 'b1', commitmentId: 'k1', plannedDate: today, plannedStart: '09:00', plannedMinutes: 45, state: 'planned', phase: 'work', label: 'first', reasons: [], score: 80, deferCount: 0, order: 0, createdAt: today + 'T00:00:00Z' },
        b2: { id: 'b2', commitmentId: 'k2', plannedDate: today, plannedStart: '10:00', plannedMinutes: 30, state: 'planned', phase: 'read', label: 'second', reasons: [], score: 70, deferCount: 0, order: 1, createdAt: today + 'T00:00:00Z' },
      },
      links: {}, reviews: {}, settings: {}, dismissed: [],
    };
    localStorage.setItem('syllabus.folio.v1', JSON.stringify({ state: folio, version: 1 }));
    localStorage.setItem('gradestack-storage', JSON.stringify({
      state: {
        tests: [{ id: 'gs1', name: 'Unit 3 quiz', courseName: 'MTH', date: today, numQuestions: 10, format: 'mcq', includeStudentId: true, createdAt: Date.now(), answerKey: {} }],
        scans: [],
      },
      version: 0,
    }));
  }, today);

  // 1. mount syllabus bound to block b2 inside the terrain
  await page.evaluate(() => { window.location.hash = '/p/syllabus'; });
  await page.waitForTimeout(3500);
  const intake = await page.evaluate(async () => {
    const fr = [...document.querySelectorAll('iframe')].find((f) => (f.src || '').includes('/apps/syllabus/'));
    if (!fr || !fr.contentWindow) return 'no-frame';
    fr.contentWindow.location.href = '/apps/syllabus/?block=b2';
    await new Promise((r) => setTimeout(r, 3000));
    const doc = fr.contentWindow.document;
    const slips = [...doc.querySelectorAll('[data-block]')].map((el) => ({
      id: el.getAttribute('data-block'),
      selected: (el.className || '').includes('ring-2'),
    }));
    return {
      url: fr.contentWindow.location.search,
      slips,
      selEl: doc.querySelector('[data-block].ring-2, [data-block][class*="ring-2"]') ? 'found' : 'none',
    };
  });

  // 2. mount gradestack so its index publishes, then read the mth dossier
  await page.evaluate(() => { window.location.hash = '/p/gradestack'; });
  await page.waitForTimeout(4000);
  await page.evaluate(() => { window.location.hash = '/c/mth'; });
  await page.waitForTimeout(1500);
  const dossier = await page.evaluate(() => {
    const text = document.body.innerText;
    const gs = [...document.querySelectorAll('section')].map((s) => s.textContent.slice(0, 120));
    return { hasUnit3: text.includes('Unit 3 quiz'), sections: gs };
  });

  console.log(JSON.stringify({ intake, dossier, errors }, null, 2));
  await page.close();
  process.exit(0);
})();
