# The iterra adapter contract

Every app talks to the terrain through **one adapter file**. It is the only
place the app calls `window.iterra.*` store APIs. `scripts/check-adapters`
fails the build when an app's adapter is missing or doesn't implement the
interface.

| app | adapter file | loaded by |
|-----|--------------|-----------|
| syllabus | `apps/syllabus/src/lib/iterra-adapter.ts` | imported once from the app entry |
| proof | `apps/proof/src/lib/iterra-adapter.ts` | " |
| rhythm | `apps/rhythm/src/lib/iterra-adapter.ts` | " |
| gradestack | `apps/gradestack/src/lib/iterra-adapter.ts` | " |
| timer | `apps/timer/src/lib/iterra-adapter.ts` | " |
| ink | `apps/ink/src/lib/iterra-adapter.ts` | " |
| margin | `apps/margin/iterra-adapter.ts` | " |
| flashcards | `apps/flashcards/iterra-adapter.js` | `<script>` in index.html (vanilla JS) |

Each adapter must export/init `registerAdapter()` (TS) or call
`iterra.adapter({...})` at boot (JS) with this shape:

```js
iterra.adapter({
  name: 'rhythm',                 // app id — must match the apps map
  title: 'Rhythm',
  summary: () => ({ pending: n }),           // small object → presence doc
  intakes: {
    'log.activity': (rec) => { /* handle */ return { url: '/apps/rhythm/' }; },
  },
  wake: () => { /* pull fresh state; frames are keep-alive */ },
});
```

`rec` = `{ id, action, from, entity, payload, at }`. Return `{ url }` for the
shell to navigate to, or `null` when nothing visual happened. Return
`{toast}` (optionally with `url`) for a one-line confirmation the ambient
rail surfaces via an `intake.resolved` event. Throw → the intake stays
pending and retries on next drain.

## Intake delivery semantics (durable)

- **Records persist** in IndexedDB (localStorage fallback) until delivered.
- **Atomic claim**: before a handler runs, the record is claimed
  (`claimedBy` + `claimedAt`). Concurrent drains (multiple pokes, frames, or
  tabs) can never invoke the same handler twice. Claims orphaned by a dead
  frame go stale and are reclaimed by the next drain.
- **Serialized per app**: drains for a given app run one-at-a-time.
- **Retry semantics**: a handler that throws, returns `{retry:true}`, or
  hits the handler timeout releases its claim and stays `pending`. The hub
  schedules a re-drain (bounded backoff) until it delivers. A handler that
  returns `null`/`{url}`/`{toast}` is delivered.
- **No matching handler**: the record stays `pending` — it is never
  silently resolved.
- **`?intake=<id>` launches**: when the shell cold-mounts an app that has a
  pending intake, it mounts the frame at `/apps/<id>/?intake=<id>`. After
  the handler delivers, the frame navigates to `result.url`. If the record
  was already delivered by a concurrent drain, the launched frame still
  lands once on its stored `result.url`.
- **Readiness**: handlers that mutate local stores should await their own
  hydration/boot flag (e.g. `await whenBooted()`) and throw `'app not
  ready'` until then — the retry path handles the rest. Never mutate a
  zustand store before its persist rehydrates.

## What an adapter does

1. **Registers** itself via `iterra.adapter()` at boot (idempotent).
2. **Mirrors** the app's own records into the canonical store —
   `iterra.store.put({app, type, id, courseId?, course?, topic?, title?, sub?, url?, data?})`
   — on every create/update/delete of a shareable record. Keys:
   `'<app>:<type>:<id>'`. `courseId` is a canonical course KEY
   (`syllabus:course:<id>`), resolved via `iterra.courses.byCode(code)` —
   never fabricate one. `course`/`topic` strings stay as labels.
3. **Emits events** from the catalogue via `iterra.events.emit(type, payload)`
   where it has real news. Payloads carry entity ids (`sessionId`, `cardId`…)
   plus `text`/`course`/`topic`/`url` for the feed mirror.
4. **Handles intakes** other apps send it (`iterra.send({to,action,entity,payload})`).
5. **Refreshes** on `wake` — the shell calls it when a keep-alive frame
   regains focus.

## Event catalogue (EVENT_TYPES)

`entity.upserted entity.removed link.added link.removed course.registered
course.renamed session.started session.completed session.paused
session.resumed card.created card.reviewed
attempt.made attempt.diverged assignment.due assignment.completed
grade.entered note.created routine.logged routine.completed
routine.planned deck.imported send.delivered intake.resolved stir`

Emit only types in the catalogue — others are rejected.

## Intake catalogue (who receives what)

| action | to | payload |
|--------|----|---------|
| `cards.create` | flashcards | `{entity|payload:{cards:[{q,a,ex?}], deckTitle?, course?, courseId?}}` → creates a deck, returns `{url}` |
| `note.create` | margin | `{entity}` → new note seeded from the entity |
| `note.create` | ink | `{entity}` → new page |
| `step.append` | proof | `{entity}` → attach as a step/reference |
| `log.activity` | rhythm | `{payload:{kind,minutes?,course?,courseId?,label?,at?}}` |
| `timer.start` | timer | `{payload:{label?, minutes?, thenBreak?, commitmentId?, course?, courseId?}}` → focused session bound to it; `thenBreak` (1-60) chains a recess (the deep-link `break` param) |
| `timer.control` | timer | `{payload:{op:'pause'|'resume'|'finish'}}` → steers the live session (finish logs elapsed only) |
| `problem.retest` | flashcards | alias of `cards.create` for a diverged attempt |
| `routine.plan` | rhythm | `{payload:{name, course?, courseId?, dueAt?, perWeek?, minutes?, unit?}}` → real routine on the register |
| `routine.check` | rhythm | `{entity|payload:{routineId}}` → idempotent today's check-in; `{url:null,navigate:false}` |
| `block.plan` | syllabus | `{payload:{title, courseId?, course?, date?, start?, minutes?, phase?, label?}}` → a slip on the folio |
| `block.done` | syllabus | `{entity|payload:{blockId}}` → stamps the slip done off-clock; idempotent; `{url:'…?block=<id>',navigate:false}` |
| `commitment.done` | syllabus | `{entity|payload:{commitmentId}}` → files the commitment done (weekly ones spawn their next instance); idempotent; `{url:'…?commitment=<id>',navigate:false}` |
| `block.defer` | syllabus | `{entity|payload:{blockId, date?}}` → pushes the slip (default tomorrow), stays planned; rescues missed slips |
| `problem.create` | proof | `{payload:{topic?, prompt?, course?, courseId?, difficulty?, tags?, source?}}` → a problem on the bench |
| `weights.import` | gradestack | `{payload:{courseId}}` → pull categories/weights from syllabus |
| `study-plan.request` | syllabus | `{payload:{courseId, examId?}}` → open generated plan |
| `event.intake` | rhythm | legacy `?event` query intake — keep working |

Anything else: the intake stays `pending` until an app registers a handler.

## Store queries

- `iterra.store.list(q)` — `q` filters `app type courseId course topic` +
  `limit`, sorted newest-updated first.
- `iterra.store.search(text, q)` — substring match over
  title/sub/course/topic/id.
- `iterra.store.due(q)` — `q` filters `app type(default 'card') courseId
  course before(ms, default now)`; returns entities whose `data.dueAt`
  is at-or-before `before`, soonest first. The one due-query — apps
  shouldn't roll their own.
- `iterra.store.subscribe(cb)` — every put/remove, including remote
  (BroadcastChannel) writes.

## Links

`iterra.links.add(fromKey, toKey, kind)` — e.g. a card created from a note:
`('margin:note:n1','flashcards:card:k1','derived')`. Backlinks are readable
via `iterra.links.for(key)` → `{out, inn}`.

## Do not

- Write other apps' localStorage stores. The store is the shared layer.
- Fabricate `courseId`s — resolve via `courses.byCode`/`courses.resolve`.
- Publish the whole dataset on every write — put the changed entity only
  (the index doc stays the small read-mirror; the store is the truth).
- New deps, design changes, or changes outside `apps/<your-app>/`.
