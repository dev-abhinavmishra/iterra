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
    lede: 'Dump everything on your mind, pick the few things that actually matter, and give each one a box of time. Boxed turns a scattered to-do list into a day you can execute.',
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
      { q: "How is Boxed different from just using my phone's reminders?", a: "Reminders ping you once; Boxed holds the whole shape of the day. The dump, the prioritization, and the time-boxes all live together — a reminder tells you to look, a box tells you what to do with the next two hours." },
      { q: "Can Boxed handle group projects or shared deadlines?", a: "Boxed is personal — it plans your day, not your team's. Shared deadlines belong in Margin as course materials or in whatever your group actually uses; the tool's job is making sure your slice of the work has a box." },
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
    updated: '2026-10-30',
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
    lede: 'Set up your term once — courses, meeting times, commitments — and Syllabus lays out the week for you. Schedule study blocks, keep track of what’s overdue, and let finished focus sessions file their minutes back into the plan.',
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
      { q: "Can Syllabus handle irregular schedules — night classes, internships?", a: "Yes — blocks aren't tied to a MWF/TT pattern. If your week looks like nothing, that's fine; the folio plans around whatever slots you actually have, including one-off blocks." },
      { q: "Does Syllabus know my exam dates automatically?", a: "You enter them as commitments when they're announced — the syllabus PDF is the source, not the tool. Once it's in, the plan rearranges around real deadlines instead of pretending they don't exist." },
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
    updated: '2026-11-05',
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
    lede: 'Showing up beats intensity. Rhythm lays your week out like a step sequencer — routines, attendance, and study cadence — so keeping a streak is the easiest thing on the page.',
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
      { q: "What if I miss a whole week — do I start over?", a: "No. The register shows the gap honestly and keeps the streak history intact — you can see exactly which days broke the pattern and rebuild from there, not from zero." },
      { q: "Can I use Rhythm for non-study habits too?", a: "Yes — gym, sleep, reading, anything with a weekly rhythm. The register doesn't care what you're tracking; it cares that you're honest about it." },
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
    updated: '2026-11-12',
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
    lede: 'Decks, spaced review, multiple-choice quizzes, and written recall drills. The cardfile keeps what you’ve learned one review at a time, and tells the Today rail exactly what’s due.',
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
      { q: "How many cards should I make per lecture?", a: "Fewer than you think. One idea per card, made within a day of the lecture — a deck of 30 solid cards beats 100 made in a panic the night before the exam." },
      { q: "Can I use the same deck across multiple courses?", a: "Decks can be tagged to courses, but nothing stops you from reviewing any deck anytime. The course tag is for organization, not a lock." },
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
    updated: '2026-11-19',
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
    lede: 'A writing desk for lecture notes, essays, and thinking-out-loud. Wiki-links connect your notes into something like a personal knowledge graph, and the whole thing stays in your browser.',
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
      { q: "What happens if I need my notes on another computer?", a: "Export them — Ink is local-first, so your data is yours to move. There's no sync service holding them hostage, which is the trade: portability over convenience." },
      { q: "Is Ink good for long essays or just notes?", a: "Both — it's a writing desk, not a sticky-note app. Wiki-links and daily pages help with thinking, but the editor handles long-form prose without breaking a sweat." },
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
    updated: '2026-10-22',
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
      { q: "Can I share materials with classmates?", a: "Margin is a personal shelf — sharing happens through exports. If your study group needs a shared drive, use a real one; Margin's job is keeping *your* copy organized." },
      { q: "Does Margin work with scanned handwritten notes?", a: "Yes — images and scans file the same as PDFs. Handwritten notes that get scanned become searchable course material instead of drawer clutter." },
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
    updated: '2026-11-02',
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
    lede: 'Build the assessment, print the sheet, scan it back, get scores and trends. GradeStack turns a stack of paper into a mark book that remembers every attempt.',
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
      { q: "Can students use GradeStack for self-quizzing?", a: "Yes — the builder and grading work without the roster layer. Build a sheet from your notes, scan your own answers, and get the same score trends teachers get." },
      { q: "What if a student fills the sheet wrong or marks two answers?", a: "The scanner flags ambiguous marks for review — it doesn't guess silently. You see the flagged sheets and decide, which keeps grading honest without needing a physical scantron." },
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
    updated: '2026-11-15',
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
    lede: 'Split-flap instruments for deep work: countdowns, interval routes, a stopwatch, and a ledger of every session. Start a session from your plan and the minutes file themselves back into it.',
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
      { q: "What if I need to pause mid-session?", a: "Pause works — the session keeps its place and the ledger only counts finished time. A break you actually take beats a session you abandon and restart." },
      { q: "Does the timer work on my phone during a study session?", a: "Yes — Iterra runs in any modern browser, and the timer works offline after first load. Phone or laptop, the ledger follows your account-free workspace." },
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
    updated: '2026-10-19',
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
    lede: 'Math doesn’t get easier by rereading answers — it gets easier by doing the steps. Proof gives you problem sets, room for derivations, and an error log that brings back whatever you missed.',
    features: [
      'Problem sets with step-by-step working space',
      'Error log that resurfaces missed concepts for review',
      'Course-linked so work ties back to your syllabus',
      'Review queue feeds the Today workspace',
    ],
    faqs: [
      { q: "Does Proof just solve the problem for me?", a: "No — it's a workbench, not an answer machine. You work the steps; Proof keeps the problem set, your derivations, and resurfaces what you missed." },
      { q: "What subjects does Proof work for?", a: "Anything with derivations — math, physics, chemistry, economics. If the answer is a process rather than a number, Proof's step-by-step space is built for it." },
      { q: "How does the error log decide what to resurface?", a: "Missed problems get filed by concept, not just by question — so a derivative you botched on Tuesday resurfaces when Friday's set hits the same idea, regardless of how the numbers change." },
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
    updated: '2026-11-23',
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

/* Longer-form "closer look" copy per tool — the walkthrough paragraphs that
   turn a feature list into a page worth reading. */
const TOOL_TOURS = {
  boxed: [
    'Most planners fail the same way: they ask you to decide what matters before you’ve emptied your head. Boxed flips the order. The brain dump comes first — every errand, worry, and half-formed intention lands in one place, where it stops looping in your skull. Only then do you choose.',
    'Time-boxing is where the day gets real. “Study biology” is a wish; “bio reading, 2–4pm” is a commitment your future self can actually keep or break. Unfinished boxes roll forward instead of evaporating, so tomorrow’s dump starts from what really happened.',
    'The dump is the underrated half. Most planners ask you to decide under pressure — what’s important, what can wait — while your head is still noisy. Boxed separates those jobs on purpose: capture first, prioritize once the noise is on paper. Students who’ve tried it say the dump alone is worth it, even on days they never open the schedule.',
  ],
  syllabus: [
    'The Folio is where a semester stops being a rumor. You enter courses once — meeting times, rooms, instructor notes — and the schedule becomes the skeleton every other tool hangs off. Planned study blocks land on real days, and attendance and deadlines pick up the same course context for free.',
    'What separates it from a generic calendar is that it knows what a course *is* inside Iterra. A block tagged to Organic Chemistry can surface its readings, its flashcard deck’s due count, and its notes without you filing anything twice. The schedule ends up being the index.',
    'The honest limitation: it plans the study, not the lecture. Your actual class times still live wherever your registrar put them. What the Folio replaces is the spreadsheet of “I should review chapter 4” — that layer was never a calendar problem, and pretending it was is why most planners fail students.',
  ],
  rhythm: [
    'Routines are the least glamorous tool here and probably the most useful. Rhythm doesn’t try to motivate you — it keeps a faithful record of what you actually did, which is the only data a habit needs. Weekly routines, attendance logs, and streaks live in one place so “am I showing up?” has a real answer.',
    'Students consistently overestimate willpower and underestimate friction. Rhythm is built for the second problem: logging takes seconds, streaks make skipping visible, and the weekly review turns vague guilt into a pattern you can actually adjust.',
    'The register view matters more than it looks. Habits tracked in isolation are easy to game — mark everything done, feel productive, learn nothing. Rhythm’s weekly grid makes the shape of the week visible at a glance: the courses you’re drifting on, the habits you’ve quietly dropped, the streak that’s actually alive.',
  ],
  flashcards: [
    'Flashcards in Iterra are built around an uncomfortable truth: rereading feels productive and isn’t. Every deck supports active recall — you answer before you flip — and spaced review schedules cards based on how well you actually knew them, not on a fixed timer.',
    'The writing drills matter more than they sound. Typing an answer is a harder, more honest test than recognizing one, and it’s the mode that transfers to exams. Decks attach to courses, so a card made during lecture week resurfaces during review week without any filing on your part.',
    'Deliberately simpler than Anki, which is a feature, not a bug. Anki’s scheduling engine is excellent and its interface is a project. The cardfile trades a few scheduling knobs for a deck that takes five minutes to set up and zero minutes to dread opening. For most courses, that trade wins.',
  ],
  ink: [
    'Ink treats notes as a thinking surface, not a storage unit. Wiki-links let a concept in one lecture connect to a concept in another; daily pages give you a low-friction place to think out loud; folders keep courses from dissolving into one long scroll.',
    'The focus-writing mode is the quiet killer feature. Distraction-free prose with your links and references one keystroke away means the note stays connected to the rest of your thinking without competing for attention.',
    'It’s also where Iterra’s local-first claim stops being abstract. Your notes — the most personal files a student has — never leave the browser. No sync service to breach, no company pivot that turns your semester into a hostage situation. Export when you want a copy; otherwise it just stays yours.',
  ],
  margin: [
    'Margin is the shelf behind the desk. Recordings, PDFs, handouts, and imported class files live here, filed by course, ready to surface wherever you’re working — a recording’s timestamp can point at the exact moment a concept got explained.',
    'It exists because study materials have a habit of scattering across downloads folders and chat apps. Keeping them course-tagged means “what was that example the professor gave?” is a search, not an archaeology project.',
    'The shelf also answers the question every student asks too late: where did that recording go? Lecture capture, scanned handouts, professor slides — if it entered through Margin, it’s filed by course and reachable from the same place your notes and cards live.',
  ],
  gradestack: [
    'GradeStack is the part of studying nobody enjoys and everybody needs. It builds assessments, reads completed answer sheets back in, and keeps a gradebook that shows score trends over time — so a bad week reads as data instead of a verdict.',
    'The error log is the real study tool hiding inside it. Missed questions get filed where you’ll actually see them again, which closes the loop between being graded and getting better.',
  ],
  timer: [
    'The Instruments are deliberately analog in spirit: a countdown, an interval route, a stopwatch, and a session ledger. No streaks, no guilt mechanics — just honest timekeeping for work that needs a boundary.',
    'Focus sessions pair naturally with time-boxed planning. Park a 50-minute block from Boxed here and the timer holds the boundary while the plan holds the intention. The session log at the end of the week is the most truthful productivity metric you’ll find.',
  ],
  proof: [
    'Proof is a workbench, not an answer machine. It walks math problems step by step — derivations, substitutions, checks — so you can follow the reasoning instead of just copying the result. Every problem you miss gets filed in an error log for review.',
    'It connects to GradeStack for the assessment side of the same course: the workbench builds the problem sets, the mark book reads the results, and the error log makes sure today’s mistake becomes next week’s recall.',
  ],
};

/* One deeper-dive section per tool page — the visual variety between the
   "closer look" tour and the study-day workflow. Rendered with renderBlocks. */
const TOOL_EXTRAS = {
  boxed: {
    h2: 'The anatomy of a Boxed day',
    blocks: [
      { k: 'p', t: 'A Boxed day has a shape most students never see until it becomes routine:' },
      { k: 'steps', items: [
        'Morning dump — five minutes, everything on your mind, no filtering.',
        'Choose the vital few — three to five boxes that actually matter today.',
        'Time-box each one — a start and an end, not "sometime this afternoon".',
        'Execute the boxes — the schedule holds the boundary.',
        'Evening rollover — unfinished boxes move forward honestly, not silently.',
      ]},
      { k: 'quote', t: 'The dump is the underrated half. Most planners ask you to decide under pressure — what’s important, what can wait — while your head is still noisy.' },
    ],
  },
  syllabus: {
    h2: 'How a semester lives in Syllabus',
    blocks: [
      { k: 'p', t: 'A semester in the Folio moves through predictable phases — and each one asks something different of you:' },
      { k: 'timeline', items: [
        { when: 'Week 1', what: 'Enter courses, meeting times and commitments — the skeleton goes up before the noise does.' },
        { when: 'Weeks 2–8', what: 'Study blocks land on real days; readings and reviews attach to the courses they belong to.' },
        { when: 'Midterms', what: 'Deadline and attendance tracking surfaces what is actually due — no spreadsheet required.' },
        { when: 'Finals week', what: 'The schedule becomes the index: every block already knows its course, its deck, its notes.' },
      ]},
      { k: 'p', t: 'The honest limitation stays honest: Syllabus plans the study, not the lecture. Your class times still live wherever your registrar put them.' },
    ],
  },
  rhythm: {
    h2: 'What Rhythm actually measures',
    blocks: [
      { k: 'p', t: 'Rhythm does not measure productivity — it measures showing up. Those are different things, and confusing them is why most habit apps fail.' },
      { k: 'deflist', items: [
        { t: 'Weekly routines', d: 'The repeating commitments — study blocks, gym, sleep — tracked as habits, not tasks.' },
        { t: 'Attendance', d: 'Whether you went, not whether you meant to — the record is the point.' },
        { t: 'Streaks', d: 'Consecutive weeks of showing up — visible, honest, occasionally annoying.' },
        { t: 'The weekly grid', d: 'The register view: the shape of your week at a glance, drift included.' },
      ]},
      { k: 'quote', t: 'Habits tracked in isolation are easy to game — mark everything done, feel productive, learn nothing.' },
    ],
  },
  flashcards: {
    h2: 'Inside a cardfile deck',
    blocks: [
      { k: 'p', t: 'A deck is more than front-and-back cards — the cardfile holds three kinds of recall work:' },
      { k: 'table', head: ['Card type', 'Best for', 'Example'], rows: [
        ['Recall cards', 'Facts, definitions, mechanisms', '"What is the Krebs cycle output?"'],
        ['Multiple-choice', 'Exam-style discrimination', '"Which hormone raises blood glucose?"'],
        ['Writing drills', 'Production, not recognition', '"Write the steps of mitosis from memory"'],
      ]},
      { k: 'p', t: 'Spaced review schedules each card at the edge of forgetting — the interval expands when you get it right and contracts when you miss. That is the entire engine: retrieval at the moment it is hardest.' },
    ],
  },
  ink: {
    h2: 'Notes that behave like a knowledge base',
    blocks: [
      { k: 'p', t: 'Ink notes are not documents — they are nodes. The difference is links: a note about operant conditioning that points at your memory-techniques note and your psychology lecture note becomes part of a web, not a pile.' },
      { k: 'deflist', items: [
        { t: 'Concept links', d: 'Link ideas across courses — "interference" in memory connects to "proactive inhibition" in psych.' },
        { t: 'Course links', d: 'Tag notes to the course they belong to — the Folio knows which deck is due.' },
        { t: 'Source links', d: 'Attach the lecture, page or paper a note came from — citations build themselves.' },
      ]},
      { k: 'p', t: 'The web compounds. A note you wrote in week two resurfaces in week ten through a link you did not plan — that is the argument for linking early and linking often.' },
    ],
  },
  margin: {
    h2: 'The materials shelf',
    blocks: [
      { k: 'p', t: 'Margin is where the raw material of a course lives before it becomes knowledge — tagged, searchable, and connected to the tools that consume it:' },
      { k: 'deflist', items: [
        { t: 'Recordings', d: 'Lecture audio and video — review at 1.5x instead of re-attending in your head.' },
        { t: 'PDFs & slides', d: 'Readings and decks — annotated in place, linked into notes.' },
        { t: 'Scanned handouts', d: 'The paper that never made it digital — searchable after upload.' },
        { t: 'Tags by course', d: 'Everything files under the same course spine as your planner and cards.' },
      ]},
      { k: 'p', t: 'The shelf matters because scattered materials are where study time goes to die — a recording you cannot find is a lecture you have to re-watch, and nobody re-watches.' },
    ],
  },
  gradestack: {
    h2: 'From paper to mark book',
    blocks: [
      { k: 'p', t: 'GradeStack exists for the unglamorous middle of assessment — the part between "here are the answers" and "here is the grade":' },
      { k: 'steps', items: [
        'Build the assessment — question sets and answer keys in the workbench.',
        'Print the bubble sheet — the format students already know.',
        'Scan the stack back — pages become scores automatically.',
        'Read the trends — per-question and per-student patterns, not just totals.',
        'Feed the misses back — wrong answers become tomorrow\'s recall queue.',
      ]},
      { k: 'p', t: 'The trend data is the underrated half. A class average tells you the class struggled; the per-question breakdown tells you exactly which concept to re-teach on Monday.' },
    ],
  },
  timer: {
    h2: 'The instrument panel',
    blocks: [
      { k: 'p', t: 'Timer is a set of instruments, not a single stopwatch — each mode exists because a different kind of work needs a different boundary:' },
      { k: 'deflist', items: [
        { t: 'Countdown', d: 'A hard boundary for focused work — 25, 50, 90 minutes, your call.' },
        { t: 'Interval routes', d: 'Alternating work and rest — the Pomodoro shape for people who hate pomodoros.' },
        { t: 'Stopwatch', d: 'Untimed tasks that still deserve a record — the essay, the problem set, the reading.' },
        { t: 'Session ledger', d: 'Every session logged — the week\'s honest record of where the hours went.' },
      ]},
      { k: 'quote', t: 'No streaks, no guilt mechanics — just honest timekeeping for work that needs a boundary.' },
    ],
  },
  proof: {
    h2: 'How Proof structures a solution',
    blocks: [
      { k: 'p', t: 'Proof does not hand you the answer — it walks the reasoning, step by step, so the method transfers to the next problem:' },
      { k: 'steps', items: [
        'Read the problem — identify what is given and what is being asked.',
        'Choose the method — which technique applies: substitution, derivation, theorem.',
        'Work the steps — each line earns its place; skipped algebra hides errors.',
        'Check the result — plug back, verify units, sanity-check the magnitude.',
        'File the miss — every problem you get wrong enters the error log for review.',
      ]},
      { k: 'p', t: 'The error log is the compounding part. A mistake you file today is a recall prompt next week — Proof turns your worst problems into your best review material.' },
    ],
  },
};

/* Palette + type lifted from shell/src/landing.css and index.css so these
   static pages sit visually inside the same world as the app. */
const CSS = `
:root{
  --bg:#faf9f5; --side:#f2f0e7; --sheet:#fffdf8;
  --line:#e4e0d1; --line2:#cfc9b4;
  --ink:#1f241f; --mute:#5c665e; --faint:#8b8574;
  --accent:#2b5440; --accent2:#223d30; --accentsoft:#2b544014;
  --gold:#b98f3e; --gold2:#d9c897; --gold3:#e8c98a; --sage:#7fae7a; --sage2:#c9d4c4;
  --night:#102e24; --night2:#102f24; --night3:#183e2c;
  --cream:#f6efda; --parch:#f5edd7;
}
*{box-sizing:border-box;margin:0}
html{scroll-behavior:smooth}
body{font-family:Archivo,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--bg);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased}
.mono{font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace}
.wrap{max-width:64rem;margin:0 auto;padding:0 clamp(16px,4vw,40px)}

/* ── docs chrome: floating liquid-glass sidebar ────────── */
.docs{display:flex;min-height:100vh;position:relative}
body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:
    radial-gradient(60% 50% at 8% 0%,#dce8d2 0%,transparent 60%),
    radial-gradient(50% 40% at 0% 90%,#e9dfc4 0%,transparent 65%),
    radial-gradient(80% 60% at 100% 100%,#d4e2d0 0%,transparent 60%),
    linear-gradient(180deg,#f7f5ec,var(--bg) 40%)}
body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.5;
  background:url('/atlas/contours.webp') center/cover;
  -webkit-mask-image:linear-gradient(100deg,transparent 30%,#000 75%,#000 100%);
  mask-image:linear-gradient(100deg,transparent 30%,#000 75%,#000 100%);
  animation:ambient-drift 40s ease-in-out infinite alternate}
@keyframes ambient-drift{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(-1.5%,1%,0) scale(1.03)}}
.side{position:fixed;top:12px;bottom:12px;left:12px;width:258px;padding:18px 14px 14px;overflow-y:auto;z-index:50;display:flex;flex-direction:column;scrollbar-width:thin;border-radius:20px;
  background:linear-gradient(165deg,rgba(255,253,246,.66),rgba(240,244,230,.5) 55%,rgba(226,233,214,.55));
  -webkit-backdrop-filter:blur(24px) saturate(1.6);backdrop-filter:blur(24px) saturate(1.6);
  border:1px solid rgba(255,255,255,.55);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 -1px 0 rgba(255,255,255,.25),0 24px 60px -24px rgba(31,36,31,.35),0 2px 8px rgba(31,36,31,.06)}
.side::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:.05;mix-blend-mode:multiply;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")}
.side::-webkit-scrollbar{width:9px}
.side::-webkit-scrollbar-thumb{background:rgba(120,130,105,.35);border-radius:99px;border:3px solid transparent;background-clip:content-box}
.side::-webkit-scrollbar-thumb:hover{background:rgba(90,105,80,.45);background-clip:content-box}
.side::-webkit-scrollbar-track{background:transparent}
.brand{display:flex;align-items:center;gap:10px;font:600 20px/1 Archivo,sans-serif;letter-spacing:-.02em;color:var(--ink);text-decoration:none;padding:2px 8px}
.brand .emblem{transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.brand:hover .emblem{transform:rotate(225deg)}
.emblem{display:grid;grid-template:repeat(2,7px)/repeat(2,7px);gap:2px;transform:rotate(45deg)}
.emblem i{background:#7fae7a;box-shadow:inset 1px 1px #d4eac1}
.emblem i:nth-child(2){background:#d9c897}.emblem i:nth-child(3){background:#4d8a68}
.searchbox{position:relative;display:flex;align-items:center;gap:8px;margin:14px 4px 2px;padding:8px 12px;border:1px solid rgba(255,255,255,.6);border-radius:11px;background:rgba(255,255,255,.5);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:var(--faint);font-size:12.5px;cursor:text;transition:border-color .18s,box-shadow .18s,transform .18s}
.searchbox:focus-within{border-color:rgba(43,84,64,.5);box-shadow:0 8px 20px -10px rgba(43,84,64,.35),inset 0 1px 0 rgba(255,255,255,.8)}
.searchbox .sq{font-size:15px;line-height:1;color:var(--faint);flex:none}
.searchbox input{flex:1;min-width:0;border:none;outline:none;background:transparent;font:inherit;color:var(--ink);padding:0}
.searchbox input::placeholder{color:var(--faint)}
.searchbox input::-webkit-search-cancel-button{display:none}
.searchbox kbd{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:10px;border:1px solid var(--line2);border-bottom-width:2px;border-radius:5px;padding:1px 5px;background:rgba(255,255,255,.6);color:var(--faint);flex:none}
.navg{margin-top:12px}
.navg .gh{display:flex;align-items:center;gap:10px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);padding:12px 10px 6px}
.navg .gh::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(120,115,90,.3),transparent)}
.side nav{display:grid;gap:1px}
.side nav a{position:relative;display:flex;align-items:center;gap:8px;padding:5.5px 10px;border-radius:9px;color:var(--ink);text-decoration:none;font-size:13px;line-height:1.35;transition:background .15s,color .15s,padding-left .15s,box-shadow .15s;min-width:0}
.side nav a::before{content:"";position:absolute;left:2px;top:22%;bottom:22%;width:2.5px;border-radius:99px;background:linear-gradient(180deg,var(--gold),#7fae7a);transform:scaleY(0);transition:transform .22s cubic-bezier(.2,.7,.2,1)}
.side nav a:hover{background:rgba(255,255,255,.55);padding-left:13px;box-shadow:0 2px 10px -4px rgba(31,36,31,.15)}
.side nav a:hover::before{transform:scaleY(.55)}
.side nav a.on{background:rgba(43,84,64,.13);color:var(--accent);font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 2px 10px -6px rgba(43,84,64,.3)}
.side nav a.on::before{transform:scaleY(1)}
.side nav a .lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side nav a .ext{margin-left:auto;flex:none;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);border:1px solid rgba(120,130,105,.35);border-radius:5px;padding:1px 4px;line-height:1.5;background:rgba(255,255,255,.4)}
.side .end{margin-top:auto;padding-top:14px;border-top:1px solid rgba(120,115,90,.25);display:grid;gap:3px;padding-left:10px}
.side .end a{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.06em;color:var(--faint);text-decoration:none;text-transform:uppercase;transition:color .15s}
.side .end a:hover{color:var(--accent)}
.nav-more-btn{display:block;width:calc(100% - 20px);margin:2px 10px 4px;padding:6px 10px;border:1px dashed rgba(120,115,90,.35);border-radius:9px;background:transparent;color:var(--faint);font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:border-color .15s,color .15s,background .15s}
.nav-more-btn:hover{border-color:rgba(43,84,64,.45);color:var(--accent);background:rgba(43,84,64,.05)}
.nav-empty{display:none;padding:14px 10px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;color:var(--faint);text-transform:uppercase}
.nav-empty.show{display:block}
.scrim{display:none}
.main{flex:1;min-width:0;margin-left:282px;display:flex;flex-direction:column}
.topbar{display:none}
.content{flex:1;min-width:0;background-color:var(--bg);background-image:
  radial-gradient(55% 42% at 88% -4%,rgba(124,160,120,.09),transparent 62%),
  radial-gradient(40% 30% at 0% 100%,rgba(217,200,151,.12),transparent 60%),
  url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E");background-attachment:fixed}
.foot{background:transparent}
@media(max-width:960px){
  .side{top:10px;bottom:10px;left:10px;width:auto;right:10px;max-width:320px;transform:translateX(calc(-100% - 30px));transition:transform .3s cubic-bezier(.2,.7,.2,1),box-shadow .3s}
  body.nav-open .side{transform:none}
  .scrim{display:block;position:fixed;inset:0;background:rgba(20,31,26,.4);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);opacity:0;visibility:hidden;transition:opacity .25s,visibility .25s;z-index:45}
  body.nav-open .scrim{opacity:1;visibility:visible}
  .main{margin-left:0}
  .topbar{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--line);background:rgba(250,249,245,.8);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);position:sticky;top:0;z-index:30}
  .nav-toggle{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line2);background:rgba(255,255,255,.6);border-radius:9px;padding:6px 11px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);cursor:pointer;transition:border-color .15s,color .15s}
  .nav-toggle:hover{border-color:var(--accent);color:var(--accent)}
  .topbar .tb-brand{font:600 16px/1 Archivo;letter-spacing:-.02em;color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:8px}
  .topbar .tb-open{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.06em;color:var(--accent);text-decoration:none;border:1px solid var(--accent);border-radius:999px;padding:5px 12px;background:rgba(255,255,255,.5)}
}

/* ── page head — light docs-style header ──────────────── */
.hero{padding:clamp(34px,5vw,64px) 0 clamp(26px,4vw,40px);position:relative;isolation:isolate}
.hero::after{content:"";position:absolute;inset:16px;border:1px solid #d9c8972e;background:linear-gradient(#d9c897,#d9c897) left top/24px 1px,left top/1px 24px,right bottom/24px 1px,right bottom/1px 24px;background-repeat:no-repeat;pointer-events:none;opacity:.8}
.hero .wrap{position:relative;z-index:1}
.kicker{display:flex;align-items:center;gap:.7rem;font-family:'IBM Plex Mono',monospace;font-size:11.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent)}
.kicker a{color:inherit;text-decoration:none;border-bottom:1px solid transparent;padding-bottom:1px;transition:border-color .15s}
.kicker a:hover{border-bottom-color:var(--gold)}
.kicker::before{content:"";width:26px;height:1px;background:linear-gradient(90deg,var(--gold),transparent);flex:none}
.crumbs{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-bottom:1.1rem;display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
.crumbs a{color:inherit;text-decoration:none;border-bottom:1px solid transparent;transition:color .15s,border-color .15s}
.crumbs a:hover{color:var(--accent);border-color:var(--gold2)}
.crumbs .sep{color:var(--line2)}
h1{font-family:Newsreader,Georgia,serif;font-weight:490;letter-spacing:-.045em;font-size:clamp(2.1rem,5vw,3.5rem);line-height:1.05;max-width:22ch;margin:.55rem 0 1rem;color:var(--ink)}
h1 em{color:var(--accent);font-style:italic;font-weight:430}
.lede{max-width:56ch;color:var(--mute);font-size:clamp(1rem,1.5vw,1.15rem);line-height:1.7}
@media(prefers-reduced-motion:no-preference){
  .hero .wrap>*{animation:doc-arrive .7s cubic-bezier(.2,.7,.2,1) both}
  .hero .wrap>*:nth-child(2){animation-delay:.05s}
  .hero .wrap>*:nth-child(3){animation-delay:.11s}
  .hero .wrap>*:nth-child(4){animation-delay:.17s}
  .hero .wrap>*:nth-child(5){animation-delay:.23s}
}
@keyframes doc-arrive{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

/* screenshot figure */
.plate{margin-top:2rem}
.article-cover{margin-top:2rem;max-width:64rem}
.frame{border:1px solid var(--line2);border-radius:14px;overflow:hidden;background:var(--sheet);box-shadow:0 1px 2px rgba(31,36,31,.05),0 30px 60px -32px rgba(31,36,31,.4)}
.frame img{display:block;width:100%;height:auto;transition:transform .6s cubic-bezier(.2,.6,.2,1)}
.frame:hover img{transform:scale(1.012)}


/* ── body sections ────────────────────────────────────── */
section.block{padding:clamp(36px,5vw,72px) 0;border-bottom:1px solid var(--line)}
section.block:last-of-type{border-bottom:none}
h2.sec{font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-bottom:1.8rem}
.feats{list-style:none;padding:0;max-width:56rem}
.feats li{display:grid;grid-template-columns:auto 1fr;gap:1rem;align-items:baseline;padding:1rem 0;border-bottom:1px solid var(--line)}
.feats li:first-child{border-top:1px solid var(--line)}
.feats .n{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--gold);padding-top:.2rem}
.feats .t{font-size:1.1rem}

/* dark feature panels — accent cards inside the docs layout */
.connect{position:relative;background:var(--night2);color:var(--cream);border-radius:14px;padding:clamp(26px,4vw,44px);overflow:hidden}
.connect::before{content:"";position:absolute;inset:0;background:url('/atlas/contours.webp') center/cover;opacity:.18;pointer-events:none;animation:doc-drift 30s ease-in-out infinite alternate}
@keyframes doc-drift{from{transform:scale(1)}to{transform:scale(1.045) translate(-1.5%,-1%)}}
.connect>div{position:relative}
.connect h3{font-family:Newsreader,Georgia,serif;font-weight:500;font-size:clamp(1.5rem,3vw,2.1rem);letter-spacing:-.03em;color:var(--cream);margin-bottom:.8rem}
.connect p{color:var(--sage2);max-width:60ch;font-size:1.02rem}
.connect .mono{color:var(--gold3);font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;display:block;margin-bottom:1rem}
.cta{display:flex;flex-wrap:wrap;gap:.9rem;margin-top:2rem}
.cta a{display:inline-flex;align-items:center;gap:.5rem;padding:.8rem 1.5rem;border-radius:8px;text-decoration:none;font-size:1rem;transition:transform .15s,background .15s}
.cta .primary{background:#d1e8aa;color:#112827;font-weight:600}
.cta .primary:hover{background:#e5f3c8;transform:translateY(-1px)}
.cta .ghost{border:1px solid var(--line2);color:var(--ink)}
.cta .ghost:hover{border-color:var(--accent);color:var(--accent2)}
.connect .cta .ghost,.verdict .cta .ghost{border-color:#d9c89766;color:var(--cream)}
.connect .cta .ghost:hover,.verdict .cta .ghost:hover{border-color:var(--gold3);color:var(--gold3)}

/* ── editorial rows ───────────────────────────────────── */
.rows{list-style:none;padding:0;margin:0;border-top:1px solid var(--line)}
.rows>li{border-bottom:1px solid var(--line)}
.rows a{position:relative;display:block;padding:1.3rem 2.8rem 1.3rem .25rem;text-decoration:none;color:var(--ink);transition:background .15s}
.rows a::after{content:"→";position:absolute;right:.25rem;top:1.4rem;color:var(--gold);font-family:'IBM Plex Mono',monospace;opacity:0;transform:translateX(-4px);transition:opacity .15s,transform .15s}
.rows a:hover{background:var(--sheet)}
.rows a:hover::after{opacity:1;transform:none}
.rows .k{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);display:block}
.rows .t{font-family:Newsreader,Georgia,serif;font-size:1.32rem;font-weight:500;letter-spacing:-.02em;display:block;margin-top:.3rem;line-height:1.25}
.rows .d{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:.93rem;color:var(--mute);margin-top:.45rem;line-height:1.55;max-width:62ch}

/* ── comparison pages ─────────────────────────────────── */
.compare-table{width:100%;min-width:36rem;border-collapse:collapse;font-size:.97rem}
.compare-table th,.compare-table td{padding:.7rem .9rem;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.compare-table thead th{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);border-bottom:2px solid var(--line2);position:sticky;top:4px;z-index:2;background:var(--bg)}
.compare-table tbody th{font-weight:600;white-space:nowrap;position:sticky;left:0;background:var(--sheet);z-index:1;box-shadow:1px 0 0 var(--line)}
.compare-table td:first-of-type{color:var(--mute)}
.compare-table .us{background:#eef4ea}
.compare-table thead .us{color:var(--accent)}
.compare-table tbody tr.us td{background:#f4f8f2}
.compare-table tbody tr.us td.us{background:#e2edde}
@media(prefers-reduced-motion:no-preference){.compare-table tbody tr{transition:background .15s}.compare-table tbody tr:not(.us):hover td{background:#faf6ea}}
.matchup{display:flex;align-items:center;gap:.7rem;margin-top:1.4rem;flex-wrap:wrap}
.matchup .chip{font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:.5rem 1.05rem;border:1px solid var(--line2);border-radius:999px;background:var(--sheet);color:var(--ink);transition:transform .2s,box-shadow .2s,border-color .2s}
.matchup .chip:hover{transform:translateY(-2px);box-shadow:0 10px 20px -12px rgba(31,36,31,.4);border-color:rgba(43,84,64,.4)}
.matchup .chip.us{background:linear-gradient(135deg,#2b5440,#1d4634);border-color:#1d4634;color:#eef4dc}
.matchup .vs{color:var(--faint);font-size:11px;letter-spacing:.14em}
.wins-grid{display:grid;grid-template-columns:1fr 1fr;gap:2.75rem}
.win-card{border-top:1px solid var(--line2);padding-top:1.3rem;background:none;transition:transform .2s}
.win-card:hover{transform:translateY(-3px)}
.win-card.us{border-top:2px solid var(--accent)}
.win-card.them{border-top:1px solid var(--line2)}
.win-card h3{font-family:'IBM Plex Mono',monospace;font-size:11.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;margin-bottom:.9rem}
.win-card.us h3{color:var(--accent)}
.win-card.them h3{color:var(--faint)}
.win-card ul{list-style:none;padding:0;display:grid;gap:.6rem}
.win-card li{padding-left:1.3rem;position:relative;font-size:.97rem;line-height:1.5}
.win-card li::before{content:"";position:absolute;left:0;top:.55em;width:.5rem;height:.5rem;border-radius:50%}
.win-card.us li::before{background:var(--accent)}
.win-card.them li::before{border:1.5px solid var(--line2)}
.verdict{background:var(--night2);color:var(--cream);border-radius:14px;padding:clamp(26px,4vw,44px);position:relative;overflow:hidden}
.verdict::before{content:"";position:absolute;inset:0;background:url('/atlas/contours.webp') center/cover;opacity:.16;pointer-events:none;animation:doc-drift 30s ease-in-out infinite alternate}
.verdict>div{position:relative}
.verdict .mono{color:var(--gold3);font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;display:block;margin-bottom:.9rem}
.verdict p{color:var(--sage2);max-width:62ch;font-size:1.06rem;line-height:1.7}
.verdict p strong{color:var(--cream)}
.faq-list{display:grid;max-width:56rem}
details.faq{border-bottom:1px solid var(--line);padding:.95rem 0}
details.faq:first-child{border-top:1px solid var(--line)}
details.faq summary{cursor:pointer;font-weight:600;font-size:1.02rem;list-style:none;display:flex;justify-content:space-between;gap:1rem;align-items:baseline}
details.faq summary::after{content:"+";font-family:'IBM Plex Mono',monospace;color:var(--accent);font-size:1.2rem}
details.faq[open] summary::after{content:"–"}
details.faq .a{margin-top:.7rem;color:var(--mute);font-size:.97rem;line-height:1.65}
.related-row{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1.4rem}
.related-row a{font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.05em;border:1px solid var(--line2);border-radius:999px;padding:.4rem .95rem;color:var(--accent);text-decoration:none;background:var(--sheet)}
.related-row a:hover{border-color:var(--accent)}
.tldr{border-left:3px solid var(--accent);background:var(--sheet);padding:1rem 1.35rem;margin:1.6rem 0;border-radius:0 10px 10px 0}
.tldr .tk{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);display:block;margin-bottom:.55rem}
.tldr p{font-size:1.04rem;line-height:1.7;color:var(--ink);margin:0}
@media(max-width:720px){.wins-grid{grid-template-columns:1fr}}

/* ── footer ───────────────────────────────────────────── */
.foot{border-top:1px solid var(--line);padding:2rem 0 2.6rem;color:var(--mute);font-size:.9rem}
.foot .wrap{display:flex;flex-wrap:wrap;gap:.8rem 2rem;align-items:center;justify-content:space-between}
.foot .fl{display:flex;flex-wrap:wrap;gap:.35rem 1.2rem}
.foot a{color:var(--mute);text-decoration:none;border-bottom:1px solid transparent}
.foot a:hover{color:var(--accent);border-color:var(--gold2)}
.foot .fm{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}

/* ── guides / long-form ───────────────────────────────── */
.prose{max-width:46rem}
.prose h2{font-family:Newsreader,Georgia,serif;font-weight:500;font-size:clamp(1.35rem,2.8vw,1.7rem);letter-spacing:-.025em;line-height:1.25;margin:2.6rem 0 .9rem;scroll-margin-top:84px;color:var(--ink)}
.prose h2 .h-anchor{font-family:'IBM Plex Mono',monospace;font-size:.5em;font-weight:400;color:var(--gold);text-decoration:none;opacity:0;margin-left:.55rem;vertical-align:.12em;transition:opacity .15s}
.prose h2:hover .h-anchor,.prose h2 .h-anchor:focus-visible{opacity:1}
.guide-article{max-width:52rem}
.toc{border:1px solid var(--line2);border-radius:12px;background:var(--sheet);padding:1.1rem 1.4rem;margin:2rem 0 1rem}
.toc .tk{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);display:block;margin-bottom:.7rem}
.toc ol{list-style:none;padding:0;display:grid;gap:.45rem;counter-reset:toc}
.toc li{counter-increment:toc;font-size:.97rem;line-height:1.5}
.toc li::before{content:counter(toc,decimal-leading-zero) " · ";font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--faint);letter-spacing:.08em}
.toc a{color:var(--ink);text-decoration:none;border-bottom:1px solid transparent}
.toc a:hover{color:var(--accent);border-color:var(--gold2)}
@media(max-width:719px){.toc ol{max-height:15rem;overflow-y:auto;scrollbar-width:thin;padding-right:.4rem}}
.prose p{font-size:1.06rem;line-height:1.78;color:#333a34;margin-bottom:1.15rem}
.prose mark{background:linear-gradient(transparent 55%,rgba(212,175,55,.38) 55%);color:inherit;padding:0 .08em;border-radius:2px}
.prose ul{margin:0 0 1.3rem;padding-left:1.35rem}
.prose li{font-size:1.04rem;line-height:1.7;color:#333a34;margin-bottom:.5rem}
.prose a{color:var(--accent);text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--gold2)}
.prose a:hover{color:var(--accent2)}
.prose strong{font-weight:600}
.prose code{font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:.86em;background:#efece0;border:1px solid var(--line);border-radius:6px;padding:.08em .42em;color:var(--accent2);white-space:nowrap}
.prose .callout{border-left:3px solid var(--gold);background:var(--sheet);padding:1rem 1.35rem;margin:1.7rem 0;border-radius:0 10px 10px 0}
.prose .callout p{margin:0;font-size:1.02rem;color:var(--mute);font-style:italic;line-height:1.65}
.prose .gsec{margin-top:2.6rem}
.tool-inline{position:relative;display:grid;grid-template-columns:auto 1fr auto;gap:1rem;align-items:center;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:10px;background:var(--sheet);padding:.9rem 1.1rem;margin:1.5rem 0;text-decoration:none;color:var(--ink);transition:border-color .15s,background .15s,box-shadow .15s}
.tool-inline:hover{border-color:var(--gold2);background:#fff;box-shadow:0 14px 34px -18px rgba(43,84,64,.35)}
.ti-thumb{width:120px;height:75px;object-fit:cover;object-position:top;border-radius:8px;border:1px solid var(--line);display:block;flex:none;transition:transform .3s cubic-bezier(.2,.7,.2,1)}
.tool-inline:hover .ti-thumb{transform:scale(1.04)}
.ti-body{min-width:0}
.ti-go{color:var(--gold);font-family:'IBM Plex Mono',monospace;font-size:15px;transition:transform .15s,color .15s;align-self:flex-start;margin-top:.4rem}
.tool-inline:hover .ti-go{transform:translateX(3px);color:var(--accent)}
.tool-inline .k{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);display:block}
.tool-inline .t{font-family:Newsreader,Georgia,serif;font-size:1.28rem;font-weight:500;letter-spacing:-.01em;display:block;margin-top:.25rem}
.tool-inline .d{font-size:.92rem;color:var(--mute);display:block;margin-top:.4rem;line-height:1.5}
@media(max-width:560px){.tool-inline{grid-template-columns:auto 1fr}.ti-go{display:none}.ti-thumb{width:84px;height:53px}}
.meta-row{display:flex;flex-wrap:wrap;gap:.5rem 1.5rem;margin-top:1.5rem;font-family:'IBM Plex Mono',monospace;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.meta-row a{color:var(--accent);text-decoration:none;border-bottom:1px solid var(--gold2)}
.meta-row a:hover{border-color:var(--accent)}
.related{margin-top:3rem;padding-top:1.8rem;border-top:1px solid var(--line)}
.related h2{font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-bottom:1.2rem}
.rel-grid{list-style:none;padding:0;margin:0;border-top:1px solid var(--line)}
.rel-grid>li{border-bottom:1px solid var(--line)}
.rel-grid a{position:relative;display:block;padding:1.05rem 2.8rem 1.05rem .25rem;text-decoration:none;color:var(--ink);transition:background .15s}
.rel-grid a::after{content:"→";position:absolute;right:.25rem;top:1.15rem;color:var(--gold);font-family:'IBM Plex Mono',monospace;opacity:0;transform:translateX(-4px);transition:opacity .15s,transform .15s}
.rel-grid a:hover{background:var(--sheet)}
.rel-grid a:hover::after{opacity:1;transform:none}
.rel-grid .k{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);display:block}
.rel-grid .t{font-family:Newsreader,Georgia,serif;font-size:1.22rem;font-weight:500;letter-spacing:-.01em;display:block;margin-top:.3rem;line-height:1.3}

/* ── conversion & reading aids ────────────────────────── */
.fact-strip{display:flex;flex-wrap:wrap;gap:.55rem;margin-top:1.5rem}
.fact{display:inline-flex;align-items:center;gap:.45rem;padding:.48rem .8rem;border:1px solid var(--line2);border-radius:999px;background:var(--sheet);color:var(--mute);font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.fact::before{content:"";width:.42rem;height:.42rem;border-radius:50%;background:var(--sage);box-shadow:0 0 0 3px #7fae7a22}
.takeaways{border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:12px;background:var(--sheet);padding:1.1rem 1.3rem;margin:1.8rem 0 0}
.takeaways .tk{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);display:block;margin-bottom:.7rem}
.takeaways ul{list-style:none;padding:0;display:grid;gap:.5rem}
.takeaways li{position:relative;padding-left:1.15rem;font-size:.97rem;line-height:1.55;color:var(--mute)}
.takeaways li::before{content:"";position:absolute;left:0;top:.62em;width:.42rem;height:.42rem;border-radius:50%;background:var(--gold)}
.sec-index{display:inline-block;min-width:2.1rem;margin-right:.55rem;color:var(--gold);font-family:'IBM Plex Mono',monospace;font-size:.78em;font-weight:500;letter-spacing:.08em;vertical-align:.12em}
.rail-meter{display:flex;align-items:center;gap:.7rem;margin-bottom:1rem}
.rail-meter .pct{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;color:var(--faint);min-width:3.2rem}
.rail-meter i{display:block;flex:1;height:4px;border-radius:999px;background:var(--line);overflow:hidden;position:relative}
.rail-meter i::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,var(--gold),var(--sage));transform:scaleX(0);transform-origin:left}
.rail-meter i.on::after{transform:scaleX(var(--p,0))}
.article-end{margin-top:3rem;padding:1.4rem 1.5rem;border:1px solid var(--line);border-radius:14px;background:linear-gradient(135deg,var(--sheet),#f4f1e6);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem}
.article-end p{font-family:Newsreader,Georgia,serif;font-size:1.3rem;font-weight:500;letter-spacing:-.02em;color:var(--ink);max-width:34ch;line-height:1.3}
.article-end .mono{display:block;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-bottom:.35rem}
.workflow{border-top:1px solid var(--line);margin-top:1.4rem}
.workflow .step{display:grid;grid-template-columns:auto 1fr;gap:1rem;padding:1.05rem .25rem;border-bottom:1px solid var(--line)}
.workflow .n{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--gold);padding-top:.2rem}
.workflow .t{font-family:Newsreader,Georgia,serif;font-size:1.12rem;font-weight:500;line-height:1.35}
.workflow .d{grid-column:2;color:var(--mute);font-size:.92rem;line-height:1.55}
@media(max-width:720px){.workflow .d{grid-column:1}}
.tour{max-width:46rem}
.tour h3{font-family:Newsreader,Georgia,serif;font-weight:500;font-size:1.35rem;letter-spacing:-.02em;margin:1.6rem 0 .5rem;color:var(--ink)}
.tour p{font-size:1.04rem;line-height:1.75;color:#333a34;margin-bottom:1rem}
.series{margin-top:2.6rem;padding-top:1.4rem;border-top:1px solid var(--line)}
.series>.mono{display:block;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-bottom:.7rem}
.series .chips{display:flex;flex-wrap:nowrap;gap:.45rem;overflow-x:auto;scrollbar-width:thin;padding:.2rem .2rem .7rem;margin:0 -.2rem;scroll-snap-type:x proximity;-webkit-mask-image:linear-gradient(90deg,#000 92%,transparent);mask-image:linear-gradient(90deg,#000 92%,transparent)}
.series .chips a{flex:none;scroll-snap-align:start}
.series .chips a{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.04em;color:var(--mute);text-decoration:none;border:1px solid var(--line2);border-radius:999px;padding:.4rem .85rem;background:rgba(255,255,255,.45);transition:border-color .15s,color .15s,transform .15s,box-shadow .15s}
.series .chips a:hover{border-color:rgba(43,84,64,.45);color:var(--accent);transform:translateY(-1px);box-shadow:0 8px 18px -10px rgba(43,84,64,.4)}
.series .chips a.on{background:var(--accent);border-color:var(--accent);color:#f4f1e6}
.ctoc{display:flex;flex-wrap:wrap;gap:.45rem;margin:0 0 1.6rem}
.ctoc a{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.05em;color:var(--mute);text-decoration:none;border:1px solid var(--line2);border-radius:999px;padding:.42rem .9rem;background:rgba(255,255,255,.45);transition:border-color .15s,color .15s,transform .15s,box-shadow .15s}
.ctoc a:hover{border-color:rgba(43,84,64,.45);color:var(--accent);transform:translateY(-1px);box-shadow:0 8px 18px -10px rgba(43,84,64,.4)}
.block[id]{scroll-margin-top:24px}
.pager{display:grid;grid-template-columns:1fr 1fr;gap:2.5rem;margin-top:3rem;padding-top:1.8rem;border-top:1px solid var(--line)}
.pager .dir{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);display:block}
.pager .pk{font-family:'IBM Plex Mono',monospace;font-size:9px;border:1px solid var(--line2);border-bottom-width:2px;border-radius:4px;padding:0 4px;color:var(--faint);background:rgba(255,255,255,.5);margin-left:.3rem}
.pager a{display:block;margin-top:.45rem;text-decoration:none;color:var(--ink)}
.pager a .t{font-family:Newsreader,Georgia,serif;font-size:1.25rem;font-weight:500;letter-spacing:-.01em;line-height:1.3;display:block;transition:color .15s}
.pager a:hover .t{color:var(--accent)}
.pager .next{text-align:right}
@media(max-width:720px){.pager{grid-template-columns:1fr;gap:1.6rem}}

/* ── article chrome: progress, TOC rail, ads ───────────── */
.resume-chip{position:fixed;right:1.2rem;bottom:5.6rem;z-index:55;display:none;align-items:center;gap:.6rem;padding:.7rem 1.1rem;border-radius:99px;border:1px solid rgba(255,255,255,.6);background:linear-gradient(160deg,rgba(255,253,246,.85),rgba(240,244,230,.75));-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);box-shadow:0 14px 34px -16px rgba(31,36,31,.4),inset 0 1px 0 rgba(255,255,255,.7);color:var(--ink);font-size:.85rem;text-decoration:none;cursor:pointer;transition:transform .2s,box-shadow .2s}
.resume-chip:hover{transform:translateY(-2px);box-shadow:0 18px 40px -16px rgba(31,36,31,.45),inset 0 1px 0 rgba(255,255,255,.7)}
.resume-chip .pct{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.1em;color:var(--accent)}
.reader-toggle{position:fixed;left:1.2rem;bottom:1.2rem;z-index:55;display:inline-flex;align-items:center;gap:.5rem;padding:.6rem 1rem;border-radius:99px;border:1px solid rgba(255,255,255,.6);background:linear-gradient(160deg,rgba(255,253,246,.85),rgba(240,244,230,.75));-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);box-shadow:0 14px 34px -16px rgba(31,36,31,.4),inset 0 1px 0 rgba(255,255,255,.7);color:var(--mute);font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;transition:color .15s,transform .2s}
.reader-toggle:hover{color:var(--accent);transform:translateY(-2px)}
.reader-toggle.on{color:var(--accent);border-color:var(--gold)}
body.reader .toc-rail,body.reader .ad-slot{display:none!important}
body.reader .prose p,body.reader .prose li{font-size:1.06em;line-height:1.78}
body.reader .guide-article{max-width:46rem}
@media print{.reader-toggle,.resume-chip{display:none!important}}
.read-progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:60;pointer-events:none;background:#d9c89733}
.read-progress i{display:block;height:100%;background:linear-gradient(90deg,var(--gold),var(--sage));transform:scaleX(0);transform-origin:left}
.guide-layout{display:block}
@media(min-width:1200px){
  .guide-layout{display:grid;grid-template-columns:minmax(0,44rem) minmax(14rem,17rem);gap:3.5rem;justify-content:center;max-width:64rem}
  .guide-article{max-width:none}
  .toc{display:none}
}
.toc-rail{display:none}
@media(min-width:1200px){
  .toc-rail{display:block;position:sticky;top:28px;align-self:start;height:fit-content;max-height:calc(100vh - 56px);overflow-y:auto;scrollbar-width:thin;padding:1.1rem 1.2rem;border-radius:14px;border:1px solid rgba(255,255,255,.55);background:linear-gradient(160deg,rgba(255,253,246,.55),rgba(240,244,230,.4));-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 14px 34px -22px rgba(31,36,31,.35)}
}
.toc-rail .tk{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);display:block;margin-bottom:.8rem}
.toc-rail ol{list-style:none;padding:0;margin:0;display:grid;gap:.15rem;border-left:1px solid var(--line)}
.toc-rail li a{display:block;padding:.42rem 0 .42rem .9rem;margin-left:-1px;border-left:2px solid transparent;color:var(--mute);text-decoration:none;font-size:.92rem;line-height:1.4;transition:color .15s,border-color .15s}
.toc-rail li a:hover{color:var(--ink)}
.toc-rail li a.on{color:var(--accent);border-left-color:var(--gold);font-weight:600}
.ad-slot{margin:2.8rem 0;border:1.5px dashed #c9b98f;border-radius:12px;background:repeating-linear-gradient(45deg,#fbf7ea,#fbf7ea 14px,#f4edda 14px,#f4edda 28px);padding:1.3rem 1.5rem;position:relative}
.ad-slot .ad-tag{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);display:block;margin-bottom:.45rem}
.ad-slot .ad-msg{font-size:.95rem;color:var(--mute);font-style:italic;line-height:1.55}
.ad-slot .ad-msg a{color:var(--accent)}

/* ── blog-post chrome: byline, hero variants, author card ── */
.byline{display:flex;align-items:center;flex-wrap:wrap;gap:.45rem 1rem;margin-top:1.5rem;font-family:'IBM Plex Mono',monospace;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.byline .av{width:30px;height:30px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:9.5px;font-weight:600;letter-spacing:.08em;color:#eef4dc;background:linear-gradient(135deg,#3a7059,#1d4634);box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),0 0 0 3px var(--sheet),0 0 0 4px var(--line2)}
.byline .who{color:var(--ink);font-weight:600}
.byline .dot{color:var(--line2)}
.byline a{color:var(--accent);text-decoration:none;border-bottom:1px solid var(--gold2)}
.byline a:hover{border-color:var(--accent)}
.hero-split .hero-grid{display:grid;grid-template-columns:minmax(0,1.04fr) minmax(0,.96fr);gap:clamp(26px,4vw,60px);align-items:center}
.hero-fig{margin:0;position:relative}
.hero-fig .frame{border-radius:16px;box-shadow:0 34px 70px -34px rgba(24,62,44,.45),0 6px 18px -8px rgba(31,36,31,.25)}
.hero-fig img{aspect-ratio:16/10;object-fit:cover;object-position:top center}
@media(max-width:900px){.hero-split .hero-grid{grid-template-columns:1fr;gap:1.8rem}}
.hero-center{text-align:center}
.hero-center .hero-copy{max-width:46rem;margin:0 auto}
.hero-center .crumbs,.hero-center .byline{justify-content:center}
.hero-center .lede{margin-left:auto;margin-right:auto}
.hero-center .kicker{justify-content:center}
.hero-center .kicker::after{content:"";width:26px;height:1px;background:linear-gradient(270deg,var(--gold),transparent);flex:none}
.hero-center .kicker::before{display:none}
.author-card{margin-top:2.8rem;padding:1.25rem 1.4rem;border:1px solid var(--line);border-radius:14px;background:linear-gradient(135deg,var(--sheet),#f3efe2);display:flex;gap:1.1rem;align-items:flex-start}
.author-card .av{width:44px;height:44px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:600;letter-spacing:.08em;color:#eef4dc;background:linear-gradient(135deg,#3a7059,#1d4634);box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),0 0 0 3px var(--sheet),0 0 0 4px var(--line2)}
.author-card .t{font-family:Newsreader,Georgia,serif;font-size:1.18rem;font-weight:500;letter-spacing:-.01em;color:var(--ink)}
.author-card .d{font-size:.92rem;color:var(--mute);line-height:1.6;margin-top:.3rem;max-width:58ch}
.author-card .mono{display:block;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-bottom:.3rem}
.share{display:flex;align-items:center;gap:.9rem;margin-top:1rem;flex-wrap:wrap}
.share .mono{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.share a,.share button{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);text-decoration:none;background:none;border:1px solid var(--line2);border-radius:999px;padding:.32rem .85rem;cursor:pointer;transition:border-color .15s,color .15s,background .15s}
.share a:hover,.share button:hover{border-color:var(--accent);background:rgba(255,255,255,.5)}
.share button.copied{border-color:var(--sage);color:var(--accent2)}
.prose h3{font-family:Newsreader,Georgia,serif;font-weight:550;font-size:1.22rem;letter-spacing:-.02em;margin:2rem 0 .6rem;color:var(--ink);scroll-margin-top:84px}
.prose-fig{margin:2.4rem 0}
.prose-fig .frame{box-shadow:0 1px 2px rgba(31,36,31,.05),0 24px 50px -30px rgba(31,36,31,.4)}
.prose-fig figcaption{margin-top:.7rem;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);text-align:center}
.cols{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--line2);margin:1.8rem 0}
.col{padding:1.15rem 1.4rem 1.25rem 0;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:.5rem}
.col:last-child{border-right:0;padding-right:0}
.col .cn{font-size:10px;letter-spacing:.16em;color:var(--gold);font-weight:500}
.col .ct{font-family:Newsreader,Georgia,serif;font-size:1.12rem;font-weight:550;letter-spacing:-.01em;line-height:1.35;color:var(--ink)}
.col .cd{font-size:.92rem;line-height:1.6;color:#4c564e}
@media(max-width:720px){.cols{grid-template-columns:1fr}.col{border-right:0;border-bottom:1px solid var(--line);padding-right:0;padding-bottom:1.1rem}.col:last-child{border-bottom:0}}
.prose blockquote{margin:1.8rem 0;padding:.2rem 0 .2rem 1.4rem;border-left:3px solid var(--gold);font-family:Newsreader,Georgia,serif;font-size:1.28rem;font-style:italic;font-weight:450;line-height:1.5;color:var(--ink)}
.prose .callout{border:none;background:none;border-radius:0;padding:1.4rem 0;margin:2.2rem auto;max-width:42rem;text-align:center;position:relative}
.prose .callout::before{content:"“";position:absolute;top:-1.5rem;left:50%;transform:translateX(-50%);font-family:Newsreader,Georgia,serif;font-size:4.2rem;font-weight:400;color:var(--gold);line-height:1;opacity:.85}
.prose .callout p{font-family:Newsreader,Georgia,serif;font-size:1.42rem;font-style:italic;font-weight:450;line-height:1.45;color:var(--ink);margin:0}
.fact{transition:transform .22s cubic-bezier(.2,.7,.2,1),box-shadow .22s,border-color .22s}
.fact:hover{transform:translateY(-2px);border-color:rgba(43,84,64,.45);box-shadow:0 12px 24px -14px rgba(43,84,64,.5)}
.compare-table td,.compare-table th{transition:background .15s}
.compare-table .col,.prose-table .col{background:#f5eedd!important}
.compare-table thead th.col{background:#eee2c6!important}
.prose-table thead th.col{background:#e8dfc4!important}

/* ── data & text representations inside articles ──────── */
.steps{list-style:none;padding:0;margin:1.6rem 0;counter-reset:step;display:grid;gap:.9rem}
.steps li{display:grid;grid-template-columns:auto 1fr;gap:1rem;align-items:baseline;padding:1rem 1.2rem;border:1px solid var(--line);border-radius:12px;background:var(--sheet);transition:border-color .2s,transform .2s,box-shadow .2s}
.steps li:hover{border-color:rgba(43,84,64,.4);transform:translateY(-2px);box-shadow:0 14px 28px -18px rgba(43,84,64,.45)}
.steps .n{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--gold);letter-spacing:.1em;padding-top:.15rem}
.steps li>span:last-child{font-size:1rem;line-height:1.65;color:#333a34}
.pull{margin:2.4rem auto;max-width:38rem;text-align:center;font-family:Newsreader,Georgia,serif;font-size:clamp(1.4rem,2.6vw,1.75rem);font-weight:480;font-style:italic;line-height:1.4;letter-spacing:-.015em;color:var(--ink);position:relative;padding:0 1rem}
.pull::before{content:"“";display:block;font-size:3.4rem;line-height:.6;color:var(--gold);opacity:.8;margin-bottom:1.1rem;font-style:normal}
.pull::after{content:"”";display:block;font-size:3.4rem;line-height:.6;color:var(--gold);opacity:.8;margin-top:1.1rem;font-style:normal}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin:1.8rem 0}
.hero-stats{max-width:44rem;text-align:left}
.hero-stats .stat{text-align:left;padding:1.1rem 1.3rem}
.stat{background:var(--sheet);padding:1.3rem 1.2rem;text-align:center}
.stat .v{display:block;font-family:Newsreader,Georgia,serif;font-size:clamp(1.7rem,3vw,2.3rem);font-weight:500;letter-spacing:-.03em;color:var(--accent);line-height:1.1}
.stat .l{display:block;margin-top:.45rem;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);line-height:1.5}
.defs{margin:1.6rem 0;border-top:1px solid var(--line)}
.def{display:grid;grid-template-columns:minmax(8rem,.34fr) 1fr;gap:1.2rem;padding:.95rem .25rem;border-bottom:1px solid var(--line)}
.def dt{font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);padding-top:.2rem}
.def dd{margin:0;font-size:1rem;line-height:1.7;color:#333a34}
@media(max-width:560px){.def{grid-template-columns:1fr;gap:.3rem}}
.table-wrap{overflow-x:auto;margin:1.8rem 0;border:1px solid var(--line);border-radius:12px;background:var(--sheet)}
.prose-table{width:100%;min-width:34rem;border-collapse:collapse;font-size:.95rem}
.prose-table th,.prose-table td{padding:.7rem .95rem;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;line-height:1.55}
.prose-table thead th{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);background:#f4f1e6;position:sticky;top:0}
.prose-table tbody tr:last-child td{border-bottom:none}
.prose-table tbody tr{transition:background .15s}
.prose-table td,.prose-table th{transition:background .15s}
.prose-table tbody tr:hover td{background:#faf6ea}
.prose-table td:first-child{font-weight:600;color:var(--ink);position:sticky;left:0;background:var(--sheet);box-shadow:1px 0 0 var(--line)}
.prose-table thead th:first-child{background:#f4f1e6;z-index:2}
@media(max-width:640px){.prose-table td:first-child{background:#fffdf6}.prose-table thead th:first-child{background:#f4f1e6}}
.checklist{list-style:none;padding:0;margin:1.8rem 0;border:1px solid var(--line);border-radius:14px;background:var(--sheet);overflow:hidden}
.checklist li{border-bottom:1px solid var(--line)}
.checklist li:last-child{border-bottom:none}
.checklist label{display:flex;gap:.85rem;align-items:flex-start;padding:.9rem 1.1rem;cursor:pointer;transition:background .15s}
.checklist label:hover{background:#faf6ea}
.checklist input{appearance:none;width:20px;height:20px;flex:none;margin-top:.15rem;border:1.5px solid #c9c2ac;border-radius:6px;background:#fffdf6;cursor:pointer;position:relative;transition:border-color .15s,background .15s,box-shadow .15s}
.checklist input:checked{background:var(--accent);border-color:var(--accent)}
.checklist input:checked::after{content:"";position:absolute;left:6px;top:2.5px;width:5px;height:9px;border:solid #f7f3e6;border-width:0 2px 2px 0;transform:rotate(42deg)}
.checklist input:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.checklist li:has(input:checked) label span{color:var(--faint);text-decoration:line-through;text-decoration-color:rgba(140,130,100,.5);transition:color .2s}
.timeline{list-style:none;padding:0;margin:1.8rem 0;position:relative}
.timeline::before{content:"";position:absolute;left:6.4rem;top:.4rem;bottom:.4rem;width:1px;background:linear-gradient(var(--gold),var(--line) 30%,var(--line) 70%,var(--gold))}
.timeline li{display:grid;grid-template-columns:5.6rem 1fr;gap:1.2rem;padding:.8rem 0;position:relative}
.timeline .when{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);text-align:right;padding-top:.3rem}
.timeline .when::after{content:"";position:absolute;left:calc(5.6rem + 1.2rem - 3px);top:1.15rem;width:7px;height:7px;border-radius:50%;background:var(--gold);border:2px solid var(--cream);box-shadow:0 0 0 1px var(--gold)}
.timeline .what{font-size:1rem;line-height:1.65;color:#333a34;padding-left:.4rem}
@media(max-width:640px){.timeline::before{left:4.6rem}.timeline li{grid-template-columns:4rem 1fr;gap:.9rem}.timeline .when{font-size:10px}.timeline .when::after{left:calc(4rem + .9rem - 3px)}}
.versus{display:grid;grid-template-columns:1fr auto 1fr;gap:1.4rem;align-items:stretch;margin:2.2rem 0;padding:1.8rem 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);position:relative}
.versus::before,.versus::after{content:"";position:absolute;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent);opacity:.4}
.versus::before{top:0}.versus::after{bottom:0}
.vside{display:flex;flex-direction:column;gap:.6rem;padding:0 .4rem}
.vside.a{border-right:1px dashed var(--line);padding-right:1.4rem}
.vside.b{border-left:1px dashed var(--line);padding-left:1.4rem}
.vk{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.vside.b .vk{color:var(--accent)}
.vt{font-family:Newsreader,Georgia,serif;font-size:1.15rem;font-weight:480;line-height:1.5;color:var(--ink)}
.vmedal{align-self:center;display:grid;place-items:center;width:3rem;height:3rem;border-radius:50%;border:1px solid var(--gold);background:var(--cream);color:var(--accent);font-size:11px;letter-spacing:.12em;text-transform:uppercase;box-shadow:0 4px 14px rgba(20,40,30,.08);flex:none}
@media(max-width:720px){.versus{grid-template-columns:1fr;gap:.4rem}.vmedal{margin:1rem auto}.vside.a,.vside.b{border:none;padding:0}.vside.a{border-bottom:1px dashed var(--line);padding-bottom:1.2rem}.vside.b{padding-top:1.2rem}}
.mistakes{list-style:none;padding:0;margin:2rem 0;border-top:1px solid var(--line)}
.mistakes li{display:grid;grid-template-columns:1.4rem 1fr 1fr;gap:1rem;padding:1rem 0;border-bottom:1px solid var(--line);align-items:baseline}
.m-x{color:#b3563f;font-weight:600}
.m-tag{display:block;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-bottom:.2rem}
.m-tag.ok{color:var(--accent)}
.m-w{color:var(--mute);font-size:.95rem;line-height:1.6}
.m-r{font-size:.95rem;line-height:1.6;color:var(--ink)}
.keypoint{margin:2.4rem auto;max-width:40rem;text-align:center;padding:1.6rem 0;position:relative}
.keypoint::before,.keypoint::after{content:"";position:absolute;left:50%;width:3.2rem;height:1px;background:var(--gold);transform:translateX(-50%)}
.keypoint::before{top:0}.keypoint::after{bottom:0}
.keypoint .kp-tag{display:block;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin-bottom:.7rem}
.keypoint p{font-family:Newsreader,Georgia,serif;font-size:clamp(1.3rem,2.4vw,1.6rem);font-weight:500;line-height:1.45;letter-spacing:-.015em;color:var(--ink);margin:0}
@media(max-width:720px){.keypoint{padding:1.2rem 0}}
.example{border:1px solid var(--line);border-left:3px solid var(--accent);background:linear-gradient(160deg,rgba(233,240,226,.55),var(--sheet));border-radius:0 12px 12px 0;padding:1.3rem 1.5rem;margin:2rem 0;position:relative}
.example .ex-tag{display:block;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin-bottom:.7rem}
.example .ex-body{font-family:Newsreader,Georgia,serif;font-size:1.12rem;line-height:1.7;color:var(--ink)}
.example .ex-body p{margin:0}
@media(max-width:720px){.example{padding:1.1rem 1.2rem}.example .ex-body{font-size:1.05rem}}
.mistake-sec .prose>ul:not(.mistakes):not(.checklist):not(.steps){border-left:2px solid #b3563f;padding-left:1.2rem}
.mistake-sec .prose>ul:not(.mistakes):not(.checklist):not(.steps)>li::marker{color:#b3563f}
@media(max-width:720px){.mistakes li{grid-template-columns:1.4rem 1fr}.m-r{grid-column:2;margin-top:.4rem;padding-top:.6rem;border-top:1px dashed var(--line)}}
.guide-article.dc .gsec:first-of-type .prose p:first-of-type::first-letter{font-family:Newsreader,Georgia,serif;font-weight:500;font-size:3.5em;float:left;line-height:.8;padding:.08em .14em 0 0;color:var(--accent)}
.picks{display:grid;grid-template-columns:repeat(3,1fr);gap:2.2rem;margin-bottom:1rem}
.pick{display:flex;flex-direction:column;gap:.5rem;text-decoration:none;color:var(--ink);padding-top:1.2rem;border-top:2px solid var(--ink);transition:border-color .2s}
.pick:hover{border-top-color:var(--accent)}
.pick .pk{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold)}
.pick .pt{font-family:Newsreader,Georgia,serif;font-size:1.45rem;font-weight:500;letter-spacing:-.015em;line-height:1.25;transition:color .15s}
.pick:hover .pt{color:var(--accent)}
.pick .pd{font-size:.92rem;color:var(--mute);line-height:1.55}
.pick .pm{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.08em;color:var(--faint);margin-top:auto;padding-top:.4rem}
@media(max-width:900px){.picks{grid-template-columns:1fr;gap:1.6rem}}
.topic{display:flex;align-items:center;gap:10px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin:2.2rem 0 .4rem}
.topic::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--line),transparent)}
.topic:first-child{margin-top:0}
.topic{scroll-margin-top:90px}
.read-count{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin:-.4rem 0 1.2rem}
.topic-d{font-family:Newsreader,Georgia,serif;font-size:1.02rem;font-style:italic;color:var(--mute);margin:-.2rem 0 .9rem;max-width:40rem;line-height:1.55}
.topic-link{color:inherit;text-decoration:none;border-bottom:1px solid transparent;transition:color .15s,border-color .15s}
.topic-link:hover{color:var(--accent);border-bottom-color:var(--gold)}
.rows-more{display:inline-flex;align-items:center;gap:.5rem;margin:.4rem 0 1.6rem;padding:.55rem 1rem;border:1px solid var(--line);border-radius:99px;background:transparent;color:var(--mute);font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:color .15s,border-color .15s,background .15s}
.rows-more:hover{color:var(--accent);border-color:var(--gold);background:rgba(240,236,214,.5)}
.rows-more::after{content:"+";font-size:14px;line-height:1}
.rows-more[aria-expanded="true"]::after{content:"–"}
.topic-nav{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 1.6rem}
.topic-nav a{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);text-decoration:none;border:1px solid var(--line2);border-radius:999px;padding:.42rem .95rem;background:rgba(255,255,255,.45);transition:border-color .15s,color .15s,transform .15s,box-shadow .15s}
.topic-nav a:hover{border-color:rgba(43,84,64,.45);color:var(--accent);transform:translateY(-1px);box-shadow:0 8px 18px -10px rgba(43,84,64,.4)}
.skip{position:fixed;top:-60px;left:16px;z-index:100;background:var(--accent);color:#fff;padding:.6rem 1rem;border-radius:8px;font-size:13px;text-decoration:none;transition:top .2s}
.skip:focus{top:12px}
.frame img{cursor:zoom-in}
.lightbox{position:fixed;inset:0;z-index:110;background:rgba(16,24,20,.84);-webkit-backdrop-filter:blur(12px) saturate(1.2);backdrop-filter:blur(12px) saturate(1.2);display:grid;place-items:center;padding:4vmin;opacity:0;visibility:hidden;transition:opacity .25s,visibility .25s;cursor:zoom-out}
.lightbox.on{opacity:1;visibility:visible}
.lightbox figure{margin:0;max-width:min(1100px,94vw);max-height:92vh;display:flex;flex-direction:column;align-items:center;gap:.8rem}
.lightbox img{max-width:100%;max-height:80vh;object-fit:contain;border-radius:12px;box-shadow:0 44px 110px -24px rgba(0,0,0,.7);display:block}
.lightbox .lb-x{position:fixed;top:18px;right:22px;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);color:#fff;font-size:19px;line-height:1;cursor:pointer;transition:background .15s,transform .15s}
.lightbox .lb-x:hover{background:rgba(255,255,255,.25);transform:rotate(90deg)}
.lightbox figcaption{color:#cfd8cc;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;text-align:center}
.to-top{position:fixed;right:22px;bottom:22px;z-index:55;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.65);background:rgba(255,253,246,.72);-webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3);color:var(--accent);font-size:16px;cursor:pointer;opacity:0;visibility:hidden;transform:translateY(10px);transition:opacity .25s,transform .25s,visibility .25s,background .15s;box-shadow:0 12px 32px -14px rgba(31,36,31,.45)}
.to-top.on{opacity:1;visibility:visible;transform:none}
.to-top:hover{background:#fff;transform:translateY(-2px)}
@media print{
  .side,.topbar,.scrim,.read-progress,.ad-slot,.toc-rail,.pager,.series,.author-card,.cta,.byline .av,.to-top,.lightbox,.foot,.crumbs,.hero .plate{display:none!important}
  .main{margin-left:0}.content,.foot{background:#fff}
  body::before,body::after{display:none}
  .hero{padding-top:0}
  .prose-table,.table-wrap,.steps li,.def,.keypoint,.example,.prose-fig,.cols{break-inside:avoid}
  .h-anchor,.nav-more-btn{display:none!important}
  a{color:inherit;text-decoration:none}
}

/* ── polish: selection, scrollbars, reveal-on-scroll ──── */
::selection{background:#d9c89766}
.toc-rail::-webkit-scrollbar{width:5px}
.toc-rail::-webkit-scrollbar-thumb{background:var(--line2);border-radius:99px}
.rows a .t,.rel-grid a .t,.tool-inline .t,.pager a .t{transition:color .18s}
.rows a:hover .t,.rel-grid a:hover .t{color:var(--accent)}
@media(prefers-reduced-motion:no-preference){
  .rv{opacity:0;transform:translateY(16px);transition:opacity .55s ease,transform .6s cubic-bezier(.2,.7,.2,1)}
  .rv.in{opacity:1;transform:none}
}

a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
@media(max-width:720px){
  .feats .t{font-size:1rem}
  .plate{margin-top:1.4rem}
  .article-cover{margin-top:1.4rem}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.cta a,.frame img,.rows a::after,.rel-grid a::after,.tool-inline::after,.side{transition:none}}
`;


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

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function metaDesc(s, max = 158) {
  s = String(s).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return cut.slice(0, sp > 80 ? sp : max).replace(/[\s,;:—–-]+$/, '') + '…';
}

function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

const dateFmt = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const topicSlug = (k) => k.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* Minimal inline markup for guide prose: **bold**, *italic*, [text](/path).
   Content is authored in seo-guides-data.mjs — no user input reaches this. */
function inline(s) {
  let out = esc(s);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) =>
    /^https?:\/\//.test(url) ? `<a href="${url}" rel="noopener">${txt}</a>` : `<a href="${url}">${txt}</a>`,
  );
  out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  out = out.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
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
      if (b.k === 'h3') return `<h3>${inline(b.t)}</h3>`;
      if (b.k === 'keypoint')
        return `<div class="keypoint">${b.label ? `<span class="kp-tag mono">${esc(b.label)}</span>` : ''}<p>${inline(b.t)}</p></div>`;
      if (b.k === 'p') return `<p>${inline(b.t)}</p>`;
      if (b.k === 'ul')
        return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
      if (b.k === 'callout') return `<div class="callout"><p>${inline(b.t)}</p></div>`;
      if (b.k === 'quote') return `<blockquote class="pull">${inline(b.t)}</blockquote>`;
      if (b.k === 'steps')
        return `<ol class="steps">${b.items
          .map((s, i) => `<li><span class="n mono">${String(i + 1).padStart(2, '0')}</span><span>${inline(s)}</span></li>`)
          .join('')}</ol>`;
      if (b.k === 'stats')
        return `<div class="stats">${b.items
          .map((s) => `<div class="stat"><span class="v">${esc(s.v)}</span><span class="l">${esc(s.l)}</span></div>`)
          .join('')}</div>`;
      if (b.k === 'deflist')
        return `<dl class="defs">${b.items
          .map((d) => `<div class="def"><dt>${inline(d.t)}</dt><dd>${inline(d.d)}</dd></div>`)
          .join('')}</dl>`;
      if (b.k === 'table')
        return `<div class="table-wrap"><table class="prose-table"><thead><tr>${b.head
          .map((h) => `<th scope="col">${inline(h)}</th>`)
          .join('')}</tr></thead><tbody>${b.rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`;
      if (b.k === 'tool') {
        const t = TOOLS.find((x) => x.id === b.tool);
        if (!t) return '';
        return `<a class="tool-inline" href="${t.path}"><img class="ti-thumb" src="/shots/${t.id}.webp" alt="" width="120" height="75" loading="lazy" decoding="async" /><span class="ti-body"><span class="k mono">${esc(t.kicker)} · the ${esc(t.name)} place</span><span class="t">${esc(t.name)}</span><span class="d">${esc(t.lede.split('.')[0])}.</span></span><span class="ti-go" aria-hidden="true">→</span></a>`;
      }
      if (b.k === 'checklist')
        return `<ul class="checklist" data-cl="${esc(b.id || '')}">${b.items
          .map((i) => `<li><label><input type="checkbox" /><span>${inline(i)}</span></label></li>`)
          .join('')}</ul>`;
      if (b.k === 'timeline')
        return `<ol class="timeline">${b.items
          .map(
            (t) =>
              `<li><span class="when mono">${esc(t.when || '')}</span><span class="what">${inline(t.what || t)}</span></li>`,
          )
          .join('')}</ol>`;
      if (b.k === 'versus')
        return `<div class="versus"><div class="vside a"><span class="vk mono">${esc(b.a?.k || 'Instead of')}</span><span class="vt">${inline(b.a?.t || '')}</span></div><span class="vmedal mono" aria-hidden="true">vs</span><div class="vside b"><span class="vk mono">${esc(b.b?.k || 'Try')}</span><span class="vt">${inline(b.b?.t || '')}</span></div></div>`;
      if (b.k === 'example')
        return `<div class="example"><span class="ex-tag mono">${esc(b.label || 'Worked example')}</span><div class="ex-body">${inline(b.t)}</div></div>`;
      if (b.k === 'cols')
        return `<div class="cols">${b.items
          .map((c, i) => {
            const h = typeof c === 'string' ? c : c.h || c.t || '';
            const d = typeof c === 'string' ? '' : c.d || '';
            return `<div class="col"><span class="cn mono" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span class="ct">${inline(h)}</span>${d ? `<span class="cd">${inline(d)}</span>` : ''}</div>`;
          })
          .join('')}</div>`;
      if (b.k === 'figure') {
        const t = TOOLS.find((x) => x.id === b.tool);
        const src = b.src || (t ? `/shots/${t.id}.webp` : '');
        if (!src) return '';
        const alt = b.alt || (t ? `${t.name} inside the Iterra study workspace` : 'The Iterra study workspace');
        return `<figure class="prose-fig"><div class="frame"><img src="${esc(src)}" alt="${esc(alt)}" width="1440" height="900" loading="lazy" decoding="async" /></div>${b.caption ? `<figcaption>${inline(b.caption)}</figcaption>` : ''}</figure>`;
      }
      if (b.k === 'mistakes')
        return `<ul class="mistakes">${b.items
          .map(
            (m) =>
              `<li><span class="m-x" aria-hidden="true">✕</span><span class="m-w"><span class="mono m-tag">${esc(b.bad || 'Instead')}</span> ${inline(m.bad || m.w || '')}</span><span class="m-r"><span class="mono m-tag ok">${esc(b.good || 'Better')}</span> ${inline(m.good || m.r || '')}</span></li>`,
          )
          .join('')}</ul>`;
      return '';
    })
    .join('\n');
}

/* Docs-style chrome: the sidebar IS the navbar — workspace links, every
   place, every guide, and every comparison, all in one scrollable rail.
   Mobile gets a top bar + hamburger that toggles the sidebar overlay. */
function header(activePath) {
  const act = (href) => (href === activePath ? ' class="on" aria-current="page"' : '');
  const navLink = (href, label, extra = '') =>
    `<a href="${href}"${act(href)}><span class="lbl">${label}</span>${extra}</a>`;
  const placeLinks = TOOLS.map((t) => navLink(t.path, esc(t.name))).join('\n');
  const guideArr = GUIDES.map((g) =>
    navLink(`/guides/${g.slug}`, esc(g.title.replace(/<\/?em>/g, ''))),
  );
  const guideLinks =
    guideArr.length > 12
      ? `${guideArr.slice(0, 10).join('\n')}\n<div class="nav-more" hidden>${guideArr.slice(10).join('\n')}</div>\n<button type="button" class="nav-more-btn" data-more>Show all guides</button>`
      : guideArr.join('\n');
  const compareLinks = COMPARE_PAGES.map((p) =>
    navLink(`/${p.section}/${p.slug}`, esc(String(p.h1).replace(/<\/?em>/g, ''))),
  ).join('\n');
  return `<div class="docs">
<a class="skip" href="#content">Skip to content</a>
<aside class="side">
<a class="brand" href="/"><span class="emblem" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Iterra</a>
<label class="searchbox"><span class="sq" aria-hidden="true">⌕</span><input id="navfilter" type="search" placeholder="Filter pages…" aria-label="Filter pages" autocomplete="off" /><kbd>⌘K</kbd></label>
<nav aria-label="Iterra documentation">
<div class="navg"><div class="gh">Workspace</div>
${navLink('/', 'Overview')}
${navLink('/#/today', 'Today', '<span class="ext">app</span>')}
${navLink('/#/courses', 'Courses', '<span class="ext">app</span>')}
${navLink('/#/library', 'Library', '<span class="ext">app</span>')}
</div>
<div class="navg"><div class="gh">Places · ${TOOLS.length} tools</div>
${navLink('/tools', 'All tools')}
${placeLinks}
</div>
<div class="navg"><div class="gh">Learn · ${GUIDES.length} guides</div>
${navLink('/guides', 'All guides')}
${navLink('/topics', 'Topics')}
${TOPIC_PAGES.map((t) => navLink(`/topics/${t.slug}`, `${esc(t.kicker)} · ${t.guides.length}`)).join('\n')}
${guideLinks}
</div>
<div class="navg"><div class="gh">Compare · ${COMPARE_PAGES.length}</div>
${navLink('/compare', 'All comparisons')}
${navLink('/alternatives', 'Alternatives hub')}
${compareLinks}
</div>
</nav>
<div class="nav-empty" role="status" hidden>No pages match that filter.</div>
<div class="end"><a href="/feed.xml">RSS feed</a><a href="/">iterrapp.vercel.app</a><a href="/#/today">Open the workspace ↗</a></div>
</aside>
<div class="scrim" data-nav-close></div>
<div class="main">
<header class="topbar">
<button type="button" class="nav-toggle" data-nav-toggle aria-expanded="false">Menu</button>
<a class="tb-brand" href="/"><span class="emblem" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Iterra</a>
<a class="tb-open" href="/#/today">Open ↗</a>
</header>
<main class="content" id="content">
`;
}

function crumbs(items) {
  return `<nav class="crumbs mono" aria-label="Breadcrumb">${items
    .map((c) => (c.href ? `<a href="${c.href}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`))
    .join('<span class="sep">/</span>')}</nav>`;
}

function footer() {
  const sectionLinks = ['/', '/tools', '/guides', '/compare', '/alternatives']
    .map((h) => `<a href="${h}">${{ '/': 'Overview', '/tools': 'All tools', '/guides': 'Guides', '/compare': 'Compare', '/alternatives': 'Alternatives' }[h]}</a>`)
    .join('\n');
  return `<footer class="foot"><div class="wrap">
<div class="fl">
${sectionLinks}
${TOOLS.map((t) => `<a href="${t.path}">${esc(t.name)}</a>`).join('\n')}
</div>
<div class="fm">Free · local-first · no account required</div>
</div></footer>
</main></div></div>
<script src="/iterra-pages.js"></script>`;
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
  const tour = TOOL_TOURS[tool.id] || [];
  const extra = TOOL_EXTRAS[tool.id];
  const extraHtml = extra
    ? `<section class="block" id="deep-dive">
<h2 class="sec mono">${esc(extra.h2)}</h2>
<div class="prose">${renderBlocks(extra.blocks)}</div>
</section>`
    : '';
  const tourHtml = tour.length
    ? `<section class="block" id="closer-look">
<h2 class="sec mono">A closer look at ${esc(tool.name)}</h2>
<div class="tour">
${tour.map((p) => `<p>${esc(p)}</p>`).join('\n')}
</div>
</section>`
    : '';
  const workflowHtml = tool.workflow?.length
    ? `<section class="block" id="study-day">
<h2 class="sec mono">How ${esc(tool.name)} fits a study day</h2>
<div class="workflow">
${tool.workflow
  .map((w, i) => `<div class="step"><span class="n mono">${String(i + 1).padStart(2, '0')}</span><div><div class="t">${esc(w.t)}</div><div class="d">${esc(w.d)}</div></div></div>`)
  .join('\n')}
</div>
</section>`
    : '';
  const toolReadMin = Math.max(1, Math.round(
    ((tool.lede || '') + (tool.features || []).join(' ') + (TOOL_TOURS[tool.id] || []).join(' ') +
      (tool.workflow || []).map((w) => w.t + ' ' + w.d).join(' ') + (tool.faqs || []).map((f) => f.q + ' ' + f.a).join(' ')).length / 800,
  ));
  const neighbors = (TOOL_NEIGHBORS[tool.id] || TOOLS.filter((t) => t.id !== tool.id).slice(0, 3).map((t) => t.id))
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter(Boolean);
  const ti = TOOLS.findIndex((t) => t.id === tool.id);
  const prevTool = ti > 0 ? TOOLS[ti - 1] : null;
  const nextTool = ti >= 0 && ti < TOOLS.length - 1 ? TOOLS[ti + 1] : null;
  const toolPagerHtml =
    prevTool || nextTool
      ? `<nav class="pager" aria-label="More tools">
${prevTool ? `<a href="${prevTool.path}"><span class="dir">← Previous tool <kbd class="pk">[</kbd></span><span class="t">${esc(prevTool.name)}</span></a>` : '<span></span>'}
${nextTool ? `<a class="next" href="${nextTool.path}"><span class="dir">Next tool → <kbd class="pk">]</kbd></span><span class="t">${esc(nextTool.name)}</span></a>` : ''}
</nav>`
      : '';
  const relatedToolsHtml = neighbors.length
    ? `<section class="block" id="explore">
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
        dateModified: tool.updated,
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
<meta name="theme-color" content="#f7f5ec" />
<title>${esc(tool.title)}</title>
<meta name="description" content="${esc(metaDesc(tool.description))}" />
${tool.keywords?.length ? `<meta name="keywords" content="${esc(tool.keywords.join(', '))}" />` : ''}
<link rel="canonical" href="${url}" />
${prevTool ? `<link rel="prev" href="${SITE}/tools/${prevTool.id}" />` : ''}
${nextTool ? `<link rel="next" href="${SITE}/tools/${nextTool.id}" />` : ''}
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
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
${FONTS}
<style>${CSS}</style>
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
<div class="meta-row"><span>Updated ${dateFmt(tool.updated)}</span><span>${toolReadMin} min read</span><span><a href="/tools">All tools</a></span></div>
</div></section>
<div class="wrap">
<figure class="plate">
<div class="frame"><img src="/shots/${tool.id}.webp" alt="${esc(tool.name)} inside the Iterra study workspace" width="1440" height="900" loading="eager" fetchpriority="high" decoding="async" /></div>

</figure>
<nav class="ctoc" aria-label="On this page"><a href="#what">What it does</a>${tour.length ? '<a href="#closer-look">A closer look</a>' : ''}${extra ? '<a href="#deep-dive">Go deeper</a>' : ''}${tool.workflow?.length ? '<a href="#study-day">A study day</a>' : ''}${tool.faqs?.length ? '<a href="#faq">Questions</a>' : ''}<a href="#explore">Keep exploring</a></nav>
<section class="block" id="what">
<h2 class="sec mono">What ${esc(tool.name)} does</h2>
<ul class="feats">
${feats}
</ul>
</section>
${tourHtml}
${extraHtml}
${workflowHtml}
${tool.faqs?.length ? `<section class="block" id="faq">
<h2 class="sec mono">Questions students ask</h2>
<div class="faq-list">
${tool.faqs.map((f) => `<details class="faq"><summary>${esc(f.q)}</summary><div class="a">${esc(f.a)}</div></details>`).join('\n')}
</div>
</section>` : ''}
${relatedToolsHtml}
${toolPagerHtml}
<section class="block" style="border-bottom:none;padding-top:0">
${adSlotHtml()}
</section>
<section class="block">
<div class="connect"><div>
<span class="mono">One workspace, not another tab</span>
<h3>Everything shares the same courses.</h3>
<p>${esc(tool.name)} shares a live picture of your courses with every other tool in Iterra — your planner knows when reviews are due, your notes surface in course dossiers, and everything works offline in your browser. No account required; your data stays on your machine unless you choose sync.</p>
<div class="cta">
<a class="primary" href="/#/p/${tool.id}">Open ${esc(tool.name)} in Iterra →</a>
<a class="ghost" href="/tools">All ${TOOLS.length} tools</a>
</div>
</div></div>
</section>
</div>
${readProgressScript('.content>.wrap')}
${footer()}
</body>
</html>
`;
}

/* Sections titled like mistake roundups ("The mistakes that…", "Common X
   mistakes") get their deflists promoted to the Instead/Better mistakes
   layout. Sections about *sorting* or *logging* mistakes are excluded. */
const MISTAKE_H2 = /\bmistakes?\b/i;
const MISTAKE_EXCLUDE = /\b(?:sort|track|log|journal|analyz|review|categor)/i;
function mistakeify(s) {
  const isMistake = s.h2 && MISTAKE_H2.test(s.h2) && !MISTAKE_EXCLUDE.test(s.h2);
  return s.blocks.map((b) => {
    if (isMistake && b.k === 'deflist' && b.items?.length)
      return {
        k: 'mistakes',
        bad: 'Mistake',
        good: 'Fix',
        items: b.items.map((d) => ({ bad: d.t, good: d.d })),
      };
    if (b.k === 'p' && /^here is the method applied/i.test(b.t || ''))
      return { k: 'example', t: b.t };
    return b;
  });
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
    const isMistakeSec = s.h2 && MISTAKE_H2.test(s.h2) && !MISTAKE_EXCLUDE.test(s.h2);
    return `<section class="gsec${isMistakeSec ? ' mistake-sec' : ''}">
<div class="prose">${h2html}${renderBlocks(mistakeify(s))}</div>
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
  const gi = GUIDES.findIndex((g) => g.slug === guide.slug);
  const prevGuide = gi > 0 ? GUIDES[gi - 1] : null;
  const nextGuide = gi >= 0 && gi < GUIDES.length - 1 ? GUIDES[gi + 1] : null;
  /* series rails: "how to study for X" guides form an exam series,
     "how to study X" guides form a subject series */
  const seriesKind = /^how-to-study-for-/.test(guide.slug)
    ? 'exam'
    : /^how-to-study-(?!for-)/.test(guide.slug)
      ? 'subject'
      : null;
  const ACR = new Set(['sat', 'act', 'gre', 'mcat', 'lsat', 'gmat', 'dat', 'pcat', 'oat', 'fe', 'toefl', 'ielts']);
  const seriesName = (s) => {
    const m = s.match(/^how-to-study-(?:for-(?:the-)?)?(.*)$/);
    if (!m) return s;
    return m[1]
      .split('-')
      .map((w) => (ACR.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
      .join(' ');
  };
  const series = seriesKind
    ? GUIDES.filter((g) =>
        seriesKind === 'exam' ? /^how-to-study-for-/.test(g.slug) : /^how-to-study-(?!for-)/.test(g.slug),
      )
    : [];
  const seriesHtml =
    series.length > 2
      ? `<nav class="series" aria-label="${seriesKind === 'exam' ? 'Exam study guides' : 'Subject study guides'} series">
<span class="mono">${seriesKind === 'exam' ? 'Exam guides' : 'Subject guides'} · part ${series.findIndex((g) => g.slug === guide.slug) + 1} of ${series.length}</span>
<div class="chips">${series
        .map(
          (g) =>
            `<a href="/guides/${g.slug}"${g.slug === guide.slug ? ' class="on" aria-current="page"' : ''}>${esc(seriesName(g.slug))}</a>`,
        )
        .join('')}</div>
</nav>`
      : '';
  const pagerHtml =
    prevGuide || nextGuide
      ? `<nav class="pager" aria-label="More guides">
${prevGuide ? `<a href="/guides/${prevGuide.slug}"><span class="dir">← Previous guide <kbd class="pk">[</kbd></span><span class="t">${esc(prevGuide.title.replace(/<\/?em>/g, ''))}</span></a>` : '<span></span>'}
${nextGuide ? `<a class="next" href="/guides/${nextGuide.slug}"><span class="dir">Next guide → <kbd class="pk">]</kbd></span><span class="t">${esc(nextGuide.title.replace(/<\/?em>/g, ''))}</span></a>` : ''}
</nav>`
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
  const authorCardHtml = `<div class="author-card"><span class="av" aria-hidden="true">IT</span><div><span class="mono">About the author</span><div class="t">The Iterra terrain team</div><p class="d">Iterra is a free, local-first study workspace — planner, notes, flashcards, timer, and grader sharing one picture of your courses. These guides are written from what actually survives a semester, not what sounds good in a headline.</p><div class="share"><span class="mono">Share</span><a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(guide.title.replace(/<\/?em>/g, ''))}" target="_blank" rel="noopener noreferrer">X</a><a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer">LinkedIn</a><button type="button" data-copy="${url}">Copy link</button></div></div></div>`;
  /* three article hero treatments, rotated by guide index */
  const variant = ((gi % 3) + 3) % 3; /* 0 cover below · 1 split hero · 2 centered */
  const heroCopy = `${crumbs([{ label: 'Iterra', href: '/' }, { label: 'Guides', href: '/guides' }, { label: guide.title.replace(/<\/?em>/g, '') }])}
<div class="kicker mono">Iterra Guides · <a class="klink" href="${topicHref(guide.kicker)}">${esc(guide.kicker)}</a></div>
<h1>${h1html}</h1>
<p class="lede">${inline(guide.lede)}</p>
<div class="byline"><span class="av" aria-hidden="true">IT</span><span class="who">Iterra terrain team</span><span class="dot">·</span><time datetime="${guide.datePublished}">${dateFmt(guide.datePublished)}</time>${guide.dateModified && guide.dateModified !== guide.datePublished ? `<span class="dot">·</span><span>Updated <time datetime="${guide.dateModified}">${dateFmt(guide.dateModified)}</time></span>` : ''}<span class="dot">·</span><span>${guide.readMinutes} min read</span><span class="dot">·</span><a href="/guides">All guides</a></div>`;
  const heroFig = `<div class="frame"><img src="/shots/${coverTool.id}.webp" alt="${esc(coverTool.name)} inside the Iterra study workspace" width="1440" height="900" ${variant === 1 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async" /></div>`;
  const heroHtml =
    variant === 1
      ? `<section class="hero hero-split"><div class="wrap"><div class="hero-grid"><div class="hero-copy">${heroCopy}</div><figure class="hero-fig">${heroFig}</figure></div></div></section>`
      : `<section class="hero${variant === 2 ? ' hero-center' : ''}"><div class="wrap">${heroCopy}</div></section>`;
  const coverHtml = variant === 1 ? '' : `<figure class="plate article-cover">${heroFig}</figure>`;
  const toolsHtml = toolsUsed.length
    ? `<section class="block">
<div class="connect"><div>
<span class="mono">Put it to work</span>
<h3>Everything shares the same courses.</h3>
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
<meta name="theme-color" content="#f7f5ec" />
<title>${esc(guide.seoTitle)}</title>
<meta name="description" content="${esc(metaDesc(guide.description))}" />
${guide.keywords?.length ? `<meta name="keywords" content="${esc(guide.keywords.join(', '))}" />` : ''}
<link rel="canonical" href="${url}" />
${prevGuide ? `<link rel="prev" href="${SITE}/guides/${prevGuide.slug}" />` : ''}
${nextGuide ? `<link rel="next" href="${SITE}/guides/${nextGuide.slug}" />` : ''}
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
<meta property="article:section" content="${esc(guide.kicker)}" />
<meta property="article:tag" content="${esc(guide.kicker)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(guide.seoTitle)}" />
<meta name="twitter:description" content="${esc(guide.description)}" />
<meta name="twitter:image" content="${SITE}/og/guide-${guide.slug}.png" />
<link rel="alternate" type="application/rss+xml" title="Iterra Guides" href="/feed.xml" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
${FONTS}
<style>${CSS}</style>
${jsonLd(ld)}
</head>
<body>
${header('/guides')}
${heroHtml}
<div class="wrap">
${coverHtml}
<div class="guide-layout">
<article class="guide-article${variant !== 1 ? ' dc' : ''}">
${tocHtml}
${takeawaysHtml}
${sectionsHtml}
${faqHtml}
${articleEndHtml}
${authorCardHtml}
</article>
${tocRail}
</div>
${seriesHtml}
${pagerHtml}
${toolsHtml}
${relatedHtml}
</div>
${readProgressScript('.guide-article', '.toc-rail')}
${footer()}
</body>
</html>
`;
}

const TOPIC_NOTES = {
  'The Long View': 'Semester arcs, syllabi, and plans that survive February.',
  'Study Methods': 'The evidence-backed techniques — recall, spacing, interleaving.',
  'Exam Season': 'Finals week, one-night miracles, and post-exam recovery.',
  'Test Prep': 'Strategy for the tests that gate the next thing.',
  'Subject Guides': 'How each discipline actually wants to be studied.',
  'Focus': 'Attention, environment, and the phone in your pocket.',
  'Routines': 'Weekly rhythms and daily rituals that hold.',
  'Flashcards': 'Cardfiles, decks, and honest spaced repetition.',
  'Notes': 'Notes that are findable a month later.',
  'Planning': 'Time blocking, calendars, and saying no on paper.',
  'Privacy & Ownership': 'Local-first, exports, and data that’s yours.',
  'Language Learning': 'Vocabulary, comprehensible input, and output.',
  'Study Skills': 'Speed, groups, burnout, and the meta-skills.',
  'Writing': 'Faster drafting, clearer arguments, less staring.',
};

/* A short prose section per topic page so each one reads as a destination,
   not just a filtered list. Rendered between the hero stats and the list. */
const TOPIC_SECTIONS = {
  'The Long View': {
    h2: 'Why semester-scale planning beats weekly heroics',
    blocks: [
      { k: 'p', t: 'Most study advice optimizes the week. The guides in this topic optimize the semester — because the failures that actually cost grades happen at the scale of months, not days.' },
      { k: 'deflist', items: [
        { t: 'Syllabus week', d: 'The only week where you can see the whole arc — deadlines, weightings, and the weeks that will break you if you ignore them.' },
        { t: 'The middle', d: 'Where motivation goes to die. Systems that need willpower every Tuesday do not survive contact with midterms.' },
        { t: 'Finals week', d: 'Where the semester collects its debt. Students who planned all along find it boring; everyone else finds it brutal.' },
      ]},
      { k: 'quote', t: 'A plan you make in week one and ignore is worth less than no plan — it just adds guilt to the pile.' },
    ],
  },
  'Study Methods': {
    h2: 'The techniques that survive replication',
    blocks: [
      { k: 'p', t: 'This topic collects the study methods with actual evidence behind them — not the ones that feel productive, the ones that measurably are.' },
      { k: 'deflist', items: [
        { t: 'Retrieval practice', d: 'Testing yourself beats re-reading every time. The struggle of recall is the mechanism, not a symptom.' },
        { t: 'Spacing', d: 'Reviewing at expanding intervals beats cramming for the same total hours — the forgetting curve is the schedule.' },
        { t: 'Interleaving', d: 'Mixing problem types feels worse and works better. Blocked practice feels fluent; it mostly measures short-term memory.' },
      ]},
      { k: 'p', t: 'The uncomfortable pattern across all of them: the methods that feel hardest during study are the ones that produce the strongest exam performance.' },
    ],
  },
  'Exam Season': {
    h2: 'Surviving the weeks that decide everything',
    blocks: [
      { k: 'p', t: 'Exam season concentrates every failure mode into fourteen days — bad sleep, panic cramming, skipped meals, and the 2 a.m. spiral. These guides are about getting through it intact.' },
      { k: 'steps', items: [
        'Triage honestly — rank topics by marks-available-per-hour, not by what you enjoy reviewing.',
        'Protect sleep — the all-nighter trades tomorrow\'s recall for tonight\'s anxiety.',
        'Simulate exam conditions — timed, closed-book, no notes, real pressure.',
        'Review mistakes, not just answers — the error log is worth more than another pass.',
      ]},
      { k: 'quote', t: 'Nobody ever wishes they had crammed less sleep the night before a final. They wish they had slept.' },
    ],
  },
  'Test Prep': {
    h2: 'Strategy for the gates',
    blocks: [
      { k: 'p', t: 'Standardized tests are games with answer keys — and like all games, they reward players who learn the rules before they learn the material.' },
      { k: 'deflist', items: [
        { t: 'Format first', d: 'Sections, timing, question types, scoring. Knowing the shape of the test changes what "studying" even means.' },
        { t: 'Diagnostic baseline', d: 'A timed practice test before any prep — the score gap tells you where the hours actually go.' },
        { t: 'Pattern libraries', d: 'Most test questions are templates. Learn the templates and unfamiliar questions become familiar fast.' },
      ]},
      { k: 'p', t: 'The guides here go exam by exam — SAT through USMLE — because each test has its own logic, its own traps, and its own version of "high yield."' },
    ],
  },
  'Subject Guides': {
    h2: 'Each discipline has its own physics',
    blocks: [
      { k: 'p', t: 'Studying biology and studying history are not the same activity wearing different content. These guides match the method to the discipline.' },
      { k: 'deflist', items: [
        { t: 'Quantitative subjects', d: 'Math, physics, statistics, engineering — problems first, theory in service of solving them.' },
        { t: 'Narrative subjects', d: 'History, literature, art history — timelines, arguments, and the discipline\'s own story.' },
        { t: 'Framework subjects', d: 'Economics, psychology, business — models and lenses applied to cases, not facts to memorize.' },
        { t: 'Memory-heavy subjects', d: 'Anatomy, medicine, law — volume managed through systems, cards, and retrieval schedules.' },
      ]},
      { k: 'p', t: 'Pick the guide for your course, steal the method, and adapt it — the best study system is the one you will actually run in week six.' },
    ],
  },
  'Focus': {
    h2: 'Attention is a resource, not a mood',
    blocks: [
      { k: 'p', t: 'You cannot willpower your way to deep focus — the research is clear that environment, timing, and task design do more work than discipline ever will.' },
      { k: 'deflist', items: [
        { t: 'Environment', d: 'The desk, the lighting, the notifications — friction is a feature. Make the bad option hard and the good option easy.' },
        { t: 'Time-boxing', d: 'A defined start and end lowers the activation energy of starting. The timer holds the boundary so willpower does not have to.' },
        { t: 'Task clarity', d: '"Study chemistry" is not a task. "Finish problem set 4, questions 1–10" is. Vague tasks invite negotiation; specific tasks invite execution.' },
      ]},
      { k: 'quote', t: 'Focus is not the absence of distraction. It is the presence of a task small enough to complete.' },
    ],
  },
  'Routines': {
    h2: 'What a study routine is actually for',
    blocks: [
      { k: 'p', t: 'A routine is not about productivity — it is about removing decisions. Every "should I study now?" you never have to answer is willpower you get back for the work itself.' },
      { k: 'p', t: 'The guides here treat routines as infrastructure: weekly grids, morning blocks, review rituals, and the honest question of what to do when the routine breaks — because it will.' },
      { k: 'deflist', items: [
        { t: 'Minimum viable week', d: 'The smallest routine that still moves every course forward — build from there, not from an idealized 40-hour fantasy.' },
        { t: 'Recovery rules', d: 'What happens after a missed day matters more than the streak. Routines survive because they bend, not because they never break.' },
      ]},
    ],
  },
  'Flashcards': {
    h2: 'Cards are retrieval practice you can hold',
    blocks: [
      { k: 'p', t: 'Flashcards are the purest form of the most evidence-backed study technique: closed-book recall, graded honestly, scheduled by forgetting.' },
      { k: 'deflist', items: [
        { t: 'Good cards', d: 'Atomic — one fact per card. Precise — no "kinda." Honest — you can actually fail them.' },
        { t: 'Bad cards', d: 'Paragraphs, multiple facts, or questions you can answer without knowing the material. A card you never miss teaches nothing.' },
        { t: 'Scheduling', d: 'Spaced repetition expands the interval when you succeed and contracts it when you fail — the deck manages its own difficulty.' },
      ]},
      { k: 'p', t: 'The guides here cover deck design, card-writing craft, and pairing cardfiles with notes so the cards test what the notes actually teach.' },
    ],
  },
  'Notes': {
    h2: 'Notes are a retrieval system, not an archive',
    blocks: [
      { k: 'p', t: 'Most notes fail at the only job that matters: being useful during review. A beautiful notebook you never open again is a diary, not a study tool.' },
      { k: 'deflist', items: [
        { t: 'Findability', d: 'Notes you cannot find do not exist. Tags, links, and consistent structure beat elaborate formatting every time.' },
        { t: 'Generative notes', d: 'Writing in your own words — paraphrase, examples, connections — builds memory. Copying slides verbatim builds a filing cabinet.' },
        { t: 'The review loop', d: 'Notes feed flashcards, flashcards feed exams. A note that never becomes a question never becomes knowledge.' },
      ]},
      { k: 'quote', t: 'The best note-taking system is the one you will actually open during finals week. Everything else is decoration.' },
    ],
  },
  'Planning': {
    h2: 'Planning is a negotiation with reality',
    blocks: [
      { k: 'p', t: 'A study plan that ignores your actual life — job hours, sleep needs, the fact that you are a person — is a wish, not a plan. These guides plan for the student you are, not the one you should be.' },
      { k: 'deflist', items: [
        { t: 'Time blocking', d: 'Assigning subjects to specific hours turns "I should study" into "it is 2–4, chemistry." Decisions made once, honored daily.' },
        { t: 'Buffer honestly', d: 'Plans fail at the edges — sick days, group projects, the assignment you forgot. A plan with no slack is a plan that shatters at the first surprise.' },
        { t: 'Review the plan', d: 'Sunday planning that ignores what actually happened last week repeats last week\'s mistakes with better formatting.' },
      ]},
    ],
  },
  'Privacy & Ownership': {
    h2: 'Your study data is yours',
    blocks: [
      { k: 'p', t: 'Notes, decks, and grades are years of intellectual work. Whether they live in a format you can export — or a platform that can hold them hostage — is a real decision.' },
      { k: 'deflist', items: [
        { t: 'Local-first', d: 'Files on your disk, sync optional. The app can disappear; your work should not.' },
        { t: 'Export paths', d: 'Plain-text and open formats outlive proprietary ones. If the export is a PDF, you have an archive, not a backup.' },
        { t: 'No lock-in', d: 'A tool that makes leaving painful is a tool that will eventually raise prices.' },
      ]},
      { k: 'quote', t: 'The best study software is the kind you forget is there — it just holds your work and gets out of the way.' },
    ],
  },
  'Language Learning': {
    h2: 'Languages are acquired, not assembled',
    blocks: [
      { k: 'p', t: 'You cannot study your way to fluency the way you study for a chemistry exam. Language is a skill — closer to learning an instrument than memorizing a textbook.' },
      { k: 'deflist', items: [
        { t: 'Comprehensible input', d: 'Material slightly above your level — not too easy, not drowning. The sweet spot where guessing becomes learning.' },
        { t: 'Vocabulary in context', d: 'Words learned in sentences stick; words learned in lists evaporate. The card carries the example, not just the definition.' },
        { t: 'Output practice', d: 'Speaking and writing force the gaps in your knowledge to show themselves — which is exactly where learning happens.' },
      ]},
      { k: 'p', t: 'The guides here treat language learning as a years-long practice with weekly structure — not a semester of flashcards.' },
    ],
  },
  'Study Skills': {
    h2: 'The meta-skills underneath everything',
    blocks: [
      { k: 'p', t: 'Before the subject guides and the exam strategies, there are the cross-cutting skills: speed, recovery, collaboration, and knowing when to stop.' },
      { k: 'deflist', items: [
        { t: 'Speed', d: 'Writing faster, reading faster, solving faster — skills that compound across every course you will ever take.' },
        { t: 'Recovery', d: 'Burnout is not a character flaw; it is a system failure. The fix is structural, not motivational.' },
        { t: 'Groups', d: 'Study groups fail by default — they work when roles, preparation, and accountability are designed in.' },
      ]},
      { k: 'p', t: 'These are the guides for the problems that do not fit neatly into one subject — the ones every student hits eventually.' },
    ],
  },
  'Writing': {
    h2: 'Writing is thinking you can see',
    blocks: [
      { k: 'p', t: 'Most writing guides teach grammar. The useful ones teach throughput — how to get ideas out of your head and onto the page before the deadline does it for you.' },
      { k: 'deflist', items: [
        { t: 'Drafting speed', d: 'The first draft is for volume, not quality. Editing is a separate skill with its own session.' },
        { t: 'Argument structure', d: 'Claim, evidence, analysis, link — the skeleton that turns notes into an essay.' },
        { t: 'Research process', d: 'The question drives the sources, not the other way around. Searching before thinking produces citation-shaped padding.' },
      ]},
      { k: 'quote', t: 'A bad first draft is a solved problem. A blank page is not.' },
    ],
  },
};

export const TOPIC_PAGES = (() => {
  const map = new Map();
  for (const g of GUIDES) {
    if (!map.has(g.kicker)) map.set(g.kicker, []);
    map.get(g.kicker).push(g);
  }
  return [...map.entries()]
    .map(([kicker, guides]) => ({
      kicker,
      slug: topicSlug(kicker),
      guides,
      note: TOPIC_NOTES[kicker] || '',
    }))
    .filter((t) => t.guides.length >= 3);
})();

const TOPIC_PAGE_SLUGS = new Set(TOPIC_PAGES.map((t) => t.slug));
const topicHref = (kicker) =>
  TOPIC_PAGE_SLUGS.has(topicSlug(kicker)) ? `/topics/${topicSlug(kicker)}` : `/guides#topic-${topicSlug(kicker)}`;

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
  const topics = [];
  for (const g of GUIDES) {
    let t = topics.find((x) => x.k === g.kicker);
    if (!t) {
      t = { k: g.kicker, items: [] };
      topics.push(t);
    }
    t.items.push(g);
  }
  const topicNav =
    topics.length > 4
      ? `<nav class="topic-nav" aria-label="Guide topics">${topics
          .map((t) => `<a href="#topic-${topicSlug(t.k)}">${esc(t.k)}</a>`)
          .join('')}</nav>`
      : '';
  const PICKS = ['plan-a-semester', 'spaced-repetition-explained', 'how-to-study-for-finals-week'];
  const picksHtml = PICKS.map((slug) => GUIDES.find((g) => g.slug === slug))
    .filter(Boolean)
    .map(
      (g) => `<a class="pick" href="/guides/${g.slug}"><span class="pk mono">Start here</span><span class="pt">${esc(g.title.replace(/<\/?em>/g, ''))}</span><span class="pd">${esc(g.description.split('.')[0])}.</span><span class="pm">${dateFmt(g.datePublished)} · ${g.readMinutes} min</span></a>`,
    )
    .join('\n');
  const cards = topics
    .map((t) => {
      const lis = t.items
        .map(
          (g, i) =>
            `<li${i >= 8 ? ' hidden' : ''}><a href="/guides/${g.slug}"><span class="k mono"><time datetime="${g.datePublished}">${dateFmt(g.datePublished)}</time> · ${g.readMinutes} min read</span><span class="t">${esc(g.title.replace(/<\/?em>/g, ''))}</span><span class="d">${esc(g.description.split('.')[0])}.</span></a></li>`,
        )
        .join('\n');
      const moreBtn =
        t.items.length > 8
          ? `<button class="rows-more mono" type="button" data-more>Show all ${t.items.length} guides</button>`
          : '';
      return `<h3 class="topic" id="topic-${topicSlug(t.k)}">${TOPIC_PAGE_SLUGS.has(topicSlug(t.k)) ? `<a class="topic-link" href="/topics/${topicSlug(t.k)}">${esc(t.k)} · ${t.items.length}</a>` : `${esc(t.k)} · ${t.items.length}`}</h3>${TOPIC_NOTES[t.k] ? `<p class="topic-d">${esc(TOPIC_NOTES[t.k])}</p>` : ''}<ul class="rows">${lis}</ul>${moreBtn}`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#f7f5ec" />
<title>Study Guides — How to Learn Better | Iterra</title>
<meta name="description" content="${esc(metaDesc('Practical, research-backed guides to studying better: semester planning, spaced repetition, active recall, pomodoro, time blocking, finals week, and more — plus the free tools that make it stick.'))}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Iterra" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="Iterra Study Guides — How to Learn Better" />
<meta property="og:description" content="Research-backed guides to studying better, from semester planning to spaced repetition." />
<meta property="og:image" content="${SITE}/og/guides.png" />
<link rel="alternate" type="application/rss+xml" title="Iterra Guides" href="/feed.xml" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Iterra Study Guides — How to Learn Better" />
<meta name="twitter:description" content="Research-backed guides to studying better." />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
${FONTS}
<style>${CSS}</style>
${jsonLd(ld)}
</head>
<body>
${header('/guides')}
<section class="hero"><div class="wrap">
${crumbs([{ label: 'Iterra', href: '/' }, { label: 'Guides' }])}
<div class="kicker mono">Iterra Guides</div>
<h1>Study better, <em>with evidence</em></h1>
<p class="lede">Practical guides to the methods that actually work — planning, memory, focus, and the tools that make them stick. No productivity fluff; just what the research supports and what students actually need.</p>
<div class="stats hero-stats">
<div class="stat"><span class="v">${GUIDES.length}</span><span class="l">Guides, all free</span></div>
<div class="stat"><span class="v">~${Math.round(GUIDES.reduce((a, g) => a + (g.readMinutes || 8), 0) / 60 * 10) / 10} hrs</span><span class="l">Total reading time</span></div>
<div class="stat"><span class="v">${TOOLS.length}</span><span class="l">Tools to put them to work</span></div>
</div>
</div></section>
<div class="wrap">
<section class="block">
<h2 class="sec mono">Start here</h2>
<div class="picks">
${picksHtml}
</div>
</section>
<section class="block">
<h2 class="sec mono">Browse the guides</h2>
<p class="read-count mono" data-read-count data-total="${GUIDES.length}" hidden></p>
${topicNav}
${cards}
<div class="cta" style="margin-top:2.5rem">
<a class="primary" href="/#/today">Open the workspace →</a>
<a class="ghost" href="/tools">All tools</a>
<a class="ghost" href="/topics">Browse by topic</a>
<a class="ghost" href="/feed.xml">RSS feed</a>
</div>
</section>
</div>
${footer()}
</body>
</html>
`;
}

export function renderTopicPage(topic) {
  const url = `${SITE}/topics/${topic.slug}`;
  const ti = TOPIC_PAGES.findIndex((t) => t.slug === topic.slug);
  const tPrev = TOPIC_PAGES[(ti - 1 + TOPIC_PAGES.length) % TOPIC_PAGES.length];
  const tNext = TOPIC_PAGES[(ti + 1) % TOPIC_PAGES.length];
  const topicPager = TOPIC_PAGES.length > 1
    ? `<nav class="pager" aria-label="More topics">
<a href="/topics/${tPrev.slug}"><span class="dir">← ${esc(tPrev.kicker)}</span><span class="t">${tPrev.guides.length} guides</span></a>
<a class="next" href="/topics/${tNext.slug}"><span class="dir">${esc(tNext.kicker)} →</span><span class="t">${tNext.guides.length} guides</span></a>
</nav>`
    : '';
  const rows = topic.guides
    .map(
      (g) => `<li><a href="/guides/${g.slug}"><span class="k mono"><time datetime="${g.datePublished}">${dateFmt(g.datePublished)}</time> · ${g.readMinutes} min read</span><span class="t">${esc(g.title.replace(/<\/?em>/g, ''))}</span><span class="d">${esc(g.description.split('.')[0])}.</span></a></li>`,
    )
    .join('\n');
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: `${topic.kicker} study guides — Iterra`,
        description: topic.note || `Iterra guides on ${topic.kicker.toLowerCase()}.`,
        url,
        isPartOf: { '@type': 'WebSite', name: 'Iterra', url: `${SITE}/` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Iterra', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/guides` },
          { '@type': 'ListItem', position: 3, name: topic.kicker, item: url },
        ],
      },
      {
        '@type': 'ItemList',
        itemListElement: topic.guides.map((g, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: g.title.replace(/<\/?em>/g, ''),
          url: `${SITE}/guides/${g.slug}`,
        })),
      },
    ],
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#f7f5ec" />
<title>${esc(topic.kicker)} Study Guides — Iterra</title>
<meta name="description" content="${esc(metaDesc(`${topic.note || `Iterra guides on ${topic.kicker.toLowerCase()}.`} ${topic.guides.length} articles, all free.`))}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Iterra" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(topic.kicker)} Study Guides — Iterra" />
<meta property="og:description" content="${esc(topic.note || '')}" />
<meta property="og:image" content="${SITE}/og/topic-${topic.slug}.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="alternate" type="application/rss+xml" title="Iterra Guides" href="/feed.xml" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
${FONTS}
<style>${CSS}</style>
${jsonLd(ld)}
</head>
<body>
${header('/guides')}
<section class="hero"><div class="wrap">
${crumbs([{ label: 'Iterra', href: '/' }, { label: 'Guides', href: '/guides' }, { label: topic.kicker }])}
<div class="kicker mono">Iterra Guides · ${esc(topic.kicker)}</div>
<h1>${esc(topic.kicker)} <em>guides.</em></h1>
<p class="lede">${esc(topic.note || `Every Iterra guide filed under ${topic.kicker.toLowerCase()} — practical, research-backed, and free.`)}</p>
<div class="stats hero-stats">
<div class="stat"><span class="v">${topic.guides.length}</span><span class="l">Guides in this topic</span></div>
<div class="stat"><span class="v">~${Math.round(topic.guides.reduce((a, g) => a + (g.readMinutes || 8), 0) / 60 * 10) / 10} hrs</span><span class="l">Total reading time</span></div>
</div>
</div></section>
<div class="wrap">
${TOPIC_SECTIONS[topic.kicker] ? `<section class="block">
<h2 class="sec mono">${esc(TOPIC_SECTIONS[topic.kicker].h2)}</h2>
<div class="prose">${renderBlocks(TOPIC_SECTIONS[topic.kicker].blocks)}</div>
</section>` : ''}
<section class="block" style="border-bottom:none">
<ul class="rows">
${rows}
</ul>
<div class="cta" style="margin-top:2.5rem">
<a class="primary" href="/guides">All guides</a>
<a class="ghost" href="/topics">All topics</a>
<a class="ghost" href="/feed.xml">RSS feed</a>
</div>
${topicPager}
</section>
</div>
${footer()}
</body>
</html>
`;
}

export function renderTopicsIndex() {
  const url = `${SITE}/topics`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Study guide topics — Iterra',
        description: 'Iterra guide collections by topic — test prep, subject guides, study skills, and exam season.',
        url,
        isPartOf: { '@type': 'WebSite', name: 'Iterra', url: `${SITE}/` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Iterra', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/guides` },
          { '@type': 'ListItem', position: 3, name: 'Topics', item: url },
        ],
      },
    ],
  };
  const cards = TOPIC_PAGES.map(
    (t) => `<li><a href="/topics/${t.slug}"><span class="k mono">${t.guides.length} guides</span><span class="t">${esc(t.kicker)}</span><span class="d">${esc(t.note || '')}</span></a></li>`,
  ).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#f7f5ec" />
<title>Study Guides by Topic — Iterra</title>
<meta name="description" content="Iterra study guides organized by topic — test prep, subject guides, study skills, and exam season. ${GUIDES.length} articles, all free." />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Iterra" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="Study Guides by Topic — Iterra" />
<meta property="og:description" content="Iterra study guides organized by topic." />
<meta property="og:image" content="${SITE}/og/topics.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
${FONTS}
<style>${CSS}</style>
${jsonLd(ld)}
</head>
<body>
${header('/guides')}
<section class="hero"><div class="wrap">
${crumbs([{ label: 'Iterra', href: '/' }, { label: 'Guides', href: '/guides' }, { label: 'Topics' }])}
<div class="kicker mono">Iterra Guides</div>
<h1>Browse by <em>topic.</em></h1>
<p class="lede">The guides, grouped the way students actually look for them — by the test they’re facing or the subject they’re drowning in.</p>
</div></section>
<div class="wrap">
<section class="block" style="border-bottom:none">
<ul class="rows">
${cards}
</ul>
<div class="cta" style="margin-top:2.5rem">
<a class="primary" href="/guides">All guides</a>
<a class="ghost" href="/feed.xml">RSS feed</a>
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
    (t) => `<li><a href="${t.path}"><span class="k mono">${esc(t.kicker)} · updated ${dateFmt(t.updated)}</span><span class="t">${esc(t.name)}</span><span class="d">${esc(t.lede.split('.')[0])}.</span></a></li>`,
  ).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#f7f5ec" />
<title>Iterra Study Tools — Planner, Flashcards, Notes, Timer & More</title>
<meta name="description" content="${esc(metaDesc('Nine study tools in one local-first workspace: time-blocking planner, spaced-repetition flashcards, linked notes, pomodoro timer, math workbench, attendance, grading, and study materials.'))}" />
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
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
${FONTS}
<style>${CSS}</style>
${jsonLd(ld)}
</head>
<body>
${header('/tools')}
<section class="hero"><div class="wrap">
${crumbs([{ label: 'Iterra', href: '/' }, { label: 'Tools' }])}
<div class="kicker mono">The terrain</div>
<h1>Nine tools. <em>One study workspace.</em></h1>
<p class="lede">Iterra gives every course a place. Plan the week, review the cards, write the notes, run the timer, work the math — all local-first, all connected.</p>
<div class="stats hero-stats">
<div class="stat"><span class="v">${TOOLS.length}</span><span class="l">Places, one workspace</span></div>
<div class="stat"><span class="v">0</span><span class="l">Accounts required</span></div>
<div class="stat"><span class="v">${TOOLS.reduce((a, t) => a + (t.features || []).length, 0)}</span><span class="l">Features across the terrain</span></div>
</div>
</div></section>
<div class="wrap">
<figure class="plate">
<div class="frame"><img src="/shots/boxed.webp" alt="Iterra's time-blocking planner — the Boxed place" width="1440" height="900" loading="eager" fetchpriority="high" decoding="async" /></div>
</figure>
<section class="block">
<h2 class="sec mono">How the pieces fit together</h2>
<div class="prose">${renderBlocks([
  { k: 'p', t: 'Most study apps give you one tool and a login wall. Iterra gives you a workspace — the tools share courses, decks, notes and schedules, so the plan you make in the morning is the deck you review at night.' },
  { k: 'deflist', items: [
    { t: 'Plan', d: 'Boxed holds the week, Syllabus holds the semester, Rhythm holds the habits — the when and how often.' },
    { t: 'Learn', d: 'Flashcards holds the recall, Ink holds the understanding, Margin holds the source material — the what.' },
    { t: 'Measure', d: 'Timer holds the sessions, GradeStack holds the scores, Proof holds the problem-solving — the proof it worked.' },
  ]},
  { k: 'p', t: 'Everything lives on your device by default. No account, no subscription, no export anxiety — your study data is a folder, not a hostage.' },
])}</div>
</section>
<section class="block" style="border-bottom:none">
<h2 class="sec mono">Choose your place</h2>
<ul class="rows">
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

function compareHead({ title, description, url, image, published, modified, keywords }) {
  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDesc(description))}" />
${keywords?.length ? `<meta name="keywords" content="${esc(keywords.join(', '))}" />` : ''}
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
${published ? `<meta property="article:published_time" content="${published}" />\n<meta property="article:modified_time" content="${modified || published}" />` : ''}
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
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
${FONTS}
<style>${CSS}</style>`;
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
      datePublished: page.datePublished,
      dateModified: page.dateModified || page.datePublished,
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
    ...(page.kind === 'vs'
      ? [
          {
            '@type': 'SoftwareApplication',
            name: 'Iterra',
            url: `${SITE}/`,
            applicationCategory: 'EducationalApplication',
            operatingSystem: 'Web browser',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            description: 'Free, local-first study workspace — planner, notes, flashcards, timer, and grader in one place.',
          },
        ]
      : []),
    ...extra,
  ];
  return { '@context': 'https://schema.org', '@graph': graph };
}

function tldrOf(html, max = 240) {
  const plain = String(html).replace(/<[^>]+>/g, '');
  const cut = plain.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 80 ? cut.slice(0, end + 1).trim() : `${cut.replace(/[,;:—–-]\s*\S*$/, '')}…`;
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
  const rivalChip =
    page.section === 'compare' && page.rival && page.rival !== 'roundup' && page.rival !== 'generic planners'
      ? page.rival
      : null;
  const matchupHtml = rivalChip
    ? `<div class="matchup"><span class="chip us">Iterra</span><span class="vs mono">vs</span><span class="chip">${esc(rivalChip)}</span></div>`
    : '';
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
    ? `<section class="block" id="faq">
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

  const cReadMin = Math.max(1, Math.round(
    ((page.lede || '') + (page.verdict || '') + JSON.stringify(page.table || '') + JSON.stringify(page.sections || '') +
      (page.faqs || []).map((f) => f.q + ' ' + f.a).join(' ') + (page.iterraWins || []).join(' ') + (page.rivalWins || []).join(' ')).length / 800,
  ));
  /* rotate the same three hero treatments used on guide articles */
  const cIdx = COMPARE_PAGES.indexOf(page);
  const cVariant = ((cIdx % 3) + 3) % 3;
  const cCopy = `${crumbs([{ label: 'Iterra', href: '/' }, { label: base === 'compare' ? 'Compare' : 'Alternatives', href: `/${base}` }, { label: String(page.h1).replace(/<\/?em>/g, '') }])}
<div class="kicker mono">${esc(page.kicker)} · Iterra terrain</div>
<h1>${emH1(page.h1)}</h1>
<p class="lede">${esc(page.lede)}</p>
${matchupHtml}
${factHtml}
<div class="meta-row"><span>${dateFmt(page.datePublished)}</span>${page.dateModified && page.dateModified !== page.datePublished ? `<span>Updated ${dateFmt(page.dateModified)}</span>` : ''}<span>${cReadMin} min read</span><span><a href="/${base}">All ${base === 'compare' ? 'comparisons' : 'alternatives'}</a></span></div>`;
  const cFig = `<div class="frame"><img src="${COMPARE_SHOT}" alt="The Iterra study workspace" width="1440" height="900" loading="eager" fetchpriority="high" decoding="async" /></div>`;
  const cHeroHtml =
    cVariant === 1
      ? `<section class="hero hero-split"><div class="wrap"><div class="hero-grid"><div class="hero-copy">${cCopy}</div><figure class="hero-fig">${cFig}</figure></div></div></section>`
      : `<section class="hero${cVariant === 2 ? ' hero-center' : ''}"><div class="wrap">${cCopy}</div></section>`;
  /* jump-chip wayfinding for the now-longer decision pages */
  const cChips = [
    ['at-a-glance', 'At a glance'],
    ['honest-split', 'The honest split'],
    ...(page.sections || []).map((s, i) => [`section-${i + 1}`, s.h2]),
    ['verdict', 'The verdict'],
    ...(page.faqs?.length ? [['faq', 'Questions']] : []),
  ];
  const cTocHtml =
    cChips.length >= 4
      ? `<nav class="ctoc" aria-label="On this page">${cChips
          .map(([id, label]) => `<a href="#${id}">${esc(String(label).replace(/<[^>]+>/g, ''))}</a>`)
          .join('')}</nav>`
      : '';
  const cCoverHtml = cVariant === 1 ? '' : `<figure class="plate">${cFig}</figure>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#f7f5ec" />
${compareHead({
    title: page.title,
    description: page.description,
    url,
    image: `${SITE}/og/${page.section}-${slug}.png`,
    published: page.datePublished,
    modified: page.dateModified,
    keywords:
      page.section === 'compare' && page.rival && !['roundup', 'generic planners'].includes(page.rival)
        ? [`iterra vs ${page.rival.split(' (')[0]}`, `${page.rival.split(' (')[0]} alternative`, 'study app comparison', 'student productivity apps']
        : page.rival && page.rival !== 'roundup'
          ? [`${page.rival.split(' (')[0]} alternative`, 'best study apps', 'free study planner', 'student productivity apps']
          : ['best study apps', 'study app comparison', 'quizlet alternative', 'notion alternative for students'],
  })}
${jsonLd(ld)}
</head>
<body>
${header(`/${base}/${slug}`)}
${cHeroHtml}
<div class="wrap compare-body">
${cCoverHtml}
${cTocHtml}
<aside class="tldr"><span class="tk mono">In short</span><p>${esc(tldrOf(page.verdict))}</p></aside>
<section class="block" id="at-a-glance">
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
<section class="block" id="honest-split">
<h2 class="sec mono">The honest split</h2>
${winsHtml}
</section>
${(page.sections || [])
  .map(
    (s, i) => `<section class="block" id="section-${i + 1}"><h2 class="sec mono">${esc(s.h2)}</h2><div class="prose">${renderBlocks(s.blocks)}</div></section>`,
  )
  .join('\n')}
<section class="block" id="verdict">
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
      (p) => `<li><a href="/${base}/${p.slug}"><span class="k mono">${p.datePublished ? dateFmt(p.datePublished) : ''}</span><span class="t">${esc(p.h1.replace(/<\/?em>/g, ''))}</span><span class="d">${esc(p.description)}</span></a></li>`,
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
<meta name="theme-color" content="#f7f5ec" />
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
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
${FONTS}
<style>${CSS}</style>
${jsonLd(ld)}
</head>
<body>
${header('/compare')}
<section class="hero"><div class="wrap">
${crumbs([{ label: 'Iterra', href: '/' }, { label: 'Compare' }])}
<div class="kicker mono">Head-to-head</div>
<h1>Compare <em>honestly.</em></h1>
<p class="lede">Every comparison below admits where the other tool wins — because a comparison you can’t trust is just an ad. These are written by the people who make Iterra, and they say so.</p>
<div class="stats hero-stats">
<div class="stat"><span class="v">${COMPARE_PAGES.filter((p) => p.section === 'compare').length}</span><span class="l">Head-to-head</span></div>
<div class="stat"><span class="v">${COMPARE_PAGES.filter((p) => p.section === 'alternatives').length}</span><span class="l">Alternatives</span></div>
<div class="stat"><span class="v">0</span><span class="l">Sponsored picks</span></div>
</div>
</div></section>
<div class="wrap">
<figure class="plate">
<div class="frame"><img src="${COMPARE_SHOT}" alt="The Iterra study workspace" width="1440" height="900" loading="eager" fetchpriority="high" decoding="async" /></div>
</figure>
<section class="block">
<h2 class="sec mono">How to read these</h2>
<div class="prose">${renderBlocks([
  { k: 'p', t: 'Each comparison below follows the same honest structure: what the other tool does well, where Iterra genuinely wins, and a verdict for specific kinds of students — not a universal claim that one tool wins everything.' },
  { k: 'deflist', items: [
    { t: 'The wins grid', d: 'Every page lists where the competitor comes out ahead. If a page has nothing in that column, it is not a real comparison.' },
    { t: 'The verdict', d: 'Written for a reader, not a search engine — "pick Notion if…" is more useful than "Iterra wins."' },
    { t: 'The caveats', d: 'Price, privacy, offline use and platform limits are called out where they matter, not buried in fine print.' },
  ]},
  { k: 'quote', t: 'A comparison you can’t trust is just an ad. These are written by the people who make Iterra — and they say so.' },
])}</div>
</section>
<section class="block" style="border-bottom:none">
<h2 class="sec mono">Iterra vs the tools you know</h2>
<ul class="rows">
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
<meta name="theme-color" content="#f7f5ec" />
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
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
${FONTS}
<style>${CSS}</style>
${jsonLd(ld)}
</head>
<body>
${header('/alternatives')}
<section class="hero"><div class="wrap">
${crumbs([{ label: 'Iterra', href: '/' }, { label: 'Alternatives' }])}
<div class="kicker mono">Way out</div>
<h1>Outgrew the <em>app?</em></h1>
<p class="lede">Every study app here was built to do one thing well. When one thing isn't enough anymore, these are the honest exits — including ours, and when it isn't the right one.</p>
<div class="stats hero-stats">
<div class="stat"><span class="v">${pages.length}</span><span class="l">Honest comparisons</span></div>
<div class="stat"><span class="v">5</span><span class="l">Selection criteria</span></div>
<div class="stat"><span class="v">${TOOLS.length}</span><span class="l">Places in Iterra</span></div>
</div>
</div></section>
<div class="wrap">
<figure class="plate">
<div class="frame"><img src="/shots/flashcards.webp" alt="Iterra flashcards — one of the tools covered in these comparisons" width="1440" height="900" loading="eager" fetchpriority="high" decoding="async" /></div>
</figure>
<section class="block">
<h2 class="sec mono">How these picks were chosen</h2>
<div class="prose">${renderBlocks([
  { k: 'p', t: 'Alternatives pages are where review sites go to hide their affiliate links. These picks were chosen on five criteria that actually matter to students — and Iterra is allowed to lose.' },
  { k: 'deflist', items: [
    { t: 'What it does', d: 'Does the alternative actually solve the problem you are leaving the current app for? A prettier interface is not a feature.' },
    { t: 'What it costs', d: 'Free tier, trial, or subscription — and what happens when the trial ends. The fine print is the product.' },
    { t: 'Where your data lives', d: 'Cloud-locked, exportable, or local-first. Your notes are years of work; portability is not a nice-to-have.' },
    { t: 'Who it is for', d: 'Every pick names its ideal user. If none of them fit you, the honest answer is sometimes "stay where you are."' },
  ]},
])}</div>
</section>
<section class="block" style="border-bottom:none">
<h2 class="sec mono">Picks by what you’re leaving</h2>
${(() => {
  const topics = [];
  for (const p of pages) {
    let t = topics.find((x) => x.kicker === p.kicker);
    if (!t) {
      t = { kicker: p.kicker, k: p.kicker === 'Roundup' ? 'The honest roundup' : 'Alternative picks', items: [] };
      topics.push(t);
    }
    t.items.push(p);
  }
  return topics
    .map((t) => `<h3 class="topic">${esc(t.k)} · ${t.items.length}</h3><ul class="rows">${indexCards(t.items, 'alternatives')}</ul>`)
    .join('\n');
})()}
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

export function renderFeed() {
  const items = GUIDES.map(
    (g) => `  <item>
    <title>${esc(g.title.replace(/<\/?em>/g, ''))}</title>
    <link>${SITE}/guides/${g.slug}</link>
    <guid>${SITE}/guides/${g.slug}</guid>
    <pubDate>${new Date((g.dateModified || g.datePublished) + 'T00:00:00Z').toUTCString()}</pubDate>
    <category>${esc(g.kicker)}</category>
    <description>${esc(g.description)}</description>
  </item>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Iterra Guides — Study Better, With Evidence</title>
  <link>${SITE}/guides</link>
  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
  <description>Practical, research-backed guides to studying better — planning, memory, focus, and the tools that make it stick.</description>
  <language>en-us</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>
`;
}

export function renderLlmsTxt() {
  const toolLines = TOOLS.map(
    (t) => `- [${t.name} — ${t.path}](https://iterrapp.vercel.app${t.path}): ${t.lede.split('.')[0]}.`,
  ).join('\n');
  const guideLines = GUIDES.map(
    (g) => `- [${g.title.replace(/<\/?em>/g, '')}](https://iterrapp.vercel.app/guides/${g.slug})`,
  ).join('\n');
  const cmpLines = COMPARE_PAGES.map(
    (p) => `- [${String(p.h1).replace(/<\/?em>/g, '')}](https://iterrapp.vercel.app/${p.section}/${p.slug})`,
  ).join('\n');
  return `# Iterra

> Iterra is a free, local-first, all-in-one study workspace for students. ${TOOLS.length} tools — time-blocking planner, course planner, habit tracker, spaced-repetition flashcards, linked notes, study material organizer, quiz & bubble-sheet grading, pomodoro/focus timer, and math workbench — unified in one browser-based environment. No account required; data lives on your device unless you choose sync.

Canonical site: https://iterrapp.vercel.app

## Tools

${toolLines}

All tools: https://iterrapp.vercel.app/tools

## Guides

${guideLines}

All guides: https://iterrapp.vercel.app/guides
RSS feed: https://iterrapp.vercel.app/feed.xml

## Guide topics

Index: https://iterrapp.vercel.app/topics

${TOPIC_PAGES.map((t) => `- [${t.kicker} guides](https://iterrapp.vercel.app/topics/${t.slug}): ${t.guides.length} articles`).join('\n')}

## Comparisons & alternatives

${cmpLines}

Sitemap: https://iterrapp.vercel.app/sitemap.xml
`;
}

export function renderSitemap(lastmod = new Date().toISOString().slice(0, 10)) {
  const urls = [
    { loc: `${SITE}/`, priority: '1.0', freq: 'weekly' },
    { loc: `${SITE}/tools`, priority: '0.8', freq: 'weekly' },
    { loc: `${SITE}/guides`, priority: '0.8', freq: 'weekly' },
    { loc: `${SITE}/topics`, priority: '0.7', freq: 'weekly' },
    { loc: `${SITE}/compare`, priority: '0.8', freq: 'weekly' },
    { loc: `${SITE}/alternatives`, priority: '0.8', freq: 'weekly' },
    ...COMPARE_PAGES.map((p) => ({
      loc: `${SITE}/${p.section}/${p.slug}`,
      lastmod: p.dateModified || p.datePublished || lastmod,
      priority: '0.7',
      freq: 'monthly',
    })),
    ...TOOLS.map((t) => ({ loc: `${SITE}${t.path}`, lastmod: t.updated || lastmod, priority: '0.7', freq: 'monthly' })),
    ...GUIDES.map((g) => ({ loc: `${SITE}/guides/${g.slug}`, lastmod: g.dateModified || g.datePublished || lastmod, priority: '0.7', freq: 'monthly' })),
    ...TOPIC_PAGES.map((t) => ({ loc: `${SITE}/topics/${t.slug}`, lastmod, priority: '0.6', freq: 'weekly' })),
  ];
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod || lastmod}</lastmod>
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
  mkdirSync(join(distDir, 'topics'), { recursive: true });
  writeFileSync(join(distDir, 'topics', 'index.html'), renderTopicsIndex());
  for (const topic of TOPIC_PAGES) {
    mkdirSync(join(distDir, 'topics', topic.slug), { recursive: true });
    writeFileSync(join(distDir, 'topics', topic.slug, 'index.html'), renderTopicPage(topic));
  }
  writeFileSync(join(distDir, 'sitemap.xml'), renderSitemap());
  writeFileSync(join(distDir, 'feed.xml'), renderFeed());
  writeFileSync(join(distDir, 'llms.txt'), renderLlmsTxt());
  console.log(`seo: wrote /tools index + ${TOOLS.length} tool pages + /guides index + ${GUIDES.length} guides + /compare + /alternatives indexes + ${COMPARE_PAGES.length} compare pages + sitemap.xml`);
}
