/* Boxed ↔ terrain ambient layer.

   Presence (the Today rail's {top, scheduled, active} line), the entity index
   for the palette and cross-place linking, the commons field `shared.board`,
   and feed stirs for the moments worth seeing terrain-wide: a block taking a
   slot, a block stamping done. All reads go through the board store — the
   same object the adapter mutates — so a cold intake and a warm board publish
   identically. */

import { board, currentBoard, EMPTY_BOARD, isDateKey, minutesOf, todayKey, type State } from './store';
import type { Entity } from '../../hub';

const placeUrl = (date: string, blockId?: string) =>
  `/apps/boxed/?${new URLSearchParams({ ...(isDateKey(date) ? { date } : {}), ...(blockId ? { focusBlock: blockId } : {}) })}`;

function boardSummary(state: State, now: Date) {
  const b = currentBoard(state, todayKey(now));
  const blocks = Object.values(b.blocks).filter((blk) => b.tasks[blk.taskId]);
  const nowMin = now.getHours() * 60 + now.getMinutes();
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
}

export function wireIterra() {
  const iterra = window.iterra;
  if (!iterra) return;

  /* presence — same {top,scheduled,active} shape the rail already reads */
  iterra.register('boxed', {
    ownKeys: ['/'],
    title: 'Boxed',
    summary: () => boardSummary(board.getState(), new Date()),
  });

  const indexDoc = iterra.doc('index.boxed');
  const shared = iterra.doc('shared');

  /* ── entity index ── today and future boards only: a task filed for a day
     that already passed is history, not something the palette should offer.
     Cap 50, soonest day first. */
  const indexEntities = (): Entity[] => {
    const s = board.getState();
    const today = todayKey();
    const out: Entity[] = [];
    const days = Object.keys(s.days)
      .filter((d) => d >= today)
      .sort();
    for (const date of days) {
      const b = s.days[date] || EMPTY_BOARD;
      for (const id of [...b.topOrder, ...b.dumpOrder]) {
        const t = b.tasks[id];
        if (!t) continue;
        out.push({
          t: 'task',
          id: `${date}:${t.id}`,
          title: t.title,
          sub: [
            t.zone === 'top' ? 'top item' : 'in the dump',
            t.estimateMin ? `${t.estimateMin}m` : '',
            date === today ? 'today' : date,
          ]
            .filter(Boolean)
            .join(' · '),
          course: t.course,
          topic: t.topic,
          url: placeUrl(date),
          at: t.createdAt,
        });
      }
      for (const blk of Object.values(b.blocks)) {
        const t = b.tasks[blk.taskId];
        if (!t) continue;
        out.push({
          t: 'block',
          id: `${date}:${blk.id}`,
          title: t.title,
          sub: `${blk.start}–${blk.end} · ${blk.status}`,
          course: t.course,
          topic: t.topic,
          url: placeUrl(date, blk.id),
          at: t.createdAt,
        });
      }
      if (out.length >= 50) break;
    }
    return out.slice(0, 50);
  };

  /* ── commons: shared.board — the rail's one-line read on the day.
     Diff-checked: a keystroke-level mutation shouldn't rewrite the doc. ── */
  let lastCommonsJson = '';
  const publishShared = () => {
    const s = board.getState();
    const sum = boardSummary(s, new Date());
    const v = {
      top: sum.top,
      scheduled: sum.scheduled,
      active: sum.active,
      plannedMin: Object.values(currentBoard(s, todayKey()).blocks).reduce(
        (n, blk) => n + Math.max(0, minutesOf(blk.end) - minutesOf(blk.start)),
        0,
      ),
    };
    const j = JSON.stringify(v);
    if (j === lastCommonsJson) return;
    lastCommonsJson = j;
    shared.setField?.('board', { v, by: 'boxed', at: Date.now() });
  };

  /* ── feed stirs — diff block births and done-stamps across store changes.
     First observation seeds silently so a reload doesn't replay history. ── */
  const seenBlocks = new Map<string, { status: string; title: string; date: string; course?: string }>();
  let seeded = false;

  const stir = (text: string, url: string, course?: string, topic?: string) => {
    try {
      iterra.feed?.({ app: 'boxed', text, url, course, topic });
    } catch {
      /* feed is best-effort */
    }
  };

  const publish = () => {
    try {
      const s = board.getState();
      const entities = indexEntities();
      const indexJson = JSON.stringify(entities.map((e) => ({ ...e, at: 0 })));
      if (indexJson !== lastIndexJson) {
        lastIndexJson = indexJson;
        indexDoc.set({ entities });
      }
      publishShared();

      const next = new Map<string, { status: string; title: string; date: string; course?: string; topic?: string }>();
      for (const [date, b] of Object.entries(s.days)) {
        for (const blk of Object.values(b.blocks)) {
          const t = b.tasks[blk.taskId];
          if (!t) continue;
          next.set(blk.id, {
            status: blk.status,
            title: t.title,
            date,
            course: t.course,
            topic: t.topic,
          });
        }
      }
      if (seeded) {
        for (const [id, cur] of next) {
          const prev = seenBlocks.get(id);
          if (!prev) {
            /* a block appearing already 'done' is a restore/import, not news */
            if (cur.status === 'planned' || cur.status === 'active') {
              stir(
                `time-boxed “${cur.title}” · ${dateLabel(cur.date)}`,
                placeUrl(cur.date, id),
                cur.course,
                cur.topic,
              );
            }
          } else if (prev.status !== 'done' && cur.status === 'done') {
            stir(`done “${cur.title}”`, placeUrl(cur.date, id), cur.course, cur.topic);
          }
        }
      }
      seenBlocks.clear();
      for (const [k, v] of next) seenBlocks.set(k, v);
      seeded = true;
    } catch (e) {
      console.warn('iterra ambient publish failed:', e);
    }
  };

  let lastIndexJson = '';
  board.subscribe(publish);
  publish();
  /* the 'active' field is clock-derived — a block starting doesn't mutate the
     board, so re-evaluate the commons line once a minute */
  window.setInterval?.(publishShared, 60_000);
}

function dateLabel(date: string): string {
  if (date === todayKey()) return 'today';
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

wireIterra();
