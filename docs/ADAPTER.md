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
shell to navigate to, or `null` when nothing visual happened. Throw → the
intake stays pending and retries on next drain.

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
course.renamed session.started session.completed card.created card.reviewed
attempt.made attempt.diverged assignment.due assignment.completed
grade.entered note.created routine.logged routine.completed deck.imported
send.delivered stir`

Emit only types in the catalogue — others are rejected.

## Intake catalogue (who receives what)

| action | to | payload |
|--------|----|---------|
| `cards.create` | flashcards | `{entity|payload:{cards:[{q,a,ex?}], deckTitle?, course?, courseId?}}` → creates a deck, returns `{url}` |
| `note.create` | margin | `{entity}` → new note seeded from the entity |
| `note.create` | ink | `{entity}` → new page |
| `step.append` | proof | `{entity}` → attach as a step/reference |
| `log.activity` | rhythm | `{payload:{kind,minutes?,course?,courseId?,label?,at?}}` |
| `timer.start` | timer | `{payload:{label?, minutes?, commitmentId?, course?, courseId?}}` → focused session bound to it |
| `timer.control` | timer | `{payload:{op:'pause'|'resume'|'finish'}}` → steers the live session (finish logs elapsed only) |
| `problem.retest` | flashcards | alias of `cards.create` for a diverged attempt |
| `routine.plan` | rhythm | `{payload:{name, course?, courseId?, dueAt?, perWeek?, minutes?, unit?}}` → real routine on the register |
| `block.plan` | syllabus | `{payload:{title, courseId?, course?, date?, start?, minutes?, phase?, label?}}` → a slip on the folio |
| `problem.create` | proof | `{payload:{topic?, prompt?, course?, courseId?, difficulty?, tags?, source?}}` → a problem on the bench |
| `weights.import` | gradestack | `{payload:{courseId}}` → pull categories/weights from syllabus |
| `study-plan.request` | syllabus | `{payload:{courseId, examId?}}` → open generated plan |
| `event.intake` | rhythm | legacy `?event` query intake — keep working |

Anything else: the intake stays `pending` until an app registers a handler.

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
