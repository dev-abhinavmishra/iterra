// ── The playhead — one ticker, every measure shares it ───────────────────────
// A real sequencer has a single transport: all channel strips light the same
// step at the same time. Subscribers get the live step index (0–6, one week);
// disabled (reduced motion) returns -1 — no sweep, the current step marker
// alone still says where the song is.

import { useSyncExternalStore } from 'react';

const STEP_MS = 900;
const STEPS = 7;

const listeners = new Set<() => void>();
let idx = 0;
let timer: number | null = null;

function tick() {
  idx = (idx + 1) % STEPS;
  listeners.forEach((l) => l());
}

export function usePlayhead(enabled: boolean): number {
  return useSyncExternalStore(
    (cb) => {
      if (!enabled) return () => {};
      listeners.add(cb);
      timer ??= window.setInterval(tick, STEP_MS);
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0 && timer !== null) {
          window.clearInterval(timer);
          timer = null;
        }
      };
    },
    () => (enabled ? idx : -1),
    () => -1,
  );
}
