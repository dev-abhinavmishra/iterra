/* iterra audit probe — seed real data into each app's persist store, then
   walk the terrain and record what feels disconnected. */
const { chromium } = require('playwright-core');
const fs = require('fs');

const today = new Date().toISOString().slice(0, 10);
const now = new Date().toISOString();

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:29229');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERR', e.message));

  await page.goto('http://localhost:8090/', { waitUntil: 'load' });
  await page.waitForTimeout(600);

  // ── seed each app's persist store on the shared origin ──
  await page.evaluate(({ today, now }) => {
    localStorage.clear();
    // syllabus folio: term + course MTH + commitment + today's block
    localStorage.setItem('syllabus.folio.v1', JSON.stringify({
      version: 1,
      state: {
        terms: { 't-1': { id: 't-1', name: 'Fall 2026', startDate: '2026-09-01', endDate: '2026-12-20', timezone: 'local', createdAt: now } },
        activeTermId: 't-1',
        courses: { 'c-mth': { id: 'c-mth', termId: 't-1', name: 'Calculus', code: 'MTH', color: 'navy', archived: false, createdAt: now } },
        commitments: {
          'cm-1': { id: 'cm-1', courseId: 'c-mth', type: 'assignment', title: 'Problem set 7', dueAt: today + 'T17:00', weight: 10, estimatedMinutes: 120, loggedMinutes: 0, status: 'open', pinned: false, dependencies: [], createdAt: now },
        },
        blocks: {
          'b-1': { id: 'b-1', commitmentId: 'cm-1', plannedDate: today, plannedStart: '18:00', plannedMinutes: 45, state: 'planned', phase: 'work', label: 'work', reasons: ['due soon'], score: 80, deferCount: 0, order: 0, createdAt: now },
        },
        links: {}, reviews: {}, dismissed: {},
        settings: { timerBaseUrl: '/apps/timer', inkBaseUrl: '/apps/ink', modularBaseUrl: '', flashcardsBaseUrl: '/apps/flashcards', gradestackBaseUrl: '/apps/gradestack', studyWindowStart: '15:00', maxBlockMinutes: 90, defaultAvailableMinutes: 120, weekStartsOn: 1, motion: 'full' },
      },
    }));
    // rhythm register: a daily routine (no course)
    localStorage.setItem('rhythm.register.v1', JSON.stringify({
      version: 2,
      state: {
        routines: { 'r-1': { id: 'r-1', name: 'Evening drill', measure: 'check', target: { perWeek: 7 }, weekdays: [], accent: 'indigo', status: 'active', createdAt: now } },
        entries: {}, events: {}, mappings: {}, exceptions: {}, friction: {}, reviews: {}, experiments: {},
        courses: {},
        settings: { weekStartsOn: 1, motion: 'full' },
        onboardingSeen: true,
      },
    }));
    // flashcards: a deck tagged to MTH
    localStorage.setItem('cardfile.decks.v1', JSON.stringify({
      'deck-1': { id: 'deck-1', title: 'MTH — limits', course: 'MTH', cards: [
        { id: 'k1', q: 'lim x→0 sin x / x', a: '1', status: 'new' },
        { id: 'k2', q: "d/dx ln x", a: '1/x', status: 'new' },
      ], lastStudiedAt: null },
    }));
    // timer sessions: a couple logged today
    localStorage.setItem('timer.sessions.v1', JSON.stringify([
      { id: 's-1', type: 'focus', duration: 1500, timestamp: Date.now() - 3600e3, label: 'MTH — Problem set 7' },
    ]));
    // ink note
    localStorage.setItem('ink-notes-storage', JSON.stringify({
      version: 4,
      state: { notes: [{ id: 'n-1', title: 'Limits scratch', content: '', wordCount: 40, lastModified: Date.now(), createdAt: Date.now(), folder: null, trashedAt: null }], folders: [], drafts: {}, activeNoteId: 'n-1', prefs: {} },
    }));
  }, { today, now });

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1800);

  const shot = (n) => page.screenshot({ path: `/tmp/iterra-${n}.png` });
  const info = async () => await page.evaluate(() => ({
    hash: location.hash,
    frames: [...document.querySelectorAll('iframe')].map((f) => ({ src: f.src, vis: f.offsetParent !== null })),
    rail: document.body.innerText.slice(0, 2500),
  }));

  // HOME
  console.log('═══ HOME');
  console.log((await info()).rail);
  await shot('1-home');

  // palette
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(700);
  await shot('2-palette');
  const palText = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  console.log('═══ PALETTE\n' + palText);
  await page.keyboard.press('Escape');

  // syllabus place (mount)
  await page.evaluate(() => { location.hash = '/p/syllabus'; });
  await page.waitForTimeout(4000);
  await shot('3-syllabus');
  const sylFrame = page.frames().find((f) => f.url().includes('/apps/syllabus/'));
  console.log('═══ SYLLABUS frame:', sylFrame ? sylFrame.url() : 'NONE');
  if (sylFrame) console.log((await sylFrame.evaluate(() => document.body.innerText.slice(0, 1200))).slice(0, 1200));

  // dossier for MTH
  await page.evaluate(() => { location.hash = '/c/MTH'; });
  await page.waitForTimeout(1500);
  await shot('4-dossier-mth');
  console.log('═══ DOSSIER MTH\n' + (await info()).rail.slice(0, 1800));

  // rhythm — its course picker is separate?
  await page.evaluate(() => { location.hash = '/p/rhythm'; });
  await page.waitForTimeout(4000);
  const rFrame = page.frames().find((f) => f.url().includes('/apps/rhythm/'));
  console.log('═══ RHYTHM frame:', rFrame ? rFrame.url() : 'NONE');
  if (rFrame) {
    console.log((await rFrame.evaluate(() => document.body.innerText.slice(0, 900))));
    // does the routine have a course picker populated from syllabus?
    const hasCourse = await rFrame.evaluate(() => document.body.innerText.includes('MTH'));
    console.log('rhythm sees MTH anywhere?', hasCourse);
  }
  await shot('5-rhythm');

  // localStorage dump for audit
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  console.log('═══ LS KEYS:', JSON.stringify(keys));

  fs.writeFileSync('/tmp/probe1-done', 'ok');
  await browser.close();
})().catch((e) => { console.log('FATAL', e); process.exit(1); });
