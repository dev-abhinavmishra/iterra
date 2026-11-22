import type { StoreEntity } from '../hub';

export interface StudyStep {
  id: string;
  title: string;
  detail: string;
  url: string;
  minutes: number;
  completesWhen?: 'assignment-done' | 'deck-reviewed';
}

export interface StudyPlan {
  course: StoreEntity;
  reason: string;
  steps: StudyStep[];
  setup: boolean;
  commitmentId?: string;
  courseQueue: CoursePriority[];
}

interface CoursePriority {
  course: StoreEntity;
  openTasks: number;
  dueCards: number;
  dueProblems: number;
  nextDeadline?: number;
  nextTask?: string;
}

interface Options {
  minutes: number;
  now: number;
  courseRef?: string;
  commitmentId?: string;
  materialRef?: string;
  unfinished?: { courseKey: string; stepIds: string[] };
}

const code = (e: StoreEntity) => e.course ?? (typeof e.data?.code === 'string' ? e.data.code : '');
const fold = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
const date = (value: unknown) => typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
const due = (e: StoreEntity) => date(e.data?.dueAt);
const recent = (e: StoreEntity) => e.updatedAt ?? e.createdAt ?? 0;
const DAY = 86_400_000;
const open = (e: StoreEntity) => e.app === 'syllabus' && e.type === 'commitment' && e.data?.status === 'open';
const studyItemTypes = new Set(['commitment', 'deck', 'problem', 'attempt', 'note', 'session']);

export function studyCourses(entities: StoreEntity[]) {
  return entities.filter(e => e.app === 'syllabus' && e.type === 'course' && e.data?.archived !== true && code(e))
    .sort((a, b) => code(a).localeCompare(code(b)) || a.key.localeCompare(b.key));
}

export function courseCode(course: StoreEntity) {
  return code(course);
}

const reviewCount = (e: StoreEntity) =>
  typeof e.data?.due === 'number' && Number.isFinite(e.data.due) ? Math.max(0, Math.floor(e.data.due)) : 0;

/** A time budget and existing records are enough. No records are created on preview. */
export function buildStudyPlan(entities: StoreEntity[], options: Options): StudyPlan | null {
  const { now, courseRef, commitmentId, materialRef } = options;
  const courses = studyCourses(entities);
  if (!courses.length) return null;
  const matches = courseRef ? courses.filter(c => fold(code(c)) === fold(courseRef)) : [];
  const requested = courseRef && (courses.find(c => c.key === courseRef || c.id === courseRef) ??
    (matches.length === 1 ? matches[0] : undefined));
  if (courseRef && !requested) return null;

  const coursesByRef = new Map(courses.flatMap(course => [[course.id, course], [course.key, course]] as const));
  const coursesByCode = new Map<string, StoreEntity | null>();
  for (const course of courses) {
    const normalized = fold(code(course));
    coursesByCode.set(normalized, coursesByCode.has(normalized) ? null : course);
  }
  const itemsByCourse = new Map(courses.map(course => [course.key, [] as StoreEntity[]]));
  for (const entity of entities) {
    if (!studyItemTypes.has(entity.type)) continue;
    const course = entity.courseId ? coursesByRef.get(entity.courseId)
      : entity.course && coursesByCode.get(fold(entity.course));
    if (course) itemsByCourse.get(course.key)!.push(entity);
  }

  const groups = courses.map(course => {
    const items = itemsByCourse.get(course.key)!;
    const commitments = items.filter(open).sort((a, b) =>
      (Number.isFinite(due(a)) ? due(a) : Number.MAX_VALUE) -
      (Number.isFinite(due(b)) ? due(b) : Number.MAX_VALUE));
    const decks = items.filter(e => e.app === 'flashcards' && e.type === 'deck');
    const problems = items.filter(e => e.app === 'proof' && e.type === 'problem');
    const review = problems.filter(p => due(p) <= now);
    const lastStudy = items.reduce((latest, e) =>
      e.app === 'timer' && e.type === 'session' && e.data?.type !== 'break'
        ? Math.max(latest, date(e.data?.endedAt) || e.createdAt || 0) : latest, 0);
    const deadline = commitments[0] ? due(commitments[0]) : NaN;
    const dueCards = decks.reduce((sum, d) => sum + reviewCount(d), 0);
    const summary: CoursePriority = {
      course,
      openTasks: commitments.length,
      dueCards,
      dueProblems: review.length,
      nextDeadline: Number.isFinite(deadline) ? deadline : undefined,
      nextTask: commitments[0]?.title,
    };
    const priority = (deadline <= now ? 600 : deadline <= now + DAY ? 500 : deadline <= now + 3 * DAY ? 300 :
      deadline <= now + 7 * DAY ? 160 : commitments.length ? 35 : 0) +
      Math.min(90, dueCards * 4) + Math.min(90, review.length * 30) +
      (items.some(e => e.type === 'note') ? 5 : 0);
    return { course, items, commitments, decks, problems, review, lastStudy, priority, summary };
  }).sort((a, b) => b.priority - a.priority ||
    (a.summary.nextDeadline ?? Number.MAX_VALUE) - (b.summary.nextDeadline ?? Number.MAX_VALUE) ||
    a.lastStudy - b.lastStudy);

  const { course, items, commitments, decks, problems, review } =
    (requested ? groups.find(group => group.course.key === requested.key) : undefined) ?? groups[0];
  const budget = Number.isFinite(options.minutes) ? Math.max(1, Math.min(180, Math.round(options.minutes))) : 25;
  const assignment = commitmentId
    ? commitments.find(e => e.id === commitmentId || e.key === commitmentId)
    : commitments[0];
  const linked = materialRef ? items.find(e => e.key === materialRef) : undefined;
  const unfinished = new Set(options.unfinished?.courseKey === course.key ? options.unfinished.stepIds : []);
  const carryFirst = (a: StoreEntity, b: StoreEntity) => Number(unfinished.has(b.key)) - Number(unfinished.has(a.key));
  const note = items.filter(e => e.type === 'note' && ['ink', 'margin'].includes(e.app))
    .sort((a, b) => carryFirst(a, b) || recent(b) - recent(a))[0];
  const deck = decks.filter(e => reviewCount(e) > 0)
    .sort((a, b) => carryFirst(a, b) || reviewCount(b) - reviewCount(a))[0];
  const latestAttempts = new Map<string, StoreEntity>();
  for (const item of items) {
    const problemId = item.data?.problemId;
    if (item.app !== 'proof' || item.type !== 'attempt' || typeof problemId !== 'string' || item.data?.result == null) continue;
    const previous = latestAttempts.get(problemId);
    if (!previous || recent(item) > recent(previous)) latestAttempts.set(problemId, item);
  }
  const problem = review.sort((a, b) => carryFirst(a, b) || due(a) - due(b))[0] ??
    problems.filter(p => latestAttempts.get(p.id)?.data?.result === 'incorrect').sort(carryFirst)[0];

  type Candidate = Omit<StudyStep, 'minutes'> & { weight: number };
  const steps: Candidate[] = [];
  const add = (item: StoreEntity | undefined, title: string, detail: string, url: string, weight: number,
    completesWhen?: StudyStep['completesWhen']) => {
    if (item && !steps.some(s => s.id === item.key)) {
      const guidance = unfinished.has(item.key) ? `From your last session. ${detail}` : detail;
      steps.push({ id: item.key, title: `${title}: ${item.title || 'Untitled'}`, detail: guidance, url, weight, completesWhen });
    }
  };
  const addMaterial = (e: StoreEntity, weight: number) => {
    const id = encodeURIComponent(e.id);
    if (e.app === 'flashcards' && e.type === 'deck') {
      const count = reviewCount(e);
      add(e, 'Review cards', count ? `${count} to review. Recall each answer before flipping.` : 'Recall the answers before flipping.',
        `/apps/flashcards/?deck=${id}&p=learn`, weight, count > 0 ? 'deck-reviewed' : undefined);
    } else if (e.app === 'proof' && e.type === 'problem') {
      add(e, 'Practice a problem', due(e) <= now ? 'This problem is due for review. Try it before opening a hint.' : 'Try the problem again before opening a hint.', `/apps/proof/?problem=${id}`, weight);
    } else if (e.type === 'note' && ['ink', 'margin'].includes(e.app) && e.url?.startsWith(`/apps/${e.app}/`)) {
      add(e, 'Review your notes', 'Recall the main idea from memory, then check what you missed.', e.url, weight);
    }
  };
  if (linked) addMaterial(linked, 3);
  if (assignment) {
    add(assignment, 'Work on', due(assignment) <= now ? 'This task is due. Start with the next unfinished part.' :
      'Make progress on your next open task.', `/apps/syllabus/?commitment=${encodeURIComponent(assignment.id)}`, 3, 'assignment-done');
  }
  if (deck) addMaterial(deck, 2);
  if (problem) addMaterial(problem, 2);
  if (note) addMaterial(note, 1);

  const deadline = assignment ? due(assignment) : NaN;
  const reason = deadline <= now ? 'You have a task due now.' :
    deadline <= now + DAY ? 'You have a deadline within 24 hours.' :
      deck || problem ? 'You have material ready to review.' :
        assignment || note || linked ? 'You have saved work to pick up.' :
          'A few setup steps will give Iterra something to plan around.';
  const setup = steps.length === 0;
  if (setup) {
    steps.push({ id: 'schedule', title: 'Paste your course schedule', detail: 'Bring in the deadlines from your syllabus or class calendar in one pass.',
      url: `/apps/syllabus/?importSchedule=${encodeURIComponent(course.id)}`, weight: 2 });
    steps.push({ id: 'plan', title: 'Add your next assignment', detail: 'Have one deadline handy? Add it so Iterra can prioritize it in your next session.',
      url: `/apps/syllabus/?addAssignment=${encodeURIComponent(course.id)}`, weight: 1 });
    steps.push({ id: 'materials', title: 'Gather what you need to study', detail: 'Open this course to add notes or link study materials so future sessions can use them.',
      url: `#/c/${encodeURIComponent(code(course))}`, weight: 1 });
  }
  const selected = steps.slice(0, Math.min(4, Math.max(1, Math.floor(budget / 5))));
  const minimum = Math.min(5, budget);
  let available = budget - minimum * selected.length;
  let weightLeft = selected.reduce((sum, step) => sum + step.weight, 0);
  return {
    course,
    reason,
    setup,
    courseQueue: groups.map(group => group.summary),
    ...(assignment && selected.some(s => s.id === assignment.key) ? { commitmentId: assignment.id } : {}),
    steps: selected.map(({ weight, ...step }) => {
      const extra = Math.round(available * weight / weightLeft);
      available -= extra;
      weightLeft -= weight;
      return { ...step, minutes: minimum + extra };
    }),
  };
}
