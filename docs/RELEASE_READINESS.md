# Iterra release readiness

Use this checklist for the integrated app described in [PRODUCT_REVIEW.md](PRODUCT_REVIEW.md), [WIRING.md](WIRING.md), and [DESIGN.md](../DESIGN.md). Record the build commit or diff, browser and device, fixture, steps, and result for each gate. A test is evidence for the behavior it exercises. Check the current release build before marking an item complete.

## Product and usability

- [ ] **First study session.** In a clean profile, create a real course and assignment from Today, start a bound focus session, finish it, and find the results in Planning and the course workspace after reload. Verify exact block and assignment identity even when titles match. Run the separate sample semester path and verify sample data can be removed without removing personal work.
- [ ] **A student's daily loop.** With a populated term, find and act on next work, due review, recent notes, and overdue work from Today. Find a course and its related material, including unfiled items. Rename a course and verify retained links. Find and complete each tool's primary task with representative data: plan work, record attendance, review a deck, write a note, annotate a document, assess work, run a timer, and practice a problem. Verify handoffs in both directions where supported, including delivery to a tool that hasn't loaded.
- [ ] **Feature coverage.** Run at least five moderated first-use sessions without coaching, including at least two on mobile and one keyboard-only. Target four of five completing the first study session in five minutes, excluding time spent waiting for the timer. Record every unmet need. Resolve release-blocking study tasks and document which requests represent optional enhancements, with evidence. Treat the review's other recommendations as hypotheses until interviews or observed workflows support them.
- [ ] **Focused, polished interface.** Review empty, populated, loading, error, and offline states in Paper and Graphite at 320, 390, and 1280 CSS pixels. Today shows one clear next action when there's work to do, with at most one equally prominent secondary action. Verify no duplicate primary actions in shell chrome, no horizontal overflow on core flows, and no overlap between controls, notifications, and content. At 200% zoom, all core controls remain reachable and named. Record screenshots and compare with DESIGN.md.
- [ ] **Accessible navigation.** Run the first-session and backup flows with keyboard alone, then check announcements with at least one screen reader. Verify visible focus, predictable Tab order, skip navigation, Escape dismissal, dialog focus restoration, expanded states, and reduced motion. Require zero keyboard blockers and zero serious or critical automated accessibility findings on the tested core screens. Manually review status text, contrast, and icon-only controls.

## Data and offline

- [ ] **Durability and recovery.** On the release build, confirm a new course, assignment, note, deck, and recorded session survive reload and retain the expected links and minutes. Retry session recording with the same and different delivery keys, including overlapping requests; each session should produce one row and one credit. Exercise two tabs without losing either edit. Download and restore a backup in a clean test profile and confirm representative records from each storage layer return. Verify an invalid backup file and cancellation preserve data.
- [ ] **Offline and sync coverage.** After a connected visit primes the production service worker, go offline, reload, and complete a local workflow. Reconnect and verify queued behavior. In separate preconfigured test environments, check shared sync inactive, offline, queued, error, and connected states, along with second-device visibility for shared records. Check independent GradeStack sync with a test account. Confirm the UI distinguishes browser backups and the two sync scopes. Mark provider and account checks unverified if a test environment is unavailable.

## Performance

Use a production build and current Chromium. Keep machine and browser versions fixed. Compare fresh profiles and warm reloads with the same populated fixtures. Use both the sample semester and a stress fixture with 10 courses, 200 commitments, 500 notes, and 1,000 cards. On the mobile run use a 390 × 844 viewport, 4× CPU slowdown, 1.6 Mbps downstream, 750 Kbps upstream, and 150 ms latency. Capture navigation and interaction traces for at least five runs per scenario and report the median and 75th percentile.

- [ ] **Timing budgets.** Target mobile cold Today LCP at or below 2.5 s and CLS at or below 0.1. Target warm Today to Planning and Planning to Today usable content within 500 ms at p75. Target visible feedback within 200 ms at p75 for opening workspace options, selecting a course, and starting focus. Use trace interaction timing for lab checks and label any field INP separately.
- [ ] **Payload and scale.** Measure transferred JavaScript for a cold Today visit and target at most 500 KiB compressed before the first tool opens. Verify no tool-only chunks load before needed. On the stress fixture, key navigation and search meet the same warm timing budgets and 20 route switches leave resident memory within 20% of the stabilized warm value after garbage collection. Inspect traces and retained DOM if the budgets fail.
- [ ] **Comparative claim.** For performance comparisons, name the apps, versions or test dates, equivalent flows, conditions, and measurements. Run comparable cold landing and warm task navigation flows on at least two alternatives in the same environment. Aim to match or beat the fastest measured p75 for each agreed comparable flow. Report Iterra's position on each metric separately. Local budgets and two comparisons cannot establish a market-wide ranking.

## Engineering and evidence

From the repo root, run the same dependency installs as [CI](../.github/workflows/ci.yml), then:

```bash
npm --prefix shell test
npm run lint
npm run build
```

The root build checks adapter and API parity, typechecks, builds the shell, and emits the service-worker manifest. Serve the resulting root `dist/` with SPA fallback on loopback for browser checks. With that release candidate running at the URL below, execute:

```bash
npm run verify:demo -- http://localhost:8090
npm run verify:restore -- http://localhost:8090
ITERRA_BASE=http://localhost:8090 node scripts/intake-matrix-check.cjs
```

Keep production and external accounts out of the test profiles. Browser smoke scripts supplement the checklist.

| Evidence so far | Scope |
| --- | --- |
| TypeScript, adapter parity, and API parity passed on earlier iterations. The shell suite previously passed 314 tests with a 20 s timeout override; default timing failures occurred in existing tests. | Rerun ordinary CI gates on the current candidate. Record timeouts and any overrides. |
| Focused regressions passed for data status, dialog and dropdown keyboard behavior, Today block binding, and outcome recording. | Unit and component coverage only. Repeat against current code and verify end-to-end. |
| Production browser exploration exercised assignment focus credit before reload. An early run reported different persisted minutes after reload. | Recheck in a clean profile seeded once. Durability remains open until the current build retains the result. |
| No complete current-candidate evidence has been recorded for the full production build, assistive technology, offline and provider behavior, usability sessions, or performance budgets. | Keep the respective release items open until evidence is recorded. |
