// ── Proof data model ─────────────────────────────────────────────────────────
// Local-first practice workbench. Everything persists under one zustand store;
// documents are Markdown + $LaTeX$ with optional data-URL attachments.

export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string;

// ── attachments ──
export interface Attachment {
  id: string;
  name: string;
  mime: string; // 'image/png' | 'image/jpeg' | ...
  dataUrl: string;
}

// ── work steps — a learner's attempt is an ordered list of steps ──
export interface DrawPath {
  d: string; // SVG path data
  w: number; // stroke width
}
export interface WorkStep {
  id: string;
  text: string; // markdown + $latex$
  drawing?: DrawPath[]; // freehand marks on this step
  attachments?: Attachment[];
  drawH?: number; // canvas height the drawing was made at (for viewBox scaling)
  drawW?: number;
}

// ── courses — light registry, mirrors the suite's course notion ──
export type CourseColor =
  | 'oxblood' | 'hunter' | 'navy' | 'ochre' | 'plum' | 'teal' | 'slate' | 'rust';

export interface Course {
  id: string;
  code: string;
  name: string;
  color: CourseColor;
  createdAt: ISODateTime;
  archived: boolean;
}

// ── answer specs — the layered deterministic checker ──
export type AnswerSpec =
  | { kind: 'exact'; expected: string; caseSensitive?: boolean }
  | { kind: 'numeric'; value: number; tolerance?: number; relTolerance?: number; unit?: string }
  | { kind: 'expression'; expected: string; vars?: string[] } // symbolic via sampling
  | { kind: 'choice'; options: string[]; correct: number[] } // indexes; 1 = single
  | { kind: 'steps'; steps: string[] } // ordered expected milestones, self-checked
  | { kind: 'rubric'; rubricId: string }
  | { kind: 'open' };

export type HintLevel = 0 | 1 | 2 | 3 | 4;
// ladder: 1 concept cue → 2 setup cue → 3 next-step cue → 4 worked solution

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export interface Problem {
  id: string;
  courseId?: string;
  topic: string; // free-form topic bucket, e.g. 'kinematics', 'integration by parts'
  promptDoc: string;
  answerSpec: AnswerSpec;
  workedSolutionDoc: string;
  hints: string[]; // [concept, setup, nextStep] — level 4 is workedSolutionDoc
  tags: string[];
  difficulty: Difficulty;
  source?: string; // 'textbook ch.4', 'worksheet', 'gradestack', ...
  attachments: Attachment[];
  createdAt: ISODateTime;
  archived: boolean;
}

// ── attempts ──
export type AttemptResult = 'correct' | 'partial' | 'incorrect';

export interface Attempt {
  id: string;
  problemId: string;
  sessionId?: string;
  startedAt: ISODateTime;
  submittedAt?: ISODateTime;
  work: WorkStep[];
  answer?: string; // learner's final-answer text (exact/numeric/expression/open)
  answerChoice?: number[]; // picked option indexes (choice)
  stepsChecked?: boolean[]; // self-check marks vs answerSpec.steps
  rubricScores?: Record<string, number>; // criterionId → level index
  confidence: number; // 1–5, recorded before submission
  result?: AttemptResult;
  resultSource?: 'auto' | 'self';
  hintLevel: HintLevel; // deepest ladder level revealed
  hintReveals: { level: HintLevel; at: ISODateTime }[];
  timerMinutes?: number; // actual focus minutes filed back from Timer
}

// ── error ledger ──
export type ErrorCategory =
  | 'conceptual-gap'
  | 'wrong-strategy'
  | 'algebra-arithmetic'
  | 'misread-prompt'
  | 'incomplete-explanation'
  | 'careless-execution'
  | 'none'
  | 'custom';

export interface ErrorRecord {
  id: string;
  attemptId: string;
  problemId: string;
  category: ErrorCategory;
  customLabel?: string;
  divergence: string; // 'where did your approach diverge?'
  repairCue: string; // 'what cue should you notice next time?'
  divergentSteps: number[]; // work-step indexes marked divergent in compare
  createdAt: ISODateTime;
}

// ── practice sessions ──
export interface SessionRules {
  courseIds: string[]; // empty = all
  topics: string[]; // empty = all
  minDifficulty: Difficulty;
  maxDifficulty: Difficulty;
  minutes: number; // target duration
  newRatio: number; // 0–1 share of unseen problems vs retries
  order: 'blocked' | 'interleaved';
}

export interface PracticeSession {
  id: string;
  rules: SessionRules;
  problemIds: string[];
  startedAt: ISODateTime;
  completedAt?: ISODateTime;
  timerUrl?: string;
  timerMinutes?: number;
  intent?: string; // session label (e.g. from Syllabus)
}

// ── retry scheduling ──
export interface ReviewState {
  problemId: string;
  dueAt: ISODateTime;
  interval: number; // days
  stability: number; // successful retrievals in a row
  lapses: number;
  lastResult: AttemptResult;
  lastAttemptId: string;
}

// ── rubrics ──
export interface RubricCriterion {
  id: string;
  text: string;
  requiredEvidence?: string;
}
export interface Rubric {
  id: string;
  title: string;
  criteria: RubricCriterion[];
  levels: string[]; // e.g. ['missing', 'partial', 'met']
  scoringMode: 'all-or-nothing' | 'weighted';
  createdAt: ISODateTime;
}

// ── settings ──
export interface AppSettings {
  timerBaseUrl: string;
  inkBaseUrl: string;
  modularBaseUrl: string;
  flashcardsBaseUrl: string;
  syllabusBaseUrl: string;
  gradestackBaseUrl: string;
  motion: 'full' | 'reduced';
  defaultSessionMinutes: number;
}

export interface WorkbenchData {
  problems: Record<string, Problem>;
  attempts: Record<string, Attempt>;
  errors: Record<string, ErrorRecord>;
  sessions: Record<string, PracticeSession>;
  reviews: Record<string, ReviewState>; // keyed by problemId
  rubrics: Record<string, Rubric>;
  courses: Record<string, Course>;
  settings: AppSettings;
}
