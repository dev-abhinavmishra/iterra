import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppSettings,
  Attempt,
  AttemptResult,
  Course,
  ErrorRecord,
  HintLevel,
  PracticeSession,
  Problem,
  ReviewState,
  Rubric,
  SessionRules,
  WorkStep,
  WorkbenchData,
} from '../lib/types';
import { nextReview, buildSessionList, newSession } from '../lib/schedule';
import { parseInbound, type InboundLink } from '../lib/links';
import { exportWorkbench, parseWorkbenchBackup } from '../lib/backup';
import { uid, nowISO } from '../lib/utils';
import { draftToProblem, type DraftProblem } from '../lib/imports';

export const DEFAULT_SETTINGS: AppSettings = {
  timerBaseUrl: '/apps/timer',
  inkBaseUrl: '/apps/ink',
  modularBaseUrl: 'https://modularaistack.vercel.app',
  flashcardsBaseUrl: '/apps/flashcards',
  syllabusBaseUrl: '/apps/syllabus',
  gradestackBaseUrl: '/apps/gradestack',
  motion: 'full',
  defaultSessionMinutes: 30,
};

interface WorkbenchState extends WorkbenchData {
  booted: boolean;
  inbound: InboundLink | null;
  boot: (query?: string) => void;
  consumeInbound: () => InboundLink | null;
  hasOnboarded: () => boolean;

  // courses
  addCourse: (c: Omit<Course, 'id' | 'createdAt' | 'archived'>) => Course;
  updateCourse: (id: string, patch: Partial<Course>) => void;
  archiveCourse: (id: string, archived: boolean) => void;

  // problems
  addProblem: (p: Omit<Problem, 'id' | 'createdAt' | 'archived'> & { id?: string }) => Problem;
  updateProblem: (id: string, patch: Partial<Problem>) => void;
  archiveProblem: (id: string, archived: boolean) => void;
  deleteProblem: (id: string) => void;
  importDrafts: (drafts: DraftProblem[]) => Problem[];

  // rubrics
  addRubric: (r: Omit<Rubric, 'id' | 'createdAt'>) => Rubric;
  updateRubric: (id: string, patch: Partial<Rubric>) => void;
  deleteRubric: (id: string) => void;

  // attempts
  startAttempt: (problemId: string, sessionId?: string) => Attempt;
  updateAttempt: (id: string, patch: Partial<Attempt>) => void;
  addStep: (attemptId: string, step?: Partial<WorkStep>) => WorkStep;
  updateStep: (attemptId: string, stepId: string, patch: Partial<WorkStep>) => void;
  removeStep: (attemptId: string, stepId: string) => void;
  revealHint: (attemptId: string) => void;
  submitAttempt: (
    id: string,
    outcome: { result: AttemptResult; resultSource: 'auto' | 'self' },
  ) => void;
  fileError: (
    e: Omit<ErrorRecord, 'id' | 'createdAt' | 'attemptId' | 'problemId'> & { attemptId: string },
  ) => ErrorRecord;
  updateError: (id: string, patch: Partial<ErrorRecord>) => void;
  deleteError: (id: string) => void;

  // reviews
  reviewState: (problemId: string) => ReviewState | undefined;
  scheduleReview: (problemId: string, result: AttemptResult, confidence: number, attemptId: string) => void;
  clearReview: (problemId: string) => void;
  dueReviews: () => ReviewState[];

  // sessions
  createSession: (rules: SessionRules, intent?: string) => PracticeSession;
  completeSession: (id: string) => void;
  setTimerUrl: (id: string, url: string) => void;
  fileTimerReturn: (sessionId: string, actual?: number) => void;
  deleteSession: (id: string) => void;

  // settings + backup
  updateSettings: (patch: Partial<AppSettings>) => void;
  exportJSON: () => string;
  importJSON: (text: string) => { ok: true } | { ok: false; error: string };
  importProblemSet: (problems: WorkbenchData['problems'], rubrics: WorkbenchData['rubrics']) => number;
  resetWorkbench: () => void;
}

/* One normalization pass over untrusted blobs — the persist merge hook and
   the backup/problem-set import paths all feed it, so a hand-edited or
   pre-schema file can't wedge the desk (undefined .map/.trim/.length crashes
   are the whole class of bug this prevents). */
function normalizeWorkbenchData<T extends Partial<WorkbenchData & { settings?: AppSettings }>>(s: T): T {
  for (const p of Object.values(s.problems || {})) {
    p.tags = p.tags ?? [];
    p.hints = p.hints ?? [];
    p.attachments = p.attachments ?? [];
    p.promptDoc = p.promptDoc ?? '';
    p.workedSolutionDoc = p.workedSolutionDoc ?? '';
    p.answerSpec = p.answerSpec ?? { kind: 'steps', steps: [] };
    /* nested spec fields — a {kind:'choice'} blob missing `options` crashes
       autoCheck's .slice and the desk's .map; every kind gets its minimum */
    const spec = p.answerSpec as Record<string, unknown>;
    switch (spec.kind) {
      case 'exact': spec.expected = spec.expected ?? ''; break;
      case 'numeric': spec.value = Number.isFinite(spec.value) ? spec.value : 0; break;
      case 'expression':
        spec.expected = spec.expected ?? '';
        spec.vars = spec.vars ?? [];
        break;
      case 'choice':
        spec.options = spec.options ?? [];
        spec.correct = spec.correct ?? [];
        break;
      case 'steps': spec.steps = spec.steps ?? []; break;
      case 'rubric': spec.rubricId = spec.rubricId ?? ''; break;
    }
  }
  for (const a of Object.values(s.attempts || {})) {
    a.hintReveals = a.hintReveals ?? [];
    /* work:[] used to crash AttemptDesk on step.text — every attempt needs
       at least one (possibly blank) assertion slot, and every step needs
       an id + string text for keys and DocView */
    if (!Array.isArray(a.work) || !a.work.length) {
      a.work = [{ id: uid('w_'), text: '' }];
    } else {
      a.work = a.work.map((w) => ({ ...w, id: w?.id ?? uid('w_'), text: w?.text ?? '' }));
    }
    a.confidence = Number.isFinite(a.confidence) ? a.confidence : 3;
    a.hintLevel = Number.isFinite(a.hintLevel) ? a.hintLevel : 0;
  }
  for (const sess of Object.values(s.sessions || {})) {
    sess.problemIds = sess.problemIds ?? [];
    /* a partial rules blob (minutes missing → NaN) renders 'NaNm' in the
       runner and silently builds 0-problem lists — fill the defaults */
    sess.rules = {
      courseIds: [],
      topics: [],
      minutes: 30,
      newRatio: 0.5,
      minDifficulty: 1,
      maxDifficulty: 5,
      order: 'interleaved',
      /* persisted rules are typed complete but may genuinely be partial —
         the cast is the whole point of the normalization */
      ...((sess.rules || {}) as Partial<SessionRules>),
    };
  }
  for (const e of Object.values(s.errors || {})) {
    e.divergentSteps = e.divergentSteps ?? [];
  }
  return s;
}

const EMPTY_DATA = (): WorkbenchData => ({
  problems: {},
  attempts: {},
  errors: {},
  sessions: {},
  reviews: {},
  rubrics: {},
  courses: {},
  settings: DEFAULT_SETTINGS,
});

/* module-level boot-query dedupe — kept out of persisted state on purpose:
   a consumed link is a fact of this mount, not data to restore next boot. */
let _lastBootQuery: string | null = null;

export const useWorkbench = create<WorkbenchState>()(
  persist(
    (set, get) => ({
      ...EMPTY_DATA(),
      booted: false,
      inbound: null,

      /* The terrain passes the place query in — deep links live inside the
         hash ('#/p/proof?proof=…'), not location.search. A re-call with a
         fresh query is a live re-delivery; a queryless call after boot is
         a no-op. */
      boot: (query?: string) => {
        const s = get();
        if (s.booted && query === undefined) return;
        /* StrictMode re-invokes effects — the same query string consumed
           twice would double-file a timer-return. One pass per string. */
        if (query !== undefined) {
          if (query === _lastBootQuery) return;
          _lastBootQuery = query;
        }
        const search = query ?? (typeof window !== 'undefined' ? window.location.search : '');
        let inbound: InboundLink | null = null;
        if (search) {
          inbound = parseInbound(search);
          if (inbound) {
            if (inbound.kind === 'timer-return' && inbound.sessionId) {
              get().fileTimerReturn(inbound.sessionId, inbound.actualMinutes);
              inbound = null;
            }
            if (inbound?.kind === 'problem' && inbound.problemId) {
              const problem = get().problems[inbound.problemId];
              if (problem) {
                const attempt = get().startAttempt(problem.id);
                inbound = { ...inbound, attemptId: attempt.id };
              } else {
                inbound = null;
              }
            }
            if (inbound?.kind === 'attempt' && inbound.attemptId) {
              /* ?attempt=<id> must name a real attempt — else drop the link */
              if (!get().attempts[inbound.attemptId]) inbound = null;
            }
            if (query !== undefined) {
              window.history.replaceState({}, '', '#/p/proof');
            } else {
              const url = new URL(window.location.href);
              url.search = '';
              window.history.replaceState({}, '', url.toString());
            }
          }
        }
        set({ booted: true, ...(inbound ? { inbound } : {}) });
      },

      consumeInbound: () => {
        const i = get().inbound;
        if (i) set({ inbound: null });
        return i;
      },

      hasOnboarded: () => Object.keys(get().problems).length > 0,

      // ── courses ──
      addCourse: (c) => {
        const course: Course = { ...c, id: uid('c_'), createdAt: nowISO(), archived: false };
        set((s) => ({ courses: { ...s.courses, [course.id]: course } }));
        return course;
      },
      updateCourse: (id, patch) =>
        set((s) => ({ courses: { ...s.courses, [id]: { ...s.courses[id], ...patch } } })),
      archiveCourse: (id, archived) =>
        set((s) => ({ courses: { ...s.courses, [id]: { ...s.courses[id], archived } } })),

      // ── problems ──
      addProblem: (p) => {
        const problem: Problem = {
          ...p,
          id: p.id ?? uid('p_'),
          createdAt: nowISO(),
          archived: false,
        };
        set((s) => ({ problems: { ...s.problems, [problem.id]: problem } }));
        return problem;
      },
      updateProblem: (id, patch) =>
        set((s) => ({
          problems: { ...s.problems, [id]: { ...s.problems[id], ...patch } },
        })),
      archiveProblem: (id, archived) =>
        set((s) => ({ problems: { ...s.problems, [id]: { ...s.problems[id], archived } } })),
      deleteProblem: (id) =>
        set((s) => {
          const problems = { ...s.problems };
          delete problems[id];
          const reviews = { ...s.reviews };
          delete reviews[id];
          return { problems, reviews };
        }),
      importDrafts: (drafts) => {
        const made = drafts.map(draftToProblem);
        set((s) => {
          const problems = { ...s.problems };
          for (const p of made) problems[p.id] = p;
          return { problems };
        });
        return made;
      },

      // ── rubrics ──
      addRubric: (r) => {
        const rubric: Rubric = { ...r, id: uid('r_'), createdAt: nowISO() };
        set((s) => ({ rubrics: { ...s.rubrics, [rubric.id]: rubric } }));
        return rubric;
      },
      updateRubric: (id, patch) =>
        set((s) => ({ rubrics: { ...s.rubrics, [id]: { ...s.rubrics[id], ...patch } } })),
      deleteRubric: (id) =>
        set((s) => {
          const rubrics = { ...s.rubrics };
          delete rubrics[id];
          return { rubrics };
        }),

      // ── attempts ──
      startAttempt: (problemId, sessionId) => {
        const attempt: Attempt = {
          id: uid('a_'),
          problemId,
          sessionId,
          startedAt: nowISO(),
          work: [{ id: uid('w_'), text: '' }],
          confidence: 3,
          hintLevel: 0,
          hintReveals: [],
        };
        set((s) => ({ attempts: { ...s.attempts, [attempt.id]: attempt } }));
        return attempt;
      },
      updateAttempt: (id, patch) =>
        set((s) => ({ attempts: { ...s.attempts, [id]: { ...s.attempts[id], ...patch } } })),
      addStep: (attemptId, step) => {
        const ws: WorkStep = { id: uid('w_'), text: '', ...step };
        set((s) => {
          const a = s.attempts[attemptId];
          if (!a) return s;
          return {
            attempts: { ...s.attempts, [attemptId]: { ...a, work: [...a.work, ws] } },
          };
        });
        return ws;
      },
      updateStep: (attemptId, stepId, patch) =>
        set((s) => {
          const a = s.attempts[attemptId];
          if (!a) return s;
          return {
            attempts: {
              ...s.attempts,
              [attemptId]: {
                ...a,
                work: a.work.map((w) => (w.id === stepId ? { ...w, ...patch } : w)),
              },
            },
          };
        }),
      removeStep: (attemptId, stepId) =>
        set((s) => {
          const a = s.attempts[attemptId];
          if (!a || a.work.length <= 1) return s;
          return {
            attempts: {
              ...s.attempts,
              [attemptId]: { ...a, work: a.work.filter((w) => w.id !== stepId) },
            },
          };
        }),
      revealHint: (attemptId) =>
        set((s) => {
          const a = s.attempts[attemptId];
          if (!a || a.hintLevel >= 4) return s;
          const level = (a.hintLevel + 1) as HintLevel;
          return {
            attempts: {
              ...s.attempts,
              [attemptId]: {
                ...a,
                hintLevel: level,
                hintReveals: [...a.hintReveals, { level, at: nowISO() }],
              },
            },
          };
        }),
      submitAttempt: (id, outcome) =>
        set((s) => {
          const a = s.attempts[id];
          if (!a) return s;
          return {
            attempts: {
              ...s.attempts,
              [id]: {
                ...a,
                submittedAt: nowISO(),
                result: outcome.result,
                resultSource: outcome.resultSource,
              },
            },
          };
        }),
      fileError: (e) => {
        const a = get().attempts[e.attemptId];
        const rec: ErrorRecord = {
          ...e,
          id: uid('e_'),
          problemId: a?.problemId ?? '',
          createdAt: nowISO(),
        };
        set((s) => ({ errors: { ...s.errors, [rec.id]: rec } }));
        return rec;
      },
      updateError: (id, patch) =>
        set((s) => ({ errors: { ...s.errors, [id]: { ...s.errors[id], ...patch } } })),
      deleteError: (id) =>
        set((s) => {
          const errors = { ...s.errors };
          delete errors[id];
          return { errors };
        }),

      // ── reviews ──
      reviewState: (problemId) => get().reviews[problemId],
      scheduleReview: (problemId, result, confidence, attemptId) =>
        set((s) => ({
          reviews: {
            ...s.reviews,
            [problemId]: nextReview({
              problemId,
              result,
              confidence,
              attemptId,
              prior: s.reviews[problemId],
            }),
          },
        })),
      clearReview: (problemId) =>
        set((s) => {
          const reviews = { ...s.reviews };
          delete reviews[problemId];
          return { reviews };
        }),
      dueReviews: () => {
        const now = nowISO();
        const s = get();
        /* only actionable dues count — a review whose problem was deleted or
           archived can't be retried, so it must not inflate the badge or
           the presence summary */
        return Object.values(s.reviews).filter(
          (r) => r.dueAt <= now && s.problems[r.problemId] && !s.problems[r.problemId].archived,
        );
      },

      // ── sessions ──
      createSession: (rules, intent) => {
        const s = get();
        const attempted = new Set(Object.values(s.attempts).map((a) => a.problemId));
        const candidates = buildSessionList(
          rules,
          Object.values(s.problems),
          s.reviews,
          attempted,
        );
        const session = newSession(rules, candidates.map((c) => c.problem.id), intent);
        set((st) => ({ sessions: { ...st.sessions, [session.id]: session } }));
        return session;
      },
      completeSession: (id) =>
        set((s) => ({
          sessions: {
            ...s.sessions,
            [id]: { ...s.sessions[id], completedAt: nowISO() },
          },
        })),
      setTimerUrl: (id, url) =>
        set((s) => ({ sessions: { ...s.sessions, [id]: { ...s.sessions[id], timerUrl: url } } })),
      fileTimerReturn: (sessionId, actual) =>
        set((s) => {
          const sess = s.sessions[sessionId];
          if (!sess) return s;
          return {
            sessions: {
              ...s.sessions,
              [sessionId]: { ...sess, timerMinutes: actual ?? sess.timerMinutes },
            },
          };
        }),
      deleteSession: (id) =>
        set((s) => {
          const sessions = { ...s.sessions };
          delete sessions[id];
          return { sessions };
        }),

      // ── settings + backup ──
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      exportJSON: () => {
        const s = get();
        return exportWorkbench({
          problems: s.problems,
          attempts: s.attempts,
          errors: s.errors,
          sessions: s.sessions,
          reviews: s.reviews,
          rubrics: s.rubrics,
          courses: s.courses,
          settings: s.settings,
        });
      },
      importJSON: (text) => {
        try {
          const data = parseWorkbenchBackup(text);
          if (!data.settings) data.settings = DEFAULT_SETTINGS;
          /* hand-edited backups skip the persist merge — run the same
             normalization so malformed specs/steps can't wedge the desk */
          set({ ...EMPTY_DATA(), ...normalizeWorkbenchData(data) });
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : 'Import failed' };
        }
      },
      importProblemSet: (problems, rubrics) => {
        const s = get();
        const merged = { ...s.problems };
        let n = 0;
        for (const [id, p] of Object.entries(problems || {})) {
          if (!merged[id]) {
            merged[id] = p;
            n++;
          }
        }
        /* problem-set files come straight off disk — normalize the merged
           maps before they land, same as a backup restore */
        const norm = normalizeWorkbenchData({
          problems: merged,
          rubrics: { ...s.rubrics, ...(rubrics || {}) },
        });
        set({ problems: norm.problems, rubrics: norm.rubrics });
        return n;
      },
      resetWorkbench: () => set({ ...EMPTY_DATA(), settings: { ...get().settings } }),
    }),
    {
      name: 'proof.workbench.v1',
      version: 1,
      /* old/partial blobs: array fields readers iterate unguarded
         (p.tags crashed LibraryView + selectAllTags — same class as the
         syllabus dependencies fix upstream) */
      merge: (persisted, current) => {
        const s = { ...current, ...(persisted as Partial<WorkbenchState>) };
        /* settings is a nested object — a persisted {} or partial blob must
           not blank the defaults (defaultSessionMinutes undefined →
           rules.minutes NaN → every session built with 0 problems) */
        s.settings = { ...current.settings, ...(s.settings || {}) };
        /* every array/spec field the UI iterates is normalized in one pass —
           see normalizeWorkbenchData above */
        return normalizeWorkbenchData(s);
      },
      partialize: (s) => ({
        problems: s.problems,
        attempts: s.attempts,
        errors: s.errors,
        sessions: s.sessions,
        reviews: s.reviews,
        rubrics: s.rubrics,
        courses: s.courses,
        settings: s.settings,
      }),
    },
  ),
);

// ── selectors ──

export function selectActiveProblems(s: WorkbenchState): Problem[] {
  return Object.values(s.problems)
    .filter((p) => !p.archived)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function selectAttemptsFor(s: WorkbenchState, problemId: string): Attempt[] {
  return Object.values(s.attempts)
    .filter((a) => a.problemId === problemId)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function selectAllTopics(s: WorkbenchState): string[] {
  const t = new Set<string>();
  for (const p of Object.values(s.problems)) if (!p.archived && p.topic) t.add(p.topic);
  return [...t].sort((a, b) => a.localeCompare(b));
}

export function selectAllTags(s: WorkbenchState): string[] {
  const t = new Set<string>();
  for (const p of Object.values(s.problems)) if (!p.archived) for (const tag of p.tags) t.add(tag);
  return [...t].sort((a, b) => a.localeCompare(b));
}

export function selectSessionAttempts(s: WorkbenchState, sessionId: string): Attempt[] {
  return Object.values(s.attempts)
    .filter((a) => a.sessionId === sessionId)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function selectErrorsFor(s: WorkbenchState, problemId?: string): ErrorRecord[] {
  return Object.values(s.errors)
    .filter((e) => !problemId || e.problemId === problemId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* the command layer (integration/commands.ts) writes proof.workbench.v1
   through localStorage and syncs the mounted store through this global —
   without it a command write is invisible to the live workbench and the
   next mutation rewrites the file from stale state. */
if (typeof window !== 'undefined') {
  (window as any).__proofWorkbenchStore = useWorkbench;
}
