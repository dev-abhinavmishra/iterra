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

  // Propagate to mounted module roots so embedded tools harmonize with the shell theme
  const isDark = theme === 'graphite';
  const fcRoot = document.querySelector('.it-place-flashcards') as HTMLElement | null;
  if (fcRoot) {
    if (isDark) fcRoot.setAttribute('data-theme', 'dark');
    else fcRoot.removeAttribute('data-theme');
  }
  const timerRoot = document.querySelector('.it-place-timer') as HTMLElement | null;
  if (timerRoot) {
    timerRoot.setAttribute('data-theme', isDark ? 'night' : 'day');
  }
  const gsRoot = document.querySelector('.it-place-gradestack') as HTMLElement | null;
  if (gsRoot) {
    gsRoot.classList.toggle('dark', isDark);
  }
  const marginRoot = document.querySelector('.it-place-margin') as HTMLElement | null;
  if (marginRoot) {
    marginRoot.classList.toggle('dark', isDark);
  }
}

export function useWorkspaceTheme(): [WorkspaceTheme, (next?: WorkspaceTheme) => void] {
  const [theme, setThemeState] = useState<WorkspaceTheme>(() => readTheme());

  useEffect(() => {
    applyWorkspaceTheme(theme);
  }, [theme]);

  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === THEME_KEY) {
        const next = readTheme();
        setThemeState(next);
        applyWorkspaceTheme(next);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleOrSet = useCallback((next?: WorkspaceTheme) => {
    setThemeState((cur) => {
      const target = next ?? (cur === 'paper' ? 'graphite' : 'paper');
      applyWorkspaceTheme(target);
      return target;
    });
  }, []);

  return [theme, toggleOrSet];
}
