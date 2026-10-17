import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { placeHashFromAppUrl } from './route';
import { registerIntegrationCommands } from './integration/commands';
import { runIntegrationMigrations, installCrossTabSync } from './integration/migration';

/* One document, one terrain — app-to-app links can't open real windows
   anymore. Apps call iterra.open('/apps/<p>/…') (the hub posts
   iterra:open to window.parent, which is this same window now) or raw
   window.open; route both into the hash. Anything that doesn't name a
   place falls through to a real window. */
/* Boot landing on a legacy /apps/<place>/<path>?<query> URL (bookmarks,
   shared links, the old multi-app deploy): translate into the hash route
   before React mounts so deep links keep working. */
{
  const m = window.location.pathname.match(/^\/apps\/([a-z]+)((?:\/[^?#]*)?)/);
  if (m) {
    const q = window.location.search.replace(/^\?/, '');
    /* the sub-route rides along as p= — the same param the open() shims
       write, which path-routed places (ink, gradestack) read as their
       initial entry. A legacy inner-hash route (#/note/x) folds in too
       instead of silently truncating. */
    const innerHash = window.location.hash.replace(/^#\/?/, '');
    const sub = m[2] && m[2] !== '/' ? m[2].slice(1) : innerHash;
    const merged = [q, sub ? `p=${encodeURIComponent(sub)}` : ''].filter(Boolean).join('&');
    window.history.replaceState(
      {},
      '',
      `/#/p/${m[1]}${merged ? `?${merged}` : ''}`,
    );
  }
}

const realOpen = window.open.bind(window);
window.open = ((url?: string | URL, target?: string, features?: string) => {
  const u = typeof url === 'string' ? url : url?.toString() || '';
  const hit = placeHashFromAppUrl(u);
  if (hit) {
    const q = `${hit.query}${u.match(/^\/apps\/[a-z]+(\/[^?#]+)/)?.[1] ? `${hit.query ? '&' : ''}p=${encodeURIComponent(u.match(/^\/apps\/[a-z]+(\/[^?#]+)/)![1].slice(1))}` : ''}`;
    window.location.hash = `/p/${hit.place}${q ? `?${q}` : ''}`;
    return null;
  }
  return realOpen(url as any, target, features);
}) as typeof window.open;

const shim = () => {
  const it = (window as any).iterra;
  if (!it) return;
  /* isFramed() answers false now that there are no frames — presence
     entries publish framed:false, which is the honest state. open() gets
     the same hash treatment as window.open above. */
  const orig = typeof it.open === 'function' ? it.open.bind(it) : null;
  it.open = (url: string) => {
    const hit = placeHashFromAppUrl(url);
    if (hit) {
      const p = url.match(/^\/apps\/[a-z]+(\/[^?#]+)/)?.[1];
      const q = `${hit.query}${p && p !== '/' ? `${hit.query ? '&' : ''}p=${encodeURIComponent(p.slice(1))}` : ''}`;
      window.location.hash = `/p/${hit.place}${q ? `?${q}` : ''}`;
      return;
    }
    if (orig) orig(url);
    else window.open(url, '_blank', 'noopener');
  };
};
if ((window as any).iterra) shim();
else window.addEventListener('load', shim, { once: true });

/* Local-first durability: ask the browser to keep our storage out of its
   automatic eviction pool — Margin's entire library lives in IndexedDB
   and the rest in localStorage. Granted automatically for installed or
   high-engagement origins; resolves false elsewhere and storage simply
   stays best-effort. */
if (typeof navigator.storage?.persist === 'function') {
  void navigator.storage.persist().catch(() => {});
}

/* Cross-module integration: register typed commands (hub script loads
   synchronously before this module), run versioned migrations, and keep
   persisted app stores rehydrated across tabs. */
registerIntegrationCommands();
void runIntegrationMigrations().catch(() => {});
installCrossTabSync();

/* Offline support — prod only. A dev-mode SW caching module responses
   would fight HMR; the whole point here is the deployed build. */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        /* A new worker reaching 'installed' while a controller already
           exists means a deploy landed mid-session — surface a refresh
           toast instead of silently serving the stale tab. */
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('iterra:update-available'));
            }
          });
        });
      })
      .catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
