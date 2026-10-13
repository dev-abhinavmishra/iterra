// ── Import extraction ────────────────────────────────────────────────────────
// Two intake paths, both with human review before anything is filed:
//  1. worksheet text (pasted from Modular AI extraction or a textbook) —
//     split into candidate problems, each reviewed and filed by hand.
//  2. GradeStack item-analysis JSON — hardest items become proposed repair
//     problems, tagged with their miss rate.

import type { Difficulty, Problem } from './types';
import { uid, nowISO } from './utils';

export interface DraftProblem {
  id: string;
  promptDoc: string;
  topic: string;
  courseId?: string;
  difficulty: Difficulty;
  source: string;
  answerText: string; // fills answerSpec 'exact' or 'open'
  tags: string[];
  selected: boolean;
}

/**
 * Split pasted worksheet text into candidate problems. Split on lines that
 * look like problem numbers: '1.', '3)', 'Q4', 'Problem 2', or blank-line
 * separated blocks when no numbers exist.
 */
export function extractDrafts(text: string, source: string): DraftProblem[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const chunks: string[] = [];
  let cur: string[] = [];
  const startsProblem = (l: string) =>
    /^\s*(?:q(?:uestion)?|problem|ex(?:ercise)?|#)?\s*\d+\s*[.):]\s+/i.test(l) ||
    /^\s*(?:q(?:uestion)?|problem|exercise)\s+\d+/i.test(l);
  for (const l of lines) {
    if (startsProblem(l) && cur.length) {
      chunks.push(cur.join('\n').trim());
      cur = [l];
    } else {
      cur.push(l);
    }
  }
  if (cur.join('\n').trim()) chunks.push(cur.join('\n').trim());

  // no numbered structure → split on 2+ blank lines
  if (chunks.length <= 1) {
    const blocks = text.split(/\n\s*\n\s*\n?/).map((b) => b.trim()).filter((b) => b.length > 12);
    if (blocks.length > 1) {
      chunks.length = 0;
      chunks.push(...blocks);
    }
  }

  return chunks
    .map((c) => c.replace(/^\s*(?:q(?:uestion)?|problem|ex(?:ercise)?|#)?\s*\d+\s*[.):]\s+/i, '').trim())
    .filter((c) => c.length > 8)
    .map((promptDoc) => ({
      id: uid('d_'),
      promptDoc,
      topic: '',
      difficulty: 3 as Difficulty,
      source,
      answerText: '',
      tags: [],
      selected: true,
    }));
}

/** GradeStack item-analysis intake — accepts several plausible JSON shapes. */
export function parseItemAnalysis(text: string): DraftProblem[] {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON — paste GradeStack item analysis export');
  }
  const items = Array.isArray(obj)
    ? obj
    : (obj as { items?: unknown[]; questions?: unknown[]; hardest?: unknown[] }).items ??
      (obj as { questions?: unknown[] }).questions ??
      (obj as { hardest?: unknown[] }).hardest ??
      [];
  if (!Array.isArray(items) || !items.length) throw new Error('No items found in that JSON');
  return items
    .map((it): DraftProblem | null => {
      const o = it as Record<string, unknown>;
      const prompt = String(o.prompt ?? o.text ?? o.question ?? o.item ?? '').trim();
      if (!prompt) return null;
      const missRate = typeof o.missRate === 'number' ? o.missRate : typeof o.miss === 'number' ? o.miss : undefined;
      const tags = ['gradestack'];
      if (missRate != null) tags.push(`miss-${Math.round(missRate * 100)}pct`);
      return {
        id: uid('d_'),
        promptDoc: prompt,
        topic: String(o.topic ?? ''),
        difficulty: (missRate != null && missRate > 0.6 ? 4 : 3) as Difficulty,
        source: 'gradestack item-analysis',
        answerText: String(o.answer ?? o.key ?? ''),
        tags,
        selected: true,
      };
    })
    .filter((d): d is DraftProblem => d != null);
}

/** File a reviewed draft into a real Problem. */
export function draftToProblem(d: DraftProblem): Problem {
  return {
    id: uid('p_'),
    courseId: d.courseId || undefined,
    topic: d.topic || 'general',
    promptDoc: d.promptDoc,
    answerSpec: d.answerText.trim() ? { kind: 'exact', expected: d.answerText.trim() } : { kind: 'open' },
    workedSolutionDoc: '',
    hints: [],
    tags: d.tags,
    difficulty: d.difficulty,
    source: d.source,
    attachments: [],
    createdAt: nowISO(),
    archived: false,
  };
}
