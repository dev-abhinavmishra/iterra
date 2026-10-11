# HANDOFF.md — Rhythm working notes

Current state of the build for whoever picks this up next (including future
Devin sessions). Update this file when the plan changes mid-session.

## What this is

Rhythm — the suite's routine-consistency register ("was the routine done?"),
per the spec `pasted-1791742507358.txt`. Local-first Vite + React 19 + TS app;
sibling to Timer, Flashcards, Ink, Proof, Syllabus, GradeStack, Modular AI.

## Status

- Full MVP implemented in one pass: all 7 surfaces (Today, Heatmap, Routine
  detail, Weekly review, Experiments, Connections, Settings), event model,
  recovery bands, onboarding, export/restore.
- `npm run lint` (tsc), `npm test` (33 tests), `npm run build` all green.
- Single PR open from `devin/<ts>-rhythm-mvp` → `main`. Not merged unless
  Abhinav says so.

## Architecture map

- `src/lib/types.ts` — all entities; `pauses` is an array of `{from, to?}`
  intervals (open end = still paused) so pause windows falsify *nothing*
  historical.
- `src/lib/dates.ts` — civil-date helpers. Never use `toISOString` for civil
  dates (UTC day shift); use `parseISO`/`fmt*`/`addDaysISO` (noon-anchored,
  DST-safe).
- `src/lib/register.ts` — the heart: `dayState` (per day per routine),
  `routineWeek` (weekly accounting with exceptions/pauses excluding days,
  `exempt` weeks don't count as hits *or* misses), `weeklyScorecard`.
- `src/lib/bands.ts` — band assignment: established / recovery / paused /
  experimenting / building. Recovery needs ≥2 consecutive missed judged weeks
  on a routine ≥3 weeks old.
- `src/lib/events.ts` — `intakeEvent` is the single entry point: dedups by
  `id`, stores every accepted event (even unmapped), derives entries for
  enabled matching mappings. `valueRule`: presence | duration | metric.
  Wildcards `app.*`.
- `src/lib/import.ts` — `?event=` base64url deep link + paste/file JSON
  (object, array, or `{events:[]}`).
- `src/lib/backup.ts` — `{app:'rhythm', version:1, data}` envelope; import
  validates and fills missing collections.
- `src/lib/links.ts` — inbound link parsing + per-app `evidenceUrl` back to
  source apps; suite base URLs live in `settings`.
- `src/store/index.ts` — zustand persist `rhythm.register.v1` (v1);
  `partialize` = data collections + `onboardingSeen` only. `boot()` consumes
  `?event=` / `?from=` / `?routine=` from the URL via `replaceState` before
  first paint and sets a `receipt` shown in-app.
- `src/index.css` — `@theme` tokens + all component classes. Design law in
  `DESIGN.md` — read it before styling anything.
- Views in `src/views/`; shared `Sheet`, `Field`, `Mark`, `WStamp`,
  `RoutineForm` in `src/components/`.

## Key semantics (don't regress)

- **Two-action check-in**: Today stamp = 1 action for check routines;
  amount routines = press + value.
- **Entries are append-only**: removing an entry strikes a ledger row, it
  doesn't rewrite history; dayState recomputes from what's left.
- **Exceptions exclude days**: `travel|exam|sick|break|other` with
  `routineId` or `'all'`; excluded days aren't hits or misses.
- **Pause is an interval**: `pauseRoutine` opens `{from}`, `resumeRoutine`
  closes `to`. Weeks fully inside a pause read `paused`/`exempt` — never
  `missed`.
- **Events are reversible**: derived entries carry `eventId`; deleting an
  event or disconnecting a source removes only derived entries. Manual
  entries are never touched.
- **Unmapped events are kept**: they sit in the event ledger; creating a
  matching mapping later retro-derives entries (`addMapping` calls
  `intakeEvent` over stored events).
- **Minimum version**: `routine.minimum` enables the `min` stamp; a minimum
  entry counts as `minimum` state — shows on the page, doesn't fake a full
  day.

## Traps

- `noUnusedLocals` is on — imports must all be used.
- zustand selectors returning fresh arrays/objects need `useShallow` (used in
  views that derive rows).
- Chrome min window width ~500px on this VM — the leaf is designed dense; keep
  left/right padding tight for small widths.
- No CI on this repo — verify locally (lint/test/build + browser pass) before
  pushing.
- Vercel deploys happen on merge to `main` (project not yet linked as of the
  first commit; suite convention is `<name>.vercel.app`).
- `git-manager` push can transiently 500 — retry once before debugging.

## If continuing

- Phase 2 items (from spec): shareable read-only weekly card, partner view,
  event intake via the other apps' real emitters (contracts are stubbed in
  `KNOWN_EVENT_TYPES`), background sync.
- The event/mapping UI is built to ingest real payloads; wire emitters on the
  sibling apps' side as they land.
