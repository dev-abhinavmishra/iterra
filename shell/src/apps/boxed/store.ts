/* Boxed board store — the place's single source of truth.

   A vanilla pub/sub store (no framework) so the React surface and the iterra
   adapter mutate the same state: an intake landing while the place is cold
   still lands on the board the moment the chunk mounts. Persistence keeps the
   `boxed.v1.state` envelope the previous build wrote — existing boards,
   day ranges, and per-day history survive the rewrite untouched.

   History: every user-level mutation snapshots the prior {date,days,
   dayStart,dayEnd} onto `past` (cap 50) and clears `future`. Day navigation
   and clock-derived 'missed' stamps deliberately bypass history — Undo
   always reverses the last *choice*, not the passage of time. */

import { guardedStorage } from '../guardedStorage';

export type Zone = 'dump' | 'top';
export type Status = 'planned' | 'active' | 'done' | 'skipped' | 'missed';

export interface Task {
  id: string;
  title: string;
  zone: Zone;
  createdAt: number;
  estimateMin?: number;
  commitmentId?: string;
  /** intake record id that filed this task — redelivery dedupe */
  origin?: string;
  course?: string;
  courseId?: string;
  topic?: string;
}

export interface Block {
  id: string;
  taskId: string;
  start: string; // HH:MM
  end: string;   // HH:MM
  status: Status;
  actualStart?: number;
  actualEnd?: number;
}

export interface Board {
  tasks: Record<string, Task>;
  dumpOrder: string[];
  topOrder: string[];
  blocks: Record<string, Block>;
}

export interface Snapshot {
  date: string;
  days: Record<string, Board>;
  dayStart: number;
  dayEnd: number;
}

export interface State extends Snapshot {
  past: Snapshot[];
  future: Snapshot[];
}

export interface NewTask {
  title: string;
  zone?: Zone;
  estimateMin?: number;
  commitmentId?: string;
  origin?: string;
  course?: string;
  courseId?: string;
  topic?: string;
}

export const STORAGE_KEY = 'boxed.v1.state';
export const DAY_START = 6;
export const DAY_END = 23;
export const HOUR_PX = 76;
export const EMPTY_BOARD: Board = { tasks: {}, dumpOrder: [], topOrder: [], blocks: {} };

export const pad = (n: number) => String(n).padStart(2, '0');
export const todayKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
export const minutesOf = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
export const timeAt = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export const parseDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const isDateKey = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

const HISTORY_CAP = 50;

function loadState(): State {
  const fallback: State = {
    date: todayKey(),
    days: {},
    dayStart: DAY_START,
    dayEnd: DAY_END,
    past: [],
    future: [],
  };
  try {
    const raw = guardedStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<State>;
    if (!saved.days || typeof saved.days !== 'object') return fallback;
    const merged = { ...fallback, ...saved, past: [], future: [] };
    /* a corrupt blob can carry impossible hours or a bad date — the timeline
       math assumes 0 ≤ dayStart < dayEnd ≤ 24 and a parseable YYYY-MM-DD */
    const ds = Number(merged.dayStart);
    const de = Number(merged.dayEnd);
    if (!Number.isInteger(ds) || !Number.isInteger(de) || ds < 0 || de > 24 || ds >= de) {
      merged.dayStart = DAY_START;
      merged.dayEnd = DAY_END;
    } else {
      merged.dayStart = ds;
      merged.dayEnd = de;
    }
    if (!isDateKey(merged.date)) merged.date = todayKey();
    return merged;
  } catch {
    return fallback;
  }
}

function snapshot(state: State): Snapshot {
  return { date: state.date, days: state.days, dayStart: state.dayStart, dayEnd: state.dayEnd };
}

export function currentBoard(state: State, date = state.date): Board {
  return state.days[date] || EMPTY_BOARD;
}

/* ── quick-capture syntax ────────────────────────────────────────────────
   `title ~45`   → 45-minute estimate
   `title !`     → straight to Top Items
   `! title ~45` → both (leading bang also promotes)                        */

const ESTIMATE_RE = /\s+~\s*(\d{1,3})\s*$/;

export function parseCaptureLine(line: string): { title: string; estimateMin?: number; promote: boolean } {
  let rest = line.trim();
  let promote = false;
  if (rest.endsWith('!')) {
    promote = true;
    rest = rest.slice(0, -1).trim();
  }
  if (rest.startsWith('!')) {
    promote = true;
    rest = rest.slice(1).trim();
  }
  let estimateMin: number | undefined;
  const m = ESTIMATE_RE.exec(rest);
  if (m) {
    const mins = Math.round(Number(m[1]));
    if (mins >= 5 && mins <= 600) estimateMin = mins;
    rest = rest.slice(0, m.index).trim();
  }
  return { title: rest, estimateMin, promote };
}

export const ESTIMATE_PRESETS = [15, 30, 45, 60, 90, 120] as const;

export function formatEstimate(min?: number): string {
  if (!min || !Number.isFinite(min)) return '';
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`;
}

/* ── the store ─────────────────────────────────────────────────────────── */

type Listener = () => void;

class BoardStore {
  private state: State;
  private listeners = new Set<Listener>();

  constructor() {
    this.state = loadState();
  }

  getState = (): State => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    for (const l of this.listeners) l();
  }

  private persist() {
    const s = this.state;
    try {
      guardedStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ date: s.date, days: s.days, dayStart: s.dayStart, dayEnd: s.dayEnd }),
      );
    } catch {
      /* guardedStorage already surfaced the quota notice */
    }
  }

  /* history-recording mutation — returns the action label for a toast */
  private commit(label: string | null, mutate: (draft: State) => State | void): string | null {
    const prev = this.state;
    const next = mutate(prev) ?? prev;
    if (next === prev) return null;
    this.state = {
      ...next,
      past: [...prev.past, snapshot(prev)].slice(-HISTORY_CAP),
      future: [],
    };
    this.persist();
    this.emit();
    return label;
  }

  /* silent mutation — clock-derived writes (missed stamps) and bulk mirror
     fixes that must not pollute Undo */
  mutate(mutate: (draft: State) => State | void): void {
    const prev = this.state;
    const next = mutate(prev) ?? prev;
    if (next === prev) return;
    this.state = next;
    this.persist();
    this.emit();
  }

  /* ── day navigation (no history) ── */

  setDate(date: string) {
    if (!isDateKey(date) || date === this.state.date) return;
    this.state = { ...this.state, date };
    this.persist();
    this.emit();
  }

  stepDay(delta: number) {
    const d = parseDate(this.state.date);
    d.setDate(d.getDate() + delta);
    this.setDate(todayKey(d));
  }

  setDayRange(field: 'dayStart' | 'dayEnd', value: number) {
    this.commit(null, (old) => {
      if ((field === 'dayStart' && value >= old.dayEnd) || (field === 'dayEnd' && value <= old.dayStart)) return old;
      return { ...old, [field]: value };
    });
  }

  /* ── capture ── */

  /** add one or more already-parsed tasks; returns their ids */
  addTasks(input: NewTask[], date = this.state.date): { ids: string[]; label: string | null } {
    const clean = input
      .map((t) => ({ ...t, title: (t.title || '').trim() }))
      .filter((t) => t.title.length > 0);
    if (!clean.length) return { ids: [], label: null };
    const ids: string[] = [];
    const label = this.commit(`${clean.length} item${clean.length === 1 ? '' : 's'} added`, (old) => {
      const board = { ...(old.days[date] || EMPTY_BOARD) };
      const tasks = { ...board.tasks };
      const dumpOrder = [...board.dumpOrder];
      const topOrder = [...board.topOrder];
      for (const t of clean) {
        /* intake redelivery guard — same origin already on ANY day board */
        if (t.origin) {
          const dupe = Object.values(old.days).some((b) =>
            Object.values(b.tasks).some((x) => x.origin === t.origin),
          );
          if (dupe) continue;
        }
        const id = newId('task');
        const task: Task = {
          id,
          title: t.title,
          zone: t.zone ?? 'dump',
          createdAt: Date.now(),
          ...(t.estimateMin ? { estimateMin: t.estimateMin } : {}),
          ...(t.commitmentId ? { commitmentId: t.commitmentId } : {}),
          ...(t.origin ? { origin: t.origin } : {}),
          ...(t.course ? { course: t.course } : {}),
          ...(t.courseId ? { courseId: t.courseId } : {}),
          ...(t.topic ? { topic: t.topic } : {}),
        };
        tasks[id] = task;
        (task.zone === 'top' ? topOrder : dumpOrder).push(id);
        ids.push(id);
      }
      if (!ids.length) return old;
      return { ...old, days: { ...old.days, [date]: { ...board, tasks, dumpOrder, topOrder } } };
    });
    return { ids, label };
  }

  /** raw multi-line capture text → parsed tasks on the current day */
  captureText(text: string): string | null {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return null;
    const parsed = lines.map(parseCaptureLine).filter((p) => p.title);
    const { label } = this.addTasks(
      parsed.map((p) => ({
        title: p.title,
        zone: p.promote ? 'top' : 'dump',
        estimateMin: p.estimateMin,
      })),
    );
    return label;
  }

  /* ── task edits ── */

  updateTask(taskId: string, title: string): string | null {
    const next = title.trim();
    if (!next) return null;
    return this.commit('Task updated', (old) => {
      const board = old.days[old.date];
      const task = board?.tasks[taskId];
      if (!board || !task || task.title === next) return old;
      return {
        ...old,
        days: {
          ...old.days,
          [old.date]: { ...board, tasks: { ...board.tasks, [taskId]: { ...task, title: next } } },
        },
      };
    });
  }

  setEstimate(taskId: string, estimateMin: number | null): string | null {
    return this.commit(estimateMin ? `Estimate ${formatEstimate(estimateMin)}` : 'Estimate cleared', (old) => {
      const board = old.days[old.date];
      const task = board?.tasks[taskId];
      if (!board || !task) return old;
      const tasks = { ...board.tasks };
      if (estimateMin && estimateMin > 0) tasks[taskId] = { ...task, estimateMin };
      else {
        const { estimateMin: _drop, ...rest } = task;
        tasks[taskId] = rest;
      }
      return { ...old, days: { ...old.days, [old.date]: { ...board, tasks } } };
    });
  }

  moveTask(taskId: string, zone: Zone, index?: number, date = this.state.date): string | null {
    return this.commit(zone === 'top' ? 'Moved to Top Items' : 'Moved to Brain Dump', (old) => {
      const board = old.days[date];
      const task = board?.tasks[taskId];
      if (!board || !task) return old;
      const dumpOrder = board.dumpOrder.filter((id) => id !== taskId);
      const topOrder = board.topOrder.filter((id) => id !== taskId);
      const order = zone === 'top' ? topOrder : dumpOrder;
      if (index == null) order.push(taskId);
      else order.splice(Math.max(0, Math.min(index, order.length)), 0, taskId);
      /* a task leaving the board's lists can't keep a time box */
      const blocks = Object.fromEntries(
        Object.entries(board.blocks).filter(([, b]) => b.taskId !== taskId),
      );
      return {
        ...old,
        days: {
          ...old.days,
          [date]: {
            ...board,
            tasks: { ...board.tasks, [taskId]: { ...task, zone } },
            dumpOrder,
            topOrder,
            blocks,
          },
        },
      };
    });
  }

  reorderTop(taskId: string, index: number): string | null {
    return this.commit('Priority order updated', (old) => {
      const board = old.days[old.date];
      if (!board?.topOrder.includes(taskId)) return old;
      const topOrder = board.topOrder.filter((id) => id !== taskId);
      topOrder.splice(Math.max(0, Math.min(index, topOrder.length)), 0, taskId);
      return { ...old, days: { ...old.days, [old.date]: { ...board, topOrder } } };
    });
  }

  removeTask(taskId: string): string | null {
    return this.commit('Task deleted · undo to restore', (old) => {
      const board = old.days[old.date];
      if (!board?.tasks[taskId]) return old;
      const tasks = { ...board.tasks };
      delete tasks[taskId];
      return {
        ...old,
        days: {
          ...old.days,
          [old.date]: {
            ...board,
            tasks,
            dumpOrder: board.dumpOrder.filter((id) => id !== taskId),
            topOrder: board.topOrder.filter((id) => id !== taskId),
            blocks: Object.fromEntries(
              Object.entries(board.blocks).filter(([, b]) => b.taskId !== taskId),
            ),
          },
        },
      };
    });
  }

  /* ── scheduling ── */

  canPlace(board: Board, taskId: string, start: number, duration: number): boolean {
    const { dayStart, dayEnd } = this.state;
    const end = start + duration;
    if (!Number.isFinite(start) || !Number.isFinite(duration) || duration < 15) return false;
    if (start < dayStart * 60 || end > dayEnd * 60) return false;
    return !Object.values(board.blocks).some(
      (b) => b.taskId !== taskId && start < minutesOf(b.end) && end > minutesOf(b.start),
    );
  }

  findFree(board: Board, taskId: string, start: number, duration: number): number | null {
    const { dayStart, dayEnd } = this.state;
    const snapped = Math.round(start / 15) * 15;
    for (let at = Math.max(dayStart * 60, snapped); at + duration <= dayEnd * 60; at += 15) {
      if (this.canPlace(board, taskId, at, duration)) return at;
    }
    return null;
  }

  /** schedule (or reschedule) a task; falls forward to the next free slot.
      Returns an outcome the caller can toast/navigate on. */
  scheduleTask(
    taskId: string,
    startMin: number,
    durationMin: number,
    opts: { newTask?: NewTask & { id?: string }; date?: string } = {},
  ): { ok: boolean; adjusted?: boolean; start?: number; label?: string | null } {
    const date = opts.date ?? this.state.date;
    const board = this.state.days[date] || EMPTY_BOARD;
    const actualStart = this.canPlace(board, taskId, startMin, durationMin)
      ? startMin
      : this.findFree(board, taskId, startMin, durationMin);
    if (actualStart == null) return { ok: false };

    const adjusted = actualStart !== startMin;
    const label = adjusted
      ? `Scheduled at ${timeAt(actualStart)}, the next free time`
      : opts.newTask
        ? 'Block added'
        : 'Task scheduled';
    const placed = this.commit(label, (old) => {
        const b = old.days[date] || EMPTY_BOARD;
        if (!b.tasks[taskId] && !opts.newTask) return old;
        if (!this.canPlace(b, taskId, actualStart, durationMin)) return old;
        const prev = Object.values(b.blocks).find((x) => x.taskId === taskId);
        const id = prev?.id || newId('block');
        /* rescheduling reuses the block — keep its done/skipped/missed stamp
           and actual times instead of silently resetting to planned */
        const block: Block = {
          id,
          taskId,
          start: timeAt(actualStart),
          end: timeAt(actualStart + durationMin),
          status: prev?.status ?? 'planned',
          actualStart: prev?.actualStart,
          actualEnd: prev?.actualEnd,
        };
        const tasks = { ...b.tasks };
        const dumpOrder = [...b.dumpOrder];
        const topOrder = [...b.topOrder];
        if (opts.newTask) {
          const t: Task = {
            id: taskId,
            title: opts.newTask.title.trim(),
            zone: opts.newTask.zone ?? 'dump',
            createdAt: Date.now(),
            ...(opts.newTask.estimateMin ? { estimateMin: opts.newTask.estimateMin } : {}),
            ...(opts.newTask.origin ? { origin: opts.newTask.origin } : {}),
            ...(opts.newTask.course ? { course: opts.newTask.course } : {}),
            ...(opts.newTask.courseId ? { courseId: opts.newTask.courseId } : {}),
            ...(opts.newTask.topic ? { topic: opts.newTask.topic } : {}),
          };
          tasks[taskId] = t;
          (t.zone === 'top' ? topOrder : dumpOrder).push(taskId);
        }
        return {
          ...old,
          days: {
            ...old.days,
            [date]: {
              ...b,
              tasks,
              dumpOrder,
              topOrder,
              blocks: { ...b.blocks, [id]: block },
            },
          },
        };
      },
    );
    if (placed == null) return { ok: false };
    return { ok: true, adjusted, start: actualStart, label: placed };
  }

  /** place several blocks in one commit — 'Fit my day' must undo as one act */
  placeBlocks(items: { taskId: string; startMin: number; endMin: number }[]): number {
    let placed = 0;
    const label = this.commit('Scheduled priorities into free time', (old) => {
      const b = old.days[old.date] || EMPTY_BOARD;
      const blocks = { ...b.blocks };
      for (const item of items) {
        const duration = item.endMin - item.startMin;
        if (!this.canPlace({ ...b, blocks }, item.taskId, item.startMin, duration)) continue;
        const prev = Object.values(blocks).find((x) => x.taskId === item.taskId);
        const id = prev?.id || newId('block');
        blocks[id] = {
          id,
          taskId: item.taskId,
          start: timeAt(item.startMin),
          end: timeAt(item.endMin),
          status: prev?.status ?? 'planned',
          actualStart: prev?.actualStart,
          actualEnd: prev?.actualEnd,
        };
        placed++;
      }
      if (!placed) return old;
      return { ...old, days: { ...old.days, [old.date]: { ...b, blocks } } };
    });
    void label;
    return placed;
  }

  unscheduleTask(taskId: string): string | null {
    return this.commit('Returned to lists', (old) => {
      const board = old.days[old.date];
      if (!board) return old;
      const blocks = Object.fromEntries(
        Object.entries(board.blocks).filter(([, b]) => b.taskId !== taskId),
      );
      if (Object.keys(blocks).length === Object.keys(board.blocks).length) return old;
      return { ...old, days: { ...old.days, [old.date]: { ...board, blocks } } };
    });
  }

  updateBlock(blockId: string, patch: Partial<Block>): void {
    this.commit(null, (old) => {
      const board = old.days[old.date];
      const block = board?.blocks[blockId];
      if (!board || !block) return old;
      return {
        ...old,
        days: {
          ...old.days,
          [old.date]: {
            ...board,
            blocks: { ...board.blocks, [blockId]: { ...block, ...patch } },
          },
        },
      };
    });
  }

  /* clock-derived: stamp elapsed planned blocks 'missed'. No history — the
     user didn't choose this, so Undo must not reverse it. */
  markMissed(blockIds: string[], nowMinutes: number) {
    if (!blockIds.length) return;
    this.mutate((old) => {
      const board = old.days[old.date];
      if (!board) return old;
      const blocks = { ...board.blocks };
      let changed = false;
      for (const id of blockIds) {
        const b = blocks[id];
        if (b?.status === 'planned' && nowMinutes >= minutesOf(b.end)) {
          blocks[id] = { ...b, status: 'missed' };
          changed = true;
        }
      }
      if (!changed) return old;
      return { ...old, days: { ...old.days, [old.date]: { ...board, blocks } } };
    });
  }

  /* ── history ── */

  canUndo = () => this.state.past.length > 0;
  canRedo = () => this.state.future.length > 0;

  undo(): void {
    this.mutate((old) => {
      if (!old.past.length) return old;
      const past = old.past.slice();
      const previous = past.pop()!;
      return {
        ...old,
        ...previous,
        past,
        future: [snapshot(old), ...old.future].slice(0, HISTORY_CAP),
      };
    });
  }

  redo(): void {
    this.mutate((old) => {
      if (!old.future.length) return old;
      const [next, ...future] = old.future;
      return {
        ...old,
        ...next,
        past: [...old.past, snapshot(old)].slice(-HISTORY_CAP),
        future,
      };
    });
  }

  clearBoard(): string | null {
    return this.commit('Board cleared · undo to restore', (old) => ({
      ...old,
      days: { ...old.days, [old.date]: EMPTY_BOARD },
    }));
  }
}

export const board = new BoardStore();
