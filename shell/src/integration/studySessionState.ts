import { courseCode, type StudyPlan, type StudyStep } from './studyPlan';

export const STUDY_SESSION_KEY = 'iterra.study-session.progress.v1';

export interface SessionChecklist {
  courseKey: string;
  courseCode: string;
  steps: StudyStep[];
}

interface SavedStudySession {
  sessionKey: string;
  plan?: SessionChecklist;
  checked: string[];
}

let unsaved: SavedStudySession | null = null;

export function checkSessionPlan(value: unknown): SessionChecklist | undefined {
  if (!value || typeof value !== 'object') return;
  const { courseKey, courseCode, steps } = value as SessionChecklist;
  if (typeof courseKey !== 'string' || !courseKey || typeof courseCode !== 'string' || !courseCode.trim() ||
    !Array.isArray(steps) || !steps.length || steps.length > 4) return;
  if (!steps.every(step => step && typeof step.id === 'string' && typeof step.title === 'string' &&
    typeof step.detail === 'string' && typeof step.url === 'string' &&
    /^\/apps\/(syllabus|flashcards|proof|ink|margin)\//.test(step.url) &&
    Number.isInteger(step.minutes) && step.minutes > 0)) return;
  return { courseKey, courseCode, steps };
}

export function makeSessionChecklist(plan: StudyPlan): SessionChecklist {
  return { courseKey: plan.course.key, courseCode: courseCode(plan.course), steps: plan.steps };
}

export function readLatestStudySession(): SavedStudySession | null {
  if (unsaved) return unsaved;
  try {
    const saved = JSON.parse(localStorage.getItem(STUDY_SESSION_KEY) ?? 'null');
    if (typeof saved?.sessionKey === 'string') return {
      sessionKey: saved.sessionKey,
      plan: checkSessionPlan(saved.plan),
      checked: Array.isArray(saved.checked) ? saved.checked.filter((id: unknown) => typeof id === 'string') : [],
    };
  } catch { /* Keep the checklist usable with browser storage disabled. */ }
  return null;
}

export function readStudySession(sessionKey: string): SavedStudySession {
  const saved = readLatestStudySession();
  return saved?.sessionKey === sessionKey ? saved : { sessionKey, checked: [] };
}

export function unfinishedStudySteps(excludeSessionKey?: string) {
  const saved = readLatestStudySession();
  if (!saved?.plan || saved.sessionKey === excludeSessionKey || !saved.checked.length) return;
  return {
    courseKey: saved.plan.courseKey,
    stepIds: saved.plan.steps.filter(step => !saved.checked.includes(step.id)).map(step => step.id),
  };
}

export function writeStudySession(saved: SavedStudySession) {
  try {
    localStorage.setItem(STUDY_SESSION_KEY, JSON.stringify(saved));
    unsaved = null;
  } catch {
    unsaved = saved;
  }
}
