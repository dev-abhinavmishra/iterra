// ── Rhythm entities ──────────────────────────────────────────────────────────
// Every record is a plain JSON object so the whole register serializes to one
// backup document. Suite-wide IDs (course_, deck_, evt_) survive deep links and
// exports; local records use the same `rty_*` prefix family.

export type ISODate = string; // 'YYYY-MM-DD' civil date, local timezone
export type ISODateTime = string; // ISO 8601 instant

// ── Routines ────────────────────────────────────────────────────────────────

/** How a routine is measured. 'check' = showed up; the rest carry an amount. */
export type RoutineMeasure = 'check' | 'count' | 'duration' | 'quantity';

export type RoutineStatus = 'active' | 'paused' | 'archived';

export interface RoutineTarget {
  /** Weekly target, in the measure's units (1 for check → "show up N days"). */
  perWeek: number;
  /** For count/duration/quantity: per-day amount that counts as a full mark. */
  perDay?: number;
}

export interface MinimumVersion {
  /** The smallest version that still counts — "open the deck" not "32 cards". */
  label: string;
  /** Reduced weekly target while running on minimums. Falls back to 1. */
  perWeek?: number;
}

export interface Routine {
  id: string;
  name: string;
  measure: RoutineMeasure;
  /** Unit label for amount measures: 'cards', 'pages', 'minutes'. */
  unit?: string;
  target: RoutineTarget;
  /** Weekdays the routine is scheduled for: 0=Sun … 6=Sat. Empty = any day. */
  weekdays: number[];
  minimum?: MinimumVersion;
  accent: RoutineAccent;
  courseId?: string;
  status: RoutineStatus;
  pausedAt?: ISODateTime;
  pauseReason?: string;
  /** Recorded pause intervals — closed on resume. Lets history show paused
      weeks as unjudged rather than silently blank. */
  pauses?: { from: ISODate; to?: ISODate }[];
  /** Optional quiet reminder window — a time range, never a push alarm. */
  windowStart?: string; // 'HH:MM'
  windowEnd?: string;
  createdAt: ISODateTime;
}

export type RoutineAccent =
  | 'indigo'
  | 'oxblood'
  | 'hunter'
  | 'ochre'
  | 'plum'
  | 'teal'
  | 'slate'
  | 'rust';

// ── Entries (the register rows) ─────────────────────────────────────────────

export type EntrySource = 'manual' | 'event';

export interface Entry {
  id: string;
  routineId: string;
  date: ISODate;
  /** Amount logged. For 'check' routines this is always 1. */
  value: number;
  /** Logged via the minimum version — still a real completion, smaller bar. */
  isMinimum?: boolean;
  /** Free note — private, stays local. */
  note?: string;
  /** Optional context tag: 'library', 'low-energy', 'laptop', course code… */
  context?: string;
  source: EntrySource;
  /** Set when source==='event'; the entry is derived, evidence-linked. */
  eventId?: string;
  createdAt: ISODateTime;
}

// ── Suite events (normalized, append-only) ──────────────────────────────────

export type SuiteApp =
  | 'timer'
  | 'flashcards'
  | 'ink'
  | 'proof'
  | 'syllabus'
  | 'gradestack'
  | 'modular'
  | 'other';

export type SuiteEventType =
  | 'timer.session.completed'
  | 'flashcards.review.completed'
  | 'ink.focus.completed'
  | 'proof.session.completed'
  | 'syllabus.weekly_review.completed'
  | 'gradestack.assessment.graded'
  | 'modular.note.created'
  | (string & {}); // forward-compatible: unknown types still stored

export interface RoutineEvent {
  id: string;
  type: SuiteEventType;
  occurredAt: ISODateTime;
  sourceApp: SuiteApp;
  durationSeconds?: number;
  courseId?: string;
  resourceId?: string;
  metrics?: Record<string, number>;
  /** When Rhythm received it — provenance, never the source's clock. */
  receivedAt: ISODateTime;
}

/**
 * A mapping from one event type onto one routine. Derived entries are marked
 * source:'event' and link back to the RoutineEvent they came from.
 */
export interface EventMapping {
  id: string;
  eventType: string; // exact match, or 'app.*' wildcard e.g. 'timer.*'
  routineId: string;
  /** How the entry's value is derived. */
  valueRule:
    | 'presence' // value = 1 (check routines)
    | 'duration' // value = durationSeconds / 60 (minutes)
    | 'metric'; // value = metrics[metricKey]
  metricKey?: string;
  enabled: boolean;
  createdAt: ISODateTime;
}

// ── Exceptions (travel/exam days — excluded, never falsified) ───────────────

export type ExceptionKind = 'travel' | 'exam' | 'sick' | 'break' | 'other';

export interface DayException {
  id: string;
  /** Which routine it exempts; 'all' exempts every routine that day. */
  routineId: string | 'all';
  date: ISODate;
  kind: ExceptionKind;
  note?: string;
  createdAt: ISODateTime;
}

// ── Friction log (why a routine was skipped) ────────────────────────────────

export type FrictionKind =
  | 'tired'
  | 'no-time'
  | 'location'
  | 'forgot'
  | 'sick'
  | 'avoided'
  | 'other';

export interface FrictionNote {
  id: string;
  routineId: string;
  date: ISODate;
  kind: FrictionKind;
  note?: string;
  createdAt: ISODateTime;
}

// ── Weekly review ───────────────────────────────────────────────────────────

export interface WeeklyReview {
  id: string;
  weekStart: ISODate;
  /** Routine ids confirmed as accurately recorded this week. */
  confirmed: string[];
  /** Free reflection — the prompt is shown, not stored verbatim. */
  reflection: string;
  /** The one adjustment chosen — plain text commitment. */
  adjustment?: string;
  createdAt: ISODateTime;
}

// ── Experiments (gentle, dated, reversible) ─────────────────────────────────

export type ExperimentStatus = 'active' | 'completed' | 'abandoned';

export interface Experiment {
  id: string;
  routineId: string;
  /** "If I review cards before dinner, I'll hit the target more weeks." */
  hypothesis: string;
  /** What changes — kept as plain text so nothing silently reschedules. */
  change: string;
  startDate: ISODate;
  endDate: ISODate;
  status: ExperimentStatus;
  /** Filled at review: what the student concluded. */
  outcome?: string;
  createdAt: ISODateTime;
}

// ── Courses (light projection — context for tags/filters) ───────────────────

export interface CourseRef {
  id: string;
  name: string;
  code?: string;
  createdAt: ISODateTime;
}

// ── Settings ────────────────────────────────────────────────────────────────

export interface AppSettings {
  weekStartsOn: 0 | 1; // Sunday or Monday
  motion: 'full' | 'reduced';
  // Suite base URLs — used to render "where to connect" links in Connections.
  timerBaseUrl: string;
  inkBaseUrl: string;
  modularBaseUrl: string;
  flashcardsBaseUrl: string;
  gradestackBaseUrl: string;
  syllabusBaseUrl: string;
  proofBaseUrl: string;
}

// ── The whole register ──────────────────────────────────────────────────────

export interface RegisterData {
  routines: Record<string, Routine>;
  entries: Record<string, Entry>;
  events: Record<string, RoutineEvent>;
  mappings: Record<string, EventMapping>;
  exceptions: Record<string, DayException>;
  friction: Record<string, FrictionNote>;
  reviews: Record<string, WeeklyReview>; // keyed by weekStart via id
  experiments: Record<string, Experiment>;
  courses: Record<string, CourseRef>;
  settings: AppSettings;
}

export const BACKUP_VERSION = 1;

export interface RegisterBackup {
  app: 'rhythm';
  version: number;
  exportedAt: ISODateTime;
  data: RegisterData;
}
