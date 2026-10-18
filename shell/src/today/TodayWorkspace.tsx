import { useEffect, useMemo, useState } from 'react';
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
  Bookmark,
} from 'lucide-react';
import { PLACES, PLACE_MAP, formatEntityType } from '../places';
import type { Presence, SharedField, FeedItem, Entity, StoreEntity, IntakeWait } from '../hub';
import { sendTo } from '../hub';
import { isDemoLoaded, seedDemoSemester } from '../integration/demo';
import { subscribeShelf, togglePin, type ShelfPin } from '../shelf';
import { Badge, Button, EmptyState, SectionHeader } from '../ui/primitives';
import {
  ObjectRow,
  type WorkspaceObject,
  toWorkspaceObject,
  iconForObjectType,
  formatRelativeTime,
} from '../ui/ObjectRow';

const STALE_MS = 35000;
const isStale = (p: Presence | undefined) => !p || Date.now() - p.at > STALE_MS;

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

  const [notice, setNotice] = useState<{ text: string; url?: string } | null>(null);
  const notify = (text: string, url?: string) => {
    setNotice({ text, url });
    window.setTimeout(() => setNotice((cur) => (cur?.text === text ? null : cur)), 4000);
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
  const focusLive =
    !!focusField?.at &&
    now - focusField.at < 3 * 60 * 1000 &&
    (fv.running === true || fv.paused === true);
  const focusSecLeft =
    fv.running && fv.endsAt
      ? Math.max(0, (fv.endsAt - now) / 1000)
      : fv.remainingSec ?? 0;

  const proofSession = shared.session?.v as { topic?: string; minutes?: number; active?: boolean } | undefined;
  const proofSessionLive =
    !!proofSession?.active && !!shared.session?.at && now - shared.session.at < 5 * 60 * 1000;

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
      const match = allObjects.find((o) => o.app === v.app && (o.id === v.id || o.title === v.title));
      if (match) return match;
      if (!courseFilterLow) {
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
    const nb = (shared.today?.v as any)?.nextBlock as
      | { id?: string; title?: string; minutes?: number; course?: string }
      | undefined;

    const allBC = allObjects.filter((o) => o.type === 'block' || o.type === 'commitment');
    /* commitments carry data.status, blocks carry data.state — check both;
       a block completed while syllabus was cold must not linger here */
    const isLive = (o: WorkspaceObject) =>
      o.data?.status !== 'done' &&
      o.data?.status !== 'completed' &&
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
    const nbDone = nb?.id ? allBC.some((o) => o.id === nb.id && !isLive(o)) : false;

    let primary: WorkspaceObject | null = null;
    if (nb?.title && matchesCourseFilter(nb.course) && !nbDone) {
      primary =
        blocksAndCommitments.find((b) => b.id === nb.id || b.title === nb.title) || {
          key: `syllabus:block:${nb.id || 'next'}`,
          app: 'syllabus',
          type: 'block',
          id: nb.id || 'next',
          title: nb.title,
          course: nb.course || (shared.activeCourse?.v as any)?.code,
          courseId: (nb as any).courseId,
          url: nb.id ? `/apps/syllabus/?block=${encodeURIComponent(nb.id)}` : '/apps/syllabus/',
          data: {
            minutes: nb.minutes || 25,
            commitmentId: (nb as any).commitmentId,
            materialRef: (nb as any).materialRef,
          },
        };
    }
    if (!primary && blocksAndCommitments.length > 0) {
      primary = blocksAndCommitments[0];
    }

    const queue = blocksAndCommitments.filter((b) => !primary || b.key !== primary.key).slice(0, 4);
    return { primary, queue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared.today, shared.activeCourse, allObjects, courseFilterLow]);

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

    // Rhythm pending attendance routines — the itemized rows carry a
    // course key, so filter per-row like the neighbors rather than hiding
    // the whole section under an active course filter.
    const rhythmSum = (presences['rhythm']?.summary as any) || shared.register?.v;
    const pendingRoutines = typeof rhythmSum?.pending === 'number' ? rhythmSum.pending : 0;
    if (pendingRoutines > 0) {
      const routines = allObjects.filter(
        (o) => o.app === 'rhythm' && o.type === 'routine' && matchesCourseFilter(o.course, o.topic),
      );
      if (routines.length > 0) {
        for (const r of routines.slice(0, 2)) {
          const doneToday = r.data?.todayDone === true;
          items.push({
            id: `rhythm:${r.id}`,
            app: 'rhythm',
            typeLabel: 'Attendance',
            title: r.title,
            detail: doneToday ? 'Logged today ✓' : r.sub || 'Scheduled today',
            course: r.course,
            actionLabel: doneToday ? 'Logged' : 'Log routine',
            url: r.url,
            object: r,
            /* the register stays durable through the intake queue — the
               button marks inline (navigate:false) rather than leaving Today */
            inlineCheck: !doneToday,
          });
        }
      } else {
        items.push({
          id: 'rhythm-pending',
          app: 'rhythm',
          typeLabel: 'Attendance',
          title: `${pendingRoutines} routine${pendingRoutines === 1 ? '' : 's'} open today`,
          detail:
            rhythmSum?.marked != null && rhythmSum?.total != null
              ? `${rhythmSum.marked} of ${rhythmSum.total} logged today`
              : 'Ready to mark on the weekly register',
          actionLabel: 'Log attendance',
          url: '/apps/rhythm/',
        });
      }
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

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allObjects, entities, presences, shared.register, now, courseFilterLow]);

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
        if (o.data?.status !== 'done' && o.data?.status !== 'completed') {
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

  const startBoundTimer = (item: WorkspaceObject) => {
    const mins = (item.data?.minutes as number) || (item.data?.estimatedMinutes as number) || 25;
    const course = item.course || activeCourseFilter || '';
    const blockParam = item.type === 'block' ? `&block=${encodeURIComponent(item.id)}` : '';
    /* canonical bindings survive onto the session record: courseId for the
       course pin, mat for material provenance (review slips carry their
       materialRef so the session files a practicedIn edge to the source),
       and a commitment's own id so the session files back against it */
    const courseIdParam = item.courseId ? `&courseId=${encodeURIComponent(item.courseId)}` : '';
    const matRef = item.data?.materialRef as string;
    const matParam = matRef ? `&mat=${encodeURIComponent(matRef)}` : '';
    const commitmentParam = item.type === 'commitment' ? `&commitment=${encodeURIComponent(item.id)}` : '';
    const url =
      `/apps/timer/?intent=${encodeURIComponent(item.title)}&minutes=${mins}` +
      `${course ? `&course=${encodeURIComponent(course)}` : ''}` +
      `${courseIdParam}${matParam}${commitmentParam}` +
      `&from=${encodeURIComponent(item.app)}${blockParam}` +
      `&return=${encodeURIComponent(`/apps/${item.app}`)}`;
    onGo(url);
  };

  return (
    <div className="terrain-map min-h-full">
      <h1 className="sr-only">Today — workspace overview</h1>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Toast / action notification */}
        {notice && (
          <div
            role="status"
            className="anim-rise flex items-center justify-between gap-3 rounded-[6px] border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3.5 py-2 text-[12.5px] text-[var(--color-accent)]"
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

        {/* ── 1. ACTIVE SESSION BANNER (shown when Timer or Proof session is live) ── */}
        {focusLive && (
          <section
            aria-label="Active focus session"
            className="anim-rise rounded-[6px] border border-[var(--color-accent)] bg-[var(--color-accent-soft)]/75 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    fv.paused ? 'bg-[var(--color-warn)]' : 'bg-[var(--color-accent)] live-dot'
                  }`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
                      {fv.paused ? 'Focus Session Paused' : 'Active Focus Session'}
                    </span>
                    {fv.course && (
                      <Badge
                        tone="accent"
                        onClick={() => onGo(`#/c/${encodeURIComponent(fv.course!)}`)}
                      >
                        {fv.course}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-[15px] font-semibold text-[var(--color-ink)] truncate">
                    {fv.label || 'Focus Session'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-[5px] border border-[var(--color-line-2)] bg-[var(--color-sheet)] px-3 py-1 font-mono text-[16px] font-semibold tabular-nums text-[var(--color-ink)]">
                  {fmtClock(focusSecLeft)}
                  {typeof fv.totalMin === 'number' && (
                    <span className="ml-1.5 text-[11px] font-normal text-[var(--color-faint)]">
                      / {fv.totalMin}m
                    </span>
                  )}
                </div>

                {fv.running ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Pause className="h-3.5 w-3.5" />}
                    onClick={() => timerCtl('pause')}
                  >
                    Pause
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Play className="h-3.5 w-3.5" />}
                    onClick={() => timerCtl('resume')}
                  >
                    Resume
                  </Button>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Check className="h-3.5 w-3.5" />}
                  onClick={() => timerCtl('finish')}
                >
                  Finish &amp; Log
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEnter('timer')}
                >
                  Open Timer →
                </Button>
              </div>
            </div>
          </section>
        )}

        {!focusLive && proofSessionLive && (
          <section
            aria-label="Active calculation session"
            className="anim-rise flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-[var(--color-accent)] bg-[var(--color-accent-soft)]/70 px-4 py-3"
          >
            <div className="flex items-center gap-2.5">
              <span className="live-dot h-2 w-2 rounded-full bg-[var(--color-accent)]" />
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                Active Practice Session
              </span>
              <span className="text-[13.5px] font-semibold text-[var(--color-ink)]">
                {proofSession?.topic || 'Calculation practice'}
                {proofSession?.minutes ? ` · ${proofSession.minutes}m` : ''}
              </span>
            </div>
            <Button variant="primary" size="xs" onClick={() => onEnter('proof')}>
              Return to Calculations →
            </Button>
          </section>
        )}

        {/* ── Pinned Shelf Strip (when items are pinned) ── */}
        {pins.length > 0 && (
          <section aria-label="Pinned items" className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
              <Bookmark className="h-3 w-3 text-[var(--color-accent)]" />
              Pinned
            </span>
            {pins.slice(0, 8).map((p) => (
              <div
                key={p.url}
                className="inline-flex items-center rounded-[5px] border border-[var(--color-line)] bg-[var(--color-sheet)] text-[12px]"
              >
                <button
                  type="button"
                  onClick={() => onGo(p.url)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-left hover:text-[var(--color-accent)] cursor-pointer"
                >
                  <span className="font-mono text-[10px] uppercase text-[var(--color-faint)]">
                    {PLACE_MAP[p.app]?.label || p.app}
                  </span>
                  <span className="max-w-[180px] truncate font-medium text-[var(--color-ink)]">
                    {p.title}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => togglePin(p)}
                  aria-label={`Unpin ${p.title}`}
                  title="Unpin from shelf"
                  className="border-l border-[var(--color-line)] px-1.5 py-1 text-[10px] text-[var(--color-faint)] hover:text-[var(--color-bad)] cursor-pointer"
                >
                  ×
                </button>
              </div>
            ))}
          </section>
        )}

        {/* ── Primary Workstation Grid: Left (Resume + Next Up + Recent) / Right (Review + Courses) ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column (7 cols on lg) */}
          <div className="space-y-6 lg:col-span-7">
            {/* ── 2. RESUME WORKING ── */}
            <section aria-label="Resume working">
              <SectionHeader title="Resume Working" />
              {resumeObject ? (
                <div className="rounded-[6px] border border-[var(--color-line-2)] bg-[var(--color-sheet)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-[var(--color-line)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                        {iconForObjectType(resumeObject.type, resumeObject.app)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                            {formatEntityType(resumeObject.type)}
                          </span>
                          <span className="text-[var(--color-faint)]">·</span>
                          <span className="text-[11.5px] text-[var(--color-mute)]">
                            {PLACE_MAP[resumeObject.app]?.label || resumeObject.app}
                          </span>
                          {resumeObject.course && (
                            <Badge
                              tone="accent"
                              onClick={() => onGo(`#/c/${encodeURIComponent(resumeObject.course!)}`)}
                            >
                              {resumeObject.course}
                            </Badge>
                          )}
                          {resumeObject.updatedAt ? (
                            <span className="text-[11px] text-[var(--color-faint)]">
                              · {formatRelativeTime(resumeObject.updatedAt)}
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-1 text-[16px] font-semibold text-[var(--color-ink)] leading-snug">
                          {resumeObject.title}
                        </h3>
                        {resumeObject.sub && (
                          <p className="mt-0.5 text-[12.5px] text-[var(--color-mute)]">{resumeObject.sub}</p>
                        )}
                      </div>
                    </div>

                    {onSelectObject && (
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={<PanelRightOpen className="h-3.5 w-3.5" />}
                        onClick={() => onSelectObject(resumeObject)}
                      >
                        Details
                      </Button>
                    )}
                  </div>

                  <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-3">
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                      onClick={() => {
                        onSelectObject?.(resumeObject);
                        onGo(resumeObject.url);
                      }}
                    >
                      Continue in {PLACE_MAP[resumeObject.app]?.label || resumeObject.app}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Clock className="h-3.5 w-3.5" />}
                      onClick={() => startBoundTimer(resumeObject)}
                    >
                      Start 25m Focus
                    </Button>
                    {resumeObject.app !== 'flashcards' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Layers className="h-3.5 w-3.5" />}
                        onClick={() => {
                          void sendTo({
                            to: 'flashcards',
                            action: 'cards.create',
                            entity: resumeObject.raw as any,
                            payload: {
                              deckTitle: resumeObject.course
                                ? `${resumeObject.course} — ${resumeObject.title}`
                                : resumeObject.title,
                              course: resumeObject.course,
                              courseId: resumeObject.courseId,
                              cards: [{ q: resumeObject.title, a: resumeObject.sub || resumeObject.title }],
                            },
                          }).then((r) => {
                            if (r.url) onGo(r.url);
                            else notify('Sent to Flashcards', '/apps/flashcards/');
                          });
                        }}
                      >
                        Create Flashcards
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={<FileText className="h-4 w-4" />}
                  title="Ready to begin studying"
                  description="Open a note, import lecture materials, build a flashcard deck, or set up your course plan."
                  actions={
                    <>
                      <Button variant="primary" size="xs" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onEnter('ink')}>
                        New Note
                      </Button>
                      <Button variant="secondary" size="xs" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => onEnter('margin')}>
                        Import Study Material
                      </Button>
                      <Button variant="secondary" size="xs" icon={<Layers className="h-3.5 w-3.5" />} onClick={() => onEnter('flashcards')}>
                        Create Deck
                      </Button>
                      <Button variant="secondary" size="xs" icon={<Calendar className="h-3.5 w-3.5" />} onClick={() => onEnter('syllabus')}>
                        Set Up Courses
                      </Button>
                    </>
                  }
                />
              )}
            </section>

            {/* ── 3. NEXT UP (Scheduled Work) ── */}
            <section aria-label="Next up scheduled work">
              <SectionHeader title="Next Up"
                action={
                  <button
                    type="button"
                    onClick={() => onEnter('syllabus')}
                    className="text-[12px] font-medium text-[var(--color-accent)] hover:underline cursor-pointer"
                  >
                    Open Planning →
                  </button>
                }
              />
              {scheduledWork.primary ? (
                <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
                  <div className="p-4 bg-[var(--color-accent-soft)]/35 border-b border-[var(--color-line)]">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="accent">Scheduled Next</Badge>
                          {primaryLate && <Badge tone="warn">{primaryLate}</Badge>}
                          {scheduledWork.primary.course && (
                            <Badge
                              tone="neutral"
                              onClick={() =>
                                onGo(`#/c/${encodeURIComponent(scheduledWork.primary!.course!)}`)
                              }
                            >
                              {scheduledWork.primary.course}
                            </Badge>
                          )}
                          {typeof scheduledWork.primary.data?.minutes === 'number' && (
                            <span className="font-mono text-[11px] text-[var(--color-mute)]">
                              {scheduledWork.primary.data.minutes}m block
                            </span>
                          )}
                        </div>
                        <h3 className="mt-1.5 text-[15px] font-semibold text-[var(--color-ink)]">
                          {scheduledWork.primary.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="primary"
                          size="xs"
                          icon={<Play className="h-3 w-3" />}
                          onClick={() => startBoundTimer(scheduledWork.primary!)}
                        >
                          Start {(scheduledWork.primary.data?.minutes as number) || 25}m Focus
                        </Button>
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => {
                            onSelectObject?.(scheduledWork.primary!);
                            onGo(scheduledWork.primary!.url);
                          }}
                        >
                          Open Block
                        </Button>
                        {scheduledWork.primary.type === 'block' && (
                          <>
                            <Button
                              variant="ghost"
                              size="xs"
                              title="Push this slip to tomorrow — stays planned, not missed"
                              onClick={() => {
                                const o = scheduledWork.primary!;
                                void (window as any).iterra
                                  ?.send?.({
                                    to: 'syllabus',
                                    action: 'block.defer',
                                    entity: o.raw ?? { app: o.app, type: o.type, id: o.id, key: o.key, title: o.title },
                                    payload: { blockId: o.id },
                                  })
                                  .then((r: any) => {
                                    if (!r?.ok) {
                                      notify('Couldn’t push it — Planning may still be starting.');
                                      return;
                                    }
                                    notify(
                                      r.delivered === true
                                        ? `Pushed to tomorrow — ${o.title}`
                                        : 'Push queued — Planning applies it on next open.',
                                      r.delivered === true ? undefined : r.url,
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
                                void (window as any).iterra
                                  ?.send?.({
                                    to: 'syllabus',
                                    action: 'block.done',
                                    entity: o.raw ?? { app: o.app, type: o.type, id: o.id, key: o.key, title: o.title },
                                    payload: { blockId: o.id },
                                  })
                                  .then((r: any) => {
                                    if (!r?.ok) {
                                      notify('Couldn’t mark it done — Planning may still be starting.');
                                      return;
                                    }
                                    notify(
                                      r.delivered === true
                                        ? `Done — ${o.title}`
                                        : 'Marked done — Planning applies it on next open.',
                                      r.delivered === true ? undefined : r.url,
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
                    <div>
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
                  )}
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={<Calendar className="h-4 w-4" />}
                  title="No study blocks scheduled for today"
                  description="Plan daily work blocks from your course commitments or launch an ad-hoc focus session."
                  actions={
                    <>
                      <Button variant="primary" size="xs" onClick={() => onEnter('syllabus')}>
                        Plan Today’s Blocks
                      </Button>
                      <Button variant="secondary" size="xs" onClick={() => onEnter('timer')}>
                        Start 25m Focus Session
                      </Button>
                    </>
                  }
                />
              )}
            </section>

            {/* ── 6. RECENT WORK ── */}
            <section aria-label="Recent work">
              <SectionHeader title="Recent Work"
                count={recentWork.length}
                action={
                  <button
                    type="button"
                    onClick={() => onGo('#/library')}
                    className="text-[12px] font-medium text-[var(--color-accent)] hover:underline cursor-pointer"
                  >
                    Browse All in Library →
                  </button>
                }
              />
              {recentWork.length > 0 ? (
                <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
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
                  title="No study objects recorded yet"
                  description="Notes, flashcard decks, study sheets, problems, and assessments you create will appear here with direct links."
                  actions={
                    <>
                      <Button variant="secondary" size="xs" onClick={() => onEnter('ink')}>
                        Write a Note
                      </Button>
                      <Button variant="secondary" size="xs" onClick={() => onEnter('flashcards')}>
                        Build a Deck
                      </Button>
                      <Button variant="secondary" size="xs" onClick={() => onEnter('proof')}>
                        Add a Calculation Problem
                      </Button>
                    </>
                  }
                />
              )}
            </section>
          </div>

          {/* Right Column (5 cols on lg): Review + Course Overview + Recent Activity */}
          <div className="space-y-6 lg:col-span-5">
            {/* ── 4. REVIEW & FOLLOW-UP ── */}
            <section aria-label="Review and follow-up">
              <SectionHeader title="Review Queue"
                count={reviewItems.length}
              />
              {reviewItems.length > 0 ? (
                <div className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
                  {reviewItems.map((rev) => (
                    <div
                      key={rev.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-[var(--color-sheet-hover)] transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-warn)]">
                            {rev.typeLabel}
                          </span>
                          {rev.course && (
                            <Badge
                              tone="accent"
                              onClick={() => onGo(`#/c/${encodeURIComponent(rev.course!)}`)}
                            >
                              {rev.course}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-[13.5px] font-medium text-[var(--color-ink)]">
                          {rev.title}
                        </div>
                        <div className="text-[11.5px] text-[var(--color-mute)]">{rev.detail}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {rev.object && onSelectObject && (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => onSelectObject(rev.object!)}
                            title="Show in details panel"
                          >
                            <PanelRightOpen className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="primary"
                          size="xs"
                          disabled={!rev.inlineCheck && rev.app === 'rhythm' && rev.object?.data?.todayDone === true}
                          onClick={() => {
                            if (rev.inlineCheck && rev.object) {
                              const o = rev.object;
                              void (window as any).iterra
                                ?.send?.({
                                  to: 'rhythm',
                                  action: 'routine.check',
                                  entity: o.raw ?? { app: o.app, type: o.type, id: o.id, key: o.key, title: o.title },
                                  payload: { routineId: o.id },
                                })
                                .then((r: any) => {
                                  if (!r?.ok) {
                                    notify('Couldn’t log it — Rhythm may still be starting.');
                                    return;
                                  }
                                  if (r.delivered !== true) {
                                    notify('Log queued — Rhythm applies it on next open.', r.url);
                                  }
                                });
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
                  title="No cards or reviews due right now"
                  description="Create flashcards from your notes, add practice problems, or log today's attendance routines."
                  actions={
                    <>
                      <Button variant="secondary" size="xs" onClick={() => onEnter('flashcards')}>
                        Open Flashcards
                      </Button>
                      <Button variant="secondary" size="xs" onClick={() => onEnter('proof')}>
                        Open Calculations
                      </Button>
                      <Button variant="secondary" size="xs" onClick={() => onEnter('rhythm')}>
                        Open Attendance
                      </Button>
                    </>
                  }
                />
              )}
            </section>

            {/* ── 5. COURSE OVERVIEW ── */}
            <section aria-label="Course overview">
              <SectionHeader title="Course Overview"
                count={courseGroups.length}
                action={
                  <button
                    type="button"
                    onClick={() => onGo('#/courses')}
                    className="text-[12px] font-medium text-[var(--color-accent)] hover:underline cursor-pointer"
                  >
                    All Courses →
                  </button>
                }
              />
              {courseGroups.length > 0 ? (
                <div className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
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
                      <div
                        key={cg.key}
                        className="p-3.5 hover:bg-[var(--color-sheet-hover)] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onGo(`#/c/${encodeURIComponent(cg.code)}`)}
                            className="min-w-0 flex-1 text-left cursor-pointer group"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-[var(--color-accent)] group-hover:underline">
                                {cg.code}
                              </span>
                              {cg.name && (
                                <span className="truncate text-[13px] font-medium text-[var(--color-ink)]">
                                  {cg.name}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[11.5px] text-[var(--color-mute)]">
                              {summaryParts.length > 0
                                ? summaryParts.join(' · ')
                                : 'Registered course workspace'}
                            </p>
                            {cg.nextItem && (
                              <div className="mt-1.5 text-[11.5px] text-[var(--color-ink)] truncate">
                                <span className="font-mono text-[10px] uppercase text-[var(--color-faint)] mr-1.5">
                                  Next:
                                </span>
                                {cg.nextItem.title}
                              </div>
                            )}
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="secondary"
                              size="xs"
                              onClick={() => onGo(`#/c/${encodeURIComponent(cg.code)}`)}
                            >
                              Workspace →
                            </Button>
                          </div>
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
                  description="Add your semester courses in Planning to group notes, decks, problems, and assessments under dedicated course workspaces."
                  actions={
                    <>
                      <Button variant="primary" size="xs" onClick={() => onEnter('syllabus')}>
                        Add Courses in Planning
                      </Button>
                      <Button variant="secondary" size="xs" onClick={() => onGo('#/c/unfiled')}>
                        View Unfiled Items
                      </Button>
                      {/* first-run affordance — the demo pack lands a real
                          semester through the same stores; removable in one
                          pass from Settings → Sample semester */}
                      {!isDemoLoaded() && (
                        <Button variant="ghost" size="xs" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={loadSampleSemester}>
                          Or load a sample semester
                        </Button>
                      )}
                    </>
                  }
                />
              )}
            </section>

            {/* ── This Week — session minutes by day (only when any logged) ── */}
            {weekStrip && (
              <section aria-label="Minutes logged this week">
                <SectionHeader
                  title="This Week"
                  action={
                    <span className="font-mono text-[10px] text-[var(--color-faint)]">
                      {weekStrip.total >= 60
                        ? `${Math.floor(weekStrip.total / 60)}h${weekStrip.total % 60 ? ` ${weekStrip.total % 60}m` : ''} logged`
                        : `${weekStrip.total}m logged`}
                    </span>
                  }
                />
                <button
                  type="button"
                  onClick={() => onGo('#/p/timer?p=stats')}
                  title="Open the session ledger"
                  className="flex w-full cursor-pointer items-end gap-1.5 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-3.5 pb-2 pt-3 text-left hover:border-[var(--color-line-2)]"
                >
                  {weekStrip.days.map((d, i) => (
                    <span key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <span
                        className="w-full max-w-[18px] rounded-[2px] bg-[var(--color-accent)] transition-all"
                        style={{
                          height: `${Math.max(2, Math.round((d.mins / weekStrip.max) * 28))}px`,
                          opacity: d.mins ? (d.today ? 1 : 0.45) : 0.15,
                        }}
                      />
                      <span
                        className={`font-mono text-[9px] uppercase ${
                          d.today ? 'font-bold text-[var(--color-accent)]' : 'text-[var(--color-faint)]'
                        }`}
                      >
                        {d.label}
                      </span>
                    </span>
                  ))}
                </button>
              </section>
            )}

            {/* ── Recent Activity Stream (only when real activity exists) ── */}
            {(() => {
              const visible = feed.filter((f) => matchesCourseFilter(f.course));
              return visible.length > 0 && (
              <section aria-label="Recent workspace activity">
                <SectionHeader title="Recent Activity" />
                <div className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
                  {visible.slice(0, feedExpanded ? 30 : 5).map((f, idx) => (
                    <button
                      key={`${f.at}:${f.app}:${idx}`}
                      type="button"
                      onClick={() => (f.url ? onGo(f.url) : onEnter(f.app))}
                      className="flex w-full items-baseline justify-between gap-2 px-3.5 py-2 text-left text-[12px] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                    >
                      <span className="w-24 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)] truncate">
                        {PLACE_MAP[f.app]?.label || f.app}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[var(--color-ink)]">{f.text}</span>
                      {f.course && <Badge tone="neutral">{f.course}</Badge>}
                      <span className="shrink-0 font-mono text-[10px] text-[var(--color-faint)]">
                        {formatRelativeTime(f.at)}
                      </span>
                    </button>
                  ))}
                  {visible.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setFeedExpanded((x) => !x)}
                      className="w-full px-3.5 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider text-[var(--color-faint)] hover:text-[var(--color-accent)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                    >
                      {feedExpanded ? 'show less' : `${visible.length - 5} more stirs`}
                    </button>
                  )}
                </div>
              </section>
              );
            })()}
          </div>
        </div>

        {/* ── 7. SPECIALIZED TOOLS DIRECTORY STRIP (Compact, functional names first) ── */}
        <section aria-label="Workspace tools" className="pt-2 border-t border-[var(--color-line)]">
          <SectionHeader title="Tools" />
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {PLACES.map((p) => {
              const pres = presences[p.id];
              const stale = isStale(pres);
              const liveLines = !stale && pres?.summary ? p.today(pres.summary) : [];
              const waiting = intakes?.[p.id];
              const isWarm = mounted.includes(p.id);

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onEnter(p.id)}
                  title={`${p.app} — ${p.tagline}`}
                  className="place-card group flex flex-col justify-between rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] p-3 text-left hover:border-[var(--color-accent)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-5 w-5 shrink-0 text-[var(--color-accent)]">
                          {p.glyph}
                        </span>
                        <span className="text-[13.5px] font-semibold text-[var(--color-ink)] group-hover:text-[var(--color-accent)] truncate">
                          {p.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {waiting && waiting.count > 0 && (
                          <Badge tone={waiting.stuck ? 'bad' : 'warn'}>
                            {waiting.count} queued
                          </Badge>
                        )}
                        {isWarm && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
                            title="Active in memory"
                          />
                        )}
                        <ArrowUpRight className="h-3.5 w-3.5 text-[var(--color-faint)] group-hover:text-[var(--color-accent)]" />
                      </div>
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-[var(--color-faint)]">
                      {p.place}
                    </div>
                    <p className="mt-1.5 text-[11.5px] leading-snug text-[var(--color-mute)]">
                      {liveLines.length > 0 ? liveLines[0].text : p.shortDesc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
