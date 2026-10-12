# iterra integration audit

Step-0 findings for the re-integration work: every storage key, every
publish/consume edge, the app×app data-flow matrix, where course identity is
born, and exactly what breaks. Read alongside WIRING.md (the current contract
this audit measured against).

## 1. Storage — every key each app writes

All apps share one origin → one localStorage. Nobody owns the shared
`iterra.v1.*` namespace but the hub; each app's own keys are siloed.

| app | keys (all `localStorage` unless noted) | contents |
|---|---|---|
| hub (shared layer) | `iterra.v1.apps` | presence map `{app: {title, summary, at, framed}}` |
| | `iterra.v1.doc.shared` | the commons: `{focus,today,activeCourse,noteActive,deck,session,register,markbook}` each `{v,by,at}` |
| | `iterra.v1.doc.feed` | stirrings `{items:[…≤30]}` newest-first |
| | `iterra.v1.doc.index.<app>` ×8 | per-app entity rows `{entities:[…≤50]}` |
| | `iterra.v1.shelf` | shell-owned pins `{pins:[…≤24]}` (Terrain chrome) |
| syllabus | `syllabus.folio.v1` (zustand persist v1) | terms, **courses**, commitments, blocks, links, reviews, settings, dismissed |
| rhythm | `rhythm.register.v1` (zustand persist v2) | routines, entries, events, mappings, exceptions, friction, reviews, experiments, **courses (own CourseRef map)**, settings, onboardingSeen |
| flashcards | `cardfile.decks.v1`, `cardfile.lastDeck`, `cardfile.theme`, `cardfile.motion`, `cardfile.migratedKeys`, `cardfile.diacriticsCleaned`, legacy `cardfile.*` deck keys, `theme` | decks (incl. free-string `course`), UI prefs, migration sentinels |
| ink | `ink-notes-storage` (zustand persist v4, quota-guarded localStorage) | notes, folders, drafts, activeNoteId, prefs |
| margin | **IndexedDB** `ModularAINotesDB` v3: `notes`, `settings`, `versions`, `decks`, `quizzes` (+ legacy localStorage `app_notes`/`app_settings` migrated then removed) | notes, study decks, quizzes |
| gradestack | `gradestack-storage` (zustand persist **v0**) | tests[], scans[], roster, settings; optional Firebase auth + Firestore sync |
| timer | `timer.sessions.v1`, `timer.settings.v1`, `timer.routines.v1` (+ legacy `platform.*` migration) | sessions log, prefs, custom routines |
| proof | `proof.workbench.v1` (zustand persist v1) | problems, attempts, sessions, **courses (own map)**, rubrics, settings |

Cloud today: only **margin** (Supabase via `/api/notes`) and **gradestack**
(Firebase auth + Firestore) sync anything, and only their private data. The
shared `iterra.v1.*` layer and every other app's data are origin-local.

## 2. Publish / consume — what each app puts out and takes in

**Publishes** (all through `iterra.*`, all localStorage-backed):

| app | presence summary | commons field | index entities | feed stirs |
|---|---|---|---|---|
| syllabus | `{slips,overdue,top}` | `today` (slips/overdue/nextBlock), `activeCourse` | blocks + uncovered commitments (`t:block`, `course`=course.code) | slip stamped, courses/commitments filed (bulk-gated), imports, restores |
| rhythm | `{marked,total,pending}` | `register` | routines, experiments (`course`=own courses[].code) | `<name> hit`, `register complete` |
| flashcards | `{due,decks}` | `deck` | decks (`course`=free string) | imported/learn/quiz/write complete, deck made |
| timer | `{running,todayMin}` | `focus` | routines only (built-in + custom; **sessions never indexed**) | session completed (standalone only), route complete |
| ink | `{open,notes,todayWords}` | `noteActive` | notes (no course field exists) | note set down |
| margin | `{notes,last}` | `noteActive` | notes, decks, quizzes (no course field exists) | margin note |
| gradestack | `{lastMark,assessments}` | `markbook` | assessments (`course`=free-string courseName) | scanned/marked/scan reviewed/assessment built/bulk waves |
| proof | `{due,attempts}` | `session` | active session + problems (`course`,`topic` real) | session started/completed, problem set down |
| shell (terrain) | — | reads all | reads all | renders feed; never emits |

**Consumes** (cross-app reads — the whole list, it's short):

| reader | reads | for |
|---|---|---|
| rhythm | `shared.focus` | shows the timer's running block on Today |
| syllabus | `shared.focus` | FOCUS chip on the bound slip |
| gradestack | `shared.activeCourse` | sidebar context line |
| ink ↔ margin | `shared.noteActive` | "sibling desk is editing X" line |
| flashcards | `shared.session` (proof) | "proof session · topic" on Proof-exported decks |
| shell | everything above | commons rail, palette, dossiers, next-up, stirrings, switcher, shelf |
| ink | `iterra.indexes()` (mesh fallback) | `[[wikilink]]` → sibling entity/dossier |
| every app | nothing else | no app reads another's index rows for function |

## 3. App × app — does data actually flow?

Mechanisms: **URL** = query-param intake consumed at boot/remount;
**postMsg** = `iterra:open/hello/hotkey`; **LS doc** = `iterra.v1.doc.*` read.

| from → to | flows? | how |
|---|---|---|
| syllabus → timer | ✅ the only real round trip | URL `?intent&minutes&course&from&block&return` |
| timer → syllabus | ✅ file-back | URL `?completedBlock&actual` → stamps block done |
| syllabus → proof | ✅ | URL `?from&topic&minutes&course` (one-way; no file-back) |
| proof → flashcards | ✅ | URL `?cards=q:a;q:a&title&course` import (one-way) |
| proof → ink | ⚠ file, not link | exports a markdown file; ink imports it manually — no direct URL contract |
| syllabus → ink/flashcards/gradestack | ⚠ stored ids | `?note= ?deck= ?assessment=` — syllabus stores **string resourceIds** typed by hand; no validation the resource exists |
| flashcards → timer | ⚠ | "Drill in timer" URL `?intent&minutes&course` (no file-back) |
| gradestack → timer | ⚠ | test-row icon same contract (no file-back) |
| dossier → timer | ⚠ | "drill \<course\>" header button (no file-back) |
| margin → anyone | ❌ | never navigates or emits actionable events |
| ink → anyone | ⚠ | wikilink mesh fallback only (read-side); can't send content out |
| rhythm → anyone | ❌ | accepts `?event` b64 JSON — **no producer exists** (dormant) |
| gradestack → syllabus | ❌ | grade data never reaches the folio; `grade` field on commitments is hand-typed |
| anyone → rhythm | ❌ | `?event` dormant; rhythm can't learn "cards reviewed" or "session done" |
| everything → feed/index/commons | ✅ read-only | shell + siblings display; nobody acts on it |

## 4. Course / topic identity — created where, matched how

Three independent course registries plus two string fields:

- **syllabus**: canonical-looking `Course{id,termId,code,name,color}` — but only
  canonical by convention; nothing enforces it.
- **rhythm**: its own `CourseRef{id,name,code?}` created in rhythm's Settings;
  routines hold `courseId` into *rhythm's* map. A syllabus "MTH" and a rhythm
  "MTH" coincide only if the user types the same code twice. (Verified: seeded
  syllabus course MTH — rhythm frame renders zero trace of it.)
- **proof**: its own `courses` map, same story.
- **gradestack**: `Test.courseName` — a free string per assessment.
- **flashcards**: `deck.course` — a free string, only set via `?course=` imports.
- **ink/margin**: no course field at all — their entities can never join a
  dossier except through the `unfiled` sentinel.
- **timer**: no course field on routines/sessions; `?course=` is pass-through
  display text carried for file-back.

**Matching** is `String.toLowerCase()` equality on `course`/`topic` in the
shell's switcher/palette/dossier code and in app bridges. Rename a code in
syllabus and every link in every other app silently orphans — there is no id
to follow, no owner to rename through.

## 5. Breakage modes

- **App missing (never mounted)**: the publish-on-run contract means its data
  is invisible — presence "quiet", no index rows, no commons, no feed. Probed:
  seeded decks/notes/sessions on disk, home rail read "nothing stirring" ×8
  and `#/c/MTH` reported "1 thing across 1 place" until each app was opened.
- **App missing (was mounted, now fails)**: watchdog banner after 7s (20s if it
  had answered before); its presence goes `stale` at 35s but its last index
  rows/commons/feed **linger forever** — the shell can't tell fresh from dead.
- **App stale (mounted but sleeping/hidden)**: keep-alive frames keep running;
  presence heartbeats continue, so "live" ≈ "mounted", not "current". An app
  edited by a *solo* copy in another tab doesn't rehydrate in the frame
  (zustand persist doesn't listen for storage events).
- **Bad data**: zero validation anywhere. `indexDoc.set()` accepts any JSON;
  a malformed entity renders garbage or crashes readers. Commons fields are
  defensive-read (`at`/`by`/shape checks) only because each reader hardcodes
  them — there is no schema.
- **Hand-applied wiring**: `iterra-hub.js` is copied into 8 places by
  `sync-hub.sh`; per-app `iterra.ts` bridges are hand-edited inside vendored
  code. A vendored re-sync silently drops the wiring; nothing in CI/build
  checks a bridge exists (README's rhythm section already warns about this).
- **Shared-layer capacity**: all mesh docs sit in localStorage (~5MB budget
  shared with app stores); `doc.set` swallows quota errors silently — index
  publish just stops working.

## 6. The suspicions — verdicts

| suspicion | verdict |
|---|---|
| Integration is a read-only mirror of summaries + ~50 index rows | **Confirmed.** The only writes that *cause* a cross-app action are URL intakes; the mesh (presence/commons/index/feed) is display-only. The shell never causes an app to do anything except mount on a URL. |
| Vendored copies + hand wiring drifts on re-sync | **Confirmed.** sync-hub.sh copies; per-app iterra.ts hand-edited; no existence check. |
| Course identity = string linkage, no owner | **Confirmed.** Three course maps + two free strings; matching is case-insensitive string equality. |
| Shared localStorage, no cross-device sync | **Confirmed.** The `iterra.v1.*` layer is localStorage-only; margin/gradestack sync only their own private stores. |
| Keep-alive frames allow stale divergent views | **Mostly confirmed.** Frames stay live but can show hours-old app state; mounted-vs-current conflated; solo-copy writes never rehydrate. |
| Shell navigates + displays, rarely causes actions | **Confirmed.** postMsg vocabulary is `hello/open/hotkey` only — no verb for "create", "send", "complete". |

## 7. Click-through — what feels disconnected (built dist on :8090, seeded
real data in 5 stores)

1. The terrain is **empty until visited**: enter syllabus → the dossier knows
   MTH; enter rhythm/flashcards later → only then do their rows appear. The
   "environment" has no memory of its own — data exists but is unpublished.
2. `#/c/MTH` showed 1 block while a `course:'MTH'` deck and an "MTH" timer
   session sat on disk: timer sessions aren't entities at all, and unmounted
   flashcards had published nothing.
3. Dossier is a **readout, not a surface**: one "drill" button; can't start a
   session, review due cards, or open the next assignment from it.
4. Rhythm's course picker is an empty separate registry — re-typing "MTH" is
   the only way a routine joins the dossier.
5. No selection→send path anywhere: text in ink, a margin note, a proof
   attempt — nothing can become a card/note/step in another app. The only
   "send" is proof's markdown file download + manual import.
6. Palette finds only the ≤50 index rows each app *chose* to publish — real
   store contents (timer sessions, attempts, scans, entries) are unsearchable.
7. Commons rail shows state but offers no actions ("next up" is the lone
   start-session affordance).
8. Each app still reads as a separate site in a frame: different boot loads,
   no shared course picker, no shared identity. The shell is a map, not an
   integration.

## Implications for the target architecture (what the audit forces)

- The canonical store must live **outside** the apps' run-loop: published at
  write-time (not mount-time), or the terrain can't be trusted when a place
  is unmounted. IndexedDB behind `window.iterra` keeps it reachable from
  every frame and the shell alike.
- `courseId` must become a real foreign key into one registry (syllabus'
  courses are the natural seed); string `course` labels stay as display
  fallbacks only.
- Deep-link intakes are the *only* proven write channel — generalize them
  into a typed `iterra.invoke`/entity-transfer contract rather than per-app
  query-param folklore; a "send to" verb needs a real payload, not a URL.
- Validation + versioning belong at the hub boundary (`doc`/entity writes)
  so a bad publisher quarantines instead of corrupting readers.
