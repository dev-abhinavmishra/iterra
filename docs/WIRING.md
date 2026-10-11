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

## 7. Dev topology

Shell dev proxy maps `/apps/<name>` → `localhost:<port>`:

```
rhythm 3001 · proof 3002 · syllabus 3003 · gradestack 3004
timer 3005 · ink 3006 · flashcards 3007 · margin 3008
```

`npm run dev:apps` at the root starts every app on its port.

## 8. Verification

Per app: `npm ci && npm run lint && npm run build` must pass.
No new dependencies in apps. No design changes — same look, same motion.
