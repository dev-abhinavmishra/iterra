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
    const sub = m[2] && m[2] !== '/' ? `p=${encodeURIComponent(m[2].slice(1))}` : '';
    const merged = [q, sub].filter(Boolean).join('&');
    window.history.replaceState(
      {},
      '',
      `/#/p/${m[1]}${merged ? `?${merged}` : ''}${window.location.hash || ''}`,
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

/* Cross-module integration: register typed commands (hub script loads
   synchronously before this module), run versioned migrations, and keep
   persisted app stores rehydrated across tabs. */
registerIntegrationCommands();
void runIntegrationMigrations().catch(() => {});
installCrossTabSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
