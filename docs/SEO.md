# Iterra SEO

How Iterra gets found on Google, what the build emits, and the ongoing plan.

## Live surface

- Canonical host: `https://iterrapp.vercel.app` (change `SITE` in
  `scripts/seo-pages.mjs` + `scripts/prerender.mjs` and the canonical/OG tags
  in `shell/index.html` if a custom domain is added).
- `/` — the landing page, **prerendered to real HTML** at build time by
  `scripts/prerender.mjs` (headless Chromium snapshot of the rendered SPA).
- `/tools` — static index of all eight tools.
- `/tools/<place>` — one static, keyword-targeted page per tool
  (`boxed`, `syllabus`, `rhythm`, `flashcards`, `ink`, `margin`,
  `gradestack`, `timer`, `proof`). Pure HTML — no JS needed to read them.
- `/sitemap.xml` — generated each build; listed in `robots.txt`.
- The app itself stays a hash-routed SPA (`/#/…`). Hash routes are not
  separately indexable — that's fine; the marketing pages carry the
  keywords and deep-link into the app.

## Build pipeline

`npm run build` → `scripts/build.sh` → after the Vite build,
`scripts/prerender.mjs` runs:

1. `writeSeoPages(dist)` — always writes `/tools*`, `sitemap.xml`
   (pure Node, no browser needed — works on any CI).
2. Landing snapshot — serves `dist/` locally, loads `/` in headless
   Chromium, writes the serialized DOM back to `dist/index.html`.
   Skips gracefully if no browser exists; the SPA shell still ships full
   meta/OG/JSON-LD from `shell/index.html`.

The service worker validates `iterra-build-id` in the HTML before caching
navigations — the snapshot keeps that meta, so offline caching is unaffected.

To prerender locally without a full build: `npm run seo` (needs `dist/`).

## Keyword strategy

Two tracks:

**Brand** — "Iterra", "iterrapp". Easy wins; make sure the name is
consistent everywhere (titles, manifest, GitHub, directories).

**Niche long-tail** (realistic for a new domain) — the tool pages target
phrases like "spaced repetition flashcards", "pomodoro timer for students",
"bubble sheet grading", "time blocking app", "linked notes app". These have
real volume and winnable competition. Avoid head terms like "study app" or
"note taking" — dominated by Notion/Quizlet/Google.

## Off-page checklist (manual)

1. **Google Search Console** — add `iterrapp.vercel.app`, verify (HTML
   meta or DNS), submit `sitemap.xml`, use URL Inspection → Request
   Indexing for `/` and each `/tools/*` page.
2. **Bing Webmaster Tools** — same sitemap; powers DuckDuckGo/Ecosia.
3. **Custom domain** — `iterra.app` or similar beats `*.vercel.app` for
   trust and CTR. Update `SITE` constants + canonical tags, 301 the old
   host in `vercel.json`.
4. **Directories** — Product Hunt, AlternativeTo, SaaSHub, StackShare,
   GitHub repo with README keywords. These drive both referral traffic
   and ranking signals.
5. **Content** — a `/blog` or `/guides` section (study methods,
   "how to plan a semester", spaced-repetition explainers) is the
   highest-leverage next step for organic growth. Each post = another
   indexable page targeting informational queries.
6. **Social/launch** — the first weeks matter; a Product Hunt launch or
   Reddit post (r/GetStudying, r/college) creates the initial clicks and
   links Google uses to gauge relevance.

## What not to do

- No keyword stuffing — copy on tool pages is written for humans first.
- Don't block `/tools/*` in robots or noindex them.
- Don't add fake reviews/ratings schema — Google penalizes structured-data
  spam. The `SoftwareApplication` schema stays honest (price: 0).
