import type { StoreEntity } from '../../hub';

export interface TimeRange { start: number; end: number }
type Priority = { id: string; estimateMin?: number };
type PlanningPriority = { id: string; title: string; course?: string; due: number; estimateMin?: number };

const minuteOfDay = (time: string) => {
  const match = /^(\d{2}):([0-5]\d)$/.exec(time);
  if (!match || Number(match[1]) > 24 || (match[1] === '24' && match[2] !== '00')) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
};

export function planningForDay(entities: StoreEntity[], date: string) {
  const busy: TimeRange[] = [];
  const alreadyScheduled = new Set<string>();
  const archivedCourses = new Set(entities.filter(row =>
    row.app === 'syllabus' && row.type === 'course' && row.data?.archived === true).map(row => row.key));
  for (const row of entities) {
    const data = row.data;
    if (row.app !== 'syllabus' || row.type !== 'block' || data?.plannedDate !== date ||
        archivedCourses.has(row.courseId ?? '') || !['planned', 'in-progress'].includes(String(data.state))) continue;
    const start = typeof data.plannedStart === 'string' ? minuteOfDay(data.plannedStart) : NaN;
    const duration = data.plannedMinutes;
    if (!Number.isFinite(start) || start >= 1440 || typeof duration !== 'number' ||
        !Number.isFinite(duration) || duration <= 0) continue;
    busy.push({ start, end: Math.min(start + duration, 1440) });
    if (typeof data.commitmentId === 'string') alreadyScheduled.add(data.commitmentId);
  }
  const priorities: PlanningPriority[] = [];
  for (const row of entities) {
    const data = row.data;
    const title = row.title?.trim();
    if (row.app !== 'syllabus' || row.type !== 'commitment' || data?.status !== 'open' ||
        !title || alreadyScheduled.has(row.id) || archivedCourses.has(row.courseId ?? '')) continue;
    const due = typeof data.dueAt === 'string' ? Date.parse(data.dueAt) : Number(data.dueAt ?? NaN);
    const estimate = typeof data.estimatedMinutes === 'number' ? data.estimatedMinutes : 0;
    const logged = typeof data.loggedMinutes === 'number' && Number.isFinite(data.loggedMinutes) ? Math.max(0, data.loggedMinutes) : 0;
    const remaining = estimate - logged;
    const estimateMin = Number.isFinite(estimate) && estimate > 0
      ? Math.max(15, Math.min(120, Math.ceil(remaining / 15) * 15)) : undefined;
    priorities.push({ id: row.id, title, course: row.course, due, estimateMin });
  }
  priorities.sort((a, b) => (Number.isFinite(a.due) ? a.due : Infinity) - (Number.isFinite(b.due) ? b.due : Infinity) ||
    a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  return { busy, priorities };
}

export function fitPriorities(priorities: Priority[], busy: TimeRange[], start: number, end: number) {
  const occupied = [...busy];
  const placements: (TimeRange & { taskId: string })[] = [];
  for (const task of priorities) {
    const duration = task.estimateMin && Number.isFinite(task.estimateMin) && task.estimateMin > 0
      ? task.estimateMin : 60;
    for (let at = Math.ceil(start / 15) * 15; at + duration <= end; at += 15) {
      if (occupied.some(slot => at < slot.end && at + duration > slot.start)) continue;
      const placement = { taskId: task.id, start: at, end: at + duration };
      occupied.push(placement);
      placements.push(placement);
      break;
    }
  }
  return placements;
}
