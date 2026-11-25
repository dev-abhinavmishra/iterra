/* SEO marketing pages — static HTML emitted into dist/ at build time.
   One page per place plus a /tools index. Pure HTML+CSS (no JS required)
   so crawlers get the full content; CTAs deep-link into the SPA's hash
   routes. Site palette mirrors the terrain's paper theme. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SITE = 'https://iterrapp.vercel.app';

export const TOOLS = [
  {
    id: 'boxed',
    path: '/tools/boxed',
    name: 'Boxed',
    kicker: 'Daily Board',
    title: 'Boxed — Time-Blocking & Brain-Dump Planner',
    description:
      'Boxed is a daily planner that captures every task in a brain dump, helps you pick what matters, and time-boxes the work into your day — inside Iterra’s all-in-one study workspace.',
    h1: 'A day, boxed and planned',
    lede: 'Dump everything on your mind, choose the few things that matter, and give each one a box of time. Boxed turns a scattered to-do list into a day you can actually execute.',
    features: [
      'Brain-dump capture — get it all out of your head first, prioritize second',
      'Time-boxed blocks that live inside your course schedule',
      'Works inside Iterra’s Today view, so “what’s next” is always visible',
      'Local-first: your plan lives in your browser, not a server',
    ],
    keywords: ['time blocking app', 'daily planner', 'brain dump app', 'to-do list'],
  },
  {
    id: 'syllabus',
    path: '/tools/syllabus',
    name: 'Syllabus',
    kicker: 'Planning · the Folio',
    title: 'Syllabus — Course Planner & Study Schedule',
    description:
      'Syllabus is a course planner and study schedule organizer: terms, courses, weekly blocks, and commitments in a registrar’s folio — part of Iterra’s study workspace.',
    h1: 'Every course, every week, one folio',
    lede: 'Set up your term once — courses, meeting times, commitments — and Syllabus lays out the week. Schedule study blocks, track what’s overdue, and let the terrain file minutes back into your focus timer.',
    features: [
      'Course and term setup with weekly schedule blocks',
      'Commitments and assignments tracked against real dates',
      'Launches bound focus-timer sessions straight from your next block',
      'Feeds Iterra’s Today workspace and course dossiers automatically',
    ],
    keywords: ['study planner', 'class schedule organizer', 'assignment tracker', 'course planner'],
  },
  {
    id: 'rhythm',
    path: '/tools/rhythm',
    name: 'Rhythm',
    kicker: 'Attendance · the Register',
    title: 'Rhythm — Habit & Routine Tracker for Students',
    description:
      'Rhythm is a weekly routine and attendance tracker: log habits, study cadence, and class attendance in a register that shows your consistency at a glance.',
    h1: 'Keep your study rhythm visible',
    lede: 'Consistency beats intensity. Rhythm lays your week out like a step sequencer — routines, attendance, and study cadence — so showing up every day is the easiest thing on the page.',
    features: [
      'Weekly sequencer view of routines and habits',
      'Attendance logs for classes and study sessions',
      'Streaks and cadence signals on the Today rail',
      'Accepts pushes from the rest of the terrain — no double entry',
    ],
    keywords: ['habit tracker', 'routine tracker', 'study consistency', 'attendance tracker'],
  },
  {
    id: 'flashcards',
    path: '/tools/flashcards',
    name: 'Flashcards',
    kicker: 'the Cardfile',
    title: 'Flashcards — Spaced-Repetition Flashcard App',
    description:
      'Flashcards is a spaced-repetition study app with decks, active recall, quizzes, and writing drills — a local-first alternative to paper card boxes, inside Iterra.',
    h1: 'Recall, on schedule',
    lede: 'Decks, spaced review, multiple-choice quizzes, and written recall drills — the cardfile keeps what you’ve learned one review at a time, and tells the Today rail exactly what’s due.',
    features: [
      'Decks with spaced-repetition scheduling',
      'Quizzes and writing drills for active recall',
      'Import cards straight from links the terrain shares',
      'Due-count surfaces on Today — never wonder what to review',
    ],
    keywords: ['flashcards', 'spaced repetition', 'active recall', 'Anki alternative'],
  },
  {
    id: 'ink',
    path: '/tools/ink',
    name: 'Ink',
    kicker: 'Notes · the Desk',
    title: 'Ink — Linked Note-Taking App for Students',
    description:
      'Ink is a long-form note-taking app with wiki-links, folders, daily pages, and focus writing — local-first notes that connect to your courses inside Iterra.',
    h1: 'Notes that connect like ideas do',
    lede: 'A writing desk for lecture notes, essays, and thinking-out-loud. Wiki-links weave notes into a personal knowledge graph, and the whole thing stays in your browser.',
    features: [
      'Long-form writing with wiki-style links between notes',
      'Folders and daily pages for lectures and journals',
      'Course-tagged notes that appear in Iterra’s course dossiers',
      'Local-first and offline — no account, no sync server',
    ],
    keywords: ['note taking app', 'linked notes', 'Zettelkasten', 'lecture notes app'],
  },
  {
    id: 'margin',
    path: '/tools/margin',
    name: 'Margin',
    kicker: 'Study Materials · the Margin',
    title: 'Margin — Course Study Material Organizer',
    description:
      'Margin is a study material organizer: store recordings, documents, handouts, and class files filed by course — the shelf your notes and flashcards draw from.',
    h1: 'Every handout, filed by course',
    lede: 'Recordings, PDFs, slides, and scanned handouts — Margin keeps the raw material of your courses on one shelf, tagged so Notes, Flashcards, and Today can all reach it.',
    features: [
      'Store recordings, documents, and class files per course',
      'Automatic organization by course and topic',
      'Document chat and analysis (optional AI providers)',
      'Everything else in Iterra can cite what’s on the shelf',
    ],
    keywords: ['study material organizer', 'lecture notes storage', 'course files', 'PDF organizer for students'],
  },
  {
    id: 'gradestack',
    path: '/tools/gradestack',
    name: 'GradeStack',
    kicker: 'Assessments · the Mark Book',
    title: 'GradeStack — Quiz & Bubble-Sheet Grading Tool',
    description:
      'GradeStack builds assessments, scans bubble-sheet answer sheets, grades them, and tracks score trends — a mark book for teachers and self-quizzers inside Iterra.',
    h1: 'From answer sheet to insight',
    lede: 'Build the assessment, print the sheet, scan it back, and get scores plus trends. GradeStack turns a stack of paper into a mark book that remembers every attempt.',
    features: [
      'Assessment builder with printable bubble sheets',
      'Sheet scanning and automatic grading',
      'Score trends and analytics across attempts',
      'Roster and camera capture run right in the browser',
    ],
    keywords: ['bubble sheet grading', 'quiz maker', 'scantron alternative', 'classroom grading tool'],
  },
  {
    id: 'timer',
    path: '/tools/timer',
    name: 'Timer',
    kicker: 'the Instruments',
    title: 'Timer — Pomodoro & Focus Timer for Study',
    description:
      'Timer is a focus timer with pomodoro sessions, interval routes, a stopwatch, and a session ledger — study minutes file themselves back into your planner.',
    h1: 'Time, measured in sessions',
    lede: 'Split-flap instruments for deep work: countdowns, interval routes, a stopwatch, and a ledger of every session. Start a session from your plan and the minutes file themselves back.',
    features: [
      'Pomodoro-style focus sessions and interval routes',
      'Stopwatch and session ledger for honest time tracking',
      'Launched from Syllabus blocks — planning and timing stay linked',
      'Today rail shows what’s running and how much is logged',
    ],
    keywords: ['pomodoro timer', 'focus timer', 'study timer', 'time tracking for students'],
  },
  {
    id: 'proof',
    path: '/tools/proof',
    name: 'Proof',
    kicker: 'Calculations · the Workbench',
    title: 'Proof — Step-by-Step Math Problem Workbench',
    description:
      'Proof is a math workbench for step-by-step problem solving: problem sets, derivations, and an error log that brings missed concepts back for review.',
    h1: 'Work the problem, keep the proof',
    lede: 'Math doesn’t get easier by rereading answers — it gets easier by doing the steps. Proof gives you problem sets, space for derivations, and an error log that resurfaces what you missed.',
    features: [
      'Problem sets with step-by-step working space',
      'Error log that resurfaces missed concepts for review',
      'Course-linked so work ties back to your syllabus',
      'Review queue feeds the Today workspace',
    ],
    keywords: ['math problem solver', 'step by step math', 'error log study', 'math workbench'],
  },
];

const CSS = `
:root{--paper:#f4f1e8;--ink:#2a2a26;--muted:#6b675c;--line:#d8d2c2;--accent:#2f5d46;--card:#fffdf8}
*{box-sizing:border-box;margin:0}
body{font-family:Georgia,'Times New Roman',serif;background:var(--paper);color:var(--ink);line-height:1.6}
.wrap{max-width:62rem;margin:0 auto;padding:0 1.25rem}
header.site{border-bottom:1px solid var(--line);background:var(--card)}
header.site .wrap{display:flex;align-items:center;gap:1.5rem;padding-top:.9rem;padding-bottom:.9rem}
.brand{font-weight:700;font-size:1.15rem;color:var(--ink);text-decoration:none;letter-spacing:.02em}
nav.tools{display:flex;flex-wrap:wrap;gap:.25rem}
nav.tools a{color:var(--muted);text-decoration:none;font-size:.85rem;padding:.2rem .5rem;border-radius:4px}
nav.tools a:hover{color:var(--accent);background:#ece7d8}
.hero{padding:3.5rem 0 2.5rem;border-bottom:1px solid var(--line)}
.kicker{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:.6rem}
h1{font-size:clamp(1.9rem,4.5vw,2.9rem);line-height:1.12;font-weight:700;max-width:22ch}
.lede{font-size:1.12rem;color:var(--muted);max-width:46ch;margin-top:1rem}
.shot{margin:2.2rem 0 0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#e9e4d4;box-shadow:0 1px 0 #fff inset,0 12px 32px -18px rgba(42,42,38,.35)}
.shot img{display:block;width:100%;height:auto}
main section{padding:2.4rem 0;border-bottom:1px solid var(--line)}
h2{font-size:1.45rem;margin-bottom:1rem}
ul.feats{list-style:none;padding:0;display:grid;gap:.7rem;max-width:44ch}
ul.feats li{padding-left:1.6rem;position:relative}
ul.feats li::before{content:"";position:absolute;left:0;top:.55em;width:.55rem;height:.55rem;border:1.5px solid var(--accent);border-radius:50%}
.connect{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:1.4rem 1.6rem;max-width:52ch}
.connect p{color:var(--muted);font-size:.98rem}
.cta{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:1.6rem}
.cta a{display:inline-block;padding:.65rem 1.3rem;border-radius:8px;text-decoration:none;font-size:.98rem}
.cta .primary{background:var(--accent);color:#fff}
.cta .primary:hover{background:#26493a}
.cta .secondary{border:1px solid var(--line);color:var(--ink);background:var(--card)}
.cta .secondary:hover{border-color:var(--accent);color:var(--accent)}
.index-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:1rem;padding:0;list-style:none}
.index-grid a{display:block;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:1.1rem 1.2rem;text-decoration:none;color:var(--ink)}
.index-grid a:hover{border-color:var(--accent)}
.index-grid .t{font-weight:700}
.index-grid .d{font-size:.88rem;color:var(--muted);margin-top:.25rem;display:block}
footer.site{padding:2rem 0 3rem;color:var(--muted);font-size:.85rem}
footer.site a{color:var(--accent)}
@media(max-width:640px){.hero{padding:2.5rem 0 1.8rem}}
`;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

export function renderToolPage(tool) {
  const url = `${SITE}${tool.path}`;
  const feats = tool.features.map((f) => `<li>${esc(f)}</li>`).join('\n');
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: tool.title,
        description: tool.description,
        url,
        isPartOf: { '@type': 'WebSite', name: 'Iterra', url: `${SITE}/` },
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Iterra', item: `${SITE}/` },
            { '@type': 'ListItem', position: 2, name: 'Tools', item: `${SITE}/tools` },
            { '@type': 'ListItem', position: 3, name: tool.name, item: url },
          ],
        },
      },
      {
        '@type': 'SoftwareApplication',
        name: `Iterra ${tool.name}`,
        url,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web browser',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        description: tool.description,
      },
    ],
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(tool.title)}</title>
<meta name="description" content="${esc(tool.description)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Iterra" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(tool.title)}" />
<meta property="og:description" content="${esc(tool.description)}" />
<meta property="og:image" content="${SITE}/shots/${tool.id}.webp" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(tool.title)}" />
<meta name="twitter:description" content="${esc(tool.description)}" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
<style>${CSS}</style>
${jsonLd(ld)}
</head>
<body>
<header class="site"><div class="wrap">
<a class="brand" href="/">Iterra</a>
<nav class="tools" aria-label="Iterra tools">
${TOOLS.map((t) => `<a href="${t.path}">${esc(t.name)}</a>`).join('\n')}
</div></header>
<div class="wrap">
<section class="hero">
<div class="kicker">${esc(tool.kicker)} · part of Iterra</div>
<h1>${esc(tool.h1)}</h1>
<p class="lede">${esc(tool.lede)}</p>
<div class="shot"><img src="/shots/${tool.id}.webp" alt="${esc(tool.name)} inside the Iterra study workspace" loading="lazy" width="1440" height="900" /></div>
</section>
<section>
<h2>What ${esc(tool.name)} does</h2>
<ul class="feats">
${feats}
</ul>
</section>
<section>
<div class="connect">
<p><strong>One workspace, not another tab.</strong> ${esc(tool.name)} shares a live picture of your courses with every other tool in Iterra — your planner knows when reviews are due, your notes surface in course dossiers, and everything works offline in your browser. No account required; your data never leaves your machine unless you choose sync.</p>
</div>
<div class="cta">
<a class="primary" href="/#/p/${tool.id}">Open ${esc(tool.name)} in Iterra →</a>
<a class="secondary" href="/tools">All eight tools</a>
<a class="secondary" href="/">Back to Iterra</a>
</div>
</section>
</div>
<footer class="site"><div class="wrap">
Iterra — an integrated study terrain. Free, local-first, and course-aware.
Tools: ${TOOLS.map((t) => `<a href="${t.path}">${esc(t.name)}</a>`).join(' · ')}
</div></footer>
</body>
</html>
`;
}

export function renderToolsIndex() {
  const url = `${SITE}/tools`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Iterra study tools',
        description: 'The eight tools of the Iterra study workspace.',
        url,
      },
    ],
  };
  const cards = TOOLS.map(
    (t) => `<li><a href="${t.path}"><span class="t">${esc(t.name)}</span><span class="d">${esc(t.kicker)} — ${esc(t.features[0].replace(/ — .*$/, '').toLowerCase())}</span></a></li>`,
  ).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Iterra Study Tools — Planner, Flashcards, Notes, Timer & More</title>
<meta name="description" content="Eight study tools in one local-first workspace: time-blocking planner, spaced-repetition flashcards, linked notes, pomodoro timer, math workbench, attendance, grading, and study materials." />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Iterra" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="Iterra Study Tools — Planner, Flashcards, Notes, Timer & More" />
<meta property="og:description" content="Eight study tools in one local-first workspace for students." />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
<style>${CSS}</style>
${jsonLd(ld)}
</head>
<body>
<header class="site"><div class="wrap">
<a class="brand" href="/">Iterra</a>
<nav class="tools" aria-label="Iterra tools">
${TOOLS.map((t) => `<a href="${t.path}">${esc(t.name)}</a>`).join('\n')}
</div></header>
<div class="wrap">
<section class="hero">
<div class="kicker">The terrain</div>
<h1>Eight tools. One study workspace.</h1>
<p class="lede">Iterra gives every course a place. Plan the week, review the cards, write the notes, run the timer, work the math — all local-first, all connected.</p>
</section>
<section>
<ul class="index-grid">
${cards}
</ul>
<div class="cta" style="margin-top:2rem">
<a class="primary" href="/#/today">Open the workspace →</a>
<a class="secondary" href="/">Back to Iterra</a>
</div>
</section>
</div>
<footer class="site"><div class="wrap">Iterra — free, local-first, and course-aware.</div></footer>
</body>
</html>
`;
}

export function renderSitemap(lastmod = new Date().toISOString().slice(0, 10)) {
  const urls = [
    { loc: `${SITE}/`, priority: '1.0', freq: 'weekly' },
    { loc: `${SITE}/tools`, priority: '0.8', freq: 'weekly' },
    ...TOOLS.map((t) => ({ loc: `${SITE}${t.path}`, priority: '0.7', freq: 'monthly' })),
  ];
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function writeSeoPages(distDir) {
  mkdirSync(join(distDir, 'tools'), { recursive: true });
  writeFileSync(join(distDir, 'tools', 'index.html'), renderToolsIndex());
  for (const tool of TOOLS) {
    mkdirSync(join(distDir, 'tools', tool.id), { recursive: true });
    writeFileSync(join(distDir, 'tools', tool.id, 'index.html'), renderToolPage(tool));
  }
  writeFileSync(join(distDir, 'sitemap.xml'), renderSitemap());
  console.log(`seo: wrote /tools index + ${TOOLS.length} tool pages + sitemap.xml`);
}
