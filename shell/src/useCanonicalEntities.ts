import { useCallback, useEffect, useState } from 'react';
import { subscribeStore, type StoreEntity } from './hub';
import { reconcileFollowUps } from './integration/identity';
import { ensureIntegrationMigrations } from './integration/migration';

export function useCanonicalEntities() {
  const [entities, setEntities] = useState<StoreEntity[]>([]);
  const [initialState, setInitialState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setInitialState('loading');
    setAttempt(value => value + 1);
  }, []);
  useEffect(() => {
    let failures = 0;
    let alive = true;
    let loaded = false;
    const initialTimeout = window.setTimeout(() => {
      if (alive && !loaded) setInitialState('error');
    }, 8000);
    const pull = () => {
      const it = (window as any).iterra;
      if (!it?.store?.list) return;
      ensureIntegrationMigrations().then(() => it.store.list({})).then((list: StoreEntity[]) => {
        if (!alive) return;
        failures = 0;
        loaded = true;
        window.clearTimeout(initialTimeout);
        setEntities(list || []);
        setInitialState('ready');
        void reconcileFollowUps(list || []).catch(() => {});
      }).catch(() => {
        if (!alive) return;
        if (!loaded) setInitialState('error');
        if (++failures === 2) {
          try {
            window.dispatchEvent(new CustomEvent('iterra:toast', {
              detail: { text: 'Local data store is unreachable — check storage permissions', url: '#/settings' },
            }));
          } catch { /* no window to notify */ }
        }
      });
    };
    pull();
    const sweep = window.setInterval(pull, 15000);
    let timer = 0;
    const debounced = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(pull, 150);
    };
    const off = subscribeStore(debounced);
    return () => {
      alive = false;
      window.clearTimeout(initialTimeout);
      if (timer) window.clearTimeout(timer);
      window.clearInterval(sweep);
      off();
    };
  }, [attempt]);
  return { entities, initialState, retry };
}
