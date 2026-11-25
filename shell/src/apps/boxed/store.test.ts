import { beforeEach, describe, expect, it } from 'vitest';
import { board, parseCaptureLine, todayKey } from './store';

/* the store is a module singleton — reset its persisted blob and state
   between cases by re-seeding localStorage and reloading is overkill;
   instead each test clears the board through the public API. */

beforeEach(() => {
  localStorage.clear();
  board.mutate(() => ({
    date: todayKey(),
    days: {},
    dayStart: 6,
    dayEnd: 23,
    past: [],
    future: [],
  }));
});

describe('parseCaptureLine', () => {
  it('parses estimates and promotion marks', () => {
    expect(parseCaptureLine('read chapter 4 ~45')).toEqual({ title: 'read chapter 4', estimateMin: 45, promote: false });
    expect(parseCaptureLine('email prof !')).toEqual({ title: 'email prof', estimateMin: undefined, promote: true });
    expect(parseCaptureLine('! ship it ~90')).toEqual({ title: 'ship it', estimateMin: 90, promote: true });
    expect(parseCaptureLine('plain task')).toEqual({ title: 'plain task', estimateMin: undefined, promote: false });
    expect(parseCaptureLine('tilde ~5')).toEqual({ title: 'tilde', estimateMin: 5, promote: false });
    expect(parseCaptureLine('too long ~9999')).toEqual({ title: 'too long ~9999', estimateMin: undefined, promote: false });
  });
});

describe('board capture', () => {
  it('captureText splits lines and applies quick syntax', () => {
    const label = board.captureText('one thing\ntwo things ~30\nthree things !');
    expect(label).toBe('3 items added');
    const b = board.getState().days[todayKey()];
    expect(b.dumpOrder).toHaveLength(2);
    expect(b.topOrder).toHaveLength(1);
    const est = b.dumpOrder.map((id) => b.tasks[id].estimateMin);
    expect(est).toContain(30);
  });

  it('dedupes intake origins across days', () => {
    board.addTasks([{ title: 'from syllabus', origin: 'in_1' }], '2026-11-20');
    const { ids } = board.addTasks([{ title: 'from syllabus', origin: 'in_1' }], '2026-11-21');
    expect(ids).toHaveLength(0);
  });
});

describe('scheduling', () => {
  it('places blocks without overlap and reports adjusted starts', () => {
    const { ids } = board.addTasks([{ title: 'a', estimateMin: 60 }, { title: 'b', estimateMin: 60 }]);
    const [a, b] = ids;
    const r1 = board.scheduleTask(a, 9 * 60, 60);
    expect(r1.ok).toBe(true);
    const r2 = board.scheduleTask(b, 9 * 60, 60);
    expect(r2.ok).toBe(true);
    expect(r2.adjusted).toBe(true);
    expect(r2.start).toBe(10 * 60);
    const bd = board.getState().days[todayKey()];
    const blocks = Object.values(bd.blocks);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((x) => x.start).sort()).toEqual(['09:00', '10:00']);
  });

  it('rescheduling keeps the done stamp', () => {
    const { ids } = board.addTasks([{ title: 'a' }]);
    board.scheduleTask(ids[0], 9 * 60, 30);
    const bd = board.getState().days[todayKey()];
    const blk = Object.values(bd.blocks)[0];
    board.updateBlock(blk.id, { status: 'done', actualEnd: 123 });
    board.scheduleTask(ids[0], 14 * 60, 45);
    const after = board.getState().days[todayKey()];
    const moved = Object.values(after.blocks)[0];
    expect(moved.status).toBe('done');
    expect(moved.actualEnd).toBe(123);
    expect(moved.start).toBe('14:00');
    expect(moved.end).toBe('14:45');
  });

  it('placeBlocks lands a batch in one undo step', () => {
    const { ids } = board.addTasks([{ title: 'x' }, { title: 'y' }, { title: 'z' }]);
    const n = board.placeBlocks([
      { taskId: ids[0], startMin: 8 * 60, endMin: 9 * 60 },
      { taskId: ids[1], startMin: 8 * 60, endMin: 9 * 60 }, // collides → skipped
      { taskId: ids[2], startMin: 10 * 60, endMin: 11 * 60 },
    ]);
    expect(n).toBe(2);
    board.undo();
    expect(Object.keys(board.getState().days[todayKey()]?.blocks ?? {})).toHaveLength(0);
  });
});

describe('history', () => {
  it('undo/redo reverses captures and markMissed stays out of history', () => {
    board.captureText('task one');
    const { ids } = board.addTasks([{ title: 'task two' }]);
    board.scheduleTask(ids[0], 8 * 60, 30);
    const blkId = Object.keys(board.getState().days[todayKey()].blocks)[0];
    /* pretend the block elapsed without focus → missed, no history entry */
    const pastLen = board.getState().past.length;
    board.markMissed([blkId], 9 * 60);
    expect(board.getState().past.length).toBe(pastLen);
    expect(board.getState().days[todayKey()].blocks[blkId].status).toBe('missed');
    board.undo();
    expect(Object.keys(board.getState().days[todayKey()]?.blocks ?? {})).toHaveLength(0);
    board.undo();
    expect(board.getState().days[todayKey()].dumpOrder).toHaveLength(1);
    board.redo();
    expect(board.getState().days[todayKey()].dumpOrder).toHaveLength(2);
  });
});

describe('persistence', () => {
  it('round-trips the boxed.v1.state envelope', () => {
    board.captureText('persisted ~20');
    const raw = JSON.parse(localStorage.getItem('boxed.v1.state')!);
    expect(raw.date).toBe(todayKey());
    expect(Object.keys(raw.days[todayKey()].tasks)).toHaveLength(1);
    expect(raw.days[todayKey()].tasks[Object.keys(raw.days[todayKey()].tasks)[0]].estimateMin).toBe(20);
  });
});

