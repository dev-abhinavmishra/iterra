# Syllabus — Design Law

**Metaphor: the registrar's planning folio.** Not a notebook, not a dashboard, not
a to-do app. An institutional folio of forms, ledgers, and stamped slips that
lives on a quiet slate desk. Every surface and motion descends from that.

## Material

- **Desk:** deep slate (`--color-desk`, `#232529`), lit from above with two soft
  vignettes and a fine SVG grain. It is the only dark surface.
- **Stock:** ivory administrative paper (`--color-stock`, `#f2ecd9`) with a paper
  grain at 3.5% opacity and a top margin rule. The folio page is `.sheet`.
- **Planning slips:** brighter stock (`--color-slip`, `#f7f2e4`) with a dashed
  perforation line on the left edge — they read as tear-off institutional slips.
  Proposals render with dashed borders until accepted.
- **Forms:** `--color-form` fields, hairline `--color-rule` borders, inset
  shadow. Institutional, never rounded-soft.

## Signature element

**The vertical semester spine.** A narrow rail on the left edge carrying the
app wordmark and one colored tab per course. Tabs are the **only large color
surfaces in the app** — elsewhere, course color appears as thin slivers, chips,
and ≤5% alpha washes. Withdrawing a course removes its tab (archived section in
the Semester ledger).

## Typography

| Role | Face | Usage |
|---|---|---|
| `--font-slab` | Zilla Slab | Course names, commitment titles, headings |
| `--font-ui` | Archivo | Controls, body copy, nav |
| `--font-mono` | IBM Plex Mono | Dates, times, durations, codes, stamps, kicker labels |

Mono is the registrar's voice: all dates render as `OCT 20`, `4:00 PM`,
`1h 30m`. Kickers (` .kicker`) are mono, ~10px, letterspaced, uppercase.

## Color

- Neutral base (ink `#33302a` on ivory).
- One color per course, drawn from the institutional palette
  (`--color-course-*`: oxblood, hunter, registry navy, ochre, plum, teal,
  slate, rust). Auto-assigned least-used on intake.
- **Red (`--color-late`, `#9d3226`) is reserved for genuinely late work** —
  overdue commitments, missed slips, late stamps. Never for emphasis, never
  for generic warnings.
- Green (`--color-ok`) only for completion stamps and clean-state affirmations.

## Motion (restrained by law)

- Slips **slide** only when rescheduled (`block-slide`).
- The rubber **stamp** lands once on completion (`stamp` keyframe: overshoot →
  settle at −8°, grunge mask). Never repeats, never loops.
- Sheets and slips enter with short rises (`sheet-in`, `slip-in` ≤ 0.35s).
- Everything obeys `prefers-reduced-motion`; `html[data-motion]` blanket sets
  all animation/transition to 1ms. Settings → Motion: Full forces motion on,
  Reduced forces it off; OS preference governs when unset.

## Forbidden

Lined paper · loose-leaf holes · flashcard flips · graph-paper backgrounds ·
dashboard stat-cards as decoration · drop shadows on everything · red used
decorative · looping animations · gradient "AI" sheens.

## Voice

Institutional, terse, plain-spoken. The engine is "the registrar"; its outputs
are "suggestions" that always carry their reasoning in plain language
("Due in 2 days; 90 min remain", "High-weight exam; no practice logged this
week"). The student can override everything — the folio proposes, the student
disposes.

## The living syllabus (design rehaul, Oct 11)
The app IS the name: every course generates a real syllabus document —
masthead ("Course Syllabus" + double rules), §-numbered sections
(§1 Evaluation, §2 Course Schedule, §3 Required Materials), and a print
view that produces a clean paper syllabus. The Semester folio is a stack
of issued syllabus covers dealt onto the desk (deal animation, staggered).
The Today desk is the daily agenda page (¶-numbered items). Rules:
institutional paperwork only — never lined paper, loose-leaf, or card
metaphors (Ink owns the notebook look).
