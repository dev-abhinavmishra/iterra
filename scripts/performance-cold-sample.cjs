/* Sample-semester cold Today lab probe. Run against a production build served
   over HTTP with compression enabled: node scripts/performance-cold-sample.cjs
   http://localhost:8090. Run on an otherwise idle machine. This covers only
   cold Today; it does not establish the warm, stress, or memory gates. */
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const base = process.argv[2] || 'http://localhost:8090';
const stress = process.argv.includes('--stress');
const runFlag = process.argv.indexOf('--runs');
const runCount = runFlag < 0 ? 5 : Number(process.argv[runFlag + 1]);
const invocation = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
assertRunCount();
function assertRunCount() { if (!Number.isInteger(runCount) || runCount < 1) throw new Error('--runs must be a positive integer'); }
const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(fs.existsSync);
assert(executablePath, 'Install Chrome or Edge or configure an executable path');
const output = path.resolve(stress ? 'tmp/performance-cold-stress' : 'tmp/performance-cold-sample');
fs.mkdirSync(output, { recursive: true });
let activePage = null;
let activeRun = null;
let currentStep = 'startup';

function checkpoint(step, data = {}) {
  currentStep = step;
  if (!activeRun) return;
  fs.writeFileSync(path.join(output, `run-${activeRun}-checkpoint.json`), JSON.stringify({
    invocation, run: activeRun, step, time: new Date().toISOString(), ...data
  }, null, 2));
}

async function waitForToday(page) {
  await page.getByRole('region', { name: /Your next study session|Active focus session/ }).waitFor({ timeout: 30000 });
}

async function measureInteraction(page, name, action, readyCondition) {
  await page.evaluate(({ label, condition }) => { window.__labArmInteraction = { label, condition }; }, { label: name, condition: readyCondition });
  await action();
  await page.waitForFunction(label => (window.__labInteractions || []).some(entry => entry.name === label && Number.isFinite(entry.readyPaint)), name, { timeout: 30000 });
  const result = await page.evaluate(label => {
    const item = (window.__labInteractions || []).findLast(entry => entry.name === label) || null;
    if (!item) return null;
    const eventTiming = (window.__eventTiming || []).filter(entry => entry.name === item.type)
      .sort((a, b) => Math.abs(a.startTime - item.eventTime) - Math.abs(b.startTime - item.eventTime))[0];
    return { ...item, eventTimingMatch: eventTiming && Math.abs(eventTiming.startTime - item.eventTime) < 100 ? eventTiming : null };
  }, name);
  assert(result?.eventTime != null && result.readyPaint != null, `No event-to-render measurement for ${name}`);
  return { ...result, eventToReadyPaintMs: result.readyPaint - result.eventTime };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1];
}

(async () => {
  const runs = [];
  for (let i = 0; i < runCount; i++) {
    activeRun = i + 1;
    checkpoint('launch-browser');
    const browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    try {
      const seed = await context.newPage();
      activePage = seed;
      checkpoint('seed-sample');
      await seed.goto(`${base}/#/settings`, { waitUntil: 'load' });
      assert.match(await seed.title(), /iterra/i, 'Wrong server');
      await seed.getByText('Load a sample semester', { exact: false }).first().click();
      await seed.getByRole('button', { name: 'Load sample' }).click();
      await seed.getByText('Remove sample data').first().waitFor({ timeout: 30000 });
      const activeFocusAtSeed = await seed.evaluate(() => {
        const context = window.iterra?.context?.get?.();
        let live = null;
        try { live = JSON.parse(localStorage.getItem('timer.session.live.v1') || 'null'); } catch { /* malformed state is not a valid active session */ }
        return !!context?.activeSession || !!(live && (live.running || live.paused));
      });
      assert.equal(activeFocusAtSeed, false, 'A fresh isolated sample profile must not begin with an active focus session');
      checkpoint('sample-focus-state-verified', { activeFocus: activeFocusAtSeed });
      // Drain the sample's note intake and let the canonical mirrors settle.
      await seed.goto(`${base}/#/p/ink`, { waitUntil: 'load' });
      await seed.waitForFunction(() => {
        const ink = JSON.parse(localStorage.getItem('ink-notes-storage') || '{}');
        return (ink.state?.notes || []).some(n => String(n.id).includes('in-demo-'));
      }, null, { timeout: 30000 });
      if (stress) {
        checkpoint('build-stress-fixture');
        // Mount every owner first so its public native-backed store handle is
        // available; fixture changes then pass through the normal persistence
        // and adapter paths instead of rewriting localStorage projections.
        await seed.goto(`${base}/#/settings`, { waitUntil: 'load' });
        await seed.reload({ waitUntil: 'load' });
        for (const [place, globalName] of [['syllabus', '__syllabusFolioStore'], ['ink', '__inkStore'], ['flashcards', '__fcApp']]) {
          await seed.goto(`${base}/#/p/${place}`, { waitUntil: 'load' });
          await seed.waitForFunction(name => !!window[name], globalName, { timeout: 30000 });
        }
        await seed.evaluate(async () => {
          const hub = window.iterra;
          // Drain all outstanding app intakes before replacing native fixture
          // stores. Re-read until stable because resolving one can enqueue another.
          for (let pass = 0; pass < 10; pass++) {
            let count = 0;
            for (const app of ['syllabus', 'ink', 'margin', 'flashcards', 'rhythm', 'proof', 'timer', 'gradestack', 'boxed']) {
              const pending = await hub.intakes.pending(app);
              count += pending.length;
              for (const intake of pending) await hub.intakes.resolve(intake.id, { ok: false, error: 'Isolated stress fixture setup' });
            }
            if (!count) break;
            if (pass === 9) throw new Error('Intake queue did not settle while preparing stress fixture');
          }
        });
        await require('./performance-stress-fixture.cjs')(seed);
        await seed.waitForFunction(() => {
          const folio = window.__syllabusFolioStore?.getState?.();
          const ink = window.__inkStore?.getState?.();
          const decks = Object.values(window.__fcApp?.state?.decks || {});
          const pendingNativeReceipts = Object.keys(localStorage).some(key => key.startsWith('iterra.native.pending.'));
          return !pendingNativeReceipts && Object.keys(folio?.courses || {}).length === 10 &&
            Object.keys(folio?.commitments || {}).length === 200 && (ink?.notes || []).length === 500 &&
            decks.length === 10 && decks.reduce((n, d) => n + (d.cards || []).length, 0) === 1000;
        }, null, { timeout: 90000 });
        // Full navigations rehydrate the owning stores and trigger mirrors.
        for (const place of ['syllabus', 'ink', 'flashcards']) {
          await seed.goto(`${base}/#/p/${place}`, { waitUntil: 'load' });
          await seed.reload({ waitUntil: 'load' });
          await seed.waitForTimeout(1500);
        }
        await seed.waitForFunction(async () => {
          const entities = await window.iterra.store.list({});
          const matches = (app, type) => entities.filter(e => e.app === app && e.type === type);
          const exact = (app, type, expected) => { const rows = matches(app, type); return rows.length === expected && rows.every(e => String(e.id).startsWith('stress-')); };
          const folio = window.__syllabusFolioStore?.getState?.() || {};
          const decks = Object.values(window.__fcApp?.state?.decks || {});
          const ink = window.__inkStore?.getState?.() || {};
          const courseIds = new Set(Object.keys(folio.courses || {}));
          const apps = ['syllabus', 'ink', 'margin', 'flashcards', 'rhythm', 'proof', 'timer', 'gradestack', 'boxed'];
          let pendingCount = 0;
          for (const app of apps) pendingCount += (await window.iterra.intakes.pending(app)).length;
          const nativeExact = Object.keys(folio.courses || {}).length === 10 && Object.keys(folio.commitments || {}).length === 200 &&
            decks.length === 10 && decks.reduce((n, d) => n + (d.cards || []).length, 0) === 1000 && (ink.notes || []).length === 500;
          const bindings = Object.values(folio.commitments || {}).every(c => courseIds.has(c.courseId)) &&
            decks.every(d => courseIds.has(String(d.courseId).replace('syllabus:course:', ''))) &&
            (ink.notes || []).every(n => courseIds.has(String(n.courseId).replace('syllabus:course:', '')));
          return pendingCount === 0 && nativeExact && bindings && exact('syllabus', 'course', 10) && exact('syllabus', 'commitment', 200) &&
            exact('ink', 'note', 500) && exact('flashcards', 'deck', 10) && exact('flashcards', 'card', 1000);
        }, null, { timeout: 90000 });
        // Require two stable snapshots after pending deliveries drain; this
        // prevents starting timing while a late mirror is still changing data.
        let previous = '';
        let stable = 0;
        for (let attempt = 0; attempt < 20 && stable < 3; attempt++) {
          const snapshot = await seed.evaluate(async () => {
            const entities = await window.iterra.store.list({});
            let pending = 0;
            for (const app of ['syllabus', 'ink', 'margin', 'flashcards', 'rhythm', 'proof', 'timer', 'gradestack', 'boxed']) pending += (await window.iterra.intakes.pending(app)).length;
            return JSON.stringify({ entities: entities.map(e => [e.app, e.type, e.id]).sort(), pending });
          });
          stable = snapshot === previous ? stable + 1 : 0;
          previous = snapshot;
          await seed.waitForTimeout(500);
        }
        assert(stable >= 3, 'Canonical fixture kept changing after mirror settlement');
      }
      const fixture = await seed.evaluate(async () => {
        const folio = window.__syllabusFolioStore?.getState?.() || {};
        const decks = Object.values(window.__fcApp?.state?.decks || {});
        const ink = window.__inkStore?.getState?.() || {};
        const entities = await window.iterra.store.list({});
        const courseIds = new Set(Object.keys(folio.courses || {}));
        return { courses: Object.keys(folio.courses || {}).length, commitments: Object.keys(folio.commitments || {}).length,
          decks: decks.length, cards: decks.reduce((n, d) => n + (d.cards || []).length, 0),
          notes: (ink.notes || []).length, canonicalCourses: entities.filter(e => e.app === 'syllabus' && e.type === 'course').length,
          validBindings: Object.values(folio.commitments || {}).every(c => courseIds.has(c.courseId)) &&
            decks.every(d => courseIds.has(String(d.courseId).replace('syllabus:course:', ''))) &&
            (ink.notes || []).every(n => !n.courseId || courseIds.has(String(n.courseId).replace('syllabus:course:', ''))) };
      });
      assert(fixture.courses >= (stress ? 10 : 3) && fixture.commitments >= (stress ? 200 : 7) && fixture.decks >= (stress ? 10 : 2) && fixture.cards >= (stress ? 1000 : 12) && fixture.notes >= (stress ? 500 : 1) && fixture.canonicalCourses >= (stress ? 10 : 3), `Incomplete fixture: ${JSON.stringify(fixture)}`);
      if (stress) assert(fixture.courses === 10 && fixture.commitments === 200 && fixture.decks === 10 && fixture.cards === 1000 && fixture.notes === 500 && fixture.canonicalCourses === 10 && fixture.validBindings, `Invalid stress fixture: ${JSON.stringify(fixture)}`);
      checkpoint('fixture-verified', { fixture });
      const seededStorage = await context.storageState({ indexedDB: true });
      await seed.close();
      const page = await context.newPage();
      activePage = page;
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      // Clear once per fresh Chromium process. Keep the demand-only measurement
      // explicitly cold by disabling cache on this target.
      await cdp.send('Network.clearBrowserCache');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.addInitScript(() => {
        window.__lab = { lcp: null, cls: 0, shifts: [] };
        new PerformanceObserver(list => { for (const e of list.getEntries()) { window.__lab.lcp = e.startTime; window.__lab.lcpElement = e.element?.outerHTML?.slice(0, 300); } }).observe({ type: 'largest-contentful-paint', buffered: true });
        let sessionValue = 0, sessionStart = 0, lastShift = 0;
        new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) {
          if (!sessionValue || e.startTime - lastShift > 1000 || e.startTime - sessionStart > 5000) { sessionValue = e.value; sessionStart = e.startTime; }
          else sessionValue += e.value;
          lastShift = e.startTime; window.__lab.cls = Math.max(window.__lab.cls, sessionValue);
          window.__lab.shifts.push({ time: e.startTime, value: e.value, sources: (e.sources || []).map(s => ({ tag: s.node?.tagName, id: s.node?.id, className: String(s.node?.className || '').slice(0, 200), text: s.node?.textContent?.trim().slice(0, 100), previous: s.previousRect, current: s.currentRect })) });
        } }).observe({ type: 'layout-shift', buffered: true });
      });
      const requests = new Map();
      cdp.on('Network.responseReceived', e => {
        if (e.type === 'Script') requests.set(e.requestId, { url: e.response.url, encoding: e.response.headers['content-encoding'] || e.response.headers['Content-Encoding'] || null, bytes: null });
      });
      cdp.on('Network.loadingFinished', e => { if (requests.has(e.requestId)) requests.get(e.requestId).bytes = e.encodedDataLength; });
      await context.tracing.start({ screenshots: true, snapshots: true });
      await page.goto(`${base}/#/today`, { waitUntil: 'networkidle', timeout: 90000 });
      await waitForToday(page);
      await page.waitForTimeout(3000);
      const metrics = await page.evaluate(() => ({ ...window.__lab, fonts: performance.getEntriesByType('resource').filter(e => /\.(woff2?|ttf)(\?|$)/i.test(e.name)).map(e => ({ name: e.name, start: e.startTime, end: e.responseEnd })) }));
      await context.tracing.stop({ path: path.join(output, `run-${i + 1}.zip`) });
      const scripts = [...requests.values()];
      assert(metrics.lcp !== null, 'No LCP observed');
      assert(scripts.length && scripts.every(s => s.bytes !== null), 'Incomplete script transfer accounting');
      assert(scripts.every(s => s.encoding), 'Server did not report compressed scripts; use an HTTP server with compression');
      runs.push({ fixture, ...metrics, scripts, scriptTransferBytes: scripts.reduce((n, s) => n + s.bytes, 0) });
      checkpoint('cold-demand-only-complete', { fixture, lcp: metrics.lcp, cls: metrics.cls, scriptTransferBytes: runs.at(-1).scriptTransferBytes });
      fs.writeFileSync(path.join(output, `run-${i + 1}-cold.json`), JSON.stringify(runs.at(-1), null, 2));
      console.log(`run ${i + 1}:`, JSON.stringify(runs.at(-1)));
      await context.close(); // Exclude the demand-only page from resident memory.
      // A second fresh context retains the seeded data but permits the real
      // production worker to install. The server's tokenized log includes
      // worker-initiated precache traffic beyond the page-target CDP events.
      const normal = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: seededStorage });
      let swPage;
      try {
        const token = `${invocation}-${stress ? 'stress' : 'sample'}-sw-${i + 1}`;
        await normal.addCookies([{ name: 'iterra_perf_run', value: token, url: base, sameSite: 'Lax' }]);
        swPage = await normal.newPage();
        activePage = swPage;
        await swPage.addInitScript(() => {
          window.__labInteractions = [];
          window.__labArmInteraction = null;
          window.__eventTiming = [];
          try {
            new PerformanceObserver(list => window.__eventTiming.push(...list.getEntries().map(e => ({ name: e.name, startTime: e.startTime, duration: e.duration, interactionId: e.interactionId })))).observe({ type: 'event', buffered: true, durationThreshold: 16 });
          } catch { /* Event Timing is supplemental; event listener timing remains available. */ }
          const visible = element => {
            const style = getComputedStyle(element);
            return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0;
          };
          const ready = condition => {
            const nodes = [...document.querySelectorAll(condition.selector || 'body')].filter(visible);
            return nodes.some(element => {
              if (condition.value != null && element.value !== condition.value) return false;
              if (condition.text) {
                const content = element.innerText || element.textContent || '';
                if (condition.regex ? !new RegExp(condition.text, 'i').test(content) : !content.toLowerCase().includes(condition.text.toLowerCase())) return false;
              }
              return true;
            });
          };
          const waitForPaint = (item, condition) => {
            const observer = new MutationObserver(check);
            function check() {
              if (!ready(condition)) { requestAnimationFrame(check); return; }
              observer.disconnect();
              requestAnimationFrame(() => requestAnimationFrame(() => {
                if (ready(condition)) item.readyPaint = performance.now();
                else {
                  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
                  requestAnimationFrame(check);
                }
              }));
            }
            observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
            requestAnimationFrame(check);
          };
          document.addEventListener('click', event => {
            const armed = window.__labArmInteraction;
            if (!armed) return;
            const item = { name: armed.label, type: 'click', eventTime: event.timeStamp, target: event.target?.outerHTML?.slice(0, 220) };
            window.__labInteractions.push(item);
            window.__labArmInteraction = null;
            waitForPaint(item, armed.condition);
          }, true);
          const record = (event, type) => {
            const armed = window.__labArmInteraction;
            if (!armed) return;
            const item = { name: armed.label, type, eventTime: event.timeStamp, target: event.target?.outerHTML?.slice(0, 220) };
            window.__labInteractions.push(item);
            window.__labArmInteraction = null;
            waitForPaint(item, armed.condition);
          };
          document.addEventListener('change', event => record(event, 'change'), true);
          document.addEventListener('input', event => record(event, 'input'), true);
        });
        const swCdp = await normal.newCDPSession(swPage);
        await swCdp.send('Network.enable');
        const workerReceives = [];
        const browserCdp = await browser.newBrowserCDPSession();
        const workerSessions = new Set();
        browserCdp.on('Target.targetCreated', async ({ targetInfo }) => {
          if (targetInfo.type !== 'service_worker' || !targetInfo.url.startsWith(base)) return;
          try {
            const { sessionId } = await browserCdp.send('Target.attachToTarget', { targetId: targetInfo.targetId, flatten: false });
            workerSessions.add(sessionId);
            await browserCdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: 1, method: 'Network.enable' }) });
          } catch (error) {
            workerReceives.push({ type: 'instrumentation-error', message: String(error) });
          }
        });
        browserCdp.on('Target.receivedMessageFromTarget', event => {
          if (!workerSessions.has(event.sessionId)) return;
          try {
            const message = JSON.parse(event.message);
            if (message.method === 'Network.loadingFinished') workerReceives.push({ type: 'loadingFinished', ...message.params });
            else if (message.method === 'Network.responseReceived') workerReceives.push({ type: 'responseReceived', requestId: message.params.requestId, url: message.params.response.url, mimeType: message.params.response.mimeType, encodedDataLength: message.params.response.encodedDataLength });
          } catch { /* Ignore non-JSON CDP notifications. */ }
        });
        await browserCdp.send('Target.setDiscoverTargets', { discover: true });
        // Worker-enabled visit uses a fresh browser HTTP cache with cache enabled.
        // The server log captures responses; browser-side receive events are
        // collected from both page and service-worker CDP targets where possible.
        await swCdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8 });
        await swCdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await swCdp.send('Tracing.start', { transferMode: 'ReturnAsStream', categories: 'devtools.timeline,blink.user_timing,loading,disabled-by-default-devtools.timeline' });
        await normal.tracing.start({ screenshots: true, snapshots: true });
        checkpoint('worker-enabled-cold-navigation');
        await swPage.goto(`${base}/#/today`, { waitUntil: 'networkidle', timeout: 90000 });
        await waitForToday(swPage);
        assert(await swPage.getByRole('region', { name: 'Your next study session' }).count(),
          'The controlled sample fixture must show a study plan, not an active focus session, before feedback measurements');
        const worker = await swPage.evaluate(async () => {
          if (!('serviceWorker' in navigator)) return 'unsupported';
          return Promise.race([navigator.serviceWorker.ready.then(() => 'ready'), new Promise(resolve => setTimeout(() => resolve('not ready'), 120000))]);
        });
        runs.at(-1).serviceWorker = { token, state: worker, coldEnd: new Date().toISOString(),
          cache: 'HTTP cache enabled; fresh Chromium process, cleared once before demand-only probe; worker visit follows probe.',
          responseAccounting: 'Server body byte counts are exact compressed response bodies written to the socket, not proof of browser receipt or completion. Page and service-worker CDP events are recorded separately.',
          workerReceiveObservation: workerReceives };
        fs.writeFileSync(path.join(output, `run-${i + 1}-worker-cold.json`), JSON.stringify(runs.at(-1).serviceWorker, null, 2));
        assert.equal(worker, 'ready', 'Service worker installation did not complete; inspect tokenized server log for lower-bound traffic');
        // Warm the two workspaces before collecting route switches. Timings
        // start at browser input dispatch and end after ready content paints.
        async function toPlanning() {
          await swPage.getByTitle('Workspace tools').click();
          return measureInteraction(swPage, 'warm.toPlanning',
            () => swPage.getByRole('button', { name: /Planning.*Folio/ }).first().click(),
            { selector: '[data-app="syllabus"] h1' });
        }
        async function toToday() {
          return measureInteraction(swPage, 'warm.toToday', async () => {
            await swPage.getByRole('navigation', { name: 'Primary navigation — compact' }).getByRole('button', { name: 'Today', exact: true }).click();
          }, { selector: 'main', text: 'Your next study session|Active focus session', regex: true });
        }
        for (let j = 0; j < 3; j++) { await toPlanning(); await toToday(); }
        await swPage.waitForTimeout(2000);
        await swCdp.send('Performance.enable');
        const processCdp = browserCdp;
        async function heap() {
          await swCdp.send('HeapProfiler.collectGarbage');
          const metrics = (await swCdp.send('Performance.getMetrics')).metrics;
          return metrics.find(m => m.name === 'JSHeapUsedSize')?.value ?? null;
        }
        async function resident() {
          const processes = (await processCdp.send('SystemInfo.getProcessInfo')).processInfo;
          const ids = processes.map(p => p.id).filter(Number.isInteger);
          if (!ids.length) return null;
          const script = `(Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum`;
          return Number(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).trim()) || null;
        }
        const toPlanningMs = [], toTodayMs = [];
        for (let j = 0; j < 10; j++) { toPlanningMs.push(await toPlanning()); toTodayMs.push(await toToday()); }
        fs.writeFileSync(path.join(output, `run-${i + 1}-warm-partial.json`), JSON.stringify({ toPlanningMs, toTodayMs }, null, 2));
        const feedback = {};
        feedback.workspaceOptions = await measureInteraction(swPage, 'feedback.workspaceOptions',
          () => swPage.getByRole('button', { name: 'Workspace options' }).click(),
          { selector: 'button', text: 'Graphite theme|Paper theme', regex: true });
        await swPage.keyboard.press('Escape');
        await swPage.getByRole('button', { name: 'Search workspace or run command' }).click();
        const search = swPage.getByRole('combobox', { name: 'Search workspace or run command' });
        feedback.search = await measureInteraction(swPage, 'feedback.search',
          () => search.fill(stress ? 'Stress commitment 10' : 'enzyme'),
          { selector: '#iterra-search-results', text: stress ? 'Stress commitment 10' : 'enzyme kinetics' });
        await swPage.keyboard.press('Escape');
        const preview = swPage.getByRole('region', { name: 'Your next study session' });
        assert(await preview.count(), 'Study-plan feedback measurements are unavailable while a focus session is active');
        await preview.getByText('View plan', { exact: false }).click();
        const courseSelect = preview.getByLabel('Course for study session');
        const selected = await courseSelect.inputValue();
        const alternative = await courseSelect.locator('option').evaluateAll((options, current) => options.map(o => ({ value: o.value, label: o.label })).find(o => o.value && o.value !== current), selected);
        assert(alternative, 'Need a different course option for feedback measurement');
        feedback.courseSelection = await measureInteraction(swPage, 'feedback.courseSelection',
          () => courseSelect.selectOption(alternative.value),
          { selector: 'select[aria-label="Course for study session"]', value: alternative.value });
        feedback.startFocus = await measureInteraction(swPage, 'feedback.startFocus',
          () => preview.getByRole('button', { name: 'Start study session' }).click(),
          { selector: 'main', text: 'Session study plan' });
        runs.at(-1).warm = { toPlanningMs, toTodayMs, feedback, interactionMeasurements: await swPage.evaluate(() => window.__labInteractions) };
        checkpoint('warm-interactions-complete', { fixture, warm: runs.at(-1).warm });
        const complete = new Promise(resolve => swCdp.once('Tracing.tracingComplete', resolve));
        await swCdp.send('Tracing.end');
        const traceStream = (await complete).stream;
        let trace = '';
        while (true) {
          const part = await swCdp.send('IO.read', { handle: traceStream });
          trace += part.data;
          if (part.eof) break;
        }
        await swCdp.send('IO.close', { handle: traceStream });
        fs.writeFileSync(path.join(output, `run-${i + 1}-chromium-trace.json`), trace);
        await normal.tracing.stop({ path: path.join(output, `run-${i + 1}-sw.zip`) });
        // No tracing during resident-memory sampling: the trace buffer would
        // itself grow throughout the switch loop and contaminate the result.
        await toToday();
        for (let j = 0; j < 3; j++) { await toPlanning(); await toToday(); }
        await swPage.waitForTimeout(2000);
        const heapBefore = await heap();
        const residentBefore = await resident();
        for (let j = 0; j < 10; j++) { await toPlanning(); await toToday(); }
        const heapAfter = await heap();
        const residentAfter = await resident();
        Object.assign(runs.at(-1).warm, { heapBefore, heapAfter, residentBefore, residentAfter,
          heapNote: 'Untraced pass; JavaScript heap after GC and summed Chromium working set.' });
        runs.at(-1).serviceWorker.workerReceiveObservation = workerReceives;
        fs.writeFileSync(path.join(output, `run-${i + 1}-worker-cold.json`), JSON.stringify(runs.at(-1).serviceWorker, null, 2));
      } catch (error) {
        if (swPage && !swPage.isClosed()) {
          await swPage.screenshot({ path: path.join(output, `run-${i + 1}-failure.png`) }).catch(() => {});
          const body = await swPage.locator('body').innerText().catch(() => '');
          fs.writeFileSync(path.join(output, `run-${i + 1}-failure.txt`), `${String(error)}\n\n${body}`);
        }
        await normal.tracing.stop({ path: path.join(output, `run-${i + 1}-failure.zip`) }).catch(() => {});
        throw error;
      } finally { await normal.close(); }
    } finally { await context.close(); await browser.close(); }
  }
  const summary = Object.fromEntries(['lcp', 'cls', 'scriptTransferBytes'].map(k => [k, { median: percentile(runs.map(r => r[k]), .5), p75: percentile(runs.map(r => r[k]), .75) }]));
  const summarize = values => ({ count: values.length, median: percentile(values, .5), p75: percentile(values, .75) });
  const interactionStats = (key) => {
    const values = runs.flatMap(run => [run.warm?.feedback?.[key]]).filter(item => Number.isFinite(item?.eventToReadyPaintMs)).map(item => item.eventToReadyPaintMs);
    return values.length ? summarize(values) : { count: 0, median: null, p75: null };
  };
  summary.warm = {
    toPlanningMs: summarize(runs.flatMap(r => r.warm.toPlanningMs).map(item => item.eventToReadyPaintMs)),
    toTodayMs: summarize(runs.flatMap(r => r.warm.toTodayMs).map(item => item.eventToReadyPaintMs)),
    ...Object.fromEntries(['workspaceOptions', 'search', 'courseSelection', 'startFocus'].map(k => [k, interactionStats(k)])),
    residentGrowthPercent: summarize(runs.map(r => 100 * (r.warm.residentAfter - r.warm.residentBefore) / r.warm.residentBefore)),
    profiles: runs.length,
    note: 'Navigation and interaction timings begin at the browser input/change event and end after the ready condition has rendered through two animation frames. Field INP is not claimed.'
  };
  const buildFile = process.env.ITERRA_PERF_INDEX || 'dist/index.html';
  const candidateSha256 = fs.existsSync(buildFile) ? crypto.createHash('sha256').update(fs.readFileSync(buildFile)).digest('hex') : null;
  const versionBrowser = await chromium.launch({ executablePath, headless: true });
  const browserVersion = versionBrowser.version();
  await versionBrowser.close();
  const result = { base, browser: executablePath, browserVersion, candidateSha256, buildFile,
    conditions: '390x844, 4x CPU, 1.6 Mbps down, 750 Kbps up, 150 ms latency; per fresh Chromium process clear HTTP cache once; demand-only page disables HTTP cache and blocks service worker; separate worker-enabled page has HTTP cache enabled. Demand-only is not the ordinary worker-controlled visit.', runs, summary };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})().catch(async e => {
  const failure = { invocation, run: activeRun, step: currentStep, time: new Date().toISOString(), error: String(e), stack: e?.stack || null };
  if (activePage && !activePage.isClosed()) {
    failure.url = activePage.url();
    failure.body = await activePage.locator('body').innerText().catch(() => '');
    await activePage.screenshot({ path: path.join(output, `run-${activeRun || 'unknown'}-failure.png`) }).catch(() => {});
  }
  fs.writeFileSync(path.join(output, `run-${activeRun || 'unknown'}-failure.json`), JSON.stringify(failure, null, 2));
  console.error(e);
  process.exitCode = 1;
});
