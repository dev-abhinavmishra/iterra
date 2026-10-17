# iterra app wiring contract

Every app under `apps/<name>/` keeps its own design and internals. To live inside
the iterra environment it needs exactly these changes — nothing more.

## 1. Vite base path

Production builds are served at `/apps/<name>/`. In `vite.config.ts`:

```ts
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/apps/<name>/' : '/',
  // ...existing plugins
}));
```

Dev stays at `/` so `npm run dev` is unchanged.

Apps using `BrowserRouter` (ink, gradestack) must add
`basename={import.meta.env.BASE_URL}`.

## 2. The hub script

`packages/hub/iterra-hub.js` is the one shared file. A copy lives in each app's
`public/iterra-hub.js` (synced by `scripts/sync-hub.sh`), and `index.html` loads
it before the module entry:

```html
<script src="/iterra-hub.js"></script>
<script type="module" src="/src/main.tsx"></script>
```

It sets `window.iterra`. It no-ops standalone (not framed), so apps stay
deployable on their own.

## 3. The bridge module

Each React app gets `src/lib/iterra.ts` (imported once from `main.tsx`):

```ts
declare global { interface Window { iterra?: any } }

export function wireIterra() {
  const iterra = window.iterra;
  if (!iterra) return;
  iterra.register('<name>', {
    title: '<Display Name>',
    summary: () => { /* read own store, return small JSON or null */ },
  });
}
wireIterra();
```

`register` announces the place to the shell, publishes a diff-checked summary
every ~3s, routes `window.open` + `target=_blank` navigations through the shell,
and enables `iterra.doc()` shared stores.

### Summary payloads (what the terrain's Today rail reads)

| app | summary shape |
|---|---|
| syllabus | `{ slips, overdue, top }` — today's open work blocks, overdue count, next title |
| rhythm | `{ marked, total, pending }` — entries today, routines due today, open lines |
| flashcards | `{ due, decks }` |
| proof | `{ due, attempts }` — due reviews, total attempts |
| timer | `{ running: { label, endsInMin } | null, todayMin }` |
| ink | `{ open, notes, todayWords }` — active note title, note count |
| gradestack | `{ lastMark: { name, pct } | null, assessments }` |
| margin | `{ notes, last }` — note count, last-edited title |

Keep summaries small; return `null` when the store isn't ready.

## 4. Suite base URLs → `/apps/<name>`

Every `*BaseUrl` default in app stores must point inside the environment:

```
timerBaseUrl:      '/apps/timer'
inkBaseUrl:        '/apps/ink'
flashcardsBaseUrl: '/apps/flashcards'
gradestackBaseUrl: '/apps/gradestack'
syllabusBaseUrl:   '/apps/syllabus'
proofBaseUrl:      '/apps/proof'
modularBaseUrl:    'https://modularaistack.vercel.app'   // not in iterra — stays external
```

Settings fields stay user-editable; existing persisted values keep working.

## 5. The `return` leg

Where a link emitter stamps `return=<origin>` (syllabus, proof timerDeepLink),
rebase onto the emitting app so the file-back lands inside the environment:

```ts
params.set('return', (window as any).iterra?.selfBase?.() ?? window.location.origin);
```

`selfBase()` is `/apps/<name>` framed, `origin` standalone — the contract
degrades gracefully either way.

## 6. Inbound deep links (read at boot, strip after consuming)

Already honored: flashcards `?d/?data/?deck/?cards` (incl. `?deck=<id>`
selecting a library deck — legacy localStorage-key values still fall back;
`?course=<code>` on `?cards=` persists onto the imported deck so it files
under that dossier), timer syllabus contract (incl. `?course=<code>`),
rhythm `?event/?from/?routine/?experiment`, proof `?completedBlock/from=syllabus`.
(rhythm's `?event` takes base64url JSON validated via `normalizeEvent` — it is
a dormant intake today: no in-suite app emits to it; the feed/index mesh is
the shared channel instead.)

Also honored:
- **ink**: `?note=<id>` → select note (set activeNoteId) + navigate home
- **gradestack**: `?assessment=<id>` → open that test's detail (history/analytics)
- **proof**: `?problem=<id>` → open problem in the desk
- **margin**: `?note=<id>` → open the note in the editor view; `?deck=<id>`
  → Study opens that deck (review if cards due, else editor); `?quiz=<id>`
  → Study opens the quiz runner (unknown ids stay on the browse list)
- **rhythm**: `?experiment=<id>` → Experiments view with that card scrolled
  into view and lit (unknown ids degrade to the plain list)
- **timer**: `?routine=<name>` → open Intervals focused on the named routine
  (standalone — no `from=` gate; unknown names degrade to a plain open)
- **syllabus**: `?block=<id>` → select that work slip on Today (stashed at
  boot, consumed once blocks hydrate — the subscribe-retry guards the
  persist-hydration race); `?commitment=<id>` → open that commitment's
  drawer (index entities for uncovered commitments link here; ghost ids
  degrade silently)
- **gradestack**: `?scanId=<id>` → open that sheet's review modal
  (one-shot, strips; `testId` stays as the working filter)

Match each app's existing param-stripping style (`history.replaceState`).

**Outbound bound-drill links** (emit the timer's intake contract above —
`?intent=<label>&minutes=<n>&course=<code>&from=<app>`; `?block=`/`?return=`
only when there is a real block to file back to):
- **flashcards** Deck ▾ → "Drill in timer…" (`drill <deck>`, carries `deck.course`)
- **gradestack** test-row timer icon (`study <test>`, carries `courseName`)
- **shell dossier** "drill \<course\>" header button (`from=terrain`)

Full bound-session params: `commitment=<local id>`, `block=<local id>` +
`return=<origin>` (file-back), `courseId=<canonical key>`, `mat=<canonical
material key>` — `material=` is accepted as an alias (the command layer's
`startFocusSession` emits that spelling). `timer.start` intakes map a sent
entity automatically: `commitment` → `commitment`, `block` → `block` +
`return=/apps/syllabus`, anything else with `entity.key` → `mat`. The
binding lives on `timer.session.live.v1` so a mid-session reload keeps it.

## 7. Shared context — the commons

`iterra.doc(ns)` is a per-namespace JSON store backed by the deployment's
localStorage: `get()`, `set(v)`, `setField(k, v)` (merge one field),
`subscribe(cb)` (fires for same-window writes and cross-frame storage events;
returns an unsubscribe). `iterra.presence(name?)` reads sibling presence
entries with a `stale` flag; `iterra.onPresence(cb)` subscribes to changes.

**The commons** is `iterra.doc('shared')` — an object every app may read and
write namespaced fields on. Writers stamp `{ v, by, at }` so readers can tell
who wrote and how fresh it is. Writers must be defensive: fields may be
missing, stale, or written by an app that isn't running — always check `at`.

| field | writer | readers | shape |
|---|---|---|---|
| `shared.focus` | timer | all | `{ v: { running, label, blockId, course, endsInMin } \| null, by:'timer', at }` — `course` is the bound link's `?course=` |
| `shared.today` | syllabus | all | `{ v: { slips, overdue, next } \| null, by:'syllabus', at }` |
| `shared.activeCourse` | syllabus | all | `{ v: { code, name } \| null, by:'syllabus', at }` |
| `shared.noteActive` | ink, margin | all | `{ v: { app, id, title, at } \| null, by, at }` — last opened note; `v.at` = the note's own write/access time, `at` = publish time. Readers show the line only when the sibling's `v.at` (fallback `at`) is newer than their own note's write time |
| `shared.deck` | flashcards | all | `{ v: { deck, due } \| null, by:'flashcards', at }` — active deck |
| `shared.session` | proof | all | `{ v: { topic, minutes, active } \| null, by:'proof', at }` |
| `shared.register` | rhythm | all | `{ v: { marked, pending } \| null, by:'rhythm', at }` |
| `shared.markbook` | gradestack | all | `{ v: { assessment, scored, total } \| null, by:'gradestack', at }` |

Each app's public context doc `iterra.doc('<app>')` may carry richer state
for anyone who wants more than the commons fields.

### The index — entity-level linkage

For cross-app search and "related" surfacing, every app publishes its
top-level entities to `iterra.doc('index.<app>')` as

```json
{ "entities": [ { "t": "note|deck|quiz|problem|block|routine|experiment|assessment|session",
                  "id": "<stable id>",
                  "title": "<display title>",
                  "sub": "<optional context: course code, topic>",
                  "course": "<optional course code>",
                  "topic": "<optional topic slug>",
                  "url": "<optional deep-link path for iterra.open>",
                  "at": 0 } ] }
```

Cap ~50 most-recent entities; publish on state change (not a timer). `url`
must be an `/apps/<name>/...` deep link honoring §6 intake params. The shell
turns this into a unified palette; apps may read it too.

**`course`/`topic` are the linkage keys.** The shell surfaces entities from
other apps that share a course or topic with the active place (case-
insensitive match on either field) — in the place switcher ("linked across
the terrain") and in palette grouping. Always populate `course` when the
entity belongs to a course (the same short code syllabus uses, e.g. `MTH`),
and `topic` when it's bound to a topic — an entity with neither can be
found by text search but never linked.

### The feed — unified activity stream

`iterra.feed({ text, url?, course?, topic? })` appends a notable event to
`iterra.doc('feed')` (newest-first, cap 30) — the terrain renders it as the
activity stream. Emit only real state changes worth seeing across the
terrain: a block stamped done, a deck imported, a focus session completed,
an assessment graded, a note created. Not navigation noise. `url` (optional)
is the `/apps/<name>/...` deep link back to the thing that changed.
`course`/`topic` (optional) tag the stir with its linkage key — dossiers
file a stir under its course even when the text never spells the key and
the url isn't an indexed entity. Pass them whenever the event has a known
course/topic; never synthesize from titles.

A **bulk filing is one event, not N** — per-record stirs are suppressed
during a filing wave and the caller emits one summary stir; suppressed
records still index. Syllabus pattern: `beginBulkFeed()`/`endBulkFeed()`
(module-level depth gate in the store) + `stir()` for the summary
(`commitments filed: N · <code>`, `commitments seeded: N · <code>`, `courses
filed: N`). Gradestack pattern: `_mergedIds`, a transient un-partialed
store field the ambient watcher skips emit for; mergeRemote/importData
populate it (`register synced: N`, `register restored: N`).

**Announce only trusted states** — gradestack's needsReview fork is the
model: a flagged sheet's grade is provisional, so arrival emits
`scanned: <test> — needs review` (no pct), `marked: <test> · <pct>` only
for trusted grades, and `scan reviewed: <student> · <pct>` when the flag
actually clears (a re-grade that stays flagged emits nothing).

Stirs may emit from a **store-subscription watcher** (set-diffing in
`lib/iterra.ts`), not only action call-sites — additions arriving through
any path (sync, import, duplication) announce once.

Rules: publish on mount + whenever the underlying state changes (not on a
timer — presence already heartbeats). Read defensively (`at` freshness,
`by` provenance, missing fields). Never read your own writes for authority.

### Reading the mesh (app-side APIs)

| API | Returns |
|---|---|
| `iterra.index('<app>')` | that app's entity array (or `[]`) |
| `iterra.indexes()` | `{ <app>: Entity[] }` for every publisher |
| `iterra.onIndex(cb)` | unsubscribe fn — fires on sibling index writes (storage events) |
| `iterra.presence(name?)` / `iterra.onPresence(cb)` | live `{app,title,summary,at,framed,stale}` entries |
| `iterra.doc('shared').subscribe(cb)` | fires on any commons write, same-window or sibling |
| `iterra.feedItems()` / `iterra.onFeed(cb)` | read / follow the 30-item stirrings feed |

Use `iterra.index*`/`iterra.presence` rather than reading `iterra.v1.*` keys
directly — the doc naming is an implementation detail.

**Mesh fallback for unresolved in-app links** — when an app's own link target
doesn't exist locally, it may ask the indexes before falling back to its own
create/empty behavior. Ink's `[[wikilink]]` is the pattern: local note title
first, then any sibling entity by title (opens `e.url`), then a course/topic
key (opens `#/c/<key>`), and only then the ghost-create. Reads are
best-effort — a standalone build always misses and keeps native behavior.

### Terrain surfaces that consume the mesh

- **Commons strip** (terrain home rail): one line per fresh field, click → writer.
- **Desks row**: every course/topic key found across indexes → `#/c/<key>`.
- **Dossier** `#/c/<key>`: all entities carrying that key (grouped by place),
  commons mentions (next-up block, active course, a *live focus session*
  whose `course` or bound `blockId` resolves under the key), stirrings
  mentioning it.
- **Next up / in session**: `shared.today.v.nextBlock` → bound timer URL;
  `shared.focus` supersedes while a session runs (<3m fresh).
- **Palette** (`⌘K`/`/`): places + every entity; browse groups by course/topic,
  group headers open the dossier.
- **Switcher**: "in this place" (own entities) + "linked across the terrain"
  (sibling entities sharing this place's keys) + dossier links.
- **Stirrings rail**: feed items deep-link via `url`.
- **The shelf** (`iterra.v1.shelf`): terrain-level pins — dossier rows carry a
  ◇ toggle; pinned entities ride the home rail and show ◈ in the palette.
  Shell-owned chrome state; apps don't write it.
- `feed()` dedupes identical {app,text} emits within 2s (multi-frame
  rehydration guard).

### Navigating to terrain surfaces from inside an app

`iterra.open()` accepts hash routes and passes them to the shell verbatim —
apps can send the user to a dossier or the terrain itself:

| call | lands |
|---|---|
| `iterra.open('#/c/MTH')` | course dossier for key `MTH` |
| `iterra.open('#/p/syllabus')` | that place, framed |
| `iterra.open('#/')` | home terrain |

Use these rather than `location.hash` — inside a frame, `#` alone only
rewrites the frame's own url.

## 7b. The canonical store — `iterra.store`, `iterra.events`, `iterra.links`, `iterra.send`

The mesh docs (§7) are the *mirror* — small, cheap, presence-driven. The
**canonical store** is the *truth*: typed, versioned entities persisted to
IndexedDB (localStorage fallback), journaled events, links, and a durable
send-to intake queue. Every app reads **and writes** through it — one
adapter file per app (see docs/ADAPTER.md; `scripts/check-adapters.mjs`
fails the build when an app's adapter is missing).

**Entity** — `{key:'<app>:<type>:<id>', id,type,app,courseId?,course?,topic?,
title?,sub?,url?,data?,createdAt,updatedAt,v}`. Types:
`course,term,assignment,source,note,card,deck,quiz,problem,attempt,
session,goal,grade,routine,experiment,assessment,block,commitment,link,
event,scan,entry`. `store.put` validates — bad writes return
`{ok:false,error}` and land in `iterra.v1.quarantine`, never in the store.
`createdAt` survives re-puts; `updatedAt` bumps.

**Course registry** — `course` is a first-class entity owned by Syllabus.
Other apps resolve `courseId` via `iterra.courses.byCode(code)` →
`syllabus:course:<id>` and store only that key. `course`/`topic` strings
remain display/linkage labels. Never fabricate a `courseId`.

**Events** — `iterra.events.emit(type, payload)` with the catalogue in
`it.core.eventTypes` (session.completed, card.reviewed, attempt.diverged,
assignment.due, grade.entered, note.created, routine.logged, …). Payloads
carry entity ids, not copies. `feed(item)` remains as the compat path and
journals a `stir` event; emit with a `text` payload mirrors into the feed
doc so existing readers keep working.

**Links** — `iterra.links.add(fromKey, toKey, kind)`; backlinks via
`iterra.links.for(key)` → `{out,inn}`. Provenance convention: the created
object links *to* its source with `derivedFrom` (ink/margin `note.create`,
proof `problem.create`, rhythm `routine.plan`, flashcards deck/card
intakes all emit it when the intake record carries `entity.key`); timed
practice links session → material/block with `practicedIn` via
`recordSessionOutcome`. All link writes are best-effort — a missing
`links` API must never fail the local write that triggered it.

**Send-to** — `iterra.send({to,action,entity,payload})` resolves
`{ok,delivered:'direct'|'queued',url}`: direct postMessage when the target
is mounted, else a pending intake the target's adapter drains on boot
(returned `url` is `/apps/<to>/?intake=<id>` — open it to deliver).
Targets register handlers through `iterra.adapter({name,title,summary,
intakes:{action:handler},wake})`.

Delivery is **durable and exactly-once**: drains are serialized per app,
each record is atomically claimed before its handler runs, thrown /
`{retry:true}` / timed-out handlers release the claim and stay pending
(scheduled re-drains), orphaned claims go stale and are reclaimed, and
records with no registered handler stay `pending` forever rather than
silently resolving. The shell mounts a cold app at `?intake=<first-pending
id>` (hash nav, `iterra:open`, and slot-migration all honor it) so the
frame lands on the delivered `result.url`; a frame launched at `?intake=`
for an already-delivered record still navigates once to the stored
`result.url`. Handler contracts live in docs/ADAPTER.md.

**Wake** — the shell posts `{type:'iterra:wake'}` to a keep-alive frame on
focus; adapters' `wake` re-reads the store. No stale views.

## 8. Dev topology

Shell dev proxy maps `/apps/<name>` → `localhost:<port>`:

```
rhythm 3001 · proof 3002 · syllabus 3003 · gradestack 3004
timer 3005 · ink 3006 · flashcards 3007 · margin 3008
```

`npm run dev:apps` at the root starts every app on its port.

## 9. Verification

Per app: `npm ci && npm run lint && npm run build` must pass.
No new dependencies in apps. No design changes — same look, same motion.
