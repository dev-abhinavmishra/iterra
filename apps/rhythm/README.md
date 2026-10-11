# Rhythm

The attendance register for the study-app suite. Rhythm shows whether
academic routines are happening consistently — and helps repair them when
they are not. It is not a motivational-quote app and not a punitive streak
counter.

Local-first: everything lives in `localStorage` (`rhythm.register.v1`) with a
full JSON export/restore. No accounts, no servers required.

## What it does

- **Today** — the day's register. Stamp a routine in ≤2 actions; mark a
  minimum version ("showed up") or log friction instead of a fake miss.
- **Heatmap** — week-rows of stamped marks; every state has a shape, a word,
  and a keyboard/screen-reader Ledger equivalent. Days open for evidence.
- **Routine** — target, window, history, friction, connected events, pause /
  archive.
- **Weekly review** — per-routine scorecard (hit rate, sessions, time) plus
  one reflection prompt and an optional next-week adjustment.
- **Experiments** — name a change, watch before/during weeks, conclude with
  keep/tweak/abandon.
- **Connections** — intake events from the suite (`?event=` deep link or JSON
  paste/file), map them to routines, audit and reverse every stamp they made.
- **Settings** — routines, courses, week start, reduced motion, suite app
  URLs, export/restore/reset.

## Events

Sibling apps post JSON events (deep link `?event=<base64url>` or pasted
JSON). Events are deduplicated by `id`, attributed to their source app,
reversible, and mapped onto routines via rules (presence / duration /
metric). Nothing is required to use Rhythm — manual check-in is complete on
its own.

## Develop

```sh
npm install
npm run dev    # vite on :3000
npm run lint   # tsc --noEmit
npm test       # vitest
npm run build
```

Design law lives in `DESIGN.md`; working notes in `HANDOFF.md`.
