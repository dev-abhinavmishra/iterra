import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ListChecks, Play } from 'lucide-react';
import type { StoreEntity } from '../hub';
import { Button } from '../ui/primitives';
import { buildStudyPlan, courseCode, studyCourses, type StudyPlan } from './studyPlan';
import { execCommand } from './commands';
import {
  makeSessionChecklist, readStudySession, STUDY_SESSION_KEY, unfinishedStudySteps, writeStudySession,
} from './studySessionState';

export const StudyEntities = createContext<StoreEntity[] | null>(null);
const NO_ENTITIES: StoreEntity[] = [];

function StudySteps({ steps, setup, onGo, checked, completedInTool, onCheck }: {
  steps: StudyPlan['steps'];
  setup?: boolean;
  onGo: (url: string) => void;
  checked?: string[];
  completedInTool?: string[];
  onCheck?: (id: string, done: boolean) => void;
}) {
  return (
    <ol className="mt-3 divide-y divide-[var(--terrain-line,var(--color-line))]">
      {steps.map((step, index) => {
        const confirmed = completedInTool?.includes(step.id) === true;
        const detail = confirmed
          ? (step.completesWhen === 'deck-reviewed' ? 'Review complete in Flashcards.' : 'Marked done in Planning.')
          : step.detail;
        return (
          <li key={step.id} className="flex items-start gap-2 py-2.5">
            {onCheck ? (
              <input
                type="checkbox"
                checked={!!checked?.includes(step.id) || confirmed}
                disabled={confirmed}
                aria-label={confirmed ? `Completed in its tool: ${step.title}` : `Mark complete: ${step.title}`}
                className="mt-1 shrink-0 accent-[var(--terrain-accent,var(--color-accent))]"
                onChange={event => onCheck(step.id, event.target.checked)}
              />
            ) : <span aria-hidden="true" className="mt-0.5 w-4 shrink-0 text-xs">{index + 1}.</span>}
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onGo(step.url)}
                className="inline-flex items-baseline gap-1 text-left text-sm font-semibold underline-offset-2 hover:underline"
              >
                <span>{step.title}</span>
                <ArrowUpRight aria-hidden="true" className="h-3 w-3 shrink-0" />
              </button>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--terrain-muted,var(--color-mute))]">{detail}</p>
            </div>
            {!setup && (
              <span className="shrink-0 text-xs tabular-nums text-[var(--terrain-muted,var(--color-mute))]">{step.minutes} min</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function PlanFromToday({ entities, courseFilter, onGo }: {
  entities: StoreEntity[];
  courseFilter: string;
  onGo: (url: string) => void;
}) {
  const [courseRef, setCourseRef] = useState('');
  const [minutes, setMinutes] = useState(25);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const starting = useRef(false);
  const courses = useMemo(() => studyCourses(entities), [entities]);
  const plan = useMemo(() => {
    const requested = courses.some(course => course.key === courseRef) ? courseRef : courseFilter || undefined;
    return buildStudyPlan(entities, { now: Date.now(), minutes, courseRef: requested, unfinished: unfinishedStudySteps() });
  }, [entities, courses, courseFilter, courseRef, minutes]);
  if (!courses.length) return null;

  const start = async () => {
    if (!plan || starting.current) return;
    starting.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await execCommand('startFocusSession', {
        courseId: plan.course.key,
        course: courseCode(plan.course),
        // Mixed sessions count toward the course, not entirely toward one assignment.
        ...(plan.steps.length === 1 && plan.commitmentId ? { commitmentId: plan.commitmentId } : {}),
        label: `Study ${courseCode(plan.course)}`,
        plannedMinutes: minutes,
        studyPlan: makeSessionChecklist(plan),
        from: 'today',
      });
      // The command already stored the running session and notified a warm Timer.
      if (result.ok) onGo('#/p/timer');
      else setError(result.error ?? 'Could not start the timer. Try again.');
    } catch {
      setError('Could not start the timer. Try again.');
    } finally {
      starting.current = false;
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="study-plan-title" className="rounded-md border border-[var(--color-line)] bg-[var(--color-sheet)] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="study-plan-title" className="inline-flex items-center gap-2 text-base font-semibold">
            <ListChecks aria-hidden="true" className="h-4 w-4 text-[var(--color-accent)]" /> Your next study session
          </h2>
          <p className="mt-1 text-xs text-[var(--color-mute)]">Built from your deadlines and work that’s ready to review.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Course for study session" value={courseRef} onChange={event => setCourseRef(event.target.value)} className="it-input max-w-full text-sm">
            <option value="">{courseFilter || 'Pick for me'}</option>
            {courses.map(course => <option key={course.key} value={course.key}>{courseCode(course)}{course.title ? ` · ${course.title}` : ''}</option>)}
          </select>
          {plan && !plan.setup && (
            <select aria-label="Study session length" value={minutes} onChange={event => setMinutes(Number(event.target.value))} className="it-input text-sm">
              {[10, 25, 45, 60].map(length => <option key={length} value={length}>{length} min</option>)}
            </select>
          )}
        </div>
      </div>
      {plan ? <>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-mute)]">{courseCode(plan.course)}{!plan.setup && ` · ${minutes} min`}</p>
            <p className="mt-0.5 text-sm font-medium break-words">{plan.setup ? 'Set up your course' : plan.steps[0].title}</p>
          </div>
          {plan.setup ? (
            <Button variant="primary" size="sm" onClick={() => onGo(plan.steps[0].url)}>Paste schedule</Button>
          ) : <Button variant="primary" size="sm" disabled={busy} onClick={() => void start()}>
            <Play aria-hidden="true" className="h-4 w-4" /> {busy ? 'Starting…' : 'Start study session'}
          </Button>}
        </div>
        {error && <p className="mt-2 text-sm text-[var(--color-bad)]" role="alert">{error}</p>}
        <details className="mt-3 border-t border-[var(--color-line)] pt-3 text-sm">
          <summary className="cursor-pointer font-medium">{plan.setup ? 'Setup steps' : `View plan · ${plan.steps.length} ${plan.steps.length === 1 ? 'step' : 'steps'}`}</summary>
          <p className="mt-2 text-xs text-[var(--color-mute)]">{plan.reason}</p>
          <StudySteps steps={plan.steps} setup={plan.setup} onGo={onGo} />
          {plan.courseQueue.length > 1 && <details className="mt-2 text-sm">
            <summary className="cursor-pointer font-medium">Priorities across your courses</summary>
            <ol className="mt-2 space-y-2">
              {plan.courseQueue.map(entry => {
                const counts = [
                  entry.openTasks ? `${entry.openTasks} open ${entry.openTasks === 1 ? 'task' : 'tasks'}` : '',
                  entry.dueCards ? `${entry.dueCards} cards to review` : '',
                  entry.dueProblems ? `${entry.dueProblems} ${entry.dueProblems === 1 ? 'problem' : 'problems'} to retry` : '',
                ].filter(Boolean);
                return (
                  <li key={entry.course.key} className="min-w-0">
                    <button type="button" className="font-medium text-[var(--color-accent)] hover:underline"
                      onClick={() => setCourseRef(entry.course.key)}>
                      {courseCode(entry.course)}
                    </button>
                    <span className="ml-2 text-xs text-[var(--color-mute)]">{counts.join(' · ') || 'No deadlines or reviews recorded'}</span>
                    {entry.nextTask && (
                      <p className="text-xs text-[var(--color-mute)]">
                        Next: {entry.nextTask}{entry.nextDeadline !== undefined && ` · ${new Date(entry.nextDeadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </details>}
        </details>
      </> : <p className="mt-3 text-sm text-[var(--color-mute)]">Choose a course to see its plan.</p>}
    </section>
  );
}

interface ActiveStudyPlanProps {
  minutes: number;
  courseRef?: string;
  commitmentId?: string;
  materialRef?: string;
  sessionKey: string | null;
}

export const ActiveStudyPlan = memo(function ActiveStudyPlan(props: ActiveStudyPlanProps) {
  return <SessionChecklistView key={props.sessionKey} {...props} />;
});

function SessionChecklistView({ minutes, courseRef, commitmentId, materialRef, sessionKey }: ActiveStudyPlanProps) {
  const entities = useContext(StudyEntities) ?? NO_ENTITIES;
  const [saved, setSaved] = useState(() => sessionKey ? readStudySession(sessionKey) : null);
  const generated = useMemo(() => !saved?.plan ? buildStudyPlan(entities, {
    minutes, courseRef, commitmentId, materialRef, now: Date.now(), unfinished: unfinishedStudySteps(sessionKey ?? undefined),
  }) : null, [saved?.plan, entities, minutes, courseRef, commitmentId, materialRef, sessionKey]);
  const checklist = saved?.plan ?? (generated ? makeSessionChecklist(generated) : undefined);
  const setup = generated?.setup === true;
  const completedInTool = useMemo(() => {
    const steps = saved?.plan?.steps ?? [];
    const trackable = new Map(steps.filter(step => step.completesWhen).map(step => [step.id, step.completesWhen]));
    if (!trackable.size) return [];
    return entities.filter(entity => {
      const rule = trackable.get(entity.key);
      return (rule === 'assignment-done' && entity.data?.status === 'done') ||
        (rule === 'deck-reviewed' && entity.data?.due === 0);
    }).map(entity => entity.key);
  }, [entities, saved?.plan]);

  useEffect(() => {
    if (!sessionKey || !saved?.plan || !completedInTool.some(id => !saved.checked.includes(id))) return;
    const latest = readStudySession(sessionKey);
    const next = { sessionKey, plan: saved.plan, checked: [...new Set([...latest.checked, ...saved.checked, ...completedInTool])] };
    writeStudySession(next);
    setSaved(next);
  }, [sessionKey, saved, completedInTool]);

  useEffect(() => {
    if (!sessionKey || saved?.plan || !generated || generated.setup) return;
    const latest = readStudySession(sessionKey);
    const next = { ...latest, plan: latest.plan ?? makeSessionChecklist(generated) };
    writeStudySession(next);
    setSaved(next);
  }, [sessionKey, saved?.plan, generated]);

  useEffect(() => {
    if (!sessionKey) return;
    const update = (event: StorageEvent) => {
      if (event.key !== STUDY_SESSION_KEY) return;
      const latest = readStudySession(sessionKey);
      if (latest.plan) setSaved(latest);
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, [sessionKey]);

  const toggle = (id: string, done: boolean) => {
    if (!sessionKey || !checklist) return;
    const latest = readStudySession(sessionKey);
    const checked = new Set(latest.plan ? latest.checked : saved?.checked ?? latest.checked);
    if (done) checked.add(id);
    else checked.delete(id);
    const next = { sessionKey, plan: checklist, checked: [...checked] };
    writeStudySession(next);
    setSaved(next);
  };

  if (!checklist) return null;
  const completed = checklist.steps.filter(step => saved?.checked.includes(step.id) || completedInTool.includes(step.id)).length;
  return (
    <section aria-label="Session study plan">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-sm font-semibold">{checklist.courseCode} study plan</h3>
        {!setup && checklist.steps.length > 1 && (
          <span className="text-xs text-[var(--terrain-muted,var(--color-mute))]">{completed} of {checklist.steps.length} complete</span>
        )}
      </div>
      {!courseRef && <p className="mt-1 text-xs text-[var(--terrain-muted,var(--color-mute))]">Suggested for this session. Start from Today to log time against a specific course.</p>}
      <StudySteps steps={checklist.steps} setup={setup} checked={saved?.checked} completedInTool={completedInTool}
        onCheck={sessionKey && !setup ? toggle : undefined} onGo={url => window.iterra?.open(url)} />
    </section>
  );
}
