// ── iterra bridge ────────────────────────────────────────────────────────────
// Registers the register with the terrain shell and publishes a small live
// summary for the Today rail — plus the ambient layer: commons field
// (shared.register), the entity index for the palette, and feed entries when
// a hit lands. Loaded once from main.tsx; no-ops standalone (window.iterra
// only exists when public/iterra-hub.js ran inside the shell).

import { useEffect, useState } from 'react';
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
      doc: (ns: string) => {
        get: () => unknown;
        set: (v: unknown) => void;
        setField: (field: string, v: unknown) => void;
        subscribe: (cb: (v: unknown) => void) => () => void;
      };
      feed: (item: { text: string; url?: string; course?: string; topic?: string }) => void;
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

  const shared = iterra.doc('shared');
  const indexDoc = iterra.doc('index.rhythm');
  let lastEntitiesJson = '';
  let lastCommonsJson = '';
  let lastEntryIds: Set<string> | null = null;

  const publishDocs = () => {
    try {
      publishDocsInner();
    } catch (e) {
      console.warn("iterra ambient publish failed:", e);
    }
  };
  const publishDocsInner = () => {
    const s = useRegister.getState();
    const sum = summary();

    /* commons — shared.register: today through the register's eyes */
    if (sum) {
      const v = { marked: sum.marked, pending: sum.pending };
      const j = JSON.stringify(v);
      if (j !== lastCommonsJson) {
        lastCommonsJson = j;
        shared.setField('register', { v, by: 'rhythm', at: Date.now() });
      }
    }

    /* entity index — one row per live channel for the terrain palette */
    const entities = Object.values(s.routines)
      .filter((r) => r.status !== 'archived')
      .slice(0, 50)
      .map((r) => ({
        t: 'routine',
        id: r.id,
        title: r.name,
        sub: `${r.target.perWeek}×/wk`,
        course: r.courseId ? (s.courses[r.courseId]?.code ?? s.courses[r.courseId]?.name) : undefined,
        url: `/apps/rhythm/?routine=${encodeURIComponent(r.name)}`,
        at: Date.now(),
      }));
    const ej = JSON.stringify(entities.map((e) => ({ ...e, at: 0 })));
    if (ej !== lastEntitiesJson) {
      lastEntitiesJson = ej;
      indexDoc.set({ entities });
    }

    /* feed — a hit landing is terrain news; track newly-appearing entry ids */
    const ids = new Set(Object.keys(s.entries));
    if (lastEntryIds) {
      /* register completing is the other half of the contract: the day going
         from open lines to none. Baseline is captured silently below. */
      const routineCourse = (cid: string | undefined) =>
        cid ? (s.courses[cid]?.code ?? s.courses[cid]?.name) : undefined;
      if (sum && prevPending !== null && prevPending > 0 && sum.pending === 0 && sum.total > 0) {
        /* a day-aggregate: tag the key only when every marked entry shares it */
        const keys = new Set(
          Object.values(s.entries)
            .map((e) => routineCourse(s.routines[e.routineId]?.courseId))
            .filter(Boolean),
        );
        iterra.feed({
          text: `register complete — ${sum.total}/${sum.total} for today`,
          url: '/apps/rhythm/',
          course: keys.size === 1 ? [...keys][0] : undefined,
        });
      }
      for (const id of ids) {
        if (!lastEntryIds.has(id)) {
          const e = s.entries[id];
          const r = e ? s.routines[e.routineId] : null;
          iterra.feed({
            text: `${r?.name ?? 'a channel'} hit${e?.isMinimum ? ' (minimum)' : ''}`,
            url: '/apps/rhythm/',
            course: routineCourse(r?.courseId),
          });
        }
      }
    }
    lastEntryIds = ids;
    if (sum) prevPending = sum.pending;
  };

  useRegister.subscribe(publishDocs);
  let prevPending: number | null = null;
  if (useRegister.persist.hasHydrated()) publishDocs();
  else useRegister.persist.onFinishHydration(publishDocs);
}

wireIterra();

/* commons read: shared.focus — the Instruments' running block. It is written
   once when the countdown starts, so it stays 'fresh' for the block's own
   span (endsInMin) plus a small grace; a stopped focus reads stale instantly. */
interface FocusEntry {
  v: { label?: string; running?: boolean; endsInMin?: number } | null;
  by: string;
  at: number;
}

export function useSharedFocus(): FocusEntry | null {
  const [entry, setEntry] = useState<FocusEntry | null>(null);
  useEffect(() => {
    const shared = window.iterra?.doc?.('shared');
    if (!shared) return;
    const read = (doc: unknown) => {
      const e = (doc as { focus?: FocusEntry } | null)?.focus ?? null;
      setEntry(e && typeof e === 'object' ? e : null);
    };
    read(shared.get());
    return shared.subscribe(read);
  }, []);
  if (!entry?.v?.running) return null;
  const spanMs = (entry.v.endsInMin ?? 0) * 60_000 + 60_000;
  if (Date.now() - entry.at > spanMs) return null;
  return entry;
}
