# Iterra Integration Audit (`INTEGRATION_AUDIT.md`)

This audit inspects the actual implementation of the Iterra integrated study workspace (`shell/src/apps/*`, `packages/hub/iterra-hub.js`, `shell/src/*`) as of commit `f53d32a`, treating documentation (`README.md`, `docs/WIRING.md`, `docs/ADAPTER.md`, `docs/AUDIT.md`, `docs/HANDOFF.md`) as a starting point and verifying every claim against the source code.

---

## 1. Module Ownership, Persistence & Object Identification

All eight modules are mounted inside a single React 19 + Vite + TypeScript application (`shell/`) under hash routes (`#/`, `#/p/<place>?<query>`, `#/c/<course>`), sharing a single browser origin, `localStorage`, and `IndexedDB`.

| Module | What It Owns (Authoritative Content) | Where Data Persists | How Objects Are Identified (Local vs. Shared) |
|---|---|---|---|
| **Syllabus** (`shell/src/apps/syllabus/`) | Academic terms, canonical courses, commitments (assignments, exams, readings, etc.), planned work blocks (`WorkBlock`), resource links, weekly reviews, settings. | `localStorage['syllabus.folio.v1']` (Zustand `persist` v1). | Local IDs: `t_<rand>` (Term), `c_<rand>` (Course), `k_<rand>` (Commitment), `b_<rand>` (WorkBlock), `l_<rand>` (ResourceLink).<br>Canonical store keys: `syllabus:term:<id>`, `syllabus:course:<id>`, `syllabus:commitment:<id>`, `syllabus:block:<id>`. |
| **Rhythm** (`shell/src/apps/rhythm/`) | Habit/attendance routines, check-in entries (`Entry`), normalized suite events (`RoutineEvent`), event-to-routine mappings (`EventMapping`), day exceptions, friction logs, weekly reviews, experiments, local `CourseRef` projection. | `localStorage['rhythm.register.v1']` (Zustand `persist` v2). | Local IDs: `rty_<rand>` (Routine), `ent_<rand>` (Entry), `evt_<rand>` or `evt_hub_<app>_<type>_<tail>` (Event), `map_<rand>`, `crs_<rand>` (local course projection).<br>Canonical store keys: `rhythm:routine:<id>`, `rhythm:entry:<id>`. |
| **Flashcards** (`shell/src/apps/flashcards/`) | Cardfile decks (`Deck`) and cards (`Card`: `q`, `a`, `ex`, `starred`, `status`: `'new' \| 'learning' \| 'mastered'`). | `localStorage['cardfile.decks.v1']`, `cardfile.lastDeck`, `cardfile.theme`, `cardfile.motion` (+ legacy `flashcard_deck_*` one-time migration). | Local IDs: `<rand7><ts4>` for decks and cards.<br>Canonical store keys: `flashcards:deck:<id>`, `flashcards:card:<id>`. |
| **Ink** (`shell/src/apps/ink/`) | Rich-text notes (`Note` with TipTap JSON `content`, `tags`, `folder`, `ink` pen, `wordCount`, `trashedAt`, `dailyKey`), folders, sparse 30-min drafts (`Draft`). | `localStorage['ink-notes-storage']` (Zustand `persist` v4, quota-guarded). | Local IDs: `<ts>-<rand5>` or `intake-<intakeId>` (idempotent intake key), plus `'welcome'`.<br>Canonical store keys: `ink:note:<id>`. |
| **Margin** (`shell/src/apps/margin/`) | Source-backed notes (`Note`: markdown/HTML `content`, `transcript`, `type`: `'AUDIO' \| 'PDF' \| 'VIDEO' \| 'TEXT' \| 'IMAGE'`, `tags`, `attachments`, `pinnedMoments`, `sourceData`), note version snapshots (`NoteVersion`), study decks (`Deck` with SM-2 `Flashcard`s), quizzes (`Quiz`). | `IndexedDB('ModularAINotesDB', v3)` stores: `notes`, `settings`, `versions`, `decks`, `quizzes` (+ optional Supabase sync when env vars exist). | Local IDs: UUID/timestamp strings or `intake-<id>`.<br>Canonical store keys: `margin:note:<id>`, `margin:deck:<id>`, `margin:quiz:<id>`. |
| **GradeStack** (`shell/src/apps/gradestack/`) | Assessments (`Test`: `name`, `courseName`, `numQuestions`, `format`, `sections`, `answerKey`, `weights`) and graded bubble-sheet scans (`Scan`: `testId`, `studentId`, `studentName`, `rawScore`, `maxScore`, `percentage`, `grade`, `needsReview`, `responses`). | `localStorage['gradestack-storage']` (Zustand `persist` v0) + optional Firebase/Firestore sync. | Local IDs: `uid()` (UUID or fallback random).<br>Canonical store keys: `gradestack:assessment:<id>`, `gradestack:grade:<id>`. |
| **Timer** (`shell/src/apps/timer/`) | Completed focus/break/interval/stopwatch sessions (`Session`), custom interval routines (`Routine`), timer settings, live session recovery snapshot, queued control ops. | `localStorage['timer.sessions.v1']`, `timer.routines.v1`, `timer.settings.v1`, `timer.session.live.v1`, `timer.ops.v1`. | Local IDs: 7-char base36 random string (`Session.id`).<br>Canonical store keys: `timer:session:<id>`. |
| **Proof** (`shell/src/apps/proof/`) | Calculation/proof problems (`Problem`: `topic`, `promptDoc`, `answerSpec`, `workedSolutionDoc`, `hints`, `difficulty`), step-by-step student attempts (`Attempt`: `work` steps with Markdown/LaTeX + SVG `DrawPath[]`), error records (`ErrorRecord`), practice sessions (`PracticeSession`), spaced review schedule (`ReviewState`), rubrics, local `Course` map. | `localStorage['proof.workbench.v1']` (Zustand `persist` v1). | Local IDs: `p_<rand>` or `p_<intakeId>` (Problem), `a_<rand>` (Attempt), `e_<rand>` (ErrorRecord), `s_<rand>` (PracticeSession), `r_<rand>` (Rubric), `c_<rand>` (local Course).<br>Canonical store keys: `proof:problem:<id>`, `proof:attempt:<id>`. |
| **Hub / Shared Layer** (`packages/hub/iterra-hub.js`, `shell/src/`) | Canonical entity mirror (`entities`), event journal (`events`), untyped/lightly-typed binary links (`links`), intake queue (`intakes`), sync metadata (`meta`), presence (`iterra.v1.apps`), commons (`iterra.v1.doc.shared`), activity feed (`iterra.v1.doc.feed`), per-app entity indexes (`iterra.v1.doc.index.<app>`), shelf pins (`iterra.v1.shelf`). | `IndexedDB('iterra', v1)` with automatic fallback to `localStorage['iterra.v1.store.<bucket>']`; `localStorage['iterra.v1.*']` for presence/commons/indexes/feed/quarantine. | Composite entity keys: `<app>:<type>:<id>`.<br>Link keys: `<fromKey>|<kind>|<toKey>`.<br>Intake IDs: `in-<ts36>-<rand6>`. |

### Course & Topic Identity Analysis
- **Syllabus** is the nominal owner of `course` entities (`syllabus:course:<id>`), with `code` (e.g., `MTH`) and `name`.
- **Rhythm** and **Proof** maintain their own separate local `courses` maps in their Zustand stores (`rhythm.register.v1` and `proof.workbench.v1`) and map by `code` string at adapter mirror time.
- **GradeStack** uses a free-text `Test.courseName` string and lazily resolves `courseKeyFor(courseName)` via `iterra.courses.byCode`.
- **Flashcards** stores free-text `deck.course` and optional `deck.courseId` only when created via intake or `?course=` URL param; its UI has no course/topic selector or editor on decks.
- **Ink** and **Margin** have no explicit `course` or `topic` fields on `Note` (only `tags: string[]` and `folder`/`type`). Their adapters attempt to match `note.tags` against `iterra.courses.byCode(tag)`—meaning if a user does not manually type a course code as an uppercase tag, the note has no `courseId` or `course` linkage.
- **Topics** are currently just free-text strings (`e.topic`), with no stable topic reference or canonical normalization.

---

## 2. Existing Commands, Intakes & Events

### Current `iterra.send({ to, action, entity, payload })` Intakes
Currently, `iterra.send` queues an intake record in `iterra.intakes` (`IndexedDB` `intakes` store) and waits up to `700ms` (`intakeWhen(r.id, 700)`).
**Critical flaw in `iterra.send`:**
- If the target app is not yet mounted (or takes >700ms), `send()` returns `{ ok: true, delivered: 'queued', url: '/apps/<to>/?intake=<id>' }` **before any handler has run or validated the request**.
- Even when delivered directly (`delivered: 'direct'`), `send()` only returns `{ ok: true, delivered: 'direct', url, id }` — it does **not** return structured command outcomes, created object references (`entityKey`), or structured validation errors from the handler.
- In `shell/src/App.tsx` (line 258), a global listener on `send.delivered` automatically calls `goUrl(url)` for **every** delivered intake that has a `url`, which forcefully hijacks navigation even when a background service (like Flashcards logging an activity to Rhythm via `it.send({ to: 'rhythm', action: 'log.activity' })`) completes! Look at `flashcards/iterra-adapter.ts` line 147: reviewing a card sends `log.activity` to `rhythm`, and `rhythm`'s `log.activity` handler returns `{ url: '/apps/rhythm/' }`, which emits `send.delivered` with `url: '/apps/rhythm/'`, causing `App.tsx` to navigate the user out of Flashcards into Rhythm mid-review if Rhythm is mounted!

| Intake Action | Target App | Handler Location | What It Actually Does Today | Gaps / Issues |
|---|---|---|---|---|
| `cards.create` | `flashcards` | `flashcards/iterra-adapter.ts` | Finds/creates deck by `deckTitle`, appends `{q,a,ex}` cards, links `rec.entity.key -> flashcards:card:<id>` (`derived`), returns `{ url: '/apps/flashcards/?deck=<id>' }`. | Links are only added at card level (not deck level); no source excerpt/revision snapshot; no preview/edit before saving when sent from Ink/Margin; silently overwrites/merges by title. |
| `problem.retest` | `flashcards` | `flashcards/iterra-adapter.ts` | Alias of `cards.create` with link kind `'retest'`. | Same as above. |
| `note.create` | `ink` | `ink/lib/iterra-adapter.ts` | Creates a note with `id: intake-<rec.id>`, heading + paragraph from `payload.text`. | Does not record a `derivedFrom` link in `iterra.links`, does not carry `course`/`courseId`/`topic` onto the note's tags/metadata. |
| `note.create` | `margin` | `margin/iterra-adapter.ts` | Creates a `TEXT` note with `id: intake-<rec.id>` in Margin's IndexedDB. | Does not record a `derivedFrom` link in `iterra.links` or preserve source provenance/course metadata. |
| `step.append` | `proof` | `proof/lib/iterra-adapter.ts` | Appends `ref · <title> (<key>)` step to the latest open attempt; returns `{ retry: true }` if no open attempt exists. | If no attempt is open, stays pending indefinitely with `{ retry: true }`. |
| `problem.create` | `proof` | `proof/lib/iterra-adapter.ts` | Creates a `Problem` (`id: p_<rec.id>`) with `answerSpec: { kind: 'open' }`. | Does not link the created problem to the source entity in `iterra.links`; does not start or open a workbench attempt properly if Proof is already mounted (`boot` only runs on query change). |
| `block.plan` | `syllabus` | `syllabus/lib/iterra-adapter.ts` | Finds course by `courseId`/`course`, finds or creates an open commitment, accepts 1 `ProposedBlock`. | **Fails silently (`{ url: null }`)** if no course matches; does **not** attach the target material/deck/problem reference (`resourceId` / `ResourceLink` / `scheduledFor` relationship) to the block or commitment; returns `/apps/syllabus/` instead of `/apps/syllabus/?block=<id>`. |
| `study-plan.request` | `syllabus` | `syllabus/lib/iterra-adapter.ts` | Reads due cards, weak proof entities, and timer sessions for a course and proposes blocks. | Also fires an unprompted `routine.plan` send to Rhythm. |
| `timer.start` | `timer` | `timer/lib/iterra-adapter.ts` | Returns `{ url: '/apps/timer/?intent=...&autostart=1' }`. | If Timer is already mounted (`mounted['timer']` exists), `TimerView` uses `const pendingLink = useRef(parseSyllabusLink(linkQuery))` which is **only read once on initial mount** (`useEffect(..., [presetMinutes, presetName])`)! Subsequent deep links or `timer.start` deliveries to an already-mounted Timer **are completely ignored**! |
| `timer.control` | `timer` | `timer/lib/iterra-adapter.ts` | Pushes `{op, at}` to `timer.ops.v1` and dispatches `timer:control` CustomEvent. | Returns `{ url: '/apps/timer/' }`, which triggers `send.delivered` in `App.tsx` and forces navigation to Timer even when the user clicked pause/finish on the Ambient rail! |
| `log.activity` | `rhythm` | `rhythm/lib/iterra-adapter.ts` | Converts payload to a `RoutineEvent` draft and calls `intakeRaw`. | Returns `{ url: '/apps/rhythm/' }`, hijacking navigation via `send.delivered`; only logs into Rhythm's `events` inbox (only creates an `Entry` if user manually created an `EventMapping` in Connections). |
| `routine.plan` | `rhythm` | `rhythm/lib/iterra-adapter.ts` | Projects course and creates a `Routine`. | Conflates study commitments with attendance/habit routines. |
| `weights.import` | `gradestack` | `gradestack/lib/iterra-adapter.ts` | Copies category weights from Syllabus course entity onto matching tests. | Returns `{ url: null }` if no weights exist on the course. |

### Current Event Catalogue (`iterra.events.emit`)
`entity.upserted`, `entity.removed`, `link.added`, `link.removed`, `course.registered`, `course.renamed`, `session.started`, `session.completed`, `session.paused`, `session.resumed`, `card.created`, `card.reviewed`, `attempt.made`, `attempt.diverged`, `assignment.due`, `assignment.completed`, `grade.entered`, `note.created`, `routine.logged`, `routine.completed`, `routine.planned`, `deck.imported`, `send.delivered`, `intake.resolved`, `stir`.

- **Auto-stamping hazard in Rhythm & Syllabus:**
  - `rhythm/lib/iterra-adapter.ts` (lines 500–524) listens to `session.completed`, `card.reviewed`, `grade.entered`, `attempt.diverged` and automatically ingests them into `useRegister.getState().intakeRaw(draft)`. If a user has a `timer.*` mapping to an attendance routine, running a timer automatically marks attendance.
  - `syllabus/lib/iterra-adapter.ts` (lines 553–575) listens to `routine.logged` and automatically adds `minutes` (defaulting to 10m!) to the first open commitment in that course, conflating routine check-ins with commitment work logging.

---

## 3. End-to-End vs. Partial / Summary-Only Integrations

### What Works End-to-End Today (With Caveats)
1. **Syllabus → Timer → Syllabus (First-Mount URL Round Trip):**
   - Clicking `Start` on a `BlockSlip` in Syllabus opens `/apps/timer/?intent=...&minutes=...&course=...&from=syllabus&block=<id>&return=/apps/syllabus`.
   - **Caveat 1:** Works only on Timer's **first** mount! Because `TimerView.tsx` captures `pendingLink = useRef(parseSyllabusLink(linkQuery))` once and its `useEffect` only depends on `[presetMinutes, presetName]`, starting a second block in Syllabus while Timer stays keep-alive mounted fails to update `TimerView`.
   - **Caveat 2:** Starting a block in Syllabus does **not** open or surface the associated study material (e.g., the Flashcards deck or Ink note the block is meant to review).
   - **Caveat 3:** Finishing early (`finishEarly`) saves a local Timer session with elapsed seconds (if ≥60s) and resets the timer, **discarding the `syllabus` binding without filing back or recording a partial/interrupted/canceled outcome on the planned block**.
   - **Caveat 4:** Even on full countdown completion, `completeFocus` does not automatically update the planned block or create a `practicedIn` relationship—it waits for the user to click a "File back" button on the completion screen, which navigates to `/apps/syllabus/?completedBlock=<id>&actual=<min>`.

### What Only Navigates, Publishes Summaries, or Drops Context
1. **Ink → Flashcards:**
   - Ink's bubble menu (`RichEditor.tsx` line 540) sends `{ to: 'flashcards', action: 'cards.create', payload: { cards: [{ q: 'from "<title>" — recall', a: sel }], deckTitle: pageTitle } }`.
   - **Gaps:** No preview or card editing before saving; cannot split a multi-line or Q/A selection into multiple cards; does not carry course/topic context from Ink; does not link the deck (`flashcards:deck:<id>`) to the note (`ink:note:<id>`) with `derivedFrom` provenance (only links individual cards, and `TerrainChips.tsx` in Ink looks for `flashcards` links on `ink:note:<id>` which point to `flashcards:card:<id>`, whose URL opens the deck without provenance metadata); no source-revision tracking when the Ink note is later edited.
2. **Flashcards → Syllabus:**
   - **Non-existent today.** Flashcards has a "Drill in timer…" menu item (`controller.ts` line 1947), but **no way to schedule a review block in Syllabus** with the deck attached (`scheduledFor`) and course/topic context pre-populated.
3. **Course Workspace (`Dossier.tsx`) Chain Visualization:**
   - `Dossier.tsx` lists entities grouped by app (`byApp`), plus a broken `backlinks` section (`it.links.for(courseEnt.key).then((links: any[]) => (links || []).map(...))` — **bug**: `it.links.for()` returns `{ out: [], inn: [] }`, not an array, so `.map` throws and the `catch` swallows it!).
   - It does **not** resolve or render connected workflow chains (`Ink note → Flashcards deck → Syllabus review block → Timer focus session → session outcome`).
4. **Margin → Ink / Flashcards:**
   - Margin's `SelectionPopover` either calls AI (`runAction('flashcards')` — fails without API backend) or sends a single raw recall card to Flashcards / raw text to Ink without a review/edit step before saving, and `note.create` in Ink records no `derivedFrom` relationship or source excerpt provenance.
5. **Proof → Follow-up → Syllabus:**
   - Proof can file an `ErrorRecord` and schedule an internal spaced-repetition entry (` state.reviews[problemId]`), and send a misconception card to Flashcards.
   - However, there is **no workflow from Proof to schedule a linked follow-up retry block in Syllabus** that preserves the exact `proof:problem:<id>` and `proof:attempt:<id>` references so starting the Syllabus block returns directly to the problem in Proof.
6. **GradeStack → Targeted Review:**
   - GradeStack only shows a passive `DueCardsChip` and a raw Timer link (`?intent=study <test>`).
   - Assessments have no per-question topic mapping or manual follow-up topic selector, and cannot create/attach targeted review tasks, blocks, or decks in Syllabus/Flashcards.
7. **Rhythm ↔ Planned and Actual Activity:**
   - Rhythm auto-ingests `session.completed` and `card.reviewed` events directly into its habit pipeline, and Syllabus auto-increments `Commitment.loggedMinutes` whenever `routine.logged` fires (`syllabus/lib/iterra-adapter.ts` line 553).
   - Attendance routines, planned study blocks, and completed study sessions are conflated rather than kept distinct with explicit, reviewable logging.

---

## 4. Index Completeness vs. Authoritative Store

- **Published Indexes (`iterra.v1.doc.index.<app>`) are Truncated & Incomplete:**
  - Every app caps `index.<app>` at **50 items** (`live.slice(0, 50)`).
  - Timer only indexes `routines` (never `sessions`).
  - Proof only indexes `problems` and the 1 active `session` (never `attempts` or `errors`).
  - Rhythm only indexes `routines` and `experiments` (never `entries`).
  - GradeStack only indexes `assessments` (never `scans`/`grades`).
  - **Only mounted apps update `index.<app>`**.
- **Canonical Store (`iterra.store` in `IndexedDB` `iterra` / `localStorage` fallback):**
  - Stores full entity records (`entities`), `links`, `events`, and `intakes` without the 50-item index cap (IDB is uncapped; LS fallback caps `entities` at 2000 and `links` at 2000).
  - **Remaining Gap:** While `iterra.store` persists across reloads, each app's authoritative content still lives in its own local store (`syllabus.folio.v1`, `ink-notes-storage`, `cardfile.decks.v1`, `ModularAINotesDB`, etc.), and adapters only mirror into `iterra.store` **after that app has been loaded/mounted at least once** unless a shared bootstrap or authoritative resolver can also read/hydrate from persisted app stores.

---

## 5. Survival Across Navigation, Reload & Multiple Tabs

| Scenario | Current Behavior | Issues Found |
|---|---|---|
| **In-Shell Navigation (`#/p/a` → `#/p/b` → `#/p/a`)** | Places stay mounted in DOM (`display: none`) once visited; `iterra:wake` is posted when re-focusing a warm place. | **Bug:** Place components that only parse `query` on initial mount (`TimerView.tsx`, `proof/App.tsx`, `gradestack/App.tsx`) ignore new deep-link queries when already mounted! |
| **Page Reload (`F5`)** | Zustand stores (`syllabus`, `rhythm`, `ink`, `gradestack`, `proof`), `localStorage` (`flashcards`, `timer`), and `IndexedDB` (`margin`, `iterra.store`) persist on disk. Timer saves `timer.session.live.v1` to resume a running/paused countdown. | **Gap:** `timer.session.live.v1` only stores `{ label, blockId, course, totalMin, running, endsAt, paused, remainingSec, intent, syllabus, thenBreak }`—it does not store bound material (`deckId`/`noteId`/`problemId`) or workflow context, and if a reload happens while on another place, Timer isn't mounted until visited so `shared.focus` goes stale after 3 minutes unless restored. |
| **Multiple Tabs** | `iterra.store` broadcasts via `BroadcastChannel('iterra.core.v1')` and `localStorage['iterra.v1.poke']`. `doc(ns)` listens to `window.onstorage`. | **Gap:** App-internal Zustand `persist` stores (`syllabus`, `ink`, `rhythm`, `proof`, `gradestack`) and vanilla `cardfile.decks.v1` (`flashcards`) do **not** rehydrate on `window.addEventListener('storage')` when another tab mutates them, causing split-brain state if two tabs are open. |

---

## 6. Import/Export & Standalone Compatibility

- **Per-Module Backups:** Syllabus (`FolioBackup`), Rhythm (`RegisterBackup`), Flashcards (`library-backup`), Ink (JSON/Markdown export), Margin (JSON/Markdown export), Proof (`WorkbenchBackup`), and GradeStack (JSON backup) each export only their own private store.
- **Missing Workspace Metadata in Export/Import:** None of the exports include shared cross-module relationships (`iterra.links`), workflow provenance, source snapshots, or shared context—restoring backups loses all cross-module links and lineage.
- **Standalone Compatibility:** Each app guards `window.iterra` accesses (`if (!iterra) return;`). This must be strictly preserved so any module can run and pass tests without the shell or when `window.iterra` is absent/minimal.

---

## 7. Staged Improvement Plan

1. **Stage 1 — Shared Identity, Authoritative Resolution & Durable Relationships (`packages/hub/iterra-hub.js` + `shell/src/integration/`):**
   - Extend `iterra-hub.js` (and typed client `shell/src/hub.ts` + `shell/src/integration/`) with:
     - Authoritative object identity & resolution across Courses, Topics, Notes, Study Materials, Decks, Problems, Planned Blocks, Sessions, Assessments, and Follow-up Tasks—capable of resolving from `iterra.store` **and** directly reading persisted local app stores when an app has not yet mounted.
     - First-class typed **Relationships** (`derivedFrom`, `scheduledFor`, `practicedIn`, `assessedBy`, `followUpFor`) with rich metadata (`sourceRevision`, `excerpt`, `selectedBlocks`, `snapshot`, `courseId`, `course`, `topic`, `createdAt`, `updatedAt`), bidirectional querying (`out` and `inn`), and graceful status resolution (`ok`, `sourceChanged`, `missing`, `deleted`, `archived`).
     - Source-change detection (`checkSourceFreshness`) so editing an Ink or Margin note marks derived Flashcards decks as `sourceChanged` with an explicit review/diff update path—never silently overwriting user-edited cards.
     - Continuous navigation & workflow context (`iterra.context`) carrying current object, course/topic, originating workflow, related planned block, and active session across module handoffs without silent attachment from mere recent visits.

2. **Stage 2 — Separate Commands from Events:**
   - Add `iterra.commands.register` / `iterra.commands.exec` (while keeping `iterra.send` compatible and fixing its auto-navigation side-effect bug).
   - Commands (`createDeckFromSelection`, `scheduleReviewBlock`, `attachMaterialToBlock`, `startFocusSession`, `recordSessionOutcome`, `createFollowUpTask`, `attachSourceMaterial`, `scheduleProblemRetry`, `createTargetedReview`, `logStudyActivity`) validate inputs, enforce idempotency via `idempotencyKey`, persist durable command records, execute against target stores (even when the target place component is not yet mounted!), emit resulting completion events (`deckCreated`, `reviewBlockScheduled`, `materialAttached`, `focusSessionStarted`, `focusSessionCompleted`, `followUpTaskCreated`, etc.) **only after** durable state is written, and return `{ ok, ref, entity, relationship, error }`.

3. **Stage 3 — Complete Primary Vertical Slice End-to-End:**
   - **Ink** → select content (or use note blocks), preview & edit extracted/manual cards in a review modal with inherited/editable course & topic context → execute `createDeckFromSelection` → creates deck in **Flashcards** with `derivedFrom` relationship + source revision & excerpt snapshot.
   - **Flashcards** → from the deck, click "Schedule review block" (with pre-filled course/topic from deck, editable by user) → executes `scheduleReviewBlock` → creates a planned `WorkBlock` in **Syllabus** with `scheduledFor` relationship linking `syllabus:block:<id>` ↔ `flashcards:deck:<id>`.
   - **Syllabus** → click "Start" on the planned block → opens associated material (or provides one-click access in Timer & block slip) and binds **Timer** to both the `WorkBlock` (`syllabus:block:<id>`) and the associated material (`flashcards:deck:<id>`), preserving active session across navigation and reload.
   - **Timer** → finish session with explicit outcome confirmation (`completed`, `partial`, `canceled`, `interrupted`), recording elapsed time honestly without equating time to mastery, updating the Syllabus block and creating a `practicedIn` relationship (`timer:session:<id>` → `syllabus:block:<id>` and `flashcards:deck:<id>`) with idempotency protection against duplicate completion events.
   - **Course Workspace (`Dossier.tsx` + `shell/src/integration/workspace.ts`)** → expose and wire a clean chain resolver & component that displays the complete connected chain (`Ink note → Flashcards deck → Syllabus review block → Timer focus session → Session outcome`), where every node opens the exact object and survives reload.

4. **Stage 4 — Additional Workflows:**
   - **Margin → Ink / Flashcards:** Attach/derive from Margin note or selection into Ink note or Flashcards deck with mandatory review/edit before saving, preserving `derivedFrom` provenance and excerpt/revision metadata.
   - **Proof → Follow-up → Syllabus:** Save problem and attempt working, request retry / follow-up task, schedule a linked retry block in Syllabus (`followUpFor` / `scheduledFor`) that opens directly back to the exact problem in Proof.
   - **GradeStack → Targeted Review:** Link assessment to canonical course, support explicit question/topic mapping or manual user-selected follow-up topics (never inferring detailed weaknesses from an overall score alone), and create/attach targeted review blocks or decks (`assessedBy` / `followUpFor`).
   - **Rhythm ↔ Planned and Actual Activity:** Separate attendance/habit routines from planned blocks and completed study sessions; disable silent auto-attendance on timer completion and silent commitment minute inflation on routine check-in; provide explicit, reviewable logging of completed study activity.

5. **Stage 5 — Persistence, Cross-Tab Sync, Workspace Export/Import & Failure-Path Tests:**
   - Versioned schema migrations, cross-tab store synchronization, shared workspace metadata export/import (`exportWorkspaceMetadata` / `importWorkspaceMetadata`), missing/deleted object recovery states, and comprehensive Vitest suite covering happy and failure paths.
