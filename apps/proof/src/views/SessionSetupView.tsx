import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useWorkbench,
  selectAllTopics,
  selectActiveProblems,
  selectSessionAttempts,
} from '../store';
import type { Attempt, Difficulty, PracticeSession, SessionRules } from '../lib/types';
import { isDue } from '../lib/schedule';
import { timerDeepLink, type InboundLink } from '../lib/links';
import { openDeep } from '../lib/iterra';
import { docToText } from '../lib/doc';
import { cn, fmtMinutes } from '../lib/utils';
import { DiffMeter } from '../components/DiffMeter';
import { Field } from '../components/Field';
import { Play, Timer, CheckCircle2, Shuffle, Layers3, RotateCcw } from 'lucide-react';

export function SessionSetupView({
  sessionId,
  inbound,
  onSession,
  onAttempt,
}: {
  sessionId?: string;
  inbound?: InboundLink | null;
  onSession: (s?: PracticeSession) => void;
  onAttempt: (a: Attempt) => void;
}) {
  const problems = useWorkbench(useShallow(selectActiveProblems));
  const topics = useWorkbench(useShallow(selectAllTopics));
  const courses = useWorkbench(useShallow((s) => Object.values(s.courses).filter((c) => !c.archived)));
  const reviews = useWorkbench((s) => s.reviews);
  const sessions = useWorkbench((s) => s.sessions);
  const settings = useWorkbench((s) => s.settings);
  const createSession = useWorkbench((s) => s.createSession);
  const completeSession = useWorkbench((s) => s.completeSession);
  const startAttempt = useWorkbench((s) => s.startAttempt);
  const setTimerUrl = useWorkbench((s) => s.setTimerUrl);

  const [selTopics, setSelTopics] = useState<string[]>([]);
  const [selCourses, setSelCourses] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(settings.defaultSessionMinutes);
  const [newRatio, setNewRatio] = useState(0.5);
  const [order, setOrder] = useState<'blocked' | 'interleaved'>('interleaved');
  const [minDiff, setMinDiff] = useState<Difficulty>(1);
  const [maxDiff, setMaxDiff] = useState<Difficulty>(5);

  // inbound Syllabus prefill — the link arrives as a prop; App consumed it
  // once at boot, a second consumeInbound() here would always read null
  const [intent, setIntent] = useState<string | undefined>();
  useEffect(() => {
    const i = inbound;
    if (i?.kind === 'syllabus-session') {
      if (i.minutes) setMinutes(Math.round(i.minutes));
      if (i.topic && topics.includes(i.topic)) setSelTopics([i.topic]);
      if (i.course) {
        const c = Object.values(courses).find((x) => x.code === i.course);
        if (c) setSelCourses([c.id]);
      }
      if (i.intent) setIntent(i.intent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const session = sessionId ? sessions[sessionId] : undefined;
  const sessionAttempts = useWorkbench(
    useShallow((s) => (sessionId ? selectSessionAttempts(s, sessionId) : [])),
  );

  const dueList = useMemo(
    () => Object.values(reviews).filter((r) => isDue(r) && problems.some((p) => p.id === r.problemId)),
    [reviews, problems],
  );

  const rules: SessionRules = {
    courseIds: selCourses,
    topics: selTopics,
    minDifficulty: minDiff,
    maxDifficulty: maxDiff,
    minutes,
    newRatio,
    order,
  };

  const build = () => {
    const s = createSession(rules, intent);
    onSession(s);
  };

  const nextProblem = session
    ? session.problemIds.find((pid) => {
        const done = sessionAttempts.some((a) => a.problemId === pid && a.submittedAt);
        return !done;
      })
    : undefined;

  const launchTimer = () => {
    if (!session) return;
    const url = timerDeepLink({
      settings,
      session,
      minutes: session.rules.minutes,
      label: `Proof — ${session.intent ?? 'practice session'}`,
    });
    setTimerUrl(session.id, url);
    openDeep(url);
  };

  const beginNext = () => {
    if (!session || !nextProblem) return;
    const a = startAttempt(nextProblem, session.id);
    onAttempt(a);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <div className="pad mt-3 p-5">
        {!session ? (
          <>
            <div className="mb-1 flex items-center justify-between">
              <div className="kicker">session builder — deliberate practice</div>
              {dueList.length > 0 && (
                <span className="chip chip--violet"><RotateCcw size={9} className="mr-1 inline" />{dueList.length} due for retry</span>
              )}
            </div>
            <p className="mb-4 text-[13px] text-[var(--color-ink-soft)]">
              Pick the mix. Interleaved forces method choice — you can't run one pattern on autopilot.
              {intent && <span className="ml-1 chip">from Syllabus: {intent}</span>}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={`Topics — ${selTopics.length ? selTopics.join(', ') : 'all'}`}>
                <div className="flex flex-wrap gap-1.5 rounded border border-[var(--color-rule-dark)] bg-[var(--color-form)] p-2">
                  {topics.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={cn('chip cursor-pointer', selTopics.includes(t) && 'chip--blue !border-[var(--color-blueprint)]')}
                      onClick={() => setSelTopics((x) => (x.includes(t) ? x.filter((v) => v !== t) : [...x, t]))}
                    >
                      {t}
                    </button>
                  ))}
                  {!topics.length && <span className="text-[12px] text-[var(--color-ink-faint)]">no topics yet — file problems first</span>}
                </div>
              </Field>
              <Field label={`Courses — ${selCourses.length ? 'selected' : 'all'}`}>
                <div className="flex flex-wrap gap-1.5 rounded border border-[var(--color-rule-dark)] bg-[var(--color-form)] p-2">
                  {courses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={cn('chip cursor-pointer', selCourses.includes(c.id) && 'chip--blue !border-[var(--color-blueprint)]')}
                      onClick={() => setSelCourses((x) => (x.includes(c.id) ? x.filter((v) => v !== c.id) : [...x, c.id]))}
                    >
                      {c.code}
                    </button>
                  ))}
                  {!courses.length && <span className="text-[12px] text-[var(--color-ink-faint)]">no courses — add them in Settings</span>}
                </div>
              </Field>
              <Field label={`Duration — ${fmtMinutes(minutes)}`}>
                <input
                  type="range" min={10} max={120} step={5}
                  className="w-full accent-[var(--color-blueprint)]"
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
              </Field>
              <Field label={`New vs retry — ${Math.round(newRatio * 100)}% new`}>
                <input
                  type="range" min={0} max={1} step={0.1}
                  className="w-full accent-[var(--color-blueprint)]"
                  value={newRatio}
                  onChange={(e) => setNewRatio(Number(e.target.value))}
                />
              </Field>
              <Field label="Difficulty range">
                <div className="flex items-center gap-2">
                  <select className="f-select" value={minDiff} onChange={(e) => setMinDiff(Number(e.target.value) as Difficulty)}>
                    {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d} — {['', 'routine', 'standard', 'tricky', 'hard', 'brutal'][d]}</option>)}
                  </select>
                  <span className="mono text-[12px]">to</span>
                  <select className="f-select" value={maxDiff} onChange={(e) => setMaxDiff(Number(e.target.value) as Difficulty)}>
                    {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d} — {['', 'routine', 'standard', 'tricky', 'hard', 'brutal'][d]}</option>)}
                  </select>
                </div>
              </Field>
              <Field label="Order — mix forces method choice">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className={cn('chip cursor-pointer', order === 'blocked' && 'chip--blue !border-[var(--color-blueprint)]')}
                    onClick={() => setOrder('blocked')}
                  >
                    <Layers3 size={10} className="mr-1 inline" /> blocked
                  </button>
                  <button
                    type="button"
                    className={cn('chip cursor-pointer', order === 'interleaved' && 'chip--blue !border-[var(--color-blueprint)]')}
                    onClick={() => setOrder('interleaved')}
                  >
                    <Shuffle size={10} className="mr-1 inline" /> interleaved
                  </button>
                </div>
              </Field>
            </div>
            <div className="mt-5 flex items-center justify-between">
              <div className="text-[12px] text-[var(--color-ink-soft)]">
                ≈ {Math.max(1, Math.round(minutes / 7))} problems at typical pace · due retries always file first
              </div>
              <button className="btn btn--blueprint" onClick={build} disabled={!problems.length}>
                <span className="inline-flex items-center gap-1.5"><Play size={12} /> Build session</span>
              </button>
            </div>
          </>
        ) : (
          <SessionRunner
            session={session}
            attempts={sessionAttempts}
            problems={problems}
            nextProblem={nextProblem}
            onBegin={beginNext}
            onLaunchTimer={launchTimer}
            onFinish={() => completeSession(session.id)}
            onNewSession={() => onSession(undefined)}
          />
        )}
      </div>
    </div>
  );
}

function SessionRunner({
  session,
  attempts,
  problems,
  nextProblem,
  onBegin,
  onLaunchTimer,
  onFinish,
  onNewSession,
}: {
  session: PracticeSession;
  attempts: Attempt[];
  problems: { id: string; topic: string; difficulty: number; promptDoc: string; archived: boolean }[];
  nextProblem?: string;
  onBegin: () => void;
  onLaunchTimer: () => void;
  onFinish: () => void;
  onNewSession: () => void;
}) {
  const byId = new Map(problems.map((p) => [p.id, p]));
  const done = attempts.filter((a) => a.submittedAt);
  const correctCount = done.filter((a) => a.result === 'correct').length;
  const finished = !nextProblem;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="kicker">session — {session.rules.order} · {fmtMinutes(session.rules.minutes)} target</div>
          {session.intent && <div className="mt-0.5 text-[12px] text-[var(--color-ink-soft)]">intent: {session.intent}</div>}
        </div>
        <div className="flex items-center gap-2">
          <span className="chip">{done.length}/{session.problemIds.length} done · {correctCount} unaided+aided ✓</span>
          {!session.timerUrl && !finished && (
            <button className="btn btn--ghost !py-1.5" onClick={onLaunchTimer}>
              <span className="inline-flex items-center gap-1.5"><Timer size={12} /> Timer</span>
            </button>
          )}
          {session.timerMinutes != null && (
            <span className="chip chip--blue" title="filed by Timer">⏱ {fmtMinutes(session.timerMinutes)} logged</span>
          )}
        </div>
      </div>

      <ol className="divide-y divide-[var(--color-rule)]">
        {session.problemIds.map((pid, i) => {
          const p = byId.get(pid);
          const att = attempts.find((a) => a.problemId === pid && a.submittedAt);
          const isNext = pid === nextProblem;
          return (
            <li key={pid} className={cn('flex items-center gap-3 py-2.5', isNext && 'bg-[rgb(var(--blueprint-rgb)/0.06)] -mx-2 px-2 rounded')}>
              <span className={cn('rail-node !h-[26px] !w-[26px] !text-[10px]', att?.result === 'correct' && 'rail-node--correct')}>
                {att ? (att.result === 'correct' ? '✓' : att.result === 'partial' ? '◐' : '✕') : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]">{p ? docToText(p.promptDoc, 110) : 'problem removed'}</div>
                <div className="mt-0.5 flex gap-1.5">
                  {p && <span className="chip chip--blue !text-[8.5px]">{p.topic}</span>}
                  {p && <DiffMeter level={p.difficulty as 1 | 2 | 3 | 4 | 5} className="!h-[8px]" />}
                  {att && <span className="chip !text-[8.5px]">{att.hintLevel > 0 ? `h${att.hintLevel}` : 'unaided'}</span>}
                </div>
              </div>
              {isNext && (
                <button className="btn btn--blueprint !px-3 !py-1.5" onClick={onBegin}>
                  <span className="inline-flex items-center gap-1"><Play size={11} /> Begin</span>
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex items-center justify-between">
        <button className="btn btn--ghost" onClick={onNewSession}>New session</button>
        {finished ? (
          <div className="flex items-center gap-2">
            <span className="mark mark--correct"><CheckCircle2 size={13} /> session complete</span>
            <button className="btn btn--blueprint" onClick={onFinish}>File session</button>
          </div>
        ) : (
          <div className="text-[12px] text-[var(--color-ink-soft)]">
            attempts file as you submit — the queue updates itself
          </div>
        )}
      </div>
    </div>
  );
}
