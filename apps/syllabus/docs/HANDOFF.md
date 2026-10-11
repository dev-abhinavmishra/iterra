# HANDOFF — Syllabus build log

Long-running `/loop` build. Read this first when resuming.

## State

- **Repo:** `dev-abhinavmishra/syllabus` — Vite 6 + React 19 + TS + Tailwind v4
  (`@theme` in `src/index.css`, no tailwind.config) + zustand v5 persist
  (`syllabus.folio.v1` localStorage) + vitest.
- **Commands:** `npm run dev` → :3000 · `npm run lint` = `tsc --noEmit` ·
  `npm run build` · `npm test` (vitest).
- **Spec source:** user's "App 1: Syllabus" brief — product role, MVP scope,
  screens, scheduling model, data model, design system, acceptance criteria.

## Done

- Phase 1 foundation: entities (Term/Course/Commitment/WorkBlock/ResourceLink/
  Review), zustand persist store, JSON export/restore (`lib/backup.ts`), term +
  course intake onboarding (keyboard-complete ledger).
- Phase 2 execution: Today desk (available-time control, planned queue, j/k/d/x
  keys, Start-in-Timer deep link, stamp-done, defer sheet with reasons), missed
  block carry (never silently moved).
- Phase 3 planning: calendar week/month/agenda + drag & keyboard move
  (←/→ nudge a day), reverse-plan templates per commitment type, weekly review
  (planned vs actual, slipped resolution, registrar's note).
- Phase 4 partial: ResourceLinks (staple app resources to courses/commitments),
  Timer deep-link contract (`lib/links.ts`, `docs/TIMER-LINK.md`), inbound
  `?completedBlock&actual` return handler in `boot()`. Modular AI import:
  `?import=<base64url JSON>` deep-link or Semester → Import paste → staged in
  `components/ImportSheet.tsx` confirmation table (editable, per-row check;
  auto-matches existing course by code/name); `lib/import.ts` parses+validates
  (type/date aliases, clamps, drops bad rows). **Not done:** Flashcards due
  counts, GradeStack results (V1).
- Scheduling engine `lib/schedule.ts`: factorized scoring (deadline/effort/
  weight/neglect/pinned/late/dependency) with plain-language reasons on every
  proposal; `planDay`, `reversePlan`, `missedBlocks`, `estimateRatio`.
- Design system per `docs/DESIGN.md`: spine + course tabs (only color surface),
  slips w/ perforation, stamps, mono dates, red = late only, restrained motion.

## Gotchas already burned

- **zustand v5 + React 19:** selectors that return fresh arrays/objects MUST be
  wrapped in `useShallow` or the store loops `getSnapshot` → "Maximum update
  depth exceeded". All array-returning selectors use `useShallow`.
- `booted` flag separates persist hydration from mount; `boot()` also parses
  inbound Timer completion params once.
- localStorage shape: single document at `syllabus.folio.v1` (persist
  partialize strips actions). Bump `version:` on shape changes + migrate.
- Quick-add token grammar: `@coursecode #type due:+7|today|tomorrow|MM/DD ~90m !pin`.

## Next loop priorities

1. ~~Timer-side receiver PR~~ — DONE: dev-abhinavmishra/timer#12 (deeplink.ts
   receiver + "File back → Syllabus" on the completion takeover). E2E-verified
   round-trip: block → Timer context → stamped DONE with actual minutes.
2. ~~Keyboard reorder~~ — DONE: Shift+J/K moves the selected slip.
3. ~~Grade scenarios~~ — DONE: grade field in drawer + §1 scenario (standing, needed-on-remaining, secured/unreachable).
4. ~~Notifications~~ — DONE: optional desk reminder (one memo at open, Notification API, never required — Settings toggle).
5. ~~Course templates + recurring commitments~~ — DONE: STEM/humanities template select on course filing; weekly recurring spawns next instance on done until term end.
6. ~~Risk indicators~~ — DONE: `riskReason`/`atRisk` (fit-days>days-left, ≤3d+effort, high-weight neglected); §1 "At risk" row + cover count, neutral ink (red stays late-only).
7. E2E recorded pass on the deployed Vercel app (not just localhost).

## Design rehaul (Oct 11) — "living syllabus"
CourseView is now the course's own syllabus document (masthead, double rules,
§ sections, ruled schedule table, print view); SemesterView shows issued
syllabus covers dealt onto the desk; Today desk is the agenda page with
¶-numbered items. Institutional paperwork only — Ink owns the notebook look.
