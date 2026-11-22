/* Local-first offline shell with selective asset warming.

   - A fresh install stores the current SPA shell and the static dependency
     closure from sw-precache-policy.json. Tool and feature chunks stay cold.
   - Opening a tool asks the worker to validate and cache that tool's static
     closure before its module import begins. Nested dynamic features are
     cached when actually requested and their stable source IDs are retained.
   - On update, the new worker warms only previously used tool/feature
     closures from the new graph before it can activate.
   - Old hashed assets live in the runtime cache and the legacy iterra-v3
     cache is kept intact. Unrelated CacheStorage entries are never swept.
   - A missing cold tool chunk fails as a real asset response, never as SPA
     HTML. The shell can wait for reconnect while its durable intake remains
     pending.
*/

const LEGACY_CACHE = 'iterra-v3';
// scripts/emit-sw-manifest.mjs replaces this sentinel in the root release
// output so policy mismatches cannot activate a stale worker build.
const EXPECTED_BUILD_ID = '__ITERRA_PRECACHE_POLICY_BUILD_ID__';
const RUNTIME_CACHE = 'iterra-runtime-v1';
const META_CACHE = 'iterra-meta-v1';
const CORE_CACHE_PREFIX = 'iterra-core-v1-';
const META_ORIGIN = self.location.origin;
const ACTIVE_POLICY_KEY = new Request(`${META_ORIGIN}/__iterra__/active-policy`);
const STAGED_POLICY_KEY = new Request(`${META_ORIGIN}/__iterra__/staged-policy`);
const USED_STATE_KEY = new Request(`${META_ORIGIN}/__iterra__/used-assets`);
const SHELL_ASSETS = ['/', '/index.html', '/site.webmanifest', '/icon.svg', '/iterra-hub.js'];

function coreCacheName(buildId) {
  return `${CORE_CACHE_PREFIX}${buildId}`;
}

function assertAssetPath(path) {
  if (typeof path !== 'string' || path.startsWith('//') || (!path.startsWith('/') && !/^https?:\/\//i.test(path)) || path.split('/').includes('..')) {
    throw new Error(`Unsafe service-worker asset path: ${String(path)}`);
  }
  const url = new URL(path, META_ORIGIN);
  if (url.origin !== META_ORIGIN || url.search || url.hash) throw new Error(`Invalid service-worker asset URL: ${path}`);
  return url.href;
}

function validatePolicy(value) {
  if (!value || value.version !== 1 || !/^[a-f0-9]{20}$/.test(value.buildId || '') || typeof value.entry !== 'string') {
    throw new Error('The service-worker precache policy has an unsupported version or build ID');
  }
  const urls = (list, label) => {
    if (!Array.isArray(list) || list.some(path => typeof path !== 'string')) throw new Error(`Invalid ${label} asset list`);
    return [...new Set(list.map(assertAssetPath))];
  };
  if (!urls(value.core, 'core').length) throw new Error('The core offline asset graph is empty');
  assertAssetPath(value.entryUrl);
  if (!value.tools || typeof value.tools !== 'object' || Array.isArray(value.tools)) throw new Error('Invalid tool graph');
  if (!value.toolEntries || typeof value.toolEntries !== 'object' || Array.isArray(value.toolEntries)) throw new Error('Invalid tool entry map');
  for (const [tool, list] of Object.entries(value.tools)) {
    if (!/^[a-z][a-z0-9-]*$/.test(tool)) throw new Error(`Invalid logical tool ID: ${tool}`);
    const assets = urls(list, `tool ${tool}`);
    const entry = assertAssetPath(value.toolEntries[tool]);
    if (!assets.includes(entry)) throw new Error(`Tool ${tool} entry is outside its static closure`);
  }
  if (Object.keys(value.toolEntries).length !== Object.keys(value.tools).length || Object.keys(value.toolEntries).some(tool => !value.tools[tool])) throw new Error('Tool entry map does not match the tool graph');
  if (!value.dynamicFeatures || !value.dynamicFeatures.core || !value.dynamicFeatures.tools) throw new Error('Invalid dynamic feature graph');
  for (const features of [value.dynamicFeatures.core, ...Object.values(value.dynamicFeatures.tools)]) {
    if (!features || typeof features !== 'object' || Array.isArray(features)) throw new Error('Invalid feature map');
    for (const feature of Object.values(features)) {
      const assets = urls(feature?.assets, 'feature');
      const entry = assertAssetPath(feature?.entry);
      if (!assets.includes(entry)) throw new Error('Feature entry must appear in its asset closure');
    }
  }
  for (const tool of Object.keys(value.dynamicFeatures.tools)) if (!value.tools[tool]) throw new Error(`Feature map references unknown tool ${tool}`);
  return value;
}

async function fetchPolicy() {
  const response = await fetch('/sw-precache-policy.json', { cache: 'no-store' });
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !/json/i.test(type) || /text\/html/i.test(type)) throw new Error('The service-worker policy file is missing or was served as HTML');
  const policy = validatePolicy(await response.json());
  if (policy.buildId !== EXPECTED_BUILD_ID) throw new Error('The service-worker policy does not match this worker build');
  return policy;
}

function expectedContentType(path) {
  const pathname = new URL(path, META_ORIGIN).pathname;
  if (/\.m?js$/i.test(pathname)) return /(?:java|ecma)script/i;
  if (/\.css$/i.test(pathname)) return /text\/css/i;
  if (/\.svg$/i.test(pathname)) return /image\/svg\+xml/i;
  if (/\.woff2?$/i.test(pathname)) return /font\//i;
  if (/\.webmanifest$|\.json$/i.test(pathname)) return /(?:json|manifest)/i;
  if (/\.png$/i.test(pathname)) return /image\/png/i;
  if (/\.webp$/i.test(pathname)) return /image\/webp/i;
  return null;
}

function validResponse(path, response) {
  if (!response || !response.ok || response.type === 'opaque') return false;
  const type = response.headers.get('content-type') || '';
  if (/text\/html/i.test(type) && /\.(?:m?js|css|svg|woff2?|png|webp|json|webmanifest)$/i.test(new URL(path, META_ORIGIN).pathname)) return false;
  const expected = expectedContentType(path);
  return !expected || expected.test(type);
}

function validateBuildHtml(html, policy) {
  const buildId = html.match(/<meta\s+name=["']iterra-build-id["']\s+content=["']([a-f0-9]{20})["']\s*\/?>/i)?.[1];
  if (buildId !== policy.buildId) throw new Error('The offline HTML entry does not match this worker build');
  const moduleUrls = [...html.matchAll(/<script\b[^>]*>/gi)].map(match => {
    const tag = match[0];
    if (!/\btype=["']module["']/i.test(tag)) return null;
    const source = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    return source ? assertAssetPath(new URL(source, META_ORIGIN).href) : null;
  }).filter(Boolean);
  const expected = assertAssetPath(policy.entryUrl);
  if (moduleUrls.length !== 1 || moduleUrls[0] !== expected) throw new Error('The offline HTML module URL does not match the precache policy');
}

async function validateBuildIndex(cacheName, policy) {
  const cache = await caches.open(cacheName);
  const response = await cache.match(assertAssetPath('/index.html'));
  if (!response || !validResponse('/index.html', response)) throw new Error('The offline HTML entry is missing or invalid');
  validateBuildHtml(await response.text(), policy);
}

async function putFetched(cache, path) {
  const url = assertAssetPath(path);
  const response = await fetch(url, { cache: 'reload' });
  if (!validResponse(url, response)) throw new Error(`Invalid or missing offline asset: ${path}`);
  try { await cache.put(url, response.clone()); }
  catch (cause) {
    const error = new Error(`Offline cache write failed for ${path}: ${String(cause?.message || cause)}`);
    error.cacheWriteFailure = true;
    throw error;
  }
}

async function cacheAssets(cacheName, paths, { onlyMissing = false } = {}) {
  const cache = await caches.open(cacheName);
  const unique = [...new Set(paths.map(assertAssetPath))];
  const errors = [];
  for (const url of unique) {
    try {
      const existing = onlyMissing ? await cache.match(url) : null;
      if (existing && validResponse(url, existing)) continue;
      await putFetched(cache, url);
    } catch (error) {
      errors.push({ url, message: String(error?.message || error), cacheWriteFailure: error?.cacheWriteFailure === true });
    }
  }
  if (errors.length) {
    const error = new Error(errors.map(item => `${item.url}: ${item.message}`).join('\n'));
    error.cacheWriteOnly = errors.every(item => item.cacheWriteFailure);
    throw error;
  }
  return unique;
}

async function readMeta(key) {
  const cache = await caches.open(META_CACHE);
  const response = await cache.match(key);
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

async function writeMeta(key, value) {
  const cache = await caches.open(META_CACHE);
  await cache.put(key, new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }));
}

function emptyUsedState() {
  return { tools: [], coreFeatures: [], toolFeatures: {} };
}

async function updateUsedState(update) {
  const pending = usedStateQueue.then(async () => {
    const old = await readMeta(USED_STATE_KEY) || emptyUsedState();
    const next = update(old);
    await writeMeta(USED_STATE_KEY, next);
    return next;
  });
  usedStateQueue = pending.catch(() => {});
  return pending;
}
let usedStateQueue = Promise.resolve();

function featureWarmPaths(policy, used) {
  const urls = new Set();
  for (const featureId of used.coreFeatures || []) {
    const feature = policy.dynamicFeatures.core[featureId];
    if (feature) for (const path of feature.assets) urls.add(path);
  }
  // A generated/manual chunk without a stable source or declared name has no
  // durable logical ID. Keep those core feature chunks across policy changes.
  for (const feature of Object.values(policy.dynamicFeatures.core)) {
    if (feature.unmapped) for (const path of feature.assets) urls.add(path);
  }
  for (const [tool, featureIds] of Object.entries(used.toolFeatures || {})) {
    const features = policy.dynamicFeatures.tools[tool] || {};
    for (const featureId of featureIds) {
      const feature = features[featureId];
      if (feature) for (const path of feature.assets) urls.add(path);
    }
  }
  for (const tool of used.tools || []) {
    for (const feature of Object.values(policy.dynamicFeatures.tools[tool] || {})) {
      // Tool activation opts into conservative warming for unknown dynamic
      // chunks on subsequent upgrades, since their source identity is absent.
      if (feature.unmapped) for (const path of feature.assets) urls.add(path);
    }
  }
  return [...urls];
}

async function usedWarmPaths(policy, used) {
  const urls = new Set();
  for (const tool of used.tools || []) for (const path of policy.tools[tool] || []) urls.add(path);
  for (const path of featureWarmPaths(policy, used)) urls.add(path);
  return [...urls];
}

async function getActivePolicy() {
  const policy = await readMeta(ACTIVE_POLICY_KEY);
  try { return validatePolicy(policy); } catch { return null; }
}

async function markFeatureUsed(policy, path) {
  const normalized = new URL(path, META_ORIGIN).href;
  for (const [featureId, feature] of Object.entries(policy.dynamicFeatures.core)) {
    if (assertAssetPath(feature.entry) === normalized) {
      await updateUsedState(used => ({ ...used, coreFeatures: [...new Set([...(used.coreFeatures || []), featureId])] }));
      return;
    }
  }
  for (const [tool, features] of Object.entries(policy.dynamicFeatures.tools)) {
    for (const [featureId, feature] of Object.entries(features)) {
      if (assertAssetPath(feature.entry) !== normalized) continue;
      await updateUsedState(used => {
        const toolFeatures = { ...(used.toolFeatures || {}) };
        toolFeatures[tool] = [...new Set([...(toolFeatures[tool] || []), featureId])];
        return { ...used, toolFeatures };
      });
      return;
    }
  }
}

async function ownedCacheNames() {
  return (await caches.keys()).filter(name => name === LEGACY_CACHE || name === RUNTIME_CACHE || name.startsWith(CORE_CACHE_PREFIX));
}

async function matchOwned(path, preferredCache = null) {
  const url = assertAssetPath(path);
  if (preferredCache) {
    const preferred = await caches.open(preferredCache);
    const hit = await preferred.match(url);
    if (hit && validResponse(url, hit)) return hit;
  }
  for (const name of await ownedCacheNames()) {
    if (name === preferredCache) continue;
    const cache = await caches.open(name);
    const hit = await cache.match(url);
    if (hit && validResponse(url, hit)) return hit;
  }
  return null;
}

async function respondHashedAsset(request, policy) {
  const url = request.url;
  const cached = await matchOwned(url, policy ? coreCacheName(policy.buildId) : null);
  if (cached) {
    if (policy) await markFeatureUsed(policy, url).catch(() => {});
    return cached;
  }
  let response;
  try {
    response = await fetch(request);
    if (!validResponse(url, response)) return new Response('This study tool file is unavailable. Reconnect and retry; saved work and queued transfers are preserved.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  } catch {
    return new Response('This study tool file is unavailable offline. Reconnect and retry; saved work and queued transfers are preserved.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
  try {
    const runtime = await caches.open(RUNTIME_CACHE);
    await runtime.put(url, response.clone());
  } catch { /* A valid online response can still load when offline storage is full. */ }
  if (policy) await markFeatureUsed(policy, url).catch(() => {});
  return response;
}

async function prepareTool(tool, event, reply) {
  const policy = await getActivePolicy();
  if (!policy) {
    const result = { ok: false, offline: !self.navigator?.onLine, error: 'The active offline asset policy is unavailable.' };
    reply(result);
    return result;
  }
  const assets = policy.tools[tool];
  if (!assets) {
    const result = { ok: false, offline: false, error: `Tool ${tool} is not present in this build.` };
    reply(result);
    return result;
  }
  let offlineReady = true;
  let warning;
  try {
    const cached = await cacheAssets(RUNTIME_CACHE, assets, { onlyMissing: true });
    try { await updateUsedState(used => ({ ...used, tools: [...new Set([...(used.tools || []), tool])] })); }
    catch (error) {
      offlineReady = false;
      warning = `The tool opened, but offline-use metadata could not be saved: ${String(error?.message || error)}`;
    }
    const result = { type: 'iterra:tool-ready', id: event.data.id, ok: true, offlineReady, warning, buildId: policy.buildId, warmedAssets: cached.length };
    reply(result);
    return result;
  } catch (error) {
    if (error?.cacheWriteOnly && self.navigator?.onLine) {
      try { await updateUsedState(used => ({ ...used, tools: [...new Set([...(used.tools || []), tool])] })); } catch { /* online use can continue without quota-bound metadata */ }
      const result = { type: 'iterra:tool-ready', id: event.data.id, ok: true, offlineReady: false,
        warning: 'The tool opened online, but this device could not save every file for offline use.' };
      reply(result);
      return result;
    }
    const result = { type: 'iterra:tool-ready', id: event.data.id, ok: false, offline: !self.navigator?.onLine, error: String(error?.message || error) };
    reply(result);
    return result;
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const policy = await fetchPolicy();
    const active = await readMeta(ACTIVE_POLICY_KEY);
    const stagedCacheName = coreCacheName(policy.buildId);
    if (active?.buildId !== policy.buildId) {
      try {
        await cacheAssets(stagedCacheName, [...SHELL_ASSETS, ...policy.core]);
        await validateBuildIndex(stagedCacheName, policy);
        const used = await readMeta(USED_STATE_KEY) || emptyUsedState();
        if (used.legacyMigration !== 'completed') {
          const keys = await caches.keys();
          if (keys.includes(LEGACY_CACHE)) {
            // The legacy worker installed the entire old asset inventory, so
            // this one-off migration warms all current routes/features once.
            used.tools = Object.keys(policy.tools);
            used.coreFeatures = Object.keys(policy.dynamicFeatures.core);
            used.toolFeatures = Object.fromEntries(Object.entries(policy.dynamicFeatures.tools).map(([tool, features]) => [tool, Object.keys(features)]));
            await cacheAssets(RUNTIME_CACHE, await usedWarmPaths(policy, used), { onlyMissing: true });
          }
          used.legacyMigration = 'completed';
          await writeMeta(USED_STATE_KEY, used);
        } else {
          await cacheAssets(RUNTIME_CACHE, await usedWarmPaths(policy, used), { onlyMissing: true });
        }
        await writeMeta(STAGED_POLICY_KEY, policy);
      } catch (error) {
        // Discard only this not-yet-active build's staging cache. The active
        // core, legacy cache, runtime assets, and unrelated caches survive.
        await caches.delete(stagedCacheName);
        throw error;
      }
    } else {
      await writeMeta(STAGED_POLICY_KEY, policy);
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const staged = await readMeta(STAGED_POLICY_KEY);
    if (!staged) throw new Error('No validated service-worker policy was staged');
    validatePolicy(staged);
    if (staged.buildId !== EXPECTED_BUILD_ID) throw new Error('The staged policy does not match this worker build');
    const core = await caches.open(coreCacheName(staged.buildId));
    for (const path of [...SHELL_ASSETS, ...staged.core]) {
      const response = await core.match(assertAssetPath(path));
      if (!response || !validResponse(path, response)) throw new Error(`The staged offline shell is incomplete: ${path}`);
    }
    await validateBuildIndex(coreCacheName(staged.buildId), staged);
    await writeMeta(ACTIVE_POLICY_KEY, staged);
    const meta = await caches.open(META_CACHE);
    await meta.delete(STAGED_POLICY_KEY);
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'iterra:prepare-tool' || typeof event.data?.tool !== 'string') return;
  const reply = data => (event.ports?.[0] || event.source)?.postMessage(data);
  reply({ type: 'iterra:tool-prepare-started', id: event.data.id, ok: true });
  event.waitUntil(prepareTool(event.data.tool, event, reply).catch(error => {
    reply({ type: 'iterra:tool-ready', id: event.data.id, ok: false, offline: !self.navigator?.onLine, error: String(error?.message || error) });
  }));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    if (url.hostname === 'fonts.gstatic.com') {
      event.respondWith((async () => {
        const runtime = await caches.open(RUNTIME_CACHE);
        const hit = await runtime.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) await runtime.put(request, response.clone());
        return response;
      })());
    } else if (url.hostname === 'fonts.googleapis.com') {
      event.respondWith((async () => {
        const runtime = await caches.open(RUNTIME_CACHE);
        const hit = await runtime.match(request);
        try {
          const response = await fetch(request);
          if (response.ok) await runtime.put(request, response.clone());
          return hit || response;
        } catch { return hit || Response.error(); }
      })());
    }
    return;
  }
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith((async () => {
    const policy = await getActivePolicy();
    if (request.mode === 'navigate') {
      let response;
      try {
        response = await fetch(request);
      } catch {
        // Navigation Request.url may retain the document fragment in some
        // browsers. Fragments (and query strings) are not cache asset keys.
        const navigationUrl = new URL(request.url);
        navigationUrl.search = '';
        navigationUrl.hash = '';
        const current = policy ? await matchOwned(navigationUrl.href, coreCacheName(policy.buildId)) : null;
        if (current) return current;
        const root = policy ? await matchOwned('/', coreCacheName(policy.buildId)) : await matchOwned('/');
        if (root) return root;
        const index = policy ? await matchOwned('/index.html', coreCacheName(policy.buildId)) : await matchOwned('/index.html');
        return index || new Response('Iterra is offline and the current workspace shell is not cached yet. Reconnect and retry.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
      if (response.ok) {
        let cacheable = true;
        if (policy && /text\/html/i.test(response.headers.get('content-type') || '')) {
          try { validateBuildHtml(await response.clone().text(), policy); }
          catch { cacheable = false; }
        }
        if (cacheable) {
          try {
            const core = await caches.open(policy ? coreCacheName(policy.buildId) : RUNTIME_CACHE);
            await core.put('/', response.clone());
          } catch { /* Network navigation remains usable when storage is full. */ }
        }
      }
      return response;
    }

    if (url.pathname.startsWith('/assets/')) return respondHashedAsset(request, policy);

    const hit = await matchOwned(request.url, policy ? coreCacheName(policy.buildId) : null);
    try {
      const response = await fetch(request);
      if (response.ok) {
        const runtime = await caches.open(RUNTIME_CACHE);
        await runtime.put(request, response.clone());
      }
      return hit || response;
    } catch { return hit || Response.error(); }
  })());
});
