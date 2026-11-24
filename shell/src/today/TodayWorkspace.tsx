import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Check,
  ArrowUpRight,
  Clock,
  BookOpen,
  Layers,
  FileText,
  Calendar,
  Sparkles,
  Plus,
  PanelRightOpen,
} from 'lucide-react';
import { PLACE_MAP, formatEntityType } from '../places';
import type { Presence, SharedField, FeedItem, Entity, StoreEntity, IntakeWait } from '../hub';
import { sendTo } from '../hub';
import { isDemoLoaded, seedDemoSemester } from '../integration/demo';
import { readFollowUpTasks, saveFollowUpTask } from '../integration/identity';
import { PlanFromToday } from '../integration/StudySessionPlan';
import { canDraftNoteDeck, openNoteDeckDraft } from '../integration/ModalsHost';
import { studyCourses } from '../integration/studyPlan';
import { todayISO } from '../apps/rhythm/lib/dates';
import { subscribeShelf, togglePin, type ShelfPin } from '../shelf';
import { Badge, Button, Dialog, Disclosure, EmptyState } from '../ui/primitives';
import {
  JournalMasthead,
  JournalSection,
  JournalTabs,
  ToolsDirectory,
  type TodayView,
} from './TodayJournalChrome';
import { FirstAssignmentDialog } from './FirstAssignmentDialog';
import './today.css';
import {
  ObjectRow,
  type WorkspaceObject,
  toWorkspaceObject,
  iconForObjectType,
  formatRelativeTime,
} from '../ui/ObjectRow';

/* seed + reload — mounted places hold their stores in memory, so only a
   reload rehydrates every surface from the seeded envelopes (the Settings
   sample-semester row does the same) */
function loadSampleSemester() {
  void seedDemoSemester().then((r) => {
    if (r.ok) window.location.reload();
  });
}

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* 'Friday' for a due date inside the next week, 'today'/'tomorrow'/'yesterday'
   adjacent, 'Fri, Nov 28' beyond — the reason line's plain-language day */
function dayWord(ms: number, now: number): string {
  const d = new Date(ms);
  const startOfDay = (t: number) => {
    const x = new Date(t);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const diff = Math.round((startOfDay(ms) - startOfDay(now)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1 && diff <= 6) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function focusMinutes(item: WorkspaceObject) {
  return [item.data?.plannedMinutes, item.data?.minutes, item.data?.estimatedMinutes].find(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  );
}

function hasPlanningBinding(item: WorkspaceObject, type: 'block' | 'commitment') {
  return item.app === 'syllabus' && !!item.id.trim() &&
    (item.raw?.type === type || item.url === `/apps/syllabus/?${type}=${encodeURIComponent(item.id)}`);
}

export interface TodayWorkspaceProps {
  presences: Record<string, Presence>;
  mounted?: string[];
  shared: Record<string, SharedField>;
  indexes: Record<string, Entity[]>;
  entities: StoreEntity[];
  feed: FeedItem[];
  intakes?: Record<string, IntakeWait>;
  activeCourseFilter?: string;
  selectedObject?: WorkspaceObject | null;
  onSelectObject?: (obj: WorkspaceObject) => void;
  onEnter: (id: string) => void;
  onGo: (url: string) => void;
}

export function TodayWorkspace({
  presences,
  mounted = [],
  shared,
  indexes,
  entities,
  feed,
  intakes,
  activeCourseFilter = '',
  selectedObject,
  onSelectObject,
  onEnter,
  onGo,
}: TodayWorkspaceProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const [pins, setPins] = useState<ShelfPin[]>([]);
  useEffect(() => subscribeShelf(setPins), []);

  const [feedExpanded, setFeedExpanded] = useState(false);
  const [firstAssignmentOpen, setFirstAssignmentOpen] = useState(false);
  const [view, setView] = useState<TodayView>('day');
  useEffect(() => {
    setFeedExpanded(false);
  }, [activeCourseFilter]);

  const [notice, setNotice] = useState<{ text: string; url?: string } | null>(null);
  const notify = (text: string, url?: string) => {
    setNotice({ text, url });
    window.setTimeout(() => setNotice((cur) => (cur?.text === text ? null : cur)), 4000);
  };
  const [amountRoutine, setAmountRoutine] = useState<WorkspaceObject | null>(null);
  const [amountError, setAmountError] = useState('');
  const [checkingRoutine, setCheckingRoutine] = useState<string | null>(null);
  const checkInBusy = useRef(false);
  const checkInDay = todayISO(new Date(now));
  const checkIn = async (routine: WorkspaceObject, value?: number) => {
    if (checkInBusy.current) return;
    checkInBusy.current = true;
    setCheckingRoutine(routine.id);
    try {
      const result = await sendTo({
        to: 'rhythm', action: 'routine.check', entity: routine.raw,
        payload: { routineId: routine.id, date: checkInDay, value, scheduledOnly: true },
      });
      if (result.ok) {
        setAmountRoutine(null);
        notify(result.toast || (result.delivered === 'queued'
          ? 'Check-in queued. Open Attendance to finish saving it.' : 'Check-in saved.'), result.url || undefined);
      } else if (value !== undefined) setAmountError('Could not save the check-in. Try again.');
      else notify('Could not save the check-in. Try again.');
    } catch {
      if (value !== undefined) setAmountError('Could not save the check-in. Try again.');
      else notify('Could not save the check-in. Try again.');
    } finally {
      checkInBusy.current = false;
      setCheckingRoutine(null);
    }
  };

  const courseFilterLow = activeCourseFilter.trim().toLowerCase();
  const matchesCourseFilter = (c?: string, topic?: string) => {
    if (!courseFilterLow) return true;
    return (
      (c || '').toLowerCase() === courseFilterLow ||
      (topic || '').toLowerCase() === courseFilterLow
    );
  };

  /* ── 1. Active Session (Timer or Proof practice session) ── */
  const focusField = shared.focus;
  const fv = (focusField?.v || {}) as {
    running?: boolean;
    paused?: boolean;
    label?: string;
    course?: string;
    blockId?: string | null;
    endsAt?: number;
    remainingSec?: number;
    totalMin?: number;
  };
  /* running self-expires via endsAt — the timer publishes shared.focus
     once at start and ticks locally, so `at` aging mid-run is normal;
     paused keeps the 3-min heartbeat gate (a dead page stops beating) */
  const focusLive =
    fv.running === true
      ? !!fv.endsAt && fv.endsAt > now
      : fv.paused === true && !!focusField?.at && now - focusField.at < 3 * 60 * 1000;
  const focusSecLeft =
    fv.running && fv.endsAt
      ? Math.max(0, (fv.endsAt - now) / 1000)
      : fv.remainingSec ?? 0;

  const proofSession = shared.session?.v as { topic?: string; minutes?: number; active?: boolean } | undefined;
  const proofSessionLive =
    !!proofSession?.active && !!shared.session?.at && now - shared.session.at < 5 * 60 * 1000;
  const studyCourseEntities = useMemo(() => studyCourses(entities), [entities]);
  const hasStudyCourses = studyCourseEntities.length > 0;
  const firstAssignmentCourses = useMemo(
    () => studyCourseEntities
      .map((course) => ({
        code: course.course || String(course.data?.code || ''),
        name: course.title || course.course || 'Course',
      }))
      .filter((course) => course.code.trim().length > 0),
    [studyCourseEntities],
  );
  const showStarterCards = !hasStudyCourses && !focusLive && !proofSessionLive;

  const timerCtl = (op: 'pause' | 'resume' | 'finish') => {
    void sendTo({ to: 'timer', action: 'timer.control', payload: { op } });
  };

  /* ── All unified WorkspaceObjects from canonical store + index mirrors ── */
  const allObjects = useMemo<WorkspaceObject[]>(() => {
    const out: WorkspaceObject[] = [];
    const seen = new Set<string>();
    for (const e of entities || []) {
      if (!e?.title || e.type === 'course' || e.type === 'term' || e.type === 'link' || e.type === 'event') continue;
      if (!matchesCourseFilter(e.course, e.topic)) continue;
      const w = toWorkspaceObject(e);
      const sig = `${w.app}|${w.url}|${w.title}`;
      seen.add(sig);
      out.push(w);
    }
    for (const [app, list] of Object.entries(indexes || {})) {
      for (const e of list || []) {
        if (!e?.title) continue;
        if (!matchesCourseFilter(e.course, e.topic)) continue;
        const url = e.url || `/apps/${app}/`;
        const sig = `${app}|${url}|${e.title}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push({
          key: `${app}:${e.t || 'item'}:${e.id || e.title}`,
          app,
          type: e.t || 'item',
          id: e.id || e.title,
          title: e.title,
          sub: e.sub,
          course: e.course,
          topic: e.topic,
          url,
          updatedAt: e.at,
        });
      }
    }
    return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, indexes, courseFilterLow]);

  /* ── 2. Resume Working: the actual object most recently worked on ── */
  const resumeObject = useMemo<WorkspaceObject | null>(() => {
    // Check shared.noteActive first if fresh
    const na = shared.noteActive;
    if (na?.v?.title && na.at && now - na.at < 30 * 60_000) {
      const v = na.v as { app: string; id: string; title: string; at?: number };
      const match = allObjects.find((o) => o.app === v.app && o.type === 'note' &&
        (v.id ? o.id === v.id : o.title === v.title));
      if (match) return match;
      if (!courseFilterLow && v.id) {
        return {
          key: `${v.app}:note:${v.id}`,
          app: v.app,
          type: 'note',
          id: v.id,
          title: v.title,
          url: `/apps/${v.app}/?note=${encodeURIComponent(v.id)}`,
          updatedAt: v.at || na.at,
        };
      }
    }
    // Check shared.deck if fresh
    const dk = shared.deck;
    if (dk?.v?.deck && dk.at && now - dk.at < 30 * 60_000) {
      const match = allObjects.find((o) => o.app === 'flashcards' && o.title === dk.v.deck);
      if (match) return match;
    }
    // Otherwise newest concrete object (note, deck, problem, attempt, assessment, block)
    return (
      allObjects.find((o) =>
        ['note', 'deck', 'problem', 'attempt', 'quiz', 'assessment', 'block', 'commitment'].includes(o.type),
      ) ||
      allObjects[0] ||
      null
    );
  }, [shared.noteActive, shared.deck, allObjects, now, courseFilterLow]);

  /* ── This Week strip: session entities stamp createdAt at the session's
     own end (a backfilled row lands on its study day), so bucketed minutes
     read as a honest 7-day ledger — hidden when the week is empty. */
  const weekStrip = useMemo(() => {
    const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    /* calendar dates, not 86400s offsets — a DST 23h/25h day would drift
       an arithmetic bucket */
    const dayStart = (back: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - back);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    const bounds = Array.from({ length: 7 }, (_, i) => dayStart(6 - i));
    const days = bounds.map((b, i) => ({
      label: DAYS[new Date(b).getDay()],
      mins: 0,
      today: i === 6,
    }));
    const day0 = bounds[0];
    let total = 0;
    for (const e of entities || []) {
      if (e.type !== 'session') continue;
      const mins = typeof e.data?.minutes === 'number' ? e.data.minutes : 0;
      if (mins <= 0) continue;
      const at =
        typeof e.data?.endedAt === 'number' ? e.data.endedAt
        : typeof e.createdAt === 'number' ? e.createdAt
        : e.updatedAt;
      if (typeof at !== 'number' || at < day0 || at > now + 3600_000) continue;
      if (!matchesCourseFilter(e.course, e.topic)) continue;
      let di = 0;
      while (di < 6 && at >= bounds[di + 1]) di++;
      days[di].mins += mins;
      total += mins;
    }
    if (!total) return null;
    return { days, total, max: Math.max(...days.map((d) => d.mins), 1) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, now, courseFilterLow]);

  /* ── 3. Next Up: Scheduled work blocks & commitments ── */
  const scheduledWork = useMemo(() => {
    const nb = shared.today?.v?.nextBlock as
      | { id?: string; title?: string; minutes?: number; course?: string; courseId?: string;
          commitmentId?: string; materialRef?: string }
      | undefined;

    const allBC = allObjects.filter((o) => o.type === 'block' || o.type === 'commitment');
    /* commitments carry data.status, blocks carry data.state — check both;
       a block completed while syllabus was cold must not linger here */
    const isLive = (o: WorkspaceObject) =>
      o.data?.status !== 'done' &&
      o.data?.status !== 'completed' &&
      o.data?.status !== 'dropped' &&
      o.data?.state !== 'done' &&
      o.data?.state !== 'deferred';
    const blocksAndCommitments = allBC.filter(isLive);

    blocksAndCommitments.sort((a, b) => {
      const da = typeof a.dueAt === 'number' ? a.dueAt : a.dueAt ? Date.parse(String(a.dueAt)) : Infinity;
      const db = typeof b.dueAt === 'number' ? b.dueAt : b.dueAt ? Date.parse(String(b.dueAt)) : Infinity;
      if (da !== db) return da - db;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    /* shared.today.nextBlock goes stale when a bound session marks its block
       done while syllabus is cold — if the live object exists and says done,
       skip it rather than fabricating a finished slip as next up */
    const nextBlockId = typeof nb?.id === 'string' && nb.id.trim() ? nb.id : undefined;
    const isMatchingBlock = (item: WorkspaceObject) => hasPlanningBinding(item, 'block') &&
      (!nb?.course || !item.course || item.course.toLowerCase() === nb.course.toLowerCase());
    const nbDone = nextBlockId ? allBC.some((o) => isMatchingBlock(o) && o.id === nextBlockId && !isLive(o)) : false;

    let primary: WorkspaceObject | null = null;
    if (nb?.title && matchesCourseFilter(nb.course) && !nbDone) {
      // A published ID is authoritative even before the corresponding row is
      // loaded. Use title matching only for older publications without IDs.
      const match = blocksAndCommitments.find((item) => isMatchingBlock(item) &&
        (nextBlockId ? item.id === nextBlockId : item.title === nb.title));
      const publishedData = {
        minutes: nb.minutes,
        commitmentId: nb.commitmentId,
        materialRef: nb.materialRef,
      };
      if (match) {
        primary = nextBlockId ? {
          ...match,
          course: match.course ?? nb.course,
          courseId: match.courseId ?? nb.courseId,
          data: { ...publishedData, ...match.data },
        } : match;
      } else {
        primary = {
          key: `syllabus:block:${nextBlockId || 'next'}`,
          app: 'syllabus',
          type: 'block',
          id: nextBlockId || '',
          title: nb.title,
          course: nb.course,
          courseId: nb.courseId,
          url: nextBlockId ? `/apps/syllabus/?block=${encodeURIComponent(nextBlockId)}` : '/apps/syllabus/',
          data: publishedData,
        };
      }
    }
    if (!primary && blocksAndCommitments.length > 0) {
      primary = blocksAndCommitments[0];
    }

    const queue = blocksAndCommitments.filter((b) => !primary || b.key !== primary.key).slice(0, 4);
    return { primary, queue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared.today, allObjects, courseFilterLow]);

  /* 'Scheduled Next' should admit when it's late — a slipped block or a
     past-due commitment wears a warn badge instead of blending in. */
  const primaryLate = useMemo(() => {
    const p = scheduledWork.primary;
    if (!p) return null;
    if (p.type === 'block' && p.data?.state === 'planned' && typeof p.data?.plannedDate === 'string') {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (p.data.plannedDate < today) {
        return `slipped · was ${new Date(`${p.data.plannedDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      }
    }
    if (p.dueAt != null) {
      const ms = typeof p.dueAt === 'number' ? p.dueAt : Date.parse(String(p.dueAt));
      if (!Number.isNaN(ms) && ms !== 0 && ms <= now) return 'overdue';
    }
    return null;
  }, [scheduledWork, now]);

  /* The reason beside the first action — why this is what's next. A booked
     slip says when it's planned; a bare commitment admits it has no study
     block yet, which is what routes its action to Planning. */
  const primaryReason = useMemo(() => {
    const p = scheduledWork.primary;
    if (!p) return null;
    if (p.type === 'commitment') {
      const raw = p.dueAt;
      const ms = typeof raw === 'number' ? raw : raw ? Date.parse(String(raw)) : NaN;
      if (Number.isNaN(ms)) return `${p.title} · no study block yet`;
      const when = `${ms <= now ? 'was due' : 'due'} ${dayWord(ms, now)}`;
      return `${p.title} · ${when} · no study block yet`;
    }
    const plannedDate = typeof p.data?.plannedDate === 'string' ? p.data.plannedDate : null;
    if (!plannedDate) return null;
    const todayKey = todayISO(new Date(now));
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = todayISO(tomorrow);
    const when = plannedDate === todayKey ? 'today'
      : plannedDate === tomorrowKey ? 'tomorrow'
      : new Date(`${plannedDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const start = typeof p.data?.plannedStart === 'string' && p.data.plannedStart.trim()
      ? ` · ${p.data.plannedStart.trim()}` : '';
    return `Booked ${when}${start}`;
  }, [scheduledWork.primary, now]);

  /* 'Start ___' names the course when known, else the assignment itself */
  const primaryStartName = scheduledWork.primary
    ? scheduledWork.primary.course || scheduledWork.primary.title
    : '';
  const primaryMinutes = scheduledWork.primary ? focusMinutes(scheduledWork.primary) : undefined;
  const focusName = fv.course || fv.label || '';

  /* ── 4. Review & Follow-Up: Due cards, due problems, open routines ── */
  const reviewItems = useMemo(() => {
    const items: {
      id: string;
      app: string;
      typeLabel: string;
      title: string;
      detail: string;
      course?: string;
      actionLabel: string;
      url: string;
      object?: WorkspaceObject;
      /* send a 'routine.check' intake instead of navigating — the rail
         surfaces the handler's toast and the republished entity flips
         this row's state */
      inlineCheck?: boolean;
    }[] = [];

    // Flashcard decks with due cards
    const decks = allObjects.filter(
      (o) => o.app === 'flashcards' && o.type === 'deck' && matchesCourseFilter(o.course, o.topic),
    );
    const dueCardsInStore = entities.filter(
      (e) =>
        e.type === 'card' &&
        matchesCourseFilter(e.course, e.topic) &&
        typeof e.data?.dueAt === 'number' &&
        (e.data.dueAt as number) <= now,
    );

    const addedDeckIds = new Set<string>();
    for (const d of decks) {
      const dueFromData = typeof d.data?.due === 'number' ? d.data.due : null;
      const dueFromSub = d.sub?.match(/(\d+)\s+due/)?.[1] ? Number(d.sub.match(/(\d+)\s+due/)![1]) : null;
      const dueFromCards = dueCardsInStore.filter((c) => c.data?.deckId === d.id).length;
      const dueCount = Math.max(dueFromData ?? 0, dueFromSub ?? 0, dueFromCards);
      if (dueCount > 0) {
        addedDeckIds.add(d.id);
        items.push({
          id: `deck:${d.id}`,
          app: 'flashcards',
          typeLabel: 'Flashcards',
          title: d.title,
          detail: `${dueCount} card${dueCount === 1 ? '' : 's'} due for review`,
          course: d.course,
          actionLabel: 'Review deck',
          url: d.url,
          object: d,
        });
      }
    }

    // Fallback if flashcards presence reports due cards not yet itemized
    const fcSummaryDue = (presences['flashcards']?.summary as any)?.due;
    const totalDueCards = Math.max(
      typeof fcSummaryDue === 'number' ? fcSummaryDue : 0,
      dueCardsInStore.length,
    );
    if (items.length === 0 && totalDueCards > 0 && !courseFilterLow) {
      items.push({
        id: 'flashcards-due-summary',
        app: 'flashcards',
        typeLabel: 'Flashcards',
        title: `${totalDueCards} card${totalDueCards === 1 ? '' : 's'} due across decks`,
        detail: 'Ready for active recall review',
        actionLabel: 'Start review',
        url: '/apps/flashcards/',
      });
    }

    // Proof problems due
    const dueProblems = allObjects.filter(
      (o) =>
        o.app === 'proof' &&
        matchesCourseFilter(o.course, o.topic) &&
        o.dueAt != null &&
        (typeof o.dueAt === 'number' ? o.dueAt : Date.parse(String(o.dueAt))) <= now,
    );
    for (const p of dueProblems.slice(0, 3)) {
      items.push({
        id: `proof:${p.id}`,
        app: 'proof',
        typeLabel: 'Calculations',
        title: p.title,
        detail: p.sub ? `Topic: ${p.sub}` : 'Scheduled for review',
        course: p.course,
        actionLabel: 'Attempt problem',
        url: p.url,
        object: p,
      });
    }
    const proofSummaryDue = (presences['proof']?.summary as any)?.due;
    if (dueProblems.length === 0 && typeof proofSummaryDue === 'number' && proofSummaryDue > 0 && !courseFilterLow) {
      const firstProb = allObjects.find((o) => o.app === 'proof' && o.type === 'problem');
      items.push({
        id: 'proof-due-summary',
        app: 'proof',
        typeLabel: 'Calculations',
        title: firstProb ? firstProb.title : `${proofSummaryDue} problem${proofSummaryDue === 1 ? '' : 's'} due for review`,
        detail: `${proofSummaryDue} calculation review${proofSummaryDue === 1 ? '' : 's'} scheduled`,
        course: firstProb?.course,
        actionLabel: 'Open workbench',
        url: firstProb?.url || '/apps/proof/',
        object: firstProb,
      });
    }

    const currentRoutines = allObjects.filter(row => row.app === 'rhythm' && row.type === 'routine' &&
      row.data?.checkInDate === checkInDay);
    for (const routine of currentRoutines.filter(row => row.data?.checkInPending === true).slice(0, 2)) {
      const check = routine.data?.measure === 'check';
      const amount = routine.data?.todayValue;
      const target = routine.data?.todayTarget;
      const unit = typeof routine.data?.unit === 'string' ? routine.data.unit : '';
      items.push({
        id: `rhythm:${routine.id}`,
        app: 'rhythm',
        typeLabel: 'Attendance',
        title: routine.title,
        detail: !check && typeof amount === 'number' && typeof target === 'number'
          ? `${amount} of ${target}${unit ? ` ${unit}` : ''} logged today` : 'Scheduled today',
        course: routine.course,
        actionLabel: check ? 'Log routine' : 'Log amount',
        url: routine.url,
        object: routine,
        inlineCheck: true,
      });
    }
    const pendingRoutines = (presences.rhythm?.summary as { pending?: number } | undefined)?.pending ?? shared.register?.v?.pending;
    if (!courseFilterLow && !currentRoutines.length && typeof pendingRoutines === 'number' && pendingRoutines > 0) {
      items.push({
        id: 'rhythm-pending', app: 'rhythm', typeLabel: 'Attendance',
        title: `${pendingRoutines} routine${pendingRoutines === 1 ? '' : 's'} open today`,
        detail: 'Review the register before checking in.',
        actionLabel: 'Open Attendance', url: '/apps/rhythm/',
      });
    }

    // Assessments flagged for review
    const flaggedScans = entities.filter(
      (e) => e.app === 'gradestack' && e.data?.needsReview === true && matchesCourseFilter(e.course, e.topic),
    );
    for (const sc of flaggedScans.slice(0, 2)) {
      const w = toWorkspaceObject(sc);
      items.push({
        id: `scan:${sc.id}`,
        app: 'gradestack',
        typeLabel: 'Assessments',
        title: w.title,
        detail: 'Scanned sheet flagged for manual verification',
        course: w.course,
        actionLabel: 'Verify scan',
        url: w.url,
        object: w,
      });
    }

    /* open follow-up tasks — a diverged attempt or flagged assessment that
       spawned "retry this" work sits invisible until scheduled. Surface
       open ones so triage happens from Today, not by remembering. */
    for (const e of entities) {
      if (e.type !== 'followup' || e.data?.status !== 'open') continue;
      if (!matchesCourseFilter(e.course, e.topic)) continue;
      const w = toWorkspaceObject(e);
      items.push({
        id: `followup:${e.id}`,
        app: e.app,
        typeLabel: PLACE_MAP[e.app]?.label || 'Follow-up',
        title: w.title,
        detail: 'Follow-up created — not yet scheduled',
        course: w.course,
        actionLabel: 'Review',
        url: w.url,
        object: w,
      });
      if (items.filter((i) => i.id.startsWith('followup:')).length >= 3) break;
    }

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allObjects, entities, presences, shared.register, now, courseFilterLow, checkInDay]);

  /* due work with nothing booked — the empty Next up state offers Planning */
  const hasUnscheduledDue = !scheduledWork.primary && reviewItems.length > 0;

  /* ── 5. Course Overview: Grouped by course with real counts ── */
  const courseGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        code: string;
        name?: string;
        tasks: number;
        dueCards: number;
        materials: number;
        problems: number;
        latestGrade?: { title: string; pct?: number };
        nextItem?: WorkspaceObject;
      }
    >();

    const ensure = (rawCode: string, name?: string) => {
      const k = rawCode.trim().toLowerCase();
      if (!k || k === 'unfiled') return null;
      if (courseFilterLow && k !== courseFilterLow) return null;
      if (!map.has(k)) {
        map.set(k, {
          key: k,
          code: rawCode.trim(),
          name,
          tasks: 0,
          dueCards: 0,
          materials: 0,
          problems: 0,
        });
      } else if (name && !map.get(k)!.name) {
        map.get(k)!.name = name;
      }
      return map.get(k)!;
    };

    for (const e of entities) {
      if (e.type === 'course') {
        const code = (e.data?.code as string) || e.course || e.title || '';
        const name = e.title && e.title !== code ? e.title : (e.data?.name as string) || undefined;
        if (code) ensure(code, name);
      }
    }

    for (const o of allObjects) {
      const code = o.course;
      if (!code) continue;
      const g = ensure(code);
      if (!g) continue;
      if (o.type === 'block' || o.type === 'commitment') {
        /* blocks carry data.state, commitments data.status — check both so
           stamped/dropped/deferred work doesn't count as an open task.
           'missed' stays counted: it's unresolved and needs rescuing. */
        const closed =
          o.data?.status === 'done' || o.data?.status === 'completed' || o.data?.status === 'dropped' ||
          o.data?.state === 'done' || o.data?.state === 'deferred';
        if (!closed) {
          g.tasks++;
          if (!g.nextItem) g.nextItem = o;
        }
      } else if (o.type === 'card') {
        if (typeof o.dueAt === 'number' && o.dueAt <= now) g.dueCards++;
      } else if (o.type === 'deck' && typeof o.data?.due === 'number') {
        g.dueCards = Math.max(g.dueCards, o.data.due);
      } else if (o.type === 'note' || o.type === 'source') {
        g.materials++;
      } else if (o.type === 'problem') {
        g.problems++;
      } else if (o.type === 'grade' || o.type === 'assessment') {
        if (!g.latestGrade) {
          g.latestGrade = {
            title: o.title,
            pct: typeof o.data?.pct === 'number' ? Math.round(o.data.pct) : undefined,
          };
        }
      }
    }

    return [...map.values()];
  }, [entities, allObjects, now, courseFilterLow]);

  /* ── 6. Recent Work (concrete objects, deduplicated) ── */
  const recentWork = useMemo(() => {
    return allObjects
      .filter((o) => o.type !== 'card' && o.type !== 'entry')
      .slice(0, 8);
  }, [allObjects]);

  const visibleFeed = useMemo(
    () => feed.filter((f) => matchesCourseFilter(f.course)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed, courseFilterLow],
  );

  const startBoundTimer = (item: WorkspaceObject) => {
    const mins = focusMinutes(item) ?? 25;
    const course = item.course || '';
    const isBoundBlock = hasPlanningBinding(item, 'block');
    const blockParam = isBoundBlock ? `&block=${encodeURIComponent(item.id)}` : '';
    /* canonical bindings survive onto the session record: courseId for the
       course pin, mat for material provenance (review slips carry their
       materialRef so the session files a practicedIn edge to the source),
       and a commitment's own id so the session files back against it */
    const courseIdParam = item.courseId ? `&courseId=${encodeURIComponent(item.courseId)}` : '';
    const matRef = item.data?.materialRef as string;
    const matParam = matRef ? `&mat=${encodeURIComponent(matRef)}` : '';
    const commitmentId = hasPlanningBinding(item, 'commitment')
      ? item.id
      : isBoundBlock && typeof item.data?.commitmentId === 'string'
        ? item.data.commitmentId
        : '';
    const commitmentParam = commitmentId.trim() ? `&commitment=${encodeURIComponent(commitmentId)}` : '';
    const url =
      `/apps/timer/?intent=${encodeURIComponent(item.title)}&minutes=${mins}` +
      `${course ? `&course=${encodeURIComponent(course)}` : ''}` +
      `${courseIdParam}${matParam}${commitmentParam}` +
      `&from=${encodeURIComponent(item.app)}${blockParam}` +
      `&return=${encodeURIComponent(`/apps/${item.app}`)}`;
    onGo(url);
  };

  /* A workspace with no courses, objects, pins, feed, or live session gets
     one welcoming setup panel instead of five stacked empty cards. Partial
     data still gets the per-section treatments in the mosaic below. */
  const isEmptyWorkspace =
    showStarterCards &&
    !courseFilterLow &&
    !resumeObject &&
    !scheduledWork.primary &&
    recentWork.length === 0 &&
    reviewItems.length === 0 &&
    courseGroups.length === 0 &&
    pins.length === 0 &&
    weekStrip === null &&
    visibleFeed.length === 0;

  return (
    <div className="today-journal terrain-map min-h-full">
      {amountRoutine && (
        <Dialog open title="Log routine amount" subtitle={amountRoutine.title} onClose={() => { if (!checkingRoutine) setAmountRoutine(null); }}>
          <form className="space-y-3" onSubmit={event => {
            event.preventDefault();
            const amount = Number(new FormData(event.currentTarget).get('amount'));
            if (!Number.isFinite(amount) || amount <= 0) { setAmountError('Enter an amount greater than zero.'); return; }
            if (amountRoutine.data?.checkInDate !== checkInDay) { setAmountError('The date changed. Reopen the check-in for today.'); return; }
            setAmountError('');
            void checkIn(amountRoutine, amount);
          }}>
            <label className="block text-sm">
              <span>Amount completed{typeof amountRoutine.data?.unit === 'string' ? ` (${amountRoutine.data.unit})` : ''}</span>
              <input type="number" required min="0" step="any" name="amount" className="it-input mt-1 w-full" />
            </label>
            {amountError && <p role="alert" className="text-sm text-[var(--color-bad)]">{amountError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" disabled={!!checkingRoutine} onClick={() => setAmountRoutine(null)}>Cancel</Button>
              <Button type="submit" size="sm" variant="primary" disabled={!!checkingRoutine}>{checkingRoutine ? 'Saving…' : 'Save check-in'}</Button>
            </div>
          </form>
        </Dialog>
      )}
      <FirstAssignmentDialog
        open={firstAssignmentOpen}
        onClose={() => setFirstAssignmentOpen(false)}
        courses={firstAssignmentCourses}
      />
      <div className="today-wrap">
        <JournalMasthead courseLabel={activeCourseFilter || undefined} />
        <JournalTabs
          view={view}
          onChange={setView}
          counts={{ courses: courseGroups.length, journal: recentWork.length + visibleFeed.length }}
        />

        {notice && (
          <div
            role="status"
            className="anim-rise mt-4 flex items-center justify-between gap-3 rounded-[6px] border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3.5 py-2 text-[12.5px] text-[var(--color-accent)]"
          >
            <span className="font-medium">{notice.text}</span>
            {notice.url && (
              <button
                type="button"
                onClick={() => onGo(notice.url!)}
                className="font-semibold underline cursor-pointer"
              >
                Open →
              </button>
            )}
          </div>
        )}

        <div
          role="tabpanel"
          id="today-panel"
          aria-labelledby={`today-tab-${view}`}
          className="today-panel"
        >
          {view === 'day' && (
            <div className="today-day">
              {isEmptyWorkspace ? (
                <JournalSection label="Get started" title="Begin the journal" kicker="First page">
                  <div className="today-setup">
                    <div>
                      <h3 className="today-setup-title">Add your first assignment</h3>
                      <p className="today-setup-copy">
                        File one deadline and Today can show it as due work — no full schedule import required. Set up courses or load the sample semester when you want the whole plan.
                      </p>
                    </div>
                    <div className="today-actions">
                      <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setFirstAssignmentOpen(true)}>
                        Add your first assignment
                      </Button>
                      <Button variant="secondary" size="sm" icon={<Calendar className="h-3.5 w-3.5" />} onClick={() => onEnter('syllabus')}>
                        Set up courses
                      </Button>
                      <Disclosure label="Other ways to start">
                        <div className="today-actions today-more">
                          <Button variant="secondary" size="xs" onClick={() => onGo('#/p/syllabus?p=today')}>
                            Add a study task
                          </Button>
                          <Button variant="secondary" size="xs" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onEnter('ink')}>
                            New note
                          </Button>
                          <Button variant="secondary" size="xs" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => onEnter('margin')}>
                            Import material
                          </Button>
                          <Button variant="secondary" size="xs" icon={<Layers className="h-3.5 w-3.5" />} onClick={() => onEnter('flashcards')}>
                            Create deck
                          </Button>
                          <Button variant="ghost" size="xs" onClick={() => onGo('#/c/unfiled')}>
                            Unfiled items
                          </Button>
                          {!isDemoLoaded() && (
                            <Button variant="ghost" size="xs" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={loadSampleSemester}>
                              Load sample semester
                            </Button>
                          )}
                        </div>
                      </Disclosure>
                    </div>
                  </div>
                </JournalSection>
              ) : (
                <>
                  {focusLive && (
                    <section aria-label="Active focus session" className="today-banner anim-rise">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${fv.paused ? 'bg-[var(--color-warn)]' : 'bg-[var(--color-accent)] live-dot'}`} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
                              {fv.paused ? 'Focus paused' : 'Focus live'}
                            </span>
                            {fv.course && (
                              <Badge tone="accent" onClick={() => onGo(`#/c/${encodeURIComponent(fv.course!)}`)}>
                                {fv.course}
                              </Badge>
                            )}
                          </div>
                          <div className="today-banner-title truncate">{fv.label || 'Focus session'}</div>
                        </div>
                      </div>
                      <div className="today-actions print:hidden">
                        <span className="today-clock">
                          {fmtClock(focusSecLeft)}
                          {typeof fv.totalMin === 'number' && (
                            <span className="ml-1.5 text-[11px] font-normal text-[var(--color-faint)]">/ {fv.totalMin}m</span>
                          )}
                        </span>
                        {fv.running ? (
                          <Button variant="secondary" size="sm" icon={<Pause className="h-3.5 w-3.5" />} onClick={() => timerCtl('pause')}>Pause</Button>
                        ) : (
                          <Button variant="primary" size="sm" icon={<Play className="h-3.5 w-3.5" />} onClick={() => timerCtl('resume')}>
                            Resume{focusName ? ` ${focusName}` : ''}
                          </Button>
                        )}
                        <Button variant="secondary" size="sm" icon={<Check className="h-3.5 w-3.5" />} onClick={() => timerCtl('finish')}>Finish &amp; log</Button>
                        <Button variant="ghost" size="sm" onClick={() => onEnter('timer')}>Open timer</Button>
                      </div>
                    </section>
                  )}

                  {!focusLive && proofSessionLive && (
                    <section aria-label="Active calculation session" className="today-banner anim-rise">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="live-dot h-2 w-2 rounded-full bg-[var(--color-accent)]" />
                        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">Practice live</span>
                        <span className="truncate text-[13.5px] font-semibold text-[var(--color-ink)]">
                          {proofSession?.topic || 'Calculation practice'}
                          {proofSession?.minutes ? ` · ${proofSession.minutes}m` : ''}
                        </span>
                      </div>
                      <Button variant="primary" size="xs" onClick={() => onEnter('proof')}>Return to calculations</Button>
                    </section>
                  )}

                  <div className="today-day-grid">
                    <div className="today-day-main">
                      <JournalSection
                        label="Next up scheduled work"
                        title="Next up"
                        kicker="Today's slip"
                        count={scheduledWork.primary ? scheduledWork.queue.length + 1 : 0}
                        action={(
                          <button type="button" className="today-section-action" onClick={() => onEnter('syllabus')}>
                            Open Planning →
                          </button>
                        )}
                      >
                        {scheduledWork.primary ? (
                          <div>
                            <div className="today-primary">
                              <div className="today-primary-head">
                                <div className="min-w-0">
                                  <div className="today-actions">
                                    {scheduledWork.primary.type === 'commitment' ? (
                                      <Badge tone="neutral">Due · no study block</Badge>
                                    ) : (
                                      <Badge tone="accent">Scheduled next</Badge>
                                    )}
                                    {primaryLate && <Badge tone="warn">{primaryLate}</Badge>}
                                    {scheduledWork.primary.course && (
                                      <Badge tone="neutral" onClick={() => onGo(`#/c/${encodeURIComponent(scheduledWork.primary!.course!)}`)}>
                                        {scheduledWork.primary.course}
                                      </Badge>
                                    )}
                                    {scheduledWork.primary.type === 'block' && focusMinutes(scheduledWork.primary) !== undefined && (
                                      <span className="today-meta">{focusMinutes(scheduledWork.primary)}m block</span>
                                    )}
                                  </div>
                                  <h3 className="today-primary-title">{scheduledWork.primary.title}</h3>
                                  {primaryReason && <p className="today-primary-reason">{primaryReason}</p>}
                                </div>
                                <div className="today-primary-actions">
                                  {scheduledWork.primary.type === 'commitment' ? (
                                    <Button variant="primary" size="xs" icon={<Calendar className="h-3 w-3" />} onClick={() => onGo('#/p/syllabus?p=today')}>
                                      Find time today
                                    </Button>
                                  ) : (
                                    <Button variant="primary" size="xs" icon={<Play className="h-3 w-3" />} onClick={() => startBoundTimer(scheduledWork.primary!)}>
                                      Start {primaryStartName} · {primaryMinutes ?? 25} min
                                    </Button>
                                  )}
                                  <Button
                                    variant="secondary"
                                    size="xs"
                                    onClick={() => {
                                      onSelectObject?.(scheduledWork.primary!);
                                      onGo(scheduledWork.primary!.url);
                                    }}
                                  >
                                    {scheduledWork.primary.type === 'commitment' ? 'Open commitment' : 'Open block'}
                                  </Button>
                                  {scheduledWork.primary.type === 'commitment' && (
                                    <Button
                                      variant="ghost"
                                      size="xs"
                                      title="Start a focus session now without booking a study block"
                                      onClick={() => startBoundTimer(scheduledWork.primary!)}
                                    >
                                      {primaryMinutes ?? 25}m focus
                                    </Button>
                                  )}
                                  {scheduledWork.primary.type === 'commitment' && (
                                    <Button
                                      variant="ghost"
                                      size="xs"
                                      title="File this commitment done — off-clock work, no timer"
                                      onClick={() => {
                                        const o = scheduledWork.primary!;
                                        void sendTo({
                                          to: 'syllabus',
                                          action: 'commitment.done',
                                          entity: o.raw ?? { app: o.app, type: o.type, id: o.id, key: o.key, title: o.title },
                                          payload: { commitmentId: o.id },
                                        }).then((r: any) => {
                                          if (!r?.ok) {
                                            notify('Couldn’t file it — Planning may still be starting.');
                                            return;
                                          }
                                          notify(
                                            r.toast ||
                                              (r.delivered === 'direct'
                                                ? `Done — ${o.title}`
                                                : 'Marked done — Planning applies it on next open.'),
                                            r.delivered === 'direct' ? undefined : r.url,
                                          );
                                        });
                                      }}
                                    >
                                      Mark done
                                    </Button>
                                  )}
                                  {scheduledWork.primary.type === 'block' && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        title="Push this slip to tomorrow — stays planned, not missed"
                                        onClick={() => {
                                          const o = scheduledWork.primary!;
                                          void sendTo({
                                            to: 'syllabus',
                                            action: 'block.defer',
                                            entity: o.raw ?? { app: o.app, type: o.type, id: o.id, key: o.key, title: o.title },
                                            payload: { blockId: o.id },
                                          }).then((r: any) => {
                                            if (!r?.ok) {
                                              notify('Couldn’t push it — Planning may still be starting.');
                                              return;
                                            }
                                            notify(
                                              r.toast ||
                                                (r.delivered === 'direct'
                                                  ? `Pushed to tomorrow — ${o.title}`
                                                  : 'Push queued — Planning applies it on next open.'),
                                              r.delivered === 'direct' ? undefined : r.url,
                                            );
                                          });
                                        }}
                                      >
                                        Tomorrow
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        title="Stamp this slip done — off-clock work, no timer"
                                        onClick={() => {
                                          const o = scheduledWork.primary!;
                                          void sendTo({
                                            to: 'syllabus',
                                            action: 'block.done',
                                            entity: o.raw ?? { app: o.app, type: o.type, id: o.id, key: o.key, title: o.title },
                                            payload: { blockId: o.id },
                                          }).then((r: any) => {
                                            if (!r?.ok) {
                                              notify('Couldn’t mark it done — Planning may still be starting.');
                                              return;
                                            }
                                            notify(
                                              r.toast ||
                                                (r.delivered === 'direct'
                                                  ? `Done — ${o.title}`
                                                  : 'Marked done — Planning applies it on next open.'),
                                              r.delivered === 'direct' ? undefined : r.url,
                                            );
                                          });
                                        }}
                                      >
                                        Mark done
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            {scheduledWork.queue.length > 0 && (
                              <div className="today-queue">
                                <div className="today-list">
                                  {scheduledWork.queue.map((item) => (
                                    <ObjectRow
                                      key={item.key}
                                      item={item}
                                      compact
                                      selected={selectedObject?.key === item.key}
                                      onOpen={onGo}
                                      onSelectContext={onSelectObject}
                                      onNotify={notify}
                                      primaryActionLabel="Focus"
                                      onPrimaryAction={startBoundTimer}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <EmptyState
                            compact
                            icon={<Calendar className="h-4 w-4" />}
                            title={hasUnscheduledDue ? 'Due work has no study block yet' : 'No study block scheduled'}
                            description={hasUnscheduledDue
                              ? 'Something needs attention below — find time for it in Planning.'
                              : "Plan a session from your deadlines, or open Planning to file today's slip."}
                            actions={
                              <>
                                {hasUnscheduledDue && (
                                  <Button variant="primary" size="xs" onClick={() => onGo('#/p/syllabus?p=today')}>Find time today</Button>
                                )}
                                <Button variant={hasUnscheduledDue ? 'secondary' : 'primary'} size="xs" onClick={() => setView('plans')}>Plan a session</Button>
                                <Button variant="secondary" size="xs" onClick={() => onGo('#/p/syllabus?p=today')}>Add a study task</Button>
                                <Button variant="ghost" size="xs" onClick={() => onEnter('timer')}>Open timer</Button>
                              </>
                            }
                          />
                        )}
                      </JournalSection>

                      <JournalSection
                        label="Review and follow-up"
                        title="Needs attention"
                        kicker="Review queue"
                        count={reviewItems.length}
                      >
                        {reviewItems.length > 0 ? (
                          <div className="today-list">
                            {reviewItems.map((rev) => (
                              <div key={rev.id} className="today-review-row">
                                <div className="today-review-main">
                                  <div className="today-actions">
                                    <span className="today-meta" style={{ color: 'var(--color-warn)' }}>{rev.typeLabel}</span>
                                    {rev.course && (
                                      <Badge tone="accent" onClick={() => onGo(`#/c/${encodeURIComponent(rev.course!)}`)}>
                                        {rev.course}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="today-review-title">{rev.title}</div>
                                  <div className="today-review-detail">{rev.detail}</div>
                                </div>
                                <div className="today-actions today-review-actions">
                                  {rev.id.startsWith('followup:') && rev.object && (
                                    <Button
                                      variant="ghost"
                                      size="xs"
                                      title="Dismiss this follow-up — the source stays untouched"
                                      onClick={() => {
                                        const t = readFollowUpTasks()[rev.object!.key];
                                        if (!t) {
                                          notify('That follow-up record is gone.');
                                          return;
                                        }
                                        void saveFollowUpTask({ ...t, status: 'dismissed', updatedAt: Date.now() })
                                          .then(() => notify('Follow-up dismissed.'))
                                          .catch(() => notify('Couldn’t dismiss it — try again.'));
                                      }}
                                    >
                                      Dismiss
                                    </Button>
                                  )}
                                  {rev.object && onSelectObject && (
                                    <Button
                                      variant="ghost"
                                      size="xs"
                                      aria-label={`Show details for ${rev.title}`}
                                      title="Show in details panel"
                                      onClick={() => onSelectObject(rev.object!)}
                                    >
                                      <PanelRightOpen className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="primary"
                                    size="xs"
                                    disabled={rev.inlineCheck && !!checkingRoutine}
                                    onClick={() => {
                                      if (rev.inlineCheck && rev.object) {
                                        if (rev.object.data?.measure === 'check') void checkIn(rev.object);
                                        else { setAmountError(''); setAmountRoutine(rev.object); }
                                        return;
                                      }
                                      if (rev.object) onSelectObject?.(rev.object);
                                      onGo(rev.url);
                                    }}
                                  >
                                    {rev.actionLabel}{rev.inlineCheck ? '' : ' →'}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyState
                            compact
                            icon={<Layers className="h-4 w-4" />}
                            title="Nothing due right now"
                            description="Due cards, problems, routines, and follow-ups will collect here."
                            actions={
                              <>
                                <Button variant="secondary" size="xs" onClick={() => onEnter('flashcards')}>Flashcards</Button>
                                <Button variant="ghost" size="xs" onClick={() => onEnter('proof')}>Calculations</Button>
                                <Button variant="ghost" size="xs" onClick={() => onEnter('rhythm')}>Attendance</Button>
                              </>
                            }
                          />
                        )}
                      </JournalSection>
                    </div>

                    <aside className="today-day-aside" aria-label="Resume and context">
                      {(resumeObject || showStarterCards) && (
                        <JournalSection
                          label={showStarterCards && !resumeObject ? 'Get started' : 'Pick up where you left off'}
                          title={resumeObject ? 'Resume' : 'Get started'}
                          kicker="Pick up"
                          action={resumeObject && onSelectObject ? (
                            <button type="button" className="today-section-action" onClick={() => onSelectObject(resumeObject)}>
                              Details
                            </button>
                          ) : undefined}
                        >
                          {resumeObject ? (
                            <div className="today-resume">
                              <div className="today-resume-head">
                                <div className="flex min-w-0 items-start gap-3">
                                  <span className="today-resume-icon">{iconForObjectType(resumeObject.type, resumeObject.app)}</span>
                                  <div className="min-w-0">
                                    <div className="today-actions">
                                      <span className="today-meta" style={{ color: 'var(--color-accent)' }}>{formatEntityType(resumeObject.type)}</span>
                                      <span className="today-meta">{PLACE_MAP[resumeObject.app]?.label || resumeObject.app}</span>
                                      {resumeObject.course && (
                                        <Badge tone="accent" onClick={() => onGo(`#/c/${encodeURIComponent(resumeObject.course!)}`)}>
                                          {resumeObject.course}
                                        </Badge>
                                      )}
                                      {resumeObject.updatedAt ? <span className="today-meta">{formatRelativeTime(resumeObject.updatedAt)}</span> : null}
                                    </div>
                                    <h3 className="today-resume-title">{resumeObject.title}</h3>
                                    {resumeObject.sub && <p className="today-resume-sub">{resumeObject.sub}</p>}
                                    {showStarterCards && (
                                      <p className="today-resume-note">Set up courses to organize this saved work and build a study plan.</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="today-resume-actions">
                                <Button
                                  variant="primary"
                                  size="xs"
                                  icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                                  onClick={() => {
                                    onSelectObject?.(resumeObject);
                                    onGo(resumeObject.url);
                                  }}
                                >
                                  Continue in {PLACE_MAP[resumeObject.app]?.label || resumeObject.app}
                                </Button>
                                <Button variant="secondary" size="xs" icon={<Clock className="h-3.5 w-3.5" />} onClick={() => startBoundTimer(resumeObject)}>
                                  25m focus
                                </Button>
                                {showStarterCards && (
                                  <Button variant="secondary" size="xs" icon={<Calendar className="h-3.5 w-3.5" />} onClick={() => onEnter('syllabus')}>
                                    Set up courses
                                  </Button>
                                )}
                                {canDraftNoteDeck(resumeObject) && (
                                  <Button variant="ghost" size="xs" icon={<Layers className="h-3.5 w-3.5" />} onClick={() => void openNoteDeckDraft(resumeObject, notify)}>
                                    Flashcards
                                  </Button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <EmptyState
                              compact
                              icon={<FileText className="h-4 w-4" />}
                              title="Start with your courses"
                              description="Add courses in Planning, then deadlines can become a realistic study session."
                              actions={
                                <>
                                  <Button variant="primary" size="xs" onClick={() => onEnter('syllabus')}>Set up courses</Button>
                                  <Button variant="secondary" size="xs" onClick={() => onGo('#/c/unfiled')}>Unfiled items</Button>
                                </>
                              }
                            />
                          )}
                        </JournalSection>
                      )}

                      {weekStrip && (
                        <JournalSection
                          label="Minutes logged this week"
                          title="This week"
                          kicker="Ledger"
                          action={(
                            <span className="today-meta">
                              {weekStrip.total >= 60
                                ? `${Math.floor(weekStrip.total / 60)}h${weekStrip.total % 60 ? ` ${weekStrip.total % 60}m` : ''}`
                                : `${weekStrip.total}m`} logged
                            </span>
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => onGo('#/p/timer?p=stats')}
                            title="Open the session ledger"
                            className="today-week-days"
                          >
                            {weekStrip.days.map((d, i) => (
                              <span key={i} className="today-week-day">
                                <span
                                  className="today-week-bar"
                                  style={{
                                    height: `${Math.max(2, Math.round((d.mins / weekStrip.max) * 28))}px`,
                                    opacity: d.mins ? (d.today ? 1 : 0.45) : 0.15,
                                  }}
                                />
                                <span className={`today-week-label ${d.today ? 'is-today' : ''}`}>{d.label}</span>
                              </span>
                            ))}
                          </button>
                        </JournalSection>
                      )}

                      {pins.length > 0 && (
                        <JournalSection label="Pinned items" title="Pinned" kicker="Shelf">
                          <div className="today-pins">
                            {pins.slice(0, 8).map((p) => (
                              <span key={p.url} className="today-pin">
                                <button type="button" onClick={() => onGo(p.url)} className="today-pin-open">
                                  <span className="today-meta">{PLACE_MAP[p.app]?.label || p.app}</span>
                                  <span className="max-w-[180px] truncate font-medium text-[var(--color-ink)]">{p.title}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => togglePin(p)}
                                  aria-label={`Unpin ${p.title}`}
                                  title="Unpin from shelf"
                                  className="today-pin-remove"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </JournalSection>
                      )}
                    </aside>
                  </div>
                </>
              )}
            </div>
          )}

          {view === 'plans' && (
            <div className="today-plans">
              {hasStudyCourses ? (
                <>
                  <PlanFromToday entities={entities} courseFilter={activeCourseFilter} onGo={onGo} />
                  <JournalSection label="Planning desk" title="Planning desk" kicker="Syllabus &amp; timer">
                    <div className="today-list">
                      <button type="button" className="today-link-row" onClick={() => onEnter('syllabus')}>
                        <span>Open Planning</span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-[var(--color-faint)]" />
                      </button>
                      <button type="button" className="today-link-row" onClick={() => onEnter('timer')}>
                        <span>Open Timer</span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-[var(--color-faint)]" />
                      </button>
                      <button type="button" className="today-link-row" onClick={() => onEnter('boxed')}>
                        <span>Open Daily Board</span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-[var(--color-faint)]" />
                      </button>
                    </div>
                  </JournalSection>
                </>
              ) : (
                <JournalSection label="Session planner" title="Plan a study session" kicker="Planner">
                  <EmptyState
                    icon={<Calendar className="h-4 w-4" />}
                    title="Courses come first"
                    description="The session planner needs at least one course before it can turn deadlines into a study block."
                    actions={
                      <>
                        <Button variant="primary" size="xs" icon={<Calendar className="h-3.5 w-3.5" />} onClick={() => onEnter('syllabus')}>
                          Set up courses
                        </Button>
                        <Button variant="secondary" size="xs" onClick={() => onGo('#/c/unfiled')}>Unfiled items</Button>
                        {!isDemoLoaded() && (
                          <Button variant="ghost" size="xs" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={loadSampleSemester}>
                            Load sample semester
                          </Button>
                        )}
                      </>
                    }
                  />
                </JournalSection>
              )}
            </div>
          )}

          {view === 'journal' && (
            <div className="today-plans">
              <JournalSection
                label="Recent work"
                title="Recent work"
                kicker="Journal"
                count={recentWork.length}
                action={(
                  <button type="button" className="today-section-action" onClick={() => onGo('#/library')}>
                    Browse Library →
                  </button>
                )}
              >
                {recentWork.length > 0 ? (
                  <div className="today-object-list">
                    {recentWork.map((item) => (
                      <ObjectRow
                        key={item.key}
                        item={item}
                        selected={selectedObject?.key === item.key}
                        onOpen={onGo}
                        onSelectContext={onSelectObject}
                        onNotify={notify}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={<FileText className="h-4 w-4" />}
                    title="No recent work yet"
                    description="Notes, decks, sheets, problems, and assessments you create will appear here with direct links."
                    actions={
                      <>
                        <Button variant="primary" size="xs" onClick={() => onEnter('ink')}>Write a note</Button>
                        <Button variant="secondary" size="xs" onClick={() => onEnter('flashcards')}>Build a deck</Button>
                        <Button variant="ghost" size="xs" onClick={() => onEnter('proof')}>Add a problem</Button>
                      </>
                    }
                  />
                )}
              </JournalSection>

              <JournalSection
                label="Recent workspace activity"
                title="Activity"
                kicker="Across the terrain"
                count={visibleFeed.length}
              >
                {visibleFeed.length > 0 ? (
                  <div className="today-list">
                    {visibleFeed.slice(0, feedExpanded ? 30 : 5).map((f, idx) => (
                      <button
                        key={`${f.at}:${f.app}:${idx}`}
                        type="button"
                        onClick={() => (f.url ? onGo(f.url) : onEnter(f.app))}
                        className="today-activity-row"
                      >
                        <span className="today-activity-app">{PLACE_MAP[f.app]?.label || f.app}</span>
                        <span className="today-activity-text">{f.text}</span>
                        {f.course && <Badge tone="neutral">{f.course}</Badge>}
                        <span className="today-activity-time">{formatRelativeTime(f.at)}</span>
                      </button>
                    ))}
                    {visibleFeed.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setFeedExpanded((x) => !x)}
                        className="today-more-button"
                      >
                        {feedExpanded ? 'Show less' : `Show ${visibleFeed.length - 5} more updates`}
                      </button>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={<Clock className="h-4 w-4" />}
                    title="No activity yet"
                    description="Actions across the terrain will collect here as you work."
                  />
                )}
              </JournalSection>
            </div>
          )}

          {view === 'courses' && (
            <JournalSection
              label="Course overview"
              title="Courses"
              kicker="Course lens"
              count={courseGroups.length}
              action={(
                <button type="button" className="today-section-action" onClick={() => onGo('#/courses')}>
                  All Courses →
                </button>
              )}
            >
              {courseGroups.length > 0 ? (
                <div className="today-list">
                  {courseGroups.map((cg) => {
                    const summaryParts: string[] = [];
                    if (cg.tasks > 0) summaryParts.push(`${cg.tasks} open task${cg.tasks === 1 ? '' : 's'}`);
                    if (cg.dueCards > 0) summaryParts.push(`${cg.dueCards} card${cg.dueCards === 1 ? '' : 's'} due`);
                    if (cg.materials > 0) summaryParts.push(`${cg.materials} note${cg.materials === 1 ? '' : 's'}`);
                    if (cg.problems > 0) summaryParts.push(`${cg.problems} problem${cg.problems === 1 ? '' : 's'}`);
                    if (cg.latestGrade) {
                      summaryParts.push(
                        `Latest: ${cg.latestGrade.title}${cg.latestGrade.pct != null ? ` (${cg.latestGrade.pct}%)` : ''}`,
                      );
                    }
                    return (
                      <div key={cg.key} className="today-course-row">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => onGo(`#/c/${encodeURIComponent(cg.code)}`)}
                            className="min-w-0 flex-1 text-left cursor-pointer group"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="today-course-code group-hover:underline">{cg.code}</span>
                              {cg.name && <span className="today-course-name">{cg.name}</span>}
                            </div>
                            <p className="today-course-summary">
                              {summaryParts.length > 0 ? summaryParts.join(' · ') : 'Registered course workspace'}
                            </p>
                            {cg.nextItem && (
                              <div className="today-course-next">
                                <span className="today-meta mr-1.5">Next</span>
                                {cg.nextItem.title}
                              </div>
                            )}
                          </button>
                          <Button variant="secondary" size="xs" onClick={() => onGo(`#/c/${encodeURIComponent(cg.code)}`)}>
                            Workspace →
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={<BookOpen className="h-4 w-4" />}
                  title="No courses filed yet"
                  description="Add semester courses in Planning to group notes, decks, problems, and assessments under course workspaces."
                  actions={
                    <>
                      <Button variant={showStarterCards ? 'secondary' : 'primary'} size="xs" onClick={() => onEnter('syllabus')}>
                        Add courses in Planning
                      </Button>
                      <Button variant="secondary" size="xs" onClick={() => onGo('#/c/unfiled')}>Unfiled items</Button>
                      {!isDemoLoaded() && (
                        <Button variant="ghost" size="xs" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={loadSampleSemester}>
                          Load sample semester
                        </Button>
                      )}
                    </>
                  }
                />
              )}
            </JournalSection>
          )}

          {view === 'tools' && (
            <ToolsDirectory
              presences={presences}
              mounted={mounted}
              intakes={intakes}
              onEnter={onEnter}
            />
          )}
        </div>
      </div>
    </div>
  );
}
