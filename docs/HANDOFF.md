# iterra handoff

Living doc — update as the terrain changes. Read WIRING.md first: it is the
contract every app and the shell follows.

## State of the terrain (as of fe52695+)

- Branch `devin/iterra-env`, PR #1 open (not merged — Abhinav decides).
- All 8 apps vendored under `apps/<name>` + wired: build-time base, hub script
  before module entry, `register()` presence, suite links → `/apps/<name>`,
  inbound deep links, ambient commons/index/feed publishers (try/catch'd).
- `dist/` is gitignored — rebuilt locally for verification
  (`python3 -m http.server 8090 -d dist` + `scripts/smoke.cjs` over CDP 29229).
- Smoke: 14/14 (scripts/smoke.cjs) + focused checks: intake-check.cjs
  (?block= selects the slip; gradestack courseName groups on dossiers),
  focus-dossier-check.cjs (bound session → 'focus:' line on the dossier).
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
  next-up/in-session, stirrings), Search.tsx (palette + course groups),
  Dossier.tsx (course pages w/ per-row pins), shelf.ts (pins, `iterra.v1.shelf`),
  hub.ts (LS subscribers).
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
- Outbound wave (8a1cd82 era): every app now emits the timer intake
  contract somewhere — flashcards 'Drill in timer…' (Deck ▾, acc7e93),
  gradestack test-row timer icon ('study <test>'), dossier 'drill <course>'
  header button (142750c), timer engraves '← <sender>' on bound sessions
  (c4c71a4 — from= kept by parseSyllabusLink, click returns to sender).
- Rail additions: 'the ledger' aggregates due-counts from presence
  summaries (71dbffe); 'due on the terrain' next-up fallback deep-links
  a due deck when the folio is quiet (8a1cd82); palette searches stirs
  (a2a04be); mesh contract vitest (b2f9d36, 13/13); syllabus persist
  merge backfills dependencies/reasons — old blobs booted to a white
  screen (583479b, child-verified).
