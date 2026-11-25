import { useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type PointerEvent } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, Check, ChevronLeft, ChevronRight,
  Clock3, GripVertical, Info, Play, Plus, RotateCw, Timer, Trash2, Undo2, X,
} from 'lucide-react';
import './boxed.css';
import './iterra';
import './iterra-adapter';
import { placeActive } from '../active';
import { StudyEntities } from '../../integration/StudySessionPlan';
import { boxedFocusMinutes, parseBoxedFocus } from '../../integration/boxedFocus';
import { execCommand } from '../../integration/commands';
import { Dialog } from '../../ui/primitives';
import { AtlasMasthead } from '../../mosaic/AtlasMasthead';
import { fitPriorities, planningForDay } from './planning';
import {
  board, EMPTY_BOARD, ESTIMATE_PRESETS, formatEstimate,
  isDateKey, minutesOf, newId, pad, parseDate, timeAt, todayKey,
  type Block, type Task, type Zone,
} from './store';
import type { StoreEntity } from '../../hub';

type SelectedZone = 'dump' | 'top' | 'time';
interface DragPayload { taskId: string; blockId?: string }

const NO_ENTITIES: StoreEntity[] = [];
const formatTime = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h % 24 < 12 ? 'AM' : 'PM'}`;
};
const formatRange = (block: Block) => `${formatTime(block.start)} – ${formatTime(block.end)}`;
const prettyDate = (key: string) =>
  parseDate(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = (key: string) =>
  parseDate(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function selectObject(app: string, type: string, id: string, title: string, url: string, extra: Record<string, unknown> = {}) {
  try {
    window.dispatchEvent(new CustomEvent('iterra:select-object', {
      detail: { key: `${app}:${type}:${id}`, app, type, id, title, url, ...extra },
    }));
  } catch { /* ambient listener absent */ }
}

export default function App({ query = '', wakeTick = 0 }: { query?: string; wakeTick?: number }) {
  const entities = useContext(StudyEntities) ?? NO_ENTITIES;
  const state = useSyncExternalStore(board.subscribe, board.getState);
  void wakeTick; // keep-alive wake — the store re-reads on subscribe; entities refresh via context

  const [now, setNow] = useState(() => new Date());
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [selectedZone, setSelectedZone] = useState<SelectedZone>('dump');
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  const [scheduleStart, setScheduleStart] = useState('09:00');
  const [scheduleLength, setScheduleLength] = useState(60);
  const [showPlanning, setShowPlanning] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState('');
  const [returnedBlock, setReturnedBlock] = useState<string | null>(null);
  const [returnedTask, setReturnedTask] = useState<string | null>(null);
  const [startingFocus, setStartingFocus] = useState(false);
  const [focusNotice, setFocusNotice] = useState<{ message: string; openTimer?: boolean } | null>(null);
  const focusStarting = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const planningToggleRef = useRef<HTMLButtonElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const cancelEditRef = useRef(false);
  const resizeRef = useRef<{ blockId: string; pointerY: number; duration: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ blockId: string; duration: number } | null>(null);

  const dayBoard = state.days[state.date] || EMPTY_BOARD;
  const focusedMinutes = useMemo(() => boxedFocusMinutes(entities, state.date), [entities, state.date]);
  const { busy: planningBusy, priorities: planningPriorities } = useMemo(
    () => planningForDay(entities, state.date),
    [entities, state.date],
  );
  const suggested = useMemo(() => {
    const included = new Set(Object.values(dayBoard.tasks).map((t) => t.commitmentId));
    return planningPriorities.filter((t) => !included.has(t.id)).slice(0, 4);
  }, [dayBoard.tasks, planningPriorities]);

  const dayStart = state.dayStart;
  const dayEnd = state.dayEnd;
  const dumpItems = dayBoard.dumpOrder.map((id) => dayBoard.tasks[id]).filter(Boolean) as Task[];
  const topItems = dayBoard.topOrder.map((id) => dayBoard.tasks[id]).filter(Boolean) as Task[];
  const blocks = useMemo(
    () =>
      Object.values(dayBoard.blocks)
        .filter((b) => dayBoard.tasks[b.taskId])
        .sort((a, b) => a.start.localeCompare(b.start)),
    [dayBoard],
  );
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const today = state.date === todayKey(now);
  const canUsePlanning = state.date >= todayKey(now) && suggested.length > 0;
  const nowY = ((nowMinutes - dayStart * 60) / 60) * 76;

  /* ── clock ── */
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

  /* ── toasts ── */
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);
  const say = useCallback((label: string | null | undefined) => {
    if (label) setToast(label);
  }, []);

  /* ── deep links: ?date=&focusBlock= (timer file-back) and ?task=<id> ── */
  useEffect(() => {
    const params = new URLSearchParams(query);
    const target = parseBoxedFocus({ date: params.get('date'), blockId: params.get('focusBlock') });
    const dateParam = params.get('date');
    if (isDateKey(dateParam)) board.setDate(dateParam);
    if (target) {
      setSelectedZone('time');
      setReturnedBlock(target.blockId);
    }
    const taskParam = params.get('task');
    if (taskParam) setReturnedTask(taskParam);
    if (!target && !isDateKey(dateParam) && !taskParam) return;
    /* consumed params strip so a reload can't refire the landing */
    const hash = window.location.hash;
    if (!hash.startsWith('#/p/boxed?')) return;
    const current = new URLSearchParams(hash.slice(hash.indexOf('?') + 1));
    let changed = false;
    for (const k of ['date', 'focusBlock', 'task']) {
      if (current.has(k)) {
        current.delete(k);
        changed = true;
      }
    }
    if (changed) {
      window.location.hash = `/p/boxed${current.size ? `?${current}` : ''}`;
    }
  }, [query]);

  useEffect(() => {
    if (!returnedBlock) return;
    const el = timelineRef.current?.querySelector<HTMLElement>(`[data-boxed-block="${returnedBlock}"]`);
    el?.scrollIntoView({ block: 'nearest' });
    el?.focus({ preventScroll: true });
  }, [returnedBlock, state.date, query]);

  useEffect(() => {
    if (!returnedTask) return;
    const el = document.querySelector<HTMLElement>(`[data-boxed-task="${returnedTask}"]`);
    el?.scrollIntoView({ block: 'nearest' });
    el?.classList.add('is-returned');
    window.setTimeout(() => el?.classList.remove('is-returned'), 2400);
  }, [returnedTask, state.date, query]);

  /* ── focus hand-off to Timer ── */
  const startFocus = async (block: Block) => {
    const task = dayBoard.tasks[block.taskId];
    if (!task || focusStarting.current) return;
    focusStarting.current = true;
    setStartingFocus(true);
    setFocusNotice(null);
    try {
      const commitment = task.commitmentId
        ? entities.find(
            (row) =>
              row.app === 'syllabus' &&
              row.type === 'commitment' &&
              row.id === task.commitmentId &&
              row.data?.status === 'open',
          )
        : undefined;
      const timeLeft = minutesOf(block.end) - Math.max(minutesOf(block.start), today ? nowMinutes : minutesOf(block.start));
      if (timeLeft <= 0) {
        setFocusNotice({ message: 'This block has ended. Move it to a free slot to start focus.' });
        return;
      }
      const remaining = minutesOf(block.end) - minutesOf(block.start) - (focusedMinutes.get(block.id) ?? 0);
      const result = await execCommand('startFocusSession', {
        from: 'boxed',
        boxedFocus: { date: state.date, blockId: block.id },
        label: task.title,
        plannedMinutes: remaining > 0 ? Math.min(timeLeft, remaining) : timeLeft,
        course: commitment?.course ?? task.course,
        courseId: commitment?.courseId ?? task.courseId,
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

  /* ── mutations (all through the store — adapter + ambient see them) ── */
  const addTask = (text: string) => {
    const label = board.captureText(text);
    if (label) {
      say(label);
      setDraft('');
      inputRef.current?.focus();
    }
  };
  const addPlanningTask = (priority: (typeof suggested)[number]) => {
    board.addTasks(
      [{
        title: priority.title,
        zone: 'top',
        commitmentId: priority.id,
        estimateMin: priority.estimateMin,
        course: priority.course,
      }],
    );
    say('Added to Top Items');
  };
  const updateTask = (taskId: string, title: string) => {
    say(board.updateTask(taskId, title));
    setEditingId(null);
  };
  const cycleEstimate = (task: Task) => {
    const presets = [...ESTIMATE_PRESETS];
    const cur = task.estimateMin ?? 0;
    const next = presets.find((p) => p > cur);
    say(board.setEstimate(task.id, next ?? null));
  };
  const moveTask = (taskId: string, zone: Zone, index?: number) =>
    say(board.moveTask(taskId, zone, index));
  const reorderTop = (taskId: string, index: number) => say(board.reorderTop(taskId, index));
  const removeTask = (taskId: string) => say(board.removeTask(taskId));

  const scheduleTask = (taskId: string, startMin: number, durationMin: number, newTaskTitle?: string) => {
    const res = board.scheduleTask(taskId, startMin, durationMin, newTaskTitle
      ? { newTask: { id: taskId, title: newTaskTitle, zone: 'dump' } }
      : {});
    if (!res.ok) {
      setToast('No free space for that block');
      return;
    }
    say(res.label);
    setScheduleFor(null);
  };

  const unscheduled = topItems.filter((t) => !blocks.some((b) => b.taskId === t.id));
  const fitUnscheduled = () => {
    const first = today ? Math.max(dayStart * 60, nowMinutes) : dayStart * 60;
    const busy = [...planningBusy, ...blocks.map((b) => ({ start: minutesOf(b.start), end: minutesOf(b.end) }))];
    const placements = fitPriorities(unscheduled, busy, first, dayEnd * 60);
    if (!placements.length) {
      setToast('No priority fits in the remaining time.');
      return;
    }
    const n = board.placeBlocks(
      placements.map((p) => ({ taskId: p.taskId, startMin: p.start, endMin: p.end })),
    );
    const remaining = unscheduled.length - placements.length;
    say(
      n
        ? `Scheduled ${n} ${n === 1 ? 'priority' : 'priorities'}${remaining ? ` · ${remaining} did not fit` : ''}`
        : null,
    );
    if (!n) setToast('No priority fits in the remaining time.');
  };

  const unschedule = (taskId: string) => say(board.unscheduleTask(taskId));

  /* ── drag & drop ── */
  const handleDragStart = (event: DragEvent, payload: DragPayload) => {
    event.dataTransfer.setData('application/x-boxed-item', JSON.stringify(payload));
    event.dataTransfer.effectAllowed = 'move';
  };
  const readDrag = (event: DragEvent): DragPayload | null => {
    try {
      return JSON.parse(event.dataTransfer.getData('application/x-boxed-item'));
    } catch {
      return null;
    }
  };
  const dropToZone = (event: DragEvent, zone: Zone, index?: number) => {
    event.preventDefault();
    const payload = readDrag(event);
    if (!payload) return;
    const block = payload.blockId ? dayBoard.blocks[payload.blockId] : undefined;
    if (block) unschedule(payload.taskId);
    moveTask(payload.taskId, zone, index);
  };
  const dropOnTimeline = (event: DragEvent) => {
    event.preventDefault();
    const payload = readDrag(event);
    const scroller = timelineRef.current;
    if (!payload || !scroller) return;
    const y = event.clientY - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const snapped = dayStart * 60 + Math.floor((y / 76) * 60 / 15) * 15;
    const task = dayBoard.tasks[payload.taskId];
    if (!task) return;
    const duration = payload.blockId
      ? minutesOf(dayBoard.blocks[payload.blockId]?.end || '10:00') - minutesOf(dayBoard.blocks[payload.blockId]?.start || '09:00')
      : task.estimateMin || 60;
    scheduleTask(payload.taskId, snapped, duration);
  };

  /* ── resize ── */
  const beginResize = (event: PointerEvent<HTMLDivElement>, block: Block, duration: number) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = { blockId: block.id, pointerY: event.clientY, duration };
  };
  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    const drag = resizeRef.current;
    if (!drag) return;
    const duration = Math.max(
      15,
      Math.round((drag.duration + ((event.clientY - drag.pointerY) / 76) * 60) / 15) * 15,
    );
    setResizePreview({ blockId: drag.blockId, duration });
  };
  const finishResize = () => {
    const drag = resizeRef.current;
    if (!drag) return;
    const duration = resizePreview?.blockId === drag.blockId ? resizePreview.duration : drag.duration;
    const block = dayBoard.blocks[drag.blockId];
    if (block) {
      const start = minutesOf(block.start);
      const ok = board.canPlace(dayBoard, block.taskId, start, duration);
      if (ok && duration !== minutesOf(block.end) - start) {
        board.updateBlock(drag.blockId, { end: timeAt(start + duration) });
      } else if (!ok && duration !== minutesOf(block.end) - start) {
        setToast('That resize overlaps another task or goes past the day end');
      }
    }
    resizeRef.current = null;
    setResizePreview(null);
  };

  /* ── undo/redo + keyboard ── */
  const doUndo = useCallback(() => board.undo(), []);
  const doRedo = useCallback(() => board.redo(), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!placeActive('boxed') || event.defaultPrevented || event.isComposing) return;
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === 'n' || event.key === '/')) {
        event.preventDefault();
        setSelectedZone('dump');
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doRedo, doUndo]);

  /* ── missed stamps (clock-derived, no history) ── */
  useEffect(() => {
    if (!today) return;
    const missed = blocks
      .filter((b) => b.status === 'planned' && !focusedMinutes.has(b.id) && nowMinutes >= minutesOf(b.end))
      .map((b) => b.id);
    if (missed.length) board.markMissed(missed, nowMinutes);
  }, [state.date, state.days, nowMinutes, today, focusedMinutes, blocks]);

  /* ── derived display ── */
  const activeBlock = useMemo(
    () =>
      blocks.find(
        (b) =>
          minutesOf(b.start) <= nowMinutes &&
          minutesOf(b.end) > nowMinutes &&
          today &&
          (b.status === 'planned' || b.status === 'active'),
      ),
    [blocks, nowMinutes, today],
  );
  const totalPlanned = blocks.reduce((sum, b) => sum + minutesOf(b.end) - minutesOf(b.start), 0);
  const doneCount = blocks.filter((b) => b.status === 'done').length;
  const focusedToday = [...focusedMinutes.values()].reduce((a, b) => a + b, 0);
  const dayLabel = today ? 'Today' : state.date === yesterdayKey() ? 'Yesterday' : prettyDate(state.date);

  const recoverToTop = (taskId: string) =>
    dayBoard.tasks[taskId]?.zone === 'top' ? unschedule(taskId) : moveTask(taskId, 'top');
  const recoverToNextSlot = (block: Block) => {
    const duration = minutesOf(block.end) - minutesOf(block.start);
    const nextStart = Math.max(dayStart * 60, Math.ceil(nowMinutes / 15) * 15);
    const free = board.findFree(dayBoard, block.taskId, nextStart, duration);
    if (free == null) {
      setToast('No free slot remains in this day');
      return;
    }
    scheduleTask(block.taskId, free, duration);
  };

  const openSchedule = (task: Task, block?: Block) => {
    selectObject('boxed', block ? 'block' : 'task', block ? block.id : task.id, task.title,
      `/apps/boxed/?date=${state.date}`, {
        sub: block ? `${block.start}–${block.end}` : undefined,
        data: { date: state.date, zone: task.zone, estimateMin: task.estimateMin },
      });
    setScheduleFor(task.id);
    setScheduleStart(block?.start || '09:00');
    setScheduleLength(block ? minutesOf(block.end) - minutesOf(block.start) : task.estimateMin || 60);
  };

  /* ── render helpers ── */
  const renderTaskRow = (task: Task, index: number, zone: Zone) => {
    const block = Object.values(dayBoard.blocks).find((b) => b.taskId === task.id);
    const isDone = block?.status === 'done';
    return (
      <div
        key={task.id}
        className={`bx-task ${block ? 'has-block' : ''} ${isDone ? 'is-done' : ''}`}
        data-boxed-task={task.id}
        draggable
        onDragStart={(e) => handleDragStart(e, { taskId: task.id, ...(block ? { blockId: block.id } : {}) })}
      >
        <span className="bx-grip" aria-hidden="true"><GripVertical size={15} /></span>
        {zone === 'top' && <span className="bx-rank">{index + 1}</span>}
        {editingId === task.id ? (
          <input
            autoFocus
            value={editText}
            aria-label="Edit task title"
            onChange={(e) => setEditText(e.target.value)}
            onBlur={() => {
              if (cancelEditRef.current) {
                cancelEditRef.current = false;
                return;
              }
              if (editText !== task.title) updateTask(task.id, editText);
              else setEditingId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                cancelEditRef.current = true;
                setEditingId(null);
                setEditText(task.title);
              }
            }}
          />
        ) : (
          <button
            className="bx-task-title"
            onClick={() => {
              setEditingId(task.id);
              setEditText(task.title);
            }}
            onKeyDown={(e) => {
              if (zone === 'top' && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                reorderTop(task.id, index + (e.key === 'ArrowUp' ? -1 : 1));
              }
            }}
            title="Edit task title"
          >
            {task.title}
          </button>
        )}
        {task.estimateMin ? (
          <button
            className="bx-est"
            title="Estimate — click to change"
            onClick={() => cycleEstimate(task)}
          >
            <Timer size={10} aria-hidden="true" />
            {formatEstimate(task.estimateMin)}
          </button>
        ) : (
          <button className="bx-est bx-est-empty" title="Add an estimate" onClick={() => cycleEstimate(task)}>
            <Timer size={10} aria-hidden="true" /> est
          </button>
        )}
        {block && <span className="bx-time-chip"><Clock3 size={11} />{formatRange(block)}</span>}
        {zone === 'top' && !block && <span className="bx-unscheduled">unscheduled</span>}
        <div className="bx-row-actions">
          {task.commitmentId && (
            <button
              aria-label={`Open ${task.title} in Planning`}
              title="Open in Planning"
              onClick={() =>
                window.iterra?.open(`/apps/syllabus/?commitment=${encodeURIComponent(task.commitmentId!)}`)
              }
            >
              <ArrowUpRight size={14} />
            </button>
          )}
          {zone === 'dump' ? (
            <button aria-label="Promote to Top Items" title="Move to Top Items" onClick={() => moveTask(task.id, 'top')}>
              <ArrowUp size={14} />
            </button>
          ) : (
            <button aria-label="Demote to Brain Dump" title="Move to Brain Dump" onClick={() => moveTask(task.id, 'dump')}>
              <ArrowDown size={14} />
            </button>
          )}
          <button
            aria-label={block ? 'Reschedule task' : 'Schedule task'}
            title="Schedule"
            onClick={() => openSchedule(task, block)}
          >
            <Clock3 size={14} />
          </button>
          <button
            aria-label="Edit task"
            title="Edit"
            onClick={() => {
              setEditingId(task.id);
              setEditText(task.title);
            }}
          >
            <span className="bx-edit-glyph">✎</span>
          </button>
          <button aria-label="Delete task" title="Delete" onClick={() => removeTask(task.id)}>
            <Trash2 size={13} />
          </button>
          {zone === 'top' && (
            <span className="bx-key-reorder">
              <button aria-label="Move priority up" onClick={() => reorderTop(task.id, index - 1)} disabled={index === 0}>
                <ArrowUp size={12} />
              </button>
              <button aria-label="Move priority down" onClick={() => reorderTop(task.id, index + 1)} disabled={index === topItems.length - 1}>
                <ArrowDown size={12} />
              </button>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="it-place-boxed bx-root">
      <AtlasMasthead
        compact
        object="box"
        place="boxed"
        title="Daily Board"
        sub="Capture everything, choose what matters, and give it a place in the day."
        className="mx-4 mt-3 mb-2 shrink-0 sm:mx-[22px]"
      />

      {/* ── command strip ── */}
      <header className="bx-header">
        <div className="bx-brand">
          <span className="bx-mark" aria-hidden="true"><span /><span /></span>
          <div>
            <div className="bx-wordmark">BOXED</div>
            <div className="bx-subtitle">TIME BOXING · BRAIN DUMP</div>
          </div>
        </div>

        <div className="bx-daynav">
          <button aria-label="Previous day" onClick={() => board.stepDay(-1)}><ChevronLeft size={17} /></button>
          <div className="bx-daylabel">
            <b className="bx-full-date">{prettyDate(state.date)}</b>
            <b className="bx-short-date" title={prettyDate(state.date)}>{shortDate(state.date)}</b>
            {today && <span className="bx-today-tag">Today</span>}
          </div>
          <button aria-label="Next day" onClick={() => board.stepDay(1)}><ChevronRight size={17} /></button>
          <input
            aria-label="Choose day"
            type="date"
            value={state.date}
            onChange={(e) => isDateKey(e.target.value) && board.setDate(e.target.value)}
          />
          {!today && (
            <button className="bx-back-today" onClick={() => board.setDate(todayKey())}>Today</button>
          )}
        </div>

        <div className="bx-stats" aria-label="Day at a glance">
          <span><b>{dumpItems.length + topItems.length}</b> captured</span>
          <span><b>{topItems.length}</b> top</span>
          <span><b>{totalPlanned ? `${Math.floor(totalPlanned / 60)}h${totalPlanned % 60 ? ` ${totalPlanned % 60}m` : ''}` : '—'}</b> planned</span>
          <span className={doneCount ? 'bx-stat-done' : ''}><b>{doneCount}</b> done</span>
        </div>

        <div className="bx-tools">
          <button aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!state.past.length} onClick={doUndo}>
            <Undo2 size={16} />
          </button>
          <button aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!state.future.length} onClick={doRedo}>
            <RotateCw size={15} />
          </button>
          <button className="bx-clear" aria-label="Clear board" onClick={() => setConfirmClear(true)}>
            <Trash2 size={13} /><span>Clear</span>
          </button>
        </div>
      </header>

      {activeBlock && (
        <div className="bx-now-strip">
          <span className="bx-live-dot" aria-hidden="true" />
          <span className="bx-now-title">{dayBoard.tasks[activeBlock.taskId]?.title}</span>
          <span className="bx-now-left">
            {Math.max(0, minutesOf(activeBlock.end) - nowMinutes)}m left
          </span>
          <button type="button" onClick={() => void startFocus(activeBlock)} disabled={startingFocus}>
            <Play size={12} aria-hidden="true" /> Start focus
          </button>
        </div>
      )}
      {focusNotice && (
        <div className="bx-focus-notice" role="status">
          <span>{focusNotice.message}</span>
          {focusNotice.openTimer && (
            <button type="button" onClick={() => window.iterra?.open('#/p/timer')}>Open Timer</button>
          )}
          <button type="button" aria-label="Dismiss focus message" onClick={() => setFocusNotice(null)}>
            <X size={13} />
          </button>
        </div>
      )}

      <main className="bx-board">
        {/* ── left: capture → prioritize ── */}
        <section className="bx-left">
          <section
            className={`bx-zone bx-dump ${selectedZone === 'dump' ? 'mobile-current' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => dropToZone(e, 'dump')}
          >
            <div className="bx-zone-heading">
              <div>
                <span className="bx-eyebrow">01 / CAPTURE</span>
                <h2>Brain Dump</h2>
              </div>
              <span className="bx-count">{dumpItems.length}</span>
            </div>
            <form
              className="bx-capture"
              onSubmit={(e) => {
                e.preventDefault();
                addTask(draft);
              }}
            >
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text/plain');
                  if (text.includes('\n')) {
                    e.preventDefault();
                    addTask(text);
                  }
                }}
                placeholder="Get it out of your head…"
                aria-label="Add to Brain Dump"
              />
              <button aria-label="Add task"><Plus size={17} /></button>
            </form>
            <p className="bx-helper">
              Enter to add · paste lines · <kbd>~45</kbd> sets an estimate · <kbd>!</kbd> promotes to Top
            </p>
            {canUsePlanning && (
              <button
                type="button"
                className="bx-suggest bx-mobile-planning"
                onClick={() => {
                  setSelectedZone('top');
                  setShowPlanning(true);
                  requestAnimationFrame(() => planningToggleRef.current?.focus());
                }}
              >
                Add from Planning
              </button>
            )}
            <div className="bx-list" role="list" aria-label="Brain Dump">
              {dumpItems.map((task, index) => (
                <div key={task.id} role="listitem">{renderTaskRow(task, index, 'dump')}</div>
              ))}
              {!dumpItems.length && (
                <div className="bx-empty">
                  <b>Mind clear.</b>
                  <span>Everything you capture lands here first — nothing is decided yet.</span>
                </div>
              )}
            </div>
          </section>

          <section
            className={`bx-zone bx-top ${selectedZone === 'top' ? 'mobile-current' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => dropToZone(e, 'top')}
          >
            <div className="bx-zone-heading">
              <div>
                <span className="bx-eyebrow">02 / PRIORITIZE</span>
                <h1>Top Items</h1>
              </div>
              <span className="bx-count">{topItems.length}<i>/ {Math.max(5, topItems.length)}</i></span>
            </div>
            <p className="bx-helper">The work that matters most {today ? 'today' : 'this day'} — in order.</p>
            <div className="bx-list" role="list" aria-label="Top Items" hidden={!topItems.length && canUsePlanning}>
              {topItems.map((task, index) => (
                <div
                  key={task.id}
                  role="listitem"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.stopPropagation();
                    const payload = readDrag(e);
                    if (!payload?.taskId) return;
                    const source = dayBoard.tasks[payload.taskId];
                    if (payload.blockId) unschedule(payload.taskId);
                    if (source?.zone === 'top') reorderTop(payload.taskId, index);
                    else moveTask(payload.taskId, 'top', index);
                  }}
                >
                  {renderTaskRow(task, index, 'top')}
                </div>
              ))}
              {!topItems.length && !canUsePlanning && (
                <div className="bx-empty">
                  <b>No priorities yet.</b>
                  <span>Promote from the dump, or pull a commitment across from Planning.</span>
                </div>
              )}
            </div>

            {topItems.length > 5 && (
              <p className="bx-cap-warning">More than five — move what can wait back to the dump.</p>
            )}
            {unscheduled.length > 0 && state.date >= todayKey(now) && (
              <button type="button" className="bx-fit" onClick={fitUnscheduled}>
                <Clock3 size={13} /> Fit {unscheduled.length} unscheduled into free time
              </button>
            )}
            {canUsePlanning && (
              <div className="bx-planning">
                <button
                  ref={planningToggleRef}
                  type="button"
                  className="bx-suggest"
                  aria-expanded={showPlanning}
                  onClick={() => setShowPlanning((o) => !o)}
                >
                  {showPlanning ? 'Hide Planning tasks' : `From Planning · ${suggested.length}`}
                </button>
                {showPlanning && (
                  <ul className="bx-planning-list">
                    {suggested.map((task) => (
                      <li key={task.id}>
                        <div>
                          <b>{task.title}</b>
                          <span>
                            {[
                              task.course,
                              Number.isFinite(task.due)
                                ? `Due ${new Date(task.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                                : '',
                              task.estimateMin ? `${task.estimateMin}m` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                        <button type="button" aria-label={`Add ${task.title} to Top Items`} onClick={() => addPlanningTask(task)}>
                          <Plus size={13} aria-hidden="true" /> Add
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </section>

        {/* ── right: the day itself ── */}
        <section
          className={`bx-zone bx-timeline ${selectedZone === 'time' ? 'mobile-current' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={dropOnTimeline}
        >
          <div className="bx-zone-heading bx-timeline-heading">
            <div>
              <span className="bx-eyebrow">03 / COMMIT</span>
              <h2>Time Boxed</h2>
            </div>
            <div className="bx-timeline-options">
              <label>
                From{' '}
                <select aria-label="Timeline starts at" value={dayStart} onChange={(e) => board.setDayRange('dayStart', Number(e.target.value))}>
                  {Array.from({ length: 23 }, (_, i) => i).map((h) => (
                    <option value={h} key={h}>{formatTime(`${pad(h)}:00`)}</option>
                  ))}
                </select>
              </label>
              <label>
                To{' '}
                <select aria-label="Timeline ends at" value={dayEnd} onChange={(e) => board.setDayRange('dayEnd', Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                    <option value={h} key={h}>{h === 24 ? '12:00 AM' : formatTime(`${pad(h)}:00`)}</option>
                  ))}
                </select>
              </label>
              <div className="bx-free-time">
                <b>{totalPlanned ? `${Math.floor(totalPlanned / 60)}h ${totalPlanned % 60 ? `${totalPlanned % 60}m` : ''}`.trim() : '0h'}</b>
                <span>planned{focusedToday ? ` · ${focusedToday}m focused` : ''}</span>
              </div>
            </div>
          </div>
          <p className="bx-helper">Tap an open hour to add a block · drag anything here to schedule it.</p>
          <div
            className="bx-timeline-scroll"
            ref={(node) => {
              timelineRef.current = node;
              if (!node || !today) return;
              const active = blocks.find((b) => minutesOf(b.start) <= nowMinutes && minutesOf(b.end) > nowMinutes);
              if (active && node.dataset.scrolled !== state.date) {
                node.scrollTop = Math.max(0, nowY - 160);
                node.dataset.scrolled = state.date;
              }
            }}
          >
            <div className="bx-timeline-track" style={{ height: `${(dayEnd - dayStart) * 76}px` }}>
              {Array.from({ length: dayEnd - dayStart }, (_, index) => {
                const start = timeAt((dayStart + index) * 60);
                return (
                  <button
                    type="button"
                    className="bx-hour"
                    key={start}
                    style={{ top: `${index * 76}px` }}
                    aria-label={`Add time block at ${formatTime(start)}`}
                    onClick={() => {
                      setScheduleFor('new');
                      setScheduleStart(start);
                      setScheduleLength(60);
                    }}
                  >
                    <span>{formatTime(start)}</span>
                    <span className="bx-hour-line" />
                  </button>
                );
              })}
              {blocks.map((block) => {
                const start = minutesOf(block.start);
                const end = minutesOf(block.end);
                const duration = end - start;
                const shownDuration = resizePreview?.blockId === block.id ? resizePreview.duration : duration;
                const taskTitle = dayBoard.tasks[block.taskId]?.title || 'Task';
                const logged = focusedMinutes.get(block.id);
                const pending = block.status === 'planned' || block.status === 'active';
                const active = pending && today && start <= nowMinutes && end > nowMinutes;
                const missed = !logged && (block.status === 'missed' || (today && pending && nowMinutes >= end));
                const status = missed
                  ? 'Missed'
                  : active
                    ? 'Active now'
                    : logged && (pending || block.status === 'missed')
                      ? 'Focus logged'
                      : block.status;
                const elapsed = active ? Math.min(1, Math.max(0, (nowMinutes - start) / duration)) : 0;
                const classes = [
                  'bx-block',
                  shownDuration < 60 && 'is-compact',
                  returnedBlock === block.id && 'is-returned',
                  active && 'is-active',
                  block.status === 'done' && 'is-done',
                  block.status === 'skipped' && 'is-skipped',
                  missed && 'is-missed',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <div
                    key={block.id}
                    data-boxed-block={block.id}
                    role="group"
                    aria-label={taskTitle}
                    tabIndex={-1}
                    draggable
                    onDragStart={(e) => handleDragStart(e, { taskId: block.taskId, blockId: block.id })}
                    className={classes}
                    style={{ top: ((start - dayStart * 60) / 60) * 76, height: Math.max(34, (shownDuration / 60) * 76) }}
                  >
                    {active && <span className="bx-block-progress" style={{ height: `${elapsed * 100}%` }} />}
                    <div className="bx-block-main">
                      <button
                        type="button"
                        className="bx-block-title-btn"
                        onClick={() =>
                          selectObject('boxed', 'block', block.id, taskTitle, `/apps/boxed/?date=${state.date}`, {
                            sub: formatRange(block),
                            data: { date: state.date, status: block.status, start, end },
                          })
                        }
                      >
                        <Info size={11} aria-hidden="true" />
                      </button>
                      <span className="bx-block-time">
                        {formatRange(block)}
                        {logged ? <span className="bx-focus-log"> · {logged}m focused</span> : null}
                      </span>
                      <strong>{taskTitle}</strong>
                      <span className="bx-block-status">{status}</span>
                      <div className="bx-block-actions">
                        {missed ? (
                          <>
                            <button onClick={() => recoverToTop(block.taskId)} aria-label="Recover missed task to Top Items">
                              <ArrowUp size={12} /> Top
                            </button>
                            <button onClick={() => recoverToNextSlot(block)} aria-label="Schedule missed task in next free slot">
                              <Clock3 size={12} /> Next free
                            </button>
                          </>
                        ) : (
                          <>
                            {block.status !== 'done' && (
                              <button onClick={() => { board.updateBlock(block.id, { status: 'done', actualEnd: Date.now() }); say('Block stamped done'); }} aria-label="Mark task done">
                                <Check size={12} /> Done
                              </button>
                            )}
                            {block.status !== 'skipped' && block.status !== 'done' && (
                              <button onClick={() => board.updateBlock(block.id, { status: 'skipped' })} aria-label="Skip task">
                                <X size={12} /> Skip
                              </button>
                            )}
                            <button onClick={() => unschedule(block.taskId)} aria-label="Move task back to list">
                              <ArrowLeft size={12} /> Unbox
                            </button>
                            {pending && !active && (
                              <button onClick={() => void startFocus(block)} disabled={startingFocus} aria-label="Start focus on this block">
                                <Play size={11} /> Focus
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div
                      className="bx-resize"
                      role="slider"
                      aria-label={`Resize ${taskTitle}`}
                      aria-valuemin={15}
                      aria-valuemax={dayEnd * 60 - start}
                      aria-valuenow={shownDuration}
                      tabIndex={0}
                      title="Drag the lower edge to resize in 15 minute steps"
                      onPointerDown={(e) => beginResize(e, block, duration)}
                      onPointerMove={moveResize}
                      onPointerUp={finishResize}
                      onPointerCancel={finishResize}
                      onKeyDown={(e) => {
                        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                        e.preventDefault();
                        const next = duration + (e.key === 'ArrowUp' ? 15 : -15);
                        if (board.canPlace(dayBoard, block.taskId, start, next)) {
                          board.updateBlock(block.id, { end: timeAt(start + next) });
                        }
                      }}
                    >
                      <span className="bx-resize-grip" />
                    </div>
                  </div>
                );
              })}
              {today && nowY >= 0 && nowY <= (dayEnd - dayStart) * 76 && (
                <div className="bx-now-line" style={{ top: `${nowY}px` }} aria-label={`Current time ${formatTime(timeAt(nowMinutes))}`}>
                  <span>{formatTime(timeAt(nowMinutes))}</span>
                  <i />
                </div>
              )}
            </div>
          </div>
          {!blocks.length && (
            <div className="bx-timeline-empty">
              <b>An open day.</b>
              <span>Drag a priority onto the hours, or tap any hour to start a block.</span>
            </div>
          )}
        </section>
      </main>

      <nav className="bx-mobile-tabs" aria-label="Planner zones">
        <button className={selectedZone === 'dump' ? 'active' : ''} onClick={() => setSelectedZone('dump')}>
          Dump <span>{dumpItems.length}</span>
        </button>
        <button className={selectedZone === 'top' ? 'active' : ''} onClick={() => setSelectedZone('top')}>
          Top <span>{topItems.length}</span>
        </button>
        <button className={selectedZone === 'time' ? 'active' : ''} onClick={() => setSelectedZone('time')}>
          Time <span>{blocks.length}</span>
        </button>
        <button
          className="bx-mobile-add"
          aria-label="Capture a task"
          onClick={() => {
            setSelectedZone('dump');
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </nav>

      {toast && <div className="bx-toast" role="status">{toast}</div>}

      <Dialog open={!!scheduleFor} onClose={() => setScheduleFor(null)} title={scheduleFor === 'new' ? 'New time block' : 'Schedule task'}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!scheduleFor) return;
            if (!/^\d{2}:\d{2}$/.test(scheduleStart)) {
              setToast('Choose a time within your day');
              return;
            }
            const startMin = minutesOf(scheduleStart);
            if (startMin < dayStart * 60 || startMin >= dayEnd * 60) {
              setToast('Choose a time within your day');
              return;
            }
            if (scheduleFor === 'new') {
              const title = String(new FormData(e.currentTarget).get('title') ?? '').trim();
              if (!title) return;
              const id = newId('task');
              scheduleTask(id, startMin, scheduleLength, title);
            } else {
              scheduleTask(scheduleFor, startMin, scheduleLength);
            }
          }}
        >
          {scheduleFor === 'new' ? (
            <input name="title" aria-label="Task title" className="bx-modal-title" placeholder="What will you work on?" required />
          ) : (
            <p className="bx-modal-task">{scheduleFor && dayBoard.tasks[scheduleFor]?.title}</p>
          )}
          <label className="bx-field">
            Start time
            <input
              type="time"
              min={`${pad(dayStart)}:00`}
              max={`${pad(dayEnd - 1)}:45`}
              value={scheduleStart}
              required
              onChange={(e) => setScheduleStart(e.target.value)}
            />
          </label>
          <div className="bx-duration-picker">
            <span>Duration</span>
            {[15, 30, 45, 60, 90, 120].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={scheduleLength === d}
                className={scheduleLength === d ? 'active' : ''}
                onClick={() => setScheduleLength(d)}
              >
                {d < 60 ? `${d}m` : `${d / 60}h`}
              </button>
            ))}
          </div>
          <p className="bx-modal-hint">If the slot is taken, the block slides to the next free time.</p>
          <button className="bx-primary" type="submit">Add to Time Box</button>
        </form>
      </Dialog>

      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear the board?">
        <p className="bx-modal-copy">
          This removes the tasks and time blocks for {dayLabel}. Undo can restore them.
        </p>
        <div className="bx-modal-buttons">
          <button type="button" onClick={() => setConfirmClear(false)}>Keep board</button>
          <button
            type="button"
            className="bx-danger"
            onClick={() => {
              say(board.clearBoard());
              setConfirmClear(false);
            }}
          >
            Clear board
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}
