const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const origin = 'https://iterra.test';
const source = fs.readFileSync(path.join(__dirname, '..', 'shell', 'public', 'sw.js'), 'utf8');

function responseFor(url, body = `asset:${url}`) {
  const pathname = new URL(url, origin).pathname;
  let type = 'application/octet-stream';
  if (pathname === '/' || pathname === '/index.html') type = 'text/html';
  else if (pathname.endsWith('.js')) type = 'text/javascript';
  else if (pathname.endsWith('.css')) type = 'text/css';
  else if (pathname.endsWith('.svg')) type = 'image/svg+xml';
  else if (pathname.endsWith('.webmanifest') || pathname.endsWith('.json')) type = 'application/json';
  return new Response(body, { status: 200, headers: { 'content-type': type } });
}

class TestCache {
  constructor() { this.rows = new Map(); }
  async match(request) {
    const key = new URL(typeof request === 'string' ? request : request.url, origin).href;
    return this.rows.get(key)?.clone();
  }
  async put(request, response) {
    const key = new URL(typeof request === 'string' ? request : request.url, origin).href;
    this.rows.set(key, response.clone());
  }
  async delete(request) {
    const key = new URL(typeof request === 'string' ? request : request.url, origin).href;
    return this.rows.delete(key);
  }
}

class TestCacheStorage {
  constructor() { this.rows = new Map(); }
  async open(name) {
    if (!this.rows.has(name)) this.rows.set(name, new TestCache());
    return this.rows.get(name);
  }
  async keys() { return [...this.rows.keys()]; }
  async delete(name) { return this.rows.delete(name); }
}

function policy(version) {
  const suffix = version;
  const tool = `/assets/ink-${suffix}.js`;
  const editor = `/assets/ink-editor-${suffix}.js`;
  return {
    version: 1,
    buildId: suffix.repeat(20).slice(0, 20),
    entry: 'index.html',
    entryUrl: `/assets/main-${suffix}.js`,
    core: [`/assets/main-${suffix}.js`, `/assets/main-${suffix}.css`],
    tools: { ink: [tool, `/assets/ink-${suffix}.css`] },
    toolEntries: { ink: tool },
    dynamicFeatures: {
      core: {},
      tools: { ink: { 'src/apps/ink/RichEditor.tsx': { entry: editor, assets: [editor, `/assets/ink-editor-${suffix}.css`] } } },
    },
  };
}

function createWorld({ buildPolicy, expectedBuildId = buildPolicy?.buildId, htmlBuildId = buildPolicy?.buildId, htmlEntryUrl = buildPolicy?.entryUrl, cacheStorage = new TestCacheStorage(), failing = new Set(), online = true } = {}) {
  const listeners = new Map();
  const requests = [];
  const context = {
    self: {
      location: { origin },
      navigator: { onLine: online },
      clients: { claim: async () => {} },
      addEventListener: (type, callback) => listeners.set(type, callback),
    },
    caches: cacheStorage,
    Request,
    Response,
    URL,
    fetch: async (input) => {
      const url = new URL(typeof input === 'string' ? input : input.url, origin);
      requests.push(url.pathname);
      if (url.pathname === '/sw-precache-policy.json') return new Response(JSON.stringify(buildPolicy), { headers: { 'content-type': 'application/json' } });
      if (failing.has(url.pathname)) throw new Error('offline test network');
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response(`<html><head><meta name="iterra-build-id" content="${htmlBuildId}" /></head><body><script type="module" src="${htmlEntryUrl}"></script></body></html>`, { headers: { 'content-type': 'text/html' } });
      }
      return responseFor(url.pathname);
    },
    console,
  };
  const stampedSource = source.replace('__ITERRA_PRECACHE_POLICY_BUILD_ID__', expectedBuildId || '');
  vm.runInNewContext(stampedSource, context, { filename: 'sw.js' });
  async function dispatch(type, event = {}) {
    const pending = [];
    event.waitUntil = promise => pending.push(Promise.resolve(promise));
    const priorRespondWith = event.respondWith;
    event.respondWith = promise => {
      event.response = Promise.resolve(promise);
      priorRespondWith?.(event.response);
      pending.push(event.response);
    };
    listeners.get(type)(event);
    for (let index = 0; index < pending.length; index++) await pending[index];
    return event;
  }
  return { context, listeners, requests, cacheStorage, dispatch };
}

async function has(cache, url) { return !!await cache.match(new URL(url, origin).href); }

test('fresh install precaches only core and keeps legacy and unrelated caches untouched', async () => {
  const storage = new TestCacheStorage();
  await storage.open('unrelated-app-cache');
  const world = createWorld({ buildPolicy: policy('a'), cacheStorage: storage });
  await world.dispatch('install');

  const names = await storage.keys();
  assert(names.includes('unrelated-app-cache'));
  const core = await storage.open(`iterra-core-v1-${policy('a').buildId}`);
  assert(await has(core, '/'));
  assert(await has(core, '/index.html'));
  assert(await has(core, '/assets/main-a.js'));
  assert.equal(await has(core, '/assets/ink-a.js'), false);
  assert.equal(world.requests.includes('/assets/ink-a.js'), false);
});

test('tool activation prepares static code and an actually loaded nested feature is remembered', async () => {
  const world = createWorld({ buildPolicy: policy('b') });
  await world.dispatch('install');
  await world.dispatch('activate');

  const replies = [];
  await world.dispatch('message', {
    data: { type: 'iterra:prepare-tool', tool: 'ink', id: 'msg-1' },
    ports: [{ postMessage: value => replies.push(value) }],
    source: null,
  });
  assert(replies.some(reply => reply.type === 'iterra:tool-ready' && reply.ok));
  const runtime = await world.cacheStorage.open('iterra-runtime-v1');
  assert(await has(runtime, '/assets/ink-b.js'));
  assert.equal(await has(runtime, '/assets/ink-editor-b.js'), false);

  let response;
  const fetchEvent = {
    request: new Request(`${origin}/assets/ink-editor-b.js`),
    respondWith: promise => { response = Promise.resolve(promise); },
  };
  await world.dispatch('fetch', fetchEvent);
  assert.equal((await response).status, 200);
  await Promise.resolve();
  const metadata = await world.cacheStorage.open('iterra-meta-v1');
  const used = await metadata.match(`${origin}/__iterra__/used-assets`);
  const usedState = await used.json();
  assert(usedState.tools.includes('ink'));
  assert(usedState.toolFeatures.ink.includes('src/apps/ink/RichEditor.tsx'));
});

test('online tool use is allowed when offline CacheStorage writes run out of quota', async () => {
  const world = createWorld({ buildPolicy: policy('b') });
  await world.dispatch('install');
  await world.dispatch('activate');
  const runtime = await world.cacheStorage.open('iterra-runtime-v1');
  runtime.put = async () => { throw new Error('quota exceeded'); };
  const replies = [];
  await world.dispatch('message', {
    data: { type: 'iterra:prepare-tool', tool: 'ink', id: 'quota-tool' },
    ports: [{ postMessage: value => replies.push(value) }], source: null,
  });
  const ready = replies.find(reply => reply.type === 'iterra:tool-ready');
  assert.equal(ready.ok, true);
  assert.equal(ready.offlineReady, false);
  assert.match(ready.warning, /could not save every file/i);

  let response;
  await world.dispatch('fetch', {
    request: new Request(`${origin}/assets/ink-b.js`),
    respondWith: promise => { response = Promise.resolve(promise); },
  });
  assert.equal((await response).status, 200, 'a valid network JavaScript response remains usable online');
});

test('online tool use continues when usage metadata cannot be stored', async () => {
  const world = createWorld({ buildPolicy: policy('b') });
  await world.dispatch('install');
  await world.dispatch('activate');
  const metadata = await world.cacheStorage.open('iterra-meta-v1');
  metadata.put = async () => { throw new Error('quota exceeded'); };
  const replies = [];
  await world.dispatch('message', {
    data: { type: 'iterra:prepare-tool', tool: 'ink', id: 'quota-meta' },
    ports: [{ postMessage: value => replies.push(value) }], source: null,
  });
  const ready = replies.find(reply => reply.type === 'iterra:tool-ready');
  assert.equal(ready.ok, true);
  assert.equal(ready.offlineReady, false);
  assert.match(ready.warning, /metadata could not be saved/i);
});

test('update warms the new hashes for used tools/features and retains old hashed assets', async () => {
  const storage = new TestCacheStorage();
  const first = createWorld({ buildPolicy: policy('c'), cacheStorage: storage });
  await first.dispatch('install');
  await first.dispatch('activate');
  await first.dispatch('message', {
    data: { type: 'iterra:prepare-tool', tool: 'ink', id: 'msg-2' },
    ports: [{ postMessage: () => {} }], source: null,
  });
  const fetchEvent = {
    request: new Request(`${origin}/assets/ink-editor-c.js`),
    respondWith: () => {},
  };
  await first.dispatch('fetch', fetchEvent);

  const nextPolicy = policy('d');
  nextPolicy.dynamicFeatures.tools.ink['unmapped:_vendor-legacy.js'] = {
    entry: '/assets/ink-unknown-d.js',
    assets: ['/assets/ink-unknown-d.js', '/assets/ink-unknown-d.css'],
    unmapped: true,
  };
  const next = createWorld({ buildPolicy: nextPolicy, cacheStorage: storage });
  await next.dispatch('install');
  const runtime = await storage.open('iterra-runtime-v1');
  assert(await has(runtime, '/assets/ink-d.js'));
  assert(await has(runtime, '/assets/ink-editor-d.js'));
  assert(await has(runtime, '/assets/ink-unknown-d.js'), 'unknown new-build features of a used tool are warmed conservatively');
  assert(await has(runtime, '/assets/ink-unknown-d.css'));
  assert(await has(runtime, '/assets/ink-c.js'));
  assert(await has(runtime, '/assets/ink-editor-c.js'));
  await next.dispatch('activate');
  assert((await storage.keys()).includes('iterra-core-v1-' + policy('c').buildId));
});

test('legacy v3 profiles receive one conservative warm of all routes/features', async () => {
  const storage = new TestCacheStorage();
  const legacy = await storage.open('iterra-v3');
  await legacy.put(`${origin}/assets/old-all.js`, responseFor('/assets/old-all.js'));
  const world = createWorld({ buildPolicy: policy('8'), cacheStorage: storage });
  await world.dispatch('install');
  const runtime = await storage.open('iterra-runtime-v1');
  assert(await has(runtime, '/assets/ink-8.js'));
  assert(await has(runtime, '/assets/ink-editor-8.js'));
  assert((await storage.keys()).includes('iterra-v3'));
  const meta = await storage.open('iterra-meta-v1');
  const response = await meta.match(`${origin}/__iterra__/used-assets`);
  const used = await response.json();
  assert.equal(used.legacyMigration, 'completed');
  assert(used.tools.includes('ink'));
  assert(used.toolFeatures.ink.includes('src/apps/ink/RichEditor.tsx'));
});

test('failed core installation cannot replace the current policy or delete older caches', async () => {
  const storage = new TestCacheStorage();
  const old = createWorld({ buildPolicy: policy('e'), cacheStorage: storage });
  await old.dispatch('install');
  await old.dispatch('activate');
  await storage.open('unrelated-app-cache');

  const nextPolicy = policy('f');
  const failed = createWorld({ buildPolicy: nextPolicy, cacheStorage: storage, failing: new Set(['/assets/main-f.js']) });
  await assert.rejects(failed.dispatch('install'), /offline test network/);
  const meta = await storage.open('iterra-meta-v1');
  const activeResponse = await meta.match(`${origin}/__iterra__/active-policy`);
  assert.equal((await activeResponse.json()).buildId, policy('e').buildId);
  assert((await storage.keys()).includes('unrelated-app-cache'));
  assert((await storage.keys()).includes(`iterra-core-v1-${policy('e').buildId}`));
  assert.equal((await storage.keys()).includes(`iterra-core-v1-${policy('f').buildId}`), false);
});

test('a policy from another worker build is rejected before staging or activation', async () => {
  const storage = new TestCacheStorage();
  const old = createWorld({ buildPolicy: policy('3'), cacheStorage: storage });
  await old.dispatch('install');
  await old.dispatch('activate');
  const mismatch = createWorld({ buildPolicy: policy('4'), expectedBuildId: policy('5').buildId, cacheStorage: storage });
  await assert.rejects(mismatch.dispatch('install'), /does not match this worker build/);
  const meta = await storage.open('iterra-meta-v1');
  const active = await meta.match(`${origin}/__iterra__/active-policy`);
  assert.equal((await active.json()).buildId, policy('3').buildId);
  assert.equal((await storage.keys()).includes('iterra-core-v1-' + policy('4').buildId), false);
});

test('stale or mixed HTML cannot activate a new worker or replace the old active policy', async () => {
  const storage = new TestCacheStorage();
  const old = createWorld({ buildPolicy: policy('6'), cacheStorage: storage });
  await old.dispatch('install');
  await old.dispatch('activate');

  const nextPolicy = policy('7');
  const staleHtml = createWorld({ buildPolicy: nextPolicy, htmlBuildId: policy('6').buildId, cacheStorage: storage });
  await assert.rejects(staleHtml.dispatch('install'), /HTML entry does not match this worker build/);
  const wrongModule = createWorld({ buildPolicy: nextPolicy, htmlEntryUrl: policy('6').entryUrl, cacheStorage: storage });
  await assert.rejects(wrongModule.dispatch('install'), /module URL does not match the precache policy/);

  const meta = await storage.open('iterra-meta-v1');
  const active = await meta.match(`${origin}/__iterra__/active-policy`);
  assert.equal((await active.json()).buildId, policy('6').buildId);
  assert((await storage.keys()).includes(`iterra-core-v1-${policy('6').buildId}`));
  assert.equal((await storage.keys()).includes(`iterra-core-v1-${nextPolicy.buildId}`), false);
});

test('HTML served for a JavaScript URL is rejected and never cached as a tool chunk', async () => {
  const bad = createWorld({ buildPolicy: policy('9') });
  await bad.dispatch('install');
  await bad.dispatch('activate');
  const responseForBad = bad.context.fetch;
  bad.context.fetch = async input => {
    if (new URL(typeof input === 'string' ? input : input.url, origin).pathname === '/assets/missing.js') {
      return new Response('<html>SPA fallback</html>', { headers: { 'content-type': 'text/html' } });
    }
    return responseForBad(input);
  };
  let response;
  await bad.dispatch('fetch', {
    request: new Request(`${origin}/assets/missing.js`),
    respondWith: promise => { response = Promise.resolve(promise); },
  });
  const result = await response;
  assert.equal(result.status, 503);
  assert.match(result.headers.get('content-type'), /text\/plain/);
  assert.equal(await has(await bad.cacheStorage.open('iterra-runtime-v1'), '/assets/missing.js'), false);
});

test('offline navigation prefers the active build shell over a preserved old core', async () => {
  const storage = new TestCacheStorage();
  const world = createWorld({ buildPolicy: policy('2'), cacheStorage: storage });
  await world.dispatch('install');
  await world.dispatch('activate');
  const oldCore = await storage.open('iterra-core-v1-' + policy('1').buildId);
  await oldCore.put(`${origin}/`, new Response('<html>old build</html>', { headers: { 'content-type': 'text/html' } }));
  world.context.fetch = async input => {
    const pathname = new URL(typeof input === 'string' ? input : input.url, origin).pathname;
    if (pathname === '/') throw new Error('offline navigation');
    return responseFor(pathname);
  };
  let response;
  await world.dispatch('fetch', {
    request: { url: `${origin}/`, method: 'GET', mode: 'navigate' },
    respondWith: promise => { response = Promise.resolve(promise); },
  });
  const html = await (await response).text();
  assert.match(html, /content="22222222222222222222"/);
  assert.match(html, /main-2\.js/);
});

test('offline navigation strips route query and fragment before cache lookup', async () => {
  const world = createWorld({ buildPolicy: policy('3') });
  await world.dispatch('install');
  await world.dispatch('activate');
  world.context.fetch = async () => { throw new Error('offline navigation'); };
  let response;
  await world.dispatch('fetch', {
    request: { url: `${origin}/?term=fall#/p/syllabus`, method: 'GET', mode: 'navigate' },
    respondWith: promise => { response = Promise.resolve(promise); },
  });
  const html = await (await response).text();
  assert.match(html, new RegExp(`content="${policy('3').buildId}"`));
  assert.match(html, /main-3\.js/);
});

test('an old active worker does not overwrite its offline shell with new-build HTML', async () => {
  const world = createWorld({ buildPolicy: policy('1') });
  await world.dispatch('install');
  await world.dispatch('activate');
  world.context.fetch = async input => {
    const pathname = new URL(typeof input === 'string' ? input : input.url, origin).pathname;
    if (pathname === '/') return new Response(`<html><head><meta name="iterra-build-id" content="${policy('2').buildId}" /></head><script type="module" src="${policy('2').entryUrl}"></script></html>`, { headers: { 'content-type': 'text/html' } });
    return responseFor(pathname);
  };
  let onlineResponse;
  await world.dispatch('fetch', {
    request: { url: `${origin}/`, method: 'GET', mode: 'navigate' },
    respondWith: promise => { onlineResponse = Promise.resolve(promise); },
  });
  assert.match(await (await onlineResponse).text(), /22222222222222222222/);

  const currentCore = await world.cacheStorage.open('iterra-core-v1-' + policy('1').buildId);
  const cachedRoot = await currentCore.match(`${origin}/`);
  assert.match(await cachedRoot.text(), /11111111111111111111/);

  world.context.fetch = async () => { throw new Error('offline'); };
  let offlineResponse;
  await world.dispatch('fetch', {
    request: { url: `${origin}/`, method: 'GET', mode: 'navigate' },
    respondWith: promise => { offlineResponse = Promise.resolve(promise); },
  });
  assert.match(await (await offlineResponse).text(), /11111111111111111111/);
});
