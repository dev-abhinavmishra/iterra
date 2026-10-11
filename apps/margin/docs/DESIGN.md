# Design System — "Index"

The app's new visual identity. Everything below is binding for all views and components.

## Concept

A loose-leaf field notebook. The entire app is ruled paper: pen-blue rules
scroll with the content, a pink margin rule runs down the left edge of every
page, and punched holes dot the binding side on wide screens. Notes are index
cards (red header rule, blue rules beneath), writing sits on ruled lines, and
annotation is a vermilion pencil. The materials: **paper, ink, pencil,
hairlines**. Nothing glows, nothing blurs, nothing floats in glass.

Anti-goals (the old design, now banned): acid-lime `#c4f20d` on near-black, Space
Grotesk, aurora blobs, `backdrop-blur` panels, `rounded-2xl/3xl` + `shadow-lg` on
every surface, neon shadow glows, `auto_awesome`/`sparkles` iconography, marketing
copy ("Knowledge Vault", "Elevate").

## Palette

CSS custom properties in `index.css`. Always use the variables — never raw hex.

| Token | Light | Dark ("night desk") | Use |
|---|---|---|---|
| `--paper` | #F4F3EC | #16150F | page backdrop |
| `--card` | #FBFAF4 | #201D16 | card / sheet surfaces |
| `--card-2` | #EFECE2 | #26221A | recessed wells, inputs |
| `--ink` | #211E19 | #E9E4D6 | primary text |
| `--ink-2` | #5C574B | #A39C8A | secondary text |
| `--ink-3` | #8A8375 | #6E6757 | metadata, placeholders |
| `--line` | #DDD8C8 | #38342A | hairlines |
| `--line-2` | #C9C3B2 | #454034 | stronger hairline (inputs, dividers in use) |
| `--mark` | #C2420C | #E0582F | vermilion pencil: primary action, marks, active state |
| `--mark-ink` | #FBFAF4 | #1B1710 | text on mark |
| `--mark-soft` | rgba(194,66,12,.10) | rgba(224,88,47,.14) | mark tint wash |
| `--ok` | #2F6B3A | #5FA96B | correct, success |
| `--warn` | #9A6A00 | #C99A2E | caution |
| `--bad` | #A83226 | #D85C4E | errors, destructive |
| `--tape` | rgba(58,92,140,.12) | rgba(120,160,210,.16) | selection/highlight marks |
| `--rule-blue` | #C3CFE4 | #38415C | pen-blue notebook rules |
| `--margin-red` | #D9A493 | #7C4B3E | the pink margin rule |
| `--hole` | rgba(30,26,18,.18) | rgba(0,0,0,.50) | punched hole shadows |

Utility classes provided (use these instead of ad-hoc colors):
`bg-paper`, `bg-card`, `bg-card-2`, `text-ink`, `text-ink-2`, `text-ink-3`,
`border-line`, `border-line-2`, `bg-mark`, `text-mark`, `bg-mark-soft`,
`text-ok`, `text-warn`, `text-bad`.

## Type

Three families (loaded in `index.html`):

- **Newsreader** (`font-serif`) — note content, note titles, numbers that carry
  personality, italic "marginalia" annotations. Optical sizes on.
- **Archivo** (`font-sans`) — all UI chrome: buttons, nav, labels, inputs.
- **IBM Plex Mono** (`font-mono`) — metadata, timecodes, counters, tags, kbd.

Rules: sentence case for UI copy; small-caps/mono for metadata only (not every
label); italic serif for annotations. No tracked-out ALL-CAPS eyebrows.

## Shape & surface

- Radius: `--r: 8px` buttons/inputs/chips; `--r-lg: 10px` cards/modals. Nothing
  larger. Pills only for the segmented control and the record timer.
- Borders: 1px hairlines (`border-line`), 1px `line-2` on interactive surfaces.
- Shadow = paper edge, not glow: `shadow-card` = `0 1px 0 rgba(30,26,18,.07),
  0 8px 24px -16px rgba(30,26,18,.25)`; hover lift `shadow-lift`. No colored
  shadows, no `shadow-*-glow`.
- The page motif is binding: `.page-lines` on every view's scrolling element
  gives the ruled sheet (+ margin rule and punched holes at ≥lg). Never put a
  flat `bg-paper` surface where `.page-lines` belongs.
- `.card-ruled` = index-card face (red header rule + blue rules): note cards,
  review card faces. `.sheet-ruled` = plain ruled sheet: deck cards, quiz
  answer sheets. `.note-body.ruled` = body text written on lines (em-based,
  tracks the editor font-size setting).
- The selection/highlight look is `--tape` wash + a 2px `mark` left edge.

## Motion (framer-motion is installed)

- View transitions: content slides/fades 200–250ms, `easeOut`. One transition per
  view switch, orchestrated in `App.tsx` — do not add per-section entrances.
- Cards: hover = `translateY(-2px)` + ~0.4° tilt, 150ms. Press = scale(.98).
- Flashcards: real 3D flip (`rotateY 180°`, `transform-style: preserve-3d`).
- Modal/popover: 120–160ms fade + 4–8px rise.
- Recorder: the visualizer is live; pin/duration changes animate.
- `prefers-reduced-motion`: everything collapses to instant (already global).

## Iconography

Material Symbols stays, but at weight 300–400, size 18–20px, outlined (FILL only
for true active/toggle states). Banned: `auto_awesome`, `sparkles`, `bolt` used
as decoration, emoji bullets. Prefer plain verbs in text over icon-only actions
outside the toolbar.

## Layout grammar

- Sidebar: 240px rail (16px icon rail on <lg). Hairline right border. Nav labels
  in sans; badges/counts in mono.
- Content: views are notebook pages (`bg-paper` + `.page-lines`); the note
  editor is a `bg-card` sheet centered with a hairline edge and ruled left
  margin line.
- Headers: slim 56–64px bars, hairline bottom border, page title in serif 20px,
  actions right. No `backdrop-blur`.
- Widgets/modals/cards sit on `bg-card` with `border-line` and `shadow-card`.

## Copy voice

Plain words, sentence case, active verbs. Nav = **Notes, Record, Ask, Study**;
empty states tell you how to fill them ("Record a lecture" not "Your vault is
empty"); errors say what happened and what to do. Buttons say the outcome
("Save", "Export", "Delete 3 notes").

## Component primitives

`components/ui/primitives.tsx` exports — use these, don't restyle ad hoc:

`Btn` (primary=mark, quiet, danger, ghost + size sm/md), `IconBtn`, `Chip`
(filter/tag), `Card`, `Sheet`, `Modal`, `Field` (label+input), `TextInput`,
`Select`, `Toggle`, `Segmented`, `EmptyState`, `Tag`, `Kbd`, `Divider`,
`Spinner`, `ProgressBar`, `Stat`.

## Data & domain

- `View` gains `STUDY`. Nav: Notes / Record / Ask / Study / Settings.
- `Note.type` gains `'IMAGE'`; fix imports to store it (old image notes typed
  'PDF' stay readable).
- New persisted entities (IndexedDB v3, `services/storageService.ts`):
  `decks` (flashcard Deck + cards with SM-2 fields), `quizzes`, `versions`
  (per-note snapshots), `folders` optional. All local-first, cloud-sync untouched.
- `services/studyService.ts` — deck/card/quiz CRUD + SM-2 scheduler
  (`grade(card, 0|1|2|3)` → new interval/due). 
- `services/searchService.ts` — tokenizer + `relatedNotes(note, all)` TF-IDF.
- `services/exportService.ts` — note→markdown/html, backup→JSON, restore.
- `services/aiService.ts` — new `runAction(action, text)` hitting `/api/action`.
- Selection popover actions: Add to Ask · Summarize · Expand · Simplify ·
  Make flashcards (writes to a deck via studyService).
- Bookmarks/pins: `note.isBookmarked` = "pinned" in UI copy.
