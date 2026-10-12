# Rhythm — design law

The app is a **weekly sequencer**: a calm electronic instrument for routine
consistency. It is not a calendar, not a dashboard, not a streak machine. A
hand-built step sequencer on your desk — dark chassis, brushed faceplate,
recessed controls, lit pads. You don't manage tasks here. You run channels and
read the pattern.

The register it replaced tracked attendance. The sequencer tracks *sound*: did
each channel hit its steps this measure?

## Material

| Concept | The law |
|---|---|
| Channel | A routine is a channel row. Name in mono silk, a status lamp, a segmented level meter, seven steps per measure. |
| Measure | The week — always exactly seven steps. A measure is never partial in the grid; unhit future steps simply haven't played yet. |
| Step | A day of a channel. Every step renders its state by **shape**, never color alone: full = solid pad with a gloss top-edge; minimum = smaller solid pad; partial = left-half fill; missed = hollow pad with a rest dash; exception = diagonal strike; paused = twin hold-bars; unscheduled = horizontal dash; future = hairline outline. |
| Pad | The 40px keycap trigger on Today's channel rows. `aria-pressed` keeps it lit while hit; `:active` sinks it 2px like a real pad. A hit fires the `pad-hit` squash-and-bloom. |
| Playhead | One shared ticker (`lib/playhead.ts`) sweeps the current measure at 900ms/step. The playing step gets the `step--play` glow; today's step always carries `step--now`. It only exists when motion is `full` — a sequencer in reduced motion doesn't sweep. |
| LCD | The date readout — greenish phosphor on near-black (`--color-lcd-bg`/`--color-lcd-fg`), letterspaced mono, subtle scanline texture. One per view max; the header's is the master. |
| Lamp | The consistency band as a lit indicator: dot plus a soft glow (`::before`), colored by band — building=amber, established=ok-green, experimenting=teal, recovery=signal amber, paused=dim. |
| Run LED | Header lamp that ticks while the sequence runs (motion full). Plus a static power LED, always on. |
| Panel | The only modal — a raised module drawn up over the deck, slides in from below with a soft bevel shadow. Never two at once. |
| Deck | Each view is a brushed machine panel — corner screws, subtle vertical sheen, dark frame. Cards inside it are recessed wells, not floating paper. |
| Selector bank | Navigation is a row of square selector keys — unlit keys sit recessed; the live key is lit amber. |
| Chassis | The whole shell: near-black warm-tinted metal. Never pure black, never gray — this machine is warm: #15140f. |

## Typography

- **Space Grotesk** (`--font-display`) — display numerals, the wordmark, names. Geometric, machined.
- **IBM Plex Mono** (`--font-mono`) — every date, count, label, unit. The machine speaks mono.
- **Source Sans 3** (`--font-ui`) — prose and explanations only.
- Kickers are mono, uppercase, tracked wide — silkscreened labels, never bold UI chrome.

## Color

- Backgrounds live in warm near-blacks (`--color-chassis` … `--color-recess`); text in warm off-whites (`--color-ink` … `--color-ink-faint`); rules are dim olive (`--color-rule`).
- Accent LEDs (`--color-acc-*` + `--acc-*-rgb` triplets) are the only saturated color, and they belong to channels — pick a hue per channel like choosing a pad color.
- Status color is LED color: ok green, warning amber, bad red, LCD phosphor. Amber is the machine's signature, not blue.
- Color is never the only signal — step shape and lamp labels carry state.

## Motion

- `pad-hit` — the core feel: a 340ms squash with a brightness flare and a bloom of the channel's LED color. It must be *felt*.
- `measure-in` — a view's grid slides into place like a tape rolling in (token `--animate-page-turn`).
- `panel-in` — sheets rise like a module docked (`--animate-sheet-in`).
- `play-glow` — the playhead step breathes once per step tick.
- `led-tick` — the run LED pulses on the sequence clock.
- **Reduced motion is a hard contract.** `html[data-motion='reduced']` and `prefers-reduced-motion` kill *every* animation and transition, including the playhead sweep and LED ticks — state is still readable because nothing meaning-bearing moves.

## Voice

Calm machine voice. "Hit", "mute", "rest", "channel", "measure", "the tape",
"patch in", "signal in", "the take" — not "streak", not "score", not "perfect
week". The sequencer never congratulates and never scolds; it shows the
pattern and holds the tape. Empty states are silent steps, not lectures.

## Sound

None. The rhythm is visual. Don't add audio.

## Things this app will never do

- Streaks, flames, confetti, "perfect week" badges, XP, or judgment color on a person.
- Light theme for the app itself (print only — print output is plain and light).
- Cards that float like paper, drop shadows that lift off the surface, rounded "friendly" UI chrome.
- More than one accent color family per channel.
