# Ink

*A writing desk for your notes.*

Ink is a local-first notes app that treats its material seriously: words land
wet on the page and dry as you write, `[[links]]` grow veins between pages, the
wastebasket keeps crumpled drafts, and the ink well in the sidebar rises with
every page touched today.

## The desk

- **The page** — a TipTap/ProseMirror editor dressed as a sheet of paper.
  Rich text, lists, quotes, code, headings. Typed words arrive wet and dry in
  about a second; pasted text lands dry.
- **`[[wikilinks]]`** — type `[[` and a shelf of pages slides under the caret;
  arrows pick, Enter links, naming something unwritten offers to start it
  (filed, not opened — your sentence keeps its place). Links render in
  fountain-pen blue; clicking one opens the page or begins it.
- **The ink web** — `/web` draws every page as a seeded ink blot and every
  link as a tapering vein. Dashed circles are pages referenced but never
  written; dashed veins run to them. Drag to wander, scroll to lean in.
- **Earlier drafts** — the blotter keeps the last twelve impressions of every
  page. Open them from the note menu, preview any slip, and press one back
  onto the page.
- **Deep work** — `/focus` is the same sheet with the desk cleared: an outline
  of your headings, a session timer, optional typewriter dimming.
- **Marks a proofreader leaves** — pencil-highlight (`mark`), hand-ruled
  underline, margin marks on the active row, dog-eared current page,
  asterism rules, a torn deckle edge on the sheet, and an ink line down the
  right edge that tracks how deep you've read.
- **The pen cup** — every page is written with a pen you choose: iron-gall,
  fountain blue, editor's red, or walnut brown. The pen colors the page's
  title, its blot in the list and the web, the drop that lands when the
  page opens, and even the dashed vein the web draws toward unwritten
  pages. Journals are dipped in fountain blue by default — the pen cup
  can always re-ink them.
- **The ink web** — a force-directed map of `[[links]]`: blots sized by
  word count, veins tapered like drawn ink, dashed circles for pages
  referenced but not yet written. Drag to pan, pinch or scroll to zoom.
- **The wastebasket** — crumple a page and it wads itself into the basket;
  discarded slips wait crossed-out and fade as they age. Smooth them back
  out or empty the basket.
- **Pages live and breathe** — a freshly-written page keeps a blue blot in
  the list until the ink dries; a page untouched for a month yellows like
  paper left in the sun; every save lands a drop in the sidebar ink well.
- **Tools of the desk** — stamp the date, undo/redo, print the page (the
  manuscript alone goes to paper), carbon-copy a note, bind the whole
  library into one Markdown volume, or export/import JSON.

## Everything is ink

`src/lib/ink.tsx` + `ink-shapes.ts` are a small procedural art library —
seeded, deterministic `InkBlot` thumbprints, `PenNib`, `Squiggle`, `Strike`,
`ProofCircle`, `TornEdge`, `InkDrop`, `InkWell`, `Spatter`, `PenRest`.
`src/lib/pens.ts` is the pen cup. Nothing in the app draws a generic
rectangle where ink would do.

Design tokens, type ramp, and rules live in `DESIGN.md` — including the one
about never shipping anything that reads as AI-generated flat-slate SaaS.

## Under the hood

- **React 19 + Vite + TypeScript**, Tailwind for layout, framer-motion for
  small settles, lucide for chrome icons.
- **ProseMirror decorations** drive the wet-ink effect and the `[[link]]`
  painting — no DOM mutation outside the plugin.
- **zustand + persist** — the whole library lives in `localStorage`
  (`ink-notes-storage`), versioned and migrated. No server, no account.
- **`buildNoteIndex`** — one flat-text pass over the library feeds search,
  backlinks, snippets, and the web, so the desk stays fast as it fills.
- **Storage-full guard** — if the browser refuses a write, the desk says so
  instead of failing silently.

## Run it

```sh
npm install
npm run dev      # the desk, hot-reloaded
npm run build    # tsc -b && vite build
npm run lint     # eslint
npm run preview  # serve the production build
```

## Data

Notes persist per-browser under `ink-notes-storage` (schema v4). Settings →
Export for a JSON backup, → Import to restore, or → Bind for a portable
Markdown volume of everything.
