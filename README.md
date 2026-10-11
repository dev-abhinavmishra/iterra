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

## Rhythm is mid-flight

`apps/rhythm` is vendored from its open MVP branch — the working session may
still be landing commits. Re-sync with:

```bash
rsync -a --delete --exclude='.git' --exclude='node_modules' --exclude='dist' \
  ../rhythm/ apps/rhythm/
```
