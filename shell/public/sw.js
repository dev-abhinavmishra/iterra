/* Iterra service worker — makes the terrain work offline.

   The app is already local-first (localStorage + IndexedDB), so the only
   thing standing between the user and a dead wifi connection is the static
   asset layer. Strategy:

   - /assets/* are Vite content-hashed — cache-first, effectively immutable.
   - Navigations are network-first so a deploy propagates on the next load;
     a cold cache of /index.html is the offline fallback.
   - /api/* is never intercepted — margin's optional cloud sync needs the
     live network, and non-GET requests don't belong in a cache anyway.
   - Everything else (manifest, icons, iterra-hub.js) is
     stale-while-revalidate.

   Bump CACHE when the strategy changes — runtime URLs are hashed, so old
   caches only hold stale non-hashed files. */

const CACHE = 'iterra-v1';
const PRECACHE = ['/', '/site.webmanifest', '/icon.svg', '/iterra-hub.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network-first, cached copy as the offline floor.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put('/', clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/'))),
    );
    return;
  }

  // Content-hashed bundles: cache-first forever.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => c.put(req, clone));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else: stale-while-revalidate.
  e.respondWith(
    caches.match(req).then((hit) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fetched;
    }),
  );
});
