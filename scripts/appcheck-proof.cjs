/* appcheck: proof — clickpath regression probe for the Calculation
   Workbench, driven through the terrain shell (not the bare app URL).

   Covers the full first-use path and the workflow-C contract:
     onboarding → editor → library → attempt → compare → error filing →
     session runner → ledger/progress/import/settings → deep links →
     intakes (problem.create, step.append durable-defer) → commons docs
     (shared.session, index.proof, presence, canonical entities, feed) →
     retest card handoff to flashcards → 390px horizontal overflow.

   BASE selects the deployment under test:
     BASE=http://localhost:8090  → integrated shell (frames)
     BASE=http://localhost:3108  → proof standalone dev server (drives the
                                  same UI in-document; shell-only checks skip)
   CDP overrides the chrome debugging endpoint (default :29304). */

const BASE = process.env.BASE || 'http://localhost:8090';
const CDP = process.env.CDP || 'http://localhost:29304';
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP(CDP);
  const page = await browser.contexts()[0].newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('page: ' + e.message));
  const results = [];
  const row = (name, ok, detail) => results.push([name, ok === 'skip' ? 'skip' : !!ok, detail]);
  const RUN = 'pd' + Date.now().toString(36);
  const until = async (fn, ms = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await fn()) return true;
      await page.waitForTimeout(600);
    }
    return false;
  };

  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);

  /* ── mode detect: shell = an /apps/proof/ frame appears after the hash
        route; otherwise the page IS proof (standalone dev server) ── */
  const hasHub = await page.evaluate(() => typeof window.iterra === 'object' && !!window.iterra?.send);
  await page.evaluate(() => { window.location.hash = '/p/proof'; });
  let app = null; // playwright Frame (shell) or Page (standalone)
  await page.waitForTimeout(2500);
  const frameOf = () => page.frames().find((f) => f.url().includes('/apps/proof/'));
  let shell = !!frameOf();
  if (!shell) {
    // maybe a cold mount needs longer — or the page itself is proof
    const bodyIsProof = await page.evaluate(() => /calculation workbench|PROOF/i.test(document.body.innerText || ''));
    if (bodyIsProof) { app = page; shell = false; }
    else if (await until(() => !!frameOf(), 8000)) { shell = true; }
  }
  if (shell) app = frameOf();
  row('mounts', !!app, shell ? 'shell frame /apps/proof/' : (app ? 'standalone document' : 'no proof surface'));

  /* inside-app helpers — Frame and Page share evaluate/locator */
  const appText = async () => { try { return await app.evaluate(() => document.body.innerText); } catch { return ''; } };
  const appClickText = (txt, exact = true) => app.evaluate(({ t, ex }) => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      ex ? (x.textContent || '').trim() === t : (x.textContent || '').includes(t));
    if (b && !b.disabled) { b.click(); return true; }
    return false;
  }, { t: txt, ex: exact });
  const wb = () => app.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('proof.workbench.v1') || '{}').state || {}; } catch { return {}; }
  });
  const send = (opts) => page.evaluate(async (o) => {
    try { return await window.iterra.send(o); } catch (e) { return { ok: false, error: String(e) }; }
  }, opts);
  const honor = async (r, waitMs = 5000) => {
    // sender-side navigation contract: direct → iterra:open, else hash-enter
    if (shell && r?.delivered === 'direct' && r.url && r.url.includes('?')) {
      await page.evaluate((u) => window.postMessage({ type: 'iterra:open', url: u }, location.origin), r.url);
    } else if (shell) {
      await page.evaluate(() => { window.location.hash = '/p/proof'; });
    } else if (r?.url) {
      await page.goto(`${BASE}${r.url}`.replace(`${BASE}/apps/proof`, `${BASE}`), { waitUntil: 'load' });
    }
    await page.waitForTimeout(waitMs);
    app = shell ? frameOf() : page;
  };

  /* clean slate — the clickpath is deterministic from an empty bench */
  if (app) {
    await app.evaluate(() => { localStorage.removeItem('proof.workbench.v1'); });
    if (shell) { await page.evaluate(() => { window.location.hash = '/p/proof'; }); }
    await app.evaluate(() => location.reload());
    await page.waitForTimeout(2500);
    if (shell) app = frameOf();
  }

  /* ── 1. onboarding → library (the dead-end trap: the CTA must land) ── */
  let t = await appText();
  const onboard = /File your first problem/i.test(t);
  row('onboarding on empty bench', onboard, onboard ? 'CTA visible' : `body: ${t.slice(0, 90)}`);
  if (onboard) { await appClickText('File your first problem'); await page.waitForTimeout(700); }
  t = await appText();
  row('onboarding CTA lands in library', /new problem|library/i.test(t) && !/File your first problem/i.test(t), t.slice(0, 90));

  /* ── 2. editor: file a problem with $LaTeX$ + exact spec ── */
  await appClickText('New problem'); await page.waitForTimeout(500);
  const editorOpened = await app.evaluate(() => !!document.querySelector('[role="dialog"]'));
  row('editor dialog opens', editorOpened, '');
  await app.locator('label', { hasText: 'Topic' }).locator('input').first().fill(`pdkin-${RUN}`);
  await app.locator('textarea').first().fill(`A ball at $v_0 = 12$ m/s. **Find** the time to the top. ${RUN}`);
  await app.locator('input[placeholder="name the concept, not the method"]').fill('pick the short path');
  await app.locator('textarea').last().fill('At the top $v = 0$, so $t = v_0/g \\approx 1.22$ s.');
  await appClickText('Exact text'); await page.waitForTimeout(300);
  await app.locator('label', { hasText: 'Expected answer' }).locator('input').fill('1.22');
  await appClickText('File problem'); await page.waitForTimeout(700);
  const state = await wb();
  const pid = Object.keys(state.problems || {})[0];
  row('problem files (LaTeX + exact spec)', !!pid && (state.problems[pid].promptDoc || '').includes('v_0'), `pid=${pid}`);

  /* ── 3. canonical entity + index + presence (hub-only) ── */
  if (hasHub && shell) {
    const entOk = await until(async () => {
      const rows = await page.evaluate(() => window.iterra.store.list({ app: 'proof' }));
      return rows.some((e) => e.type === 'problem' && e.id === pid && /v_0|ball/i.test(e.title || ''));
    });
    row('canonical problem entity', entOk, `proof:problem:${pid}`);
    const idx = await page.evaluate(() => window.iterra.doc('index.proof').get());
    row('index.proof publishes the problem', !!idx?.entities?.some((e) => e.id === pid), `entities=${idx?.entities?.length}`);
    const pres = await page.evaluate(() => (window.iterra.apps() || {})['proof']);
    row('presence registered', !!pres, JSON.stringify(pres?.summary || {}));
  } else {
    row('canonical problem entity', 'skip', 'no hub (standalone)');
    row('index.proof publishes the problem', 'skip', 'no hub (standalone)');
    row('presence registered', 'skip', 'no hub (standalone)');
  }

  /* ── 4. attempt → step + answer → submit → compare ── */
  const attBtn = app.locator('button', { hasText: 'Attempt' }).first();
  await attBtn.click(); await page.waitForTimeout(800);
  t = await appText();
  row('attempt desk opens', /the claim|assertion 1 of/i.test(t), t.slice(0, 80));
  const aid = await wb().then((w) => Object.keys(w.attempts || {})[0]);
  await app.locator('textarea').first().fill('Set $v(t) = v_0 - gt$; solve $v = 0$.');
  await app.locator('input[placeholder="exact answer"]').fill('1.22');
  const hintBtn = app.locator('button', { hasText: 'reveal concept cue' });
  if (await hintBtn.count()) { await hintBtn.click(); await page.waitForTimeout(300); }
  await appClickText('Submit for verification'); await page.waitForTimeout(900);
  t = await appText();
  row('submit lands on compare', /verifying the proof/i.test(t), t.slice(0, 80));
  row('exact answer auto-verifies', /verified|auto-checked/i.test(t), '');

  /* ── 5. file the error record → scheduled retry ── */
  const stepSel = app.locator('button', { hasText: /^step 1/ }).first();
  if (await stepSel.count()) await stepSel.click();
  await appClickText('careless execution');
  await app.locator('textarea').first().fill('dropped the units in the last line');
  await app.locator('textarea').nth(1).fill('write the unit beside every line');
  await appClickText('File record + schedule retry'); await page.waitForTimeout(600);
  const st2 = await wb();
  const errsFiled = Object.values(st2.errors || {}).some((e) => e.attemptId === aid);
  const dueNow = Object.values(st2.reviews || {}).filter((r) => r.problemId === pid).length;
  t = await appText();
  row('error record files + retry scheduled', errsFiled && dueNow >= 1 && /record filed/i.test(t), `errors=${Object.keys(st2.errors || {}).length} reviews=${dueNow}`);

  /* ── 6. problem.retest → flashcards card + retest link (needs a live
        flashcards peer — shell mode only; standalone has no cardfile) ── */
  if (shell && hasHub) {
      /* intake delivery needs the target's adapter running — mount
         flashcards so its drain claims the retest send, then come back */
      await page.evaluate(() => { window.location.hash = '/p/flashcards'; });
      await page.waitForTimeout(3500);
      await page.evaluate(() => { window.location.hash = '/p/proof'; });
      await page.waitForTimeout(1500);
    app = frameOf();
    const retOk = await until(async () => {
      const cf = await page.evaluate(() => localStorage.getItem('cardfile.decks.v1') || '');
      /* the retest deck is 'Retest · <this run's topic>' — RUN-scoped so a
         stale deck from an earlier run can't fake a pass */
      if (!cf.includes(RUN)) return false;
      const links = await page.evaluate(async (a) => {
        try { const r = await window.iterra.links.for(`proof:attempt:${a}`); return r?.out || []; } catch { return []; }
      }, aid);
      return links.some((l) => String(l.to || '').startsWith('flashcards:card:'));
    }, 20000);
    row('problem.retest lands a card + retest link', retOk, `links on proof:attempt:${aid}`);
    t = await appText();
    row('retest chip surfaces in compare', /retest (scheduled|due)/i.test(t), t.match(/retest[^.\n]*/i)?.[0] || 'chip absent');
  } else {
    row('problem.retest lands a card + retest link', 'skip', 'no hub');
    row('retest chip surfaces in compare', 'skip', 'no hub');
  }

  /* ── 7. ?attempt=<submitted> deep link lands on compare ── */
  if (hasHub) {
    const url = `/apps/proof/?attempt=${aid}`;
    if (shell) await page.evaluate((u) => window.postMessage({ type: 'iterra:open', url: u }, location.origin), url);
    else await page.goto(`${BASE}/?attempt=${aid}`, { waitUntil: 'load' });
    await page.waitForTimeout(3500);
    if (shell) app = frameOf();
    t = await appText();
    row('?attempt=<submitted> lands on compare', /verifying the proof|worked proof/i.test(t), (shell ? frameOf()?.url() : page.url()).slice(-80));
  } else row('?attempt=<submitted> lands on compare', 'skip', 'no hub');

  /* ── 8. step.append: no open attempt → durable pending → delivers on open ── */
  if (hasHub) {
    /* every attempt is submitted at this point — a step.append now must
       queue, not drop (the old null-return lost it silently) */
    let r = await send({ to: 'proof', action: 'step.append', entity: { app: 'ink', type: 'note', id: `n-${RUN}`, title: `queued-step-${RUN}` } });
    const queued = r.ok && r.delivered === 'queued';
    /* open a fresh attempt — the adapter's drain-on-open hook must land it */
    if (shell) await page.evaluate(() => { window.location.hash = '/p/proof'; });
    await page.waitForTimeout(1200);
    if (shell) app = frameOf();
    await appClickText('Library'); await page.waitForTimeout(700);
    const att = app.locator('button', { hasText: 'Attempt' }).first();
    if (await att.count()) { await att.click(); await page.waitForTimeout(1000); }
    const landed = await until(async () => {
      const w = await wb();
      return Object.values(w.attempts || {}).some((a) =>
        !a.submittedAt && (a.work || []).some((s) => (s.text || '').includes(`queued-step-${RUN}`)));
    }, 16000);
    row('step.append defers then delivers on open', queued && landed, `queued=${queued} landed=${landed}`);
    /* …and with the attempt open it delivers direct */
    r = await send({ to: 'proof', action: 'step.append', entity: { app: 'ink', type: 'note', id: `n2-${RUN}`, title: `direct-step-${RUN}` } });
    const direct = await until(async () => {
      const w = await wb();
      return Object.values(w.attempts || {}).some((a) =>
        !a.submittedAt && (a.work || []).some((s) => (s.text || '').includes(`direct-step-${RUN}`)));
    }, 8000);
    row('step.append lands direct in open attempt', r.ok && direct, `${r.delivered} landed=${direct}`);
  } else {
    row('step.append defers then delivers on open', 'skip', 'no hub');
    row('step.append lands direct in open attempt', 'skip', 'no hub');
  }

  /* ── 9. session build → begin → submit → back to runner ── */
  await appClickText('Session'); await page.waitForTimeout(800);
  t = await appText();
  const canBuild = /Build session/i.test(t);
  row('session builder renders', canBuild, t.slice(0, 80));
  if (canBuild) {
    await appClickText('Build session'); await page.waitForTimeout(900);
    t = await appText();
    const runner = /session —|Begin|done/i.test(t);
    row('session runner lists problems', runner, t.slice(0, 100));
    if (runner) {
      await appClickText('Begin'); await page.waitForTimeout(900);
      /* an earlier open attempt (the step.append landing) still exists —
         pick the attempt that actually carries a sessionId */
      const sessAtt = await wb().then((w) => Object.values(w.attempts || {}).find((a) => a.sessionId && !a.submittedAt));
      const sessAid = sessAtt?.id, sessId = sessAtt?.sessionId;
      row('attempt begins inside the session', !!sessAid && !!sessId, `attempt=${sessAid} session=${sessId}`);
      await app.locator('input[placeholder="exact answer"]').fill('1.22');
      await appClickText('Submit for verification'); await page.waitForTimeout(900);
      /* retry-from-compare must keep the session (was the sessionId-loss trap) */
      const retryBtn = app.locator('button', { hasText: 'Retry now' });
      if (await retryBtn.count()) {
        await retryBtn.click(); await page.waitForTimeout(800);
        const retryAtt = await wb().then((w) => Object.values(w.attempts || {}).find((a) => !a.submittedAt && a.sessionId === sessId));
        row('retry from compare keeps sessionId', retryAtt?.sessionId === sessId, `sessionId=${retryAtt?.sessionId}`);
        /* finish the retry so the runner can complete */
        await app.locator('input[placeholder="exact answer"]').fill('1.22');
        await appClickText('Submit for verification'); await page.waitForTimeout(900);
      }
      await appClickText('Back to session'); await page.waitForTimeout(800);
      t = await appText();
      row('runner shows the filed attempt', /done|✓|◐|✕|session/i.test(t), t.slice(0, 120));
      const sharedSess = hasHub ? await page.evaluate(() => window.iterra.doc('shared').get()?.session) : null;
      row('shared.session published active', !hasHub || sharedSess?.v?.active === true, JSON.stringify(sharedSess?.v || null));
      const filedOk = await appClickText('File session');
      if (filedOk) {
        await page.waitForTimeout(800);
        const after = hasHub ? await page.evaluate(() => window.iterra.doc('shared').get()?.session) : null;
        row('shared.session clears on file', !hasHub || after?.v === null || after?.v?.active === false, JSON.stringify(after?.v || null));
      }
    }
  }

  /* ── 10. problem.create intake → workbench + deep-link landing ── */
  if (hasHub) {
    const r = await send({ to: 'proof', action: 'problem.create', payload: { topic: `pd-topic`, prompt: `terrain problem ${RUN} — prove $\\int x = x^2/2$`, course: 'MTH', difficulty: 3 } });
    const made = await until(async () => JSON.stringify(await wb()).includes(`terrain problem ${RUN}`));
    await honor(r, 4500);
    t = await appText();
    /* the ?problem= url lands on a fresh attempt desk (boot stamps the
       attempt) — the full create→land path, not just the state write */
    row('problem.create files + lands on desk', r.ok && made && /the claim|assertion/i.test(t),
      `ok=${r.ok} made=${made} landed=${/the claim|assertion/i.test(t)}`);
  } else row('problem.create files + lands on desk', 'skip', 'no hub');

  /* ── 11. ?problem= deep link → attempt desk ── */
  if (hasHub && pid) {
    const url = `/apps/proof/?problem=${pid}`;
    if (shell) await page.evaluate((u) => window.postMessage({ type: 'iterra:open', url: u }, location.origin), url);
    else await page.goto(`${BASE}/?problem=${pid}`, { waitUntil: 'load' });
    await page.waitForTimeout(3500);
    if (shell) app = frameOf();
    t = await appText();
    row('?problem=<id> lands on a fresh attempt desk', /the claim|assertion 1 of/i.test(t), t.slice(0, 80));
  } else row('?problem=<id> lands on a fresh attempt desk', 'skip', 'no hub or no pid');

  /* ── 12. remaining views render ── */
  for (const [tab, probe] of [['Error ledger', /careless|diverged|error/i], ['Progress', /retention|attempts|due|progress|sessions/i], ['Import', /worksheet|gradestack|problem set/i], ['Settings', /motion|backup|courses|timer|url/i]]) {
    await appClickText(tab); await page.waitForTimeout(700);
    t = await appText();
    row(`${tab} view renders`, probe.test(t), t.slice(0, 70));
  }

  /* ── 13. worksheet import edge path ── */
  await appClickText('Import'); await page.waitForTimeout(600);
  await app.locator('textarea').first().fill(`1. Differentiate $x^2 \\sin x$ for ${RUN}.\n2. Integrate $\\frac{1}{x}$ dx.`);
  await appClickText('Extract for review'); await page.waitForTimeout(800);
  t = await appText();
  const draftOk = /File \d+ reviewed problem/i.test(t);
  row('worksheet paste extracts drafts', draftOk, t.slice(0, 90));
  if (draftOk) {
    await appClickText('File 2 reviewed problems', false);
    await page.waitForTimeout(800);
    const w = await wb();
    row('imported problems file to the bench', Object.keys(w.problems || {}).length >= 3, `problems=${Object.keys(w.problems || {}).length}`);
  }

  /* ── 14. help overlay + keyboard map ── */
  await app.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })));
  await page.waitForTimeout(400);
  t = await appText();
  const helpOpen = /keyboard|shortcuts|assertion/i.test(t);
  row('help overlay opens on ?', helpOpen, '');
  await app.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  await page.waitForTimeout(400);
  t = await appText();
  row('help overlay closes on Escape', !/keyboard shortcuts/i.test(t), '');

  /* ── 15. 390px — the header used to push the whole page to 799px ── */
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(600);
  await appClickText('Library'); await page.waitForTimeout(700);
  const m1 = await app.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: document.documentElement.clientWidth }));
  row('390px library has no horizontal overflow', m1.doc <= m1.win + 1, `scrollW=${m1.doc} win=${m1.win}`);
  const att2 = app.locator('button', { hasText: 'Attempt' }).first();
  if (await att2.count()) {
    await att2.click(); await page.waitForTimeout(800);
    const m2 = await app.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: document.documentElement.clientWidth }));
    row('390px attempt desk has no horizontal overflow', m2.doc <= m2.win + 1, `scrollW=${m2.doc} win=${m2.win}`);
  } else row('390px attempt desk has no horizontal overflow', 'skip', 'no attempt button');

  /* ── 16. feed + zero page errors ── */
  if (hasHub && shell) {
    const feedHit = await page.evaluate(() => {
      const items = window.iterra.feedItems?.() || window.iterra.doc('feed').get()?.items || [];
      return items.some((i) => i.app === 'proof' || /proof/i.test(i.text || ''));
    });
    row('proof activity reaches the feed', feedHit, '');
  } else row('proof activity reaches the feed', 'skip', 'no hub');
  row('no page errors', errs.length === 0, errs.slice(0, 4).join(' | ') || 'clean');

  /* ── report ── */
  console.log('\n═══ APPCHECK · PROOF ═══');
  let fails = 0, skips = 0;
  for (const [name, ok, detail] of results) {
    if (ok === 'skip') { skips++; console.log(`SKIP  ${name.padEnd(46)} ${detail}`); continue; }
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} ${detail}`);
  }
  console.log(`\n${results.length - fails - skips}/${results.length - skips} pass · ${skips} skipped · mode=${shell ? 'shell' : 'standalone'} · BASE=${BASE}`);
  await page.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
