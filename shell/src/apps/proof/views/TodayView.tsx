import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkbench, selectActiveProblems } from '../store';
import type { Attempt, PracticeSession, Problem } from '../lib/types';
import { isDue } from '../lib/schedule';
import { docToText } from '../lib/doc';
import { errorRecurrence, unaidedSuccess } from '../lib/metrics';
import { openDeep } from '../lib/iterra';
import { cn, fmtDateTime, fmtMinutes } from '../lib/utils';
import { DiffMeter } from '../components/DiffMeter';
import { PlanRetryButton } from '../components/TerrainChips';
import type { ViewKey } from '../components/TopTabs';
import {
  ArrowRight,
  Award,
  CalendarDays,
  Layers,
  NotebookPen,
  Play,
  RotateCcw,
} from 'lucide-react';

type SharedEntry = { v?: any; by?: string; at?: number };

function useSharedDoc(): Record<string, SharedEntry> {
  const [doc, setDoc] = useState<Record<string, SharedEntry>>({});
  useEffect(() => {
    const d = (window as any).iterra?.doc?.('shared');
    if (!d?.get) return;
    const read = () => {
      try {
        setDoc(d.get() || {});
      } catch {
        /* a malformed commons write must not take the bench down */
      }
    };
    read();
    const unsub = d.subscribe?.(read);
    return () => {
      try {
        unsub?.();
      } catch {
        /* unsubscribe is best-effort */
      }
    };
  }, []);
  return doc;
}

function freshEntry(e: SharedEntry | undefined, ms = 10 * 60_000) {
  return e?.v != null && Number.isFinite(e.at) && Date.now() - Number(e.at) < ms ? e.v : null;
}

function latestAttemptFor(problemId: string, attempts: Record<string, Attempt>) {
  return Object.values(attempts)
    .filter((a) => a.problemId === problemId)
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0];
}

function problemTitle(p: Problem | undefined, fallback = 'problem removed') {
  return p ? docToText(p.promptDoc, 140) || 'untitled problem' : fallback;
}

function resultMark(result?: Attempt['result']) {
  if (result === 'correct') return { cls: 'mark--correct', sym: '✓', word: 'correct' };
  if (result === 'partial') return { cls: 'mark--partial', sym: '◐', word: 'partial' };
  if (result === 'incorrect') return { cls: 'mark--incorrect', sym: '✕', word: 'incorrect' };
  return null;
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    'conceptual-gap': 'conceptual gap',
    'wrong-strategy': 'wrong strategy',
    'algebra-arithmetic': 'algebra / arithmetic',
    'misread-prompt': 'misread prompt',
    'incomplete-explanation': 'incomplete explanation',
    'careless-execution': 'careless execution',
    none: 'no error',
    custom: 'custom',
  };
  return labels[category] ?? category.replace('custom:', 'custom — ');
}

export function TodayView({
  onAttempt,
  onOpenAttempt,
  onSession,
  goView,
  onAddProblem,
}: {
  onAttempt: (a: Attempt) => void;
  onOpenAttempt: (a: Attempt) => void;
  onSession: (s: PracticeSession) => void;
  goView: (v: ViewKey) => void;
  onAddProblem: () => void;
}) {
  const problems = useWorkbench(useShallow(selectActiveProblems));
  const attempts = useWorkbench((s) => s.attempts);
  const sessions = useWorkbench((s) => s.sessions);
  const reviews = useWorkbench((s) => s.reviews);
  const errors = useWorkbench(useShallow((s) => Object.values(s.errors)));
  const courses = useWorkbench((s) => s.courses);
  const settings = useWorkbench((s) => s.settings);
  const createSession = useWorkbench((s) => s.createSession);
  const startAttempt = useWorkbench((s) => s.startAttempt);
  const shared = useSharedDoc();

  const integrated = !!(window as any).__iterraIntegrated;
  const openUrl = (url: string) => {
    if (url.startsWith('#/')) {
      /* dossier/route links only resolve inside the shell — standalone
         falls back to the Planning app, which owns course surfaces */
      if (integrated) (window as any).iterra?.open?.(url);
      else openDeep('/apps/syllabus/');
      return;
    }
    openDeep(url);
  };

  const problemById = useMemo(() => new Map(problems.map((p) => [p.id, p])), [problems]);
  const due = useMemo(
    () =>
      Object.values(reviews)
        .filter((r) => isDue(r))
        .map((r) => ({ review: r, problem: problemById.get(r.problemId) }))
        .filter((x): x is { review: (typeof reviews)[string]; problem: Problem } => !!x.problem)
        .sort((a, b) => String(a.review.dueAt).localeCompare(String(b.review.dueAt))),
    [reviews, problemById],
  );

  const activeSession = useMemo(
    () =>
      Object.values(sessions)
        .filter((s) => !s.completedAt)
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0],
    [sessions],
  );
  const activeAttempt = useMemo(
    () =>
      Object.values(attempts)
        .filter((a) => !a.submittedAt)
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0],
    [attempts],
  );
  const recentAttempts = useMemo(
    () =>
      Object.values(attempts)
        .filter((a) => a.submittedAt)
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
        .slice(0, 5),
    [attempts],
  );
  const recurrence = useMemo(() => errorRecurrence(errors).slice(0, 3), [errors]);
  const unaided = useMemo(() => unaidedSuccess(Object.values(attempts)), [attempts]);
  const gradedCount = useMemo(() => Object.values(attempts).filter((a) => a.result).length, [attempts]);

  const sessionDone = activeSession
    ? Object.values(attempts).filter((a) => a.sessionId === activeSession.id && a.submittedAt).length
    : 0;
  const nextSessionProblem = activeSession
    ? activeSession.problemIds.find((pid) => {
        const p = problemById.get(pid);
        if (!p) return false;
        return !Object.values(attempts).some((a) => a.sessionId === activeSession.id && a.problemId === pid && a.submittedAt);
      })
    : undefined;

  const pulseItems = useMemo(() => {
    const items: { key: string; app: string; label: string; sub: string; url: string; tone?: 'blue' | 'violet' | 'amber' }[] = [];
    const today = freshEntry(shared.today);
    if (today) {
      items.push({
        key: 'syllabus',
        app: 'Planning',
        label: 'folio today',
        sub: `${today.slips ?? 0} block${today.slips === 1 ? '' : 's'} · ${today.overdue ?? 0} overdue${today.next ? ` · next ${today.next}` : ''}`,
        url: '/apps/syllabus/',
      });
    }
    const course = freshEntry(shared.activeCourse);
    if (course?.code) {
      items.push({
        key: 'course',
        app: 'Course',
        label: course.code,
        sub: course.name || 'open dossier',
        url: integrated ? `#/c/${encodeURIComponent(course.code)}` : '/apps/syllabus/',
      });
    }
    const focusEntry = shared.focus;
    const focus = focusEntry?.by === 'timer' ? focusEntry.v : null;
    const focusLive =
      focus &&
      (focus.running
        ? Number.isFinite(focus.endsAt) && focus.endsAt > Date.now()
        : focus.paused && freshEntry(focusEntry, 3 * 60_000));
    if (focusLive) {
      const left = focus.running ? Math.max(1, Math.ceil((focus.endsAt - Date.now()) / 60_000)) : null;
      items.push({
        key: 'timer',
        app: 'Timer',
        label: focus.running ? 'focus live' : 'focus paused',
        sub: `${focus.label || 'focus session'}${left ? ` · ${left}m left` : focus.remainingSec ? ` · ${Math.ceil(focus.remainingSec / 60)}m left` : ''}`,
        url: '/apps/timer/',
        tone: 'blue',
      });
    }
    const deck = freshEntry(shared.deck);
    if (deck?.deck) {
      items.push({
        key: 'flashcards',
        app: 'Flashcards',
        label: deck.deck,
        sub: `${deck.due ?? 0} card${deck.due === 1 ? '' : 's'} due`,
        url: '/apps/flashcards/',
        tone: deck.due > 0 ? 'violet' : undefined,
      });
    }
    const markbook = freshEntry(shared.markbook);
    if (markbook?.assessment) {
      items.push({
        key: 'gradestack',
        app: 'Assessments',
        label: markbook.assessment,
        sub: `${markbook.scored ?? 0}/${markbook.total ?? 0} marked`,
        url: '/apps/gradestack/',
      });
    }
    const note = freshEntry(shared.noteActive);
    if (note?.title && (note.app === 'ink' || note.app === 'margin')) {
      items.push({
        key: `note-${note.app}`,
        app: note.app === 'margin' ? 'Study Materials' : 'Notes',
        label: note.title,
        sub: 'recent note',
        url: `/apps/${note.app}/?note=${encodeURIComponent(note.id ?? '')}`,
      });
    }
    return items.slice(0, 6);
  }, [shared, integrated]);

  const beginProblem = (p: Problem) => {
    /* an open attempt on the desk is resumed, not duplicated — a second
       in-flight attempt would split the work history for no gain */
    const open = Object.values(attempts).find((a) => a.problemId === p.id && !a.submittedAt);
    if (open) {
      onOpenAttempt(open);
      return;
    }
    const a = startAttempt(p.id, activeSession?.problemIds.includes(p.id) ? activeSession.id : undefined);
    onAttempt(a);
  };

  const startDueSet = () => {
    const s = createSession(
      {
        courseIds: [],
        topics: [],
        minDifficulty: 1,
        maxDifficulty: 5,
        minutes: settings.defaultSessionMinutes,
        newRatio: 0,
        order: 'interleaved',
      },
      due.length ? `due review — ${due.length} problem${due.length === 1 ? '' : 's'}` : 'due review',
    );
    onSession(s);
  };

  const openSession = () => {
    if (activeSession) onSession(activeSession);
    else goView('session');
  };

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  if (!problems.length) {
    return (
      <div className="mx-auto max-w-5xl px-4 pb-16">
        <div className="pad mt-3 p-6 sm:p-8">
          <div className="kicker">the bench is clear</div>
          <h2 className="serif mt-2 text-[30px] font-semibold leading-tight">Start the first proof.</h2>
          <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
            Calculations is where attempts become skill: write the work, reveal hints only when needed,
            compare against the proof, and let misses return on the spaced queue. Problems can arrive
            here from Planning, a course dossier, Search, an import, or the problem editor.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn btn--blueprint" onClick={onAddProblem}>
              <span className="inline-flex items-center gap-1.5"><Play size={12} /> Add a problem</span>
            </button>
            <button className="btn btn--ghost" onClick={() => goView('import')}>
              Import a worksheet
            </button>
            {integrated && (
              <button className="btn btn--ghost" onClick={() => openUrl('/apps/syllabus/')}>
                Open Planning
              </button>
            )}
          </div>
        </div>
        {pulseItems.length > 0 && <TerrainPulse items={pulseItems} onOpen={openUrl} />}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <div className="pad mt-3 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="kicker">bench sheet — {dateLabel}</div>
            <h2 className="serif mt-1 text-[26px] font-semibold leading-tight">Today on the workbench</h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <HeroStat label="due" value={String(due.length)} tone={due.length ? 'violet' : undefined} />
            <HeroStat label="in bank" value={String(problems.length)} />
            <HeroStat label="graded" value={String(gradedCount)} />
            <HeroStat
              label="unaided"
              value={unaided.rate == null ? '—' : `${Math.round(unaided.rate * 100)}%`}
              sub={`${unaided.hits}/${unaided.of}`}
            />
          </div>
        </div>

        {/* the one next action — resume, retry, or build */}
        <section className="film mt-4 rounded p-4">
          {activeAttempt ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="kicker">proof in progress</div>
                <div className="mt-1 truncate text-[14px] font-medium">
                  {problemTitle(problemById.get(activeAttempt.problemId))}
                </div>
                <div className="mt-1 text-[11.5px] text-[var(--color-ink-faint)]">
                  started {fmtDateTime(activeAttempt.startedAt)} · confidence {activeAttempt.confidence}/5 · hints to level {activeAttempt.hintLevel}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn--blueprint" onClick={() => onOpenAttempt(activeAttempt)}>
                  <span className="inline-flex items-center gap-1.5"><Play size={12} /> Resume proof</span>
                </button>
                <button className="btn btn--ghost" onClick={() => goView('library')}>Open library</button>
              </div>
            </div>
          ) : activeSession ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="kicker">session queue — {activeSession.intent ?? 'practice session'}</div>
                <div className="mt-1 text-[14px] font-medium">
                  {sessionDone}/{activeSession.problemIds.length} filed
                  {nextSessionProblem ? ` · next: ${problemTitle(problemById.get(nextSessionProblem), 'a queued problem')}` : ' · queue finished'}
                </div>
                <div className="mt-1 text-[11.5px] text-[var(--color-ink-faint)]">
                  {activeSession.rules.order} · {fmtMinutes(activeSession.rules.minutes)} target
                  {activeSession.timerMinutes != null ? ` · ${fmtMinutes(activeSession.timerMinutes)} logged` : ''}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn--blueprint" onClick={openSession} disabled={!nextSessionProblem}>
                  <span className="inline-flex items-center gap-1.5"><Play size={12} /> {nextSessionProblem ? 'Resume queue' : 'Queue finished'}</span>
                </button>
                <button className="btn btn--ghost" onClick={() => goView('session')}>Session setup</button>
              </div>
            </div>
          ) : due.length ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="kicker">spaced queue — due for retry</div>
                <div className="mt-1 text-[14px] font-medium">
                  {due.length} problem{due.length === 1 ? '' : 's'} ready to prove again
                </div>
                <div className="mt-1 text-[11.5px] text-[var(--color-ink-faint)]">
                  oldest due {fmtDateTime(due[0].review.dueAt)} · retries file before new work
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn--blueprint" onClick={startDueSet}>
                  <span className="inline-flex items-center gap-1.5"><RotateCcw size={12} /> Start due set</span>
                </button>
                <button className="btn btn--ghost" onClick={() => goView('session')}>Build a mix</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="kicker">queue is clear</div>
                <div className="mt-1 text-[14px] font-medium">No retries due — choose the next problem or build a session.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn--blueprint" onClick={openSession}>
                  <span className="inline-flex items-center gap-1.5"><Layers size={12} /> Build a session</span>
                </button>
                <button className="btn btn--ghost" onClick={() => goView('library')}>Browse problems</button>
              </div>
            </div>
          )}
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-4">
            <section className="film rounded p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="kicker">due for retry — prove it again before the hint ladder</div>
                {due.length > 5 && (
                  <button className="xbtn mono text-[10px]" onClick={() => goView('library')}>all {due.length} in library</button>
                )}
              </div>
              {!due.length ? (
                <div className="py-5 text-center text-[12.5px] text-[var(--color-ink-faint)]">
                  Nothing due. Misses and low-confidence wins schedule themselves from Compare.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--color-rule)]">
                  {due.slice(0, 5).map(({ review, problem }) => {
                    const latest = latestAttemptFor(problem.id, attempts);
                    const mark = resultMark(latest?.result);
                    const course = problem.courseId ? courses[problem.courseId] : undefined;
                    return (
                      <li key={problem.id} className="py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <button className="block w-full text-left text-[13.5px] leading-snug hover:text-[var(--color-blueprint-deep)]" onClick={() => beginProblem(problem)}>
                              {problemTitle(problem)}
                            </button>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="chip chip--blue">{problem.topic || 'general'}</span>
                              {course?.code && <CourseChip code={course.code} onOpen={openUrl} />}
                              <DiffMeter level={problem.difficulty} />
                              <span className="chip chip--violet" title={`due ${fmtDateTime(review.dueAt)}`}>
                                <RotateCcw size={9} className="mr-0.5 inline" />due {fmtDateTime(review.dueAt)}
                              </span>
                              {mark && (
                                <span className={cn('mark text-[10px]', mark.cls)}>
                                  {mark.sym} last {mark.word}
                                </span>
                              )}
                              {latest && <span className="chip">h{latest.hintLevel} · conf {latest.confidence}</span>}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                            <PlanRetryButton problem={problem} attemptId={latest?.id} />
                            <button className="btn btn--blueprint !px-3 !py-1.5" onClick={() => beginProblem(problem)}>
                              <span className="inline-flex items-center gap-1"><Play size={11} /> Attempt</span>
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="film rounded p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="kicker">recent verdicts — the last proofs inked</div>
                <button className="xbtn mono text-[10px]" onClick={() => goView('ledger')}>error ledger</button>
              </div>
              {!recentAttempts.length ? (
                <div className="py-5 text-center text-[12.5px] text-[var(--color-ink-faint)]">
                  No graded attempts yet. The first compare stamps the queue.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--color-rule)]">
                  {recentAttempts.map((a) => {
                    const p = problemById.get(a.problemId);
                    const mark = resultMark(a.result);
                    return (
                      <li key={a.id}>
                        <button className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => onOpenAttempt(a)}>
                          {mark && <span className={cn('mark w-16 shrink-0 text-[10px]', mark.cls)}>{mark.sym} {mark.word}</span>}
                          <span className="min-w-0 flex-1 truncate text-[13px]">{problemTitle(p)}</span>
                          <span className="mono shrink-0 text-[10.5px] text-[var(--color-ink-faint)]">
                            {fmtDateTime(a.submittedAt)} · h{a.hintLevel}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <div className="space-y-4">
            <section className="film rounded p-4">
              <div className="kicker mb-3">next moves</div>
              <div className="grid gap-2">
                <button className="btn btn--ghost justify-start" onClick={openSession}>
                  <span className="inline-flex items-center gap-2"><Layers size={13} className="text-[var(--color-blueprint)]" /> Practice session</span>
                </button>
                <button className="btn btn--ghost justify-start" onClick={() => goView('library')}>
                  <span className="inline-flex items-center gap-2"><Play size={13} className="text-[var(--color-blueprint)]" /> Problem library</span>
                </button>
                <button className="btn btn--ghost justify-start" onClick={() => goView('progress')}>
                  <span className="inline-flex items-center gap-2"><Award size={13} className="text-[var(--color-blueprint)]" /> Progress sheet</span>
                </button>
                <button className="btn btn--ghost justify-start" onClick={() => goView('import')}>
                  <span className="inline-flex items-center gap-2"><NotebookPen size={13} className="text-[var(--color-blueprint)]" /> Import worksheet</span>
                </button>
                <button className="btn btn--ghost justify-start" onClick={() => goView('ledger')}>
                  <span className="inline-flex items-center gap-2"><CalendarDays size={13} className="text-[var(--color-blueprint)]" /> Error ledger</span>
                </button>
              </div>
            </section>

            {recurrence.length > 0 && (
              <section className="film rounded p-4">
                <div className="kicker mb-2">weakest seams</div>
                <div className="flex flex-wrap gap-1.5">
                  {recurrence.map((r) => (
                    <button key={r.category} className="chip chip--violet" onClick={() => goView('ledger')}>
                      {categoryLabel(r.category)} · {r.count}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {pulseItems.length > 0 && <TerrainPulse items={pulseItems} onOpen={openUrl} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'violet' }) {
  return (
    <div className="film rounded px-3 py-2 text-center">
      <div className={cn('mono text-[16px] font-semibold leading-none', tone === 'violet' && value !== '0' && 'text-[var(--color-correct-deep)]')}>
        {value}
      </div>
      <div className="mt-1 text-[9.5px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
        {label}
        {sub ? ` · ${sub}` : ''}
      </div>
    </div>
  );
}

function CourseChip({ code, onOpen }: { code: string; onOpen: (url: string) => void }) {
  return (
    <button
      type="button"
      className="chip"
      title={`Open ${code} dossier`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(`#/c/${encodeURIComponent(code)}`);
      }}
    >
      {code} →
    </button>
  );
}

function TerrainPulse({
  items,
  onOpen,
}: {
  items: { key: string; app: string; label: string; sub: string; url: string; tone?: 'blue' | 'violet' | 'amber' }[];
  onOpen: (url: string) => void;
}) {
  return (
    <section className="film mt-4 rounded p-4">
      <div className="kicker mb-2">terrain pulse — what the neighboring benches are holding</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={cn(
              'chip chip--pulse cursor-pointer !px-3 !py-2 text-left',
              item.tone === 'violet' && 'chip--violet',
              item.tone === 'blue' && 'chip--blue',
            )}
            onClick={() => onOpen(item.url)}
            title={`${item.app} — ${item.sub}`}
          >
            <span className="mono mr-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] opacity-70">{item.app}</span>
            <span className="font-medium">{item.label}</span>
            <span className="text-[var(--color-ink-soft)]"> · {item.sub}</span>
            <ArrowRight size={10} className="ml-1 inline opacity-60" />
          </button>
        ))}
      </div>
    </section>
  );
}
