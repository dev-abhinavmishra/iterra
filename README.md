# iterra — an integrated study terrain

Eight study apps, one environment. Each app keeps its own design — the folio,
the register, the cardfile, the desk, the margin, the mark book, the
instruments, the workbench — under one theme color and one roof.

## Layout

```
apps/<name>/       the eight places (vendored sources, own toolchains)
  rhythm           attendance register            → /apps/rhythm
  proof            calculation workbench          → /apps/proof
  syllabus         registrar's planning folio     → /apps/syllabus
  gradestack       bubble-sheet mark book         → /apps/gradestack
  timer            split-flap time instruments    → /apps/timer
  ink              ink-writing notes desk         → /apps/ink
  flashcards       index-card tin                 → /apps/flashcards
  margin           marginalia + study sheets      → /apps/margin
shell/             the terrain — home, chrome, keep-alive frames
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
- **Keep-alive frames** — visited places stay mounted; wander and return to
  exactly where you were.
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
- **Stirrings** — the last 12h of cross-app activity, deep-linked.

## Dev

```bash
bash scripts/sync-hub.sh          # once, and after editing the hub
npm run dev:apps                  # every place on its port (3001–3008)
npm run dev                       # the shell on :5173 → http://localhost:5173
```

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
