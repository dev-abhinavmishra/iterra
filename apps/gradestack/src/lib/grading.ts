import { QuestionFormat, TestSection } from '../store';

/* ── Grading scale — editable in Settings ─────────────────── */
export interface GradingScale {
  A: number;
  B: number;
  C: number;
  D: number;
}

export const DEFAULT_SCALE: GradingScale = { A: 90, B: 80, C: 70, D: 60 };

export function letterFor(pct: number, scale: GradingScale = DEFAULT_SCALE): string {
  if (pct >= scale.A) return 'A';
  if (pct >= scale.B) return 'B';
  if (pct >= scale.C) return 'C';
  if (pct >= scale.D) return 'D';
  return 'F';
}

/* ── Answer comparison ────────────────────────────────────── */
/* Answers are stored as strings; multi-answer questions join
   their marked options with commas ("A,C"). Comparison is
   case-insensitive and order-insensitive.                    */

export function normalizeAnswer(ans: string | undefined | null): string {
  if (!ans) return '';
  return ans
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .sort()
    .join(',');
}

export function answersMatch(student: string | undefined, correct: string | undefined): boolean {
  const s = normalizeAnswer(student);
  const c = normalizeAnswer(correct);
  return s !== '' && s === c;
}

/* Partial credit for multi-answer questions: each correct mark
   earns a share of the point; each extra mark costs one share.
   Never goes below zero, exact matches still score full.      */
export function partialCreditScore(student: string | undefined, correct: string | undefined): number {
  const s = new Set(normalizeAnswer(student).split(',').filter(Boolean));
  const c = new Set(normalizeAnswer(correct).split(',').filter(Boolean));
  if (c.size === 0 || s.size === 0) return 0;
  let matched = 0;
  s.forEach(o => { if (c.has(o)) matched++; });
  const extra = s.size - matched;
  return Math.max(0, (matched - extra) / c.size);
}

/* ── Whole-sheet grading ──────────────────────────────────── */
export interface GradeResult {
  rawScore: number;
  maxScore: number;
  percentage: number;
  grade: string;
  needsReview: boolean;
}

export function gradeResponses(
  responses: Record<number, string> | undefined,
  answerKey: Record<number, string> | undefined,
  numQuestions: number,
  scale: GradingScale = DEFAULT_SCALE,
  partialCredit = false,
): GradeResult {
  let rawScore = 0;
  let needsReview = false;

  for (let i = 1; i <= numQuestions; i++) {
    const studentAns = responses?.[i];
    const correctAns = answerKey?.[i] || '';

    if (!studentAns || studentAns === '?' || !correctAns) {
      if (!studentAns || studentAns === '?') needsReview = true;
      continue;
    }
    if (partialCredit && normalizeAnswer(correctAns).includes(',')) {
      rawScore += partialCreditScore(studentAns, correctAns);
    } else if (answersMatch(studentAns, correctAns)) {
      rawScore += 1;
    }
  }

  const percentage = numQuestions > 0 ? Math.round((rawScore / numQuestions) * 100) : 0;
  return {
    rawScore: Math.round(rawScore * 100) / 100,
    maxScore: numQuestions,
    percentage,
    grade: letterFor(percentage, scale),
    needsReview,
  };
}

/* ── Question formats ─────────────────────────────────────── */
export const FORMAT_LABELS: Record<QuestionFormat, string> = {
  'A-D': 'A–D',
  'A-E': 'A–E',
  'A-D-M': 'A–D, mark all that apply',
  'A-E-M': 'A–E, mark all that apply',
  'TF': 'True / False',
  'SA': 'Short answer',
};

export function optionsFor(format: QuestionFormat | string): string[] {
  if (format === 'SA') return [];
  if (format === 'TF') return ['T', 'F'];
  if (format.startsWith('A-E')) return ['A', 'B', 'C', 'D', 'E'];
  return ['A', 'B', 'C', 'D'];
}

export function isMultiple(format: string): boolean {
  return format.endsWith('-M');
}

export function formatsForTest(sections: TestSection[] | undefined, numQuestions: number, fallback: QuestionFormat = 'A-D'): QuestionFormat[] {
  if (!sections || sections.length === 0) return Array.from({ length: numQuestions }, () => fallback);
  const out: QuestionFormat[] = [];
  for (const sec of sections) {
    const n = parseInt(sec.count as unknown as string) || 0;
    for (let i = 0; i < n && out.length < numQuestions; i++) out.push(sec.format);
  }
  while (out.length < numQuestions) out.push(fallback);
  return out;
}

/* ── CSV export ───────────────────────────────────────────── */
export function csvEscape(value: string | number): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadFile(name: string, content: string | Blob, type = 'text/csv') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
