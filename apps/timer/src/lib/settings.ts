/* Persisted app settings — accent theme, sound, motion level.
   Tiny external store so every view shares one source of truth. */

import { useSyncExternalStore } from 'react';
import { setSoundEnabled } from './sound';

export interface AccentTheme {
  name: string;
  signal: string;
  bright: string;
  deep: string;
}

export const ACCENTS: AccentTheme[] = [
  { name: 'Signal',  signal: '#E8490F', bright: '#FF5A1E', deep: '#B33405' },
  { name: 'Racing',  signal: '#3E7C4F', bright: '#4F9A62', deep: '#2A5A37' },
  { name: 'Marine',  signal: '#1E5FAA', bright: '#2F7BD0', deep: '#144578' },
  { name: 'Brass',   signal: '#A67C1E', bright: '#C89B2E', deep: '#7C5C10' },
  { name: 'Crimson', signal: '#B32340', bright: '#D92F50', deep: '#841828' },
];

export interface AppSettings {
  accent: string;      // ACCENTS[].name
  sound: boolean;
  motion: 'full' | 'reduced';
  theme: 'day' | 'night';
}

const KEY = 'timer.settings.v1';
const LEGACY_KEYS = ['platform.settings.v1'];
const DEFAULTS: AppSettings = { accent: 'Signal', sound: true, motion: 'full', theme: 'day' };

let current: AppSettings = (() => {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      // one-time key migration — keep the user's settings
      for (const legacy of LEGACY_KEYS) {
        const old = localStorage.getItem(legacy);
        if (old) { raw = old; localStorage.setItem(KEY, old); localStorage.removeItem(legacy); break; }
      }
    }
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch { return DEFAULTS; }
})();

const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }

export function getSettings() { return current; }

export function updateSettings(patch: Partial<AppSettings>) {
  current = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(current));
  applySettings(current);
  emit();
}

const hexToRgbTriplet = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

export function applySettings(s: AppSettings = current) {
  const t = getAccent(s.accent);
  const r = document.documentElement.style;
  r.setProperty('--color-signal', t.signal);
  r.setProperty('--color-signal-bright', t.bright);
  r.setProperty('--color-signal-deep', t.deep);
  r.setProperty('--signal-rgb', hexToRgbTriplet(t.signal));
  document.documentElement.dataset.motion = s.motion;
  document.documentElement.dataset.theme = s.theme;
  setSoundEnabled(s.sound);
}

export function getAccent(name: string): AccentTheme {
  return ACCENTS.find(a => a.name === name) || ACCENTS[0];
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
  );
}
