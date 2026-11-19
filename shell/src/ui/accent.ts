import { useCallback, useEffect, useState } from 'react';

export const ACCENTS = [
  { id: 'green', label: 'Green', swatch: '#2b5440' },
  { id: 'blue', label: 'Blue', swatch: '#315c92' },
  { id: 'purple', label: 'Purple', swatch: '#674585' },
  { id: 'rose', label: 'Rose', swatch: '#923e56' },
  { id: 'amber', label: 'Amber', swatch: '#854b1d' },
] as const;

export type Accent = (typeof ACCENTS)[number]['id'];
const KEY = 'iterra.v1.accent';

function readAccent(): Accent {
  try {
    const stored = localStorage.getItem(KEY);
    return ACCENTS.find(({ id }) => id === stored)?.id ?? 'green';
  } catch {
    return 'green';
  }
}

export function useWorkspaceAccent() {
  const [accent, setAccentState] = useState(readAccent);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === KEY || event.key === null) setAccentState(readAccent());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const setAccent = useCallback((next: Accent) => {
    setAccentState(next);
    try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
  }, []);

  return [accent, setAccent] as const;
}
