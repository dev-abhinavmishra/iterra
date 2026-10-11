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

Already honored: flashcards `?d/?data/?deck/?cards`, timer syllabus contract,
rhythm `?event/?from/?routine`, proof `?completedBlock/from=syllabus`.

To add:
- **ink**: `?note=<id>` → select note (set activeNoteId) + navigate home
- **gradestack**: `?assessment=<id>` → open that test's detail (history/analytics)
- **proof**: `?problem=<id>` → open problem in the desk
- **margin**: `?note=<id>` → open the note in the editor view

Match each app's existing param-stripping style (`history.replaceState`).

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
| `shared.focus` | timer | all | `{ v: { running, label, blockId, endsInMin } \| null, by:'timer', at }` |
| `shared.today` | syllabus | all | `{ v: { slips, overdue, next } \| null, by:'syllabus', at }` |
| `shared.activeCourse` | syllabus | all | `{ v: { code, name } \| null, by:'syllabus', at }` |
| `shared.noteActive` | ink, margin | all | `{ v: { app, id, title } \| null, by, at }` — last opened note |
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
{ "entities": [ { "t": "note|deck|problem|block|routine|assessment|session",
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

`iterra.feed({ text, url? })` appends a notable event to
`iterra.doc('feed')` (newest-first, cap 30) — the terrain renders it as the
activity stream. Emit only real state changes worth seeing across the
terrain: a block stamped done, a deck imported, a focus session completed,
an assessment graded, a note created. Not navigation noise. `url` (optional)
is the `/apps/<name>/...` deep link back to the thing that changed.

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

### Terrain surfaces that consume the mesh

- **Commons strip** (terrain home rail): one line per fresh field, click → writer.
- **Desks row**: every course/topic key found across indexes → `#/c/<key>`.
- **Dossier** `#/c/<key>`: all entities carrying that key (grouped by place),
  commons mentions, stirrings mentioning it.
- **Next up / in session**: `shared.today.v.nextBlock` → bound timer URL;
  `shared.focus` supersedes while a session runs (<3m fresh).
- **Palette** (`⌘K`/`/`): places + every entity; browse groups by course/topic,
  group headers open the dossier.
- **Switcher**: "in this place" (own entities) + "linked across the terrain"
  (sibling entities sharing this place's keys) + dossier links.
- **Stirrings rail**: feed items deep-link via `url`.
- `feed()` dedupes identical {app,text} emits within 2s (multi-frame
  rehydration guard).

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
