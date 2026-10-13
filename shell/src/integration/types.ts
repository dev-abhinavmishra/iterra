/* ── Iterra Cross-Module Integration Types ──────────────────────────────────
   Shared identity, authoritative resolution, relationships, provenance,
   commands/events, continuous workflow context, and course workspace chains. */

export type ObjectType =
  | 'course'
  | 'term'
  | 'topic'
  | 'note'
  | 'material'
  | 'source'
  | 'deck'
  | 'card'
  | 'quiz'
  | 'problem'
  | 'attempt'
  | 'block'
  | 'commitment'
  | 'session'
  | 'assessment'
  | 'grade'
  | 'followup'
  | 'task'
  | 'routine'
  | 'entry'
  | 'experiment';

export interface ObjectRef {
  key: string; // '<app>:<type>:<id>'
  app: string;
  type: ObjectType | string;
  id: string;
  courseId?: string;
  course?: string;
  topic?: string;
  title?: string;
  url?: string;
}

/** Explicit distinction between authoritative module data, derived indexes,
    UI summaries, and transient state (§1). */
export type StateTier =
  | 'authoritative'
  | 'derived_index'
  | 'ui_summary'
  | 'transient';

export type ObjectStatus =
  | 'ok'
  | 'trashed'
  | 'archived'
  | 'deleted'
  | 'missing';

export interface ObjectRecovery {
  canRestore: boolean;
  label: string;
  reason: string;
  fallbackUrl: string;
  restore?: () => Promise<boolean> | boolean;
}

export interface ResolvedObject {
  status: ObjectStatus;
  tier: StateTier;
  key: string;
  app: string;
  type: string;
  id: string;
  title: string;
  sub?: string;
  courseId?: string;
  course?: string;
  topic?: string;
  url: string;
  revision?: string | number;
  contentHash?: string;
  contentText?: string;
  raw?: unknown;
  entity?: Record<string, unknown> | null;
  recovery?: ObjectRecovery;
}

export type RelationshipKind =
  | 'derivedFrom'
  | 'scheduledFor'
  | 'practicedIn'
  | 'assessedBy'
  | 'followUpFor'
  | 'related';

export interface SourceBlockExcerpt {
  index: number;
  heading?: string;
  text: string;
  blockId?: string;
}

export type SessionOutcomeKind =
  | 'completed'
  | 'partial'
  | 'canceled'
  | 'interrupted';

export interface RelationshipMeta {
  fromTitle?: string;
  fromUrl?: string;
  toTitle?: string;
  toUrl?: string;
  /* Provenance for source-derived objects */
  sourceKey?: string;
  sourceRevision?: number | string;
  sourceContentHash?: string;
  sourceSnapshot?: string;
  excerpt?: string;
  selectedBlocks?: SourceBlockExcerpt[];
  acknowledgedRevision?: number | string;
  acknowledgedHash?: string;
  initialCardFingerprints?: string[];
  /* Practice / timer session outcomes */
  outcome?: SessionOutcomeKind;
  elapsedSeconds?: number;
  elapsedMinutes?: number;
  plannedMinutes?: number;
  confirmedByUser?: boolean;
  /* Assessment / follow-up context */
  topics?: string[];
  questionNumbers?: number[];
  reason?: string;
  attemptId?: string;
  problemId?: string;
  assessmentId?: string;
  [k: string]: unknown;
}

export interface RelationshipRecord {
  key: string;
  from: string;
  to: string;
  kind: string;
  canonicalKind: RelationshipKind;
  by?: string;
  at: number;
  updatedAt?: number;
  courseId?: string;
  course?: string;
  topic?: string;
  workflowId?: string;
  meta?: RelationshipMeta;
}

export interface CandidateCard {
  id?: string;
  q: string;
  a: string;
  ex?: string;
  sourceBlockIndex?: number;
  sourceExcerpt?: string;
}

export interface SourceFreshnessReport {
  targetKey: string;
  sourceKey: string;
  relationshipKey: string;
  status: 'fresh' | 'sourceChanged' | 'sourceTrashed' | 'sourceMissing';
  derivedRevision?: number | string;
  currentRevision?: number | string;
  derivedHash?: string;
  currentHash?: string;
  acknowledgedRevision?: number | string;
  sourceTitle: string;
  sourceUrl: string;
  sourceSnapshot: string;
  currentContent: string;
  addedExcerpts: string[];
  removedExcerpts: string[];
  proposedNewCards: CandidateCard[];
  userEditedCardCount: number;
  totalCardCount: number;
}

export interface FollowUpTask {
  id: string;
  key: string; // '<app>:followup:<id>'
  app: string;
  title: string;
  detail?: string;
  status: 'open' | 'scheduled' | 'completed' | 'dismissed';
  courseId?: string;
  course?: string;
  topic?: string;
  sourceRef: string; // e.g. 'proof:attempt:a1' or 'gradestack:assessment:t1'
  targetRef?: string; // e.g. 'proof:problem:p1' or 'flashcards:deck:d1'
  scheduledBlockRef?: string; // 'syllabus:block:b1'
  createdAt: number;
  updatedAt: number;
  meta?: Record<string, unknown>;
}

export interface ActiveSessionContext {
  sessionId: string;
  blockRef?: string | null;
  blockId?: string | null;
  commitmentId?: string | null;
  materialRef?: string | null;
  materialTitle?: string | null;
  materialUrl?: string | null;
  courseId?: string | null;
  course?: string | null;
  topic?: string | null;
  workflowId?: string | null;
  label: string;
  startedAt: number;
  plannedMinutes: number;
  running: boolean;
  paused?: boolean;
  endsAt?: number;
  remainingSec?: number;
  from?: string;
  returnUrl?: string;
}

export interface WorkflowHandoff {
  id: string;
  workflowId: string;
  fromApp: string;
  toApp: string;
  action: string;
  sourceRef?: ObjectRef | null;
  targetRef?: ObjectRef | null;
  courseId?: string | null;
  course?: string | null;
  topic?: string | null;
  plannedBlockRef?: ObjectRef | null;
  createdAt: number;
}

export interface WorkflowContext {
  currentObject?: ObjectRef | null;
  /** Explicit course/topic carried by an active object or handoff — never
      silently set from passive browsing of a course dossier (§6). */
  courseId?: string | null;
  course?: string | null;
  topic?: string | null;
  originatingWorkflow?: {
    id: string;
    name: string;
    startedAt: number;
    rootRef?: ObjectRef | null;
    chain: ObjectRef[];
  } | null;
  plannedBlock?: ObjectRef | null;
  activeSession?: ActiveSessionContext | null;
  lastHandoff?: WorkflowHandoff | null;
  updatedAt: number;
  updatedBy?: string;
}

export interface CommandResult<T = Record<string, unknown>> {
  ok: boolean;
  commandId: string;
  deduplicated?: boolean;
  ref?: string;
  entity?: Record<string, unknown>;
  relationships?: RelationshipRecord[];
  event?: Record<string, unknown>;
  url?: string;
  data?: T;
  code?: string;
  error?: string;
}

export interface WorkspaceChainStep {
  role: 'source' | 'material' | 'deck' | 'problem' | 'attempt' | 'assessment' | 'followup' | 'block' | 'session' | 'outcome';
  ref: string;
  app: string;
  type: string;
  id: string;
  title: string;
  sub?: string;
  url: string;
  status: ObjectStatus;
  courseId?: string;
  course?: string;
  topic?: string;
  relationshipKind?: RelationshipKind;
  meta?: RelationshipMeta;
  sourceChanged?: boolean;
  outcome?: SessionOutcomeKind;
  elapsedMinutes?: number;
}

export interface WorkspaceChain {
  id: string;
  kind: 'note-deck-block-session' | 'proof-retry-block' | 'assessment-review' | 'material-study';
  title: string;
  courseId?: string;
  course?: string;
  topic?: string;
  steps: WorkspaceChainStep[];
  updatedAt: number;
  complete: boolean;
}

export interface WorkspaceExportBundle {
  format: 'iterra-workspace-bundle';
  version: number;
  exportedAt: string;
  schemaVersion: number;
  entities: Record<string, unknown>[];
  relationships: RelationshipRecord[];
  followUps: FollowUpTask[];
  context: WorkflowContext | null;
}
