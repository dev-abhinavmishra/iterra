/* Terrain theme bridge — the shell owns the ONE light/dark switch
   (iterra.v1.theme: 'paper' | 'graphite'). Integrated apps subscribe and
   restamp their root marker so the whole terrain flips together; an app
   running standalone keeps its own local preference. */

export type TerrainTheme = 'paper' | 'graphite';

const THEME_KEY = 'iterra.v1.theme';
const THEME_EVENT = 'iterra:theme';

export function terrainTheme(): TerrainTheme {
  try {
    return localStorage.getItem(THEME_KEY) === 'graphite' ? 'graphite' : 'paper';
  } catch {
    return 'paper';
  }
}

export function terrainIsDark(): boolean {
  return terrainTheme() === 'graphite';
}

export function isIntegrated(): boolean {
  return !!(window as any).__iterraIntegrated;
}

/* The one switch. Apps call this (instead of a local pref) so any toggle
   inside any place flips the whole terrain. Mirrors ui/theme.ts on the
   shell side — kept dependency-free for vanilla controllers. */
export function setTerrainTheme(t: TerrainTheme): void {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch { /* ignore */ }
  try {
    document.documentElement.dataset.theme = t;
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: t }));
}

export function toggleTerrainTheme(): TerrainTheme {
  const next: TerrainTheme = terrainTheme() === 'graphite' ? 'paper' : 'graphite';
  setTerrainTheme(next);
  return next;
}

/* Fires immediately with the current terrain theme, then on every flip.
   Returns an unsubscribe fn. Standalone callers still get the callback —
   they just typically gate it behind isIntegrated(). */
export function onTerrainTheme(cb: (t: TerrainTheme) => void): () => void {
  const fire = () => cb(terrainTheme());
  fire();
  const onCustom = () => fire();
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY) fire();
  };
  window.addEventListener(THEME_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
