// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCreateCommitment } from '../integration/commands';
import {
  NATIVE_STATE_DB,
  nativePersistenceTestReset,
  readNativeStore,
} from '../integration/nativePersistence';

const put = vi.fn(async (entity: Record<string, unknown>) => ({ ok: true, entity }));

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  delete (window as any).__syllabusFolioStore;
  put.mockClear();
  (window as any).iterra = {
    store: { put },
    events: { emit: vi.fn(async () => {}) },
  };
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(NATIVE_STATE_DB);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
  await nativePersistenceTestReset();
});

describe('createCommitment command', () => {
  it('persists a real folio commitment and publishes course + commitment entities', async () => {
    const result = await handleCreateCommitment({
      title: 'Biology quiz',
      course: 'BIO 101',
      dueDate: '2999-01-16',
      estimatedMinutes: 45,
    });

    expect(result.ok).toBe(true);
    expect(result.data?.commitmentId).toBeTruthy();
    expect(result.data?.course).toBe('BIO 101');

    const folio = await readNativeStore('syllabus.folio.v1') as any;
    const commitment = folio.commitments[result.data!.commitmentId];
    expect(commitment).toMatchObject({
      title: 'Biology quiz',
      type: 'assignment',
      status: 'open',
      estimatedMinutes: 45,
      loggedMinutes: 0,
    });
    expect(commitment.dueAt).toBeTruthy();
    const course = folio.courses[commitment.courseId];
    expect(course).toMatchObject({ code: 'BIO 101', name: 'BIO 101' });
    expect(Object.values(folio.terms || {})).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: course.termId })]),
    );

    const published = put.mock.calls.map(([entity]) => entity);
    expect(published).toEqual(expect.arrayContaining([
      expect.objectContaining({ app: 'syllabus', type: 'course', course: 'BIO 101' }),
      expect.objectContaining({
        app: 'syllabus',
        type: 'commitment',
        id: result.data!.commitmentId,
        course: 'BIO 101',
        data: expect.objectContaining({ status: 'open', estimatedMinutes: 45 }),
      }),
    ]));
  });

  it('files under a general course when none is given', async () => {
    const result = await handleCreateCommitment({
      title: 'Reading response',
      dueDate: '2999-01-17',
    });

    expect(result.ok).toBe(true);
    const folio = await readNativeStore('syllabus.folio.v1') as any;
    const commitment = folio.commitments[result.data!.commitmentId];
    expect(commitment.title).toBe('Reading response');
    expect(folio.courses[commitment.courseId]).toBeTruthy();
  });

  it('rejects a missing due date without writing folio state', async () => {
    const result = await handleCreateCommitment({ title: 'No date' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_DUE');
    const folio = await readNativeStore('syllabus.folio.v1') as any;
    expect(Object.keys(folio?.commitments || {})).toHaveLength(0);
    expect(put).not.toHaveBeenCalled();
  });
});
