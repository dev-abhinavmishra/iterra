# Guide & page block types

`renderBlocks()` in `scripts/seo-pages.mjs` renders every `blocks` array in
`scripts/seo-guides-data.mjs` (and topic prose in `TOPIC_SECTIONS`). All text
fields support inline markup via `inline()`: `**bold**`, `*italic*`,
`[link](/path)`, `` `code` ``, `==highlight==`.

## Block kinds (`k`)

| k | Shape | Renders as |
|---|-------|-----------|
| `p` | `{t}` | paragraph |
| `ul` | `{items:[...]}` | bullet list |
| `callout` | `{t}` | centered serif pull-style callout |
| `quote` | `{t}` | oversized pull-quote with gold mark |
| `steps` | `{items:[...]}` | numbered editorial steps (01, 02…) |
| `stats` | `{items:[{v,l}]}` | big-number stat strip |
| `deflist` | `{items:[{t,d}]}` | term → description rows |
| `table` | `{head:[...], rows:[[...]]}` | styled table (sticky header, Iterra column highlight on compare) |
| `tool` | `{tool:'<id>'}` | inline card linking to a place (id must exist in `TOOLS`) |
| `checklist` | `{id?, items:[...]}` | tickable checklist, persisted to localStorage |
| `timeline` | `{items:[{when,what}]}` | vertical timeline with gold nodes |
| `versus` | `{a:{k,t}, b:{k,t}}` | two-column contrast with VS medallion |
| `mistakes` | `{bad?, good?, items:[{bad,good}]}` | Instead/Better (labels overridable) error→fix rows |
| `example` | `{label?, t}` | "Worked example" card (sage gradient, gold tag) |

## Automatic transforms (renderGuidePage)

- Sections whose `h2` matches "…mistakes…" (excluding sort/track/log/review
  headings) get `deflist` blocks promoted to `mistakes` with labels
  `Mistake`/`Fix`, and plain `ul`s get a terracotta accent rule.
- Paragraphs starting "Here is the method applied…" become `example` cards.

## Conventions

- Every guide needs: `slug`, `title` (may contain `<em>`), `description`,
  `lede`, `kicker`, `datePublished`, `readMinutes`, `keywords`, `tools`
  (place ids), `related` (guide slugs), `faq` (`{q,a}`), `sections`.
- `kicker` groups guides on `/guides` and feeds `/topics/<kicker>` archives —
  a topic page is only published when a kicker has ≥3 guides.
- Regenerate after data changes: `npm run seo` (writes `dist/`),
  `node scripts/og-images.mjs` for new share cards.
