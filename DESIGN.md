# Iterra — DESIGN.md

Canonical design system for the Iterra shell (`shell/`) and its eight embedded places.
Grounded in the real token layer at `shell/src/index.css` and the shared primitives at
`shell/src/ui/primitives.tsx`. All shell chrome and cross-app surfaces MUST consume
these tokens — hardcoded palette values in shell surfaces are a bug (they break
Graphite mode).

## 1. Visual Theme & Atmosphere

Field atlas / study cartographer. A warm paper workstation that feels like a
well-kept lab notebook: calm, tactile, earnest, literary. Editorial quiet on the
shell chrome; each embedded app may keep a distinctive instrument surface inside
its own `.it-place-*` root, but shared surfaces (dialogs, banners, context panel,
settings) always speak the atlas language.

Mood words: paper, ink, moss, specimen tray, marginalia.
Two themes: **Paper** (light, default) and **Graphite** (dark). One switch, one
storage key (`iterra.v1.theme`), `data-theme` on `<html>`, `data-terrain` on each
place root.

## 2. Color Palette & Roles

Semantic tokens — the only colors shell code may reference (declared on `body`
so they shadow app-level `:root` vars; see index.css "Terrain scoping"):

```
--color-paper        page ground            #f4f1e8 / #14171c
--color-sheet        raised surface         #fbf9f4 / #1c2026
--color-sheet-2      recessed surface       #ebe5d6 / #232830
--color-sheet-hover  interactive row hover  #efeae0 / #262c35
--color-line         hairline border        #d8d0bc / #2e3540
--color-line-2       emphasized border      #b8ad93 / #434c5b
--color-ink          primary text           #1c2621 / #e8ecf2
--color-mute         secondary text (AA)    #4c5951 / #9da6b5
--color-faint        captions/metadata      #6e6552 / #8b94a4   (≥4.5:1 measured)
--color-accent       interactive primary    #2b5440 / #58a07c   (moss)
--color-accent-2     accent hover           #223d30 / #6bb38f
--color-accent-fg    text on accent         #fbf9f4 / #101418
--color-accent-soft  active tint            #e3ede7 / #1e2f28
--color-warn(-soft)  due / attention        #8f5122 / #e09f5a
--color-bad(-soft)   destructive            #96342a / #e06c60
```

Raw ramps `moss-50…950`, `atlas-50…500`, `field-ink/-faint` exist for app
surfaces and data-viz. One accent per viewport: moss for action, warn for
attention, bad for destructive — never decorative.

## 3. Typography Rules

- **Display / titles:** Newsreader (`--font-place`, serif fallback Georgia) —
  weight 500, tracking −0.01em. Used for `.it-title`, place names, prose.
- **UI / body:** Archivo (`--font-sans`, humanist grotesk) — weight 400–600.
- **Labels / data / provenance:** IBM Plex Mono (`--font-mono`) — uppercase,
  tracked +0.12em, only for eyebrow labels, counts, and metadata.

Scale (px): 10.5 label · 11 chip/badge · 12–12.5 secondary · 13 body ·
14 section header · 15–16 dialog title/heading · 22 page title.
Never introduce a fourth family; never swap the display face for sans.

## 4. Component Stylings

Use the primitives — do not re-roll buttons/inputs/dialogs:

- `Button` (`primary|secondary|ghost|danger` × `xs|sm|md`) — accent fill,
  no lift on hover; `active:translate-y-px` press. `.it-btn` mirrors it in CSS.
- `IconButton` — 28/32px square, `aria-label` required, active = accent-soft.
- `Badge` — `neutral|accent|warn|bad|mono`; onClick renders a real `<button>`.
- `Tabs` — underline indicator on active tab (2px accent), not pills.
- `Dialog` — `bg-black/40` overlay, sheet panel, Escape closes, `role=dialog`.
- `EmptyState` — dashed `line-2` border, sheet/50, icon tile on sheet-2.
- `Input` / `Select` — 1px `line`, focus = accent border + global focus ring.
- `.it-card(-in)` `.it-row` `.it-chip` `.it-empty` `.it-label` for CSS-side use.

## 5. Layout Principles

- `.it-wrap`: max-width 1120px, `24px 20px 64px` padding — all index surfaces.
- Shell chrome: 48px header, left hub rail + place frames (keep-alive,
  `display:none` when inactive — never unmount places).
- Baseline rhythm 4px; card padding 14–16px, section gap 24–32px.
- Apps own their inner layout; shell provides frame, header, context rail.

## 6. Depth & Elevation

Flat by default — depth comes from surface shifts (`sheet` over `paper`) and
1px `line` borders. Shadows only on floating layers: dialogs/menus
(`shadow-xl`/`shadow-2xl`), primary button gets a hairline `0 1px 0` shade.
No glassmorphism, no glows, no gradient meshes. `.terrain-map` may draw a
64px hairline grid behind workspaces — background texture only, never behind
dense content columns.

## 7. Do's and Don'ts

**Do**
- Reference semantic `--color-*` tokens in every shell surface (both themes
  must stay legible — fixed `stone-*`/`white`/`emerald-*` classes are banned
  in shell code; app internals may keep their own themed palettes).
- Let type weight + spacing carry hierarchy before adding color.
- Write microcopy in full sentences; empty states name the next action.
- Keep instrument identity inside `.it-place-*` (timer LCD, proof blueprint,
  rhythm pads) while sharing the atlas chrome around them.

**Don't**
- No gradients, purple or otherwise. No neon, no glass cards, no drop-shadow
  depth on static surfaces.
- No Inter/Roboto/system stack as the chosen face; no emoji in UI chrome.
- No blinking/animated status dots except `live-dot` for true live state.
- No nested card-on-card decoration — use border or tonal shift (max depth 2).
- No decorative colored left-rules; accent color means "interactive".

## 8. Responsive Behavior

- Breakpoints: `sm` 640px (chrome compacts — wordmark/labels collapse to
  icons), `md` 768px (secondary nav labels hide), `lg` 1024px (primary nav
  returns to the header).
- **Below `lg` the shell's primary nav lives in a bottom tab bar** (Today /
  Courses / Library / course-context) — the header keeps only brand, place
  switcher, search, focus, ⋮, and the details toggle. App-level fixed bottom
  chrome (Timer dock, Ink's own tab rail, toasts) MUST clear it via
  `bottom: calc(N + var(--iterra-bottom-inset, 0px))` — the var is
  `3.5rem + safe-area` below lg and `0` above.
- The details panel is a full-screen drawer under `lg` and always starts
  closed there — a persisted desktop "open" must not cover a phone.
- Multi-column grids need an explicit base template (`grid-cols-1` then
  `sm:`/`lg:` steps); a bare `grid lg:grid-cols-12` sizes its implicit
  column to max-content and blows out narrow viewports.
- Boot/takeover surfaces (BootSequence, BootSplash, mobile sheets) use
  `absolute inset-0` so they bound to the place frame, not the viewport —
  `fixed` would cover shell chrome.
- Modals are `p-4`-inset sheets; long forms scroll inside `max-h-[85vh]`.
- Touch targets ≥ 28px (IconButton `sm`); dense rows keep ≥ 9px padding.
- Apps may go denser internally; shell chrome must remain one-thumb usable.

## 9. Motion & Accessibility Contract

- Motion is purposeful and brief: 120–200ms `anim-fade/rise/pop/stir`,
  `active:translate-y-px` press. All `anim-*`/`live-dot`/transitions are killed
  under `prefers-reduced-motion` (index.css media query — keep it exhaustive).
- Focus: global `:focus-visible` = 2px accent outline, 1px offset — do not
  remove outlines; dialogs close on Escape and overlay click.
- Contrast floor: body/UI text ≥ 4.5:1 (`ink`, `mute`, `faint` already meet AA
  on their surfaces in both themes — verify before adding new pairs).
- Semantics: real `<button>`/`<a>`/`<label>` — no clickable divs. Dialogs get
  `role="dialog"` + `aria-modal` + `aria-label`; status banners get `role=status`.

## Agent Prompt Guide

Bias toward: token-driven surfaces, serif display moments, mono provenance
labels, flat depth, quiet chrome that lets the eight instruments shine.
Reject: fixed-palette utilities (`stone-*`, `bg-white`, `emerald-*`) anywhere
outside `.it-place-*` internals; new fonts; gradient/glass/neon motifs;
animated decorations; shadow depth on static cards.

Self-check before shipping: does every color reference a `--color-*` token?
Does it stay legible with `data-theme="graphite"`? Does Escape/Tab/focus work?
Does reduced-motion still make sense? If any answer is no — fix it.
