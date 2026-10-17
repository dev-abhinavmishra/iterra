/* verify-demo.cjs — headless check of the sample-semester seed/remove cycle.
   Usage: node scripts/verify-demo.cjs [baseUrl] */
const { chromium } = require('playwright-core');

const BASE = process.argv[2] || 'http://localhost:5173';
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

  /* ── intake deliveries: poll the stores — adapter registration, drain,
     handler, and persist are all async and stretch to tens of seconds on
     a loaded disk. On failure, dump the pending queue so 'never drained'
     vs 'drained but not persisted' is distinguishable. ── */
  const dumpIntakes = async () => {
    const ls = await page.evaluate(() => {
      try { return Object.keys(JSON.parse(localStorage.getItem('iterra.v1.store.intakes') || '{}')); }
      catch { return []; }
    });
    const idb = await page.evaluate(() => new Promise((res) => {
      try {
        const req = indexedDB.open('iterra');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('intakes')) { db.close(); res([]); return; }
          const r = db.transaction('intakes', 'readonly').objectStore('intakes').getAll();
          r.onsuccess = () => { db.close(); res(r.result.map((x) => `${x.id}:${x.status || '?'}`)); };
          r.onerror = () => { db.close(); res(['ERR']); };
        };
        req.onerror = () => res(['ERR open']);
      } catch (e) { res(['ERR ' + e]); }
    }));
    return JSON.stringify({ ls, idb });
  };

  /* poll until `probe()` satisfies `pred`, visiting `place` first so the
     adapter mounts + drains. The ?intake= mount path navigates the frame
     to the delivered result.url mid-drain — an evaluate that races it
     throws 'execution context destroyed'; retry rather than die. */
  const safeEval = async (probe) => {
    try { return await page.evaluate(probe); }
    catch (e) {
      if (/context|navigat/i.test(String(e))) { await page.waitForTimeout(600); return undefined; }
      throw e;
    }
  };
  const pollDelivered = async (place, probe, pred, tries = 30, gap = 1000) => {
    await page.goto(`${BASE}/#/p/${place}`, { waitUntil: 'load' });
    let last;
    for (let i = 0; i < tries; i++) {
      const v = await safeEval(probe);
      if (v !== undefined) {
        last = v;
        if (pred(v)) return { ok: true, v };
      }
      await page.waitForTimeout(gap);
    }
    return { ok: false, v: last };
  };

  const inkRes = await pollDelivered('ink',
    () => {
      try {
        const s = JSON.parse(localStorage.getItem('ink-notes-storage') || '{}');
        return (s.state?.notes || []).map((n) => n.id + '|' + n.title);
      } catch (e) { return ['ERR ' + e]; }
    },
    (v) => v.some((n) => n.includes('intake-in-demo-')));
  if (!inkRes.ok) {
    fail('ink missing intake-delivered notes: ' + JSON.stringify(inkRes.v) + ' pending=' + (await dumpIntakes()));
  } else ok('ink drained the demo intake → ' + inkRes.v.filter((n) => n.includes('demo')).join(', '));

  const marginProbe = () => new Promise((res) => {
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
  });
  const marginRes = await pollDelivered('margin', marginProbe,
    (v) => v.some((k) => String(k).includes('intake-in-demo-')), 35);
  if (!marginRes.ok) {
    fail('margin missing intake note: ' + JSON.stringify(marginRes.v) + ' pending=' + (await dumpIntakes()));
  } else ok('margin drained the demo intake → ' + marginRes.v.filter((k) => String(k).includes('demo')).join(','));

  const proofRes = await pollDelivered('proof',
    () => {
      try {
        const s = JSON.parse(localStorage.getItem('proof.workbench.v1') || '{}');
        return Object.keys(s.state?.problems || {});
      } catch (e) { return ['ERR ' + e]; }
    },
    (v) => v.some((k) => String(k).startsWith('p_in-demo-')), 35);
  if (!proofRes.ok) {
    fail('proof missing intake problem: ' + JSON.stringify(proofRes.v) + ' pending=' + (await dumpIntakes()));
  } else ok('proof drained the demo intake → ' + proofRes.v.filter((k) => k.includes('demo')).join(','));

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
  if (proofRes.ok && (!proofCourse.courseId || !proofCourse.courseId.startsWith('syllabus:course:'))) {
    fail('proof problem not bound to a canonical course: ' + JSON.stringify(proofCourse));
  } else if (proofRes.ok && proofCourse.code !== 'STAT 220') {
    fail('proof registry missing the canonical course mirror: ' + JSON.stringify(proofCourse));
  } else if (proofRes.ok) ok('proof resolved the canonical course → ' + proofCourse.code + ' (' + proofCourse.courseId + ')');

  /* ── rhythm register: routine.plan intake + Today's inline check-in ── */
  const rhythmRes = await pollDelivered('rhythm',
    () => {
      try {
        const s = JSON.parse(localStorage.getItem('rhythm.register.v1') || '{}');
        return { routines: Object.keys(s.state?.routines || {}), courses: Object.keys(s.state?.courses || {}) };
      } catch (e) { return { err: String(e) }; }
    },
    (v) => v.routines?.some?.((k) => String(k).startsWith('rtn_in-demo-')), 30);
  if (!rhythmRes.ok) {
    fail('rhythm missing intake routine: ' + JSON.stringify(rhythmRes.v) + ' pending=' + (await dumpIntakes()));
  } else ok('rhythm drained the demo intake → ' + rhythmRes.v.routines.filter((k) => k.includes('demo')).join(','));

  /* ── gradestack — seeded gradebook rows sit in the zustand blob ── */
  const gsRes = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('gradestack-storage') || '{}');
      return {
        tests: (s.state?.tests || []).map((t) => t.id),
        scans: (s.state?.scans || []).map((x) => `${x.id}:${x.grade}`),
      };
    } catch (e) { return { err: String(e) }; }
  });
  if (!gsRes.tests?.some((id) => String(id).startsWith('demo-')) || !gsRes.scans?.some((id) => String(id).startsWith('demo-')))
    fail('gradestack missing demo rows: ' + JSON.stringify(gsRes));
  else ok('gradestack seeded → ' + gsRes.scans.filter((id) => String(id).startsWith('demo-')).join(', '));

  /* Today lists the routine; clicking 'Log routine' marks inline. Poll —
     the entity publish + presence summary lag a few seconds on slow disks. */
  await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
  const logBtn = page.getByRole('button', { name: 'Log routine' }).first();
  let btnFound = false;
  for (let i = 0; i < 30; i++) {
    if (await logBtn.count()) { btnFound = true; break; }
    await page.waitForTimeout(700);
  }
  if (!btnFound) {
    /* diagnose WHICH gate failed — presence pending, the course-matched
       routine entity, or just label drift. innerText on this page mixes
       hidden keep-alive subtrees and is useless as a signal. */
    const diag = await page.evaluate(async () => {
      const out = { presence: null, register: null, routineEnts: [], idxRoutine: [] };
      try {
        const pres = JSON.parse(localStorage.getItem('iterra.v1.apps') || '{}');
        out.presence = pres.rhythm?.summary ?? Object.keys(pres);
      } catch (e) { out.presence = String(e); }
      try {
        const shared = JSON.parse(localStorage.getItem('iterra.v1.doc.shared') || '{}');
        out.register = shared.register?.v ?? null;
      } catch (e) { out.register = String(e); }
      try {
        const idx = JSON.parse(localStorage.getItem('iterra.v1.doc.index.rhythm') || 'null');
        const list = idx?.entities || idx?.v?.entities || [];
        out.idxRoutine = list.map((e) => `${e.t || e.type}:${e.course || '-'}`);
      } catch (e) { out.idxRoutine = String(e); }
      try {
        out.routineEnts = await new Promise((res) => {
          const rq = indexedDB.open('iterra.core.v1');
          rq.onerror = () => res('idb-open-fail');
          rq.onsuccess = () => {
            try {
              const tx = rq.result.transaction('entities', 'readonly');
              const all = tx.objectStore('entities').getAll();
              all.onsuccess = () => res((all.result || [])
                .filter((v) => v?.app === 'rhythm')
                .map((v) => `${v.key} t=${v.type} c=${v.course || '-'}`));
              all.onerror = () => res('idb-read-fail');
            } catch (e) { res(String(e)); }
          };
        });
      } catch (e) { out.routineEnts = String(e); }
      return out;
    }).catch((e) => ({ evalErr: String(e) }));
    fail('Today shows no Log routine row: ' + JSON.stringify(diag));
  } else {
    await logBtn.click();
    let checked = 0;
    for (let i = 0; i < 20; i++) {
      checked = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('rhythm.register.v1') || '{}');
        const entries = Object.values(s.state?.entries || {});
        return entries.filter((e) => String(e.routineId || '').startsWith('rtn_in-demo-')).length;
      });
      if (checked >= 1) break;
      await page.waitForTimeout(500);
    }
    if (checked < 1) fail('inline Log routine wrote no entry');
    else ok("Today's inline check-in landed on the register");
  }

  /* ── block.done — stamp a seeded slip through the real intake queue.
       The primary card's 'Mark done' only renders when that card is a
       block (a commitment can outrank it), so send the same payload the
       button sends — the button is a thin caller, this is the contract.
       Poll the folio: syllabus may be cold and the send can queue. ── */
  await safeEval(() => window.iterra?.send?.({
    to: 'syllabus', action: 'block.done',
    entity: { app: 'syllabus', type: 'block', id: 'demo-blk-stat', key: 'syllabus:block:demo-blk-stat', title: 'Problem set 6 — regression inference' },
    payload: { blockId: 'demo-blk-stat' },
  }));
  let stamped = false;
  for (let i = 0; i < 35; i++) {
    const states = await safeEval(() => {
      try {
        const s = JSON.parse(localStorage.getItem('syllabus.folio.v1') || '{}');
        return Object.values(s.state?.blocks || {})
          .filter((b) => String(b.id).startsWith('demo-blk-'))
          .map((b) => b.id + ':' + b.state);
      } catch { return []; }
    });
    if (states?.some?.((st) => st.endsWith(':done'))) { stamped = true; break; }
    await page.waitForTimeout(800);
  }
  if (!stamped) fail('block.done never stamped a demo slip — pending=' + (await dumpIntakes()));
  else ok('block.done stamped a slip through the intake queue');

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

  const regAfter = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('rhythm.register.v1') || '{}');
      return {
        routines: Object.keys(s.state?.routines || {}),
        courses: Object.keys(s.state?.courses || {}),
        entries: Object.values(s.state?.entries || {}).map((e) => String(e.routineId || e.id || '')),
      };
    } catch { return { routines: [], courses: [], entries: [] }; }
  });
  if (regAfter.routines.some((k) => String(k).includes('demo')) || regAfter.courses.some((k) => String(k).includes('demo')) || regAfter.entries.some((k) => String(k).includes('demo'))) {
    fail('rhythm still has demo rows: ' + JSON.stringify(regAfter));
  } else ok('rhythm clean');

  const gsAfter = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('gradestack-storage') || '{}');
      return {
        tests: (s.state?.tests || []).map((t) => t.id),
        scans: (s.state?.scans || []).map((x) => x.id),
      };
    } catch { return { tests: [], scans: [] }; }
  });
  if (gsAfter.tests.some((k) => String(k).includes('demo')) || gsAfter.scans.some((k) => String(k).includes('demo')))
    fail('gradestack still has demo rows: ' + JSON.stringify(gsAfter));
  else ok('gradestack clean');

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
