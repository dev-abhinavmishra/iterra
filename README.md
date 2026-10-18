# iterra — an integrated study terrain

Eight study apps, one environment. Each app keeps its own design — the folio,
the register, the cardfile, the desk, the margin, the mark book, the
instruments, the workbench — under one theme color and one roof.

## Layout

```
shell/             the terrain — the whole app builds and ships from here
  src/apps/        the eight places, as integrated React modules
    rhythm           attendance register
    proof            calculation workbench
    syllabus         registrar's planning folio
    gradestack       bubble-sheet mark book
    timer            split-flap time instruments
    ink              ink-writing notes desk
    flashcards       index-card tin
    margin           marginalia + study sheets
  src/today        the Today workspace — what's next, live rails
  src/courses      course dossiers + library
  src/integration  commands, demo seed, backup/restore
apps/<name>/       vendored upstream sources (reference only — not built)
packages/hub/      iterra-hub.js — the one shared environment bus
api/               Margin's serverless functions (needs Supabase + Groq env vars)
docs/WIRING.md     the integration contract every place follows
```

## How it coheres

- **One origin** → shared localStorage. The hub publishes each place's live
  summary (slips due, marks taken, cards due, a running timer) to
  `iterra.v1.apps`; the terrain's Today rail reads it live.
- **Suite links stay inside** — syllabus/proof launch timer focus sessions,
  timer files minutes back, rhythm accepts `?event=` pushes, flashcards imports
  `?deck/?cards` — all routed through the shell instead of new tabs.
- **Keep-alive places** — no iframes: each place is a lazily-imported React
  subtree that stays mounted once visited; wander and return to exactly
  where you were.
- **The mesh** — every app publishes into the shared doc (`iterra.v1.doc.*`):
  commons fields (focus session, today's plan, open note, active deck…), an
  entity index (`index.<app>`, ~50 rows of blocks/decks/notes/problems with
  course/topic linkage keys), and a stirrings feed. WIRING.md §7 is the
  contract.

## Terrain surfaces

- **Commons rail** — live cross-app lines ("focus: calc drill · 18m left",
  "editing in ink: …", "course: MTH") with live-dot freshness and
  "last seen earlier" staleness.
- **The shelf** — pin any entity from a dossier row (◇); pins ride the home
  rail and show ◈ in the palette. One click back into its place.
- **Course dossiers** `#/c/<key>` — everything the mesh knows about one
  course/topic: entities grouped by place, live commons, stirrings mentions.
  Reachable from desks chips, palette group headers, switcher links, and
  in-app `iterra.open('#/c/<key>')`.
- **Next up / in session** — the folio's next block offers a bound timer
  session (files minutes back); a running session supersedes it live.
- **Palette** (`⌘K` or `/`) — every place + every published entity, grouped
  by course/topic in browse mode.
- **Switcher** — "in this place" + "linked across the terrain" + dossier
  links; ⌘1–8 places, ⌘0 home.
- **Stirrings** — the 30 newest cross-app stirs, deep-linked; the rail
  expands to show the full log.
- **Local-first durability** — every byte lives in this browser
  (localStorage + IndexedDB, persistent-storage requested at boot).
  Settings ships a full JSON backup/restore, a one-pass sample semester,
  diagnostics for queued writes, and an erase-everything reset.
- **Offline** — a service worker caches the shell, fonts, and hashed
  bundles; the whole terrain works without a network after first load.

## Dev

```bash
npm run dev                       # the whole terrain on :5173 → http://localhost:5173
cd shell && npm test              # the suite (vitest)
node scripts/verify-demo.cjs      # headless seed→use→remove pass (needs a dev server)
node scripts/verify-restore.cjs   # backup round-trip pass
```

The vendored `apps/` tree is upstream reference only — `npm run dev:apps`
runs those standalone on ports 3001–3008, which the terrain doesn't need.

## Build & deploy

```bash
npm run build                     # dist/ — shell at root, apps under /apps/<name>
```

Vercel: build command `npm run build`, output `dist`. Margin's API functions
need `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`/`ANON_KEY`, and `GROQ_API_KEY`
project env vars — without them Margin still runs local-first.

## Rhythm

`apps/rhythm` is vendored at the weekly-sequencer rehaul (upstream branch
merged). To pull future upstream work, re-sync then re-apply the wiring
(WIRING.md §§1–3): build-time base, hub script tag, `iterra.ts` bridge,
suite-link bases.
