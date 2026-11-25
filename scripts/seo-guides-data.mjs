/* Guide articles — long-form informational content for /guides/*.
   Each entry renders as a static article page with Article JSON-LD.
   Voice: literary but practical — essayistic openings, concrete systems,
   honest about what the evidence does and doesn't say. Every guide links
   into the relevant /tools/* pages; `tools` drives the "Put it to work"
   cards, `related` drives the bottom rail.

   Block types inside a section:
     p        — paragraph (supports **bold**, *italic*, [text](/path))
     ul       — bullet list of strings (same inline markup)
     callout  — gold-ruled aside
     tool     — inline tool card { tool: '<id>' }
*/

export const GUIDES = [
  {
    slug: 'plan-a-semester',
    title: 'How to <em>plan a semester</em> that actually holds',
    seoTitle: 'How to Plan a Semester: A Student’s Complete Guide',
    description:
      'A practical system for planning a semester: read every syllabus, work backwards from deadlines, time-block the recurring work, and leave deliberate slack. Free tools included.',
    kicker: 'The Long View',
    datePublished: '2026-11-25',
    dateModified: '2026-11-25',
    readMinutes: 9,
    keywords: ['how to plan a semester', 'semester planner', 'college schedule planner', 'study schedule'],
    tools: ['syllabus', 'boxed', 'rhythm'],
    related: ['weekly-study-routine', 'time-blocking-for-students', 'how-to-study-for-finals-week'],
    lede: 'Most semesters don’t fail in October. They fail in the first two weeks, when a student mistakes registering for classes with having a plan. A plan is something else: a structure you build once, then let carry you.',
    faq: [
      {
        q: 'When should I start planning my semester?',
        a: 'The first week. Sit down with every syllabus before the add/drop deadline closes. Extract every deadline, exam date, and grading breakdown, then work backwards. Two hours of setup in week one saves the panic of week twelve.',
      },
      {
        q: 'How many hours should I study per week?',
        a: 'The common guideline is two to three hours of independent work per credit hour per week — so a full 15-credit semester means roughly 30–45 hours outside class. Treat that as a budget to allocate, not a number to feel guilty about.',
      },
      {
        q: 'What should I do if I fall behind on my semester plan?',
        a: 'Don’t rebuild the whole plan — repair the next block. Find the earliest upcoming deadline you’re at risk on, shrink it to the smallest useful version, and let the rest of the structure stand. Plans bend; they’re not supposed to shatter.',
      },
    ],
    sections: [
      {
        h2: 'Start with the syllabus, not the schedule',
        blocks: [
          { k: 'p', t: 'The syllabus is the only honest document a course gives you. It tells you what counts, when it counts, and how the grade is assembled. The mistake is filing it away and planning around your memory of it.' },
          { k: 'p', t: 'Spend the first weekend of the term doing extraction, not scheduling. For every course: list every assignment with its due date, every exam with its date, and the grading weights. Then put them all on one page — one calendar, one list, one place. If a course has no syllabus yet, email the professor before you guess.' },
          { k: 'callout', t: 'The extraction step feels bureaucratic. It is the opposite: it’s the moment you stop guessing what the semester asks of you and start answering it.' },
        ],
      },
      {
        h2: 'Work backwards from the deadlines',
        blocks: [
          { k: 'p', t: 'Forward planning says “this week I’ll study biology.” Backward planning says “the midterm is October 14, so the review block lands October 12, and the reading it depends on lands across the two weeks before that.” Deadlines are fixed points; everything else is negotiable.' },
          { k: 'p', t: 'For each major deadline, ask what must exist the day before it: the finished essay needs a draft; the draft needs an outline; the outline needs the readings done. Write the chain backwards until you reach *today*. That chain is your plan — everything else on the calendar is support.' },
        ],
      },
      {
        h2: 'Time-block the recurring work, not just the deadlines',
        blocks: [
          { k: 'p', t: 'Deadlines give you milestones; blocks give you the actual hours. A week of “study chemistry” is a wish. A week with Tuesday 2–4pm and Thursday 7–9pm already named as chemistry blocks is a structure — and structures survive bad days, because you don’t have to decide anything in the moment.' },
          { k: 'ul', items: [
            'Fixed anchors first: classes, work shifts, meals, sleep. Everything else is negotiable.',
            'Then recurring blocks: two or three per course, scheduled at the times you actually have energy.',
            'Then deadline chains: the specific sessions a paper or exam needs, placed backward from its date.',
            'Then buffer: deliberately empty time you don’t assign to anything.',
          ]},
          { k: 'p', t: 'The buffer is not laziness. It’s where the overflow goes when a block runs long, an assignment takes two sessions instead of one, or you simply need a night off. A plan without slack is a plan that breaks on the first surprise.' },
        ],
      },
      {
        h2: 'Leave slack on purpose',
        blocks: [
          { k: 'p', t: 'Budget roughly a quarter of your available study time as unscheduled. It sounds wasteful until you remember what happens without it: the Tuesday block that needs three hours gets squeezed into two, the readings slip, and by week six the whole structure is a memory of intentions.' },
          { k: 'p', t: 'Slack is also where recovery lives. Students who plan every hour often burn out by midterms and call it a character flaw. It isn’t. It’s arithmetic.' },
        ],
      },
      {
        h2: 'Review weekly, not perfectly',
        blocks: [
          { k: 'p', t: 'A semester plan is a living document. Once a week — Sunday evening works for most people — spend fifteen minutes asking three questions: what did I actually do? what’s coming that I haven’t accounted for? what needs to move?' },
          { k: 'p', t: 'The goal of the review isn’t a perfect plan. It’s a plan that’s *true* — one that reflects the semester you’re actually having, not the one you imagined in August.' },
          { k: 'tool', tool: 'syllabus', t: 'Syllabus holds your courses, weekly blocks, and commitments in one folio — the extraction step above is exactly what it’s built for.' },
          { k: 'tool', tool: 'boxed', t: 'When a block arrives, Boxed turns it into a brain-dumped, time-boxed day instead of a vague intention.' },
          { k: 'tool', tool: 'rhythm', t: 'Rhythm keeps the recurring side honest — the study cadence you planned shows up in the register whether you feel like it or not.' },
        ],
      },
      {
        h2: 'The first two weeks decide the rest',
        blocks: [
          { k: 'p', t: 'There’s a reason every guide to surviving college says the same thing: the semester is a system, and systems are easiest to set at the beginning. Two hours of syllabus extraction, one honest look at your real weekly hours, and a structure you’re willing to review — that’s the whole secret. Everything else is just executing it.' },
        ],
      },
    ],
  },

  {
    slug: 'spaced-repetition-explained',
    title: 'Spaced repetition, <em>explained</em> without the jargon',
    seoTitle: 'Spaced Repetition Explained: How the Study Method Works',
    description:
      'What spaced repetition actually is, why it beats cramming, how review intervals expand, and how to use flashcards for language, science, medicine, and law. A clear, honest guide.',
    kicker: 'Study Methods',
    datePublished: '2026-11-25',
    dateModified: '2026-11-25',
    readMinutes: 8,
    keywords: ['spaced repetition', 'what is spaced repetition', 'spaced repetition app', 'how does spaced repetition work'],
    tools: ['flashcards'],
    related: ['flashcard-best-practices', 'active-recall-vs-rereading', 'building-a-weekly-study-routine'],
    lede: 'There is exactly one study technique that decades of research keep ranking at the top, and it fits on an index card. Spaced repetition sounds like a productivity cult phrase. It’s actually older than the printing press — and it works because forgetting is not a failure of memory. It’s the mechanism memory uses to decide what’s worth keeping.',
    faq: [
      {
        q: 'What is the best spaced repetition app?',
        a: 'The best app is the one you’ll actually open daily. Anki is the most powerful and most configurable; Iterra’s Flashcards is simpler and lives inside a full study workspace. Both implement the same core idea — review cards right before you’d forget them.',
      },
      {
        q: 'How long does spaced repetition take to work?',
        a: 'Research shows benefits within days for simple material, but the compounding advantage builds over weeks. A deck reviewed daily for three weeks will outperform the same deck crammed the night before — and the gap grows with the amount of material.',
      },
      {
        q: 'Is spaced repetition good for all subjects?',
        a: 'It’s strongest for factual, definitional, and procedural knowledge — vocabulary, formulas, anatomy, dates, legal rules. For essay-heavy or conceptual subjects, use it alongside practice essays and problem sets rather than instead of them.',
      },
    ],
    sections: [
      {
        h2: 'The forgetting curve, and the loophole in it',
        blocks: [
          { k: 'p', t: 'In 1885, Hermann Ebbinghaus measured his own memory and found something uncomfortable: we forget most of what we learn within days. The curve is steep at first, then flattens — which means the material you review *just as you’re about to lose it* gets remembered far more efficiently than material you review while it’s still fresh.' },
          { k: 'p', t: 'Spaced repetition is the deliberate exploitation of that curve. Instead of reviewing everything on a fixed schedule, you review each item at increasing intervals — minutes, then days, then weeks, then months — always hitting the edge of forgetting. Each successful recall at the edge of loss strengthens the memory more than ten reviews while it’s still easy.' },
        ],
      },
      {
        h2: 'Why it works: the two mechanisms underneath',
        blocks: [
          { k: 'p', t: 'Two well-established findings do the heavy lifting. The first is the *testing effect*: retrieving a memory is itself a learning event, and it produces stronger retention than re-exposing yourself to the material. The second is *spacing*: distributing practice across time beats massing it, a result so robust it’s been replicated for over a century.' },
          { k: 'p', t: 'Spaced repetition combines them. Every review is a retrieval attempt, and the algorithm spaces those attempts at the moment retrieval is hardest-but-still-possible. It’s difficulty calibrated to be productive rather than punishing — what researchers call a *desirable difficulty*.' },
          { k: 'callout', t: 'Cramming is a loan against your future self. Spaced repetition is the same material paid in small installments — and the interest rate is dramatically lower.' },
        ],
      },
      {
        h2: 'How the schedule actually works',
        blocks: [
          { k: 'p', t: 'Most systems grade each review on a four-point scale — something like *again / hard / good / easy*. Recall instantly and the interval expands (say, one day becomes three, then a week). Fumble and the card resets to a short interval. The schedule is personal: cards you know well drift out to months, cards you struggle with stay frequent until they don’t.' },
          { k: 'p', t: 'The result is counterintuitive: the cards that appear most often are the ones you’re *closest* to remembering, not the ones you’ve forgotten. The system spends your time exactly where forgetting is about to happen.' },
          { k: 'ul', items: [
            'New cards enter at a moderate frequency — a few dozen a day beats a hundred.',
            'Reviews cluster into short daily sessions; ten minutes daily beats an hour weekly.',
            'Cards you’ve seen twenty times eventually graduate to monthly or longer.',
          ]},
        ],
      },
      {
        h2: 'What actually belongs on a card',
        blocks: [
          { k: 'p', t: 'Spaced repetition amplifies whatever you put into it — including bad cards. The craft matters more than the algorithm.' },
          { k: 'ul', items: [
            'One idea per card. "List the cranial nerves" is five cards pretending to be one.',
            'Phrase the front as a question that requires *recall*, not recognition. "Which lobe controls vision?" beats "The occipital lobe controls: a) vision b) hearing…" — multiple choice tests recognition; recall is what exams and life actually demand.',
            'Use cloze deletions for facts embedded in sentences: "Mitosis produces {{two}} genetically identical cells."',
            'Attach images where the picture *is* the concept — anatomy, diagrams, maps.',
            'Never put a list on the front. Lists belong in the answer, or better, split into atomic cards.',
          ]},
          { k: 'p', t: 'If you want the full craft, the [flashcard best practices](/guides/flashcard-best-practices) guide goes deeper.' },
        ],
      },
      {
        h2: 'Where it fails — honestly',
        blocks: [
          { k: 'p', t: 'Spaced repetition doesn’t teach understanding, and it can’t replace practice. Cards will get vocabulary into long-term memory beautifully; they won’t teach you to *use* the vocabulary in an essay. Pair decks with problem sets, essays, and explaining things out loud.' },
          { k: 'p', t: 'It also fails when it’s treated as a binge activity — a thousand new cards the night before an exam is just cramming with extra steps. The method only works if the daily sessions actually happen. That’s a routine problem, not a knowledge problem, which is why the best flashcard apps make "what’s due" impossible to ignore.' },
          { k: 'tool', tool: 'flashcards', t: 'Iterra’s Flashcards keeps decks, spaced scheduling, quizzes, and writing drills in one place — and tells your Today view exactly what’s due.' },
        ],
      },
      {
        h2: 'The short version',
        blocks: [
          { k: 'p', t: 'Spaced repetition is forgetting, harnessed. Review material at the edge of loss, grade your recall honestly, and let the intervals expand. Do it daily, keep cards atomic, and use it for the facts that need to be *automatic* — then spend your deeper thinking on everything else.' },
        ],
      },
    ],
  },

  {
    slug: 'pomodoro-technique-for-deep-study',
    title: 'The pomodoro technique for <em>deep study</em>',
    seoTitle: 'Pomodoro Technique for Studying: Does It Work? Honest Guide',
    description:
      'How the pomodoro technique works, what the research actually says (it’s more honest than the hype), how to adapt the intervals for studying, and when a rigid timer hurts more than it helps.',
    kicker: 'Focus',
    datePublished: '2026-11-25',
    dateModified: '2026-11-25',
    readMinutes: 8,
    keywords: ['pomodoro technique', 'pomodoro for studying', 'focus timer', 'study breaks'],
    tools: ['timer'],
    related: ['time-blocking-for-students', 'weekly-study-routine', 'active-recall-vs-rereading'],
    lede: 'The pomodoro technique is the most famous time-management method ever invented by a man with a tomato-shaped kitchen timer. It’s also, depending on which study you read, either a productivity miracle or a placebo. Both are wrong. Here’s what it actually does — and how to use it without letting the timer run your life.',
    faq: [
      {
        q: 'Is 25 minutes the optimal study interval?',
        a: 'No — the research suggests the specific number matters less than the structure. Fixed, short work intervals with real breaks beat self-regulated breaks for most students. 25/5 is a good default; deep work often needs 45–90 minute blocks. The timer should fit the task, not the other way around.',
      },
      {
        q: 'How many pomodoros should I do per day?',
        a: 'There’s no magic number. Most students find 6–12 focused sessions (roughly 3–6 hours of actual work) is a sustainable full day. Quality of attention matters more than the count.',
      },
      {
        q: 'What should I do during pomodoro breaks?',
        a: 'Step away from the screen. Walk, stretch, get water, look out a window. A "break" spent scrolling is just delayed work — and it makes the next session harder to start.',
      },
    ],
    sections: [
      {
        h2: 'What the technique actually is',
        blocks: [
          { k: 'p', t: 'Francesco Cirillo developed the method in the 1980s using a tomato-shaped kitchen timer — *pomodoro* is Italian for tomato. The canonical version: work for 25 minutes, take a 5-minute break, repeat. After four cycles, take a longer break of 15–30 minutes.' },
          { k: 'p', t: 'The insight underneath isn’t the numbers — it’s that *starting* is the hard part, and a 25-minute commitment is small enough to start almost any time. The timer converts “I should study” into “I’ll study until the tomato dings,” which is a much easier sentence to act on.' },
        ],
      },
      {
        h2: 'What the research actually says',
        blocks: [
          { k: 'p', t: 'Honesty is required here, because the evidence is genuinely mixed — and any guide that tells you pomodoros are proven to work is selling something.' },
          { k: 'ul', items: [
            'A 2023 randomized study (Biwer et al.) found students on fixed breaks — including pomodoro-style schedules — reported less fatigue and distraction and more concentration and motivation than students choosing their own breaks, while completing similar work in less time.',
            'A 2022 meta-analysis of short breaks (10 minutes or less) found they reliably boosted energy and reduced fatigue, though the effect on performance itself was small.',
            'A 2025 study found the opposite pattern: pomodoro breaks produced *faster* rises in fatigue and faster drops in motivation compared to self-regulated breaks, though overall levels didn’t differ.',
          ]},
          { k: 'p', t: 'The honest synthesis: *structure helps, but the specific interval doesn’t matter much*. Fixed, short work-break cycles seem to support focus and manage fatigue for most students. Whether it’s 25/5 or 50/10 matters far less than whether you actually take the breaks — and whether the breaks are real.' },
          { k: 'callout', t: 'The pomodoro technique is best understood as a *starting ritual* and a *break enforcer*, not a learning theory. It won’t make you remember more. It will make you start more often — and starting is where most study plans die.' },
        ],
      },
      {
        h2: 'Adapting the intervals for studying',
        blocks: [
          { k: 'p', t: 'The 25/5 default is built for office work, not deep study. Students doing genuinely hard material — proofs, dense readings, problem sets — often need longer blocks to reach flow state. Interrupting a proof at minute 25 to stretch isn’t a break; it’s a derailment.' },
          { k: 'p', t: 'A better default for serious study:' },
          { k: 'ul', items: [
            'Shallow work (flashcards, reading, admin): 25–30 min work / 5 min break.',
            'Deep work (essays, problem sets, dense chapters): 45–75 min work / 10–15 min break.',
            'After three to four deep blocks: a real break of 20–30 minutes — leave the desk.',
            'Match the interval to the task, not to the tomato.',
          ]},
          { k: 'p', t: 'The technique also assumes you can pause mid-thought. If you’re in genuine flow — the kind where the timer feels like an interruption — extend the block. The rule is *protect the work*, not *obey the clock*.' },
        ],
      },
      {
        h2: 'Common mistakes that make it useless',
        blocks: [
          { k: 'ul', items: [
            'Checking your phone during the break. A break spent on social media isn’t a break — it’s a context switch that makes the next block harder.',
            'Using it for everything. Pomodoros are for *focused* work. They’re not for reading email, scrolling, or half-watching a lecture.',
            'Ignoring the longer break. After four cycles, the 15–30 minute break isn’t optional — it’s where consolidation and recovery happen.',
            'Treating the timer as the goal. The timer is scaffolding. If you’re optimizing for pomodoros completed instead of work done, you’ve built a very productive-looking nothing.',
          ]},
        ],
      },
      {
        h2: 'When pomodoro is the wrong tool',
        blocks: [
          { k: 'p', t: 'Some work doesn’t fit a timer. Writing a first draft that needs to flow, debugging a problem that requires holding a whole system in your head, reading something you’re genuinely absorbed in — these resist interruption. For those, use longer blocks or no timer at all.' },
          { k: 'p', t: 'And some students don’t need external structure at all. If you already have a reliable internal rhythm — you sit down, you work, you stop when it’s done — adding a timer might just be noise. The technique is a tool for people whose attention needs scaffolding, not a moral improvement for everyone.' },
          { k: 'tool', tool: 'timer', t: 'Iterra’s Timer supports pomodoro sessions, custom interval routes, a stopwatch, and a session ledger — so the method adapts to the work instead of the other way around.' },
        ],
      },
      {
        h2: 'The verdict',
        blocks: [
          { k: 'p', t: 'Use the pomodoro technique if starting is your problem, if your breaks tend to stretch into hours, or if you need external structure to stay honest. Skip it if you’re already self-regulating well, or if your work demands unbroken concentration. Either way, the deeper lesson stands: *work in bounded intervals and take real breaks* — the specific numbers are yours to choose.' },
        ],
      },
    ],
  },

  {
    slug: 'time-blocking-for-students',
    title: 'Time blocking for students: a <em>practical</em> guide',
    seoTitle: 'Time Blocking for Students: How to Plan Your Week',
    description:
      'Time blocking assigns every hour a job before the day starts. Here’s how to build a weekly block schedule for classes, studying, and life — with templates and common mistakes.',
    kicker: 'Planning',
    datePublished: '2026-11-25',
    dateModified: '2026-11-25',
    readMinutes: 9,
    keywords: ['time blocking', 'time blocking for students', 'weekly schedule template', 'daily planner'],
    tools: ['boxed', 'syllabus'],
    related: ['plan-a-semester', 'pomodoro-technique-for-deep-study', 'weekly-study-routine'],
    lede: 'A to-do list is a catalog of things you intend to do. Time blocking is a decision about when you’ll do them — made in advance, while you’re calm, instead of in the moment, when you’re tired. It’s the difference between a wish and a plan.',
    faq: [
      {
        q: 'What is time blocking?',
        a: 'Time blocking is scheduling specific tasks into specific time slots on your calendar — every hour gets assigned a job before the day begins. Unlike a to-do list, which says what you’ll do, time blocking says when you’ll do it.',
      },
      {
        q: 'How do I start time blocking as a student?',
        a: 'Start with your fixed commitments (classes, work, sleep), then block your two or three most important study tasks into the remaining open hours. Don’t try to schedule everything — leave buffer for the unexpected.',
      },
      {
        q: 'Is time blocking the same as the pomodoro technique?',
        a: 'No. Time blocking decides *what* you’ll do and *when*; pomodoro manages *how* you work within a block. They work together — a two-hour block might contain three pomodoros.',
      },
    ],
    sections: [
      {
        h2: 'Why lists fail and blocks work',
        blocks: [
          { k: 'p', t: 'A to-do list has a fatal flaw: it stores intentions without decisions. “Study biology” sits there all day, equally valid at 9am or 11pm, equally easy to postpone. Every time you look at it, you have to re-decide *when* — and decision fatigue means you often decide “later.”' },
          { k: 'p', t: 'Time blocking moves the decision to the night before, or the Sunday before. When Tuesday 2pm arrives and your calendar already says “biology problem set,” there’s nothing left to decide. You just execute. This is why people who time-block report feeling less busy despite doing the same amount of work — the mental overhead of constant scheduling is gone.' },
          { k: 'p', t: 'The research on implementation intentions — specific if-then plans — consistently shows that pre-deciding *when* and *where* dramatically increases follow-through. Time blocking is implementation intentions applied to your whole week.' },
        ],
      },
      {
        h2: 'The anatomy of a blocked week',
        blocks: [
          { k: 'p', t: 'A student’s week has three kinds of time: fixed commitments you can’t move, flexible time you can allocate, and slack you must protect. Blocking is the art of assigning the flexible time deliberately.' },
          { k: 'ul', items: [
            'Fixed anchors: classes, work shifts, meals, sleep, commute. These are immovable — block them first.',
            'Deep blocks: 60–120 minute sessions for the hardest work — essays, problem sets, dense reading. One subject per block; multitasking across courses is just switching costs.',
            'Shallow blocks: 25–45 minute sessions for flashcards, email, admin, scheduling. These can be shorter and more frequent.',
            'Buffer: at least 20% of your flexible time left unscheduled. This is where overruns go, where you recover, where life happens.',
          ]},
        ],
      },
      {
        h2: 'Building your first block week',
        blocks: [
          { k: 'p', t: 'Don’t try to block every hour of every day. Start with three steps:' },
          { k: 'ul', items: [
            'Map your fixed commitments for the week — every class, shift, and standing obligation.',
            'Identify your three highest-leverage study tasks — the ones that would most move your grades if done well.',
            'Place each into a specific open slot, giving each a realistic time estimate plus 25% buffer.',
          ]},
          { k: 'p', t: 'That’s it. Three blocks, placed honestly, will outperform a perfect schedule you abandon by Wednesday. The system scales once the habit sticks — you’ll naturally start adding more blocks as you trust the structure.' },
        ],
      },
      {
        h2: 'Rules that keep blocks honest',
        blocks: [
          { k: 'ul', items: [
            'Every block gets a single, specific task — not “study chemistry” but “finish problem set 4, questions 1–12.”',
            'Blocks are appointments, not suggestions. If something comes up, reschedule the block — don’t delete it.',
            'Color-code by course or energy level so you can see at a glance whether your week is balanced.',
            'The first block of the day should be your hardest — willpower is a depleting resource, and deep work before noon (or whenever you’re sharpest) compounds.',
            'Review the week on Sunday. Move what didn’t happen; don’t just feel guilty about it.',
          ]},
        ],
      },
      {
        h2: 'Where time blocking breaks',
        blocks: [
          { k: 'p', t: 'The most common failure is overstuffing — scheduling every open hour until the plan has no room for the inevitable. The second is rigidity: treating the calendar as law even when circumstances change. A block that gets moved is still a block; a block that gets deleted is a failure.' },
          { k: 'p', t: 'The third failure is subtle: blocking time without deciding what *done* looks like. “Study for the exam” is a block-shaped wish. “Complete practice test 2 and review every missed question” is a block with a finish line.' },
          { k: 'tool', tool: 'boxed', t: 'Boxed is built for exactly this — brain-dump everything, pick what matters, and time-box it into your day.' },
          { k: 'tool', tool: 'syllabus', t: 'Syllabus holds your weekly blocks and course commitments in one place, so planning and doing stay connected.' },
        ],
      },
      {
        h2: 'The compounding effect',
        blocks: [
          { k: 'p', t: 'Time blocking works because it’s not really about time — it’s about *decisions*. Every block you place the night before is a decision you don’t have to make when you’re tired. Every block you protect is a promise to your future self that the plan is real. Do it for two weeks and the structure starts carrying you; do it for a semester and it becomes invisible — which is exactly the point.' },
        ],
      },
    ],
  },

  {
    slug: 'lecture-notes-that-actually-stick',
    title: 'How to take lecture notes that <em>actually stick</em>',
    seoTitle: 'Lecture Notes That Actually Stick: A Practical Method',
    description:
      'Stop transcribing and start encoding. A practical note-taking method for lectures — what to write, what to skip, and the 10-minute after-class ritual that makes notes useful.',
    kicker: 'Notes',
    datePublished: '2026-11-25',
    dateModified: '2026-11-25',
    readMinutes: 8,
    keywords: ['how to take lecture notes', 'note taking methods', 'cornell notes', 'lecture notes app'],
    tools: ['ink', 'margin'],
    related: ['active-recall-vs-rereading', 'flashcard-best-practices', 'weekly-study-routine'],
    lede: 'Most lecture notes fail before the lecture ends. The student transcribes furiously, produces twelve pages of verbatim prose, and three weeks later couldn’t tell you what was in them. The problem isn’t effort — it’s that transcription and learning are different activities, and only one of them is worth doing.',
    faq: [
      {
        q: 'Is it better to take notes by hand or on a laptop?',
        a: 'Research consistently favors handwriting for learning — students who write by hand process information more deeply and score better on conceptual questions. Laptops are faster but invite verbatim transcription. If you must use a laptop, disable auto-save urges and write summaries, not transcripts.',
      },
      {
        q: 'What is the Cornell note-taking method?',
        a: 'The Cornell method divides your page into three sections: notes on the right (main ideas), cues/questions on the left (written after class), and a summary at the bottom. It forces you to process rather than just record — the left column becomes a self-quiz.',
      },
      {
        q: 'How long should I spend reviewing lecture notes?',
        a: 'The evidence points to short, frequent review — 10 minutes within 24 hours of the lecture, then weekly spaced reviews — far outperforming a single long session before the exam. The after-class reset is the highest-leverage ten minutes in your study week.',
      },
    ],
    sections: [
      {
        h2: 'Why transcription fails',
        blocks: [
          { k: 'p', t: 'When you write down everything a lecturer says, you’re doing stenography, not thinking. Your working memory is fully occupied by the mechanics of capture — listening, deciding what’s important, finding the words, writing them down — leaving nothing for the actual work of *encoding*: connecting new ideas to what you already know.' },
          { k: 'p', t: 'The result is fluent-looking notes that don’t survive contact with an exam. You recognize the material when you reread it (it feels familiar), but recognition isn’t recall — and recall is what the test demands. This is the same illusion that makes rereading feel productive while doing almost nothing.' },
          { k: 'p', t: 'The fix isn’t better handwriting or a better app. It’s a different goal: notes aren’t a record of what was said. They’re a record of what *you understood*.' },
        ],
      },
      {
        h2: 'The notes you should actually write',
        blocks: [
          { k: 'p', t: 'Good lecture notes are sparse, structured, and written for your future self — the version who won’t remember the lecture at all. Three principles:' },
          { k: 'ul', items: [
            'Write ideas, not sentences. A lecture point compressed to a phrase — "mitosis vs meiosis: identical vs varied, 2n→2n vs 2n→n" — forces you to process it into structure. A verbatim sentence lets you off the hook.',
            'Leave room for questions. The best notes contain things you *don’t* understand yet — flagged with a ? or a margin star. These become your study session agenda.',
            'Use structure: headings, arrows, indentation. Visual hierarchy mirrors conceptual hierarchy. A wall of text is a wall; a map is a tool.',
          ]},
        ],
      },
      {
        h2: 'During class: the 70/30 rule',
        blocks: [
          { k: 'p', t: 'Aim to spend about 70% of your attention on *processing* and 30% on *writing*. That means listening to understand first, then capturing the understanding — not transcribing the delivery.' },
          { k: 'p', t: 'Practical tactics that make this work:' },
          { k: 'ul', items: [
            'Skim the reading or slides *before* class. If you know what the lecture is about, you can recognize what matters when it’s said.',
            'Watch for signal phrases — "the key point," "this will be on the exam," "unlike X, this works by…" — and write those down immediately.',
            'When the lecturer repeats something, that’s your cue it’s important. Write it once, well.',
            'If you miss something, flag it and move on. The question mark is more valuable than a confused paragraph.',
          ]},
        ],
      },
      {
        h2: 'The 10-minute after-class reset',
        blocks: [
          { k: 'p', t: 'This is the highest-leverage habit in note-taking, and almost nobody does it. Within 24 hours — ideally immediately after class — spend ten minutes on three things:' },
          { k: 'ul', items: [
            'Fill the gaps: clean up shorthand, complete interrupted thoughts, add anything you flagged with ?',
            'Add the cues: write 3–5 questions on the left margin (Cornell-style) or at the top of the page — things the notes should be able to answer',
            'Connect: write one sentence linking today’s material to something you already know — a previous lecture, another course, your own experience',
          ]},
          { k: 'p', t: 'That last step — connecting — is what converts notes from a record into knowledge. It’s also the step that makes spaced review possible later, because you’ve already built the retrieval hooks.' },
          { k: 'callout', t: 'The after-class reset is when notes become *yours*. Without it, they’re just a transcript of someone else’s thinking.' },
        ],
      },
      {
        h2: 'Paper vs. digital: the honest trade-off',
        blocks: [
          { k: 'p', t: 'The research on handwriting vs. laptop note-taking is clear for *learning*: handwriting wins for conceptual understanding and long-term retention, because it’s slower and forces selection and compression. Laptops win for speed, searchability, and organization.' },
          { k: 'p', t: 'For most students, the best answer is hybrid: handwritten or typed *during* class (whatever lets you process, not transcribe), then digital *after* — typed up, organized, linked, searchable. The Margin shelf holds your slides and handouts; Ink holds the thinking that connects them.' },
          { k: 'tool', tool: 'ink', t: 'Ink is built for this — long-form notes with wiki-links, course tags, and daily pages, all local-first.' },
          { k: 'tool', tool: 'margin', t: 'Margin keeps the raw material — recordings, PDFs, handouts — filed by course so your notes can cite the source.' },
        ],
      },
      {
        h2: 'The test: will future-you thank you?',
        blocks: [
          { k: 'p', t: 'The measure of good notes isn’t how they look — it’s whether they’re useful three weeks later. Can you read them cold and reconstruct what the lecture argued? Do the margin questions make you pause and think? Do the connections remind you why this matters?' },
          { k: 'p', t: 'If the answer is no, the notes are a transcript. Rewrite them — not by copying, but by asking "what was the argument?" and answering it in your own compressed prose. That rewrite *is* the studying.' },
        ],
      },
    ],
  },

  {
    slug: 'active-recall-vs-rereading',
    title: 'Active recall vs rereading: the <em>honest</em> comparison',
    seoTitle: 'Active Recall vs Rereading: Which Study Method Works?',
    description:
      'Rereading feels productive but barely works. Active recall feels harder but actually builds memory. Here’s the evidence, and how to switch from one to the other.',
    kicker: 'Study Methods',
    datePublished: '2026-11-25',
    dateModified: '2026-11-25',
    readMinutes: 8,
    keywords: ['active recall', 'rereading vs active recall', 'retrieval practice', 'how to study effectively'],
    tools: ['flashcards', 'proof'],
    related: ['spaced-repetition-explained', 'flashcard-best-practices', 'how-to-study-for-finals-week'],
    lede: 'Every student has done it: read the chapter, highlight the important parts, read it again, feel prepared, walk into the exam, and blank. The method felt productive because it *felt* productive — the material was familiar, the pages were marked, the effort was real. But familiarity isn’t knowledge, and rereading is the study technique that most efficiently produces the illusion of learning.',
    faq: [
      {
        q: 'Is rereading ever useful?',
        a: 'Yes — for material you’ve never seen, a first read is necessary. Rereading also helps with very complex texts where comprehension requires multiple passes. The problem is rereading as a *study* strategy: it produces recognition without recall, which is exactly what exams test against.',
      },
      {
        q: 'What is the testing effect?',
        a: 'The testing effect (also called retrieval practice) is the finding that actively recalling information — through self-testing, flashcards, or practice questions — produces stronger, longer-lasting memory than passive review. It’s one of the most replicated results in learning science.',
      },
      {
        q: 'How do I know if I’m actually learning or just recognizing?',
        a: 'Close the book. If you can explain the concept, answer the question, or solve the problem without looking, you’re recalling. If you can only recognize it when you see it again, you’re recognizing — and recognition fades fast.',
      },
    ],
    sections: [
      {
        h2: 'The illusion of fluency',
        blocks: [
          { k: 'p', t: 'Rereading works on a principle called *fluency*: the more times you encounter material, the more familiar it feels, and familiarity feels like mastery. The problem is that fluency is a property of *recognition* — "yes, I’ve seen this" — not *recall* — "I can produce this from memory." Exams test recall. Study sessions that only build fluency are building the wrong thing.' },
          { k: 'p', t: 'This is why students who reread for hours often perform no better than students who skim once. The extra reading doesn’t add memory; it adds confidence. And confidence without competence is the most dangerous combination in education.' },
        ],
      },
      {
        h2: 'What active recall actually is',
        blocks: [
          { k: 'p', t: 'Active recall is the practice of retrieving information from memory *without* looking at the source. Close the book. Blank page. Say it out loud. Write it down. Solve the problem before checking the answer. Every act of retrieval is a workout for the memory trace — and like any workout, it strengthens what it touches.' },
          { k: 'p', t: 'The research is unambiguous. Roediger and Karpicke’s landmark 2006 study showed that students who practiced retrieval remembered more than twice as much as students who reread — and the effect *grew* over time, while rereading’s advantage vanished within days. Dunlosky et al.’s 2013 review rated practice testing as one of only two "very effective" learning techniques out of ten studied.' },
        ],
      },
      {
        h2: 'Why it feels worse — and why that’s the point',
        blocks: [
          { k: 'p', t: 'Here’s the cruel part: active recall *feels* harder and *produces* better results, while rereading *feels* easier and *produces* worse results. Students consistently choose the method that feels productive, which is why the less effective technique dominates.' },
          { k: 'p', t: 'The difficulty of retrieval is the mechanism. When you struggle to recall — reach for the answer, almost get it, finally produce it — the memory trace is strengthened more than if it had come easily. Psychologists call these *desirable difficulties*: obstacles that make learning feel slower but make it last longer.' },
          { k: 'callout', t: 'If studying feels smooth and comfortable, you’re probably doing it wrong. The struggle is the signal that it’s working.' },
        ],
      },
      {
        h2: 'How to switch from rereading to recall',
        blocks: [
          { k: 'p', t: 'You don’t have to abandon reading entirely — first exposure still requires it. The shift happens in the *review* phase:' },
          { k: 'ul', items: [
            'After reading a section, close the book and write down everything you remember — key points, definitions, relationships.',
            'Turn your notes into questions. "What are the three stages of mitosis?" is a recall prompt; "The three stages are…" is a recognition cue.',
            'Use flashcards for factual material — they’re retrieval practice with scheduling built in.',
            'For problem-based courses, do the problems *before* looking at the solution. The attempt is the learning.',
            'Practice explaining the concept to someone else — or to an empty room. Teaching requires recall; recognition doesn’t cut it.',
          ]},
        ],
      },
      {
        h2: 'The honest comparison',
        blocks: [
          { k: 'ul', items: [
            'Rereading: fast, comfortable, builds familiarity, produces short-lived recognition. Best for: first exposure to new material.',
            'Active recall: slower, effortful, builds retrieval strength, produces durable memory. Best for: review, exam prep, long-term retention.',
            'The winning strategy: read once to encode, then recall repeatedly to consolidate. Never reread as a substitute for recall.',
          ]},
          { k: 'tool', tool: 'flashcards', t: 'Flashcards are active recall with scheduling — the Cardfile handles the spacing so you only practice what’s about to be forgotten.' },
          { k: 'tool', tool: 'proof', t: 'Proof’s problem sets and error log apply the same principle to math — attempt first, check after, review what you missed.' },
        ],
      },
      {
        h2: 'The bottom line',
        blocks: [
          { k: 'p', t: 'Rereading is a activity; active recall is a *practice*. One exposes you to material; the other forces you to produce it. The research is settled, the mechanism is understood, and the practical advice is simple: if you’re not struggling to remember something, you’re probably not studying it — you’re just looking at it.' },
        ],
      },
    ],
  },

  {
    slug: 'how-to-study-for-finals-week',
    title: 'How to study for <em>finals week</em> without losing your mind',
    seoTitle: 'How to Study for Finals Week: A Strategic Guide',
    description:
      'Finals week is a triage problem, not a knowledge problem. A practical system for prioritizing courses, scheduling review blocks, using practice tests, and protecting your sleep.',
    kicker: 'Exam Season',
    datePublished: '2026-11-25',
    dateModified: '2026-11-25',
    readMinutes: 10,
    keywords: ['how to study for finals', 'finals week study plan', 'final exam prep', 'study for finals week'],
    tools: ['flashcards', 'timer', 'boxed'],
    related: ['active-recall-vs-rereading', 'spaced-repetition-explained', 'plan-a-semester'],
    lede: 'Finals week is the moment every shortcut you took in October comes due at once. The students who survive it aren’t the ones who study the most — they’re the ones who study the most *strategically*. Here’s how to turn a week of panic into a plan.',
    faq: [
      {
        q: 'How many hours a day should I study during finals week?',
        a: 'Most students can sustain 6–8 hours of focused study per day for the 3–5 days before exams. More than that produces diminishing returns and burnout. Protect 7–8 hours of sleep — it’s when memory consolidates.',
      },
      {
        q: 'Should I study all subjects equally?',
        a: 'No. Triage by grade impact: weight each course by its exam percentage, your current standing, and how much ground you need to cover. A 40% final in a class you’re failing needs more time than a 15% quiz in a class you’re acing.',
      },
      {
        q: 'Is it better to study alone or in a group during finals?',
        a: 'Alone for initial review (flashcards, practice problems, reading), then in groups for explaining concepts to each other. Group study fails when it becomes social hour or answer-copying. The best use is taking turns teaching — if you can explain it, you know it.',
      },
    ],
    sections: [
      {
        h2: 'Triage before you study',
        blocks: [
          { k: 'p', t: 'The first mistake of finals week is treating all courses equally. They’re not equal — and neither are you. Before you open a book, spend an hour building a triage matrix:' },
          { k: 'ul', items: [
            'List every exam: date, time, format (essay, multiple choice, problem-based, oral).',
            'For each course, note the exam’s weight in the final grade and your current standing.',
            'Estimate coverage needed: how much material, how well do you know it already, what are the highest-yield topics?',
            'Rank courses by urgency × importance: an exam tomorrow in a class you’re failing outranks an exam next week in a class you’re acing.',
          ]},
          { k: 'p', t: 'This matrix is your allocation key. It tells you where the next hour goes — and gives you permission to *not* study the course that needs it least.' },
          { k: 'callout', t: 'Strategic neglect is not laziness. It’s the recognition that you cannot optimize every course simultaneously, so you optimize the portfolio.' },
        ],
      },
      {
        h2: 'The two-week arc',
        blocks: [
          { k: 'p', t: 'If you have two weeks (many schools now spread finals), the structure is:' },
          { k: 'ul', items: [
            'Days 1–3: Inventory. Gather all notes, past exams, practice problems, and study guides. Build your triage matrix. Identify the highest-yield material for each course — what topics appear most, what the professor emphasized, what past exams tested.',
            'Days 4–10: Distributed review. Rotate through courses in blocks — no more than two days on the same subject consecutively. Use active recall (flashcards, practice problems, blank-page summaries) rather than rereading.',
            'Days 11–14: Exam-specific prep. For each exam, do at least one full practice test under timed conditions. Review every mistake — not just the answer, but *why* you missed it.',
          ]},
          { k: 'p', t: 'If you only have one week, compress the same structure: two days inventory, four days distributed review, one day practice tests. The ratio matters more than the absolute time.' },
        ],
      },
      {
        h2: 'Daily structure during finals week',
        blocks: [
          { k: 'p', t: 'A sustainable finals-day looks like this:' },
          { k: 'ul', items: [
            'Morning (90–120 min): Your highest-priority course — the one with the soonest exam or biggest knowledge gap. Deep work before the day’s demands fragment your attention.',
            'Midday (60–90 min): Second course, or continue the first if it’s still weak.',
            'Afternoon (60–90 min): Third course, or practice test for the morning’s subject.',
            'Evening (60 min): Light review — flashcards, formula sheets, practice problems. No new material after dinner.',
            'Night: Sleep. Non-negotiable. Memory consolidates during sleep; all-nighters trade tomorrow’s performance for tonight’s panic.',
          ]},
          { k: 'p', t: 'Use pomodoro or time-blocking within these windows if it helps — but the structure above is the skeleton; the technique is just the muscle.' },
        ],
      },
      {
        h2: 'Course-specific tactics',
        blocks: [
          { k: 'p', t: 'Different exam formats reward different preparation:' },
          { k: 'ul', items: [
            'Multiple choice: Practice questions, not rereading. The exam tests discrimination between similar concepts — you need to practice *choosing*, not just *recognizing*.',
            'Essays: Outline more essays than you write. Practice thesis statements, topic sentences, and evidence selection under time pressure. A timed outline beats an untimed essay.',
            'Problem-based (math, physics, CS): Do problems, don’t read solutions. The struggle to set up the problem is where learning happens. Review mistakes by redoing them, not by reading the correct answer.',
            'Oral exams: Practice explaining concepts aloud. If you can’t say it clearly, you don’t know it. Record yourself if possible.',
          ]},
        ],
      },
      {
        h2: 'The night before and exam day',
        blocks: [
          { k: 'p', t: 'The night before: light review only — flashcards, formula sheets, high-level outlines. No new material; it won’t stick and will just raise anxiety. Pack your bag, lay out clothes, set two alarms. Sleep 7–8 hours.' },
          { k: 'p', t: 'Exam day: eat something, arrive early, do a 5-minute brain dump of everything you know about the course (it primes recall), then trust your preparation. During the exam: read all questions first, do the ones you know cold to build momentum, flag and return to the hard ones. Never leave a question blank — partial credit exists.' },
          { k: 'tool', tool: 'flashcards', t: 'Flashcards handle the high-frequency review — what’s due today, what’s due tomorrow, what you can’t afford to forget.' },
          { k: 'tool', tool: 'timer', t: 'Timer keeps your study blocks honest — focused intervals with real breaks, so finals week doesn’t become a blur of anxiety.' },
          { k: 'tool', tool: 'boxed', t: 'Boxed turns the triage matrix into a daily plan — brain-dump everything, pick what matters, time-box the day.' },
        ],
      },
      {
        h2: 'After finals',
        blocks: [
          { k: 'p', t: 'When it’s over, do two things: write down what worked and what didn’t (for next semester), and actually rest. Finals week is a sprint; recovery is part of the training. The students who do well consistently aren’t the ones who suffer most — they’re the ones who recover best.' },
        ],
      },
    ],
  },

  {
    slug: 'building-a-weekly-study-routine',
    title: 'Building a weekly study <em>routine</em> that survives contact with reality',
    seoTitle: 'Weekly Study Routine: How to Build One That Lasts',
    description:
      'A weekly study routine beats daily resolutions. How to design a realistic study week, anchor habits to existing cues, and keep it flexible enough to survive real life.',
    kicker: 'Routines',
    datePublished: '2026-11-25',
    dateModified: '2026-11-25',
    readMinutes: 8,
    keywords: ['study routine', 'weekly study schedule', 'study schedule template', 'how to study consistently'],
    tools: ['rhythm', 'syllabus', 'boxed'],
    related: ['time-blocking-for-students', 'plan-a-semester', 'pomodoro-technique-for-deep-study'],
    lede: 'The problem with study routines isn’t that they’re hard — it’s that most people design them like fitness plans: ambitious, rigid, and abandoned by week three. A routine that survives is smaller than you think, anchored to things you already do, and flexible enough to bend without breaking.',
    faq: [
      {
        q: 'How many hours should a weekly study routine include?',
        a: 'Start with what’s realistic, not what’s ideal. If you can consistently do 10 hours of focused study per week, that’s better than a 25-hour plan you abandon. Build up gradually — consistency compounds.',
      },
      {
        q: 'What time of day is best for studying?',
        a: 'The research shows most people have a 2–4 hour peak window — often late morning or early evening. The best time is when you can consistently show up, not when you theoretically should. Anchor your hardest work to your natural energy peak.',
      },
      {
        q: 'How do I stick to a study routine when life gets busy?',
        a: 'Build in minimum viable sessions — a 20-minute floor that counts as “done.” On chaotic days, do the minimum; on normal days, do more. The routine survives because it has a floor, not because it’s rigid.',
      },
    ],
    sections: [
      {
        h2: 'Why routines beat resolutions',
        blocks: [
          { k: 'p', t: 'A resolution is a decision you make once and then have to re-make every day. A routine is a structure that makes the decision once — “Tuesday and Thursday, 2–4pm, library, chemistry” — and then runs itself. The research on habit formation is clear: consistency matters more than intensity, and routines reduce the cognitive load of daily decision-making to nearly zero.' },
          { k: 'p', t: 'This is why the students who seem to “always study” aren’t more disciplined than you — they’ve just automated it. Their routine carries them on the days their motivation doesn’t show up.' },
        ],
      },
      {
        h2: 'Design the week, not the day',
        blocks: [
          { k: 'p', t: 'Daily routines are brittle — one bad morning and the whole day collapses. Weekly routines are resilient — a missed Monday session can be made up Wednesday without breaking the structure. Design at the weekly level:' },
          { k: 'ul', items: [
            'Map your fixed commitments first: classes, work, sleep, recurring obligations.',
            'Identify your energy patterns: when are you sharpest? Block your hardest subjects there.',
            'Assign each course 2–3 recurring weekly sessions — same days, same times, same place if possible.',
            'Leave at least one full day lightly scheduled — recovery is part of the routine, not a violation of it.',
          ]},
        ],
      },
      {
        h2: 'Anchor to existing cues',
        blocks: [
          { k: 'p', t: 'The most reliable routines attach to things you already do automatically. Instead of “study chemistry at some point,” try “after my last class on Tuesday and Thursday, I go to the library for two hours.” The existing habit (class ending) becomes the trigger for the new one (studying).' },
          { k: 'p', t: 'This is called *habit stacking*, and it works because it removes the decision point. You’re not deciding whether to study — you’re just following the sequence. After a few weeks, the sequence runs itself.' },
          { k: 'ul', items: [
            'After morning coffee → 30 minutes of flashcards',
            'After lunch → review yesterday’s notes',
            'After last class → library block for the day’s hardest subject',
            'Sunday evening → plan the week ahead',
          ]},
        ],
      },
      {
        h2: 'The minimum viable week',
        blocks: [
          { k: 'p', t: 'Every routine needs a floor — the smallest version that still counts. For most students, that’s 20–30 minutes of focused work per scheduled session. On bad days, you do the floor and stop. On good days, you do more.' },
          { k: 'p', t: 'This sounds trivial, but it’s the mechanism that keeps routines alive. A routine that requires perfection breaks on the first imperfect day. A routine with a floor survives bad weeks — and surviving is what builds the long-term consistency that actually produces results.' },
          { k: 'callout', t: 'The goal isn’t to study more. It’s to make studying *automatic* — so it happens even when you don’t feel like it.' },
        ],
      },
      {
        h2: 'Review and adjust weekly',
        blocks: [
          { k: 'p', t: 'A routine is a hypothesis, not a law. Once a week, spend fifteen minutes asking: what worked? what didn’t? what needs to move?' },
          { k: 'p', t: 'Common adjustments: shifting a block that consistently conflicts with energy crashes, swapping a course that’s not clicking for one that needs more time, or adding a session for a course that’s falling behind. The routine that survives is the one that *evolves* with your actual life.' },
          { k: 'tool', tool: 'rhythm', t: 'Rhythm lays your week out like a step sequencer — routines, attendance, and study cadence in one register you can actually see.' },
          { k: 'tool', tool: 'syllabus', t: 'Syllabus holds your course blocks and commitments so the routine and the plan stay connected.' },
          { k: 'tool', tool: 'boxed', t: 'When a routine block arrives, Boxed turns it into a concrete day instead of a vague intention.' },
        ],
      },
      {
        h2: 'The compound effect',
        blocks: [
          { k: 'p', t: 'A weekly study routine doesn’t produce results in a week — it produces results in a semester. But the mechanism is simple: every week you follow the routine, you’re depositing small amounts of learning that compound. Miss a week, and the deposits pause. Follow it for twelve weeks, and the accumulation is the difference between a student who studies and a student who *is* a student.' },
        ],
      },
    ],
  },

  {
    slug: 'flashcard-best-practices',
    title: 'Flashcard best practices: <em>write better cards, study smarter</em>',
    seoTitle: 'Flashcard Best Practices: How to Make and Study Cards',
    description:
      'Flashcards only work if the cards are good and the studying is honest. Card-writing craft, scheduling strategy, and when flashcards aren’t the right tool at all.',
    kicker: 'Flashcards',
    datePublished: '2026-11-25',
    dateModified: '2026-11-25',
    readMinutes: 8,
    keywords: ['how to make flashcards', 'flashcard study tips', 'flashcards best practices', 'spaced repetition flashcards'],
    tools: ['flashcards'],
    related: ['spaced-repetition-explained', 'active-recall-vs-rereading', 'lecture-notes-that-actually-stick'],
    lede: 'Flashcards are the most misunderstood study tool ever made. Students make them wrong (lists on the front, vague questions, forty sub-points crammed into one card), study them wrong (recognizing instead of recalling, cramming instead of spacing), and then conclude flashcards don’t work. The tool is fine. The technique is what needs work.',
    faq: [
      {
        q: 'How many flashcards should I make per day?',
        a: 'Quality over quantity — 10–20 well-crafted cards beat 50 mediocre ones. The limit isn’t card creation, it’s review: you can only maintain so many cards in active rotation. If your due count is unmanageable, prune before you add.',
      },
      {
        q: 'Should flashcards be handwritten or digital?',
        a: 'Digital wins for most students — spaced repetition scheduling, search, and mobile access are impossible to replicate with paper. Handwritten cards work only if you review them with a system, which paper doesn’t provide natively.',
      },
      {
        q: 'Are flashcards good for essay subjects?',
        a: 'They’re good for the *components* of essays — key terms, historical dates, theoretical frameworks, argument structures. They’re not good for practicing the essay itself. Use cards for the vocabulary of the subject, then practice writing for the skill.',
      },
    ],
    sections: [
      {
        h2: 'Card craft: the rules that matter',
        blocks: [
          { k: 'p', t: 'A flashcard is a retrieval prompt, not a mini-lesson. Its only job is to make you *produce* an answer from memory — everything else is noise.' },
          { k: 'ul', items: [
            'One idea per card. If the answer has "and" in it, it’s probably two cards.',
            'The front is a question; the back is the answer. Not a topic and a paragraph — a question and a phrase.',
            'Write for recall, not recognition. "What is the Krebs cycle?" beats "The Krebs cycle is: a) … b) … c) …" — multiple choice tests recognition, which is the weaker skill.',
            'Use cloze deletions for embedded facts: "The {{mitochondria}} is the powerhouse of the cell" or "Photosynthesis occurs in the {{chloroplast}}."',
            'Attach images when the visual *is* the concept — anatomy diagrams, maps, molecular structures.',
            'Never put a list on the front. Lists go on the back, or better, split into atomic cards.',
          ]},
        ],
      },
      {
        h2: 'Scheduling craft: the discipline of review',
        blocks: [
          { k: 'p', t: 'Card quality gets you halfway; scheduling gets you the rest. The research is consistent: short, frequent sessions beat long, infrequent ones — ten minutes daily outperforms an hour weekly, because spacing is what builds durable memory.' },
          { k: 'p', t: 'Within each session, honesty matters. Grade your recall accurately:' },
          { k: 'ul', items: [
            'Again: you couldn’t recall it, or recalled it wrong. The card resets to a short interval.',
            'Hard: you recalled it but it took effort or felt shaky. Short interval.',
            'Good: clean recall with reasonable effort. Normal interval.',
            'Easy: instant, effortless recall. Long interval.',
          ]},
          { k: 'p', t: 'The temptation to grade everything "good" or "easy" is the most common failure. If you’re not sure, grade lower — the algorithm will show you the card again sooner, which is exactly what you need.' },
        ],
      },
      {
        h2: 'The deck hygiene problem',
        blocks: [
          { k: 'p', t: 'Decks decay. Cards get duplicated, material gets retired, courses end but decks live forever. A deck with 500 cards you’ve mastered is a deck you’ll abandon — the due count becomes overwhelming and the whole system collapses.' },
          { k: 'p', t: 'Prune ruthlessly:' },
          { k: 'ul', items: [
            'Merge duplicates — if two cards test the same fact, keep the better-written one.',
            'Retire mastered cards — once a card has been "easy" for several cycles, archive it. You can always retrieve it later; you can’t afford to review it forever.',
            'Split overloaded cards — a card with a paragraph answer is really five cards.',
            'Archive finished courses — don’t delete, but don’t let old decks clutter your daily due count.',
          ]},
        ],
      },
      {
        h2: 'When flashcards aren’t the right tool',
        blocks: [
          { k: 'p', t: 'Flashcards are for *atomic facts* — things that have a right answer and can be recalled in isolation. They’re the wrong tool for:' },
          { k: 'ul', items: [
            'Understanding complex systems — you can memorize that the Krebs cycle produces NADH, but cards won’t teach you *why* it matters. Pair cards with explanations and problem-solving.',
            'Writing and argumentation — essays require synthesis, structure, and voice. Cards build vocabulary; they don’t build essays.',
            'Skills that require practice — coding, math problem-solving, lab techniques. These need *doing*, not recalling.',
          ]},
          { k: 'p', t: 'The best students use cards as one tool in a larger system: cards for the facts that need to be automatic, practice problems for the skills that need to be fluent, and essays for the thinking that needs to be deep.' },
        ],
      },
      {
        h2: 'Common mistakes that kill flashcard decks',
        blocks: [
          { k: 'ul', items: [
            'Making cards during lecture instead of after — you’ll transcribe, not process. Make cards from your *notes*, not your memory of the lecture.',
            'Creating cards you’ll never review — a deck of 1000 cards is worse than no deck. Start with 20 and grow only as fast as you can review.',
            'Using flashcards as a reading substitute — cards test knowledge you already have; they don’t teach new material. Read first, card second.',
            'Ignoring the "again" button — if you keep failing cards, the problem is the card, not your memory. Rewrite it simpler.',
          ]},
          { k: 'tool', tool: 'flashcards', t: 'Iterra’s Flashcards handles the scheduling, quizzes, and writing drills — you focus on the cards; it handles the spacing.' },
        ],
      },
      {
        h2: 'The craft in one sentence',
        blocks: [
          { k: 'p', t: 'Write cards that ask questions your future self needs answered, review them honestly and frequently, and prune without mercy. Flashcards aren’t magic — they’re a mirror that shows you exactly what you don’t know, every day, until you do.' },
        ],
      },
    ],
  },

  {
    slug: 'local-first-software',
    title: 'Local-first software: why your notes should <em>live on your device</em>',
    seoTitle: 'Local-First Software: Why Your Notes Should Live on Your Device',
    description:
      'Local-first software keeps your data on your device, not a server. What it means, why it matters for students, the honest trade-offs, and what to look for in a notes app.',
    kicker: 'Privacy & Ownership',
    datePublished: '2026-11-25',
    dateModified: '2026-11-25',
    readMinutes: 9,
    keywords: ['local first software', 'local first notes', 'private note taking app', 'offline notes app', 'data ownership'],
    tools: ['ink', 'margin'],
    related: ['lecture-notes-that-actually-stick', 'flashcard-best-practices', 'plan-a-semester'],
    lede: 'Every note you’ve ever written in a cloud app exists on a server you don’t control, in a format you can’t fully export, under terms you didn’t read. Local-first software flips that: your data lives on your device, the network is optional, and the app is a guest in your files rather than the landlord. For students — whose notes are often their most valuable intellectual property — this isn’t a niche preference. It’s the difference between owning your work and renting it back from a platform.',
    faq: [
      {
        q: 'What is local-first software?',
        a: 'Local-first software is an approach where your data lives primarily on your device, not on a remote server. The seven ideals (from the Ink & Switch essay) include: no spinners, work not trapped on one device, network optional, seamless collaboration, longevity, security by default, and ultimate ownership.',
      },
      {
        q: 'Is local-first software as good as cloud apps?',
        a: 'For single-user work, often better — faster, private, works offline. For real-time collaboration across many users, cloud apps still have advantages. Local-first is catching up on collaboration but currently excels at ownership, privacy, and longevity.',
      },
      {
        q: 'What happens if my device breaks with local-first software?',
        a: 'This is the main trade-off: you’re responsible for backups. Local-first apps often include export features (Markdown, JSON, PDF) so you can back up or migrate. The discipline of exporting regularly replaces the illusion of safety that cloud sync provides.',
      },
    ],
    sections: [
      {
        h2: 'What "local-first" actually means',
        blocks: [
          { k: 'p', t: 'In 2019, a group of researchers at Ink & Switch published an essay that gave a name to an old idea: *local-first software*. The core insight is simple — in cloud apps, the server is the primary copy of your data and your device is just a cache. In local-first apps, the roles flip: your device holds the authoritative copy, and servers (if they exist at all) are secondary backups for syncing across devices.' },
          { k: 'p', t: 'The essay laid out seven ideals:' },
          { k: 'ul', items: [
            'No spinners: your work is at your fingertips, not waiting on a server.',
            'Your work is not trapped on one device.',
            'The network is optional — offline is a first-class state, not an error.',
            'Seamless collaboration with colleagues.',
            'The Long Now: your data is preserved for the long term.',
            'Security and privacy by default.',
            'You retain ultimate ownership and control.',
          ]},
          { k: 'p', t: 'Not every app achieves all seven, but the direction is clear: the user’s data should serve the user, not the platform.' },
        ],
      },
      {
        h2: 'Why this matters for students specifically',
        blocks: [
          { k: 'p', t: 'Students are unusually vulnerable to platform risk. Your notes, flashcards, and study materials represent years of intellectual work — but they live in apps that can:' },
          { k: 'ul', items: [
            'Shut down (Google Reader, countless startups, your favorite note app from 2019)',
            'Change terms (suddenly your data trains AI models, or requires a subscription)',
            'Lose data (sync conflicts, account bans, accidental deletions that propagate everywhere)',
            'Hold you hostage (export formats that are incomplete, proprietary, or require the app to read)',
          ]},
          { k: 'p', t: 'A local-first app eliminates most of these risks. Your notes live in a file on your device — they survive the company going bankrupt, the service shutting down, or the platform changing its mind. The app can disappear; your work doesn’t.' },
        ],
      },
      {
        h2: 'The honest trade-offs',
        blocks: [
          { k: 'p', t: 'Local-first isn’t free. The trade-offs are real:' },
          { k: 'ul', items: [
            'Sync is harder. Real-time collaboration across devices is genuinely difficult without a server. Many local-first apps offer sync, but it’s often less seamless than cloud-native tools.',
            'Backup is your responsibility. Cloud apps *feel* safe because the provider handles redundancy. Local-first means you need to export or sync regularly — the discipline replaces the illusion.',
            'Collaboration features lag. Google Docs-style simultaneous editing is still a cloud advantage. Local-first tools are catching up but aren’t there yet for heavy collaboration.',
            'Device loss = data loss (without backup). If your laptop dies and you haven’t exported, your notes are gone. Cloud apps at least offer account recovery.',
          ]},
          { k: 'p', t: 'For most students, these trade-offs are worth it — you’re not collaborating on a novel in real-time; you’re taking notes, making flashcards, and planning your week. The ownership and privacy advantages outweigh the sync conveniences.' },
        ],
      },
      {
        h2: 'What to look for in a local-first notes app',
        blocks: [
          { k: 'p', t: 'Not all "offline-capable" apps are local-first. Here’s what to check:' },
          { k: 'ul', items: [
            'Where does the data live? If the answer is "our servers," it’s not local-first. Look for "your device" or "local storage."',
            'Can you export everything? Full export in an open format (Markdown, JSON, plain text) means you’re never locked in.',
            'Does it work fully offline? Not just "cached" — genuinely functional without a network connection.',
            'Who owns the data? Check the privacy policy. "We don’t sell your data" is different from "we can’t access your data."',
            'What happens if the company disappears? Local-first apps that store data in open formats on your device survive the company. Cloud apps don’t.',
          ]},
        ],
      },
      {
        h2: 'Iterra’s approach',
        blocks: [
          { k: 'p', t: 'Iterra is built local-first by design. Your notes, flashcards, schedules, and study materials live in your browser’s local storage — no account required, no server holding your data hostage. The nine tools share a local workspace that works offline, exports when you need it to, and never requires you to trust a platform with your intellectual life.' },
          { k: 'p', t: 'This isn’t an accident of architecture — it’s a commitment to the principle that *your work belongs to you*. The terrain is yours; the apps are just tools that help you work in it.' },
          { k: 'tool', tool: 'ink', t: 'Ink keeps your notes local-first — wiki-links, daily pages, course tags, all in your browser.' },
          { k: 'tool', tool: 'margin', t: 'Margin stores your study materials locally — recordings, PDFs, handouts — filed by course.' },
        ],
      },
      {
        h2: 'The bottom line',
        blocks: [
          { k: 'p', t: 'Local-first software isn’t a luxury or a niche preference — it’s the difference between renting your own intellectual output and owning it. For students, whose notes and study materials are often their most valuable assets, this isn’t about ideology. It’s about not losing years of work because a platform changed its mind, went bankrupt, or decided your data was more valuable as training material than as yours.' },
          { k: 'p', t: 'Choose tools that treat your data as yours. The best ones already do.' },
        ],
      },
    ],
  },
];

export const GUIDE_BY_SLUG = Object.fromEntries(GUIDES.map((g) => [g.slug, g]));
