/* verify-demo.cjs — headless check of the sample-semester seed/remove cycle.
   Usage: node scripts/verify-demo.cjs [baseUrl] */
const { chromium } = require('playwright-core');

const BASE = process.argv[2] || 'http://localhost:5455';
const fs = require('fs');
const EXE = [
  'C:/Users/pmsma/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!EXE) { console.log('FAIL: no chromium-family browser found'); process.exit(1); }

const fail = (msg) => { console.log('FAIL:', msg); process.exitCode = 1; };
const ok = (msg) => console.log('  ok:', msg);

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  /* ── seed via the real UI ── */
  await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
  await page.getByText('Load a sample semester', { exact: false }).first().click();
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.waitForLoadState('load');           // reload lands here
  await page.waitForTimeout(1500);               // settle: hydration + any trailing nav
  ok('seeded + reloaded');

  /* ── courses index ── */
  await page.goto(`${BASE}/#/courses`, { waitUntil: 'load' });
  const coursesTxt = await page.evaluate(() => document.body.innerText);
  for (const needle of ['BIO 201', 'ENGL 210', 'STAT 220']) {
    if (!coursesTxt.includes(needle)) fail(`courses index missing ${needle}`);
  }
  ok('courses index shows all three courses');

  /* ── syllabus hydrates the folio ── */
  await page.goto(`${BASE}/#/p/syllabus`, { waitUntil: 'load' });
  await page.waitForTimeout(4500);
  const folioTxt = await page.evaluate(() => document.body.innerText);
  const folioHits = ['BIO 201', 'respiration', 'Gatsby', 'enzyme', 'Midterm', 'regression'];
  const folioFound = folioHits.filter((n) => folioTxt.includes(n));
  console.log('  folio found:', JSON.stringify(folioFound), '| len', folioTxt.length);
  if (folioFound.length < 2) fail(`syllabus folio barely shows seed (${folioFound.length}/${folioHits.length}): ${folioTxt.slice(0, 300)}`);
  else ok('syllabus renders seeded courses/commitments/blocks');

  /* ── flashcards decks ── */
  await page.goto(`${BASE}/#/p/flashcards`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const fcTxt = await page.evaluate(() => document.body.innerText);
  if (!fcTxt.includes('Cellular respiration') && !fcTxt.includes('Literary terms')) {
    fail('flashcards missing seeded decks: ' + fcTxt.slice(0, 200));
  } else ok('flashcards shows seeded decks');

  /* ── intake deliveries: check the stores, not the render timing ── */
  await page.goto(`${BASE}/#/p/ink`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const inkNotes = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('ink-notes-storage') || '{}');
      return (s.state?.notes || []).map((n) => n.id + '|' + n.title);
    } catch (e) { return ['ERR ' + e]; }
  });
  if (!inkNotes.some((n) => n.includes('intake-in-demo-'))) {
    fail('ink missing intake-delivered notes: ' + JSON.stringify(inkNotes));
  } else ok('ink drained the demo intake → ' + inkNotes.filter((n) => n.includes('demo')).join(', '));

  await page.goto(`${BASE}/#/p/margin`, { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  const marginNotes = await page.evaluate(() => new Promise((res) => {
    const req = indexedDB.open('ModularAINotesDB');
    req.onsuccess = () => {
      const db = req.result;
      /* diagnose rather than assume — a renamed/absent store used to read
         as 'NO STORE' with no hint of what the db actually holds */
      const names = Array.from(db.objectStoreNames);
      const store = names.includes('notes') ? 'notes' : names[0];
      if (!store) { db.close(); res(['NO STORES: ' + names.join(',')]); return; }
      try {
        const r = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
        r.onsuccess = () => { db.close(); res(r.result); };
        r.onerror = () => { db.close(); res(['ERR']); };
      } catch (e) { db.close(); res(['NO STORE ' + store + ' (' + names.join(',') + ')']); }
    };
    req.onerror = () => res(['ERR open']);
  }));
  if (!marginNotes.some((k) => String(k).includes('intake-in-demo-'))) {
    fail('margin missing intake note: ' + JSON.stringify(marginNotes));
  } else ok('margin drained the demo intake → ' + marginNotes.filter((k) => String(k).includes('demo')).join(','));

  await page.goto(`${BASE}/#/p/proof`, { waitUntil: 'load' });
  await page.waitForTimeout(7000);
  const proofProblems = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('proof.workbench.v1') || '{}');
      return Object.keys(s.state?.problems || {});
    } catch (e) { return ['ERR ' + e]; }
  });
  if (!proofProblems.some((k) => String(k).startsWith('p_in-demo-'))) {
    fail('proof missing intake problem: ' + JSON.stringify(proofProblems));
  } else ok('proof drained the demo intake → ' + proofProblems.filter((k) => k.includes('demo')).join(','));

  /* the intake binds a CANONICAL course key — proof's local registry must
     mirror it or every course lookup (chip, publish, picker) misses */
  const proofCourse = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('proof.workbench.v1') || '{}');
      const p = Object.values(s.state?.problems || {}).find((x) => String(x.id).startsWith('p_in-demo-'));
      const c = p?.courseId ? s.state?.courses?.[p.courseId] : null;
      return { courseId: p?.courseId || null, code: c?.code || null, keys: Object.keys(s.state?.courses || {}) };
    } catch (e) { return { err: String(e) }; }
  });
  if (!proofCourse.courseId || !proofCourse.courseId.startsWith('syllabus:course:')) {
    fail('proof problem not bound to a canonical course: ' + JSON.stringify(proofCourse));
  } else if (proofCourse.code !== 'STAT 220') {
    fail('proof registry missing the canonical course mirror: ' + JSON.stringify(proofCourse));
  } else ok('proof resolved the canonical course → ' + proofCourse.code + ' (' + proofCourse.courseId + ')');

  /* ── provenance — each delivered object links derivedFrom its seeded
       source commitment (resolvable, clickable in the dossier). Poll:
       proof's drain is the slowest and races a fixed sleep. ── */
  const readLinks = () => page.evaluate(() => new Promise((res) => {
    const req = indexedDB.open('iterra');
    req.onsuccess = () => {
      const db = req.result;
      try {
        const r = db.transaction('links', 'readonly').objectStore('links').getAll();
        r.onsuccess = () => { db.close(); res((r.result || []).map((l) => l.key)); };
        r.onerror = () => { db.close(); res([]); };
      } catch { db.close(); res([]); }
    };
    req.onerror = () => res([]);
  }));
  let demoLinks = [];
  for (let i = 0; i < 30; i++) {
    demoLinks = (await readLinks()).filter((k) => String(k).includes('demo'));
    if (demoLinks.length >= 4) break;
    await page.waitForTimeout(700);
  }
  if (demoLinks.length < 4) fail('expected ≥4 derivedFrom demo links, got ' + JSON.stringify(demoLinks));
  else ok('provenance edges landed → ' + demoLinks.length + ' derivedFrom links to demo commitments');

  /* ── settings shows remove with a row count ── */
  await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const setTxt = await page.evaluate(() => document.body.innerText);
  if (!setTxt.includes('Remove sample data')) fail('settings missing remove row');
  else ok('settings shows remove row: ' + (/(\d+) sample records/.exec(setTxt)?.[0] ?? 'count pending'));

  /* ── remove ── */
  await page.getByText('Remove sample data', { exact: false }).first().click();
  await page.getByRole('button', { name: 'Remove sample data', exact: true }).click();
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  ok('removed + reloaded');

  await page.goto(`${BASE}/#/courses`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const afterCourses = await page.evaluate(() => document.body.innerText);
  if (afterCourses.includes('BIO 201')) fail('courses still show demo data after removal');
  else ok('courses index clean');

  await page.goto(`${BASE}/#/p/ink`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const inkAfter = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('ink-notes-storage') || '{}');
      return (s.state?.notes || []).map((n) => n.id);
    } catch { return []; }
  });
  if (inkAfter.some((id) => String(id).includes('demo'))) fail('ink still has demo note: ' + JSON.stringify(inkAfter));
  else ok('ink clean');

  const marginAfter = await page.evaluate(() => new Promise((res) => {
    const req = indexedDB.open('ModularAINotesDB');
    req.onsuccess = () => {
      const db = req.result;
      try {
        const r = db.transaction('notes', 'readonly').objectStore('notes').getAllKeys();
        r.onsuccess = () => { db.close(); res(r.result); };
        r.onerror = () => { db.close(); res([]); };
      } catch { db.close(); res([]); }
    };
    req.onerror = () => res([]);
  }));
  if (marginAfter.some((k) => String(k).includes('demo'))) fail('margin still has demo note: ' + JSON.stringify(marginAfter));
  else ok('margin clean');

  const proofAfter = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('proof.workbench.v1') || '{}');
      return {
        problems: Object.keys(s.state?.problems || {}),
        courses: Object.keys(s.state?.courses || {}),
      };
    } catch { return { problems: [], courses: [] }; }
  });
  if (proofAfter.problems.some((k) => String(k).includes('demo'))) fail('proof still has demo problem');
  else if (proofAfter.courses.some((k) => String(k).includes('demo'))) fail('proof still has a mirrored demo course: ' + JSON.stringify(proofAfter.courses));
  else ok('proof clean');

  const hubEnts = await page.evaluate(() => window.iterra.store.list().then((r) => r.map((e) => e.key)));
  if (hubEnts.some((k) => String(k).includes('demo'))) fail('hub entities still carry demo rows: ' + JSON.stringify(hubEnts.filter((k) => String(k).includes('demo'))));
  else ok('hub entity store clean');

  const intakesLeft = await page.evaluate(() => new Promise((res) => {
    const req = indexedDB.open('iterra');
    req.onsuccess = () => {
      const db = req.result;
      try {
        const r = db.transaction('intakes', 'readonly').objectStore('intakes').getAllKeys();
        r.onsuccess = () => { db.close(); res(r.result); };
        r.onerror = () => { db.close(); res([]); };
      } catch { db.close(); res([]); }
    };
    req.onerror = () => res([]);
  }));
  if (intakesLeft.some((k) => String(k).includes('demo'))) fail('demo intakes still queued: ' + JSON.stringify(intakesLeft));
  else ok('intake queue clean');

  const linksLeft = await page.evaluate(() => new Promise((res) => {
    const req = indexedDB.open('iterra');
    req.onsuccess = () => {
      const db = req.result;
      try {
        const r = db.transaction('links', 'readonly').objectStore('links').getAllKeys();
        r.onsuccess = () => { db.close(); res(r.result); };
        r.onerror = () => { db.close(); res([]); };
      } catch { db.close(); res([]); }
    };
    req.onerror = () => res([]);
  }));
  if (linksLeft.some((k) => String(k).includes('demo'))) fail('demo links still present: ' + JSON.stringify(linksLeft.filter((k) => String(k).includes('demo'))));
  else ok('link graph clean');

  const flag = await page.evaluate(() => localStorage.getItem('iterra.v1.demo'));
  if (flag) fail('demo flag still set after removal');
  else ok('demo flag cleared');

  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  await browser.close();
  console.log(process.exitCode ? 'DONE — failures above' : 'DONE — all checks passed');
})().catch((e) => { console.log('FATAL', e); process.exit(1); });
