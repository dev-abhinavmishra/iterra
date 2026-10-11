# iterra handoff

Living doc — update as the terrain changes. Read WIRING.md first: it is the
contract every app and the shell follows.

## State of the terrain (as of 8f50152)

- Branch `devin/iterra-env`, PR #1 open (not merged — Abhinav decides).
- All 8 apps vendored under `apps/<name>` + wired: build-time base, hub script
  before module entry, `register()` presence, suite links → `/apps/<name>`,
  inbound deep links, ambient commons/index/feed publishers (try/catch'd).
- `dist/` is gitignored — rebuilt locally for verification
  (`python3 -m http.server 8090 -d dist` + `scripts/smoke.cjs` over CDP 29229).
- Smoke: 17/17 (scripts/smoke.cjs — sender chip, dossier+shelf,
  workflow-card routing, open-the-slip) + focused checks:
  intake-check.cjs, focus-dossier-check.cjs,
  drill-check/dossier-drill-check/markbook-drill-check.cjs.
- Children (SWE-2-max) run standing verify/implement queues:
  - `devin-4edd25facad54ca0b834833dc9933ffe` — syllabus + gradestack
  - `devin-a19adc3b30f34c65a10948e003db0905` — proof + timer + flashcards
  - `devin-b0dcadbd314c4cf1a56cec31d9a0e574` — rhythm + ink + margin
- Children never commit/push; they attach `.diff` files; head agent reviews,
  applies, re-runs lint/tests/build, commits to the branch.

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
- `shared.focus` freshness is 3min (per-minute heartbeats while running);
  generic commons fields are 10min live / 1h dead. It carries `course`
  (the bound link's ?course=) + `blockId` — dossiers join on either.
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

## Open threads

- ink/margin have NO real course field in their models (Note = title, tags[],
  folder / type) — they emit no linkage keys rather than synthesize.
  Design note (unshipped): a structured course picker on the note is the
  honest path to notes joining dossiers — needs Abhinav's call.
- rhythm upstream closed — sibling session exited; its sequencer rehaul
  (c0145cc) is the vendored base; nothing newer to sync.
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
