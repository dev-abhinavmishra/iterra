// ── Retry scheduling + session building ──────────────────────────────────────
// ReviewState is a small SM-2-shaped ladder: a miss files the problem back
// soon; clean retries stretch the interval by a stability-scaled factor.
// Low-confidence successes schedule a shorter confirmatory retry.

import type {
  AttemptResult,
  ISODateTime,
  PracticeSession,
  Problem,
  ReviewState,
  SessionRules,
} from './types';
import { nowISO, shuffle, uid } from './utils';

export const FIRST_INTERVAL_DAYS = 1;
export const LOW_CONFIDENCE_INTERVAL_DAYS = 2;
export const GROWTH = 2.1;
export const MAX_INTERVAL_DAYS = 60;

export interface ScheduleInput {
  problemId: string;
  result: AttemptResult;
  confidence: number; // 1–5
  attemptId: string;
  prior?: ReviewState;
  now?: ISODateTime;
}

/** Compute the next ReviewState after a graded attempt. */
export function nextReview(input: ScheduleInput): ReviewState {
  const now = input.now ?? nowISO();
  const prior = input.prior;
  const missed = input.result !== 'correct';
  const lowConfidence = input.result === 'correct' && input.confidence <= 2;

  let interval: number;
  let stability: number;
  let lapses = prior?.lapses ?? 0;

  if (missed) {
    // a lapse collapses stability — the queue wants this back soon
    stability = 0;
    lapses += 1;
    interval = FIRST_INTERVAL_DAYS;
  } else if (lowConfidence) {
    // right but unsure — short confirmatory interval, small stability gain
    stability = (prior?.stability ?? 0) + 0.5;
    interval = Math.min(prior?.interval ?? LOW_CONFIDENCE_INTERVAL_DAYS, LOW_CONFIDENCE_INTERVAL_DAYS);
  } else {
    stability = (prior?.stability ?? 0) + 1;
    const base = prior && prior.stability > 0 ? prior.interval : 3;
    interval = Math.min(Math.round(base * GROWTH * (1 + stability * 0.08)), MAX_INTERVAL_DAYS);
  }

  const due = new Date(now);
  due.setUTCDate(due.getUTCDate() + Math.round(interval));
  // due at start of that day, learner's local framing
  return {
    problemId: input.problemId,
    dueAt: due.toISOString(),
    interval,
    stability,
    lapses,
    lastResult: input.result,
    lastAttemptId: input.attemptId,
  };
}

export function isDue(r: ReviewState | undefined, now = nowISO()): boolean {
  return !!r && r.dueAt <= now;
}

// ── session building ──

export interface SessionCandidate {
  problem: Problem;
  kind: 'new' | 'retry';
  dueAt?: string;
}

/** Estimated minutes a problem takes, by difficulty. */
export function estimateMinutes(difficulty: number): number {
  return [0, 4, 6, 9, 13, 18][Math.round(difficulty)] ?? 8;
}

/**
 * Build an ordered problem list for a practice session.
 * - eligible = problems matching rules' filters
 * - retries (due ReviewStates) and new (never attempted) split by newRatio
 * - blocked groups by topic; interleaved round-robins topics so neighbors differ
 */
export function buildSessionList(
  rules: SessionRules,
  problems: Problem[],
  reviews: Record<string, ReviewState>,
  attemptedIds: Set<string>,
  now = nowISO(),
): SessionCandidate[] {
  const eligible = problems.filter((p) => {
    if (p.archived) return false;
    if (rules.courseIds.length && (!p.courseId || !rules.courseIds.includes(p.courseId))) return false;
    if (rules.topics.length && !rules.topics.includes(p.topic)) return false;
    if (p.difficulty < rules.minDifficulty || p.difficulty > rules.maxDifficulty) return false;
    return true;
  });

  const retries = eligible
    .filter((p) => isDue(reviews[p.id], now))
    .map((p): SessionCandidate => ({ problem: p, kind: 'retry', dueAt: reviews[p.id].dueAt }))
    .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1));

  const fresh = shuffle(
    eligible
      .filter((p) => !attemptedIds.has(p.id) && !reviews[p.id])
      .map((p): SessionCandidate => ({ problem: p, kind: 'new' })),
  );

  // problems attempted but with no review state (e.g. correct with no retry
  // needed... they still exist) — reusable as light review, lowest priority
  const seen = shuffle(
    eligible
      .filter((p) => attemptedIds.has(p.id) && !isDue(reviews[p.id], now))
      .map((p): SessionCandidate => ({ problem: p, kind: 'retry', dueAt: reviews[p.id]?.dueAt })),
  );

  // budget in problems, from estimated minutes
  const budget = Math.max(1, Math.round(rules.minutes / 7));
  const wantNew = Math.round(budget * rules.newRatio);
  const wantRetry = budget - wantNew;

  const picked: SessionCandidate[] = [
    ...retries.slice(0, Math.max(wantRetry, Math.min(retries.length, budget))),
    ...fresh.slice(0, wantNew),
  ];
  // top up whatever the ratio left unfilled — retries first, then seen, then new
  if (picked.length < budget) {
    const pickedIds = new Set(picked.map((c) => c.problem.id));
    for (const extra of [...retries, ...seen, ...fresh]) {
      if (picked.length >= budget) break;
      if (!pickedIds.has(extra.problem.id)) {
        picked.push(extra);
        pickedIds.add(extra.problem.id);
      }
    }
  }

  return rules.order === 'interleaved' ? interleave(picked) : blocked(picked);
}

function blocked(list: SessionCandidate[]): SessionCandidate[] {
  // stable group by topic, retries first within a topic
  return list.slice().sort((a, b) => {
    const t = a.problem.topic.localeCompare(b.problem.topic);
    if (t !== 0) return t;
    return a.kind === b.kind ? 0 : a.kind === 'retry' ? -1 : 1;
  });
}

function interleave(list: SessionCandidate[]): SessionCandidate[] {
  // round-robin across topics so adjacent problems come from different buckets
  const byTopic = new Map<string, SessionCandidate[]>();
  for (const c of list) {
    const k = c.problem.topic || '(untopiced)';
    if (!byTopic.has(k)) byTopic.set(k, []);
    byTopic.get(k)!.push(c);
  }
  const buckets = shuffle([...byTopic.values()]);
  const out: SessionCandidate[] = [];
  let prev: string | null = null;
  while (out.length < list.length) {
    let advanced = false;
    for (const b of buckets) {
      if (!b.length) continue;
      const topic = b[0].problem.topic;
      if (topic === prev && buckets.some((x) => x.length && x[0].problem.topic !== prev)) continue;
      out.push(b.shift()!);
      prev = topic;
      advanced = true;
    }
    if (!advanced) break;
  }
  return out;
}

export function newSession(rules: SessionRules, problemIds: string[], intent?: string): PracticeSession {
  return {
    id: uid('s_'),
    rules,
    problemIds,
    startedAt: nowISO(),
    intent,
  };
}

// ── due-today helpers for library/dashboard chips ──

export function dueCount(reviews: Record<string, ReviewState>, now = nowISO()): number {
  return Object.values(reviews).filter((r) => isDue(r, now)).length;
}
