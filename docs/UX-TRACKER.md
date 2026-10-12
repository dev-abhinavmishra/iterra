# iterra UX tracker — the cohesion wave

The terrain reads as one environment, not 8 framed apps. Numbered, checkboxed,
implemented in waves. `[x]` = shipped (commit), `[~]` = partial, `[ ]` = open.

Contract for every item: real state only (canonical store / commons / real
intakes) — no decorative placeholders. Each wave ends green (vitest + build)
and e2e-verified where the surface is user-visible.

## A. Ambient presence — "it's running, and I can see it anywhere"

- [x] 1  Persistent ambient rail on every surface — app frames, terrain, dossier (a floating dock; the chrome bar's lone timer pill was the seed)
- [x] 2  Live session pill with a real ticking countdown (shared.focus endsInMin + at → seconds countdown)
- [x] 3  Paused sessions stay visible — publish {paused:true, remainingMin}, not null ("paused · 12m")
- [x] 4  Pause / resume a running session from the rail — `timer.control` intake → TimerView listener
- [x] 5  Stop a session from the rail (reset → clears the pill)
- [x] 6  Jump to the running session (pill → bound timer place URL)
- [x] 7  Break state reads distinctly ("break · Nm" — different chip tone)
- [x] 8  Session-end toast anywhere in the terrain ("focus · 25m — ps4 logged" on session entity arrival)
- [x] 9  Due-cards badge: live due count → click opens flashcards review
- [x] 10 Next-commitment chip: nearest non-done commitment → jump to syllabus
- [x] 11 Register chip: today's pending marks (shared.register marked/total) → open rhythm
- [x] 12 noteActive chip: the page open in ink → jump back to it
- [x] 13 activeCourse chip → that course's dossier
- [x] 14 Mounted-frame presence dots — which places are warm, click to jump
- [x] 15 Rail collapses to icon chips on narrow widths
- [x] 16 Stale focus pruning — a session older than its length reads "went quiet", dimmed
- [x] 17 Elapsed time alongside remaining ("18m in · 7m left")
- [x] 18 Session pill suppressed inside the timer place itself
- [x] 19 "+" on the rail → quick-start a session (palette of bound targets)
- [x] 20 Course chip on the session pill → that course's dossier

## B. Transfer UX — things actually moving between apps

- [x] 21 syllabus commitment → rhythm routine: "plan on the register" (CommitmentDrawer + dossier verb) → `routine.plan` intake → addRoutine
- [x] 22 rhythm routine → syllabus work block: `block.plan` intake on syllabus → files a commitment from a routine
- [x] 23 Dossier "plan the week": batch-send pending commitments to rhythm as one weekly routine
- [x] 24 Due-cards → "queue on the register" (a review intention lands in rhythm's log)
- [x] 25 margin note → ink page (margin send menu gains an ink target)
- [x] 26 ink selection → margin note (BubbleMenu send — shipped, verified)
- [x] 27 ink selection → proof problem (`problem.create` intake — richer than step.append)
- [x] 28 commitment → proof problem (send a commitment to the workbench as the problem prompt)
- [ ] 29 card → margin note (a card's q/a becomes note text)
- [ ] 30 deck → dossier review shortcut (due badge on deck → review)
- [x] 31 Send-to on dossier entity rows (⇥ on each row)
- [ ] 32 Send-to on terrain rail entries
- [ ] 33 Bulk send — select several hits, one target (stretch)
- [ ] 34 Send result → "open it" chip (deep-link toast on delivery)
- [x] 35 Queued sends show "delivers when opened" state, not silent
- [ ] 36 routine.completed → nudge the linked syllabus commitment's progress note
- [ ] 37 session.completed bound to a routine course auto-marks the register (verify intakeRaw path)
- [x] 38 session minutes → logged on the commitment (shipped)
- [ ] 39 exam study-plan → also offered as a rhythm routine scaffold
- [ ] 40 gradestack grade row → course dossier link

## C. Shell chrome + navigation

- [x] 41 Place switcher: warm/cold dot per place (mounted frame vs not)
- [x] 42 Switcher live badges: running timer · due count · pending marks
- [x] 43 Cycle places chord (⌘⇧→/←) — if it doesn't collide
- [x] 44 Chrome breadcrumb: place → its course dossier
- [x] 45 Palette verb section: "start", "review", "plan" queries surface actions, not just entities
- [x] 46 Palette send-to keyed by stable identity (shipped — survives polls)
- [ ] 47 Palette entity detail: selected hit → field drawer + action verbs
- [ ] 48 Palette recency: empty query shows recent entities first
- [x] 49 Pending-intake badge on rail entries + switcher ("2 waiting")
- [ ] 50 Terrain rail entries actionable (extend ledger verbs → pending intake chips)
- [ ] 51 Terrain "now" strip: running session + next commitment atop the map
- [x] 52 Dossier backlinks section — links.for(course) readout ("what's linked here")
- [x] 53 Dossier session log: this course's sessions with minutes
- [ ] 54 Dossier grade chip: latest grade + delta vs previous
- [ ] 55 Dossier "related" — courses sharing a topic
- [x] 56 Unfiled dossier gets the same verbs + "file under…" action
- [x] 57 Shelf pins tooltip shows the pin's place
- [x] 58 "open solo" also copies the deep-link
- [ ] 59 Watchdog banner gains a "retry" that auto-fires once
- [ ] 60 Wake-refresh pulse on frame re-entry (subtle, skip if noisy)
- [x] 61 `?` opens a shortcut cheatsheet
- [x] 62 prefers-reduced-motion audit pass on new motion
- [ ] 63 Terrain footer: store stats (N entities · M events · K links)
- [x] 64 "/" hint lives on the rail, not only the search button
- [x] 65 Send-to menu names the place, not just the action

## D. In-app bridge surfaces — each app shows its siblings

- [ ] 66 syllabus Today: "N cards due" chip → review
- [ ] 67 syllabus Today: "Nm logged today" chip → sessions
- [ ] 68 commitment row: "plan on the register" (with the drawer's Focus)
- [ ] 69 commitment row: "make a card" send
- [ ] 70 rhythm day cell: source-app badge on ingested events
- [ ] 71 rhythm routine detail: linked course dossier
- [ ] 72 rhythm: "from the folio" inbox — recent commitments as routine scaffolds
- [ ] 73 gradestack grade row: "N cards due" chip
- [ ] 74 gradestack: logged-minutes links through to the session list
- [ ] 75 gradestack weights chip: source syllabus course link
- [ ] 76 flashcards deck header: course dossier link
- [ ] 77 flashcards deck: "session for this deck" bound timer start
- [ ] 78 flashcards deck: "log a review" → register
- [ ] 79 flashcards card: source backlink (note / attempt) via links.for
- [ ] 80 timer session list: bound commitment → syllabus jump
- [ ] 81 timer: quick-start chips for recent courses
- [ ] 82 timer takeover banner → the session's dossier
- [ ] 83 margin note: "in deck · N" chip via links.for
- [ ] 84 margin note: "open in ink" (note.create to ink)
- [ ] 85 ink page: backlink chips (in margin · in deck)
- [ ] 86 ink: course binder quick-link
- [ ] 87 proof attempt: retest-card state chip (scheduled / due)
- [ ] 88 proof: weak topic → due cards chip
- [ ] 89 proof step: send to margin note
- [ ] 90 every app: "open in terrain" uses canonical deep-links

## E. Contracts + data layer

- [x] 91 Pause-aware shared.focus (paused + remainingMin published)
- [x] 92 `timer.control` documented in ADAPTER.md
- [x] 93 `routine.plan` documented in ADAPTER.md
- [x] 94 `problem.create` documented in ADAPTER.md
- [ ] 95 Intake {toast} contract: a drained intake may surface a toast line
- [ ] 96 links.for surfaced in palette entity detail
- [ ] 97 Catalogue: `routine.planned`, `session.paused`, `session.resumed`
- [ ] 98 store.due() helper — dueAt-ordered card query (or documented filter)
- [ ] 99 visibilitychange wake-refresh verified in all 8 apps
- [ ] 100 sync adapter: Supabase wiring sketch documented (margin's env vars)

## F. Motion + designed feel

- [ ] 101 Ambient rail anim-rise consistent with the terrain's motion system
- [ ] 102 Countdown digits borrow the timer's split-flap character in miniature
- [x] 103 Session pill breathes in the final minute
- [ ] 104 Send-to menu springs (not pop-in)
- [ ] 105 Dossier verbs stagger on mount

---
Waves: **1** = A (ambient rail + timer control + paused commons).
**2** = B core (21-24, 27-29, 34-35) + contracts (91-97).
**3** = C chrome (41-51, 57-65).
**4** = D per-app bridges (lanes).
**5** = E+F leftovers + motion pass.
