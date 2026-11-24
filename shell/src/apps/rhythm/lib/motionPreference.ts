import { useSyncExternalStore } from 'react';
import type { AppSettings } from './types';

const QUERY = '(prefers-reduced-motion: reduce)';

function mediaQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : null;
}

export function subscribeToMotionPreference(onChange: () => void): () => void {
  const media = mediaQuery();
  if (!media) return () => {};
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }
  media.addListener(onChange);
  return () => media.removeListener(onChange);
}

function getReducedMotion(): boolean {
  return mediaQuery()?.matches ?? false;
}

export function motionEnabledFor(
  preference: AppSettings['motion'],
  reducedMotion: boolean,
): boolean {
  return preference === 'full' || (preference === 'system' && !reducedMotion);
}

export function useMotionEnabled(preference: AppSettings['motion']): boolean {
  const reducedMotion = useSyncExternalStore(subscribeToMotionPreference, getReducedMotion, () => false);
  return motionEnabledFor(preference, reducedMotion);
}
