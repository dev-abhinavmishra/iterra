# Proof — design law

Proof is a **calculation workbench**, not a notebook, not a card deck, not a
chat app. Its material is pale engineering computation paper laid on a
graphite bench. Every surface decision answers to that metaphor.

## The material

- **Bench** — graphite. Cool, dark, matte. Two soft vignettes and fine grain;
  it recedes so the paper reads lit, not glowing.
- **Pad** — off-white calculation paper with a faint square grid, the way
  drafting film and computation pads carry a printed reticle. The grid is a
  *square reticle*, never ruled lines. It exists under the work, not through it.
- **Film** — a slightly brighter sheet for transient surfaces (drawers,
  popovers, review slips).

## The signature element — the proof rail

Every attempt runs down a **left-side proof rail**: a vertical hairline with
numbered nodes, one per step the learner wrote. The rail is the attempt's
skeleton — it shows structure before a single line is read.

- Nodes fill as steps are written.
- A confidence tick sits at the rail head, recorded before submission.
- Hint reveals appear as amber pips on the rail, at the moment they were used.
- On comparison, connectors between attempt steps and worked-solution steps
  *draw themselves* — structure made visible only after both sides exist.

## Color

| Token | Use |
|---|---|
| graphite | bench, primary text on paper is `ink` |
| blueprint blue | structure, links, correct marks, focus |
| correction violet | divergence, error classification, partial marks |
| hint amber | hints and only hints — buttons, pips, badges |

No red/green correctness. Results are always a **symbol + word**
(`✓ correct`, `◐ partial`, `✕ incorrect`) — color is redundant emphasis,
never the signal itself.

## Typography

- **Archivo** — prompts, controls, all UI chrome.
- **KaTeX math fonts** — rendered equations (`$…$`, `$$…$$`).
- **IBM Plex Mono** — measured values, timers, codes, confidence scale,
  error categories, all metadata.
- **Newsreader** — the wordmark and document mastheads only. Nowhere else.

## Motion

Motion marks state transitions the learner caused:

- The **solution pane folds open** from its top edge — a worked answer
  arriving, never a celebration.
- **Step connectors draw** (stroke-dashoffset) when comparison begins.
- Rail nodes populate with a short stagger when a step is added.
- No confetti, no streaks, no celebratory animation for routine success.
- Everything behind `prefers-reduced-motion` and the `data-motion` setting.

## Never

- Ruled notebook lines, index-card flips, chat bubbles, always-visible AI
  sidebars, dashboards-of-cards, emoji as iconography, red=wrong/green=right,
  a single "mastery %" anywhere.

## Accessibility floor

- Keyboard: every action reachable; visible focus rings on paper and bench.
- High zoom: the rail collapses under ~640px but the step numbers remain.
- Status never color-only: symbol + word, always.
- Math rendered by KaTeX carries MathML for screen readers.
