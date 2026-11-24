# Release work plan

This coordinates the continuing handoff in `ITERRA_HANDOFF_PROMPT.txt`.
`RELEASE_READINESS.md` remains the acceptance checklist. An implementation or
passing unit test does not close a browser, usability, provider, or deployment gate.

## Current assignments

User-requested follow-up (November 21): complete the Supabase integration first,
then rework Planning using clearer binder-like tabs while retaining its established
style, and audit light/dark accessibility throughout the app. Add a student-facing
gradebook based on the existing grade capabilities, and correct Today's unbalanced
layout shown in the supplied screenshot (large empty left column next to Review
Queue and Course Overview). Inspect the existing workflows before choosing whether
the gradebook belongs in an existing tool or a separate place. Validate responsive
layouts and both themes; keep the Supabase work and personal data safe.

Additional user requests: improve each app's loading state and add restrained,
reduced-motion-aware animation; rewrite awkward product copy in natural language.
Verify a complete cross-app path: bring assignments and other work into Boxed,
organize it, start a distinct focus session, complete it with satisfying feedback,
and later record a grade against the exact assignment. Audit current Boxed,
Timer, Planning, and grade capabilities before extending the flow.
Planning and Boxed agenda items should propagate automatically in both directions
from a single user entry, with stable identity, edits, completion and deletion
handled predictably rather than requiring repeated manual imports. Verify that
automatic propagation neither duplicates tasks nor overwrites personal changes.

The active implementation owners are Luna agents. Native durability and selective
offline loading are at an implementation freeze for the next serialized typecheck,
full suite, root build, and browser verification. Nine native transaction regressions passed,
including writing after a same-store reset; this does not yet verify the complete
integrated browser flow. The latest source waits for startup migration, retains
the generation-fence database across reset, validates projection freshness, and
defers live adoption while later receipts remain. These changes still require
current-candidate verification.

The first consolidated November 21 typecheck passed after correcting new helper
and loader types. The subsequent full suite failed: 53 files, 265 passing tests,
124 failures, and one skipped test. A shared storage descriptor was unintentionally
read-only; the setup fix retains fake IndexedDB and passed the 11 Timer adapter
checks. Remaining native-backed fixture isolation, adapter expectations, queue
recovery, and projection-status behavior are being investigated. No new release
build or browser pass follows from this failed run.

After the bounded queue/projection fixes and fixture isolation changes, the
focused native transaction, backup, and note-draft checks passed 34 tests in
three files. The ten native transaction cases include rejecting a stale actor
then successfully committing a fresh same-key write after replacement, and
preserving a newer optimistic edit while an earlier commit finishes. Remaining
adapter fixture failures and the full suite are still open.

The next consolidated run passed TypeScript and reached 403 passing tests out
of 417 across 53 files (50 files passed, three failed). Fourteen failures remain:
ten session-outcome cases, two demo cleanup/context cases, and two deck-material
Planning adapter cases. Their native-authority fixtures and actual runtime
behavior are being distinguished before any assertion changes. No root build
has been made from this source yet.

The two Planning failures exposed a real command bug: the editable command state
aliased its captured baseline, so mutations produced an empty delta and false
success. The working state is now cloned separately. Session credit and Planning
adapter checks passed 50 tests (15 and 35) after the fix; demo checks passed 14,
and the earlier 34 focused persistence/backup/note cases remain green. An
independent delta-callsite review found no remaining baseline alias in identity,
demo, or the shared native updater.

The corrected source passed TypeScript and the full shell suite: 417 tests in
53 files, one worker and the recorded 20-second timeout override. The test log is
`tmp/luna-fullsuite-20261121-final.log`. The complete root build is next; this
suite pass alone does not establish cross-tab browser durability, offline update,
performance, accessibility, provider behavior, or deployment readiness.

The complete root build subsequently passed and candidate A was preserved in
`tmp/candidate-A` (policy build ID `99d60b6bc683522134cb`). Actual generated-output
inspection then found its policy points `entryUrl` at a shared imported chunk
instead of the HTML module facade. Worker installation would reject the mismatch.
Candidate A is invalid-policy evidence, not an offline-ready release candidate.
Its temporary local server was stopped before browser handoff. The emitter and
its regression are being corrected before root build B.

Root build B passed with 22 policy/runtime tests and both parity gates,
TypeScript, and Vite. It is preserved in `tmp/candidate-B`; policy entry
`/assets/index-C-C4bivj.js` matches the actual HTML module. Its build ID remains
`99d60b6bc683522134cb` because the app assets are unchanged, while the corrected
policy SHA-256 is
`370aac97578ba4b641d7d5419e14124e2cf68927ba8f02b52185cbf5fcdac2b6`.
Index SHA-256 is
`098872df3ddd06dfd95db7edfe449188159db8b8e4425036fa0d04403b1177a5`.
The verified hidden loopback server serves B on port 8090; browser durability
checks are starting. Candidate A does not establish a successful policy-to-policy
worker update because its worker could not install with the mismatched policy.

Candidate B's first two-tab browser check failed before the concurrent race.
Diagnostics captured a synchronous receipt for the newly added course and a
committed term, then native revision 4 with empty terms/courses after tab startup
and reload. Record revisions show committed deletions. This is a real durability
failure, not merely stale UI or a missing setup wait; the exact writer is being
isolated. The candidate is not ready for release or performance claims.

The browser trace isolated right-tab `Syllabus.boot()` before hydration as the
writer: setting non-persisted `booted` still invoked persist with empty default
data, producing term/course delete receipts. The current fix preserves saved
data during unhydrated writes, defers Planning boot, and gates Ink's automatic
route actions until hydration. It also protects saved preferences/folders/drafts
and prevents re-adding the default welcome note to an existing workspace. Focused
native checks passed 17 tests; lint/full suite and root build C are next. This
fix has not yet passed the repeated browser scenario.

- Engineering: run shell typecheck and suite, then the complete root build;
  verify the resulting release candidate with demo, restore, and intake checks.
  Modernize stale verifier assumptions when they contradict the integrated app.
- Assignment durability: extend pasted schedule coverage through Timer completion,
  exact assignment credit, reload, and restoration into a clean browser profile.
  Inspect retry and concurrent-delivery behavior; preserve unrelated assignments.
- Performance: create reproducible production measurements for sample and stress
  profiles, then investigate failures using the captured evidence.
- Coordination: review evidence against the full checklist, resolve ownership
  conflicts, and assign the remaining workflows after these milestones.

## Verification order

1. Complete engineering checks and identify the candidate precisely. Heavy checks
   run sequentially. Record interrupted or permission-denied checks as unverified.
2. Serve root `dist/` on loopback with SPA fallback. Run real browser workflows
   against that candidate, including service-worker installation, offline reload,
   local edits, and reconnect. Synthetic routed origins cover only their stated
   interaction and persistence scope.
3. Exercise all tool primary workflows and cold handoffs, sample removal with
   personal data retained, restore cancellation and invalid input, and two-tab
   edits. Fix verified data loss or incorrect binding before interface polish.
4. Review Paper and Graphite at 320, 390, and 1280 CSS pixels, keyboard operation,
   200% zoom, and empty/error/recovery states. Inspect screenshots visually.
   Automated accessibility checks do not establish screen-reader announcements.
5. Reserve an otherwise idle measurement window. Use five runs per specified
   scenario and report median/p75, fixture counts, browser, build, throttling,
   cache conditions, transferred bytes, and traces. Include service-worker
   traffic in the cold payload assessment; a worker-blocked probe is only an
   app-demand baseline. Verify actual native and canonical fixture stores.
6. Reconcile remaining external evidence: independent sync/provider test
   environments, GradeStack capture/roster flows, screen-reader operation,
   moderated first-use sessions, and equivalent measured alternative workflows.
   Keep missing evidence explicit while continuing independent work.
7. Audit every release gate against the final candidate before preparing the
   intended commit and publication. Preserve unrelated work and local artifacts;
   do not include generated bundles, screenshots, tmp checkouts, or the planner PDF.
   Verify remote drift again at publication time and test the actual deployment.

## Remote observations

Read-only GitHub connector checks on November 19, 2026 confirmed:

- Iterra `main`: `d8c2f15444ddd8cb77eb916727df49899a4d90eb`, matching the local base.
- Flashcards default branch `main`: `817402bce1b6fde427a3524b980de48035b19889`,
  matching the repository inventory. This does not prove integrated feature parity.
- The other seven standalone default branch names still match `REPOSITORIES.md`.

These observations expire when remotes change. They are not deployment evidence.

## Current local milestone

The Terra engineering agent reported 385 passing tests in 49 files, using
`--maxWorkers=1 --testTimeout=20000`, after the backup validation and replacement
changes. The complete root Git Bash build subsequently passed, including both
parity checks, typecheck, dependency installation, Vite, and the 89-asset
service-worker manifest. The candidate index SHA-256 is
`5170bf76a70748fc753f5454be75e3019f5f19308dd534362d6cd8081110b0ce`.

The schedule-credit verifier passed against that candidate on loopback in
isolated headless Chrome profiles: exact assignment credit and native/canonical
session records, reload, clean-profile restore, malformed/canceled restore,
sample removal preserving personal work, and legacy no-IDB replacement preserving
an unrelated database. The 390/1280 CSS pixel screenshots were visually reviewed.
Other release checks remain pending; this does not establish provider sync,
production deployment, assistive technology, or the full performance gates.

The next source batch now rejects backup export read failures, adds assessment
matching and explicit legacy review to GradeStack PDF imports, distinguishes
initial canonical loading from a real empty workspace, and separates dependency
installation from local bundling while keeping explicit clean installs in CI and
Vercel. Luna subsequently verified TypeScript, 396 tests in 50 files, and the
complete root build. The candidate index SHA-256 is
`8723e077a9ee573235869fecb07a0f6fc7ba1f66d51a54057589f366deac4e61`.
The genuine PDF export/fill/grade workflow passed, including changed Producer
metadata, mismatched assessment/layout rejection, explicit legacy review,
overlapping uploads, and reload. Schedule, demo, restore, offline, and the
strengthened 17-case intake verifier also passed on that candidate. See the
readiness log for exact scope; these results do not cover later source changes.

The two-tab verifier reproduced loss of distinct Ink notes, Planning commitments,
and edits when stale native snapshots overwrote each other. A versioned atomic
native persistence layer is being implemented for those two stores, with durable
pending-write recovery, authoritative command/adapter paths, migration and backup
integration, and independent tab selection state. This is not verified yet.
Cross-database rollback after a real storage failure remains unproven.

A diagnostic baseline showed substantial Today layout shift from delayed study
content and about 1.68 MiB of worker-inclusive compressed JavaScript response
bodies. It is not five-run performance evidence. Worker throttling and normal
runtime cache behavior remain to verify; the stress fixture must pass exact
native/canonical counts before collecting timings.

The source now generates a separate core/tool/feature cache policy from Vite's
manifest. Twenty-one Node graph/worker tests and five loader tests passed, including
warmed offline loading and online cache-write degradation. The actual emitted
policy and selective worker still need build and browser evidence. Preserve
warmed offline features and old active clients while reducing fresh cold loading.

## Publication

The user's latest November 21 instruction is to finish up and push to GitHub.
Publication now prioritizes the current verified engineering checkpoint: finish
the critical durability fixes, pass the consolidated checks, and repeat the
two-tab/recovery browser checks before pushing. Keep remaining performance,
provider, accessibility, and moderated-usability gates explicitly open; pushing
this checkpoint must not be described as perfection or full handoff acceptance.

The user explicitly authorized pushing the completed work to
`https://github.com/dev-abhinavmishra/iterra.git`. Reconcile remote drift, review
the intended commit, and satisfy the candidate gates before pushing. Verify the
resulting deployment separately; local bundle checks do not establish production
behavior. Preserve unrelated changes and local-only artifacts.

## User-supplied references

The November 21 read-only review identified useful follow-up work without changing
dependencies or copying source:

- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs): evaluate versioned
  scheduling and review logs after durability verification. Flashcards currently
  treats all unmastered cards as due. Current v6 requires Node 24 or newer; local
  checks and CI still use Node 20, while the connected Vercel project uses 24.
- [Dexie](https://github.com/dexie/Dexie.js): use transaction and migration patterns
  as references. A wrapper does not replace Iterra's receipt, merge, replay, and
  restore-fencing contracts. Defer a storage-library migration.
- [StudyDesk](https://github.com/arun-v-p/StudyDesk): compare explicit local-date
  handling, revision-session previews, and rescheduling. Timetable-aware Boxed
  fitting and subject revision sessions are possible extensions requiring their
  own product and verification scope.
