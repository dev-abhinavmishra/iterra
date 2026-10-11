// ── The registrar's scheduling engine ────────────────────────────────────────
// Deliberately inspectable: every score decomposes into named factors and every
// proposed block carries the plain-language reasons that produced it. No hidden
// model, no magic — a student can read why the folio recommended each block and
// override any of it.

import type { Commitment, Course, WorkBlock, BlockPhase, ISODate } from './types';
import {
  addDaysISO,
  daysUntil,
  diffDaysISO,
  dueDateISO,
  fromISODate,
  toISODate,
  clamp,
  roundTo,
  fmtMinutes,
} from './utils';

export interface ScoreFactor {
  key:
    | 'deadline'
    | 'effort'
    | 'weight'
    | 'neglect'
    | 'pinned'
    | 'dependency'
    | 'late';
  label: string; // shown under the block slip
  points: number;
}

export interface ScoredCommitment {
  commitment: Commitment;
  score: number;
  factors: ScoreFactor[];
  blockedBy?: Commitment;
  reason: string; // one-line summary built from dominant factors
}

export interface ProposedBlock {
  commitmentId: string;
  plannedDate: ISODate;
  plannedStart: string;
  plannedMinutes: number;
  phase: BlockPhase;
  label: string;
  reasons: string[];
  score: number;
  late: boolean;
}

const W = {
  deadline: 40,
  effort: 20,
  weight: 20,
  neglect: 12,
  pinned: 15,
  late: 60,
} as const;

export function remainingMinutes(c: Commitment): number {
  return Math.max(0, c.estimatedMinutes - c.loggedMinutes);
}

export function isBlocked(c: Commitment, all: Record<string, Commitment>): Commitment | undefined {
  for (const depId of c.dependencies) {
    const dep = all[depId];
    if (dep && dep.status !== 'done' && dep.status !== 'dropped') return dep;
  }
  return undefined;
}

/**
 * Score one commitment against today. Returns the factor breakdown so the UI
 * can show exactly which pressures produced the score.
 */
export function scoreCommitment(
  c: Commitment,
  opts: {
    today: ISODate;
    all: Record<string, Commitment>;
    courseById: Record<string, Course>;
    recentDays?: number;
  },
): ScoredCommitment {
  const { today, all } = opts;
  const factors: ScoreFactor[] = [];
  const due = dueDateISO(c.dueAt);
  const dUntil = diffDaysISO(today, due);
  const remain = remainingMinutes(c);

  // ── Deadline proximity: ramps as the due date approaches, maxed when late.
  let deadlinePts = 0;
  if (dUntil < 0) {
    factors.push({ key: 'late', label: `overdue by ${-dUntil}d`, points: W.late });
  } else {
    // 0d→1.0, 1d→0.9, 2d→0.75, 3d→0.6, 7d→0.3, 14d→0.1
    const ramp = dUntil === 0 ? 1 : dUntil === 1 ? 0.9 : clamp(1.15 - dUntil * 0.12, 0.08, 1);
    deadlinePts = Math.round(W.deadline * ramp);
    if (dUntil <= 3) factors.push({ key: 'deadline', label: `due in ${dUntil}d`, points: deadlinePts });
  }

  // ── Remaining effort: lots of work left near the deadline needs a start now.
  if (remain > 0) {
    // effort pressure grows when remaining work can't fit in days left
    const daysLeft = Math.max(dUntil, 0);
    const fitDays = Math.ceil(remain / 90); // ~1.5h chunks
    const pressure = daysLeft === 0 ? 1 : clamp(fitDays / Math.max(daysLeft, 1), 0.2, 1);
    const pts = Math.round(W.effort * pressure);
    factors.push({ key: 'effort', label: `${remain} min remain`, points: pts });
  }

  // ── Weight: high-stakes work gets seen early.
  if (c.weight >= 15) {
    const pts = Math.round(W.weight * clamp(c.weight / 40, 0.3, 1));
    factors.push({ key: 'weight', label: `weight ${c.weight}`, points: pts });
  }

  // ── Neglect: opened commitments untouched for a while drift up.
  if (c.lastWorkedAt) {
    const idle = diffDaysISO(c.lastWorkedAt.slice(0, 10), today);
    if (idle >= 4 && remain > 0) {
      factors.push({ key: 'neglect', label: `untouched ${idle}d`, points: Math.min(W.neglect, idle) });
    }
  } else if (remain > 0) {
    const age = diffDaysISO(c.createdAt.slice(0, 10), today);
    if (age >= 5) {
      factors.push({ key: 'neglect', label: `never started (${age}d old)`, points: Math.min(W.neglect, Math.round(age * 0.6)) });
    }
  }

  if (c.pinned) factors.push({ key: 'pinned', label: 'pinned by you', points: W.pinned });

  const blockedBy = isBlocked(c, all);
  if (blockedBy) {
    factors.push({ key: 'dependency', label: `blocked by “${blockedBy.title}”`, points: -80 });
  }

  const score = factors.reduce((s, f) => s + f.points, 0);
  const reason = buildReason(c, factors, dUntil, remain);
  return { commitment: c, score, factors, blockedBy, reason };
}

function buildReason(c: Commitment, factors: ScoreFactor[], dUntil: number, remain: number): string {
  const parts: string[] = [];
  const lateF = factors.find((f) => f.key === 'late');
  if (lateF) parts.push(`Overdue by ${-dUntil} day${-dUntil === 1 ? '' : 's'}`);
  else if (dUntil === 0) parts.push('Due today');
  else if (dUntil === 1) parts.push('Due tomorrow');
  else if (dUntil <= 4) parts.push(`Due in ${dUntil} days`);
  if (remain > 0) parts.push(`${remain} min remain`);
  const weight = factors.find((f) => f.key === 'weight');
  if (weight && c.type === 'exam') parts.push('high-weight exam');
  else if (weight) parts.push(`weight ${c.weight}`);
  const neglect = factors.find((f) => f.key === 'neglect');
  if (neglect && !lateF) parts.push(neglect.label);
  if (c.pinned) parts.push('pinned');
  if (parts.length === 0) return 'Low pressure — fills spare time';
  return parts.join('; ');
}

export function defaultPhase(c: Commitment): BlockPhase {
  switch (c.type) {
    case 'exam':
    case 'quiz':
      return 'practice';
    case 'project':
      return 'draft';
    case 'reading':
      return 'read';
    default:
      return 'work';
  }
}

export function phaseLabel(phase: BlockPhase, c: Commitment): string {
  const base: Record<BlockPhase, string> = {
    work: 'work',
    review: 'review',
    practice: c.type === 'quiz' ? 'drill' : 'practice',
    draft: 'draft',
    outline: 'outline',
    read: 'reading',
    check: 'final check',
  };
  return base[phase];
}

/**
 * Rank open commitments and cut the day's proposed blocks. Pure function — the
 * view persists accepted proposals as WorkBlocks.
 */
export function planDay(opts: {
  today: ISODate;
  availableMinutes: number;
  commitments: Commitment[];
  all: Record<string, Commitment>;
  courseById: Record<string, Course>;
  blocksOnDay: WorkBlock[];
  dismissedIds: Set<string>;
  startTime: string; // 'HH:MM'
  maxBlock: number;
}): { proposals: ProposedBlock[]; plannedTotal: number; unmet: number } {
  const { today, availableMinutes, commitments, all, courseById, blocksOnDay, dismissedIds, startTime, maxBlock } = opts;

  const bookedMinutes = blocksOnDay
    .filter((b) => b.state === 'planned' || b.state === 'in-progress' || b.state === 'done')
    .reduce((s, b) => s + b.plannedMinutes, 0);
  let budget = Math.max(0, availableMinutes - bookedMinutes);

  const scored = commitments
    .filter((c) => c.status === 'open' && !dismissedIds.has(c.id) && remainingMinutes(c) > 0)
    .map((c) => scoreCommitment(c, { today, all, courseById }))
    .filter((s) => !s.blockedBy)
    .sort((a, b) => b.score - a.score || a.commitment.dueAt.localeCompare(b.commitment.dueAt));

  // Cursor stacks new proposals after the last booked block of the day.
  let cursor = startTime;
  for (const b of blocksOnDay) {
    if (b.plannedStart >= cursor && (b.state === 'planned' || b.state === 'in-progress')) {
      const end = addMinutesHHMM(b.plannedStart, b.plannedMinutes + 10);
      if (end > cursor) cursor = end;
    }
  }

  // Effort already booked today counts toward the commitment's need — the
  // registrar never re-proposes work it just scheduled.
  const bookedToday = new Map<string, number>();
  for (const b of blocksOnDay) {
    if (b.state === 'planned' || b.state === 'in-progress') {
      bookedToday.set(b.commitmentId, (bookedToday.get(b.commitmentId) ?? 0) + b.plannedMinutes);
    }
  }

  const proposals: ProposedBlock[] = [];
  let unmet = 0;

  for (const s of scored) {
    if (budget <= 0) break;
    const c = s.commitment;
    let remain = Math.max(0, remainingMinutes(c) - (bookedToday.get(c.id) ?? 0));
    if (remain <= 0) continue;
    const late = diffDaysISO(today, dueDateISO(c.dueAt)) < 0;

    while (remain > 0 && budget > 0) {
      const chunk = Math.min(remain, maxBlock, roundTo(budget, 15) || budget);
      if (chunk < 15) break;
      const minutes = roundTo(chunk, 15) || chunk;
      const phase = defaultPhase(c);
      proposals.push({
        commitmentId: c.id,
        plannedDate: today,
        plannedStart: cursor,
        plannedMinutes: minutes,
        phase,
        label: phaseLabel(phase, c),
        reasons: [s.reason],
        score: s.score,
        late,
      });
      cursor = addMinutesHHMM(cursor, minutes + 10); // 10-min changeover between slips
      budget -= minutes;
      remain -= minutes;
    }
    if (remain > 0) unmet += remain;
  }

  return { proposals, plannedTotal: bookedMinutes, unmet };
}

function addMinutesHHMM(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + min;
  return `${String(Math.floor((total / 60) % 24)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ── Reverse planning ─────────────────────────────────────────────────────────
// Backwards-design from the due date: phases land latest-first so the final
// check always sits closest to the deadline.

const PHASE_TEMPLATES: Record<string, { phase: BlockPhase; frac: number }[]> = {
  exam: [
    { phase: 'check', frac: 0.15 },
    { phase: 'practice', frac: 0.35 },
    { phase: 'review', frac: 0.5 },
  ],
  quiz: [
    { phase: 'check', frac: 0.15 },
    { phase: 'practice', frac: 0.85 },
  ],
  project: [
    { phase: 'check', frac: 0.15 },
    { phase: 'draft', frac: 0.55 },
    { phase: 'outline', frac: 0.3 },
  ],
  reading: [
    { phase: 'review', frac: 0.2 },
    { phase: 'read', frac: 0.8 },
  ],
  lab: [
    { phase: 'check', frac: 0.2 },
    { phase: 'work', frac: 0.8 },
  ],
  assignment: [
    { phase: 'check', frac: 0.15 },
    { phase: 'work', frac: 0.85 },
  ],
  custom: [
    { phase: 'check', frac: 0.15 },
    { phase: 'work', frac: 0.85 },
  ],
};

export function reversePlan(
  c: Commitment,
  opts: { today: ISODate; startTime: string; maxBlock: number },
): ProposedBlock[] {
  const template = PHASE_TEMPLATES[c.type] ?? PHASE_TEMPLATES.custom;
  const due = dueDateISO(c.dueAt);
  const remain = remainingMinutes(c);
  if (remain <= 0) return [];

  // How many days do we have? Spread across up to `span` days before due.
  const daysLeft = Math.max(0, diffDaysISO(opts.today, due));
  const span = clamp(Math.ceil(remain / opts.maxBlock), 1, Math.max(daysLeft + 1, 1));

  const blocks: ProposedBlock[] = [];
  // Latest phase lands on min(due - 1, today + span - 1); earlier phases fill backwards.
  let cursorDay = Math.min(daysLeft === 0 ? 0 : daysLeft - 1, span - 1);

  for (const step of template) {
    let minutes = Math.max(15, roundTo(remain * step.frac, 15));
    while (minutes > 0) {
      const chunk = Math.min(minutes, opts.maxBlock);
      const date = addDaysISO(opts.today, Math.max(0, cursorDay));
      blocks.push({
        commitmentId: c.id,
        plannedDate: date,
        plannedStart: opts.startTime,
        plannedMinutes: chunk,
        phase: step.phase,
        label: phaseLabel(step.phase, c),
        reasons: [
          `Reverse plan for “${c.title}” — ${step.phase} before ${due === date ? 'due date' : 'deadline'}`,
        ],
        score: 0,
        late: false,
      });
      minutes -= chunk;
      cursorDay -= 1;
      if (cursorDay < 0 && minutes > 0) {
        // Out of runway: stack remaining chunks on today, flagged honestly.
        cursorDay = 0;
      }
    }
  }

  // Order earliest-first.
  return blocks.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.plannedStart.localeCompare(b.plannedStart));
}

// ── Missed-block detection ───────────────────────────────────────────────────
// A planned/in-progress block whose day has passed without completion is
// missed. It is never deleted or silently moved — the Today desk surfaces it
// for explicit re-booking.

export function missedBlocks(blocks: WorkBlock[], today: ISODate): WorkBlock[] {
  return blocks
    .filter((b) => (b.state === 'planned' || b.state === 'in-progress') && b.plannedDate < today)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
}

// ── Effort calibration ───────────────────────────────────────────────────────
export function estimateRatio(blocks: WorkBlock[], courseId?: string, commitments?: Record<string, Commitment>): number | null {
  const done = blocks.filter((b) => {
    if (b.state !== 'done' || b.actualMinutes == null || b.actualMinutes <= 0) return false;
    if (courseId && commitments) return commitments[b.commitmentId]?.courseId === courseId;
    return true;
  });
  if (done.length < 3) return null;
  const planned = done.reduce((s, b) => s + b.plannedMinutes, 0);
  const actual = done.reduce((s, b) => s + (b.actualMinutes ?? 0), 0);
  return planned > 0 ? actual / planned : null;
}

export function isoWeekBounds(weekStart: ISODate): { start: Date; end: Date } {
  const start = fromISODate(weekStart);
  const end = fromISODate(addDaysISO(weekStart, 7));
  return { start, end };
}

export { toISODate, fromISODate, addDaysISO, daysUntil };

// ── Grade scenarios ──────────────────────────────────────────────────────────
// Weighted-average standing + "what you need on what's left" math for the
// syllabus's §1 Evaluation. Grades are 0–100 scores entered manually on filed
// commitments (GradeStack results arrive as V1 links).

/** Parse a target grade to a percent threshold: numeric strings pass through,
 *  letter grades map to common US cutoffs. Null when unparseable. */
export function targetPercent(targetGrade?: string): number | null {
  if (!targetGrade) return null;
  const t = targetGrade.trim().toUpperCase();
  const n = Number(t);
  if (Number.isFinite(n) && n > 0) return Math.min(100, n);
  const cutoffs: Record<string, number> = {
    'A+': 97, A: 93, 'A-': 90,
    'B+': 87, B: 83, 'B-': 80,
    'C+': 77, C: 73, 'C-': 70,
    'D+': 67, D: 63, 'D-': 60,
  };
  return cutoffs[t] ?? null;
}

export interface GradeScenario {
  gradedWeight: number;    // pts of course weight already graded
  standing: number;        // weighted average of graded items (0–100)
  remainingWeight: number; // pts of declared weight still open/ungraded
  target: number | null;   // parsed target percent
  needed: number | null;   // avg needed on remainingWeight to hold target
  secured: boolean;        // needed <= 0
  reachable: boolean;      // needed <= 100
}

export function gradeScenario(commitments: Commitment[], targetGrade?: string): GradeScenario | null {
  const graded = commitments.filter((c) => c.grade != null && c.weight > 0);
  if (graded.length === 0) return null;
  const gradedWeight = graded.reduce((s, c) => s + c.weight, 0);
  const standing = graded.reduce((s, c) => s + c.weight * (c.grade ?? 0), 0) / gradedWeight;
  const remainingWeight = commitments
    .filter((c) => c.grade == null && c.weight > 0 && c.status !== 'dropped')
    .reduce((s, c) => s + c.weight, 0);
  const target = targetPercent(targetGrade);
  let needed: number | null = null;
  if (target != null && remainingWeight > 0) {
    needed = (target * (gradedWeight + remainingWeight) - standing * gradedWeight) / remainingWeight;
  }
  return {
    gradedWeight,
    standing,
    remainingWeight,
    target,
    needed,
    secured: needed != null && needed <= 0,
    reachable: needed == null || needed <= 100,
  };
}

// ── Risk indicators ─────────────────────────────────────────────────────────
// Plain-language verdict on an open commitment: deadline + unfinished effort
// + grade weight + recent neglect. Late work is surfaced separately (red row)
// — this flags work that can still be saved.
export function riskReason(c: Commitment, today: ISODate, all: Record<string, Commitment>): string | null {
  if (c.status !== 'open') return null;
  const remain = remainingMinutes(c);
  if (remain <= 0) return null;
  const due = dueDateISO(c.dueAt);
  const dUntil = diffDaysISO(today, due);
  if (dUntil < 0) return null; // already late — the red row says it

  if (isBlocked(c, all)) return null; // the dependency hold explains itself

  const daysLeft = Math.max(dUntil, 0);
  const fitDays = Math.ceil(remain / 90);
  if (daysLeft > 0 && fitDays > daysLeft) {
    return `~${fitDays} work days needed, ${daysLeft}d left`;
  }
  if (daysLeft <= 3) {
    return `due in ${daysLeft}d with ${fmtMinutes(remain)} left`;
  }
  const idle = c.lastWorkedAt ? diffDaysISO(c.lastWorkedAt.slice(0, 10), today) : diffDaysISO(c.createdAt.slice(0, 10), today);
  if (c.weight >= 20 && idle >= 5) {
    return `weight ${c.weight} · ${c.lastWorkedAt ? `untouched ${idle}d` : 'never started'}`;
  }
  return null;
}

export function atRisk(cs: Commitment[], today: ISODate, all: Record<string, Commitment>): { commitment: Commitment; reason: string }[] {
  return cs
    .map((c) => ({ commitment: c, reason: riskReason(c, today, all) }))
    .filter((x): x is { commitment: Commitment; reason: string } => x.reason !== null);
}
