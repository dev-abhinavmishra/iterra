import { expect, it } from 'vitest';
import type { StoreEntity } from '../../hub';
import { fitPriorities, planningForDay } from './planning';

const date = '2026-11-19';
const row = (type: string, id: string, data: StoreEntity['data'], courseId?: string): StoreEntity => ({
  key: `syllabus:${type}:${id}`, app: 'syllabus', type, id, title: id, courseId, data,
});

it('reuses deadlines and remaining effort, and reserves existing work on the selected date', () => {
  const rows = [
    row('commitment', 'Lab report', { status: 'open', dueAt: '2026-11-20', estimatedMinutes: 60, loggedMinutes: 37 }),
    row('commitment', 'Reading', { status: 'open', dueAt: '2026-11-23', estimatedMinutes: 50 }),
    row('commitment', 'Already planned', { status: 'open', dueAt: date }),
    row('commitment', 'Complete', { status: 'done', dueAt: date }),
    row('course', 'archive', { archived: true }),
    row('commitment', 'Old work', { status: 'open', dueAt: date }, 'syllabus:course:archive'),
    row('block', 'lab', { commitmentId: 'Already planned', plannedDate: date, plannedStart: '09:00', plannedMinutes: 45, state: 'planned' }),
    row('block', 'done', { commitmentId: 'Reading', plannedDate: date, plannedStart: '11:00', plannedMinutes: 30, state: 'done' }),
    row('block', 'tomorrow', { commitmentId: 'Reading', plannedDate: '2026-11-20', plannedStart: '13:00', plannedMinutes: 60, state: 'planned' }),
  ];
  expect(planningForDay(rows, date)).toEqual({
    busy: [{ start: 540, end: 585 }],
    priorities: [
      expect.objectContaining({ id: 'Lab report', estimateMin: 30 }),
      expect.objectContaining({ id: 'Reading', estimateMin: 60 }),
    ],
  });
});

it('places tasks by priority in available gaps without mutating existing blocks', () => {
  const busy = [{ start: 540, end: 585 }, { start: 630, end: 660 }];
  expect(fitPriorities([
    { id: 'lab', estimateMin: 30 },
    { id: 'reading', estimateMin: 45 },
    { id: 'short', estimateMin: 15 },
    { id: 'cannot-fit' },
  ], busy, 535, 705)).toEqual([
    { taskId: 'lab', start: 585, end: 615 },
    { taskId: 'reading', start: 660, end: 705 },
    { taskId: 'short', start: 615, end: 630 },
  ]);
  expect(busy).toHaveLength(2);
});
