/* Browser smoke for selective offline assets and durable cold handoffs.
   Usage: node scripts/verify-offline-tools.cjs <current-dist> <next-dist>
   Legacy deployment transition: add --legacy-v3-migration to test an actual
   full-inventory iterra-v3 install upgrading to a selective-policy build. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright-core');

const currentRoot = path.resolve(process.argv[2] || 'dist');
const nextRoot = process.argv[3] ? path.resolve(process.argv[3]) : null;
const legacyMigration = process.argv.includes('--legacy-v3-migration');
if (!nextRoot) throw new Error('Pass both current and next release dist directories');
if (legacyMigration) {
  if (!fs.existsSync(path.join(currentRoot, 'index.html')) || !fs.existsSync(path.join(currentRoot, 'sw.js')) || !fs.existsSync(path.join(currentRoot, 'sw-manifest.json'))) {
    throw new Error(`Incomplete historical v3 dist: ${currentRoot}`);
  }
  if (fs.existsSync(path.join(currentRoot, 'sw-precache-policy.json'))) throw new Error('Legacy mode expects an unmodified v3 dist without selective policy');
  if (!fs.existsSync(path.join(nextRoot, 'index.html')) || !fs.existsSync(path.join(nextRoot, 'sw.js')) || !fs.existsSync(path.join(nextRoot, 'sw-precache-policy.json'))) {
    throw new Error(`Incomplete selective-policy dist: ${nextRoot}`);
  }
} else {
  for (const dir of [currentRoot, nextRoot]) {
    if (!fs.existsSync(path.join(dir, 'index.html')) || !fs.existsSync(path.join(dir, 'sw.js')) || !fs.existsSync(path.join(dir, 'sw-precache-policy.json'))) {
      throw new Error(`Incomplete root release build: ${dir}`);
    }
  }
}

const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(fs.existsSync);
assert(executablePath, 'Install Chrome or Edge before running offline browser verification');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2' };
let selectedRoot = currentRoot;

function sendFile(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  const candidate = path.resolve(selectedRoot, `.${pathname}`);
  if (candidate !== selectedRoot && !candidate.startsWith(selectedRoot + path.sep)) { res.writeHead(403).end(); return; }
  let file = candidate;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (!path.extname(pathname)) file = path.join(selectedRoot, 'index.html');
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end('Not found'); return; }
  const body = fs.readFileSync(file);
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream',
    'content-length': body.length, 'cache-control': /\/assets\//.test(pathname) ? 'public, max-age=31536000, immutable' : 'no-cache' });
  res.end(body);
}

function cachedState(page, buildId, paths) {
  return page.evaluate(async ({ buildId: id, paths: assets }) => {
    const names = await caches.keys();
    const core = await caches.open(`iterra-core-v1-${id}`);
    const runtime = await caches.open('iterra-runtime-v1');
    const present = async (cache, url) => !!await cache.match(new URL(url, location.origin).href);
    return { names, core: await Promise.all(assets.map(url => present(core, url))), runtime: await Promise.all(assets.map(url => present(runtime, url))) };
  }, { buildId, paths });
}

async function verifyLegacyV3Migration(page, context, base) {
  await page.goto(`${base}/#/`, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await page.reload({ waitUntil: 'load' });
  const legacy = await page.evaluate(async () => {
    const assets = await (await fetch('/sw-manifest.json')).json();
    const cache = await caches.open('iterra-v3');
    const cached = await Promise.all(assets.map(url => cache.match(new URL(url, location.origin).href)));
    return { assets, cachedCount: cached.filter(Boolean).length, cacheNames: await caches.keys() };
  });
  assert.equal(legacy.cachedCount, legacy.assets.length, 'The legacy worker should retain its full manifest inventory');
  assert(legacy.assets.some(path => /\.js$/.test(path)), 'Legacy inventory must include JavaScript chunks');

  const queued = await page.evaluate(() => window.iterra.send({
    to: 'ink', action: 'note.create',
    entity: { id: 'legacy-update-handoff', type: 'note', app: 'ink', title: 'Legacy update handoff' },
    payload: { text: 'A v3 client must retain its queued note while the selective worker installs.' },
  }));
  assert.equal(queued.ok, true);
  assert.equal(queued.delivered, 'queued');

  const nextPolicy = JSON.parse(fs.readFileSync(path.join(nextRoot, 'sw-precache-policy.json'), 'utf8'));
  selectedRoot = nextRoot;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 180000 });
  const migrated = await page.evaluate(async policy => {
    const runtime = await caches.open('iterra-runtime-v1');
    const allToolAssets = Object.values(policy.tools).flat();
    const allFeatureAssets = [
      ...Object.values(policy.dynamicFeatures.core).flatMap(feature => feature.assets),
      ...Object.values(policy.dynamicFeatures.tools).flatMap(features => Object.values(features).flatMap(feature => feature.assets)),
    ];
    const present = async url => !!await runtime.match(new URL(url, location.origin).href);
    return {
      missingTools: (await Promise.all(allToolAssets.map(async url => await present(url) ? null : url))).filter(Boolean),
      missingFeatures: (await Promise.all(allFeatureAssets.map(async url => await present(url) ? null : url))).filter(Boolean),
      names: await caches.keys(),
    };
  }, nextPolicy);
  assert(migrated.names.includes('iterra-v3'), 'The legacy cache must survive the selective worker install');
  assert.equal(migrated.missingTools.length, 0, 'One-off v3 migration must warm each current tool closure');
  assert.equal(migrated.missingFeatures.length, 0, 'One-off v3 migration must warm current dynamic feature closures');

  // Exercise an old client after the new worker is waiting. It stays on the
  // v3 controller and lazily opens Ink from the old exact-hash cache.
  await page.evaluate(() => { window.location.hash = '#/p/ink'; });
  await page.locator('[data-app="ink"]').waitFor({ state: 'visible', timeout: 90000 });
  await page.waitForFunction(async id => {
    const pending = await window.iterra.intakes.pending('ink');
    const notes = window.__inkStore?.getState?.().notes || [];
    return !pending.some(row => row.id === id) && notes.some(note => note.id === `intake-${id}`);
  }, queued.id, { timeout: 30000 });
  const oldAssets = await page.evaluate(() => performance.getEntriesByType('resource')
    .map(entry => new URL(entry.name).pathname).filter(url => url.startsWith('/assets/') && /\.js$/.test(url)));
  const legacyMissing = await page.evaluate(async paths => {
    const cache = await caches.open('iterra-v3');
    return (await Promise.all(paths.map(async url => await cache.match(new URL(url, location.origin).href) ? null : url))).filter(Boolean);
  }, oldAssets);
  assert.equal(legacyMissing.length, 0, 'Old-client hashed resources must remain in the exact legacy cache');

  await page.close();
  const updated = await context.newPage();
  await updated.goto(`${base}/#/p/ink`, { waitUntil: 'load' });
  await updated.waitForFunction(async id => {
    const response = await (await caches.open('iterra-meta-v1')).match(`${location.origin}/__iterra__/active-policy`);
    return response && (await response.json()).buildId === id;
  }, nextPolicy.buildId, { timeout: 30000 });
  await context.setOffline(true);
  await updated.reload({ waitUntil: 'load' });
  await updated.locator('[data-app="ink"]').waitFor({ state: 'visible', timeout: 90000 });
  const final = await updated.evaluate(async id => ({
    notes: window.__inkStore?.getState?.().notes || [],
    pending: await window.iterra.intakes.pending('ink'),
    cacheNames: await caches.keys(),
    activePolicy: await (async () => {
      const response = await (await caches.open('iterra-meta-v1')).match(`${location.origin}/__iterra__/active-policy`);
      return response ? (await response.json()).buildId : null;
    })(),
  }), queued.id);
  assert(final.notes.some(note => note.title === 'Legacy update handoff'), 'The queued v3 handoff must survive offline after update');
  assert.equal(final.pending.length, 0);
  assert.equal(final.activePolicy, nextPolicy.buildId);
  assert(final.cacheNames.includes('iterra-v3'), 'The previous cache remains available for old hashed requests');
  console.log(JSON.stringify({ result: 'PASS', scenario: 'legacy-v3-to-selective-build',
    legacyAssets: legacy.assets.length, migrationTools: Object.keys(nextPolicy.tools).length,
    migrationFeatureAssets: migrated.missingFeatures.length === 0, oldClientLoadedAfterUpdate: true,
    queuedHandoffOfflineAfterUpdate: true, currentBuild: nextPolicy.buildId }));
}

(async () => {
  const server = http.createServer(sendFile);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let page = await context.newPage();
  try {
    if (legacyMigration) {
      await verifyLegacyV3Migration(page, context, `http://127.0.0.1:${server.address().port}`);
      return;
    }
    await page.goto(`${base}/#/`, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    });
    await page.reload({ waitUntil: 'load' });
    const first = await page.evaluate(async () => {
      const policy = await (await fetch('/sw-precache-policy.json')).json();
      const state = await Promise.all(policy.tools.ink.map(async path => [path,
        !!await (await caches.open('iterra-runtime-v1')).match(new URL(path, location.origin).href),
        !!await (await caches.open(`iterra-core-v1-${policy.buildId}`)).match(new URL(path, location.origin).href)]));
      return { policy, state };
    });
    assert.equal(first.policy.version, 1);
    assert(first.policy.tools.ink.length > 0, 'Ink tool graph is empty');
    const toolEntry = first.policy.toolEntries.ink;
    assert(!first.policy.core.includes(toolEntry), 'Ink entry leaked into core closure');
    const toolEntryCacheState = first.state.find(([url]) => url === toolEntry);
    assert(toolEntryCacheState && !toolEntryCacheState[1] && !toolEntryCacheState[2], 'Fresh install prefetched an unopened Ink tool entry');

    const send = await page.evaluate(() => window.iterra.send({
      to: 'ink', action: 'note.create',
      entity: { id: 'offline-handoff-smoke', type: 'note', app: 'ink', title: 'Offline handoff smoke' },
      payload: { text: 'A cold handoff should stay queued until Notes loads.' },
    }));
    assert.equal(send.ok, true);
    assert.equal(send.delivered, 'queued', 'Ink should still be cold before the route is opened');

    await context.setOffline(true);
    await page.goto(`${base}/#/p/ink`, { waitUntil: 'load' });
    await page.getByRole('status').getByText(/waiting for a connection/i).waitFor({ timeout: 15000 });
    const pendingOffline = await page.evaluate(async () => (await window.iterra.intakes.pending('ink')).length);
    assert.equal(pendingOffline, 1, 'The offline handoff must remain queued');
    const noColdChunk = await page.evaluate(async url => {
      const runtime = await caches.open('iterra-runtime-v1');
      return !await runtime.match(new URL(url, location.origin).href);
    }, toolEntry);
    assert(noColdChunk, 'A cold offline attempt unexpectedly wrote the tool entry into cache');

    await context.setOffline(false);
    await page.waitForFunction(() => navigator.onLine, null, { timeout: 15000 });
    await page.locator('[data-app="ink"]').waitFor({ state: 'visible', timeout: 120000 });
    await page.waitForFunction(async id => {
      const pending = await window.iterra.intakes.pending('ink');
      const ink = JSON.parse(localStorage.getItem('ink-notes-storage') || '{}');
      return !pending.some(row => row.id === id) && (ink.state?.notes || []).some(note => note.id === `intake-${id}`);
    }, send.id, { timeout: 30000 });
    const warmed = await cachedState(page, first.policy.buildId, first.policy.tools.ink);
    assert(warmed.runtime.every(Boolean), 'Opening Ink did not warm its complete static tool closure');

    // Probe generated feature entry URLs through the controlled fetch path.
    // This represents an actual dynamic module request while keeping the
    // smoke independent from a particular editor route or document fixture.
    const features = Object.values(first.policy.dynamicFeatures.tools.ink || {});
    for (const feature of features) {
      const result = await page.evaluate(async url => {
        const response = await fetch(url);
        return { ok: response.ok, contentType: response.headers.get('content-type') };
      }, feature.entry);
      assert(result.ok && /javascript/i.test(result.contentType || ''), `Dynamic feature request failed: ${feature.entry}`);
    }
    const usedFeatures = await page.evaluate(async () => {
      const response = await (await caches.open('iterra-meta-v1')).match(`${location.origin}/__iterra__/used-assets`);
      return response ? response.json() : null;
    });
    assert(usedFeatures?.tools?.ink?.length || features.length === 0, 'Feature requests were not recorded for future updates');

    const nextPolicy = JSON.parse(fs.readFileSync(path.join(nextRoot, 'sw-precache-policy.json'), 'utf8'));
    assert.notEqual(nextPolicy.buildId, first.policy.buildId, 'Current and next builds must have different policy IDs');
    selectedRoot = nextRoot;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 180000 });
    const warmedNext = await cachedState(page, nextPolicy.buildId, [
      ...nextPolicy.tools.ink,
      ...Object.values(nextPolicy.dynamicFeatures.tools.ink || {}).flatMap(feature => feature.assets),
    ]);
    assert(warmedNext.runtime.every(Boolean), 'Update did not warm previously used Ink and feature assets from the new graph');

    await page.close(); // Let the no-skipWaiting update activate without abandoning old-client caches.
    let activeBuild = null;
    for (let attempt = 0; attempt < 4 && activeBuild !== nextPolicy.buildId; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      page = await context.newPage();
      await page.goto(`${base}/#/p/ink`, { waitUntil: 'load' });
      activeBuild = await page.evaluate(async () => {
        const response = await (await caches.open('iterra-meta-v1')).match(`${location.origin}/__iterra__/active-policy`);
        return response ? (await response.json()).buildId : null;
      });
      if (activeBuild !== nextPolicy.buildId) await page.close();
    }
    assert.equal(activeBuild, nextPolicy.buildId, 'The updated worker did not activate after old clients closed');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.locator('[data-app="ink"]').waitFor({ state: 'visible', timeout: 120000 });
    const afterUpdate = await page.evaluate(async () => {
      const state = JSON.parse(localStorage.getItem('ink-notes-storage') || '{}');
      const pending = await window.iterra.intakes.pending('ink');
      return { note: (state.state?.notes || []).some(note => note.title === 'Offline handoff smoke'), pending: pending.length };
    });
    assert.equal(afterUpdate.note, true, 'The delivered offline note must survive the build update');
    assert.equal(afterUpdate.pending, 0);
    console.log(JSON.stringify({ result: 'PASS', currentBuild: first.policy.buildId, nextBuild: nextPolicy.buildId,
      coldInkChunks: first.policy.tools.ink.length, warmedInkChunks: warmed.runtime.filter(Boolean).length,
      warmedNextChunks: warmedNext.runtime.filter(Boolean).length, deliveredHandoff: true, offlineAfterUpdate: true }));
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
