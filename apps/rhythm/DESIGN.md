# DESIGN.md — Rhythm design law

Rhythm is an **attendance register**, not a notebook and not a streak counter.
Every surface decision flows from that metaphor: a cloth-bound register book
whose open spread ("leaf") holds dense ledger rows, date stamps, and narrow
calendar columns. Read this before touching `src/index.css` or any view.

## The metaphor, concretely

- The app opens like a register book: dark cloth **cover** header (`.cover`,
  wordmark `RHYTHM` in Zilla Slab) over a cream paper **leaf** (`.leaf`) with a
  stitched binding gutter on the left edge.
- Days are recorded with **marks**, not text. A completion is a stamped mark
  pressed into the day's cell. The mark's **shape communicates state** — color
  is a secondary attribute only.
- State changes feel like a stamp: one downward press, a squash, and a settle
  (`stamp-press` keyframe, ~420ms). Week navigation turns like a register page
  (`page-turn`).
- Precise numbers (totals, durations, counts) are set in IBM Plex Mono —
  the register's bookkeeping hand. Dates are Zilla Slab — a rubber date stamp.
  Everything readable is Source Sans 3.

## The mark alphabet (`Mark.tsx`, `.mark--*`)

| state        | shape                                              |
|--------------|----------------------------------------------------|
| full         | solid disc + check (the stamped mark)              |
| minimum      | small filled disc — "showed up, scaled down"       |
| partial      | half-filled ring                                   |
| missed       | faint open ring                                    |
| exception    | ring struck through (day excused, not erased)      |
| paused       | twin vertical bars                                 |
| unscheduled  | thin horizontal tick — a ruled blank column        |
| future       | hairline ring                                      |

Never render a state as color alone. Every `.hcell`/`Mark` carries an
`aria-label` naming the state, and the Heatmap has a Ledger (table) toggle —
the explicit text equivalent required by the spec.

## Palette

- **Cover/cloth**: `#232019` (warm charcoal) — the register's cover, masthead.
- **Leaf/paper**: `#f6f1df` cream — working surface. Cards are `.slip` (paper
  slips with a ruled edge), not floating glass.
- **Ink**: `#2e2b23` — default text.
- **Indigo** `#46527a`: the stamp-pad color — bands, date stamps, links,
  focused states. This is the register's primary accent.
- **Ok** `#44603f` (green) for kept days; **amber** `#8a6420` for
  recovery/at-risk. Warm red `#9a3b2e` is *reserved for genuinely late/missed
  marks and destructive actions only* — never for decoration or guilt copy.
- Per-routine accent colors (`acc-*`) tint marks so rows read at a glance;
  they are thin, muted, never neon.

## Rules that are law

1. **No motivational furniture.** No flames, giant streak numbers, confetti,
   guilt copy ("you broke your streak!"), neon gradients, or leaderboards.
   Consistency is shown by the marks on the page.
2. **History is sacred.** A missed target never erases or overwrites; misses
   are drawn as their own mark. Exceptions and pauses *exclude* days, they
   never delete them.
3. **Shape before color.** If a state can't be told from its glyph alone, the
   glyph is wrong.
4. **The leaf stays dense.** Ledger rows (`.lrow`) are compact single lines.
   No card-of-cards, no dashboard chrome. A row may show a mini track bar but
   stays one row.
5. **Two actions to check in.** From Today, stamping a routine is one press;
   amount routines are press + enter. Nothing else is required (no mandatory
   notes, ratings, or confirmations).
6. **Motion is one press, not a bounce.** The stamp compresses once. Week
   changes slide like a page. Under `prefers-reduced-motion` (or the
   reduced-motion setting, `html[data-motion="reduced"]`) every state change
   is instant — the global reduced-motion blanket in index.css enforces this.
7. **Printable.** The leaf prints like a page from the register: print rules
   strip the cover chrome and shadows.
8. **Copy is a registrar's hand.** Kickers are small-caps mono labels;
   headings are plain imperative or descriptive. Word-stamps (`wstamp`) read
   `ESTABLISHED`, `IN RECOVERY`, `PAUSED`, `BUILDING`, `EXPERIMENTING` —
   states, not grades.

## Vocabulary

- **register** — the whole record; the app.
- **leaf / spread** — the open pages the app renders on.
- **mark** — a stamped day state.
- **ledger row** — one routine's line for the day.
- **slip** — a paper slip card (`.slip`) for grouped details.
- **word-stamp** — a band label (`.wstamp-*`).
- **sheet** — the modal panel (`.sheet-*`) that slides in like a tucked page.

## Fonts

- Source Sans 3 — UI and reading text (`--font-ui`).
- Zilla Slab — dates, week labels, the wordmark (`--font-slab`, `.datestamp`).
- IBM Plex Mono — precise totals, times, counts (`--font-mono`, `.mono`).

## Non-goals

- Not a notebook: no ruled-paper lines, handwriting fonts, or margins.
- Not a habit app clone: no tiles-and-streaks gamification.
- Not a dashboard: no KPI cards, charts, or sparklines as the primary read.
