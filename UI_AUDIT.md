# Iterra UI Audit & Redesign Plan

## 1. Current Architecture & Findings

Iterra is a single React 19 + Vite + TypeScript application (`shell/`) mounting eight study modules directly as keep-alive React subtrees (`shell/src/apps/<name>/`) alongside shell surfaces (`Terrain`, `Dossier`, `Search`, `Ambient`).

### Routing & Navigation
- **Current routes** (`shell/src/route.ts`):
  - `#/` → `Terrain.tsx` (an 8-card app-launcher grid + right-hand status rail).
  - `#/p/<place>[?query]` → mounts/reveals `<Place>` inside a keep-alive container (`display: block` vs `display: none`).
  - `#/c/<course-key>` → `Dossier.tsx` (single-column entity dump grouped by app).
- **Navigation fragmentation**:
  - On `#/`, there is **no global navigation bar**—only a masthead title (`iterra`) and date stamp.
  - On `#/p/<place>`, a minimal 48px bar (`shell/src/App.tsx:310-510`) appears with a place switcher dropdown, search button, timer pill, and "restart ⟳" button.
  - On `#/c/<course-key>`, the top bar disappears again, replaced by an inline `← terrain` link inside `Dossier.tsx`.
  - Users have no primary top-level navigation (`Today`, `Courses`, `Library`, `Tools`), no persistent course/topic selector, and no persistent contextual inspector.

### Duplicated Controls & Nested Chrome
Because all eight modules were originally standalone apps, mounting them inside the shell produces stacked headers, competing sidebars, and duplicate theme/help/search controls:
1. **Flashcards** (`shell/src/apps/flashcards/markup.ts:6-23`): Renders its own 56px `.topbar` with wordmark (`flashcards · index cards, filed`), `saved in this browser · decks travel by link`, keyboard shortcuts button, theme toggle (`T`), and motion toggle—directly below the shell header. Its empty state (`#empty-stage`, lines 50–74) is a standalone marketing pitch ("A card file that fits in a link... no accounts, no server") rather than a contextual workspace creation flow.
2. **Rhythm** (`shell/src/apps/rhythm/App.tsx:139-186`): Renders a tall chassis header with wordmark (`RHYTHM · weekly sequencer`), `run` LED, duplicate LCD date readout (`fmtDayFull(todayISO())`), and its own tab bank.
3. **Timer** (`shell/src/apps/timer/App.tsx:101-126`): Renders a top masthead (`TIMER · TIME INSTRUMENTS · EST. YOUR WORKDAY`) plus a fixed bottom dock (`z-[100]`) that collides with `Ambient.tsx` (`bottom-3 z-40`).
4. **Proof** (`shell/src/apps/proof/components/TopTabs.tsx:46-85`): Renders its own dark banner (`Proof · calculation workbench`) with view tabs and duplicate help button (`?`).
5. **Syllabus** (`shell/src/apps/syllabus/App.tsx:138-167`): Renders a vertical `SYLLABUS` seal spine plus a sheet header with `TopTabs` and a duplicate date stamp.
6. **Ink** (`shell/src/apps/ink/components/Navigation/SideNavBar.tsx:86-208`): Full 248px sidebar with giant `Ink.` wordmark, fake user footer (`W · Writer · local-first, on this device`), and its own `⌘K` palette that shadows the global palette.
7. **Margin** (`shell/src/apps/margin/components/Sidebar.tsx:92-121`): 240px sidebar with `Margin` wordmark, duplicate `Search ⌘K` button, and its own `CommandPalette`.
8. **GradeStack** (`shell/src/apps/gradestack/components/Sidebar.tsx:40-179`): 248px sidebar with `GradeStack · Bubble sheet grading` wordmark, collapse buttons, and mobile header.

### Home ("Terrain") & Status Language Issues
- **App-Launcher Grid**: `Terrain.tsx` dedicates the primary 2-column canvas to 8 equal-weight app cards (`the Folio`, `the Register`, `the Cardfile`, etc.) that require users to choose *which app to open* rather than *what work to do*.
- **Vague / Cryptic Copy**:
  - Unmounted or idle apps display `quiet`, `nothing stirring`, or `last seen earlier`.
  - Entity counts on cards say `3 filed` without explaining what those objects are.
  - Literary names (`the Folio`, `the Mark Book`, `the Instruments`, `the Workbench`) take visual priority over functional names (`Planning`, `Assessments`, `Timer`, `Calculations`).
  - Footer displays raw database counters (`N filed · M events · K links`).

### Course Dossier Limitations
- `Dossier.tsx` (`#/c/<course-key>`) is a narrow (`max-w-2xl`) vertical list of entities grouped by app name (`Syllabus · the Folio · 3`), rather than a structured course workspace.
- Relationships (backlinks via `iterra.links.for`, derived decks, sessions, grades, scheduled blocks) are either buried in flat pill rows or require hopping into individual modules.

### Existing Hub & Backend Support (Verified in `packages/hub/iterra-hub.js`)
- **Canonical Store (`iterra.store`)**: `put`, `get`, `list({ app, type, courseId, course, topic, limit })`, `search(text, q)`, `due({ app, type, courseId, course, before })`, `remove`, `subscribe`.
- **Courses (`iterra.courses`)**: `list()`, `byCode(code)`, `resolve(ref)`.
- **Links (`iterra.links`)**: `add(fromKey, toKey, kind)`, `remove(fromKey, toRef, kind)`, `for(key)` → `{ out, inn }`, `list()`.
- **Intakes (`iterra.send` / `iterra.intakes`)**: Durable cross-app actions (`cards.create`, `problem.retest`, `note.create`, `step.append`, `log.activity`, `timer.start`, `timer.control`, `routine.plan`, `block.plan`, `problem.create`, `weights.import`, `study-plan.request`).
- **Commons (`iterra.doc('shared')`)**: Live `focus`, `today`, `activeCourse`, `noteActive`, `deck`, `session`, `register`, `markbook`.
- **Sync Status (`iterra.sync.status()`)**: Returns `{ attached, adapter, attachedAt, lastPull, error, queued }` plus local IndexedDB/localStorage persistence state.

---

## 2. Redesign & Implementation Plan

### A. Unified Design System & Themes (`shell/src/ui/` & `shell/src/index.css`)
- Establish shared CSS custom properties and primitives for **Paper (Refined Atlas)** and **Graphite / Silver (Workstation)** themes, persisted in `localStorage` (`iterra.v1.theme`) and applied on `document.documentElement` (`data-theme="paper" | "graphite"`).
- Build reusable components in `shell/src/ui/`:
  - `Button`, `IconButton`, `Badge`, `Chip`, `RelationshipChip`
  - `Input`, `Select`, `Tabs`, `SegmentedControl`
  - `Dialog`, `Sheet` (responsive drawer on narrow viewports), `DropdownMenu`
  - `EmptyState`, `StatusBanner`, `ToastRegion`
  - `ObjectRow` (standardized entity row with icon, functional type badge, course/topic pill, timestamp/due state, pin toggle, context-select, and quick actions).
- Standardize nomenclature in `shell/src/places.tsx`: functional names (`Planning`, `Attendance`, `Flashcards`, `Notes`, `Study Materials`, `Assessments`, `Timer`, `Calculations`) lead; literary place names (`the Folio`, `the Desk`, etc.) are preserved as secondary subtitles.

### B. Single Workspace Shell (`shell/src/App.tsx`, `shell/src/route.ts`)
- **Primary Navigation**:
  - `Today` (`#/`) — Action-oriented daily workspace.
  - `Courses` (`#/courses` and `#/c/<course-key>`) — Course directory and first-class Course Workspaces.
  - `Library` (`#/library`) — Unified cross-module object browser with filters by type (Notes, Study Materials, Decks, Quizzes, Problems, Assessments, Plans, Sessions), course, and search query.
  - `Tools` — Direct switcher and dock for all 8 specialized working surfaces (`#/p/<place>`), with warm-mount indicators and pending intake badges.
- **Global Top Bar**:
  - Primary nav tabs (`Today`, `Courses`, `Library`, `Tools` dropdown/strip).
  - Global Course/Topic Context selector (filters Today/Library or jumps to Course Workspace, and syncs context).
  - Global Command Palette trigger (`⌘K` / `/`).
  - Live Focus Session controller inline in the top bar (countdown, course badge, pause/resume/finish controls, or quick-start `+ Focus`).
  - Clear Save / Persistence status indicator (`Saved locally · IndexedDB` or cloud sync state from `iterra.sync.status()`), plus pending intake status.
  - Theme toggle (`Paper` / `Graphite`) and Context Panel toggle.
- **Workspace Mode for Embedded Modules**:
  - Scope `.it-workspace-mode` on the shell's place host so redundant standalone mastheads, duplicate wordmarks, and competing chrome are cleanly suppressed or compacted while keeping all module view tabs, toolbars, and working surfaces 100% functional.
  - Ensure standalone mode (outside `.it-workspace-mode`) remains untouched.

### C. Redesign Today Around Actionable Work (`shell/src/today/TodayWorkspace.tsx`)
Replace the 8-app launcher grid with an actionable workstation layout:
1. **Active Session / Focus Banner**: When a timer or practice session is live/paused, show full session controls, linked block/course, and elapsed/remaining time.
2. **Resume Working**: The exact object most recently worked on (`shared.noteActive`, `shared.deck`, `shared.session`, or newest canonical store entity), with one-click resume and context inspection.
3. **Next Up (Scheduled Work)**: Planned blocks and upcoming commitments from Planning (`shared.today.v.nextBlock` + open `block`/`commitment` entities), with linked course, duration, "Start Focus Session", and "Open in Planning".
4. **Review & Follow-Up**: Due flashcards (`card`/`deck` entities with due counts), due proof problems, and open attendance routines—each with direct action buttons (`Review Deck`, `Attempt Problem`, `Log Attendance`) and zero fabricated metrics.
5. **Course Overview**: Active courses with real counts of open tasks, due cards, study materials, and recent grades—or a clean "Create or import a course in Planning" prompt when empty.
6. **Recent Work**: Concrete recent notes, decks, problems, assessments, and materials across the canonical store, with relationship chips and context inspection.
7. **Tools Strip**: Compact, scannable bar providing direct 1-click entry to all 8 tools with functional names first.

### D. Promote Course Dossiers into Course Workspaces (`shell/src/courses/`)
- Evolve `#/c/<course-key>` into `CourseWorkspace.tsx` with five structured tabs:
  - **Overview**: Next scheduled block/commitment, due practice items, recent materials & notes, connected relationships (`iterra.links`), and quick creation actions (`Start Focus`, `New Note`, `New Deck`, `New Problem`, `Plan Block`).
  - **Materials**: Notes (`ink`, `margin`), study sheets, and sources filed under or linked to the course, plus ability to create a course-tagged note or study sheet.
  - **Practice**: Flashcard decks, due cards, quizzes, and Proof problems/attempts for the course, showing derivation links (e.g., deck derived from a note, retest card from a diverged proof attempt).
  - **Schedule**: Planned work blocks, syllabus commitments, and Rhythm attendance routines for the course, with direct "Start Focus" and "Send to Attendance".
  - **Results**: GradeStack assessments, marked scans, grade trajectory, and logged focus session history (`session` entities with minutes).
- Add `#/courses` (`CoursesIndex.tsx`) to browse all courses + `Unfiled` items and create/open courses.

### E. Shared Collapsible Context Panel (`shell/src/context/`)
- Implement `WorkspaceContext` (`shell/src/context/WorkspaceContext.tsx`) and `ContextPanel.tsx` that tracks the **currently selected or active object** (selected row in Today/Course/Library, active note in Ink/Margin, active deck in Flashcards, active problem/session in Proof, active assessment in GradeStack, or active block in Syllabus).
- Answers four questions clearly:
  1. **Course & Topic**: Which course and topic this object belongs to (with link to the Course Workspace).
  2. **Source / Provenance**: Module, object type, creation/update timestamp, and inbound origin link (`iterra.links.for(key).inn`, e.g., "Derived from Margin note" or "Retest from Proof attempt").
  3. **Connected Work**: Outbound links (`iterra.links.for(key).out`) and sibling objects sharing the same course/topic.
  4. **Available Actions**: Real, working `iterra.send` and deep-link actions:
     - *Start 25m Focus Session* (`timer.start`)
     - *Create Flashcards* (`cards.create`)
     - *Send to Notes (Ink)* (`note.create`)
     - *Send to Study Materials (Margin)* (`note.create`)
     - *Create Calculation Problem* (`problem.create`)
     - *Schedule in Attendance* (`routine.plan`)
     - *Schedule Study Block* (`block.plan`)
     - *Pin / Unpin to Shelf*
- On narrow screens (`< 1024px`), render as an accessible slide-over drawer/sheet (`role="dialog"`) instead of squeezing columns.

### F. Flashcards Workspace Integration (`shell/src/apps/flashcards/`)
- When running inside Iterra:
  - Suppress the duplicate `.topbar` wordmark chrome in workspace mode while preserving deck search, library list, and keyboard/motion controls.
  - Replace the standalone marketing empty state ("A card file that fits in a link...") with a **Contextual Deck Creation & Study Hub** that shows active course/topic context, allows creating a deck bound to a course, or importing cards directly from existing Notes (`ink` / `margin`) and Problems (`proof`) in the canonical store.
  - Show course badge, source backlinks, and connected work in the deck header, and sync the selected deck with the shell's Context Panel.
  - Clarify persistence and sharing labels: distinguish **Saved in workspace** (local browser + canonical store), **Export file** (`.json` / `.csv`), and **Snapshot link** (`Copy snapshot link` — explicitly explaining that the URL encodes a static copy of the deck at this moment, not a live collaborative document).
  - Preserve `Review`, `Learn`, `Quiz`, `Write`, and `Cards` editor modes and keep selected deck/session state alive across navigation.

---

## 3. Contracts Requested from the Integration Track

In accordance with the parallel-agent boundary, the UI consumes existing `iterra.store`, `iterra.links`, `iterra.courses`, `iterra.send`, and `iterra.doc('shared')` contracts without modifying `packages/hub/iterra-hub.js` or app adapters. The following contracts are documented for the integration track:

1. **Course / Topic Assignment on Ink & Margin Notes (`entity.courseUpdate`)**:
   - *Need*: `ink` and `margin` notes currently lack a native `courseId` / `course` field in their internal stores (relying on tag resolution in Ink or remaining unfiled in Margin).
   - *Requested contract*: Support an intake or store-sync hook on `ink` and `margin` adapters so setting a course/topic in the shell Context Panel or note header persists `courseId` and `course` onto the underlying note record and mirrors it to `iterra.store`.
2. **Active Selection Broadcast (`shared.selection` or `iterra.selection`)**:
   - *Need*: While `shared.noteActive`, `shared.deck`, `shared.session`, `shared.today`, and `shared.markbook` publish the active top-level object per module, sub-entity selection (e.g., highlighting a paragraph in Margin/Ink or selecting a single commitment row in Syllabus without opening its drawer) isn't broadcast to `shared`.
   - *Requested contract*: A lightweight `shared.activeObject` field `{ key, app, type, id, title, course, topic, selectionText?, at }` written by module adapters on item selection so the shell Context Panel can offer "Create flashcards from selection" without custom DOM bridges.
3. **Bidirectional Block ↔ Material Attachment (`block.attachMaterial`)**:
   - *Need*: Syllabus commitments support string `resourceIds`, and `iterra.links.add(fromKey, toKey, 'attached')` records graph edges in the canonical store, but Syllabus's internal `WorkBlock` / `Commitment` drawer does not yet read `iterra.links.for('syllabus:commitment:<id>')` to display attached Margin/Ink/Flashcards entities natively inside the Syllabus drawer.
   - *Requested contract*: Have the Syllabus adapter/drawer hydrate attached resources from `iterra.links.for(commitmentKey)` and accept a `block.attach` intake `{ commitmentId, blockId, entity }`.
4. **Assessment Follow-Up Task Intake (`assessment.followUp`)**:
   - *Need*: GradeStack publishes `grade` and `assessment` entities, but creating a targeted remediation block in Syllabus or retest deck in Flashcards from missed questions requires question-level breakdown in the canonical `assessment`/`scan` entity `data`.
   - *Requested contract*: Include missed-question prompts/tags in `gradestack:scan` / `gradestack:assessment` entity `data` and support a one-click `cards.create` / `block.plan` payload from low-scoring assessment items.
