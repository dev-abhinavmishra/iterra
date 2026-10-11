// ── iterra environment bridge ────────────────────────────────────────────────
// Announces Proof to the shell and publishes a small summary for the Today
// rail (~every 3s, JSON-diffed by the hub). No-ops standalone.

import { useWorkbench } from '../store';

declare global {
  interface Window {
    iterra?: any;
  }
}

export function wireIterra() {
  const iterra = window.iterra;
  if (!iterra) return;
  iterra.register('proof', {
    title: 'Proof',
    summary: () => {
      const s = useWorkbench.getState();
      if (!s.booted) return null;
      return {
        due: s.dueReviews().length,
        attempts: Object.keys(s.attempts || {}).length,
      };
    },
  });
}

wireIterra();
