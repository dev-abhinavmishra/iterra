// ── iterra bridge ────────────────────────────────────────────────────────────
// Announces the folio to the terrain and publishes a small live summary for
// the shell's Today rail. Read-only: the bridge never mutates the store.
// Contract: docs/WIRING.md §3 — summary shape { slips, overdue, top }.

import { useEffect, useState } from 'react';
import { useFolio } from '../store';
import { todayISO, dueDateISO } from './utils';
import { commitmentEntity } from './iterra-adapter';
import type { Commitment } from './types';

/* window.iterra's global declaration lives in shell/src/hub.ts — the shared
   type surface covers every member this file calls. */

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
  const overdue = commitments.filter((c) => c.status === 'open' && typeof c.dueAt === 'string' && dueDateISO(c.dueAt) < today).length;

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
    /* '?' opens this place's own help sheet — the terrain's cheatsheet
       yields to it while the folio is in front. */
    ownKeys: ['?'],
  });
}

wireIterra();

// ── canonical-store reads — the bridge chips' data source (WIRING §7) ───────
// Every count here derives from entities siblings mirrored into it.store.

/** Pull store.list once, then again on every store write and on a slow tick —
 *  siblings mount late, so a first empty answer shouldn't stay empty. */
function useStoreRows(filter: Record<string, unknown>): any[] | null {
  const [rows, setRows] = useState<any[] | null>(null);
  const key = JSON.stringify(filter);
  useEffect(() => {
    const it = window.iterra;
    const store = it?.store;
    if (!store?.list) { setRows(null); return; }
    let alive = true;
    let inflight = false;
    const pull = async () => {
      if (inflight) return;
      inflight = true;
      try {
        const r: any[] = await Promise.resolve(store.list(JSON.parse(key))).catch(() => []);
        if (alive) setRows(r ?? []);
      } finally {
        inflight = false;
      }
    };
    void pull();
    let unsub: (() => void) | undefined;
    try { unsub = store.subscribe?.(() => void pull()); } catch { /* subscribe is best-effort */ }
    const iv = setInterval(() => void pull(), 30_000);
    return () => { alive = false; unsub?.(); clearInterval(iv); };
  }, [key]);
  return rows;
}

/** Cards due now — the cardfile schedules by status, not timestamps:
 *  data.dueAt is 0 while a card is due and null once mastered. */
export function useDueCardsCount(): number | null {
  const rows = useStoreRows({ app: 'flashcards', type: 'card' });
  if (!rows) return null;
  const now = Date.now();
  return rows.filter((e) => typeof e?.data?.dueAt === 'number' && e.data.dueAt <= now).length;
}

function sameLocalDay(ts: unknown, now: Date): boolean {
  const d = new Date(ts as any);
  return (
    !isNaN(d.getTime()) &&
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Timer minutes logged today — session entities stamp createdAt (with
 *  data.endedAt as fallback) and carry their length in data.minutes. */
export function useTodayLoggedMinutes(): number | null {
  const rows = useStoreRows({ app: 'timer', type: 'session' });
  if (!rows) return null;
  const now = new Date();
  return rows.reduce(
    (acc, e) =>
      sameLocalDay(e?.createdAt ?? e?.data?.endedAt, now) ? acc + (Number(e?.data?.minutes) || 0) : acc,
    0,
  );
}

// ── sends — one path shared by the §2 row verbs and the drawer footer ────────
// Contract: docs/ADAPTER.md intake catalogue (routine.plan, cards.create).
// Both resolve { ok, delivered:'direct'|'queued', url } — direct delivery
// returns the created entity's deep-link, a queued send the ?intake= url.

/** File a commitment onto rhythm's register as a routine. */
export async function sendCommitmentToRegister(c: Commitment, courseCode?: string) {
  const it = window.iterra;
  if (!it?.send) return null;
  return (await it.send({
    to: 'rhythm',
    action: 'routine.plan',
    payload: {
      name: c.title,
      courseId: `syllabus:course:${c.courseId}`,
      course: courseCode,
      dueAt: c.dueAt,
      minutes: c.estimatedMinutes || undefined,
    },
  })) ?? null;
}

/** Deal a commitment to the cardfile as a recall card in a deck named for
 *  the course; the mirrored commitmentEntity travels as `entity` so each
 *  card's lineage links back to the folio. */
export async function sendCommitmentToCards(c: Commitment, courseCode?: string) {
  const it = window.iterra;
  if (!it?.send) return null;
  return (await it.send({
    to: 'flashcards',
    action: 'cards.create',
    entity: commitmentEntity(c, courseCode),
    payload: {
      cards: [{ q: `${c.title} — recall`, a: c.detail || c.title }],
      deckTitle: courseCode,
      course: courseCode,
      courseId: `syllabus:course:${c.courseId}`,
    },
  })) ?? null;
}

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
              /* a focus launched off this card must carry the full binding —
                 commitmentId files minutes back, materialRef opens the deck */
              commitmentId: top.commitmentId,
              courseId: topCourseId ? `syllabus:course:${topCourseId}` : undefined,
              materialRef: top.materialRef ?? undefined,
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
            // commitments land on their drawer via the ?commitment= intake
            url: `/apps/syllabus/?commitment=${encodeURIComponent(c.id)}`, at: Date.now() };
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

import './iterra-adapter';
