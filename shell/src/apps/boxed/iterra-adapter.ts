/* iterra adapter — boxed's one door to the canonical store.
   Contract: docs/ADAPTER.md.

   What this does:
   • mirrors the board's tasks and time blocks into iterra.store as
     'boxed:task:<date>:<id>' / 'boxed:block:<date>:<id>' entities — diff-aware,
     so a burst of captures lands as one put per changed entity
   • answers 'task.add' intakes — any sibling surface (palette send-to,
     dossier action, another app's command) can file work into the dump
   • resolves a planning-filed task's syllabus commitment for course linkage
   • republishes on wake (keep-alive frames miss ticks while hidden) */

import { board, currentBoard, isDateKey, minutesOf, todayKey, type Board, type Task } from './store';
import type { StoreEntity } from '../../hub';

declare const window: any;

const hub = () => (typeof window !== 'undefined' ? window.iterra : undefined);

/* ── entity shapes ─────────────────────────────────────────────────────── */

const placeUrl = (date: string, blockId?: string) =>
  `/apps/boxed/?${new URLSearchParams({ date, ...(blockId ? { focusBlock: blockId } : {}) })}`;

function taskEntity(date: string, t: Task, course?: { course?: string; courseId?: string; topic?: string }): Record<string, unknown> {
  return {
    app: 'boxed',
    type: 'task',
    id: `${date}:${t.id}`,
    title: t.title,
    sub: [
      t.zone === 'top' ? 'top item' : 'brain dump',
      t.estimateMin ? `${t.estimateMin}m` : '',
      date === todayKey() ? 'today' : date,
    ]
      .filter(Boolean)
      .join(' · '),
    course: t.course ?? course?.course,
    courseId: t.courseId ?? course?.courseId,
    topic: t.topic ?? course?.topic,
    url: placeUrl(date),
    createdAt: t.createdAt,
    data: {
      date,
      zone: t.zone,
      ...(t.estimateMin ? { estimateMin: t.estimateMin } : {}),
      ...(t.commitmentId ? { commitmentId: t.commitmentId } : {}),
      ...(t.origin ? { origin: t.origin } : {}),
    },
  };
}

function blockEntity(
  date: string,
  blk: { id: string; taskId: string; start: string; end: string; status: string },
  t: Task | undefined,
  course?: { course?: string; courseId?: string; topic?: string },
): Record<string, unknown> {
  return {
    app: 'boxed',
    type: 'block',
    id: `${date}:${blk.id}`,
    title: t?.title ?? 'Time box',
    sub: `${blk.start}–${blk.end} · ${blk.status}`,
    course: t?.course ?? course?.course,
    courseId: t?.courseId ?? course?.courseId,
    topic: t?.topic ?? course?.topic,
    url: placeUrl(date, blk.id),
    data: {
      date,
      taskId: blk.taskId,
      start: blk.start,
      end: blk.end,
      status: blk.status,
      startMin: minutesOf(blk.start),
      durationMin: minutesOf(blk.end) - minutesOf(blk.start),
    },
  };
}

/* ── registered adapter ────────────────────────────────────────────────── */

let registered = false;

export function registerAdapter() {
  const it = hub();
  if (!it?.adapter || !it?.store || registered) return;
  registered = true;

  /* ── incremental mirror: published wire-shape per key + a removal set ── */
  const published = new Map<string, string>();
  const failed = new Map<string, string>();
  const removed = new Set<string>();
  let drainP: Promise<void> = Promise.resolve();
  let drainScheduled = false;

  /* commitment → course linkage, resolved lazily through the canonical store
     (the commitment's own courseId IS the canonical key — never fabricated) */
  const courseCache = new Map<string, Promise<{ course?: string; courseId?: string; topic?: string } | undefined>>();
  const courseFor = (t: Task): Promise<{ course?: string; courseId?: string; topic?: string } | undefined> => {
    if (t.courseId || t.course) return Promise.resolve({ course: t.course, courseId: t.courseId, topic: t.topic });
    if (!t.commitmentId) return Promise.resolve(undefined);
    if (!courseCache.has(t.commitmentId)) {
      courseCache.set(
        t.commitmentId,
        Promise.resolve(it.store.get(`syllabus:commitment:${t.commitmentId}`))
          .then((ent: StoreEntity | null) =>
            ent
              ? { course: ent.course, courseId: ent.courseId, topic: ent.topic }
              : undefined,
          )
          .catch(() => undefined),
      );
    }
    return courseCache.get(t.commitmentId)!;
  };

  const currentEntities = async (): Promise<Map<string, Record<string, unknown>>> => {
    const s = board.getState();
    const out = new Map<string, Record<string, unknown>>();
    for (const [date, b] of Object.entries(s.days)) {
      for (const id of [...b.topOrder, ...b.dumpOrder]) {
        const t = b.tasks[id];
        if (!t) continue;
        out.set(`boxed:task:${date}:${t.id}`, taskEntity(date, t, await courseFor(t)));
      }
      for (const blk of Object.values(b.blocks)) {
        const t = b.tasks[blk.taskId];
        if (!t) continue;
        out.set(`boxed:block:${date}:${blk.id}`, blockEntity(date, blk, t, await courseFor(t)));
      }
    }
    return out;
  };

  const queueDrain = () => {
    if (drainScheduled) return;
    drainScheduled = true;
    drainP = drainP
      .then(drain)
      .catch(() => {})
      .finally(() => {
        drainScheduled = false;
      });
  };

  async function drain(): Promise<void> {
    const current = await currentEntities();
    for (const key of [...removed]) {
      removed.delete(key);
      if (published.delete(key)) {
        const ok = await it.store.remove(key).then(() => true).catch(() => false);
        if (!ok) {
          published.set(key, '');
          removed.add(key);
        }
      }
    }
    for (const [key, ent] of current) {
      const j = JSON.stringify(ent);
      removed.delete(key);
      if (published.get(key) !== j && failed.get(key) !== j) {
        const res = await it.store.put(ent).catch(() => null);
        if (res && (res as { ok?: boolean }).ok !== false) {
          published.set(key, j);
          failed.delete(key);
        } else {
          failed.set(key, j);
        }
      }
    }
    for (const key of [...published.keys()]) {
      if (!current.has(key)) {
        published.delete(key);
        removed.add(key);
      }
    }
    for (const key of [...failed.keys()]) {
      if (!current.has(key)) failed.delete(key);
    }
  }

  board.subscribe(queueDrain);
  queueDrain();

  /* ── intakes ── */

  it.adapter({
    name: 'boxed',
    title: 'Boxed',
    summary: () => {
      const s = board.getState();
      const b = currentBoard(s);
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const blocks = Object.values(b.blocks).filter((blk) => b.tasks[blk.taskId]);
      const active = blocks.find(
        (blk) =>
          minutesOf(blk.start) <= nowMin &&
          minutesOf(blk.end) > nowMin &&
          blk.status !== 'done' &&
          blk.status !== 'skipped' &&
          blk.status !== 'missed',
      );
      return {
        top: b.topOrder.filter((id) => b.tasks[id]).length,
        scheduled: blocks.length,
        active: active ? (b.tasks[active.taskId]?.title ?? null) : null,
      };
    },
    intakes: {
      /* {title, estimateMin?, zone?, date?, course?, courseId?, topic?} —
         entity fields stand in when the payload is bare (the palette's
         send-to ships {to,action,entity} only). Files into the dump;
         zone:'top' files straight into priorities. Redelivery dedupes on
         the intake id via task.origin. */
      'task.add': async (rec: any) => {
        const p = (rec?.payload ?? {}) as Record<string, any>;
        const e = rec?.entity ?? {};
        const title = String(p.title ?? e.title ?? '').trim();
        if (!title) return { url: null, toast: 'task.add needs a title — nothing captured' };
        const date = isDateKey(p.date) ? p.date : todayKey();
        /* already filed by an earlier delivery of this same record? */
        const dupe = Object.values(board.getState().days).some((b: Board) =>
          Object.values(b.tasks).some((t) => t.origin === rec?.id),
        );
        if (dupe) {
          return { url: placeUrl(date), navigate: false, toast: `“${title}” — already on the board` };
        }
        const estimate = Number(p.estimateMin ?? e.data?.estimateMin ?? e.data?.estimatedMinutes);
        const zone = p.zone === 'top' || e.data?.zone === 'top' ? 'top' : 'dump';
        const { ids } = board.addTasks(
          [
            {
              title,
              zone,
              origin: typeof rec?.id === 'string' ? rec.id : undefined,
              estimateMin: Number.isFinite(estimate) && estimate > 0 ? Math.round(estimate) : undefined,
              course: typeof p.course === 'string' ? p.course : e.course,
              courseId: typeof p.courseId === 'string' ? p.courseId : e.courseId,
              topic: typeof p.topic === 'string' ? p.topic : e.topic,
              commitmentId: typeof p.commitmentId === 'string' ? p.commitmentId : undefined,
            },
          ],
          date,
        );
        if (!ids.length) return { url: null, toast: `“${title}” — already on the board` };
        return {
          url: placeUrl(date),
          toast: `“${title}” — in the ${zone === 'top' ? 'top items' : 'brain dump'}`,
        };
      },
    },
    /* keep-alive wake: re-diff the mirror — an external store.remove or a
       missed tick while hidden leaves `published` claiming writes that
       never landed */
    wake: () => queueDrain(),
  });
}

if (typeof window !== 'undefined') registerAdapter();
