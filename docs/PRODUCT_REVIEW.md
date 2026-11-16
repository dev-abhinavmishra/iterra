# Iterra Product Review

**Research date:** 2026-11-14
**Audience:** Product and engineering
**Status:** Repository and public-product review; recommendations are hypotheses until validated with students.

## Executive summary

Iterra is a local-first study workspace that brings eight specialized tools into one course-aware environment: planning, attendance/routines, flashcards, notes, study materials, assessments, a focus timer, and calculation practice. Its strongest product idea is not that it has eight tools; it is that work can move between them and stay connected to a course. The Today, Courses, and Library surfaces, shared entity store, durable cross-tool actions, and course links provide the base for a coherent study loop.

The project has already implemented much of the cohesion work described in its earlier audits. The current shell has Today, Courses, Library, a global palette and context panel, ambient focus controls, course workspaces, a canonical store, durable sends, backup/restore, and offline shell caching. `docs/UI_AUDIT.md` describes several of these as absent and should be treated as a historical redesign proposal, not a reliable current-state inventory. The UX tracker marks its 105 listed items complete; that is evidence of shipped scope, not evidence that students can discover or use it easily.

The largest product opportunity is to make a student's first useful study session feel obvious and dependable. The largest product risk is trust: the system has multiple per-app stores plus a canonical shared store, while cross-device sync coverage differs by data type. The recommended next investment is product validation and coherence: simplify the first-run path, clarify where data lives and what syncs, reduce competing shell signals, and measure successful study workflows before adding more feature breadth.

## Product and system today

### What the student can do

The product combines these places under one shell:

| Place | Main job |
|---|---|
| Syllabus | Organize courses, terms, commitments, and scheduled study blocks |
| Rhythm | Track attendance, routines, and study intentions |
| Flashcards | Create and review decks using several study modes |
| Ink | Write and organize notes |
| Margin | Import and work with study documents, notes, and study materials |
| GradeStack | Build answer sheets, scan/mark work, and review assessment results |
| Timer | Run focus sessions and routines |
| Proof | Work through calculation problems and schedule retries |

The shell adds Today as an action-oriented daily workspace, Courses and course workspaces, a unified Library, global search/command palette, a context panel, an ambient rail, pins, and cross-tool navigation. Course pages group related work; the shared store and links let the shell surface objects and their provenance across places. The main path is: plan a commitment, start a bound focus session, study or create material in a specialized place, and return to the course with the resulting work linked.

### How it works

- `shell/` is the deployed React/Vite application. It mounts the integrated tools as lazily loaded React subtrees and keeps visited places mounted, so navigation can preserve their in-memory state. `apps/` contains the vendored upstream sources; it is reference/source material, not the shell's build entry point.
- `packages/hub/iterra-hub.js` provides the shared environment API. App adapters mirror shareable objects into a validated, versioned canonical entity store, publish selected live state, emit events, create links, and receive cross-tool actions.
- The canonical store uses IndexedDB with a localStorage fallback. Durable intake records queue actions for a tool that is not mounted and retry delivery until the receiving adapter handles them. Course IDs, entity links, events, and shared live fields support the cross-place experience.
- Each tool still has its own store for some or all of its working state. The shell backup captures localStorage and IndexedDB data, and restore returns it. The app requests persistent browser storage, and production registers a service worker for offline use after assets have been cached.
- Remote sync is not uniform across all user data. The optional Supabase adapter mirrors the canonical shared store when the required environment and authenticated session are available; GradeStack has its own optional Firebase/Firestore sync. Tool-private state outside those synced layers remains device-local. Users should not infer that every edit is available on every device just because the shared entity index syncs.

### Repository evidence and documentation drift

- `README.md`, `docs/HANDOFF.md`, `docs/WIRING.md`, `docs/ADAPTER.md`, and `docs/SYNC.md` describe the current integrated architecture and its contracts.
- `shell/src/App.tsx`, `shell/src/today/TodayWorkspace.tsx`, `shell/src/courses/`, `shell/src/context/ContextPanel.tsx`, and `shell/src/integration/backup.ts` confirm that core workspace, context, and data portability surfaces exist in code.
- `docs/UI_AUDIT.md` says the shell lacks primary navigation, Today, Courses, and Library surfaces while proposing their creation. Those findings conflict with the current shell and should be revalidated before being used to scope new work.
- `docs/UX-TRACKER.md` contains 105 checked items. `docs/HANDOFF.md` says 106 items shipped and also embeds a commit-specific state snapshot. Update or annotate these counts and snapshots when they next inform a decision.
- The Getting Started guide is currently attached to the unfiled course workspace and provides a first set of steps for each place. It explains tool operations, but the repository does not establish whether new students find it or complete a meaningful end-to-end study session.

## Competitive patterns

These references inform interaction patterns; they do not prove that Iterra should copy a competitor's full scope.

| Product | Publicly described strength | Useful lesson for Iterra |
|---|---|---|
| [MyStudyLife](https://mystudylife.com/media/) | Puts classes, homework, exams, revision, reminders, and cross-device access into a student-centered planner; its current product messaging also describes an assistant grounded in the student's schedule. | Lead with the student's week, deadlines, and next action. Treat class/term setup as a core onboarding task. |
| [StudySmarter](https://www.studysmarter.co.uk/) | Connects notes, flashcards, summaries, and revision planning as one learning workflow. | Make transformation from source material to practice visible and easy; show provenance so the student trusts where study material came from. |
| [Quizlet](https://help.quizlet.com/hc/en-us/articles/360030841732-Studying-on-Quizlet) | Combines flashcard sets with several practice modes and AI-assisted study guides/tests, with web and mobile access. | Offer the right practice action at the point of need, but measure learning utility before increasing mode count or generation features. |
| [Anki](https://faqs.ankiweb.net/what-spaced-repetition-algorithm) and [AnkiWeb sync](https://docs.ankiweb.net/syncing.html) | Focuses on durable spaced-repetition review and explains how collection sync works across devices. | Make review scheduling, progress continuity, and sync state legible. A specialist tool can succeed through depth and reliability rather than breadth. |
| [Notion Calendar](https://www.notion.com/product/calendar) | Brings commitments and project timelines together and allows users to act on linked workspace items from the calendar context. | Connect the schedule to the object being worked on; avoid making students reconstruct context across screens. |
| [Todoist](https://www.todoist.com/help/todoist/features) | Uses quick task capture, flexible views, filters, recurring tasks, and reminders to make planning approachable. | Keep capture and completion lightweight; expose advanced organization only when a student needs it. |

## Prioritized opportunities

Priority and effort are qualitative estimates based on repository evidence, not user research. **P0** means address before expanding scope; **P1** means the next product improvement cycle; **P2** means validate or defer. Effort is relative engineering effort.

| Priority | Opportunity and evidence | User benefit | Effort / risk | Suggested success measure |
|---|---|---|---|---|
| P0 | **Validate and streamline first-run setup.** Getting Started instructions exist, and Settings offers a sample semester, but neither proves that the first visit guides a student to a useful outcome. The product has eight tools, which creates a high choice burden. | A new student can set up one course and reach a first completed study action without understanding the architecture. | **M**. Risk: adding a wizard can become a second onboarding system. Prototype the smallest course → commitment → focus → study path and reuse existing surfaces. | In moderated first-use sessions, students can create or load a course, find the next task, and complete a study action without facilitator help; track time-to-first-completed-session and abandonment by step. |
| P0 | **Make data location, backup, and sync coverage explicit.** Backup/restore covers localStorage and IndexedDB, while canonical-store sync and GradeStack sync have different prerequisites and scopes. Sync status exists, but the product must communicate which category of data is actually protected or available elsewhere. | Fewer surprises after switching devices, signing out, losing browser data, or encountering a sync error. | **M–L**. Risk: a misleading “synced” badge. Define status by data scope and distinguish local save, queued remote write, synced, and unavailable before broad sync claims. | Students can correctly answer where notes, decks, plans, and grades are stored and whether each is backed up/synced; backup export/restore completion and sync-error recovery rates. |
| P1 | **Keep the home experience task-first and make its hierarchy testable.** Today already aggregates a live session, next work, due/recent items, and tool entry points. The opportunity is clarity, ordering, and frequency of use, rather than implementing the old UI audit's proposed Today surface again. | Students see the one or two most useful actions for now without scanning eight equal-weight destinations or interpreting system jargon. | **S** for copy/order experiments; **M** for structural changes. Risk: hiding a less common workflow. Test with real course data and retain direct access to every tool. | In usability tests, students identify and start their next study action quickly; fewer wrong-tool launches and fewer unanswered “what does this status mean?” questions. |
| P1 | **Make course workspaces the stable center of continuity.** The canonical course registry and dossier/workspace already connect objects and links. Verify that planning, notes, practice, sessions, and results feel like one course history, including unfiled items and course renames. | Students can find related work from the course and understand how a note, card, problem, or session connects to an assignment. | **M**. Risk: expanding dossier density before confirming the most-used sections. Start with course overview and the next practical action; tune other sections from observed use. | Students complete a note-to-practice or commitment-to-session workflow without losing course context; measure linked-object rate and successful course-level retrieval. |
| P1 | **Reduce chrome competition and improve accessible wayfinding.** The apps began as separate products and retain distinct visual identities. The shell has global navigation and shared controls, so verify for duplicated labels, headers, keyboard commands, focus order, reduced-motion behavior, and narrow-screen collisions. | A calmer, more predictable interface that works with keyboard, assistive technology, and small screens. | **M**. Risk: flattening the visual identities that make tools recognizable. Keep tool-specific identity inside the work area while reserving global controls for the shell. | Keyboard-only completion of core workflows; no critical accessibility blockers in an audit; lower duplicate-control and mis-navigation rates in usability sessions. |
| P2 | **Reduce integration maintenance through generated or mechanically verified vendored wiring.** The hub is copied into app public folders, while adapter files and app sources coexist in vendored and integrated locations. Existing scripts check adapter presence and hub drift, so first measure breakage and update cost. | Fewer regressions after upstream refreshes and faster delivery of UX fixes across tools. | **M–L**. Risk: a source-of-truth migration can disrupt stable integrated apps. Improve generation/checks incrementally before removing vendored sources. | Every integration build verifies expected adapters and hub versions; record manual merge/rework time and integration regressions per refresh. |
| P2 | **Validate analytics and AI before expanding them.** The codebase includes usage metrics, study generation/import paths, and assessment analytics, but the reviewed repository does not establish that more dashboards or generated content improve learning outcomes. | Keep attention on learning actions and trusted material instead of novelty or raw activity totals. | **S–L**, depending on feature. Risk: removing useful feedback or creating unreviewed generated study material. Keep existing workflows; run small quality and comprehension studies before expanding. | Students report that generated material is accurate and useful; learners can explain what an analytics signal means and what action it suggests. |

## Keep / simplify / defer / remove

| Decision | Recommendation | Rationale |
|---|---|---|
| **Keep** | All eight specialized study places; the shared store, links, and durable cross-tool actions; Today, Courses, Library, course workspace, keyboard palette, backup/restore, and offline shell support. | These are the product's differentiating workflow foundation. There is no usage evidence in the repository that justifies removing a tool. |
| **Simplify** | First-run choices, shell terminology, overlapping status signals, and the visual boundary between global navigation and each tool's own controls. Explain a function before its metaphorical name; reserve status indicators for actionable or trust-critical states. | The suite's breadth and vocabulary can obscure the next step. Keep specialist controls where they help the actual task. |
| **Simplify** | Product and integration documentation. Mark `UI_AUDIT.md` as historical or update it after a current-state audit; reconcile the UX item count and dated handoff notes when touching those docs. | Current docs can lead product planning back toward already-built surfaces. Do not discard useful historical findings without preserving their context. |
| **Defer** | New study tools, social/classroom collaboration, parent views, gamification/leaderboards, broad AI expansion, and new analytics surfaces until student research shows a concrete unmet need. | These add privacy, quality, support, and maintenance costs and are not required to prove the integrated study loop. Competitor availability alone is not user evidence. |
| **Remove only with evidence** | Retire a specific control, metric, duplicate bridge, or standalone artifact only after usage and maintenance data show it is unused or safely replaced. In particular, do not remove any of the eight tools based on this repository review. | The source shows implementation cost and duplication, but not actual student usage or the value of a specialized workflow. |

## Product principles

1. **Start with the student's work.** Organize the experience around courses, deadlines, and the next useful study action.
2. **Keep the learning loop connected.** Planning, focus, notes, practice, and results should retain course context and visible provenance.
3. **Make trust visible.** Tell students what is saved, backed up, queued, synced, or only available on this device.
4. **Reveal complexity as needed.** Preserve specialist depth without making every tool, metric, and command compete for attention.
5. **Prefer evidence over feature count.** Validate learning and task completion before adding breadth.

## Suggested sequence

1. **Validate the current experience:** audit a clean install and a returning student flow; reconcile current documentation; test core journeys with students on keyboard and narrow screens.
2. **Fix trust and first success:** clarify first-run path and data/sync states; improve backup discovery and recovery guidance; address the highest-severity navigation/accessibility issues.
3. **Deepen course continuity:** use student evidence to tune course overview and cross-tool provenance; measure whether course pages reduce retrieval and context-switching effort.
4. **Reduce maintenance and expand selectively:** automate repetitive hub/adapter synchronization after measuring its cost; expand learning-generation or analytics only when a study demonstrates value.

## Assumptions and limits

- The likely core audience is an individual student managing courses, study materials, practice, focus time, and deadlines. This follows the product's vocabulary and workflows; it has not been confirmed through interviews.
- Recommendations are based on source and documentation inspection plus public competitor descriptions. This review did not include student interviews, production telemetry, accessibility testing, or a fresh end-to-end visual audit.
- Competitor descriptions reflect their linked public pages checked on the research date and should be rechecked before a future strategic decision.
- Effort estimates are relative and directional. Validate them with the maintainers before committing a roadmap.

## Repository references

- [README.md](../README.md)
- [Integration audit](../INTEGRATION_AUDIT.md)
- [UI audit and redesign proposal](../UI_AUDIT.md)
- [UX tracker](UX-TRACKER.md)
- [Handoff](HANDOFF.md)
- [Wiring contract](WIRING.md)
- [Adapter contract](ADAPTER.md)
- [Sync design](SYNC.md)
