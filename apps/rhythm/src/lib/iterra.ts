// ── iterra bridge ────────────────────────────────────────────────────────────
// Registers the register with the terrain shell and publishes a small live
// summary for the Today rail. Loaded once from main.tsx; no-ops standalone
// (window.iterra only exists when public/iterra-hub.js ran inside the shell).

import { todayISO } from './dates';
import { entriesOn, isScheduled } from './register';
import { useRegister } from '../store';
import type { Routine } from './types';

declare global {
  interface Window {
    iterra?: {
      register: (
        name: string,
        opts: { title: string; summary: () => Record<string, number> | null },
      ) => void;
    };
  }
}

/** What the rail reads: marked lines, lines due today, lines still open. */
function summary(): { marked: number; total: number; pending: number } | null {
  if (!useRegister.persist.hasHydrated()) return null;
  const s = useRegister.getState();
  const today = todayISO();
  // Due today = the Scheduled section's own rule: active and on today's line-up.
  const due = Object.values(s.routines).filter(
    (r: Routine) => r.status === 'active' && isScheduled(r, today),
  );
  // A line is marked once the routine has any entry today — per-routine, so
  // pending stays the count of open lines even when one routine logs twice.
  const marked = due.filter((r) => entriesOn(s.entries, r.id, today).length > 0).length;
  return { marked, total: due.length, pending: Math.max(0, due.length - marked) };
}

export function wireIterra() {
  const iterra = window.iterra;
  if (!iterra) return;
  iterra.register('rhythm', { title: 'Rhythm', summary });
}

wireIterra();
