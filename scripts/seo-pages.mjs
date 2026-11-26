/* SEO marketing pages — static HTML emitted into dist/ at build time.
   One page per place plus a /tools index. Pure HTML+CSS (no JS required)
   so crawlers get the full content; CTAs deep-link into the SPA's hash
   routes. Styled to match the landing page's atlas look: deep-green sky,
   gold hairlines, Newsreader display type, IBM Plex Mono labels. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUIDES, GUIDE_BY_SLUG } from './seo-guides-data.mjs';
import { COMPARE_PAGES } from './seo-compare-data.mjs';

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
    faqs: [
      { q: "Do I have to plan my whole week in Boxed?", a: "No — Boxed works day by day. Dump today's tasks, pick the few that matter, time-box them, and done. The weekly view fills in on its own as you use it." },
      { q: "What happens to tasks I don't finish?", a: "They don't vanish. Unfinished boxes roll forward so tomorrow's dump starts honest instead of starting over." },
      { q: "Is Boxed a calendar or a to-do list?", a: "It's the step between them. A to-do list says what; a calendar says when. Boxed turns 'study bio' into 'bio reading, 2–4pm, Tuesday' — a commitment small enough to keep." },
    ],
    facts: [
      'Brain dump first',
      'Time-boxed blocks',
      'Rolls work forward',
      'No account'
    ],
    workflow: [
      { t: 'Dump the day', d: 'Empty your head into Boxed first — tasks, worries, half-ideas. Nothing gets prioritized until it’s out.' },
      { t: 'Pick the vital few', d: 'Choose the three to five boxes that would make today a win. Everything else waits or rolls.' },
      { t: 'Time-box each one', d: 'Give each chosen task a realistic block — 25 minutes for admin, 90 for deep work — and let the timer hold you to it.' },
      { t: 'Close the loop', d: 'At day’s end, unfinished boxes roll forward honestly instead of vanishing into guilt.' }
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
    faqs: [
      { q: "Do I have to set up every course manually?", a: "Once per term, yes — and that's the point. Ten minutes of setup in week one buys you a semester of 'what's due when' answered automatically." },
      { q: "Does Syllabus replace my Google Calendar?", a: "It plans the study blocks; your calendar keeps the lectures. Most students run both — Syllabus decides what to work on, the calendar decides where you physically are." },
      { q: "What if my schedule changes mid-semester?", a: "The folio is meant to be edited, not worshipped. Move a block, drop a commitment, and the week replans around it." },
    ],
    facts: [
      'Term setup once',
      'Weekly block grid',
      'Commitment tracking',
      'Timer-linked'
    ],
    workflow: [
      { t: 'Set the term once', d: 'Enter courses, meeting times, and grading weights in the first week. The folio does the remembering after that.' },
      { t: 'Place weekly blocks', d: 'Assign recurring study blocks per course at times you actually have energy — same slots every week.' },
      { t: 'Track commitments', d: 'Add assignments and exams as they’re announced; the plan rearranges around real deadlines.' },
      { t: 'Launch from the block', d: 'When a block arrives, start its bound focus session so planning and timing stay linked.' }
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
    faqs: [
      { q: "How is Rhythm different from a habit tracker?", a: "A habit tracker counts reps. Rhythm keeps the register — your study cadence and class attendance in one place — so 'am I actually showing up' is a glance, not a guess." },
      { q: "Do missed days break everything?", a: "Streaks reset, patterns don't. The register is honest about the gap and keeps going — one bad week doesn't erase the semester." },
      { q: "Can it track attendance as well as habits?", a: "Yes — that's the 'register' idea. Class attendance and study sessions live on the same weekly grid." },
    ],
    facts: [
      'Weekly register',
      'Habit + attendance',
      'Streak signals',
      'Feeds Today'
    ],
    workflow: [
      { t: 'Register the week', d: 'Lay out classes, habits, and study sessions on the weekly grid so consistency is visible.' },
      { t: 'Log honestly', d: 'Mark what happened — attendance, sessions, streaks — even when the answer is “missed.”' },
      { t: 'Read the pattern', d: 'Use cadence signals on Today to see whether you’re showing up, not just whether you feel busy.' },
      { t: 'Adjust the cue', d: 'When a habit slips, change the trigger or the time — the register shows where the week leaks.' }
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
    faqs: [
      { q: "Is this real spaced repetition or just flashcards?", a: "Real scheduling — cards come due based on how you answered, not on a fixed rotation. It's deliberately simpler than Anki's engine, which is the point." },
      { q: "Can I import decks from Quizlet or Anki?", a: "Cards can come in through links the workspace shares. There's no bulk CSV importer yet — if your deck lives in a file, copy-paste is still faster than rebuilding it." },
      { q: "Do my decks sync to my phone?", a: "Iterra runs in the browser and works offline after first load. Sync across devices isn't wired up yet — treat it as your study device's cardfile." },
    ],
    facts: [
      'Spaced scheduling',
      'Quizzes + drills',
      'Due counts on Today',
      'Decks stay local'
    ],
    workflow: [
      { t: 'Make cards from notes', d: 'Turn lecture notes into atomic questions within a day — one idea per card, recall over recognition.' },
      { t: 'Review what’s due', d: 'Let the scheduler surface today’s cards; ten honest minutes beats an hour of cramming.' },
      { t: 'Grade without mercy', d: 'Mark “again” when recall fails — the interval resets and the card earns its place.' },
      { t: 'Prune and grow slowly', d: 'Add new cards only as fast as reviews stay current; archive mastered decks at term’s end.' }
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
    faqs: [
      { q: "Are my notes actually private?", a: "Yes — Ink is local-first. Notes live in your browser's storage, not a server. Export them anytime; nothing is held hostage." },
      { q: "Does Ink support markdown?", a: "Ink is built for long-form writing with wiki-links between notes. Pasting markdown works; it isn't a markdown editor first." },
      { q: "Can notes connect to my courses and cards?", a: "Yes — notes can be tagged to courses and wiki-linked to each other, so a lecture note can surface inside the course dossier alongside its flashcards." },
    ],
    facts: [
      'Wiki-linked notes',
      'Course-tagged',
      'Daily pages',
      'Local-first'
    ],
    workflow: [
      { t: 'Capture in daily pages', d: 'Keep lecture notes and thinking in daily pages so the raw stream is never lost.' },
      { t: 'Link as you understand', d: 'Wiki-link concepts to courses and other notes so ideas connect while they’re fresh.' },
      { t: 'Review within a day', d: 'Revisit notes within 24 hours, fill gaps, and write the cue questions that make them testable.' },
      { t: 'Let courses cite it', d: 'Tag notes to courses so they surface inside dossiers alongside cards and materials.' }
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
    faqs: [
      { q: "What can I store in Margin?", a: "Recordings, PDFs, slides, scanned handouts — the raw material of a course, filed by course and topic so Notes and Flashcards can reach it." },
      { q: "Is Margin a Google Drive replacement?", a: "No — Drive stores files; Margin organizes course material. Think of it as the shelf your notes and cards draw from, not a sync client." },
      { q: "Is there a storage limit?", a: "Everything lives in your browser, so you're bounded by browser storage — generous for documents and recordings, but very large media libraries are worth keeping elsewhere too." },
    ],
    facts: [
      'Course-filed shelf',
      'Docs + recordings',
      'Cited by tools',
      'Browser storage'
    ],
    workflow: [
      { t: 'File by course', d: 'Drop recordings, PDFs, and handouts onto the course shelf as they arrive.' },
      { t: 'Let tools reach it', d: 'Notes, cards, and dossiers can cite what’s on the shelf instead of duplicating it.' },
      { t: 'Review the raw material', d: 'Use document chat and analysis to interrogate slides and readings before class.' },
      { t: 'Export what matters', d: 'Keep the shelf local-first; export anything you’d be sad to lose.' }
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
    faqs: [
      { q: "Do I need a physical scanner?", a: "No — capture works through your device camera in the browser. You print the bubble sheet, students fill it in, you photograph it." },
      { q: "Is GradeStack only for teachers?", a: "Teachers get the roster and class analytics; anyone self-quizzing gets the same builder and grading without the classroom layer." },
      { q: "Can it grade freeform written answers?", a: "No — it's built for structured answer sheets (bubbles and scantron-style marks), not essay grading. For written work, Ink's notes and Proof's error log do the heavy lifting." },
    ],
    facts: [
      'Printable sheets',
      'Camera grading',
      'Score trends',
      'Roster support'
    ],
    workflow: [
      { t: 'Build the assessment', d: 'Create the quiz and printable bubble sheet in one pass — questions map to the sheet automatically.' },
      { t: 'Print and sit', d: 'Hand out the sheet; students fill bubbles while you prepare the capture.' },
      { t: 'Scan and grade', d: 'Photograph sheets with the device camera; grading runs in the browser with no scanner needed.' },
      { t: 'Read the trends', d: 'Score analytics show which concepts the class missed — feed that back into review.' }
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
    faqs: [
      { q: "Are the pomodoro lengths customizable?", a: "Yes — sessions and interval routes are configurable, and you can launch a session straight from a Syllabus block so the plan and the timer stay linked." },
      { q: "Does Timer track time even when I'm not in a session?", a: "It logs sessions you start — honest focus time, not ambient surveillance. The ledger shows what you actually sat down for." },
      { q: "Can I use the timer without the rest of Iterra?", a: "Timer lives inside the workspace — open Iterra in a mobile browser and it's there, offline, no account." },
    ],
    facts: [
      'Pomodoro + intervals',
      'Session ledger',
      'Launches from blocks',
      'Works offline'
    ],
    workflow: [
      { t: 'Pick the work', d: 'Choose the task or Syllabus block you’re about to do — the timer starts from the plan, not from guilt.' },
      { t: 'Set the interval', d: 'Use a pomodoro for shallow work or a longer route for deep blocks; the method fits the task.' },
      { t: 'Take real breaks', d: 'Breaks mean stepping away — the ledger counts sessions, not screen time.' },
      { t: 'Let minutes file back', d: 'Completed sessions return to the planner and Today rail, so the week shows honest focus time.' }
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
    faqs: [
      { q: "Does Proof just solve the problem for me?", a: "No — it's a workbench, not an answer machine. You work the steps; Proof keeps the problem set, your derivations, and resurfaces what you missed." },
      { q: "What subjects does it cover?", a: "Math-first: problem sets, step-by-step working, and an error log that brings missed concepts back around for review." },
      { q: "Is it a graphing calculator replacement?", a: "It complements one — Proof is for practicing method, not for computing answers quickly. The error log is what makes it study software instead of a solver." },
    ],
    facts: [
      'Step-by-step workbench',
      'Error log review',
      'Course-linked sets',
      'Feeds Today queue'
    ],
    workflow: [
      { t: 'Assign the set', d: 'Pick course-linked problem sets matched to what the syllabus says is coming.' },
      { t: 'Work the steps', d: 'Attempt problems before checking anything — the struggle is where the learning happens.' },
      { t: 'Log the misses', d: 'The error log captures what went wrong so missed concepts come back for review.' },
      { t: 'Feed the queue', d: 'Weak areas resurface in Today and review queues instead of disappearing into a gradebook.' }
    ],
    keywords: ['math problem solver', 'step by step math', 'error log study', 'math workbench'],
  },
];

const TOOL_NEIGHBORS = {
  boxed: ['syllabus', 'timer', 'rhythm'],
  syllabus: ['boxed', 'timer', 'rhythm'],
  rhythm: ['syllabus', 'timer', 'boxed'],
  flashcards: ['proof', 'timer', 'ink'],
  ink: ['margin', 'flashcards', 'syllabus'],
  margin: ['ink', 'flashcards', 'syllabus'],
  gradestack: ['proof', 'syllabus', 'rhythm'],
  timer: ['boxed', 'syllabus', 'flashcards'],
  proof: ['gradestack', 'flashcards', 'timer'],
};

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
body{font-family:Archivo,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--paper);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased}
.mono{font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace}
.wrap{max-width:72rem;margin:0 auto;padding:0 clamp(16px,4vw,56px)}

/* ── nav — mirrors .atlas-nav ─────────────────────────── */
header.site{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px clamp(12px,4vw,64px);color:var(--parch);background:var(--night);border-bottom:1px solid #d9c89740}
.brand{display:flex;align-items:center;gap:10px;font:500 22px/1 Georgia,serif;letter-spacing:-.03em;color:var(--cream);text-decoration:none}
.emblem{display:grid;grid-template:repeat(2,7px)/repeat(2,7px);gap:2px;transform:rotate(45deg)}
.emblem i{background:#a1d2a1;box-shadow:inset 1px 1px #d4eac1}
.emblem i:nth-child(2){background:#dfd6a0}.emblem i:nth-child(3){background:#65a582}
nav.tools{display:flex;align-items:center;gap:2px;flex:0 1 auto;min-width:0;max-width:100%;background:#284636;border-radius:9px;padding:3px;overflow-x:auto;scrollbar-width:none}
nav.tools::-webkit-scrollbar{display:none}
nav.tools a{white-space:nowrap;display:inline-flex;align-items:center;min-height:34px;padding:0 12px;border-radius:7px;color:var(--parch);font-family:'IBM Plex Mono',monospace;font-size:12px;text-decoration:none;transition:background .15s,color .15s}
nav.tools a:hover{background:#e1ebd312}
nav.tools a.on{color:var(--gold3);background:#e2b86e14}
nav.tools a.open{color:var(--gold3)}

/* ── hero — mirrors .atlas-sky ────────────────────────── */
.hero{position:relative;isolation:isolate;overflow:hidden;background:radial-gradient(ellipse at 72% 30%,#315c40 0%,#183e2c 34%,#102f24 62%,#0b231a 100%);color:var(--cream);padding:clamp(48px,8vw,110px) 0 clamp(56px,8vw,96px)}
.hero::before{content:"";position:absolute;inset:0;z-index:-1;opacity:.32;background-image:linear-gradient(#89b0a01f 1px,transparent 1px),linear-gradient(90deg,#89b0a01f 1px,transparent 1px);background-size:56px 56px;mask-image:linear-gradient(120deg,transparent,#000 70%)}
.hero::after{content:"";position:absolute;inset:clamp(14px,3vw,28px);z-index:-1;border:1px solid #d7bf8442;background:linear-gradient(#ddc690,#ddc690) left top/25px 1px,linear-gradient(#ddc690,#ddc690) left top/1px 25px,linear-gradient(#ddc690,#ddc690) right bottom/25px 1px,linear-gradient(#ddc690,#ddc690) right bottom/1px 25px;background-repeat:no-repeat}
.kicker{font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}
.crumbs{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#c8b78d;margin-bottom:1.4rem;display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
.crumbs a{color:inherit;text-decoration:none;border-bottom:1px solid transparent}
.crumbs a:hover{color:var(--gold3);border-color:#d9c89755}
.crumbs .sep{color:#8ba392}
h1{font-family:Newsreader,Georgia,serif;font-weight:450;letter-spacing:-.045em;font-size:clamp(2.4rem,6vw,4.6rem);line-height:1.04;max-width:20ch;margin:.5rem 0 1.1rem}
h1 em{color:var(--sage);font-style:italic;font-weight:400}
.lede{max-width:52ch;color:var(--sage2);font-size:clamp(1.02rem,1.6vw,1.25rem);line-height:1.65}
.hero .wrap{position:relative}

/* screenshot plate — pulled up over the hero's lower padding for an editorial overlap */
.plate{position:relative;z-index:2;margin-top:clamp(-72px,-5vw,-44px)}
.frame{border:1px solid var(--gold2);border-radius:12px;overflow:hidden;background:var(--night2);box-shadow:0 1px 0 #fff8 inset,0 30px 60px -30px rgba(16,46,36,.55)}
.frame img{display:block;width:100%;height:auto;transition:transform .6s cubic-bezier(.2,.6,.2,1)}
.frame:hover img{transform:scale(1.012)}
.frame figcaption{display:flex;justify-content:space-between;gap:1rem;margin-top:.9rem;padding:.75rem 1.1rem;border:1px solid var(--line);border-radius:10px;background:var(--sheet);color:var(--mute);font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.frame figcaption span:last-child{color:var(--faint)}

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
.cta .ghost{border:1px solid var(--line2);color:var(--ink)}
.cta .ghost:hover{border-color:var(--accent);color:var(--accent2)}
.connect .cta .ghost,.verdict .cta .ghost{border-color:var(--gold2);color:var(--cream)}
.connect .cta .ghost:hover,.verdict .cta .ghost:hover{border-color:var(--gold);color:var(--gold3)}

/* ── tools index ──────────────────────────────────────── */
.index-grid{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(15.5rem,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.index-grid a{position:relative;display:flex;flex-direction:column;min-height:10.75rem;background:var(--sheet);padding:1.3rem 2.6rem 1.3rem 1.4rem;text-decoration:none;color:var(--ink);transition:background .15s}
.index-grid a::after{content:"→";position:absolute;right:1.1rem;top:1.15rem;color:var(--gold);font-family:'IBM Plex Mono',monospace;opacity:0;transform:translateX(-4px);transition:opacity .15s,transform .15s}
.index-grid a:hover{background:var(--sheet2)}
.index-grid a:hover::after{opacity:1;transform:none}
.index-grid .t{font-family:Newsreader,Georgia,serif;font-size:1.45rem;font-weight:500;letter-spacing:-.02em;display:block;line-height:1.2}
.index-grid .k{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);display:block;margin-top:.35rem}
.index-grid .d{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:.92rem;color:var(--mute);margin-top:.55rem;line-height:1.5}
.skin-grid{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(19rem,1fr));gap:1rem}
.skin-card{display:flex;flex-direction:column;gap:.8rem;border:1px solid var(--line);border-radius:14px;background:var(--sheet);padding:1.2rem 1.3rem;text-decoration:none;color:var(--ink);transition:border-color .15s,transform .15s}
.skin-card:hover{border-color:var(--gold2);transform:translateY(-2px)}
.skin-card .top{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.skin-card .t{font-family:Newsreader,Georgia,serif;font-size:1.45rem;font-weight:500;letter-spacing:-.02em}
.skin-card .use{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
.swatches{display:flex;gap:.35rem}
.swatches i{width:1.6rem;height:1.6rem;border-radius:5px;border:1px solid #0002}
.skin-card .tagline{font-size:.94rem;color:var(--mute);line-height:1.55}
.skin-links{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:auto}
.skin-links a{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.06em;border:1px solid var(--line2);border-radius:999px;padding:.35rem .75rem;color:var(--accent);text-decoration:none;background:var(--paper)}
.skin-links a:hover{border-color:var(--accent)}

/* ── comparison & alternatives pages (Chunk A) ────────── */
.compare-table{width:100%;min-width:36rem;border-collapse:collapse;font-size:.98rem}
.compare-table th,.compare-table td{padding:.7rem .9rem;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.compare-table thead th{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);border-bottom:2px solid var(--line2)}
.compare-table tbody th{font-weight:600;white-space:nowrap;position:sticky;left:0;background:var(--sheet);z-index:1;box-shadow:1px 0 0 var(--line)}
.compare-table td:first-of-type{color:var(--mute)}
.compare-table .us{background:#eef4ea}
.compare-table thead .us{color:var(--accent)}
.compare-table tbody tr.us td{background:#f4f8f2}
.compare-table tbody tr.us td.us{background:#e2edde}
@media(prefers-reduced-motion:no-preference){.compare-table tbody tr{transition:background .15s}.compare-table tbody tr:not(.us):hover td{background:#faf6ea}}
.wins-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.win-card{border:1px solid var(--line);border-radius:12px;padding:1.4rem 1.5rem;background:var(--sheet)}
.win-card.us{border-color:#9db8a4;background:linear-gradient(180deg,#f2f7f1,var(--sheet))}
.win-card.them{background:var(--sheet)}
.win-card h3{font-family:'IBM Plex Mono',monospace;font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:.9rem}
.win-card.us h3{color:var(--accent)}
.win-card.them h3{color:var(--faint)}
.win-card ul{list-style:none;padding:0;display:grid;gap:.6rem}
.win-card li{padding-left:1.3rem;position:relative;font-size:.98rem;line-height:1.5}
.win-card li::before{content:"";position:absolute;left:0;top:.55em;width:.5rem;height:.5rem;border-radius:50%}
.win-card.us li::before{background:var(--accent)}
.win-card.them li::before{border:1.5px solid var(--line2)}
.verdict{background:var(--night2);color:var(--cream);border-radius:14px;padding:clamp(26px,4vw,44px);position:relative;overflow:hidden}
.verdict::before{content:"";position:absolute;inset:0;background:url('/atlas/contours.webp') center/cover;opacity:.16;pointer-events:none}
.verdict>div{position:relative}
.verdict .mono{color:var(--gold);font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;display:block;margin-bottom:.9rem}
.verdict p{color:var(--sage2);max-width:62ch;font-size:1.08rem;line-height:1.7}
.verdict p strong{color:var(--cream)}
.faq-list{display:grid;gap:.6rem;max-width:56rem}
details.faq{border:1px solid var(--line);border-radius:10px;background:var(--sheet);padding:.9rem 1.2rem}
details.faq summary{cursor:pointer;font-weight:600;font-size:1.05rem;list-style:none;display:flex;justify-content:space-between;gap:1rem;align-items:baseline}
details.faq summary::after{content:"+";font-family:'IBM Plex Mono',monospace;color:var(--accent);font-size:1.2rem}
details.faq[open] summary::after{content:"–"}
details.faq .a{margin-top:.7rem;color:var(--mute);font-size:.98rem;line-height:1.65}
.related-row{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1.4rem}
.related-row a{font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.05em;border:1px solid var(--line2);border-radius:999px;padding:.4rem .95rem;color:var(--accent);text-decoration:none;background:var(--sheet)}
.related-row a:hover{border-color:var(--accent)}
@media(max-width:720px){.wins-grid{grid-template-columns:1fr}}

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

/* ── guides / long-form articles ──────────────────────── */
.prose{max-width:46rem}
.prose h2{font-family:Newsreader,Georgia,serif;font-weight:500;font-size:clamp(1.45rem,3vw,1.85rem);letter-spacing:-.02em;line-height:1.25;margin:2.8rem 0 .9rem;scroll-margin-top:96px}
.prose h2 .h-anchor{font-family:'IBM Plex Mono',monospace;font-size:.5em;font-weight:400;color:var(--gold);text-decoration:none;opacity:0;margin-left:.55rem;vertical-align:.12em;transition:opacity .15s}
.prose h2:hover .h-anchor,.prose h2 .h-anchor:focus-visible{opacity:1}
.guide-article{max-width:52rem}
.toc{border:1px solid #d9c89755;border-radius:12px;background:#183e2c12;padding:1.1rem 1.4rem;margin:2rem 0 1rem}
.toc .tk{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);display:block;margin-bottom:.7rem}
.toc ol{list-style:none;padding:0;display:grid;gap:.45rem;counter-reset:toc}
.toc li{counter-increment:toc;font-size:.98rem;line-height:1.5}
.toc li::before{content:counter(toc,decimal-leading-zero) " · ";font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--faint);letter-spacing:.08em}
.toc a{color:var(--ink);text-decoration:none;border-bottom:1px solid transparent}
.toc a:hover{color:var(--accent);border-color:var(--gold2)}
.prose p{font-size:1.08rem;line-height:1.78;color:#2c352f;margin-bottom:1.15rem}
.prose ul{margin:0 0 1.3rem;padding-left:1.35rem}
.prose li{font-size:1.05rem;line-height:1.7;color:#2c352f;margin-bottom:.5rem}
.prose a{color:var(--accent);text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--gold2)}
.prose a:hover{color:var(--accent2)}
.prose strong{font-weight:600}
.prose .callout{border-left:3px solid var(--gold);background:var(--sheet);padding:1rem 1.35rem;margin:1.7rem 0;border-radius:0 10px 10px 0}
.prose .callout p{margin:0;font-size:1.03rem;color:var(--mute);font-style:italic;line-height:1.65}
.tool-inline{position:relative;display:block;border:1px solid var(--line);border-radius:12px;background:var(--sheet);padding:1.1rem 2.8rem 1.1rem 1.35rem;margin:1.5rem 0;text-decoration:none;color:var(--ink);transition:border-color .15s,background .15s}
.tool-inline::after{content:"→";position:absolute;right:1.3rem;top:1.15rem;color:var(--gold);font-family:'IBM Plex Mono',monospace;transition:transform .15s}
.tool-inline:hover{border-color:var(--gold2);background:var(--sheet2)}
.tool-inline:hover::after{transform:translateX(3px)}
.tool-inline .k{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);display:block}
.tool-inline .t{font-family:Newsreader,Georgia,serif;font-size:1.32rem;font-weight:500;letter-spacing:-.01em;display:block;margin-top:.25rem}
.tool-inline .d{font-size:.92rem;color:var(--mute);display:block;margin-top:.4rem;line-height:1.5}
.meta-row{display:flex;flex-wrap:wrap;gap:.5rem 1.5rem;margin-top:1.5rem;font-family:'IBM Plex Mono',monospace;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--sage2)}
.meta-row a{color:var(--gold3);text-decoration:none;border-bottom:1px solid #d9c89755}
.meta-row a:hover{border-color:var(--gold)}
.related{margin-top:3.5rem;padding-top:2rem;border-top:1px solid var(--line)}
.related h2{font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-bottom:1.2rem}
.rel-grid{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.rel-grid a{position:relative;display:flex;flex-direction:column;min-height:7.5rem;background:var(--sheet);padding:1.15rem 2.5rem 1.15rem 1.3rem;text-decoration:none;color:var(--ink);transition:background .15s}
.rel-grid a::after{content:"→";position:absolute;right:1rem;top:1.05rem;color:var(--gold);font-family:'IBM Plex Mono',monospace;opacity:0;transform:translateX(-4px);transition:opacity .15s,transform .15s}
.rel-grid a:hover{background:var(--sheet2)}
.rel-grid a:hover::after{opacity:1;transform:none}
.rel-grid .k{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);display:block}
.rel-grid .t{font-family:Newsreader,Georgia,serif;font-size:1.25rem;font-weight:500;letter-spacing:-.01em;display:block;margin-top:.35rem;line-height:1.3;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.guide-index-hero .lede{max-width:56ch}

/* ── conversion & reading aids ────────────────────────── */
.fact-strip{display:flex;flex-wrap:wrap;gap:.55rem;margin-top:1.6rem}
.fact{display:inline-flex;align-items:center;gap:.45rem;padding:.48rem .8rem;border:1px solid #d9c89766;border-radius:999px;background:#183e2c14;color:var(--cream);font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.fact::before{content:"";width:.42rem;height:.42rem;border-radius:50%;background:var(--sage);box-shadow:0 0 0 3px #c8e8a522}
.takeaways{border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:12px;background:var(--sheet);padding:1.1rem 1.3rem;margin:1.8rem 0 0}
.takeaways .tk{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);display:block;margin-bottom:.7rem}
.takeaways ul{list-style:none;padding:0;display:grid;gap:.5rem}
.takeaways li{position:relative;padding-left:1.15rem;font-size:.98rem;line-height:1.55;color:var(--mute)}
.takeaways li::before{content:"";position:absolute;left:0;top:.62em;width:.42rem;height:.42rem;border-radius:50%;background:var(--gold)}
.article-cover{margin-top:clamp(-72px,-5vw,-44px);max-width:64rem;margin-left:auto;margin-right:auto}
.sec-index{display:inline-block;min-width:2.1rem;margin-right:.55rem;color:var(--gold);font-family:'IBM Plex Mono',monospace;font-size:.78em;font-weight:500;letter-spacing:.08em;vertical-align:.12em}
.rail-meter{display:flex;align-items:center;gap:.7rem;margin-bottom:1rem}
.rail-meter .pct{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;color:var(--faint);min-width:3.2rem}
.rail-meter i{display:block;flex:1;height:4px;border-radius:999px;background:var(--sheet2);overflow:hidden;position:relative}
.rail-meter i::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,var(--gold),var(--sage));transform:scaleX(0);transform-origin:left}
.rail-meter i.on::after{transform:scaleX(var(--p,0))}
.article-end{margin-top:3rem;padding:1.4rem 1.5rem;border:1px solid var(--line);border-radius:14px;background:linear-gradient(135deg,var(--sheet),var(--sheet2));display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem}
.article-end p{font-family:Newsreader,Georgia,serif;font-size:1.25rem;letter-spacing:-.02em;color:var(--ink);max-width:34ch;line-height:1.3}
.article-end .mono{display:block;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-bottom:.35rem}
.workflow{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-top:1.4rem}
.workflow .step{display:grid;grid-template-columns:auto 1fr;gap:1rem;background:var(--sheet);padding:1rem 1.2rem}
.workflow .n{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--gold);padding-top:.15rem}
.workflow .t{font-family:Newsreader,Georgia,serif;font-size:1.12rem;font-weight:500;line-height:1.35}
.workflow .d{grid-column:2;color:var(--mute);font-size:.92rem;line-height:1.55}

/* ── article chrome: progress bar, TOC rail, ad slots ──── */
.read-progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:60;pointer-events:none;background:#d9c89733}
.read-progress i{display:block;height:100%;background:linear-gradient(90deg,var(--gold),var(--sage));transform:scaleX(0);transform-origin:left}
.guide-layout{display:block}
@media(min-width:1200px){
  .guide-layout{display:grid;grid-template-columns:minmax(0,44rem) minmax(14rem,17rem);gap:3.5rem;justify-content:center;max-width:64rem;margin:0 auto}
  .guide-article{max-width:none}
  .toc{display:none}
}
.toc-rail{display:none}
@media(min-width:1200px){
  .toc-rail{display:block;position:sticky;top:88px;align-self:start;height:fit-content;max-height:calc(100vh - 110px);overflow-y:auto;scrollbar-width:thin}
}
.toc-rail .tk{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);display:block;margin-bottom:.8rem}
.toc-rail ol{list-style:none;padding:0;margin:0;display:grid;gap:.15rem;border-left:1px solid var(--line)}
.toc-rail li a{display:block;padding:.42rem 0 .42rem .9rem;margin-left:-1px;border-left:2px solid transparent;color:var(--mute);text-decoration:none;font-size:.92rem;line-height:1.4;transition:color .15s,border-color .15s}
.toc-rail li a:hover{color:var(--ink)}
.toc-rail li a.on{color:var(--accent);border-left-color:var(--gold);font-weight:600}
.ad-slot{margin:2.8rem 0;border:1.5px dashed #c9b98f;border-radius:12px;background:repeating-linear-gradient(45deg,#f8f3e5,#f8f3e5 14px,#f2ebd8 14px,#f2ebd8 28px);padding:1.3rem 1.5rem;position:relative}
.ad-slot .ad-tag{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);display:block;margin-bottom:.45rem}
.ad-slot .ad-msg{font-size:.95rem;color:var(--mute);font-style:italic;line-height:1.55}
.ad-slot .ad-msg a{color:var(--accent)}

a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:4px}
@media(max-width:720px){
  nav.tools a{font-size:11px;padding:0 9px;min-height:32px}
  .feats .t{font-size:1.02rem}
  .plate{margin-top:-40px}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.cta a,.frame img,.index-grid a::after,.rel-grid a::after,.tool-inline::after{transition:none}}
`;

export const SKINS = [
  {
    id: 'atlas',
    name: 'Atlas Editorial',
    tagline: 'The canonical marketing look — deep-green sky, paper body, gold hairlines.',
    use: 'Production default',
    swatches: ['#102f24', '#f4f1e8', '#2b5440', '#e2b86e'],
  },
  {
    id: 'graphite',
    name: 'Graphite Instruments',
    tagline: 'The app’s dark workstation mode translated into marketing chrome.',
    use: 'Dark-mode product tour',
    swatches: ['#0f1318', '#6fbf9f', '#e2b86e', '#e8edf3'],
  },
  {
    id: 'folio',
    name: 'Specimen Folio',
    tagline: 'A warmer archive-book treatment with specimen labels and index cards.',
    use: 'Guides and editorial essays',
    swatches: ['#f6efdf', '#315f47', '#b98436', '#232b24'],
  },
  {
    id: 'survey',
    name: 'Survey Map',
    tagline: 'Cartographic contours, dashed routes, and legend-style navigation.',
    use: 'Comparison and alternatives pages',
    swatches: ['#edf0e2', '#2f5d45', '#c69a4b', '#203026'],
  },
  {
    id: 'nightdesk',
    name: 'Night Desk',
    tagline: 'A lamplight manuscript palette for late-study reading.',
    use: 'Long-form guides',
    swatches: ['#171310', '#d9a75f', '#f1e7d4', '#9bc7a4'],
  },
  {
    id: 'studio',
    name: 'Studio Grid',
    tagline: 'A quieter Swiss-grid interpretation with sharper rules and less ornament.',
    use: 'Tools index and product pages',
    swatches: ['#fbfbf8', '#101512', '#23553e', '#b98936'],
  },
];

const SKIN_CSS = {
  atlas: `/* Atlas Editorial — canonical tokens live in the base stylesheet. */`,

  graphite: `
html[data-skin="graphite"]{
  --paper:#0f1318;--sheet:#151a21;--sheet2:#1b222b;--line:#2b3440;--line2:#3d4857;
  --ink:#e8edf3;--mute:#aeb8c5;--faint:#8794a4;--accent:#6fbf9f;--accent2:#8fd3b4;
  --night:#0a0e12;--night2:#0d1218;--night3:#121923;--cream:#eef3ea;--parch:#e8e2d2;
  --gold:#e2b86e;--gold2:#cbb27a;--gold3:#f4d896;--sage:#a9d8b7;--sage2:#c2cfc4;
}
html[data-skin="graphite"] body{background-image:linear-gradient(#ffffff07 1px,transparent 1px),linear-gradient(90deg,#ffffff07 1px,transparent 1px);background-size:56px 56px}
html[data-skin="graphite"] .hero{background:radial-gradient(ellipse at 72% 24%,#1b2b33 0%,#101923 36%,#0b1016 66%,#080b0f 100%)}
html[data-skin="graphite"] header.site{background:#080b0f}
html[data-skin="graphite"] nav.tools{background:#151a21}
html[data-skin="graphite"] .frame{background:#0d1218;box-shadow:0 1px 0 #ffffff12 inset,0 30px 60px -34px #000}
html[data-skin="graphite"] .frame figcaption{background:#121821;color:#aeb8c5}
html[data-skin="graphite"] section.block{border-bottom-color:#242d38}
html[data-skin="graphite"] .prose p,html[data-skin="graphite"] .prose li{color:#c9d2dc}
html[data-skin="graphite"] .prose a{color:#9bd3b8}
html[data-skin="graphite"] .callout{background:#121821;border-left-color:var(--gold)}
html[data-skin="graphite"] .takeaways{background:#121821;border-color:#2b3440}
html[data-skin="graphite"] .takeaways li{color:#aeb8c5}
html[data-skin="graphite"] .ad-slot{border-color:#46536a;background:repeating-linear-gradient(45deg,#141a22,#141a22 14px,#10151c 14px,#10151c 28px)}
html[data-skin="graphite"] .index-grid,html[data-skin="graphite"] .rel-grid{background:#242d38}
html[data-skin="graphite"] .index-grid a,html[data-skin="graphite"] .rel-grid a{background:#121821}
html[data-skin="graphite"] .index-grid a:hover,html[data-skin="graphite"] .rel-grid a:hover{background:#18212b}
html[data-skin="graphite"] .compare-table th,html[data-skin="graphite"] .compare-table td{border-bottom-color:#242d38}
html[data-skin="graphite"] .compare-table thead th{color:#8794a4}
html[data-skin="graphite"] .compare-table tbody th{background:#121821;box-shadow:1px 0 0 #242d38}
html[data-skin="graphite"] .compare-table .us,html[data-skin="graphite"] .compare-table tbody tr.us td{background:#15231e}
html[data-skin="graphite"] .compare-table tbody tr.us td.us{background:#1b342a}
html[data-skin="graphite"] .win-card,html[data-skin="graphite"] details.faq{background:#121821;border-color:#2b3440}
html[data-skin="graphite"] .win-card.us{background:linear-gradient(180deg,#15231e,#121821);border-color:#476b58}
html[data-skin="graphite"] .verdict{background:#0d1218}
html[data-skin="graphite"] .cta .primary{background:#d8f0df;color:#0b1512}
html[data-skin="graphite"] .toc-rail ol{border-left-color:#2b3440}
html[data-skin="graphite"] .toc-rail li a.on{color:#9bd3b8}
html[data-skin="graphite"] .rail-meter i{background:#1b222b}
html[data-skin="graphite"] .fact{border-color:#46536a;background:#15231e55}
`,

  folio: `
html[data-skin="folio"]{
  --paper:#f6efdf;--sheet:#fbf7ec;--sheet2:#eee4cf;--line:#d8c9a8;--line2:#bfae85;
  --ink:#232b24;--mute:#5c665a;--faint:#7b715c;--accent:#315f47;--accent2:#264b38;
  --night:#20392d;--night2:#1c3328;--night3:#284636;--cream:#f7efdc;--parch:#f2e7cf;
  --gold:#b98436;--gold2:#c9a86a;--gold3:#f0d49a;--sage:#a9c98e;--sage2:#d7dcc8;
}
html[data-skin="folio"] body{background-image:radial-gradient(#b8a77c14 1px,transparent 1px);background-size:22px 22px}
html[data-skin="folio"] .hero{background:radial-gradient(ellipse at 70% 28%,#356049 0%,#244434 36%,#1b3328 66%,#14271e 100%)}
html[data-skin="folio"] .kicker{color:var(--gold3)}
html[data-skin="folio"] .prose h2{padding-bottom:.45rem;border-bottom:1px solid var(--line)}
html[data-skin="folio"] .takeaways{border:1px solid #c9b78f;border-left:4px double var(--gold);background:#fffaf0;box-shadow:3px 4px 0 #d8c9a833}
html[data-skin="folio"] .takeaways li{color:#4f5a50}
html[data-skin="folio"] .index-grid a,html[data-skin="folio"] .rel-grid a{box-shadow:inset 0 0 0 1px #fff8}
html[data-skin="folio"] .index-grid a:hover,html[data-skin="folio"] .rel-grid a:hover{background:#f3ead2}
html[data-skin="folio"] .ad-slot{border-color:#b99b5f;background:repeating-linear-gradient(45deg,#fff8e8,#fff8e8 14px,#f5ecd4 14px,#f5ecd4 28px)}
html[data-skin="folio"] .ad-slot .ad-msg{color:#6f6248}
html[data-skin="folio"] .compare-table tbody tr.us td{background:#eef4e8}
html[data-skin="folio"] .win-card.us{background:linear-gradient(180deg,#eef4e8,var(--sheet));border-color:#9db8a4}
html[data-skin="folio"] .verdict{background:#1c3328}
html[data-skin="folio"] .cta .primary{background:#e7d39a;color:#20392d}
html[data-skin="folio"] .toc-rail li a.on{color:var(--accent)}
html[data-skin="folio"] .sec-index{color:var(--accent)}
`,

  survey: `
html[data-skin="survey"]{
  --paper:#edf0e2;--sheet:#f8faf0;--sheet2:#e2e8d4;--line:#c4d0b4;--line2:#9fb38b;
  --ink:#203026;--mute:#55685a;--faint:#6f7f68;--accent:#2f5d45;--accent2:#264b38;
  --night:#183326;--night2:#143022;--night3:#1b4634;--cream:#f4f2df;--parch:#eef0da;
  --gold:#c69a4b;--gold2:#b7a06b;--gold3:#f2d795;--sage:#b7d39a;--sage2:#d9dfc8;
}
html[data-skin="survey"] body{background-image:linear-gradient(#9fb38b12 1px,transparent 1px),linear-gradient(90deg,#9fb38b12 1px,transparent 1px);background-size:48px 48px}
html[data-skin="survey"] .hero{background:radial-gradient(ellipse at 72% 28%,#315f49 0%,#234534 36%,#183326 66%,#10241b 100%)}
html[data-skin="survey"] .hero::before{background-image:url('/atlas/contours.webp');background-size:cover;opacity:.16;mask-image:linear-gradient(120deg,transparent,#000 70%)}
html[data-skin="survey"] .hero::after{border-style:dashed}
html[data-skin="survey"] .kicker::before{content:"";display:inline-block;width:.55rem;height:.55rem;margin-right:.55rem;border:1px solid currentColor;transform:rotate(45deg) translateY(-1px)}
html[data-skin="survey"] .index-grid,html[data-skin="survey"] .rel-grid{border-style:dashed}
html[data-skin="survey"] .index-grid a,html[data-skin="survey"] .rel-grid a{background-image:linear-gradient(#2f5d4508 1px,transparent 1px);background-size:100% 28px}
html[data-skin="survey"] .prose h2{letter-spacing:-.01em}
html[data-skin="survey"] .sec-index{color:var(--accent)}
html[data-skin="survey"] .takeaways{border-style:dashed;border-color:#9fb38b;background:#fbfdf4}
html[data-skin="survey"] .ad-slot{border-style:dashed;border-color:#9fb38b;background-color:#f4f7e8;background-image:radial-gradient(#9fb38b66 1px,transparent 1.5px);background-size:18px 18px}
html[data-skin="survey"] .toc-rail ol{border-left-style:dashed}
html[data-skin="survey"] .toc-rail li a.on{border-left-style:solid}
html[data-skin="survey"] .compare-table{border:1px solid var(--line)}
html[data-skin="survey"] .compare-table th,html[data-skin="survey"] .compare-table td{border-bottom:1px dashed var(--line)}
html[data-skin="survey"] .win-card{border-style:dashed}
html[data-skin="survey"] .cta .primary{background:#d7e4b8;color:#183326}
`,

  nightdesk: `
html[data-skin="nightdesk"]{
  --paper:#171310;--sheet:#211a15;--sheet2:#2a2119;--line:#4a3c2d;--line2:#66513b;
  --ink:#f1e7d4;--mute:#cbb99f;--faint:#a8977b;--accent:#9bc7a4;--accent2:#b7d8bd;
  --night:#120e0b;--night2:#17120e;--night3:#1f1812;--cream:#f5ecd9;--parch:#ecdcc0;
  --gold:#d9a75f;--gold2:#b98d4f;--gold3:#f0c987;--sage:#a9d0b4;--sage2:#d8c7ab;
}
html[data-skin="nightdesk"] body{background-image:radial-gradient(#d9a75f10 1px,transparent 1px);background-size:26px 26px}
html[data-skin="nightdesk"] .hero{background:radial-gradient(ellipse at 70% 18%,#4a3520 0%,#2a1d14 38%,#171310 72%,#100c09 100%)}
html[data-skin="nightdesk"] .hero::after{border-color:#d9a75f55}
html[data-skin="nightdesk"] header.site{background:#120e0b}
html[data-skin="nightdesk"] nav.tools{background:#241c15}
html[data-skin="nightdesk"] .prose,html[data-skin="nightdesk"] .prose p,html[data-skin="nightdesk"] .prose li{font-family:Newsreader,Georgia,serif}
html[data-skin="nightdesk"] .prose p,html[data-skin="nightdesk"] .prose li{color:#d8c9b2}
html[data-skin="nightdesk"] .takeaways{background:#efe3c8;border-color:#66513b;box-shadow:0 18px 40px -30px #000}
html[data-skin="nightdesk"] .takeaways .tk,html[data-skin="nightdesk"] .takeaways li{color:#4c4132}
html[data-skin="nightdesk"] .index-grid a,html[data-skin="nightdesk"] .rel-grid a{background:#1e1712}
html[data-skin="nightdesk"] .index-grid a:hover,html[data-skin="nightdesk"] .rel-grid a:hover{background:#282017}
html[data-skin="nightdesk"] .ad-slot{border-color:#66513b;background:repeating-linear-gradient(45deg,#241c15,#241c15 14px,#1e1712 14px,#1e1712 28px)}
html[data-skin="nightdesk"] .compare-table tbody th{background:#1e1712;box-shadow:1px 0 0 #4a3c2d}
html[data-skin="nightdesk"] .compare-table .us,html[data-skin="nightdesk"] .compare-table tbody tr.us td{background:#2a2119}
html[data-skin="nightdesk"] .win-card,html[data-skin="nightdesk"] details.faq{background:#1e1712;border-color:#4a3c2d}
html[data-skin="nightdesk"] .cta .primary{background:#f0c987;color:#2a1d14}
html[data-skin="nightdesk"] .verdict{background:#120e0b}
html[data-skin="nightdesk"] .toc-rail li a.on{color:#f0c987}
html[data-skin="nightdesk"] .rail-meter i{background:#2a2119}
html[data-skin="nightdesk"] .fact{border-color:#66513b;background:#d9a75f14}
`,

  studio: `
html[data-skin="studio"]{
  --paper:#fbfbf8;--sheet:#ffffff;--sheet2:#f0f2ee;--line:#d8ddd6;--line2:#aeb8ae;
  --ink:#101512;--mute:#4c5a52;--faint:#65736a;--accent:#23553e;--accent2:#1b4534;
  --night:#101512;--night2:#151b17;--night3:#1d2922;--cream:#f5f7f2;--parch:#eef2ea;
  --gold:#b98936;--gold2:#cbb27a;--gold3:#f2d795;--sage:#9ec2ae;--sage2:#d8e2d6;
}
html[data-skin="studio"] .hero{background:#101512}
html[data-skin="studio"] .hero::before{opacity:.18;background-size:72px 72px}
html[data-skin="studio"] .hero::after{inset:18px}
html[data-skin="studio"] h1{letter-spacing:-.06em}
html[data-skin="studio"] .index-grid,html[data-skin="studio"] .rel-grid{border-radius:6px}
html[data-skin="studio"] .index-grid a,html[data-skin="studio"] .rel-grid a{border-radius:0;min-height:9rem}
html[data-skin="studio"] .prose h2{border-top:2px solid var(--ink);padding-top:1rem}
html[data-skin="studio"] .takeaways{border-left:4px solid var(--accent);border-radius:6px;background:#f4f7f2}
html[data-skin="studio"] .sec-index{color:var(--accent)}
html[data-skin="studio"] .ad-slot{border-radius:6px;border-color:#aeb8ae;background:repeating-linear-gradient(45deg,#f7f9f5,#f7f9f5 14px,#eef2ec 14px,#eef2ec 28px)}
html[data-skin="studio"] .cta .primary{background:var(--accent);color:var(--cream)}
html[data-skin="studio"] .cta .primary:hover{background:var(--accent2);transform:none}
html[data-skin="studio"] .win-card.us{background:#eef5ef;border-color:#8eaa9b}
html[data-skin="studio"] .verdict{background:#151b17}
html[data-skin="studio"] .toc-rail li a.on{border-left-color:var(--accent);color:var(--accent)}
html[data-skin="studio"] .toc-rail li a.on{font-weight:600}
html[data-skin="studio"] .rail-meter i::after{background:linear-gradient(90deg,var(--accent),var(--sage))}
html[data-skin="studio"] .fact{border-color:#aeb8ae;background:#23553e12}
`,
};

function cssForSkin(skinId = 'atlas') {
  return `${CSS}\n${SKIN_CSS[skinId] || SKIN_CSS.atlas}`;
}

/* Reading-progress bar + scrollspy — vanilla JS, no dependencies. The bar
   tracks the article container (not the page) so it reads honestly. */
function readProgressScript(targetSel, spySel) {
  return `<div class="read-progress" aria-hidden="true"><i></i></div>
<script>
(function(){
  var bar=document.querySelector('.read-progress i'),art=document.querySelector('${targetSel}');
  if(bar&&art){
    var tick=function(){var r=art.getBoundingClientRect(),total=r.height-window.innerHeight,p=total>0?Math.min(1,Math.max(0,-r.top/total)):0;bar.style.transform='scaleX('+p+')';var meter=document.querySelector('.rail-meter i'),label=document.querySelector('[data-read-label]');if(meter){meter.style.setProperty('--p',p);meter.classList.toggle('on',p>0&&p<1);}if(label)label.textContent=Math.round(p*100)+'% read';};
    addEventListener('scroll',tick,{passive:true});tick();
  }
  ${spySel ? `var links=[].slice.call(document.querySelectorAll('${spySel} a')),heads=[].slice.call(document.querySelectorAll('.prose h2[id]'));
  if(links.length&&heads.length&&'IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){links.forEach(function(a){a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id);});}});},{rootMargin:'-15% 0px -75% 0px'});
    heads.forEach(function(h){io.observe(h);});
  }` : ''}
})();
</script>`;
}

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />`;

/* Optional marketing skins are applied client-side via ?skin=<id>. The
   canonical pages stay Atlas; skins are reviewable on the same URLs without
   creating duplicate indexable content. */
const SKIN_BOOT = `<script>!function(){var m=location.search.match(/[?&]skin=([a-z0-9-]+)/),id=m?m[1]:'atlas';if(!/^[a-z0-9-]+$/.test(id))id='atlas';document.documentElement.dataset.skin=id;if(id!=='atlas'){var l=document.createElement('link');l.rel='stylesheet';l.href='/design-skins/'+id+'.css';document.head.appendChild(l);}}();</script>`;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

/* Minimal inline markup for guide prose: **bold**, *italic*, [text](/path).
   Content is authored in seo-guides-data.mjs — no user input reaches this. */
function inline(s) {
  let out = esc(s);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  return out;
}

function adSlotHtml() {
  return `<aside class="ad-slot" aria-label="Advertisement"><span class="ad-tag">Advertisement</span><p class="ad-msg">Study tools, apps, and resources for students — this space is reserved for partners who help students learn better.</p></aside>`;
}

function renderBlocks(blocks) {
  return blocks
    .map((b) => {
      if (b.k === 'p') return `<p>${inline(b.t)}</p>`;
      if (b.k === 'ul')
        return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
      if (b.k === 'callout') return `<div class="callout"><p>${inline(b.t)}</p></div>`;
      if (b.k === 'tool') {
        const t = TOOLS.find((x) => x.id === b.tool);
        if (!t) return '';
        return `<a class="tool-inline" href="${t.path}"><span class="k mono">${esc(t.kicker)} · the ${esc(t.name)} place</span><span class="t">${esc(t.name)}</span><span class="d">${esc(t.lede.split('.')[0])}.</span></a>`;
      }
      return '';
    })
    .join('\n');
}

const NAV_LINKS = TOOLS.map((t) => `<a href="${t.path}">${esc(t.name)}</a>`).join('\n');

function header(activePath) {
  const section = '/' + String(activePath).split('/')[1];
  const sec = (p) => (p === section ? ' class="on" aria-current="page"' : '');
  const links = TOOLS.map(
    (t) => `<a href="${t.path}"${t.path === activePath ? ' class="on" aria-current="page"' : ''}>${esc(t.name)}</a>`,
  ).join('\n');
  return `<header class="site">
<a class="brand" href="/"><span class="emblem" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Iterra</a>
<nav class="tools" aria-label="Iterra tools">
${links}
<a href="/guides"${sec('/guides')}>Guides</a>
<a href="/compare"${sec('/compare')}>Compare</a>
<a href="/alternatives"${sec('/alternatives')}>Alternatives</a>
<a class="open" href="/#/today">Open workspace →</a>
</nav>
</header>`;
}

function crumbs(items) {
  return `<nav class="crumbs mono" aria-label="Breadcrumb">${items
    .map((c) => (c.href ? `<a href="${c.href}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`))
    .join('<span class="sep">/</span>')}</nav>`;
}

function footer() {
  return `<footer class="site"><div class="wrap">
<div class="foot-sig">Iterra<em>.</em></div>
<div class="foot-links">
<a href="/">Overview</a>
<a href="/tools">All tools</a>
<a href="/guides">Guides</a>
<a href="/compare">Compare</a>
<a href="/alternatives">Alternatives</a>
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
  const facts = tool.facts || ['Free', 'No account', 'Local-first', 'Works offline'];
  const factHtml = `<div class="fact-strip">${facts.map((f) => `<span class="fact">${esc(f)}</span>`).join('')}</div>`;
  const workflowHtml = tool.workflow?.length
    ? `<section class="block">
<h2 class="sec mono">How ${esc(tool.name)} fits a study day</h2>
<div class="workflow">
${tool.workflow
  .map((w, i) => `<div class="step"><span class="n mono">${String(i + 1).padStart(2, '0')}</span><div><div class="t">${esc(w.t)}</div><div class="d">${esc(w.d)}</div></div></div>`)
  .join('\n')}
</div>
</section>`
    : '';
  const neighbors = (TOOL_NEIGHBORS[tool.id] || TOOLS.filter((t) => t.id !== tool.id).slice(0, 3).map((t) => t.id))
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter(Boolean);
  const relatedToolsHtml = neighbors.length
    ? `<section class="block">
<h2 class="sec mono">Keep exploring the terrain</h2>
<ul class="rel-grid">
${neighbors
  .map((t) => `<li><a href="${t.path}"><span class="k mono">${esc(t.kicker)}</span><span class="t">${esc(t.name)}</span></a></li>`)
  .join('\n')}
</ul>
</section>`
    : '';
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
      ...(tool.faqs?.length
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: tool.faqs.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
              })),
            },
          ]
        : []),
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
<meta property="og:image" content="${SITE}/og/tool-${tool.id}.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(tool.title)}" />
<meta name="twitter:description" content="${esc(tool.description)}" />
<meta name="twitter:image" content="${SITE}/og/tool-${tool.id}.png" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
${FONTS}
<style>${cssForSkin()}</style>${SKIN_BOOT}
${jsonLd(ld)}
</head>
<body>
${header(tool.path)}
<section class="hero"><div class="wrap">
${crumbs([{ label: 'Iterra', href: '/' }, { label: 'Tools', href: '/tools' }, { label: tool.name }])}
<div class="kicker mono">${esc(tool.kicker)} · the ${esc(tool.name)} place</div>
<h1>${h1html}</h1>
<p class="lede">${esc(tool.lede)}</p>
${factHtml}
</div></section>
<div class="wrap">
<figure class="plate">
<div class="frame"><img src="/shots/${tool.id}.webp" alt="${esc(tool.name)} inside the Iterra study workspace" width="1440" height="900" loading="lazy" decoding="async" /></div>
<figcaption><span>Iterra · ${esc(tool.name)}</span><span>Local-first study terrain</span></figcaption>
</figure>
<section class="block">
<h2 class="sec mono">What ${esc(tool.name)} does</h2>
<ul class="feats">
${feats}
</ul>
</section>
${workflowHtml}
${tool.faqs?.length ? `<section class="block">
<h2 class="sec mono">Questions students ask</h2>
<div class="faq-list">
${tool.faqs.map((f) => `<details class="faq"><summary>${esc(f.q)}</summary><div class="a">${esc(f.a)}</div></details>`).join('\n')}
</div>
</section>` : ''}
${relatedToolsHtml}
<section class="block">
<div class="connect"><div>
<span class="mono">One workspace, not another tab</span>
<h3>The terrain does the remembering.</h3>
<p>${esc(tool.name)} shares a live picture of your courses with every other tool in Iterra — your planner knows when reviews are due, your notes surface in course dossiers, and everything works offline in your browser. No account required; your data never leaves your machine unless you choose sync.</p>
<div class="cta">
<a class="primary" href="/#/p/${tool.id}">Open ${esc(tool.name)} in Iterra →</a>
<a class="ghost" href="/tools">All ${TOOLS.length} tools</a>
</div>
</div></div>
</section>
</div>
${footer()}
</body>
</html>
`;
}

export function renderGuidePage(guide) {
  const url = `${SITE}/guides/${guide.slug}`;
  const hm = guide.title.match(/^(.*?)<em>(.*?)<\/em>(.*)$/s) || [null, guide.title, '', ''];
  const h1html = `${esc(hm[1])}${hm[2] ? `<em>${esc(hm[2])}</em>` : ''}${esc(hm[3] || '')}`;
  const slugify = (s) =>
    String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  const usedIds = new Set();
  const tocItems = [];
  const sectionHtml = guide.sections.map((s, si) => {
    let h2html = '';
    if (s.h2) {
      let id = slugify(s.h2);
      while (usedIds.has(id)) id += '-x';
      usedIds.add(id);
      tocItems.push({ id, label: s.h2 });
      h2html = `<h2 id="${id}"><span class="sec-index" aria-hidden="true">${String(si + 1).padStart(2, '0')}</span>${inline(s.h2)}<a class="h-anchor" href="#${id}" aria-label="Link to this section">#</a></h2>`;
    }
    return `<section class="gsec">
<div class="prose">${h2html}${renderBlocks(s.blocks)}</div>
</section>`;
  });
  /* mid-article ad slots — dashed placeholders, easy to swap for a real network later */
  const adSlot = adSlotHtml();
  const sections = [];
  const adEvery = tocItems.length >= 5 ? Math.max(3, Math.ceil(sectionHtml.length / 3)) : 0;
  sectionHtml.forEach((html, i) => {
    sections.push(html);
    if (adEvery && (i + 1) % adEvery === 0 && i + 1 < sectionHtml.length) sections.push(adSlot);
  });
  const sectionsHtml = sections.join('\n');
  const tocHtml =
    tocItems.length >= 3
      ? `<nav class="toc" aria-label="In this guide"><span class="tk">In this guide</span><ol>${tocItems
          .map((t) => `<li><a href="#${t.id}">${inline(t.label)}</a></li>`)
          .join('')}</ol></nav>`
      : '';
  const tocRail =
    tocItems.length >= 3
      ? `<aside class="toc-rail"><div class="rail-meter" aria-hidden="true"><span class="pct" data-read-label>0% read</span><i></i></div><nav aria-label="On this page"><span class="tk">On this page</span><ol>${tocItems
          .map((t) => `<li><a href="#${t.id}">${esc(String(t.label).replace(/[*_\[\]]/g, ''))}</a></li>`)
          .join('')}</ol></nav></aside>`
      : '';
  const related = (guide.related || [])
    .map((slug) => GUIDE_BY_SLUG[slug])
    .filter(Boolean);
  const relatedHtml = related.length
    ? `<section class="related"><h2 class="mono">Keep reading</h2>
<ul class="rel-grid">
${related
  .map(
    (r) => `<li><a href="/guides/${r.slug}"><span class="k mono">${esc(r.kicker)}</span><span class="t">${esc(r.title.replace(/<\/?em>/g, ''))}</span></a></li>`,
  )
  .join('\n')}
</ul></section>`
    : '';
  const toolsUsed = (guide.tools || [])
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter(Boolean);
  const coverTool = toolsUsed[0] || TOOLS[0];
  const takeawaysHtml = guide.takeaways?.length
    ? `<aside class="takeaways"><span class="tk mono">Key takeaways</span><ul>${guide.takeaways
        .map((t) => `<li>${inline(t)}</li>`)
        .join('')}</ul></aside>`
    : '';
  const articleEndHtml = `<div class="article-end"><div><span class="mono">Put it to work</span><p>The method only matters if it survives the week — Iterra keeps the plan, review, notes, and timer in one place.</p></div><div class="cta"><a class="primary" href="/#/today">Open the workspace →</a><a class="ghost" href="/tools">Browse the tools</a></div></div>`;
  const toolsHtml = toolsUsed.length
    ? `<section class="block">
<div class="connect"><div>
<span class="mono">Put it to work</span>
<h3>The terrain does the remembering.</h3>
<p>Every guide above ends in practice. These tools are where the method lives — local-first, course-aware, no account required.</p>
<div class="cta">
${toolsUsed.map((t) => `<a class="ghost" href="${t.path}">${esc(t.name)} →</a>`).join('\n')}
<a class="ghost" href="/#/today">Open workspace</a>
</div>
</div></div>
</section>`
    : '';
  const faqHtml = guide.faq?.length
    ? `<section class="gsec"><div class="prose">
<h2>Questions students ask</h2>
<div class="faq-list">
${guide.faq
  .map(
    (f) => `<details class="faq"><summary>${esc(f.q)}</summary><div class="a">${inline(f.a)}</div></details>`,
  )
  .join('\n')}
</div>
</div></section>`
    : '';
  const dateFmt = (d) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: guide.title.replace(/<\/?em>/g, ''),
        description: guide.description,
        url,
        image: `${SITE}/og/guide-${guide.slug}.png`,
        datePublished: guide.datePublished,
        dateModified: guide.dateModified || guide.datePublished,
        author: { '@type': 'Organization', name: 'Iterra', url: `${SITE}/` },
        publisher: {
          '@type': 'Organization',
          name: 'Iterra',
          logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png` },
        },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        isPartOf: { '@type': 'WebSite', name: 'Iterra', url: `${SITE}/` },
      },
      ...(guide.faq?.length
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: guide.faq.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/\*\*|\*/g, '') },
              })),
            },
          ]
        : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Iterra', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/guides` },
          { '@type': 'ListItem', position: 3, name: guide.title.replace(/<\/?em>/g, ''), item: url },
        ],
      },
    ],
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(guide.seoTitle)}</title>
<meta name="description" content="${esc(guide.description)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Iterra" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(guide.seoTitle)}" />
<meta property="og:description" content="${esc(guide.description)}" />
<meta property="og:image" content="${SITE}/og/guide-${guide.slug}.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="article:published_time" content="${guide.datePublished}" />
<meta property="article:modified_time" content="${guide.dateModified || guide.datePublished}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(guide.seoTitle)}" />
<meta name="twitter:description" content="${esc(guide.description)}" />
<meta name="twitter:image" content="${SITE}/og/guide-${guide.slug}.png" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
${FONTS}
<style>${cssForSkin()}</style>${SKIN_BOOT}
${jsonLd(ld)}
</head>
<body>
${header('/guides')}
<section class="hero"><div class="wrap">
${crumbs([{ label: 'Iterra', href: '/' }, { label: 'Guides', href: '/guides' }, { label: guide.title.replace(/<\/?em>/g, '') }])}
<div class="kicker mono">Iterra Guides · ${esc(guide.kicker)}</div>
<h1>${h1html}</h1>
<p class="lede">${inline(guide.lede)}</p>
<div class="meta-row"><span>${dateFmt(guide.datePublished)}</span><span>${guide.readMinutes} min read</span><span>By the Iterra terrain team</span><span><a href="/guides">All guides</a></span></div>
</div></section>
<div class="wrap">
<figure class="plate article-cover">
<div class="frame"><img src="/shots/${coverTool.id}.webp" alt="${esc(coverTool.name)} inside the Iterra study workspace" width="1440" height="900" loading="lazy" decoding="async" /></div>
<figcaption><span>Iterra · ${esc(coverTool.name)}</span><span>Local-first study terrain</span></figcaption>
</figure>
<div class="guide-layout">
<article class="guide-article">
${tocHtml}
${takeawaysHtml}
${sectionsHtml}
${faqHtml}
${articleEndHtml}
</article>
${tocRail}
</div>
${toolsHtml}
${relatedHtml}
</div>
${readProgressScript('.guide-article', '.toc-rail')}
${footer()}
</body>
</html>
`;
}

export function renderGuidesIndex() {
  const url = `${SITE}/guides`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Iterra study guides',
        description: 'Practical, research-backed guides to studying better — planning, memory, focus, and the tools that make it stick.',
        url,
      },
      {
        '@type': 'ItemList',
        itemListElement: GUIDES.map((g, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: g.title.replace(/<\/?em>/g, ''),
          url: `${SITE}/guides/${g.slug}`,
        })),
      },
    ],
  };
  const cards = GUIDES.map(
    (g) => `<li><a href="/guides/${g.slug}"><span class="k mono">${esc(g.kicker)} · ${g.readMinutes} min</span><span class="t">${esc(g.title.replace(/<\/?em>/g, ''))}</span><span class="d">${esc(g.description.split('.')[0])}.</span></a></li>`,
  ).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Study Guides — How to Learn Better | Iterra</title>
<meta name="description" content="Practical, research-backed guides to studying better: semester planning, spaced repetition, active recall, pomodoro, time blocking, finals week, and more — plus the free tools that make it stick." />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Iterra" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="Iterra Study Guides — How to Learn Better" />
<meta property="og:description" content="Research-backed guides to studying better, from semester planning to spaced repetition." />
<meta property="og:image" content="${SITE}/og/guides.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Iterra Study Guides — How to Learn Better" />
<meta name="twitter:description" content="Research-backed guides to studying better." />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
${FONTS}
<style>${cssForSkin()}</style>${SKIN_BOOT}
${jsonLd(ld)}
</head>
<body>
${header('/guides')}
<section class="hero"><div class="wrap">
${crumbs([{ label: 'Iterra', href: '/' }, { label: 'Guides' }])}
<div class="kicker mono">Iterra Guides</div>
<h1>Study better, <em>with evidence</em></h1>
<p class="lede">Practical guides to the methods that actually work — planning, memory, focus, and the tools that make them stick. No productivity fluff; just what the research supports and what students actually need.</p>
</div></section>
<div class="wrap">
<section class="block" style="border-bottom:none">
<h2 class="sec mono">Browse the guides</h2>
<ul class="index-grid">
${cards}
</ul>
<div class="cta" style="margin-top:2.5rem">
<a class="primary" href="/#/today">Open the workspace →</a>
<a class="ghost" href="/tools">All tools</a>
</div>
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
        description: `The ${TOOLS.length} tools of the Iterra study workspace.`,
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
<meta name="description" content="Nine study tools in one local-first workspace: time-blocking planner, spaced-repetition flashcards, linked notes, pomodoro timer, math workbench, attendance, grading, and study materials." />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Iterra" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="Iterra Study Tools — Planner, Flashcards, Notes, Timer & More" />
<meta property="og:description" content="Nine study tools in one local-first workspace for students." />
<meta property="og:image" content="${SITE}/og/tools.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
${FONTS}
<style>${cssForSkin()}</style>${SKIN_BOOT}
${jsonLd(ld)}
</head>
<body>
${header('/tools')}
<section class="hero"><div class="wrap">
${crumbs([{ label: 'Iterra', href: '/' }, { label: 'Tools' }])}
<div class="kicker mono">The terrain</div>
<h1>Nine tools. <em>One study workspace.</em></h1>
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

/* ── Chunk A: comparison & alternatives pages ─────────── */

const COMPARE_SHOT = '/shots/today.webp';

function compareHead({ title, description, url, image }) {
  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Iterra" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${image || `${SITE}/og/compare.png`}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${image || `${SITE}/og/compare.png`}" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
${FONTS}
<style>${cssForSkin()}</style>${SKIN_BOOT}`;
}

function emH1(h1) {
  const hm = String(h1).match(/^(.*?)<em>(.*?)<\/em>(.*)$/s) || [null, h1, '', ''];
  return `${esc(hm[1])}${hm[2] ? `<em>${esc(hm[2])}</em>` : ''}${esc(hm[3] || '')}`;
}

function compareLd(page, url, extra = []) {
  const graph = [
    {
      '@type': 'WebPage',
      name: page.title,
      description: page.description,
      url,
      isPartOf: { '@type': 'WebSite', name: 'Iterra', url: `${SITE}/` },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Iterra', url: `${SITE}/` },
          {
            '@type': 'ListItem',
            position: 2,
            name: page.section === 'compare' ? 'Compare' : 'Alternatives',
            url: `${SITE}/${page.section}`,
          },
          { '@type': 'ListItem', position: 3, name: page.rival === 'roundup' ? 'Best study apps' : page.title, url },
        ],
      },
    },
    ...extra,
  ];
  return { '@context': 'https://schema.org', '@graph': graph };
}

function faqLd(faqs) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function renderComparePage(page) {
  const base = page.section === 'compare' ? 'compare' : 'alternatives';
  const slug = page.slug;
  const url = `${SITE}/${base}/${slug}`;
  const rivalLabel = page.rival === 'roundup' ? 'the field' : page.rival === 'generic planners' ? 'typical free planners' : page.rival;

  const isVs = page.kind === 'vs';
  const tableRows = page.table.rows
    .map((r) => {
      const usRow = !isVs && r[0] === 'Iterra';
      const cells = r
        .slice(1)
        .map((c, i) => `<td${isVs && i === 0 ? ' class="us"' : ''}>${esc(c)}</td>`)
        .join('');
      return `<tr${usRow ? ' class="us"' : ''}><th scope="row">${esc(r[0])}</th>${cells}</tr>`;
    })
    .join('\n');
  const thead = `<thead><tr><th scope="col"></th>${page.table.headers
    .slice(1)
    .map((h, i) => `<th scope="col"${isVs && i === 0 ? ' class="us"' : ''}>${esc(h)}</th>`)
    .join('')}</tr></thead>`;

  const factHtml = `<div class="fact-strip"><span class="fact">Free</span><span class="fact">No account</span><span class="fact">Local-first</span><span class="fact">Honest trade-offs</span></div>`;
  const winsHtml = `
<div class="wins-grid">
<div class="win-card us"><h3>Where Iterra wins</h3><ul>
${page.iterraWins.map((w) => `<li>${esc(w)}</li>`).join('\n')}
</ul></div>
<div class="win-card them"><h3>Where ${esc(rivalLabel)} wins</h3><ul>
${page.rivalWins.map((w) => `<li>${esc(w)}</li>`).join('\n')}
</ul></div>
</div>`;

  const faqHtml = page.faqs?.length
    ? `<section class="block">
<h2 class="sec mono">Questions students ask</h2>
<div class="faq-list">
${page.faqs
  .map(
    (f) => `<details class="faq"><summary>${esc(f.q)}</summary><div class="a">${esc(f.a)}</div></details>`,
  )
  .join('\n')}
</div>
</section>`
    : '';

  const relatedHtml = page.related?.length
    ? `<div class="related-row">
${page.related.map((r) => `<a href="${r.href}">${esc(r.label)}</a>`).join('\n')}
</div>`
    : '';

  const ld = compareLd(
    page,
    url,
    page.kind === 'roundup'
      ? [{ '@type': 'ItemList', itemListElement: page.table.rows.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: r[1] })) }]
      : page.faqs?.length
        ? [faqLd(page.faqs)]
        : [],
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${compareHead({ title: page.title, description: page.description, url, image: `${SITE}/og/${page.section}.png` })}
${jsonLd(ld)}
</head>
<body>
${header(`/${base}/${slug}`)}
<section class="hero"><div class="wrap">
${crumbs([{ label: 'Iterra', href: '/' }, { label: base === 'compare' ? 'Compare' : 'Alternatives', href: `/${base}` }, { label: String(page.h1).replace(/<\/?em>/g, '') }])}
<div class="kicker mono">${esc(page.kicker)} · Iterra terrain</div>
<h1>${emH1(page.h1)}</h1>
<p class="lede">${esc(page.lede)}</p>
${factHtml}
</div></section>
<div class="wrap compare-body">
<figure class="plate">
<div class="frame"><img src="${COMPARE_SHOT}" alt="The Iterra study workspace" width="1440" height="900" loading="lazy" decoding="async" /></div>
<figcaption><span>Iterra · the integrated study terrain</span><span>Local-first · free · no account</span></figcaption>
</figure>
<section class="block">
<h2 class="sec mono">At a glance</h2>
<div style="overflow-x:auto">
<table class="compare-table">
${thead}
<tbody>
${tableRows}
</tbody>
</table>
</div>
</section>
<section class="block">
<h2 class="sec mono">The honest split</h2>
${winsHtml}
</section>
<section class="block">
<div class="verdict"><div>
<span class="mono">The verdict</span>
<p>${page.verdict.replace(/<em>/g, '<strong>').replace(/<\/em>/g, '</strong>')}</p>
<div class="cta">
<a class="primary" href="/#/today">Open Iterra — free, no account →</a>
<a class="ghost" href="/${base}">All ${base === 'compare' ? 'comparisons' : 'alternatives'}</a>
</div>
${relatedHtml}
</div></div>
</section>
${faqHtml}
<section class="block" style="border-bottom:none;padding-top:0">
${adSlotHtml()}
</section>
</div>
${readProgressScript('.compare-body')}
${footer()}
</body>
</html>
`;
}

function indexCards(pages, base) {
  return pages
    .map(
      (p) => `<li><a href="/${base}/${p.slug}"><span class="k mono">${esc(p.kicker)}</span><span class="t">${esc(p.h1.replace(/<\/?em>/g, ''))}</span><span class="d">${esc(p.description)}</span></a></li>`,
    )
    .join('\n');
}

export function renderCompareIndex() {
  const url = `${SITE}/compare`;
  const pages = COMPARE_PAGES.filter((p) => p.section === 'compare');
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Iterra comparisons',
        description: 'Honest head-to-head comparisons between Iterra and the study tools students actually use.',
        url,
      },
    ],
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Compare Iterra — Honest Study App Comparisons</title>
<meta name="description" content="Head-to-head comparisons between Iterra and Notion, Quizlet, Anki, StudySmarter and Structured — where each wins, who should pick which." />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Iterra" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="Compare Iterra — Honest Study App Comparisons" />
<meta property="og:description" content="Where Iterra wins, where the competition wins, and who should pick which." />
<meta property="og:image" content="${SITE}/og/compare.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
${FONTS}
<style>${cssForSkin()}</style>${SKIN_BOOT}
${jsonLd(ld)}
</head>
<body>
${header('/compare')}
<section class="hero"><div class="wrap">
${crumbs([{ label: 'Iterra', href: '/' }, { label: 'Compare' }])}
<div class="kicker mono">Head-to-head</div>
<h1>Compare <em>honestly.</em></h1>
<p class="lede">Every comparison below admits where the other tool wins — because a comparison you can’t trust is just an ad. These are written by the people who make Iterra, and they say so.</p>
</div></section>
<div class="wrap">
<section class="block" style="border-bottom:none">
<h2 class="sec mono">Iterra vs the tools you know</h2>
<ul class="index-grid">
${indexCards(pages, 'compare')}
</ul>
<div class="cta" style="margin-top:2.5rem">
<a class="primary" href="/#/today">Open the workspace →</a>
<a class="ghost" href="/alternatives">Looking for alternatives instead?</a>
</div>
</section>
</div>
${footer()}
</body>
</html>
`;
}

export function renderAlternativesIndex() {
  const url = `${SITE}/alternatives`;
  const pages = COMPARE_PAGES.filter((p) => p.section === 'alternatives');
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Study app alternatives',
        description: 'Honest alternatives to the study apps students outgrow — Quizlet, Notion, Anki, StudySmarter and more.',
        url,
      },
    ],
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Study App Alternatives — Honest Picks for Students</title>
<meta name="description" content="The best alternatives to Quizlet, Notion, Anki and StudySmarter for students — compared on price, privacy, offline use and what the app actually does." />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Iterra" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="Study App Alternatives — Honest Picks for Students" />
<meta property="og:description" content="When the app you outgrew isn't enough anymore." />
<meta property="og:image" content="${SITE}/og/alternatives.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
${FONTS}
<style>${cssForSkin()}</style>${SKIN_BOOT}
${jsonLd(ld)}
</head>
<body>
${header('/alternatives')}
<section class="hero"><div class="wrap">
${crumbs([{ label: 'Iterra', href: '/' }, { label: 'Alternatives' }])}
<div class="kicker mono">Way out</div>
<h1>Outgrew the <em>app?</em></h1>
<p class="lede">Every study app here was built to do one thing well. When one thing isn't enough anymore, these are the honest exits — including ours, and when it isn't the right one.</p>
</div></section>
<div class="wrap">
<section class="block" style="border-bottom:none">
<h2 class="sec mono">Picks by what you’re leaving</h2>
<ul class="index-grid">
${indexCards(pages, 'alternatives')}
</ul>
<div class="cta" style="margin-top:2.5rem">
<a class="primary" href="/#/today">Try Iterra — free, no account →</a>
<a class="ghost" href="/compare">Prefer head-to-head?</a>
</div>
</section>
</div>
${footer()}
</body>
</html>
`;
}

export function renderDesignIndex() {
  const url = `${SITE}/designs`;
  const cards = SKINS.map((s) => {
    const q = `?skin=${s.id}`;
    return `<li><a class="skin-card" href="/guides/plan-a-semester${q}">
<div class="top"><span class="t">${esc(s.name)}</span><span class="use">${esc(s.use)}</span></div>
<div class="swatches" aria-hidden="true">${s.swatches.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
<p class="tagline">${esc(s.tagline)}</p>
<div class="skin-links">
<a href="/guides/plan-a-semester${q}">Guide</a>
<a href="/tools/flashcards${q}">Tool</a>
<a href="/compare/iterra-vs-notion${q}">Compare</a>
<a href="/tools${q}">Index</a>
</div>
</a></li>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex,nofollow" />
<title>Iterra marketing design lab</title>
<meta name="description" content="Internal design review: six marketing skins for Iterra's static study pages." />
<link rel="canonical" href="${url}" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
${FONTS}
<style>${cssForSkin()}</style>${SKIN_BOOT}
</head>
<body>
${header('/designs')}
<section class="hero"><div class="wrap">
${crumbs([{ label: 'Iterra', href: '/' }, { label: 'Design lab' }])}
<div class="kicker mono">Internal review</div>
<h1>Six skins, <em>one terrain</em></h1>
<p class="lede">The canonical pages stay Atlas. Add <code>?skin=&lt;id&gt;</code> to any marketing URL to review a variant — guides, tools, indexes, comparisons, and alternatives all respond to the same skin layer.</p>
<div class="fact-strip"><span class="fact">No duplicate SEO pages</span><span class="fact">Same content, different chrome</span><span class="fact">Atlas remains default</span></div>
</div></section>
<div class="wrap">
<section class="block" style="border-bottom:none">
<h2 class="sec mono">Choose a direction</h2>
<ul class="skin-grid">
${cards}
</ul>
<div class="cta" style="margin-top:2.5rem">
<a class="primary" href="/guides/plan-a-semester">Open canonical guide</a>
<a class="ghost" href="/tools">All tools</a>
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
    { loc: `${SITE}/guides`, priority: '0.8', freq: 'weekly' },
    { loc: `${SITE}/compare`, priority: '0.8', freq: 'weekly' },
    { loc: `${SITE}/alternatives`, priority: '0.8', freq: 'weekly' },
    ...COMPARE_PAGES.map((p) => ({
      loc: `${SITE}/${p.section}/${p.slug}`,
      priority: '0.7',
      freq: 'monthly',
    })),
    ...TOOLS.map((t) => ({ loc: `${SITE}${t.path}`, priority: '0.7', freq: 'monthly' })),
    ...GUIDES.map((g) => ({ loc: `${SITE}/guides/${g.slug}`, priority: '0.7', freq: 'monthly' })),
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
  mkdirSync(join(distDir, 'guides'), { recursive: true });
  mkdirSync(join(distDir, 'design-skins'), { recursive: true });
  mkdirSync(join(distDir, 'designs'), { recursive: true });
  for (const skin of SKINS) {
    writeFileSync(join(distDir, 'design-skins', `${skin.id}.css`), `${SKIN_CSS[skin.id] || SKIN_CSS.atlas}\n`);
  }
  writeFileSync(join(distDir, 'designs', 'index.html'), renderDesignIndex());
  writeFileSync(join(distDir, 'tools', 'index.html'), renderToolsIndex());
  writeFileSync(join(distDir, 'guides', 'index.html'), renderGuidesIndex());
  mkdirSync(join(distDir, 'compare'), { recursive: true });
  mkdirSync(join(distDir, 'alternatives'), { recursive: true });
  writeFileSync(join(distDir, 'compare', 'index.html'), renderCompareIndex());
  writeFileSync(join(distDir, 'alternatives', 'index.html'), renderAlternativesIndex());
  for (const page of COMPARE_PAGES) {
    const dir = join(distDir, page.section, page.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), renderComparePage(page));
  }
  for (const tool of TOOLS) {
    mkdirSync(join(distDir, 'tools', tool.id), { recursive: true });
    writeFileSync(join(distDir, 'tools', tool.id, 'index.html'), renderToolPage(tool));
  }
  for (const guide of GUIDES) {
    mkdirSync(join(distDir, 'guides', guide.slug), { recursive: true });
    writeFileSync(join(distDir, 'guides', guide.slug, 'index.html'), renderGuidePage(guide));
  }
  writeFileSync(join(distDir, 'sitemap.xml'), renderSitemap());
  console.log(`seo: wrote /tools index + ${TOOLS.length} tool pages + /guides index + ${GUIDES.length} guides + /compare + /alternatives indexes + ${COMPARE_PAGES.length} compare pages + sitemap.xml`);
}
