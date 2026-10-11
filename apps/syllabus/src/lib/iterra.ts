// ── iterra bridge ────────────────────────────────────────────────────────────
// Announces the folio to the terrain and publishes a small live summary for
// the shell's Today rail. Read-only: the bridge never mutates the store.
// Contract: docs/WIRING.md §3 — summary shape { slips, overdue, top }.

import { useFolio } from '../store';
import { todayISO } from './utils';

declare global {
  interface Window {
    iterra?: any;
  }
}

interface FolioSummary {
  slips: number;
  overdue: number;
  top: string | null;
}

function summary(): FolioSummary | null {
  const s = useFolio.getState();
  if (!s.booted) return null;

  const today = todayISO();
  const blocks = Object.values(s.blocks);
  const commitments = Object.values(s.commitments);

  const slips = blocks.filter((b) => b.plannedDate === today && b.state !== 'done').length;
  const overdue = commitments.filter((c) => c.status === 'open' && c.dueAt.slice(0, 10) < today).length;

  // Highest-priority remaining block = the scheduler's max score among slips
  // still awaiting a stamp (done/deferred no longer compete for next).
  const remaining = blocks.filter((b) => b.state !== 'done' && b.state !== 'deferred');
  let top: string | null = null;
  let best = remaining[0];
  for (const b of remaining) {
    if (
      b.score > best.score ||
      (b.score === best.score &&
        (b.plannedDate < best.plannedDate ||
          (b.plannedDate === best.plannedDate && b.order < best.order)))
    ) {
      best = b;
    }
  }
  if (best) {
    const c = s.commitments[best.commitmentId];
    top = c?.title ?? best.label ?? null;
  }

  return { slips, overdue, top };
}

export function wireIterra() {
  const iterra = window.iterra;
  if (!iterra) return;
  iterra.register('syllabus', {
    title: 'Syllabus',
    summary,
  });
}

wireIterra();
