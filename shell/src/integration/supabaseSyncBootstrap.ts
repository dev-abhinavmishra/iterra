/* Keep Supabase out of the cold shell bundle. Load its client and auth code
   only when the user has opted into shared sync in this browser. */
type SyncModule = { watchItterraSync: () => void };
type Host = {
  localStorage: { getItem: (key: string) => string | null };
  addEventListener: (type: string, listener: (event: any) => void) => void;
  removeEventListener: (type: string, listener: (event: any) => void) => void;
};

const ENABLED_KEY = 'iterra.v1.sync.enabled';

export function installSupabaseSyncBootstrap(
  load: () => Promise<SyncModule> = () => import('./supabaseSync'),
  host: Host = window,
): () => void {
  let loading: Promise<void> | null = null;
  const enabled = () => {
    try { return host.localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; }
  };
  const start = () => {
    if (!enabled() || loading) return;
    loading = load().then(module => module.watchItterraSync()).finally(() => { loading = null; });
    // A failed chunk load can be retried by the next explicit enable event.
    void loading.catch(() => {});
  };
  const onConsent = (event: any) => { if (event?.detail?.enabled) start(); };
  const onStorage = (event: any) => { if (event?.key === ENABLED_KEY && event?.newValue === '1') start(); };
  host.addEventListener('iterra:sync-consent-changed', onConsent);
  host.addEventListener('storage', onStorage);
  start(); // handles consent persisted by an earlier visit
  return () => {
    host.removeEventListener('iterra:sync-consent-changed', onConsent);
    host.removeEventListener('storage', onStorage);
  };
}

declare const window: Host;
