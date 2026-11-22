import { useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, Check, ChevronLeft, ChevronRight, Clock3, GripVertical, Play, Plus, RotateCw, Trash2, Undo2, X } from 'lucide-react';
import './boxed.css';
import { placeActive } from '../active';
import { StudyEntities } from '../../integration/StudySessionPlan';
import { boxedFocusMinutes, parseBoxedFocus } from '../../integration/boxedFocus';
import { execCommand } from '../../integration/commands';
import { Dialog } from '../../ui/primitives';
import { fitPriorities, planningForDay } from './planning';
import type { StoreEntity } from '../../hub';

type Zone = 'dump' | 'top';
type Status = 'planned' | 'active' | 'done' | 'skipped' | 'missed';
interface Task { id: string; title: string; zone: Zone; createdAt: number; estimateMin?: number; commitmentId?: string }
interface Block { id: string; taskId: string; start: string; end: string; status: Status; actualStart?: number; actualEnd?: number }
interface Board { tasks: Record<string, Task>; dumpOrder: string[]; topOrder: string[]; blocks: Record<string, Block> }
interface Snapshot { date: string; days: Record<string, Board>; dayStart: number; dayEnd: number }
interface State extends Snapshot { past: Snapshot[]; future: Snapshot[] }
interface DragPayload { taskId: string; blockId?: string }

const STORAGE_KEY = 'boxed.v1.state';
const DAY_START = 6;
const DAY_END = 23;
const HOUR_PX = 76;
const EMPTY: Board = { tasks: {}, dumpOrder: [], topOrder: [], blocks: {} };
const NO_ENTITIES: StoreEntity[] = [];
const pad = (n: number) => String(n).padStart(2, '0');
const todayKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const timeAt = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const formatTime = (time: string) => { const [h, m] = time.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h % 24 < 12 ? 'AM' : 'PM'}`; };
const formatRange = (block: Block) => `${formatTime(block.start)} – ${formatTime(block.end)}`;
const parseDate = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const prettyDate = (key: string) => parseDate(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = (key: string) => parseDate(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
function todaySummary(state: State, now: Date) {
  const board = state.days[todayKey(now)] || EMPTY;
  const tasks = board.tasks;
  const blocks = Object.values(board.blocks).filter((block) => tasks[block.taskId]);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const active = blocks.find((block) =>
    minutes(block.start) <= nowMinutes && minutes(block.end) > nowMinutes &&
    block.status !== 'done' && block.status !== 'skipped' && block.status !== 'missed',
  );
  return {
    top: board.topOrder.filter((id) => tasks[id]).length,
    scheduled: blocks.length,
    active: active ? tasks[active.taskId]?.title ?? null : null,
  };
}

function loadState(): State {
  const fallback: State = { date: todayKey(), days: {}, dayStart: DAY_START, dayEnd: DAY_END, past: [], future: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<State>;
    if (!saved.days || typeof saved.days !== 'object') return fallback;
    return { ...fallback, ...saved, past: [], future: [] };
  } catch { return fallback; }
}
function snapshot(state: State): Snapshot { return { date: state.date, days: state.days, dayStart: state.dayStart, dayEnd: state.dayEnd }; }
function currentBoard(state: State): Board { return state.days[state.date] || EMPTY; }
function validTime(value: string, dayStart: number, dayEnd: number) { return /^\d{2}:\d{2}$/.test(value) && minutes(value) >= dayStart * 60 && minutes(value) < dayEnd * 60; }

export default function App({ query = '' }: { query?: string }) {
  const entities = useContext(StudyEntities) ?? NO_ENTITIES;
  const [state, setState] = useState<State>(loadState);
  const [now, setNow] = useState(() => new Date());
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [selectedZone, setSelectedZone] = useState<'dump' | 'top' | 'time'>('dump');
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  const [scheduleStart, setScheduleStart] = useState('09:00');
  const [scheduleLength, setScheduleLength] = useState(60);
  const [showPlanning, setShowPlanning] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState('');
  const [returnedBlock, setReturnedBlock] = useState<string | null>(null);
  const [startingFocus, setStartingFocus] = useState(false);
  const [focusNotice, setFocusNotice] = useState<{ message: string; openTimer?: boolean } | null>(null);
  const focusStarting = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const planningToggleRef = useRef<HTMLButtonElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const cancelEditRef = useRef(false);
  const resizeRef = useRef<{ blockId: string; pointerY: number; duration: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ blockId: string; duration: number } | null>(null);
  const presenceStateRef = useRef<{ state: State; now: Date } | null>({ state, now });
  presenceStateRef.current = { state, now };
  const board = currentBoard(state);
  const focusedMinutes = useMemo(() => boxedFocusMinutes(entities, state.date), [entities, state.date]);
  const { busy: planningBusy, priorities: planningPriorities } = useMemo(
    () => planningForDay(entities, state.date), [entities, state.date],
  );
  const suggested = useMemo(() => {
    const included = new Set(Object.values(board.tasks).map(task => task.commitmentId));
    return planningPriorities.filter(task => !included.has(task.id)).slice(0, 3);
  }, [board.tasks, planningPriorities]);
  const dayStart = state.dayStart ?? DAY_START;
  const dayEnd = state.dayEnd ?? DAY_END;
  const dumpItems = board.dumpOrder.map((id) => board.tasks[id]).filter(Boolean);
  const topItems = board.topOrder.map((id) => board.tasks[id]).filter(Boolean);
  const blocks = Object.values(board.blocks).filter((block) => board.tasks[block.taskId]).sort((a, b) => a.start.localeCompare(b.start));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const today = state.date === todayKey(now);
  const canUsePlanning = state.date >= todayKey(now) && suggested.length > 0;
  const nowY = ((nowMinutes - dayStart * 60) / 60) * HOUR_PX;

  useEffect(() => {
    let timer: number;
    const tick = () => {
      window.clearTimeout(timer);
      const current = new Date();
      setNow(current);
      timer = window.setTimeout(tick, 60_000 - current.getTime() % 60_000);
    };
    tick();
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  useEffect(() => {
    const iterra = window.iterra;
    if (!iterra) return;
    presenceStateRef.current = { state, now };
    iterra.register('boxed', {
      ownKeys: ['/'],
      title: 'Boxed',
      summary: () => {
        const current = presenceStateRef.current;
        return current ? todaySummary(current.state, current.now) : null;
      },
    });
    /* The hub contract has no unregister method. Release the captured board
       on unmount; its page-scoped heartbeat will then publish null. */
    return () => { presenceStateRef.current = null; };
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: state.date, days: state.days, dayStart, dayEnd })); }
    catch { setToast('Your browser could not save this board. Export or free storage space.'); }
  }, [state.date, state.days, dayStart, dayEnd]);
  useEffect(() => {
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const params = new URLSearchParams(query);
    const target = parseBoxedFocus({ date: params.get('date'), blockId: params.get('focusBlock') });
    if (!target) return;
    setState(old => ({ ...old, date: target.date }));
    setSelectedZone('time');
    setReturnedBlock(target.blockId);
    const hash = window.location.hash;
    if (!hash.startsWith('#/p/boxed?')) return;
    const current = new URLSearchParams(hash.slice(hash.indexOf('?') + 1));
    if (current.get('date') !== target.date || current.get('focusBlock') !== target.blockId) return;
    current.delete('date');
    current.delete('focusBlock');
    window.location.hash = `/p/boxed${current.size ? `?${current}` : ''}`;
  }, [query]);

  useEffect(() => {
    if (!returnedBlock) return;
    const block = timelineRef.current?.querySelector<HTMLElement>(`[data-boxed-block="${returnedBlock}"]`);
    block?.scrollIntoView({ block: 'nearest' });
    block?.focus({ preventScroll: true });
  }, [returnedBlock, state.date, query]);

  const startFocus = async (block: Block) => {
    const task = board.tasks[block.taskId];
    if (!task || focusStarting.current) return;
    focusStarting.current = true;
    setStartingFocus(true);
    setFocusNotice(null);
    try {
      const commitment = task.commitmentId ? entities.find(row => row.app === 'syllabus' &&
        row.type === 'commitment' && row.id === task.commitmentId && row.data?.status === 'open') : undefined;
      const timeLeft = minutes(block.end) - Math.max(minutes(block.start), today ? nowMinutes : minutes(block.start));
      if (timeLeft <= 0) {
        setFocusNotice({ message: 'This block has ended. Move it to a free slot to start focus.' });
        return;
      }
      const remaining = minutes(block.end) - minutes(block.start) - (focusedMinutes.get(block.id) ?? 0);
      const result = await execCommand('startFocusSession', {
        from: 'boxed',
        boxedFocus: { date: state.date, blockId: block.id },
        label: task.title,
        plannedMinutes: remaining > 0 ? Math.min(timeLeft, remaining) : timeLeft,
        course: commitment?.course,
        courseId: commitment?.courseId,
        commitmentId: commitment?.id,
      });
      if (result.ok) window.iterra?.open('#/p/timer');
      else setFocusNotice({ message: result.error || 'Could not start focus. Try again.', openTimer: result.code === 'SESSION_ACTIVE' });
    } catch {
      setFocusNotice({ message: 'Could not start focus. Try again.' });
    } finally {
      focusStarting.current = false;
      setStartingFocus(false);
    }
  };

  const boardEdit = useCallback((label: string, edit: (old: Board) => Board) => {
    setState((previous) => {
      const old = previous.days[previous.date] || EMPTY;
      const next = edit(old);
      if (next === old) return previous;
      const days = { ...previous.days, [previous.date]: next };
      return { ...previous, days, past: [...previous.past, snapshot(previous)].slice(-50), future: [] };
    });
    if (label) setToast(label);
  }, []);
  const addTask = (title: string, zone: Zone = 'dump') => {
    const lines = title.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    boardEdit(`${lines.length} item${lines.length === 1 ? '' : 's'} added`, (old) => {
      const tasks = { ...old.tasks };
      const ids = lines.map((text) => { const id = newId('task'); tasks[id] = { id, title: text, zone, createdAt: Date.now() }; return id; });
      return zone === 'dump'
        ? { ...old, tasks, dumpOrder: [...old.dumpOrder, ...ids] }
        : { ...old, tasks, topOrder: [...old.topOrder, ...ids] };
    });
    setDraft('');
    inputRef.current?.focus();
  };
  const addPlanningTask = (priority: typeof suggested[number]) => {
    const id = newId('task');
    const task: Task = { id, title: priority.title, zone: 'top', createdAt: Date.now(),
      commitmentId: priority.id, estimateMin: priority.estimateMin };
    boardEdit('Added to Top Items', old => {
      if (Object.values(old.tasks).some(existing => existing.commitmentId === priority.id)) return old;
      return { ...old, tasks: { ...old.tasks, [id]: task }, topOrder: [...old.topOrder, id] };
    });
  };
  const updateTask = (taskId: string, title: string) => {
    const nextTitle = title.trim();
    if (nextTitle) boardEdit('Task updated', (old) => ({ ...old, tasks: { ...old.tasks, [taskId]: { ...old.tasks[taskId], title: nextTitle } } }));
    setEditingId(null);
  };
  const moveTask = (taskId: string, zone: Zone, index?: number) => boardEdit(zone === 'top' ? 'Moved to Top Items' : 'Moved to Brain Dump', (old) => {
    const task = old.tasks[taskId]; if (!task) return old;
    const dumpOrder = old.dumpOrder.filter((id) => id !== taskId);
    const topOrder = old.topOrder.filter((id) => id !== taskId);
    const order = zone === 'top' ? topOrder : dumpOrder;
    if (index == null) order.push(taskId); else order.splice(Math.max(0, Math.min(index, order.length)), 0, taskId);
    const blocks = Object.fromEntries(Object.entries(old.blocks).filter(([, block]) => block.taskId !== taskId));
    return { ...old, tasks: { ...old.tasks, [taskId]: { ...task, zone } }, dumpOrder, topOrder, blocks };
  });
  const reorderTop = (taskId: string, index: number) => boardEdit('Priority order updated', (old) => {
    const topOrder = old.topOrder.filter((id) => id !== taskId); topOrder.splice(Math.max(0, Math.min(index, topOrder.length)), 0, taskId);
    return { ...old, topOrder };
  });
  const removeTask = (taskId: string) => boardEdit('Task deleted · undo to restore', (old) => {
    const tasks = { ...old.tasks }; delete tasks[taskId];
    return { ...old, tasks, dumpOrder: old.dumpOrder.filter((id) => id !== taskId), topOrder: old.topOrder.filter((id) => id !== taskId), blocks: Object.fromEntries(Object.entries(old.blocks).filter(([, block]) => block.taskId !== taskId)) };
  });
  const canPlace = (old: Board, taskId: string, start: number, duration: number) => {
    const end = start + duration;
    if (!Number.isFinite(start) || !Number.isFinite(duration) || duration < 15 || start < dayStart * 60 || end > dayEnd * 60) return false;
    return !Object.values(old.blocks).some((block) => block.taskId !== taskId && start < minutes(block.end) && end > minutes(block.start));
  };
  const findFree = (old: Board, taskId: string, start: number, duration: number) => {
    const snapped = Math.round(start / 15) * 15;
    for (let at = Math.max(dayStart * 60, snapped); at + duration <= dayEnd * 60; at += 15) if (canPlace(old, taskId, at, duration)) return at;
    return null;
  };
  const scheduleTask = (taskId: string, start: number, duration: number, newTask?: Task) => {
    const actualStart = canPlace(board, taskId, start, duration) ? start : findFree(board, taskId, start, duration);
    if (actualStart == null) { setToast('No free space for that block'); return; }
    const id = blocks.find(block => block.taskId === taskId)?.id || newId('block');
    const block: Block = { id, taskId, start: timeAt(actualStart), end: timeAt(actualStart + duration), status: 'planned' };
    boardEdit(actualStart === start ? 'Task scheduled' : `Scheduled at ${formatTime(block.start)}, the next free time`, old => {
      if ((!old.tasks[taskId] && !newTask) || !canPlace(old, taskId, actualStart, duration)) return old;
      return {
        ...old,
        blocks: { ...old.blocks, [id]: block },
        ...(newTask ? { tasks: { ...old.tasks, [taskId]: newTask }, dumpOrder: [...old.dumpOrder, taskId] } : {}),
      };
    });
    setScheduleFor(null);
  };
  const unscheduled = topItems.filter(task => !blocks.some(block => block.taskId === task.id));
  const fitUnscheduled = () => {
    const first = today ? Math.max(dayStart * 60, nowMinutes) : dayStart * 60;
    const busy = [...planningBusy, ...blocks.map(block => ({ start: minutes(block.start), end: minutes(block.end) }))];
    const placements = fitPriorities(unscheduled, busy, first, dayEnd * 60);
    if (!placements.length) {
      setToast('No priority fits in the remaining time.');
      return;
    }
    const additions: Record<string, Block> = {};
    for (const { taskId, start, end } of placements) {
      const id = newId('block');
      additions[id] = { id, taskId, start: timeAt(start), end: timeAt(end), status: 'planned' };
    }
    const remaining = unscheduled.length - placements.length;
    boardEdit(`Scheduled ${placements.length} ${placements.length === 1 ? 'priority' : 'priorities'}${remaining ? ` · ${remaining} did not fit` : ''}`,
      old => ({ ...old, blocks: { ...old.blocks, ...additions } }));
  };
  const unschedule = (taskId: string) => boardEdit('Returned to lists', (old) => ({ ...old, blocks: Object.fromEntries(Object.entries(old.blocks).filter(([, block]) => block.taskId !== taskId)) }));
  const updateBlock = (blockId: string, patch: Partial<Block>) => boardEdit('', (old) => ({ ...old, blocks: { ...old.blocks, [blockId]: { ...old.blocks[blockId], ...patch } } }));
  const handleDragStart = (event: DragEvent, payload: DragPayload) => {
    event.dataTransfer.setData('application/x-boxed-item', JSON.stringify(payload));
    event.dataTransfer.effectAllowed = 'move';
  };
  const readDrag = (event: DragEvent): DragPayload | null => {
    try { return JSON.parse(event.dataTransfer.getData('application/x-boxed-item')); } catch { return null; }
  };
  const dropToZone = (event: DragEvent, zone: Zone, index?: number) => {
    event.preventDefault(); const payload = readDrag(event); if (!payload) return;
    moveTask(payload.taskId, zone, index);
  };
  const doUndo = useCallback(() => setState((old) => {
    if (!old.past.length) return old;
    const past = old.past.slice(); const previous = past.pop()!;
    return { ...old, ...previous, past, future: [snapshot(old), ...old.future].slice(0, 50) };
  }), []);
  const doRedo = useCallback(() => setState((old) => {
    if (!old.future.length) return old;
    const [next, ...future] = old.future;
    return { ...old, ...next, past: [...old.past, snapshot(old)].slice(-50), future };
  }), []);
  const changeDay = (delta: number) => setState((old) => { const date = parseDate(old.date); date.setDate(date.getDate() + delta); return { ...old, date: todayKey(date) }; });
  const setRange = (field: 'dayStart' | 'dayEnd', value: number) => setState((old) => {
    if ((field === 'dayStart' && value >= old.dayEnd) || (field === 'dayEnd' && value <= old.dayStart)) return old;
    return { ...old, [field]: value, past: [...old.past, snapshot(old)].slice(-50), future: [] };
  });
  const beginResize = (event: PointerEvent<HTMLDivElement>, block: Block, duration: number) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = { blockId: block.id, pointerY: event.clientY, duration };
  };
  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    const drag = resizeRef.current; if (!drag) return;
    const duration = Math.max(15, Math.round((drag.duration + (event.clientY - drag.pointerY) / HOUR_PX * 60) / 15) * 15);
    setResizePreview({ blockId: drag.blockId, duration });
  };
  const finishResize = () => {
    const drag = resizeRef.current; if (!drag) return;
    const duration = resizePreview?.blockId === drag.blockId ? resizePreview.duration : drag.duration;
    const block = board.blocks[drag.blockId];
    if (block && canPlace(board, block.taskId, minutes(block.start), duration)) updateBlock(drag.blockId, { end: timeAt(minutes(block.start) + duration) });
    else if (duration !== drag.duration) setToast('That resize overlaps another task or goes past the day end');
    resizeRef.current = null; setResizePreview(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!placeActive('boxed') || event.defaultPrevented || event.isComposing) return;
      const target = event.target;
      const typing = target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      /* Leave the browser's native text undo available while editing a field.
         Planner history is only the shortcut when focus is outside editors. */
      if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) doRedo(); else doUndo(); return; }
      if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === 'n' || event.key === '/')) {
        event.preventDefault();
        setSelectedZone('dump');
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, [doRedo, doUndo]);

  const activeBlock = useMemo(() => blocks.find((block) => minutes(block.start) <= nowMinutes && minutes(block.end) > nowMinutes && today && (block.status === 'planned' || block.status === 'active')), [blocks, nowMinutes, today]);
  const totalPlanned = blocks.reduce((sum, block) => sum + minutes(block.end) - minutes(block.start), 0);
  useEffect(() => {
    if (!today) return;
    const missedIds = blocks.filter((block) => block.status === 'planned' && !focusedMinutes.has(block.id) && nowMinutes >= minutes(block.end)).map((block) => block.id);
    if (!missedIds.length) return;
    setState((old) => {
      const current = old.days[old.date] || EMPTY;
      const pending = missedIds.filter((id) => current.blocks[id]?.status === 'planned');
      if (!pending.length) return old;
      const nextBoard = { ...current, blocks: { ...current.blocks } };
      for (const id of pending) nextBoard.blocks[id] = { ...nextBoard.blocks[id], status: 'missed' };
      /* Missed is a clock-derived status, not a user action. Keep the existing
         undo/redo stacks untouched so Undo still reverses the last choice. */
      return { ...old, days: { ...old.days, [old.date]: nextBoard } };
    });
  }, [state.date, state.days, nowMinutes, today, focusedMinutes]);
  const recoverToTop = (taskId: string) => board.tasks[taskId]?.zone === 'top' ? unschedule(taskId) : moveTask(taskId, 'top');
  const recoverToNextSlot = (block: Block) => {
    const duration = minutes(block.end) - minutes(block.start);
    const nextStart = Math.max(dayStart * 60, Math.ceil(nowMinutes / 15) * 15);
    const free = findFree(board, block.taskId, nextStart, duration);
    if (free == null) { setToast('No free slot remains in this day'); return; }
    scheduleTask(block.taskId, free, duration);
  };

  const renderTaskRow = (task: Task, index: number, zone: Zone) => {
    const block = Object.values(board.blocks).find((item) => item.taskId === task.id);
    return <div className={`boxed-task ${block ? 'has-block' : ''}`} draggable onDragStart={(event) => handleDragStart(event, { taskId: task.id, ...(block ? { blockId: block.id } : {}) })}>
      <span className="boxed-grip" aria-hidden="true"><GripVertical size={15} /></span>
      {zone === 'top' && <span className="boxed-rank">{index + 1}</span>}
      {editingId === task.id ? <input autoFocus value={editText} aria-label="Edit task title" onChange={(event) => setEditText(event.target.value)} onBlur={() => { if (cancelEditRef.current) { cancelEditRef.current = false; return; } if (editText !== task.title) updateTask(task.id, editText); else setEditingId(null); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelEditRef.current = true; setEditingId(null); setEditText(task.title); } }} /> : <button className={`boxed-task-title ${block?.status === 'done' ? 'task-done' : ''}`} onClick={() => { setEditingId(task.id); setEditText(task.title); }} onKeyDown={(event) => { if (zone === 'top' && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); reorderTop(task.id, index + (event.key === 'ArrowUp' ? -1 : 1)); } }} title="Edit task title">{task.title}</button>}
      {block && <span className="boxed-time-chip"><Clock3 size={12} />{formatRange(block)}</span>}
      {zone === 'top' && !block && <span className="boxed-unscheduled">Unscheduled</span>}
      <div className="boxed-row-actions">
        {task.commitmentId && <button aria-label={`Open ${task.title} in Planning`} title="Open in Planning" onClick={() => window.iterra?.open(`/apps/syllabus/?commitment=${encodeURIComponent(task.commitmentId!)}`)}><ArrowUpRight size={15} /></button>}
        {zone === 'dump' ? <button aria-label="Promote to Top Items" title="Move to Top Items" onClick={() => moveTask(task.id, 'top')}><ArrowUp size={15} /></button> : <button aria-label="Demote to Brain Dump" title="Move to Brain Dump" onClick={() => moveTask(task.id, 'dump')}><ArrowDown size={15} /></button>}
        <button aria-label={block ? 'Reschedule task' : 'Schedule task'} title="Schedule" onClick={() => { setScheduleFor(task.id); setScheduleStart(block?.start || '09:00'); setScheduleLength(block ? minutes(block.end) - minutes(block.start) : task.estimateMin || 60); }}><Clock3 size={15} /></button>
        <button aria-label="Edit task" title="Edit" onClick={() => { setEditingId(task.id); setEditText(task.title); }}><span className="boxed-edit-glyph">✎</span></button>
        <button aria-label="Delete task" title="Delete" onClick={() => removeTask(task.id)}><Trash2 size={14} /></button>
        {zone === 'top' && <span className="boxed-key-reorder"><button aria-label="Move priority up" onClick={() => reorderTop(task.id, index - 1)} disabled={index === 0}><ArrowUp size={13} /></button><button aria-label="Move priority down" onClick={() => reorderTop(task.id, index + 1)} disabled={index === topItems.length - 1}><ArrowDown size={13} /></button></span>}
      </div>
    </div>;
  };
  return <div className="it-place-boxed boxed-root">
    <header className="boxed-header">
      <div className="boxed-brand"><span className="boxed-mark"><span /><span /></span><div><div className="boxed-wordmark">BOXED</div><div className="boxed-subtitle">TIME BOXING &amp; BRAIN DUMP</div></div></div>
      <div className="boxed-header-center"><button aria-label="Previous day" onClick={() => changeDay(-1)}><ChevronLeft size={18} /></button><div><b className="boxed-full-date">{prettyDate(state.date)}</b><b className="boxed-short-date" title={prettyDate(state.date)}>{shortDate(state.date)}</b>{today && <span>Today</span>}</div><button aria-label="Next day" onClick={() => changeDay(1)}><ChevronRight size={18} /></button><input aria-label="Choose day" type="date" value={state.date} onChange={(event) => event.target.value && setState((old) => ({ ...old, date: event.target.value }))} /></div>
      <div className="boxed-tools"><button aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!state.past.length} onClick={doUndo}><Undo2 size={17} /></button><button aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!state.future.length} onClick={doRedo}><RotateCw size={16} /></button><button className="boxed-clear" aria-label="Clear board" onClick={() => setConfirmClear(true)}><Trash2 size={14} /><span>Clear board</span></button></div>
    </header>
    {activeBlock && <div className="boxed-now-strip">
      <span className="boxed-live-dot" aria-hidden="true" />
      <span className="boxed-now-title">{board.tasks[activeBlock.taskId]?.title}</span>
      <button type="button" onClick={() => void startFocus(activeBlock)} disabled={startingFocus}><Play size={13} aria-hidden="true" /> Start focus</button>
    </div>}
    {focusNotice && <div className="boxed-focus-notice" role="status">
      <span>{focusNotice.message}</span>
      {focusNotice.openTimer && <button type="button" onClick={() => window.iterra?.open('#/p/timer')}>Open Timer</button>}
      <button type="button" aria-label="Dismiss focus message" onClick={() => setFocusNotice(null)}><X size={14} /></button>
    </div>}
    <main className="boxed-board">
      <section className="boxed-left">
        <section className={`boxed-zone boxed-top ${selectedZone === 'top' ? 'mobile-current' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropToZone(event, 'top')}>
          <div className="boxed-zone-heading"><div><span className="boxed-eyebrow">01 / PRIORITIZE</span><h1>Top Items</h1></div><span className="boxed-count">{topItems.length}<i>/ 5</i></span></div>
          <p className="boxed-helper">The work that matters most today.</p>
          <div className="boxed-list" role="list" aria-label="Top Items" hidden={!topItems.length && canUsePlanning}>
            {topItems.map((task, index) => <div key={task.id} role="listitem" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); const payload = readDrag(event); if (!payload?.taskId) return; const source = board.tasks[payload.taskId]; if (payload.blockId) unschedule(payload.taskId); if (source?.zone === 'top') reorderTop(payload.taskId, index); else moveTask(payload.taskId, 'top', index); }}>{renderTaskRow(task, index, 'top')}</div>)}
            {!topItems.length && !canUsePlanning && <div className="boxed-empty"><b>No priorities yet.</b><span>Move a task here from Brain Dump.</span></div>}
          </div>
          {topItems.length > 5 && <p className="boxed-cap-warning">Move any work that can wait back to Brain Dump.</p>}
          {unscheduled.length > 0 && state.date >= todayKey(now) && (
            <button type="button" className="boxed-suggest" onClick={fitUnscheduled}>Fit unscheduled priorities</button>
          )}
          {canUsePlanning && (
            <div className="boxed-planning">
              <button ref={planningToggleRef} type="button" className="boxed-suggest" aria-expanded={showPlanning} onClick={() => setShowPlanning(open => !open)}>
                {showPlanning ? 'Hide Planning tasks' : 'Add from Planning'}
              </button>
              {showPlanning && <ul className="boxed-planning-list">
                {suggested.map(task => <li key={task.id}>
                  <div><b>{task.title}</b><span>{[task.course, Number.isFinite(task.due) ? `Due ${new Date(task.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '', task.estimateMin ? `${task.estimateMin} min` : ''].filter(Boolean).join(' · ')}</span></div>
                  <button type="button" aria-label={`Add ${task.title} to Top Items`} onClick={() => addPlanningTask(task)}><Plus size={14} aria-hidden="true" /> Add</button>
                </li>)}
              </ul>}
            </div>
          )}
        </section>
        <section className={`boxed-zone boxed-dump ${selectedZone === 'dump' ? 'mobile-current' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropToZone(event, 'dump')}>
          <div className="boxed-zone-heading"><div><span className="boxed-eyebrow">02 / CAPTURE</span><h2>Brain Dump</h2></div><span className="boxed-count">{dumpItems.length}</span></div>
          <form className="boxed-capture" onSubmit={(event) => { event.preventDefault(); addTask(draft); }}><input ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onPaste={(event) => { const text = event.clipboardData.getData('text/plain'); if (text.includes('\n')) { event.preventDefault(); addTask(text); } }} placeholder="Get it out of your head…" aria-label="Add to Brain Dump" /><button aria-label="Add task"><Plus size={17} /></button></form>
          <p className="boxed-helper">Press Enter to add · paste several lines at once</p>
          {canUsePlanning && <button type="button" className="boxed-suggest boxed-mobile-planning" onClick={() => {
            setSelectedZone('top');
            setShowPlanning(true);
            requestAnimationFrame(() => planningToggleRef.current?.focus());
          }}>Add from Planning</button>}
          <div className="boxed-list boxed-dump-list" role="list" aria-label="Brain Dump">
            {dumpItems.map((task, index) => <div key={task.id} role="listitem">{renderTaskRow(task, index, 'dump')}</div>)}
            {!dumpItems.length && <div className="boxed-empty"><b>Mind clear.</b><span>Start anywhere. Rank or schedule items when you are ready.</span></div>}
          </div>
        </section>
      </section>
      <section className={`boxed-zone boxed-timeline ${selectedZone === 'time' ? 'mobile-current' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const payload = readDrag(event); const scroller = timelineRef.current; if (payload && scroller) { const y = event.clientY - scroller.getBoundingClientRect().top + scroller.scrollTop; scheduleTask(payload.taskId, dayStart * 60 + Math.floor(y / HOUR_PX * 60 / 15) * 15, payload.blockId ? (minutes(board.blocks[payload.blockId]?.end || '10:00') - minutes(board.blocks[payload.blockId]?.start || '09:00')) : board.tasks[payload.taskId]?.estimateMin || 60); } }}>
        <div className="boxed-zone-heading boxed-timeline-heading"><div><span className="boxed-eyebrow">03 / COMMIT</span><h2>Time Boxed</h2></div><div className="boxed-timeline-options"><label>From <select aria-label="Timeline starts at" value={dayStart} onChange={(event) => setRange('dayStart', Number(event.target.value))}>{Array.from({ length: 23 }, (_, i) => i).map((h) => <option value={h} key={h}>{formatTime(`${pad(h)}:00`)}</option>)}</select></label><label>To <select aria-label="Timeline ends at" value={dayEnd} onChange={(event) => setRange('dayEnd', Number(event.target.value))}>{Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <option value={h} key={h}>{h === 24 ? '12:00 AM' : formatTime(`${pad(h)}:00`)}</option>)}</select></label><div className="boxed-free-time"><b>{Math.floor(totalPlanned / 60)}h {totalPlanned % 60 ? `${totalPlanned % 60}m` : ''}</b><span>planned</span></div></div></div>
        <p className="boxed-helper">Tap an open hour to add a block. Drag a task here to schedule it.</p>
        <div className="boxed-timeline-scroll" ref={(node) => { timelineRef.current = node; if (!node || !today) return; const active = blocks.find((block) => minutes(block.start) <= nowMinutes && minutes(block.end) > nowMinutes); if (active && node.dataset.scrolled !== state.date) { node.scrollTop = Math.max(0, nowY - 160); node.dataset.scrolled = state.date; } }}>
          <div className="boxed-timeline-track" style={{ height: `${(dayEnd - dayStart) * HOUR_PX}px` }}>
            {Array.from({ length: dayEnd - dayStart }, (_, index) => {
              const start = timeAt((dayStart + index) * 60);
              return <button type="button" className="boxed-hour" key={start} style={{ top: `${index * HOUR_PX}px` }}
                aria-label={`Add time block at ${formatTime(start)}`}
                onClick={() => { setScheduleFor('new'); setScheduleStart(start); setScheduleLength(60); }}>
                <span>{formatTime(start)}</span><span className="boxed-hour-line" />
              </button>;
            })}
            {blocks.map(block => {
              const start = minutes(block.start);
              const end = minutes(block.end);
              const duration = end - start;
              const shownDuration = resizePreview?.blockId === block.id ? resizePreview.duration : duration;
              const taskTitle = board.tasks[block.taskId]?.title || 'Task';
              const logged = focusedMinutes.get(block.id);
              const pending = block.status === 'planned' || block.status === 'active';
              const active = pending && today && start <= nowMinutes && end > nowMinutes;
              const missed = !logged && (block.status === 'missed' || (today && pending && nowMinutes >= end));
              const status = missed ? 'Missed' : active ? 'Active now' :
                logged && (pending || block.status === 'missed') ? 'Focus logged' : block.status;
              const classes = [
                'boxed-block', shownDuration < 60 && 'is-compact', returnedBlock === block.id && 'is-returned',
                active && 'is-active', block.status === 'done' && 'is-done', block.status === 'skipped' && 'is-skipped',
                missed && 'is-missed',
              ].filter(Boolean).join(' ');

              return (
                <div key={block.id} data-boxed-block={block.id} role="group" aria-label={taskTitle} tabIndex={-1}
                  draggable onDragStart={event => handleDragStart(event, { taskId: block.taskId, blockId: block.id })}
                  className={classes} style={{ top: (start - dayStart * 60) / 60 * HOUR_PX, height: Math.max(34, shownDuration / 60 * HOUR_PX) }}
                >
                  <div className="boxed-block-main">
                    <span className="boxed-block-time">{formatRange(block)}
                      {logged ? <span className="boxed-focus-log"> · {logged} min focused</span> : null}
                    </span>
                    <strong>{taskTitle}</strong>
                    <span className="boxed-block-status">{status}</span>
                    <div className="boxed-block-actions">
                      {missed ? <>
                        <button onClick={() => recoverToTop(block.taskId)} aria-label="Recover missed task to Top Items"><ArrowUp size={14} />Top</button>
                        <button onClick={() => recoverToNextSlot(block)} aria-label="Schedule missed task in next free slot"><Clock3 size={14} />Next free</button>
                      </> : <>
                        {block.status !== 'done' && <button onClick={() => updateBlock(block.id, { status: 'done', actualEnd: Date.now() })} aria-label="Mark task done"><Check size={14} />Done</button>}
                        {block.status !== 'skipped' && block.status !== 'done' && <button onClick={() => updateBlock(block.id, { status: 'skipped' })} aria-label="Skip task"><X size={14} />Skip</button>}
                        <button onClick={() => unschedule(block.taskId)} aria-label="Move task back to list"><ArrowLeft size={14} />Unbox</button>
                      </>}
                    </div>
                  </div>
                  <div className="boxed-resize" role="slider" aria-label={`Resize ${taskTitle}`} aria-valuemin={15} aria-valuemax={dayEnd * 60 - start}
                    aria-valuenow={shownDuration} tabIndex={0} title="Drag the lower edge to resize in 15 minute steps"
                    onPointerDown={event => beginResize(event, block, duration)} onPointerMove={moveResize}
                    onPointerUp={finishResize} onPointerCancel={finishResize}
                    onKeyDown={event => {
                      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                      event.preventDefault();
                      const next = duration + (event.key === 'ArrowUp' ? 15 : -15);
                      if (canPlace(board, block.taskId, start, next)) updateBlock(block.id, { end: timeAt(start + next) });
                    }}
                  ><span className="boxed-resize-grip" /></div>
                </div>
              );
            })}
            {today && nowY >= 0 && nowY <= (dayEnd - dayStart) * HOUR_PX && <div className="boxed-now-line" style={{ top: `${nowY}px` }} aria-label={`Current time ${formatTime(timeAt(nowMinutes))}`}><span>{formatTime(timeAt(nowMinutes))}</span><i /></div>}
          </div>
        </div>
      </section>
    </main>
    <nav className="boxed-mobile-tabs" aria-label="Planner zones"><button className={selectedZone === 'dump' ? 'active' : ''} onClick={() => setSelectedZone('dump')}>Dump <span>{dumpItems.length}</span></button><button className={selectedZone === 'top' ? 'active' : ''} onClick={() => setSelectedZone('top')}>Top <span>{topItems.length}</span></button><button className={selectedZone === 'time' ? 'active' : ''} onClick={() => setSelectedZone('time')}>Time <span>{blocks.length}</span></button><button className="boxed-mobile-add" aria-label="Capture a task" onClick={() => { setSelectedZone('dump'); requestAnimationFrame(() => inputRef.current?.focus()); }}>+</button></nav>
    {toast && <div className="boxed-toast" role="status">{toast}</div>}
    <Dialog open={!!scheduleFor} onClose={() => setScheduleFor(null)} title={scheduleFor === 'new' ? 'New time block' : 'Schedule task'}>
      <form onSubmit={event => {
        event.preventDefault();
        if (!scheduleFor) return;
        if (!validTime(scheduleStart, dayStart, dayEnd)) { setToast('Choose a time within your day'); return; }
        const start = minutes(scheduleStart);
        if (scheduleFor === 'new') {
          const title = String(new FormData(event.currentTarget).get('title') ?? '').trim();
          if (!title) return;
          const id = newId('task');
          scheduleTask(id, start, scheduleLength, { id, title, zone: 'dump', createdAt: Date.now() });
        } else {
          scheduleTask(scheduleFor, start, scheduleLength);
        }
      }}>
        {scheduleFor === 'new'
          ? <input name="title" aria-label="Task title" className="boxed-modal-title" placeholder="What will you work on?" required />
          : <p className="text-sm">{scheduleFor && board.tasks[scheduleFor]?.title}</p>}
        <label className="boxed-field">Start time
          <input type="time" min={`${pad(dayStart)}:00`} max={`${pad(dayEnd - 1)}:45`} value={scheduleStart} required onChange={event => setScheduleStart(event.target.value)} />
        </label>
        <div className="boxed-duration-picker">
          <span>Duration</span>
          {[15, 30, 45, 60, 90, 120].map(duration => (
            <button key={duration} type="button" aria-pressed={scheduleLength === duration}
              className={scheduleLength === duration ? 'active' : ''} onClick={() => setScheduleLength(duration)}>
              {duration < 60 ? `${duration}m` : `${duration / 60}h`}
            </button>
          ))}
        </div>
        <button className="boxed-primary" type="submit">Add to Time Box</button>
      </form>
    </Dialog>
    <Dialog open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear the board?">
      <p className="text-sm">This removes the tasks and time blocks for {prettyDate(state.date)}. Undo can restore them.</p>
      <div className="boxed-modal-buttons">
        <button type="button" onClick={() => setConfirmClear(false)}>Keep board</button>
        <button type="button" className="boxed-danger" onClick={() => {
          boardEdit('Board cleared · undo to restore', () => EMPTY);
          setConfirmClear(false);
        }}>Clear board</button>
      </div>
    </Dialog>
  </div>;
}
