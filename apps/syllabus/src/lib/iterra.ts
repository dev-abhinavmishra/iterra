// ── iterra bridge ────────────────────────────────────────────────────────────
// Announces the folio to the terrain and publishes a small live summary for
// the shell's Today rail. Read-only: the bridge never mutates the store.
// Contract: docs/WIRING.md §3 — summary shape { slips, overdue, top }.

import { useEffect, useState } from 'react';
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

// Highest-priority remaining block = the scheduler's max score among slips
// still awaiting a stamp (done/deferred no longer compete for next).
function nextWorkBlock(s: ReturnType<typeof useFolio.getState>) {
  const remaining = Object.values(s.blocks).filter((b) => b.state !== 'done' && b.state !== 'deferred');
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
  return best ?? null;
}

function summary(): FolioSummary | null {
  const s = useFolio.getState();
  if (!s.booted) return null;

  const today = todayISO();
  const blocks = Object.values(s.blocks);
  const commitments = Object.values(s.commitments);

  const slips = blocks.filter((b) => b.plannedDate === today && b.state !== 'done').length;
  const overdue = commitments.filter((c) => c.status === 'open' && typeof c.dueAt === 'string' && c.dueAt.slice(0, 10) < today).length;

  const best = nextWorkBlock(s);
  let top: string | null = null;
  if (best) {
    const c = s.commitments[best.commitmentId];
    top = c?.title ?? best.label ?? null;
  }

  return { slips, overdue, top };
}

// ── shared.focus reader (the FOCUS chip on slips) ────────────────────────────
// Writes to the commons/index docs live in the ambient layer below — this is
// only the read-side hook BlockSlip uses.

const FOCUS_FRESH_MS = 60_000;

function readFocus(doc: any): { running: boolean; blockId?: string } | null {
  const f = doc?.get?.()?.focus;
  if (!f || !f.v || Date.now() - (f.at ?? 0) > FOCUS_FRESH_MS) return null;
  return f.v;
}

/**
 * True while the timer's shared.focus says a session is running on this
 * block (or any block when blockId is omitted). Re-checks on doc writes and
 * on a slow tick so a stale signal fades without waiting for a write.
 */
export function useSharedFocus(blockId?: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const doc = window.iterra?.doc?.('shared');
    if (!doc) return;
    const check = () => {
      const f = readFocus(doc);
      setOn(!!(f?.running && (!blockId || f.blockId === blockId)));
    };
    check();
    const unsub = doc.subscribe(check);
    const iv = setInterval(check, 15_000);
    return () => { unsub?.(); clearInterval(iv); };
  }, [blockId]);
  return on;
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

// ── ambient layer — commons, entity index, feed (WIRING §7) ──────────────────
(() => {
  const it: any = (window as any).iterra;
  if (!it) return;
  const shared = it.doc('shared');
  const indexDoc = it.doc('index.syllabus');
  let lastCommons = '', lastCourse = '', lastEntities = '';
  let lastBlockStates: Record<string, string> | null = null;

  const publish = () => {
    try {
      publishInner();
    } catch (e) {
      // ambient writes must never take the app down — surface once, keep going
      console.warn('iterra ambient publish failed:', e);
    }
  };
  const publishInner = () => {
    const s = useFolio.getState();
    if (!s.booted) return;
    // active course = the course of today's top block, else the newest course
    const blocks = Object.values(s.blocks) as any[];
    const top = blocks.filter((b) => b.state !== 'done' && b.state !== 'deferred')
      .sort((a, b) => b.score - a.score || a.plannedDate.localeCompare(b.plannedDate) || a.order - b.order)[0];
    // WorkBlock carries commitmentId, not courseId — resolve through it
    const topCourseId = top ? (s.commitments as any)[top.commitmentId]?.courseId : null;
    const course = topCourseId ? (s.courses as any)[topCourseId] : Object.values(s.courses).sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
    const sum = summary();
    if (sum) {
      const v = {
        slips: sum.slips,
        overdue: sum.overdue,
        next: sum.top,
        // the terrain's next-up card deep-links this straight into a bound
        // timer session — id is the block id file-back stamps
        nextBlock: top
          ? {
              id: top.id,
              title: (s.commitments as any)[top.commitmentId]?.title ?? top.label ?? 'a block',
              minutes: top.plannedMinutes,
              course: (s.courses as any)[topCourseId]?.code,
            }
          : null,
      };
      const j = JSON.stringify(v);
      if (j !== lastCommons) { lastCommons = j; shared.setField('today', { v, by: 'syllabus', at: Date.now() }); }
    }
    const cv = course ? { code: (course as any).code, name: (course as any).name } : null;
    const cj = JSON.stringify(cv);
    if (cj !== lastCourse) { lastCourse = cj; shared.setField('activeCourse', { v: cv, by: 'syllabus', at: Date.now() }); }

    /* index — work blocks carry the id cross-app bindings reference
       (?block=<blockId> on bound sessions); commitments fill the rest */
    const blockEntities = (Object.values(s.blocks) as any[])
      .filter((b) => b.state !== 'done' && b.state !== 'deferred')
      .map((b) => {
        const c = (s.commitments as any)[b.commitmentId];
        const co = (s.courses as any)[c?.courseId];
        return { t: 'block', id: b.id, title: c?.title ?? b.label ?? 'a block', sub: co?.code,
          course: co?.code, url: `/apps/syllabus/?block=${encodeURIComponent(b.id)}`, at: Date.now(), _commitment: b.commitmentId };
      });
    const covered = new Set(blockEntities.map((e: any) => e._commitment));
    const entities = [
      ...blockEntities.map(({ _commitment, ...e }: any) => e),
      ...(Object.values(s.commitments) as any[])
        .filter((c) => c.status === 'open' && !covered.has(c.id))
        .map((c) => {
          const co = (s.courses as any)[c.courseId];
          return { t: 'block', id: c.id, title: c.title, sub: co?.code, course: co?.code,
            url: `/apps/syllabus/`, at: Date.now() };
        }),
    ].slice(0, 50);
    const ej = JSON.stringify(entities.map((e) => ({ ...e, at: 0 })));
    if (ej !== lastEntities) { lastEntities = ej; indexDoc.set({ entities }); }

    const states: Record<string, string> = {};
    for (const b of Object.values(s.blocks) as any[]) states[b.id] = b.state;
    if (lastBlockStates) {
      for (const b of Object.values(s.blocks) as any[]) {
        if (b.state === 'done' && lastBlockStates[b.id] && lastBlockStates[b.id] !== 'done') {
          const c = (s.commitments as any)[b.commitmentId];
          it.feed({ text: `slip stamped: ${c?.title ?? b.label ?? 'a block'}`, url: `/apps/syllabus/?block=${encodeURIComponent(b.id)}`, course: c ? (s.courses as any)[c.courseId]?.code : undefined });
        }
      }
    }
    lastBlockStates = states;
  };

  useFolio.subscribe(publish);
  publish();
})();


/** Open an /apps/* deep link in place: framed routes through the shell so
 *  the sibling mounts inside the terrain; standalone keeps the old
 *  new-tab behaviour. */
export function openDeep(url: string) {
  const iterra = window.iterra;
  try {
    if (iterra?.isFramed?.() && iterra.open) { iterra.open(url); return; }
  } catch { /* fall through to the solo path */ }
  window.open(url, '_blank', 'noopener');
}
