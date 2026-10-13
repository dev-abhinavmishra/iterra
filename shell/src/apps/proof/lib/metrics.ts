// ── Progress metrics ─────────────────────────────────────────────────────────
// Skill, not vanity. The spec forbids a single "mastery %": a learner can be
// accurate but hint-dependent, confident but miscalibrated, strong blocked and
// weak interleaved. Metrics stay separate and named.

import type {
  Attempt,
  AttemptResult,
  ErrorRecord,
  Problem,
  ReviewState,
} from './types';

export interface GradedAttempt extends Attempt {
  result: AttemptResult;
}

export function graded(attempts: Attempt[]): GradedAttempt[] {
  return attempts.filter((a): a is GradedAttempt => a.result != null);
}

/** Unaided success: graded correct with hintLevel 0 (solution never revealed). */
export function unaidedSuccess(attempts: Attempt[]): { hits: number; of: number; rate: number | null } {
  const g = graded(attempts).filter((a) => a.hintLevel === 0);
  const hits = g.filter((a) => a.result === 'correct').length;
  return { hits, of: g.length, rate: g.length ? hits / g.length : null };
}

/** Success after hints, separated by deepest ladder level used. */
export function hintLevelSuccess(attempts: Attempt[]): { level: number; hits: number; of: number }[] {
  const g = graded(attempts).filter((a) => a.hintLevel > 0);
  const byLevel = new Map<number, { hits: number; of: number }>();
  for (const a of g) {
    const b = byLevel.get(a.hintLevel) ?? { hits: 0, of: 0 };
    b.of += 1;
    if (a.result === 'correct') b.hits += 1;
    byLevel.set(a.hintLevel, b);
  }
  return [1, 2, 3, 4].map((level) => ({ level, ...(byLevel.get(level) ?? { hits: 0, of: 0 }) }));
}

/** Confidence calibration: predicted vs actual success, per confidence band. */
export function calibration(attempts: Attempt[]): { confidence: number; hits: number; of: number; rate: number | null }[] {
  const g = graded(attempts);
  return [1, 2, 3, 4, 5].map((confidence) => {
    const band = g.filter((a) => a.confidence === confidence);
    const hits = band.filter((a) => a.result === 'correct').length;
    return { confidence, hits, of: band.length, rate: band.length ? hits / band.length : null };
  });
}

/** Signed calibration gap: mean(confidence/5 - actualSuccess). Positive = overconfident. */
export function calibrationGap(attempts: Attempt[]): number | null {
  const g = graded(attempts);
  if (!g.length) return null;
  const gaps = g.map((a) => a.confidence / 5 - (a.result === 'correct' ? 1 : a.result === 'partial' ? 0.5 : 0));
  return gaps.reduce((s, x) => s + x, 0) / gaps.length;
}

/** Error-category recurrence — counts per category, most recent example. */
export function errorRecurrence(
  errors: ErrorRecord[],
): { category: string; count: number; latest: string }[] {
  const byCat = new Map<string, { count: number; latest: string }>();
  for (const e of errors) {
    const k = e.category === 'custom' ? `custom:${e.customLabel ?? 'custom'}` : e.category;
    const b = byCat.get(k) ?? { count: 0, latest: e.createdAt };
    b.count += 1;
    if (e.createdAt > b.latest) b.latest = e.createdAt;
    byCat.set(k, b);
  }
  return [...byCat.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.count - a.count);
}

/** Retry success after delay: attempts on problems that had a due ReviewState. */
export function retrySuccessAfterDelay(
  attempts: Attempt[],
  reviews: Record<string, ReviewState>,
): { hits: number; of: number; rate: number | null } {
  const g = graded(attempts).filter((a) => {
    const r = reviews[a.problemId];
    // a retry attempt = an attempt that is not the problem's first
    return r && r.lastAttemptId !== a.id;
  });
  const firstSeen = new Map<string, number>();
  const sorted = [...attempts].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const a of sorted) {
    if (!firstSeen.has(a.problemId)) firstSeen.set(a.problemId, 0);
    firstSeen.set(a.problemId, firstSeen.get(a.problemId)! + 1);
  }
  const retries = g.filter((a) => {
    const nth = sorted.filter((x) => x.problemId === a.problemId).indexOf(a);
    return nth > 0;
  });
  const hits = retries.filter((a) => a.result === 'correct').length;
  return { hits, of: retries.length, rate: retries.length ? hits / retries.length : null };
}

/** Topic coverage: attempted / total per topic, plus unaided rate per topic. */
export function topicCoverage(
  problems: Problem[],
  attempts: Attempt[],
): { topic: string; attempted: number; total: number; unaidedRate: number | null }[] {
  const active = problems.filter((p) => !p.archived);
  const byTopic = new Map<string, { total: number; ids: Set<string> }>();
  for (const p of active) {
    const k = p.topic || '(untopiced)';
    if (!byTopic.has(k)) byTopic.set(k, { total: 0, ids: new Set() });
    const b = byTopic.get(k)!;
    b.total += 1;
    b.ids.add(p.id);
  }
  const g = graded(attempts);
  return [...byTopic.entries()]
    .map(([topic, v]) => {
      const tAttempts = g.filter((a) => v.ids.has(a.problemId));
      const attempted = new Set(tAttempts.map((a) => a.problemId)).size;
      const unaided = tAttempts.filter((a) => a.hintLevel === 0);
      const unaidedHits = unaided.filter((a) => a.result === 'correct').length;
      return {
        topic,
        attempted,
        total: v.total,
        unaidedRate: unaided.length ? unaidedHits / unaided.length : null,
      };
    })
    .sort((a, b) => b.total - a.total || a.topic.localeCompare(b.topic));
}

/** Overall numbers for the progress header. */
export function totals(attempts: Attempt[], problems: Problem[]): {
  attempts: number;
  problems: number;
  attemptedProblems: number;
  avgMinutes: number | null;
} {
  const g = graded(attempts);
  const times = g
    .filter((a) => a.submittedAt)
    .map((a) => (new Date(a.submittedAt!).getTime() - new Date(a.startedAt).getTime()) / 60000)
    .filter((m) => m > 0 && m < 240);
  return {
    attempts: g.length,
    problems: problems.filter((p) => !p.archived).length,
    attemptedProblems: new Set(g.map((a) => a.problemId)).size,
    avgMinutes: times.length ? times.reduce((s, t) => s + t, 0) / times.length : null,
  };
}
