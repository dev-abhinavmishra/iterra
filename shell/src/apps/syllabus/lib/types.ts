// ── Syllabus entities ────────────────────────────────────────────────────────
// Every record is a plain JSON object so the whole folio serializes to one
// backup document. IDs are shared across apps (Timer blocks, Ink notes).

export type ISODate = string; // 'YYYY-MM-DD' (civil date, term timezone)
export type ISODateTime = string; // ISO 8601 instant

export interface Term {
  id: string;
  name: string;
  startDate: ISODate;
  endDate: ISODate;
  timezone: string;
  createdAt: ISODateTime;
}

export interface Course {
  id: string;
  termId: string;
  name: string;
  code: string;
  instructor?: string;
  color: CourseColor;
  meetingPattern?: string; // free text, e.g. 'MWF 09:10–10:00 · Rm 214'
  targetGrade?: string; // 'A', '93', etc. — display only
  archived: boolean;
  createdAt: ISODateTime;
}

export type CourseColor =
  | 'oxblood'
  | 'hunter'
  | 'navy'
  | 'ochre'
  | 'plum'
  | 'teal'
  | 'slate'
  | 'rust';

export type CommitmentType =
  | 'assignment'
  | 'exam'
  | 'quiz'
  | 'reading'
  | 'project'
  | 'lab'
  | 'custom';

export type CommitmentStatus = 'open' | 'done' | 'dropped';

export interface Commitment {
  id: string;
  courseId: string;
  type: CommitmentType;
  title: string;
  detail?: string;
  dueAt: ISODateTime; // when it is due (usually a class time or end of day)
  weight: number; // 0–100 — grade weight or user importance
  estimatedMinutes: number; // total remaining effort the student predicts
  loggedMinutes: number; // effort actually recorded against it
  status: CommitmentStatus;
  grade?: number; // 0–100 score, entered when the work is filed/returned
  recurrence?: 'weekly'; // filing done spawns the next instance at due+7d
  pinned: boolean; // user-marked urgency
  dependencies: string[]; // commitment ids that must be done first
  lastWorkedAt?: ISODateTime; // last completed block touching this commitment
  createdAt: ISODateTime;
  completedAt?: ISODateTime;
}

export type BlockState = 'proposed' | 'planned' | 'in-progress' | 'done' | 'deferred' | 'missed';

export type BlockPhase =
  | 'work' // generic effort
  | 'review' // revisit material
  | 'practice' // drills / past papers
  | 'draft' // produce an artifact
  | 'outline' // plan an artifact
  | 'read' // consume assigned material
  | 'check'; // final check / proofread

export interface WorkBlock {
  id: string;
  commitmentId: string;
  plannedDate: ISODate; // civil date the block is booked for
  plannedStart: string; // 'HH:MM' local
  plannedMinutes: number;
  actualMinutes?: number;
  state: BlockState;
  phase: BlockPhase;
  label?: string; // e.g. 'practice exam' — shown on the slip
  reasons: string[]; // plain-language score explanation, stamped at plan time
  score: number; // score at plan time, for inspection
  carriedFrom?: ISODate; // original date when a missed/deferred block moves
  deferNote?: string; // student's reason for deferring
  deferCount: number; // how many times this block slipped
  order: number; // position within the day
  createdAt: ISODateTime;
  completedAt?: ISODateTime;
  timerSessionUrl?: string; // the deep link that launched it
}

export type LinkedApp = 'timer' | 'ink' | 'modular' | 'flashcards' | 'gradestack' | 'other';

export interface ResourceLink {
  id: string;
  commitmentId?: string;
  courseId?: string;
  app: LinkedApp;
  resourceType: string; // 'note' | 'deck' | 'source' | 'assessment' | 'url'
  resourceId?: string;
  label: string;
  deepLink: string; // absolute URL
  createdAt: ISODateTime;
}

export interface Review {
  weekStart: ISODate; // Monday
  plannedMinutes: number;
  actualMinutes: number;
  carryovers: string[]; // block ids carried into next week
  notes: string;
  completedCommitments: string[];
  estimateRatio?: number; // actual / planned over the week
  createdAt: ISODateTime;
}

export interface AppSettings {
  timerBaseUrl: string;
  inkBaseUrl: string;
  modularBaseUrl: string;
  flashcardsBaseUrl: string;
  gradestackBaseUrl: string;
  studyWindowStart: string; // 'HH:MM' — where new blocks start stacking
  maxBlockMinutes: number; // split cap for generated blocks
  defaultAvailableMinutes: number;
  weekStartsOn: 1 | 0; // Monday | Sunday
  motion: 'full' | 'reduced'; // 'reduced' forces reduced-motion off? no: user pref
  remindersEnabled?: boolean; // optional browser notifications — never required
}

export interface FolioData {
  terms: Record<string, Term>;
  activeTermId?: string;
  courses: Record<string, Course>;
  commitments: Record<string, Commitment>;
  blocks: Record<string, WorkBlock>;
  links: Record<string, ResourceLink>;
  reviews: Record<string, Review>; // keyed by weekStart
  settings: AppSettings;
  dismissed: Record<string, string[]>; // dateISO -> commitment ids declined for that day
}

export const BACKUP_FORMAT = 'syllabus-folio';
export const BACKUP_VERSION = 1;

export interface FolioBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: ISODateTime;
  data: FolioData;
}
