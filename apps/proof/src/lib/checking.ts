// ── Layered checker ──────────────────────────────────────────────────────────
// Deterministic checks first (exact / numeric / units / choice / steps),
// structured self-check via rubrics, 'open' always self-graded. The app is
// fully useful without any AI provider.

import type { AnswerSpec, Attempt, AttemptResult, Rubric } from './types';
import {
  expressionsEquivalent,
  nearlyEqual,
  normalizeExact,
  normalizeUnit,
  parseNumericWithUnit,
} from './mathcheck';

export interface CheckVerdict {
  // 'auto' = machine-verified; 'self' = learner graded themselves against
  // structure; 'ungraded' = needs the compare step before a result exists.
  mode: 'auto' | 'self' | 'ungraded';
  result?: AttemptResult;
  detail: string;
}

/** What the attempt desk collects as "the answer" for a spec kind. */
export function answerKind(spec: AnswerSpec): 'text' | 'numeric' | 'expression' | 'choice' | 'none' {
  switch (spec.kind) {
    case 'exact': return 'text';
    case 'numeric': return 'numeric';
    case 'expression': return 'expression';
    case 'choice': return 'choice';
    default: return 'none';
  }
}

export function specSummary(spec: AnswerSpec, rubric?: Pick<Rubric, 'title'>): string {
  switch (spec.kind) {
    case 'exact': return `exact — “${spec.expected}”`;
    case 'numeric': {
      const tol = spec.tolerance != null ? `±${spec.tolerance}` : spec.relTolerance != null ? `±${spec.relTolerance * 100}%` : '±0.1%';
      return `numeric — ${spec.value}${spec.unit ? ' ' + spec.unit : ''} ${tol}`;
    }
    case 'expression': return `expression — ${spec.expected}`;
    case 'choice': return spec.correct.length > 1 ? `${spec.correct.length} of ${spec.options.length} options` : `${spec.options.length} options`;
    case 'steps': return `${spec.steps.length} ordered steps`;
    case 'rubric': return `rubric — ${rubric?.title ?? 'missing rubric'}`;
    case 'open': return 'open — self-assessed';
  }
}

/** Run the deterministic layer. Returns a verdict for auto-checkable kinds. */
export function autoCheck(spec: AnswerSpec, attempt: Attempt, rubric?: Rubric): CheckVerdict {
  switch (spec.kind) {
    case 'exact': {
      const given = attempt.answer ?? '';
      if (!given.trim()) return { mode: 'ungraded', detail: 'No final answer recorded' };
      const ok =
        normalizeExact(given, spec.caseSensitive) === normalizeExact(spec.expected, spec.caseSensitive);
      return {
        mode: 'auto',
        result: ok ? 'correct' : 'incorrect',
        detail: ok ? 'Exact match' : `Expected “${spec.expected}”`,
      };
    }
    case 'numeric': {
      const parsed = parseNumericWithUnit(attempt.answer ?? '');
      if (!parsed) return { mode: 'ungraded', detail: 'No parseable number in your answer' };
      const absTol = spec.tolerance ?? Math.abs(spec.value) * (spec.relTolerance ?? 0.001) + 1e-9;
      const relTol = spec.relTolerance ?? 1e-9;
      const valueOk = nearlyEqual(parsed.value, spec.value, absTol, Math.max(relTol, 1e-9));
      let unitOk = true;
      let unitNote = '';
      if (spec.unit) {
        unitOk = parsed.unit != null && normalizeUnit(parsed.unit) === normalizeUnit(spec.unit);
        unitNote = parsed.unit
          ? unitOk ? ' · units match' : ` · expected ${spec.unit}, got ${parsed.unit}`
          : ` · missing unit ${spec.unit}`;
      }
      if (valueOk && unitOk) return { mode: 'auto', result: 'correct', detail: `Within tolerance${unitNote}` };
      if (valueOk && !unitOk) return { mode: 'auto', result: 'partial', detail: `Value right${unitNote}` };
      return { mode: 'auto', result: 'incorrect', detail: `Expected ${spec.value}${spec.unit ? ' ' + spec.unit : ''}${unitNote}` };
    }
    case 'expression': {
      const given = (attempt.answer ?? '').trim();
      if (!given) return { mode: 'ungraded', detail: 'No expression recorded' };
      const r = expressionsEquivalent(given, spec.expected, spec.vars);
      return { mode: 'auto', result: r.equivalent ? 'correct' : 'incorrect', detail: r.reason };
    }
    case 'choice': {
      const picked = (attempt.answerChoice ?? []).slice().sort((a, b) => a - b);
      const want = spec.correct.slice().sort((a, b) => a - b);
      if (!picked.length) return { mode: 'ungraded', detail: 'No option selected' };
      const same = picked.length === want.length && picked.every((v, i) => v === want[i]);
      if (same) return { mode: 'auto', result: 'correct', detail: 'Correct option(s)' };
      const overlap = picked.filter((p) => want.includes(p)).length;
      const result: AttemptResult = overlap > 0 && picked.every((p) => want.includes(p)) ? 'partial' : 'incorrect';
      return { mode: 'auto', result, detail: `Correct: ${want.map((i) => spec.options[i]).join(', ')}` };
    }
    case 'steps': {
      const checked = attempt.stepsChecked ?? [];
      const done = checked.filter(Boolean).length;
      if (done === spec.steps.length)
        return { mode: 'self', result: 'correct', detail: `All ${spec.steps.length} milestones self-checked` };
      if (done === 0) return { mode: 'ungraded', detail: 'No milestones checked yet' };
      return { mode: 'self', result: 'partial', detail: `${done} of ${spec.steps.length} milestones checked` };
    }
    case 'rubric': {
      if (!rubric) return { mode: 'ungraded', detail: 'Rubric missing — grade yourself in compare' };
      const scores = attempt.rubricScores ?? {};
      const filled = rubric.criteria.filter((c) => scores[c.id] != null);
      if (filled.length < rubric.criteria.length)
        return { mode: 'ungraded', detail: `${filled.length}/${rubric.criteria.length} criteria scored` };
      const maxLevel = rubric.levels.length - 1;
      const allMet = rubric.criteria.every((c) => scores[c.id] === maxLevel);
      const anyMet = rubric.criteria.some((c) => (scores[c.id] ?? 0) > 0);
      const result: AttemptResult = allMet ? 'correct' : anyMet ? 'partial' : 'incorrect';
      return { mode: 'self', result, detail: `Rubric self-graded — ${allMet ? 'all criteria met' : 'see scores'}` };
    }
    case 'open':
      return { mode: 'ungraded', detail: 'Open response — compare against the worked solution' };
  }
}

/** Result for an open/rubric answer after the learner self-assesses in compare. */
export function selfGrade(result: AttemptResult): CheckVerdict {
  return { mode: 'self', result, detail: 'Self-assessed against the worked solution' };
}
