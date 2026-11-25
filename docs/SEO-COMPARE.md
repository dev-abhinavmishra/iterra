# Chunk A — Comparison & alternatives pages (`/compare`, `/alternatives`)

Scope owner: this agent. Chunks B (guides) and C (OG images, marketing kit)
belong to another agent — do not touch `/guides`, OG images, or
`docs/marketing/`.

## Research summary

- SERPs for "X alternative" / "X vs Y" are dominated by dedicated
  alternatives hubs (DueToday, Elly, UltraLearn, Studeum) and listicles
  (ScholarSail, Soma, studyplanner.tech, mindomax). None feature Iterra.
- Winning format observed everywhere: honest comparison table → "where
  each wins" → explicit verdict ("who should switch, who should stay") →
  FAQ. Credibility correlates with admitting competitor strengths.
- Iterra's honest differentiators: free, no account, local-first/offline,
  eight integrated course-aware tools in one workspace, works in browser.
- Iterra's honest weaknesses: web-only (no native mobile apps), younger
  product, no AI deck/PDF generation pipeline (Margin has optional AI
  document chat), no real-time collaboration, smaller ecosystem/templates.

## Keyword map (target → page)

| URL | Primary keyword | Intent |
|---|---|---|
| /compare | compare study apps | hub |
| /compare/iterra-vs-notion | "notion vs iterra", "iterra vs notion" | commercial investigation |
| /compare/iterra-vs-quizlet | "quizlet vs iterra" | same |
| /compare/iterra-vs-anki | "anki vs iterra" | same |
| /compare/iterra-vs-study-smarter | "study smarter vs iterra", "vaia alternative" | same |
| /compare/iterra-vs-structured | "structured app alternative" | same |
| /alternatives | study app alternatives | hub |
| /alternatives/quizlet-alternative | "quizlet alternative" | alternative-seeking |
| /alternatives/notion-alternative | "notion alternative for students" | same |
| /alternatives/anki-alternative | "anki alternative" | same |
| /alternatives/study-smarter-alternative | "study smarter alternative" | same |
| /alternatives/free-study-planner | "free study planner app", "study planner no account" | generic commercial |
| /alternatives/best-study-apps | "best study apps 2026", "best all-in-one study app" | listicle |

## Page anatomy (all pages)

1. Atlas hero: kicker, keyword-bearing H1 (`Iterra vs Notion`), honest
   one-line framing.
2. "At a glance" comparison table — durable facts only (price model,
   platforms, account required, offline, flashcards, notes, timer,
   course-awareness). No volatile specifics like exact prices.
3. "Where Iterra wins" / "Where <X> wins" — genuinely balanced.
4. Verdict block: who should pick which.
5. CTA → `/#/today` + links to relevant `/tools/*`.
6. FAQ (3–4 Q&As) → `FAQPage` JSON-LD. Questions target real long-tail:
   "Is Iterra free?", "Does Iterra work offline?", "Does Iterra have a
   mobile app?" (answer honestly: no native app, works in mobile browser).
7. `WebPage` + `BreadcrumbList` (+`FAQPage`/`ItemList` for listicle) JSON-LD.

## Tone

Honest/neutral with a light Iterra lean. Every page must include at least
one real Iterra weakness — this is what makes the pages rank and convert.
Never fabricate competitor features; hedge volatile claims ("as of 2026",
"check current pricing").

## Technical

- Extend `scripts/seo-pages.mjs`: `COMPARE_PAGES` data + renderers,
  reuse existing CSS/nav/footer. Add `/compare` + `/alternatives` index
  pages. Extend `renderSitemap`.
- Nav on these pages links back to `/tools` and `/compare`/`/alternatives`.
- After build: `node scripts/prerender.mjs`, verify HTML + JSON-LD,
  commit, push, confirm live.
