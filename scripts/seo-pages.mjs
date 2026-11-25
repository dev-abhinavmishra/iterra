/* SEO marketing pages — static HTML emitted into dist/ at build time.
   One page per place plus a /tools index. Pure HTML+CSS (no JS required)
   so crawlers get the full content; CTAs deep-link into the SPA's hash
   routes. Styled to match the landing page's atlas look: deep-green sky,
   gold hairlines, Newsreader display type, IBM Plex Mono labels. */
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
    h1: 'A day, <em>boxed</em> and planned',
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
    h1: 'Every course, every week, <em>one folio</em>',
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
    h1: 'Keep your study <em>rhythm</em> visible',
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
    h1: 'Recall, <em>on schedule</em>',
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
    h1: 'Notes that <em>connect</em> like ideas do',
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
    h1: 'Every handout, <em>filed by course</em>',
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
    h1: 'From answer sheet <em>to insight</em>',
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
    h1: 'Time, measured in <em>sessions</em>',
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
    h1: 'Work the problem, <em>keep the proof</em>',
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

/* Palette + type lifted from shell/src/landing.css and index.css so these
   static pages sit visually inside the same world as the app. */
const CSS = `
:root{
  --paper:#f4f1e8; --sheet:#fbf9f4; --sheet2:#ebe5d6;
  --line:#d8d0bc; --line2:#b8ad93;
  --ink:#1c2621; --mute:#4c5951; --faint:#6e6552;
  --accent:#2b5440; --accent2:#223d30;
  --night:#102e24; --night2:#102f24; --night3:#183e2c;
  --cream:#f6efda; --parch:#f5edd7; --gold:#e2b86e; --gold2:#d9c897; --gold3:#ffdda0; --sage:#c8e8a5; --sage2:#d2dfd3;
}
*{box-sizing:border-box;margin:0}
html{scroll-behavior:smooth}
body{font-family:Newsreader,Georgia,'Times New Roman',serif;background:var(--paper);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased}
.mono{font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace}
.wrap{max-width:72rem;margin:0 auto;padding:0 clamp(16px,4vw,56px)}

/* ── nav — mirrors .atlas-nav ─────────────────────────── */
header.site{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px clamp(12px,4vw,64px);color:var(--parch);background:var(--night);border-bottom:1px solid #d9c89740}
.brand{display:flex;align-items:center;gap:10px;font:500 22px/1 Georgia,serif;letter-spacing:-.03em;color:var(--cream);text-decoration:none}
.emblem{display:grid;grid-template:repeat(2,7px)/repeat(2,7px);gap:2px;transform:rotate(45deg)}
.emblem i{background:#a1d2a1;box-shadow:inset 1px 1px #d4eac1}
.emblem i:nth-child(2){background:#dfd6a0}.emblem i:nth-child(3){background:#65a582}
nav.tools{display:flex;align-items:center;gap:2px;background:#284636;border-radius:9px;padding:3px;overflow-x:auto;scrollbar-width:none}
nav.tools::-webkit-scrollbar{display:none}
nav.tools a{white-space:nowrap;display:inline-flex;align-items:center;min-height:34px;padding:0 12px;border-radius:7px;color:var(--parch);font-family:'IBM Plex Mono',monospace;font-size:12px;text-decoration:none}
nav.tools a:hover{background:#e1ebd312}
nav.tools a.open{color:var(--gold3)}

/* ── hero — mirrors .atlas-sky ────────────────────────── */
.hero{position:relative;isolation:isolate;overflow:hidden;background:radial-gradient(ellipse at 72% 30%,#315c40 0%,#183e2c 34%,#102f24 62%,#0b231a 100%);color:var(--cream);padding:clamp(48px,8vw,110px) 0 clamp(56px,8vw,96px)}
.hero::before{content:"";position:absolute;inset:0;z-index:-1;opacity:.32;background-image:linear-gradient(#89b0a01f 1px,transparent 1px),linear-gradient(90deg,#89b0a01f 1px,transparent 1px);background-size:56px 56px;mask-image:linear-gradient(120deg,transparent,#000 70%)}
.hero::after{content:"";position:absolute;inset:clamp(14px,3vw,28px);z-index:-1;border:1px solid #d7bf8442;background:linear-gradient(#ddc690,#ddc690) left top/25px 1px,linear-gradient(#ddc690,#ddc690) left top/1px 25px,linear-gradient(#ddc690,#ddc690) right bottom/25px 1px,linear-gradient(#ddc690,#ddc690) right bottom/1px 25px;background-repeat:no-repeat}
.kicker{font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}
h1{font-family:Newsreader,Georgia,serif;font-weight:450;letter-spacing:-.045em;font-size:clamp(2.4rem,6vw,4.6rem);line-height:1.04;max-width:20ch;margin:.5rem 0 1.1rem}
h1 em{color:var(--sage);font-style:italic;font-weight:400}
.lede{max-width:52ch;color:var(--sage2);font-size:clamp(1.02rem,1.6vw,1.25rem);line-height:1.65}
.hero .wrap{position:relative}

/* screenshot plate — overlaps hero bottom onto paper */
.plate{position:relative;z-index:2}
.frame{border:1px solid var(--gold2);border-radius:12px;overflow:hidden;background:var(--night2);box-shadow:0 1px 0 #fff8 inset,0 30px 60px -30px rgba(16,46,36,.55)}
.frame img{display:block;width:100%;height:auto}
.frame figcaption{display:flex;justify-content:space-between;gap:1rem;padding:.7rem 1rem;border-top:1px solid #d9c89740;color:#cbbd95;font-family:'IBM Plex Mono',monospace;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase}

/* ── body sections on paper ───────────────────────────── */
section.block{padding:clamp(48px,7vw,96px) 0;border-bottom:1px solid var(--line)}
h2.sec{font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-bottom:2rem}
.feats{list-style:none;padding:0;max-width:56rem}
.feats li{display:grid;grid-template-columns:auto 1fr;gap:1rem;align-items:baseline;padding:1.05rem 0;border-bottom:1px solid var(--line)}
.feats li:first-child{border-top:1px solid var(--line)}
.feats .n{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--gold);padding-top:.2rem}
.feats .t{font-size:1.12rem}
.connect{position:relative;background:var(--night2);color:var(--cream);border-radius:14px;padding:clamp(28px,4vw,48px);overflow:hidden}
.connect::before{content:"";position:absolute;inset:0;background:url('/atlas/contours.webp') center/cover;opacity:.18;pointer-events:none}
.connect>div{position:relative}
.connect h3{font-family:Newsreader,Georgia,serif;font-weight:450;font-size:clamp(1.5rem,3vw,2.1rem);letter-spacing:-.03em;color:var(--cream);margin-bottom:.8rem}
.connect p{color:var(--sage2);max-width:60ch;font-size:1.05rem}
.connect .mono{color:var(--gold);font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;display:block;margin-bottom:1rem}
.cta{display:flex;flex-wrap:wrap;gap:.9rem;margin-top:2rem}
.cta a{display:inline-flex;align-items:center;gap:.5rem;padding:.8rem 1.5rem;border-radius:7px;text-decoration:none;font-size:1rem;transition:transform .15s,background .15s}
.cta .primary{background:#d1e8aa;color:#112827;font-weight:600}
.cta .primary:hover{background:#e5f3c8;transform:translateY(-1px)}
.cta .ghost{border:1px solid var(--gold2);color:var(--cream)}
.cta .ghost:hover{border-color:var(--gold);color:var(--gold3)}

/* ── tools index ──────────────────────────────────────── */
.index-grid{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(15.5rem,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.index-grid a{display:block;background:var(--sheet);padding:1.3rem 1.4rem;text-decoration:none;color:var(--ink);transition:background .15s}
.index-grid a:hover{background:var(--sheet2)}
.index-grid .t{font-family:Newsreader,Georgia,serif;font-size:1.45rem;font-weight:500;letter-spacing:-.02em;display:block}
.index-grid .k{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);display:block;margin-top:.3rem}
.index-grid .d{font-size:.92rem;color:var(--mute);display:block;margin-top:.5rem;line-height:1.5}

/* ── footer — mirrors .atlas-end ──────────────────────── */
footer.site{position:relative;isolation:isolate;overflow:hidden;background:var(--night2);color:var(--cream);padding:clamp(40px,6vw,72px) 0 clamp(56px,8vw,96px)}
footer.site::before{content:"";position:absolute;inset:0;z-index:-2;background:url('/atlas/contours.webp') center/cover;opacity:.2}
footer.site::after{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse at 70% 0%,#315c4033,transparent 60%)}
.foot-sig{font-family:Newsreader,Georgia,serif;font-weight:500;font-size:clamp(3rem,9vw,6.5rem);line-height:.9;letter-spacing:-.06em}
.foot-sig em{color:var(--gold);font-style:italic}
.foot-links{display:flex;flex-wrap:wrap;gap:.4rem 1.4rem;margin-top:1.4rem}
.foot-links a{color:var(--sage2);text-decoration:none;font-size:.95rem;border-bottom:1px solid transparent}
.foot-links a:hover{color:var(--gold3);border-color:var(--gold2)}
.foot-meta{margin-top:1.6rem;color:#9db3a4;font-family:'IBM Plex Mono',monospace;font-size:11.5px;letter-spacing:.06em}

@media(max-width:720px){
  nav.tools{display:none}
  .feats .t{font-size:1.02rem}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.cta a{transition:none}}
`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />`;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

const NAV_LINKS = TOOLS.map((t) => `<a href="${t.path}">${esc(t.name)}</a>`).join('\n');

function header(activePath) {
  const links = TOOLS.map(
    (t) => `<a href="${t.path}"${t.path === activePath ? ' aria-current="page"' : ''}>${esc(t.name)}</a>`,
  ).join('\n');
  return `<header class="site">
<a class="brand" href="/"><span class="emblem" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Iterra</a>
<nav class="tools" aria-label="Iterra tools">
${links}
<a class="open" href="/#/today">Open workspace →</a>
</nav>
</header>`;
}

function footer() {
  return `<footer class="site"><div class="wrap">
<div class="foot-sig">Iterra<em>.</em></div>
<div class="foot-links">
<a href="/">Overview</a>
<a href="/tools">All tools</a>
${TOOLS.map((t) => `<a href="${t.path}">${esc(t.name)}</a>`).join('\n')}
</div>
<div class="foot-meta">FREE · LOCAL-FIRST · COURSE-AWARE — NO ACCOUNT REQUIRED</div>
</div></footer>`;
}

export function renderToolPage(tool) {
  const url = `${SITE}${tool.path}`;
  /* h1 carries one <em> for the sage italic accent — split it out safely */
  const hm = tool.h1.match(/^(.*?)<em>(.*?)<\/em>(.*)$/s) || [null, tool.h1, '', ''];
  const h1html = `${esc(hm[1])}${hm[2] ? `<em>${esc(hm[2])}</em>` : ''}${esc(hm[3] || '')}`;
  const feats = tool.features
    .map((f, i) => `<li><span class="n mono">${String(i + 1).padStart(2, '0')}</span><span class="t">${esc(f)}</span></li>`)
    .join('\n');
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
${FONTS}
<style>${CSS}</style>
${jsonLd(ld)}
</head>
<body>
${header(tool.path)}
<section class="hero"><div class="wrap">
<div class="kicker mono">${esc(tool.kicker)} · the ${esc(tool.name)} place</div>
<h1>${h1html}</h1>
<p class="lede">${esc(tool.lede)}</p>
</div></section>
<div class="wrap">
<figure class="plate">
<div class="frame"><img src="/shots/${tool.id}.webp" alt="${esc(tool.name)} inside the Iterra study workspace" width="1440" height="900" /></div>
<figcaption><span>Iterra · ${esc(tool.name)}</span><span>Local-first study terrain</span></figcaption>
</figure>
<section class="block">
<h2 class="sec mono">What ${esc(tool.name)} does</h2>
<ul class="feats">
${feats}
</ul>
</section>
<section class="block">
<div class="connect"><div>
<span class="mono">One workspace, not another tab</span>
<h3>The terrain does the remembering.</h3>
<p>${esc(tool.name)} shares a live picture of your courses with every other tool in Iterra — your planner knows when reviews are due, your notes surface in course dossiers, and everything works offline in your browser. No account required; your data never leaves your machine unless you choose sync.</p>
<div class="cta">
<a class="primary" href="/#/p/${tool.id}">Open ${esc(tool.name)} in Iterra →</a>
<a class="ghost" href="/tools">All eight tools</a>
</div>
</div></div>
</section>
</div>
${footer()}
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
    (t) => `<li><a href="${t.path}"><span class="k mono">${esc(t.kicker)}</span><span class="t">${esc(t.name)}</span><span class="d">${esc(t.lede.split('.')[0])}.</span></a></li>`,
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
${FONTS}
<style>${CSS}</style>
${jsonLd(ld)}
</head>
<body>
${header('/tools')}
<section class="hero"><div class="wrap">
<div class="kicker mono">The terrain</div>
<h1>Eight tools. <em>One study workspace.</em></h1>
<p class="lede">Iterra gives every course a place. Plan the week, review the cards, write the notes, run the timer, work the math — all local-first, all connected.</p>
</div></section>
<div class="wrap">
<section class="block" style="border-bottom:none">
<h2 class="sec mono">Choose your place</h2>
<ul class="index-grid">
${cards}
</ul>
<div class="cta" style="margin-top:2.5rem">
<a class="primary" href="/#/today">Open the workspace →</a>
<a class="ghost" href="/">Back to overview</a>
</div>
</section>
</div>
${footer()}
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
