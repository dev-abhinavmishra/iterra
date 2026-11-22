/* intake matrix — every documented send-to action (docs/ADAPTER.md),
   fired from the terrain's store API, then verified against the target's
   REAL state: canonical entities, the app's own persist keys, or its DOM.

   Delivery semantics (post-fix):
   - delivered:'direct' → r.url is the entity's deep link; the sender
     navigates the frame there (canonical: iterra:open postMessage).
   - delivered:'queued' → r.url is /apps/<to>/?intake=<id>; the shell
     mounts the cold place AT that url (pending-aware), the boot drain
     claims the record and lands on its result.url. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const EXE = [
  'C:/Users/pmsma/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!EXE) throw new Error('No Chromium-family browser found');

/* Run against ITERRA_BASE (default :8090). Prefer a spare port serving the
   same dist — a different origin gets a fresh IDB/localStorage, so matrix
   entities never pollute the store you actually browse. */
const BASE = process.env.ITERRA_BASE || 'http://localhost:8090';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('page: ' + e.message));
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const send = (opts) => page.evaluate(async (o) => {
    try { return await window.iterra.send(o); } catch (e) { return { ok: false, error: String(e) }; }
  }, opts);
  // Integrated places render in the shell document, not separate frames.
  const frameOf = () => page;
  const bodyOf = async (fr) => { try { return await fr.locator('.it-workspace-mode > .frame-fade:visible').innerText(); } catch { return ''; } };
  const ls = (k) => page.evaluate((key) => localStorage.getItem(key), k);
  const storeList = (q) => page.evaluate(async (query) => {
    try { return await window.iterra.store.list(query); } catch { return []; }
  }, q);
  const pending = (app) => page.evaluate(async (a) => {
    try { return (await window.iterra.intakes.pending(a)).length; } catch { return -1; }
  }, app);

  /* the canonical sender-side navigation for a send result: queued →
     hash-enter the place (shell mounts ?intake=); direct → iterra:open
     the frame to result.url. */
  const honor = async (app, r, waitMs = 4000) => {
    if (r.delivered === 'direct' && r.url && r.url.includes('?')) {
      await page.evaluate((u) => window.postMessage({ type: 'iterra:open', url: u }, location.origin), r.url);
    } else {
      await page.evaluate((a) => { location.hash = `/p/${a}`; }, app);
    }
    await page.waitForTimeout(waitMs);
    return frameOf(app);
  };

  /* seed a term+course into the folio on a virgin origin so course-bound
     sends (block.plan) can resolve — skipped whenever real data exists.
     Must land before the syllabus frame first mounts (it hydrates at
     module load, and every earlier leg targets other apps). */
  await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('syllabus.folio.v1');
      const doc = raw ? JSON.parse(raw) : {};
      const st = doc.state || (doc.state = {});
      if (Object.keys(st.courses || {}).length) return;
      const at = new Date().toISOString();
      st.terms = { ...(st.terms || {}), t_matrix: { id: 't_matrix', name: 'Matrix Term', startDate: '2025-01-01', endDate: '2026-12-31', timezone: 'UTC', createdAt: at } };
      st.activeTermId = 't_matrix';
      st.courses = { ...(st.courses || {}), c_matrix: { id: 'c_matrix', termId: 't_matrix', name: 'Matrix Math', code: 'MTH', color: 'teal', archived: false, createdAt: at } };
      localStorage.setItem('syllabus.folio.v1', JSON.stringify(doc));
    } catch {}
  });

  const RUN = 'mx' + Date.now().toString(36);
  const results = [];
  const row = (name, ok, detail) => results.push([name, !!ok, detail]);
  const fmt = (r) => `ok=${r.ok} delivered=${r.delivered || '-'} url=${(r.url || '').slice(0, 64)}`;
  /* poll a condition — a first drain may throw→release→redrain (+4s) when
     the boot drain races store hydration; delivery can legitimately land
     ~5-9s after the send. */
  const until = async (fn, ms = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await fn()) return true;
      await page.waitForTimeout(700);
    }
    return false;
  };

  /* ── timer chain: start → pause → resume → finish ─────────────── */
  let r = await send({ to: 'timer', action: 'timer.start', payload: { label: `mdrill-`+RUN, minutes: 5, course: 'MTH' } });
  let fr = await honor('timer', r, 6000);
  let body = fr ? await bodyOf(fr) : '';
  let live = new RegExp('mdrill-'+RUN,'i').test(body) && /elapsed|running|paused|remaining|finish/i.test(body);
  for (let i = 0; i < 6 && !live; i++) { await page.waitForTimeout(1000); body = fr ? await bodyOf(fr) : ''; live = new RegExp('mdrill-'+RUN,'i').test(body) && /elapsed|running|paused|remaining|finish/i.test(body); }
  row('timer.start', r.ok && live, fmt(r) + ` | label=${new RegExp('mdrill-'+RUN,'i').test(body)} state=${/elapsed|running|paused/i.test(body)}`);

  r = await send({ to: 'timer', action: 'timer.control', payload: { op: 'pause' } });
  await page.waitForTimeout(2000);
  let shared = JSON.parse((await ls('iterra.v1.doc.shared')) || '{}');
  row('timer.control pause', r.ok && shared.focus?.v?.paused === true, fmt(r) + ` | paused=${shared.focus?.v?.paused}`);

  r = await send({ to: 'timer', action: 'timer.control', payload: { op: 'resume' } });
  await page.waitForTimeout(2000);
  shared = JSON.parse((await ls('iterra.v1.doc.shared')) || '{}');
  row('timer.control resume', r.ok && shared.focus?.v?.running === true, fmt(r) + ` | running=${shared.focus?.v?.running}`);

  r = await send({ to: 'timer', action: 'timer.control', payload: { op: 'finish' } });
  await page.waitForTimeout(3000);
  shared = JSON.parse((await ls('iterra.v1.doc.shared')) || '{}');
  /* finishEarly clears the focus field; a sub-minute session logs nothing
     by design — the contract is 'control applied, field cleared'. */
  row('timer.control finish', r.ok && shared.focus?.v === null, fmt(r) + ` | focus.v=${JSON.stringify(shared.focus?.v)}`);

  /* ── cards.create → real deck in the cardfile ─────────────────── */
  const decksBefore = (await ls('cardfile.decks.v1')) || '';
  r = await send({ to: 'flashcards', action: 'cards.create', payload: { cards: [{ q: `mq1-`+RUN, a: `ma1-`+RUN }, { q: `mq2-`+RUN, a: `ma2-`+RUN }], deckTitle: `mdeck-`+RUN, course: 'MTH' } });
  fr = await honor('flashcards', r, 4500);
  const deckMade = !decksBefore.includes(`mdeck-`+RUN) && await until(async () => ((await ls('cardfile.decks.v1')) || '').includes(`mdeck-`+RUN));
  row('cards.create', r.ok && deckMade, fmt(r) + ` | deck=${deckMade}`);

  /* ── problem.retest → retest card in the cardfile ─────────────── */
  r = await send({ to: 'flashcards', action: 'problem.retest', entity: { app: 'proof', type: 'attempt', id: 'matrix-att1', title: `mretest-`+RUN, course: 'MTH' }, payload: { deckTitle: `mretest-`+RUN, cards: [{ q: `mretq-`+RUN, a: `mreta-`+RUN }] } });
  await page.waitForTimeout(2500);
  const decks2 = (await ls('cardfile.decks.v1')) || '';
  row('problem.retest→flashcards', r.ok && new RegExp('mretest-|mretq-|mreta-','i').test(decks2), fmt(r) + ` | hit=${new RegExp('mretest-|mretq-|mreta-','i').test(decks2)}`);

  /* ── note.create → ink page ───────────────────────────────────── */
  const inkBefore = (await ls('ink-notes-storage')) || '';
  r = await send({ to: 'ink', action: 'note.create', entity: { app: 'syllabus', type: 'block', id: 'matrix-b1', title: `mink-`+RUN, course: 'MTH' } });
  fr = await honor('ink', r, 5000);
  const inkMade = !inkBefore.includes(`mink-`+RUN) && await until(async () => ((await ls('ink-notes-storage')) || '').includes(`mink-`+RUN));
  row('note.create→ink', r.ok && inkMade, fmt(r) + ` | note=${inkMade}`);

  /* ── note.create → margin note ────────────────────────────────── */
  const mIdxBefore = await page.evaluate(() => localStorage.getItem('iterra.v1.doc.index.margin') || '');
  r = await send({ to: 'margin', action: 'note.create', entity: { app: 'syllabus', type: 'block', id: 'matrix-b2', title: `mmargin-`+RUN, course: 'MTH' } });
  fr = await honor('margin', r, 6000);
  const marginMade = !mIdxBefore.includes(`mmargin-`+RUN) && await until(async () => {
    const idx = await page.evaluate(() => localStorage.getItem('iterra.v1.doc.index.margin') || '');
    if (idx.includes(`mmargin-`+RUN)) return true;
    const f = frameOf('margin');
    return f ? new RegExp('mmargin-'+RUN,'i').test(await bodyOf(f)) : false;
  });
  row('note.create→margin', r.ok && marginMade, fmt(r) + ` | hit=${marginMade}`);

  /* ── problem.create → a real problem on the workbench ─────────── */
  /* the workbench's own persist is ground truth — the canonical mirror
     republishes on a lag. */
  const wb = () => ls('proof.workbench.v1').then((x) => (x || '').includes('mprob-' + RUN));
  r = await send({ to: 'proof', action: 'problem.create', payload: { topic: 'integrals', prompt: `mprob-`+RUN, course: 'MTH', difficulty: 2 } });
  fr = await honor('proof', r, 5000);
  const probMade = await until(wb);
  row('problem.create', r.ok && probMade, fmt(r) + ` | in-workbench=${probMade}`);

  /* ── step.append → live open attempt contains the canonical note ref ── */
  const attemptId = await page.evaluate(run => {
    const s = window.__proofWorkbenchStore;
    const p = Object.values(s?.getState?.().problems || {}).find(x => JSON.stringify(x.promptDoc).includes(`mprob-${run}`));
    return p ? s.getState().startAttempt(p.id).id : null;
  }, RUN);
  const sourceNote = (await storeList({ app: 'ink', type: 'note' })).find(e => e.title?.includes(`mink-${RUN}`));
  r = attemptId && sourceNote
    ? await send({ to: 'proof', action: 'step.append', entity: { app: 'ink', type: 'note', id: sourceNote.id, key: sourceNote.key, title: sourceNote.title } })
    : { ok: false, error: `missing open-attempt fixture: attempt=${attemptId}, note=${!!sourceNote}` };
  const stepAdded = await until(() => page.evaluate(({ attemptId, key }) => {
    const a = window.__proofWorkbenchStore?.getState?.().attempts?.[attemptId];
    return !!a?.work?.some(w => w.text.includes(key));
  }, { attemptId, key: sourceNote?.key || '' }));
  row('step.append', !!attemptId && !!sourceNote && r.ok && stepAdded, fmt(r) + ` | attempt=${attemptId || '-'} note=${sourceNote?.key || '-'} appended=${stepAdded}`);

  /* ── routine.plan → real routine on the register ──────────────── */
  const regBefore = (await ls('rhythm.register.v1')) || '';
  r = await send({ to: 'rhythm', action: 'routine.plan', payload: { name: `mroutine-`+RUN, course: 'MTH', minutes: 30 } });
  fr = await honor('rhythm', r, 5000);
  const routMade = !regBefore.includes(`mroutine-`+RUN) && await until(async () => ((await ls('rhythm.register.v1')) || '').includes(`mroutine-`+RUN));
  row('routine.plan', r.ok && routMade, fmt(r) + ` | hit=${routMade}`);

  /* ── log.activity → a register event on today (type+duration land;
     the event record carries no free-text label by design) ────────── */
  const regBefore2 = (await ls('rhythm.register.v1')) || '';
  const evCountBefore = (regBefore2.match(/"evt_hub_/g) || []).length;
  r = await send({ to: 'rhythm', action: 'log.activity', payload: { kind: 'focus', minutes: 15, course: 'MTH', label: `mlog-`+RUN } });
  await page.waitForTimeout(2500);
  const regNow2 = (await ls('rhythm.register.v1')) || '';
  const evCountNow = (regNow2.match(/"evt_hub_/g) || []).length;
  row('log.activity', r.ok && evCountNow > evCountBefore, fmt(r) + ` | events ${evCountBefore}→${evCountNow}`);

  /* ── event.intake → the legacy ?event deep link still delivers ────
     (a URL contract, not a send action — normalizeEvent needs
     {id,type,occurredAt}) */
  const evPayload = Buffer.from(JSON.stringify({ id: `mevt-`+RUN, type: 'timer.session', sourceApp: 'timer', occurredAt: new Date().toISOString(), durationSeconds: 720 })).toString('base64url');
  await page.evaluate((u) => window.postMessage({ type: 'iterra:open', url: u }, location.origin), `/apps/rhythm/?event=${evPayload}`);
  await page.waitForTimeout(4500);
  const regNow3 = (await ls('rhythm.register.v1')) || '';
  row('event.intake (?event link)', regNow3.includes(`mevt-`+RUN), `legacy ?event deep link | hit=${regNow3.includes(`mevt-`+RUN)}`);

  /* ── block.plan → a slip filed on the folio ───────────────────── */
  const folioBefore = (await ls('syllabus.folio.v1')) || '';
  r = await send({ to: 'syllabus', action: 'block.plan', payload: { title: `mslip-`+RUN, course: 'MTH', minutes: 20 } });
  fr = await honor('syllabus', r, 5000);
  const slipMade = !folioBefore.includes(`mslip-`+RUN) && await until(async () => ((await ls('syllabus.folio.v1')) || '').includes(`mslip-`+RUN));
  row('block.plan', r.ok && slipMade, fmt(r) + ` | hit=${slipMade}`);

  /* ── weights.import → saved syllabus weight reaches a saved assessment ── */
  const course = await page.evaluate(async () => {
    try { return await window.iterra.courses.resolve({ course: 'MTH' }); } catch { return null; }
  });
  const weightedCommitment = course?.id && await page.evaluate(({ courseId, title }) => {
    const s = window.__syllabusFolioStore?.getState?.();
    return s?.addCommitment({ courseId, type: 'exam', title, dueAt: '2999-12-01T23:59:00.000Z', weight: 55, estimatedMinutes: 45, pinned: false, dependencies: [] }) || null;
  }, { courseId: course.id, title: `mweight-${RUN}` });
  await page.evaluate(() => window.postMessage({ type: 'iterra:open', url: '/apps/gradestack/' }, location.origin));
  const gradeStoreReady = await until(() => page.evaluate(() => !!window.__gradestackStore?.getState));
  const test = course && await page.evaluate(async run => {
    const s = window.__gradestackStore?.getState?.();
    return s ? s.addTest({ name: `mtest-${run}`, courseName: 'MTH', numQuestions: 1, format: 'SA', includeStudentId: false, answerKey: {} }) : null;
  }, RUN);
  const categoriesReady = !!course?.key && await until(async () => {
    const e = await page.evaluate(key => window.iterra.store.get(key), course.key);
    return e?.data?.categories?.exam === 55;
  });
  r = categoriesReady && gradeStoreReady && test
    ? await send({ to: 'gradestack', action: 'weights.import', payload: { courseId: course.key } })
    : { ok: false, error: `missing saved weighted course/test: categories=${categoriesReady}, gradeStore=${gradeStoreReady}, test=${!!test}` };
  fr = await honor('gradestack', r, 5000);
  const appliedWeights = await until(() => page.evaluate(id => {
    const t = window.__gradestackStore?.getState?.().tests?.find(x => x.id === id);
    return t?.weights?.exam === 55;
  }, test?.id || ''));
  row('weights.import', categoriesReady && gradeStoreReady && !!test && r.ok && appliedWeights,
    fmt(r) + ` | course=${course?.key || '-'} test=${test?.id || '-'} categoriesReady=${categoriesReady} storeReady=${gradeStoreReady} applied=${appliedWeights}${r.error ? ` error=${r.error}` : ''}`);

  /* ── study-plan.request → due-card signal creates a bound review block ── */
  const dueCardId = `mdue-${RUN}`;
  const dueCardWrite = course?.key && await page.evaluate(async ({ id, courseId }) => window.iterra.store.put({
    app: 'flashcards', type: 'card', id, courseId, course: 'MTH', title: `due-${id}`,
    data: { dueAt: '2000-01-01T00:00:00.000Z' },
  }), { id: dueCardId, courseId: course.key });
  const dueCardReady = !!dueCardWrite?.ok && !!(await page.evaluate(id => window.iterra.store.get(`flashcards:card:${id}`), dueCardId));
  const scopedBlocks = () => storeList({ app: 'syllabus', type: 'block', courseId: course?.key });
  const blocksBefore = (await scopedBlocks()).length;
  r = dueCardReady && weightedCommitment
    ? await send({ to: 'syllabus', action: 'study-plan.request', payload: { courseId: course.key } })
    : { ok: false, error: `missing due card/anchor fixture: card=${dueCardReady}, anchor=${!!weightedCommitment}` };
  fr = await honor('syllabus', r, 5000);
  let plannedBlock = null;
  const blockCreated = await until(async () => {
    plannedBlock = (await scopedBlocks()).find(e => e.title === 'review due cards' && e.data?.commitmentId === weightedCommitment?.id);
    return !!plannedBlock;
  });
  row('study-plan.request', dueCardReady && !!weightedCommitment && r.ok && !!r.delivered && blockCreated && !!fr,
    fmt(r) + ` | dueCard=${dueCardReady} block=${plannedBlock?.key || '-'} anchor=${plannedBlock?.data?.commitmentId || '-'} expected=${weightedCommitment?.id || '-'} before=${blocksBefore}`);

  /* ── nothing left queued anywhere ─────────────────────────────── */
  let pendingTotal = 0;
  for (const a of ['timer', 'flashcards', 'ink', 'margin', 'proof', 'rhythm', 'syllabus', 'gradestack']) pendingTotal += await pending(a);
  row('all intakes delivered', pendingTotal === 0, `pending=${pendingTotal}`);

  console.log('\n═══ INTAKE MATRIX ═══');
  let fails = 0;
  for (const [name, ok, detail] of results) {
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} ${detail}`);
  }
  if (errs.length) fails++;
  console.log(`\n${results.length - fails}/${results.length} pass · errs: ${errs.slice(0, 8).join(' | ') || 'none'}`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
