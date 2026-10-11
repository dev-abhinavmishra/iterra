# Syllabus

*The registrar's planning folio.* Turns course requirements into a realistic
daily study plan — not a to-do list, an execution desk.

A semester is filed in minutes; commitments (assignments, exams, readings,
labs, projects) carry dates, effort estimates, and weight; the registrar's
engine proposes ranked work slips each morning with a plain-language reason on
every one. Accept, reorder, or override — then press **Start** to open the
block in [Timer](https://timerstack.vercel.app) with context intact. Missed
work is never silently moved or deleted; it comes back to the desk flagged
late and asks to be carried or struck. A weekly review reconciles intent vs.
execution and recalibrates your estimates.

## Stack

Vite 6 · React 19 · TypeScript · Tailwind v4 · zustand persist (local-first —
no sign-in; JSON export/restore is a first-class citizen).

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint     # tsc --noEmit
npm test         # vitest — scheduling engine coverage
npm run build    # production bundle
```

## Keyboard

The whole desk is keyboard-driven — a semester files in under ten minutes
without the mouse.

`T` Today · `E` Semester · `C` Calendar · `W` Weekly · `,` Registry ·
`N` quick-file a commitment · `?` help

Today queue: `J`/`K` select · `D` stamp done · `X` defer · `Enter` open
Calendar: drag slips, or click-select a slip then click a day; `←/→` nudges.

Quick-file grammar: `Essay on the Gracchi @hist140 #project due:+10 ~4h !pin`

## Docs

- [`docs/DESIGN.md`](docs/DESIGN.md) — the design law (folio metaphor)
- [`docs/TIMER-LINK.md`](docs/TIMER-LINK.md) — Timer deep-link contract
- [`docs/HANDOFF.md`](docs/HANDOFF.md) — build log / next steps
