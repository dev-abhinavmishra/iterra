import { useCallback, useEffect, useState } from 'react';

export type WorkspaceTheme = 'paper' | 'graphite';

const THEME_KEY = 'iterra.v1.theme';

export function readTheme(): WorkspaceTheme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'graphite' || v === 'paper') return v;
  } catch { /* ignore */ }
  return 'paper';
}

export function applyWorkspaceTheme(theme: WorkspaceTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch { /* ignore */ }

  // Every mounted place subscribes via apps/theme.ts#onTerrainTheme and
  // restamps its own root marker — including places mounted after this call.
  try {
    window.dispatchEvent(new CustomEvent('iterra:theme', { detail: theme }));
  } catch { /* ignore */ }
}

export function useWorkspaceTheme(): [WorkspaceTheme, (next?: WorkspaceTheme) => void] {
  const [theme, setThemeState] = useState<WorkspaceTheme>(() => readTheme());

  useEffect(() => {
    applyWorkspaceTheme(theme);
  }, [theme]);

  useEffect(() => {
    const sync = () => {
      const next = readTheme();
      setThemeState(next);
      applyWorkspaceTheme(next);
    };
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === THEME_KEY) sync();
    };
    // places may flip the terrain switch themselves (apps/theme.ts)
    const onTerrain = () => setThemeState(readTheme());
    window.addEventListener('storage', onStorage);
    window.addEventListener('iterra:theme', onTerrain);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('iterra:theme', onTerrain);
    };
  }, []);

  /* updater stays pure — applyWorkspaceTheme writes storage + dispatches
     iterra:theme, and running it inside the updater would fire setState in
     sibling subscribers mid-render (StrictMode double-invokes updaters).
     The [theme] effect above applies every committed value instead. */
  const toggleOrSet = useCallback((next?: WorkspaceTheme) => {
    setThemeState((cur) => next ?? (cur === 'paper' ? 'graphite' : 'paper'));
  }, []);

  return [theme, toggleOrSet];
}
