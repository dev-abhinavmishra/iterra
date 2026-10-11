# Proof

Practice solving problems — not reading solutions. A local-first calculation
workbench for multi-step derivations, physics setups, and written reasoning
(the work flashcards can't grade).

## Stack

Vite 6 · React 19 · TypeScript (strict) · Tailwind CSS v4 · zustand persist ·
KaTeX · vitest

## Commands

```bash
npm install
npm run dev    # localhost:3000
npm run lint   # tsc --noEmit
npm test       # vitest
npm run build  # dist/
```

## What it does

- **Problem bank** — Markdown + LaTeX prompts, attachments, tags, course,
  topic, difficulty, source, expected answer, hint ladders, worked solutions.
- **Attempt desk** — step rail (each step preserved, never overwritten),
  write-or-draw work, elapsed time, confidence recorded before submit, hints
  revealed one level at a time (and logged).
- **Checking** — deterministic: exact / numeric + units + tolerance /
  expression equivalence / choice / ordered steps, plus rubric self-grading
  and fully open problems. No AI provider required.
- **Compare** — attempt beside worked solution; mark divergent steps, answer
  the two reflection prompts, file the error class, schedule the retry.
- **Retry queue** — spaced scheduling (miss → 1d, stretch ×2.1·stability);
  session builder with new/retry ratio, blocked vs interleaved.
- **Ledger + Progress** — error recurrence, unaided success, success-after-
  hint by level, confidence calibration, retry success, topic coverage. No
  single "mastery %" — measures stay separate.
- **Suite links** — Timer deep links both ways, Flashcards misconception
  cards (`?cards=`), Ink markdown export, Syllabus→Proof session inbound.
- **Import/Export** — worksheet text → reviewed drafts, GradeStack item-
  analysis JSON, shareable problem sets, full workbench backup/restore.

## Design

`docs/DESIGN.md` — graphite bench + computation paper + proof rail.
Blue = mechanics, violet = corrections, amber = hints only. Results are
always symbol + word, never color alone.

## Data

Everything lives in `localStorage` (`proof.workbench.v1`). Settings →
Export everything for a full backup.
