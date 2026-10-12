# iterra handoff

Living doc — update as the terrain changes. Read WIRING.md first: it is the
contract every app and the shell follows.

## State of the terrain (as of 27a0974)

- Branch `devin/iterra-canonical-store`, PR #3 open (Abhinav decides).
- Canonical entity store lives in `packages/hub/iterra-hub.js` — typed,
  versioned entities, write validation + quarantine, IndexedDB `iterra` db +
  localStorage fallback, BroadcastChannel cross-frame propagation. Every app
  writes through ONE adapter file (docs/ADAPTER.md is the contract;
  scripts/check-adapters gates the build on all 8).
- Course registry: `course` is a first-class entity, syllabus owns writes,
  siblings resolve by code via `courses.byCode` — never fabricated ids.
- Event bus: `iterra.events.emit/on/list` with a documented catalogue
  (ADAPTER.md § events); `feed()` stays as a compat shim.
- Links: `it.links.add/for(key)` backlinks ({out,inn} shape — NOT a flat
  array, the lanes' docs lied). Send-to: `it.send({to,action,entity,payload})`
  — direct postMessage when mounted, durable queued intake otherwise;
  `?intake=<id>` frames navigate to the resolved url.
- Sync: margin attaches the whole-store Supabase mirror at boot when its env
  vars exist (docs/SYNC.md — wired, table `iterra_entities`, LWW).
- Ambient rail: `shell/src/Ambient.tsx` — live session pill (reads
  shared.focus endsAt, pause/resume/finish via timer.control), due-cards →
  review, next commitment, register/note chips, "+focus", toasts.
- UX-TRACKER.md: all 105 wave-1 items shipped. Section F is the wave-2
  proposal pool; three lanes currently running wave-2 (verify own surfaces
  live vs seeded store, fix hollows, audit + implement top-3 each):
  - `devin-9baa5461ace240f2b3da6933f305cfc5` — syllabus+gradestack
  - `devin-ab66d5e2322242778dcd7d9ef387c556` — rhythm+timer
  - `devin-88ff261202b24d12961b78e75a27bd42` — flashcards+margin+ink+proof
- Verify recipe: `./scripts/build.sh` → `python3 -m http.server 8090 -d dist`
  → drive Chrome (CDP :29229, playwright-core at /tmp/terra-e2e/node_modules).
  Seed the store via `window.iterra.store.put` on the top page — no app
  internals needed for shell surfaces. Live pass: 14/14 (wave2.cjs).
- Per-app bridges landed: syllabus Today/commitment-row sends, gradestack
  DueCardsChip/DossierChip/folio chips, flashcards deck-bridge + card
  backlinks + → note + due badge, margin/ink TerrainChips, proof
  RetestChip/ToMargin/due-column, rhythm folio inbox + provenance badges,
  timer quick-starts + BoundChip surfaces.

## Architecture quick map

- `packages/hub/iterra-hub.js` — THE shared file. Synced to
  `apps/*/public/` + `apps/flashcards/` by `scripts/sync-hub.sh`; build copies
  it to `dist/iterra-hub.js` (apps load `/iterra-hub.js` root-absolute).
  APIs: register/open/openApp/selfBase/interceptNav/doc/presence/onPresence/
  feed/feedItems/onFeed/index/indexes/onIndex/apps/isFramed.
- `shell/src/` — App.tsx (hash routes `#/` `#/p/<id>` `#/c/<course>`, frames
  keep-alive map, iterra:open/hello handlers incl. `#/` route pass-through,
  watchdog, ⌘ keys, switcher), Terrain.tsx (commons strip, shelf, desks chips,
  next-up/in-session, stirrings, the ledger), Search.tsx (palette + course
  groups + stir search + ⌘P pins), Dossier.tsx (course + 'unfiled' pages w/
  per-row pins, url-resolved stirs, live-focus join), shelf.ts, hub.ts.
- Dossier sentinel: `#/c/unfiled` groups every entity with no course AND no
  topic — keyless notes have a home; no drill button, no text-key stirs.
- Commons `iterra.doc('shared')` fields — see WIRING §7 table.
- Terrain surfaces: commons rail, shelf pins (◇ on dossier rows), desks chips,
  dossiers `#/c/<key>`, next-up→bound timer, in-session card, stirrings feed,
  ⌘K palette w/ course groups, switcher "in this place"/"linked across" +
  dossier buttons, ⌘1–8/⌘0 keys.

## Traps already hit (don't re-step)

- `register()` MUST be idempotent (bridges can call it twice).
- Ambient publishers: always try/catch → `console.warn('iterra ambient
  publish failed:', e)` — a throwing publish killed a whole app's commons.
- `window.open('', '_blank')` is a popup-document pattern — pass through.
- Identical-URL frame navs need the `_inav` nonce or React no-ops.
- File-back URLs without trailing slash (`/apps/proof?completedBlock=`) must
  resolve against the suite root, not the emitter's path.
- Click-intercept regex matches `/apps/<name>` with OPTIONAL trailing slash —
  bare anchors were escaping to real tabs.
- `/iterra-hub.js` is root-absolute → build MUST copy hub to `dist/` root
  or the mesh 404s in prod (was silently broken until cfda7c6).
- Solo (unframed) writers can't overwrite a fresh framed presence (35s TTL).
- `shared.focus` freshness is 15min in the rail — running sessions
  re-stamp every tick; PAUSED sessions now heartbeat every 60s (a paused
  countdown never ticks, its stamp would otherwise age out live). It
  carries `course` (the bound link's ?course=) + `blockId` — dossiers
  join on either.
- Dedupe JSONs MUST serialize every linkage field (course+topic) — a
  linkage-only change otherwise never republishes (fixed in proof, was
  already right in cardfile; full-entity stringifiers are fine).
- feed() dedupes {app,text} within 2s (multi-frame rehydration guard).
- `iterra.open('#/c/…')` / `'#/p/…'` pass straight to the shell — apps can
  route to terrain surfaces; don't rebase hash routes through URL parsing.
- Block-title resolution: `index.syllabus` entities are keyed by BLOCK id
  (8bf947a) — the space `?block=`/`completedBlock=` bindings reference.
  Commitment entities remain for coverage but share `t:'block'`.
- innerText reflects CSS text-transform — asserting 'on the shelf' lower-case
  against an uppercase-styled header is a false negative; match a link's
  visible label instead.
- `page.goto('#/…')` hash-only navigations don't reload/remount — drive
  `location.hash` in-page when verifying SPA routes.
- `crypto.randomUUID()` throws on non-secure contexts (http:// LAN) and
  unmounts whole routes — guard it (gradestack lib/uid.ts; syllabus had its
  own in utils.ts).
- Stir matching is word-boundary on text PLUS url→entity resolution — a
  stir linking a coursed entity's url files under its dossier even when the
  text never spells the key.
- Feed doc shape is `{items:[]}` not a bare array — seeded probes that
  JSON.parse it as a list crash before the assertion.
- localStorage writes in-page don't fire storage events to the same window —
  probe feed/index state by writing + reload, or drive the hub API itself.
- `shared.noteActive` arbitration: `v.at` is the note's own write/access
  time (siblings compare against their own last write); outer `at` is
  publisher freshness. Margin + ink re-stamp `at` every 2min, sibling-aware
  (never over the other desk's fresh stamp); rail + useOtherNoteActive gate
  at 5min — a dead desk's claim ages out instead of lingering.
- `timer.control` ops are durable — the adapter pushes `{op,at}` to
  `timer.ops.v1` (localStorage) BEFORE dispatching, and TimerView dequeues
  only after the op actually applies; a drain effect retries whenever
  running/hasTime flips. Ops stale-drop at 30s. An op that lands mid-boot
  or mid-navigation survives and applies when the session arms.
- The intake drain lands `result.url` ONLY for the `?intake=` launched
  record — a warm/direct delivery returns `url` to the sender instead;
  callers must `onGo(r.url)` (palette ⇥ + dossier sends already do).
- Intakes are bounded like events: IDB keeps the 500 newest DELIVERED rows
  (pruned inside intakeResolve); LS evicts oldest delivered first —
  pending rows are never evicted in either path.

## Open threads

- ink/margin have NO real course field in their models (Note = title, tags[],
  folder / type) — they emit no linkage keys rather than synthesize.
  Design note (unshipped): a structured course picker on the note is the
  honest path to notes joining dossiers — needs Abhinav's call.
- rhythm upstream closed — sibling session exited; its sequencer rehaul
  (c0145cc) is the vendored base; nothing newer to sync.
- In flight on rhythm child: ink `initialNotes` demo-library strip →
  margin-style welcome note + no seeded folders (standing no-fake-data
  rule — was indexing 3 fabricated notes into #/c/unfiled).
- Durable-intake wave (07b732b→b980f20): send-to is now exactly-once —
  per-app serialized drains + atomic IndexedDB claims (`claimedBy/
  claimedAt`, stale-claim reclaim) end duplicate deliveries (one
  problem.create previously made 4 problems); thrown/`{retry:true}`/
  timed-out handlers release the claim and stay pending (previously
  throws marked records delivered — cold-boot sends evaporated);
  scheduled re-drains + handler timeout bound hangs; no-handler records
  stay pending forever. Shell mounts cold apps at `?intake=<first-
  pending>` (hash nav, iterra:open, slot-migration — shell/src/App.tsx +
  hub.ts `firstPendingIntake`) so referential results land instead of
  evaporating; `?intake=` frames for already-delivered records navigate
  once to the stored `result.url` (the >700ms drain race). Adapter
  readiness: proof/syllabus await boot before mutating (throw 'app not
  ready' → retry), rhythm/ink await persist hydration, gradestack
  `?scanId=` deep link, ink `addNote` honors caller ids (idempotent
  re-delivery). Check: scripts/intake-matrix-check.cjs — all 14
  documented actions asserting real target-side effects, 17/17.
  Follow-ups: store.get miss → null (was truthy IDBRequest), drain nav
  same-origin gated, intakeResolve can't double-stamp, rhythm wake
  reconciles remote removes, timer binding is one-shot + file-back
  survives chained recess (files captured focus minutes), shell
  'waking <place>…' boot chip + 'N waiting' chip turns rose at
  attempts>=3 (lastError on hover), send.delivered event emitted.
- Landed recently (verify before re-doing): ?block= slip intake + ring
  (2e40d6e), entity urls carry ?block=<id> so dossier/palette/shelf clicks
  land ON the slip, FOCUS pill on bound slips, Sigma→proof pad links,
  wikilink mesh fallback (4a551ba), ?deck=<id> deck-select, ?course= on
  ?cards= + timer link, dossier live-focus join (137586b), gradestack
  courseName linkage + proof dedupe fix (fe52695), shell motion layer
  (12d5048 — all reduced-motion gated).
- Newest wave (d10f4a6 era): palette ⌘P pins the selected hit (4316705);
  dossier stirs resolve feed urls→entity keys (1ad6124); proof + syllabus
  route /apps/* launches in-place via openDeep (3a080a0 + child diff);
  'unfiled' dossier + palette 'the unfiled →' route (002eb3f); gradestack
  guarded uid (002eb3f — plain-http /builder crash); feed items carry
  course/topic keys (40eceb1 — emitters tag, never synthesize);
  next-up 'open the slip' → ?block= intake (c4705d1); 'due on the
  terrain' walks the whole ledger — decks → due problems → pending
  marks (6ce177d); smoke 17/17 (d10f4a6).
- Stir-tagging wave: every app's feed emits now carry real course keys —
  proof sessions/exports (problem courseId→code), flashcards (d.course),
  timer file-backs (syllabus.course), rhythm hits + register-complete
  (single-key only — mixed-course days stay honestly untagged)
  (38a62bd + 8ae631a). Old-blob merge guards: proof persist backfills
  arrays + deep-merges settings (a persisted settings:{} → 0-problem
  sessions; 38a62bd). links.ts contract suite 14 tests (283ecc8 —
  links-test.diff arrived with NO @@ hunks: git apply reported success
  on an EMPTY file; children must `git apply --check` before attaching).
- Stir wave 2 (c75025a→55d4510): ink demo-library strip → welcome note
  (c75025a); ink+margin iterra.ts lint debt cleared + render-path
  Date.now() staleness moved to subscribe+timer (d16e149/10e397c — typing
  exposed margin's dead `n.subject` field → real `n.type` subs); rhythm
  publish contract pinned in vitest (0a90479, 38/38); `?event` documented
  as dormant intake (4539644); gradestack register lifecycle: markbook
  scored=trusted-only, scanned/marked needsReview fork, scan reviewed on
  flag-clear, key amended→N re-graded, sheet(s)/assessment/register
  struck+restored+synced, cloud-merge + restore spam suppressed via
  un-partialed `_mergedIds` (d7100d4); syllabus `?commitment=` intake →
  drawer + entity urls reach it + slip moved/term/course filed/folio
  restored·struck stirs (d7100d4); bulk-wave suppression — begin/end
  BulkFeed gate + summary stirs (commitments filed/seeded, courses
  filed — 55d4510). Syllabus+gradestack stir inventory now CLOSED w/
  named-quiet list (amends/pins/links/settings).
- Latest wave (afaae0e→4fcc039): timer `?routine=<name>` intake +
  `?return=` protocol guard (javascript:/data:/file:/vbscript: rejected,
  tests pinned); stir wave 6368ca0 — every real syllabus/gradestack
  transition emits w/ real course keys + 7 drive-found fixes (boot
  subscribe recursion, off-day ?block= swallow, ACCEPT-ALL double-click
  dup, import code-vs-name, lingering ?scanId); margin decks/quizzes
  indexed + ?deck=/?quiz= intakes + noteActive `v.at` real-write
  arbitration (b70c281); stale ?testId falls to create mode (5512f93);
  rhythm experiments indexed + ?experiment= intake (08ebd55); hub
  forwards unclaimed terrain chords from frames — bubble phase,
  defaultPrevented yields to the app's own ⌘K (9790a24); standalone
  timer 'completed Nm' (suppressed when filing back), flashcards 'deck
  made', proof 'problem set down' stirs (4fcc039). Frame probes: ink
  wikilinks need real coordinate clicks (ProseMirror ignores synthetic
  MouseEvents); `?bust=` iframe-src defeats stale dist bundles — dist
  is gitignored so pulls never refresh it (per-clone rebuild).
  margin frame granted `microphone` scoped per-place — Permissions-
  Policy denied framed getUserMedia even over https (8f50152).
- Outbound wave (8a1cd82 era): every app now emits the timer intake
  contract somewhere — flashcards 'Drill in timer…' (Deck ▾, acc7e93),
  gradestack test-row timer icon ('study <test>'), dossier 'drill <course>'
  header button (142750c), timer engraves '← <sender>' on bound sessions
  (c4c71a4 — from= kept by parseSyllabusLink, click returns to sender).
- Rail additions: 'the ledger' aggregates due-counts from presence
  summaries (71dbffe); 'due on the terrain' next-up fallback walks the
  ledger (6ce177d); palette searches stirs
  (a2a04be); mesh contract vitest (b2f9d36, 13/13); syllabus persist
  merge backfills dependencies/reasons — old blobs booted to a white
  screen (583479b, child-verified).
