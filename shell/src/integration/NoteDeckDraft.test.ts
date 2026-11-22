// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MODAL_EVENT, openNoteDeckDraft } from './ModalsHost';
import { NATIVE_STATE_DB, nativePersistenceTestReset } from './nativePersistence';

async function clearNativeState(): Promise<void> {
  await nativePersistenceTestReset();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(NATIVE_STATE_DB);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not reset native state for NoteDeck test.'));
    request.onblocked = () => reject(new Error('Native state reset was blocked in NoteDeck test.'));
  });
  await nativePersistenceTestReset();
}

beforeEach(async () => {
  await clearNativeState();
  localStorage.clear();
});

afterEach(async () => {
  await clearNativeState();
  localStorage.clear();
});

it('drafts from the exact saved note and carries its course into the preview', async () => {
  const note = { id: 'saved', title: 'Lab notes', course: 'BIO 201', courseId: 'syllabus:course:b' };
  localStorage.setItem('ink-notes-storage', JSON.stringify({ state: { notes: [
    { ...note, id: 'different', content: 'This is a different note with the same title.' },
    { ...note, content: 'Osmosis: Water crosses a membrane.\nDiffusion: Particles spread out.' },
  ] } }));

  const opened = vi.fn();
  const error = vi.fn();
  window.addEventListener(MODAL_EVENT, opened, { once: true });
  try {
    await openNoteDeckDraft({ app: 'ink', type: 'note', id: note.id }, error);
    expect(error).not.toHaveBeenCalled();
    expect(opened).toHaveBeenCalledOnce();
    expect(opened.mock.calls[0][0].detail).toMatchObject({
      kind: 'create-deck',
      sourceRef: { app: 'ink', type: 'note', id: note.id },
      selectedText: 'Osmosis: Water crosses a membrane.\n\nDiffusion: Particles spread out.',
      initialCourse: note.course,
      initialCourseId: note.courseId,
    });
    expect(localStorage.getItem('cardfile.decks.v1')).toBeNull();
  } finally {
    window.removeEventListener(MODAL_EVENT, opened);
  }
});

it('gives a next step for an empty note without opening a draft or creating a deck', async () => {
  localStorage.setItem('ink-notes-storage', JSON.stringify({ state: { notes: [{ id: 'empty', content: ' ' }] } }));
  const proceed = vi.fn();
  const error = vi.fn();
  await openNoteDeckDraft({ app: 'ink', type: 'note', id: 'empty' }, error, proceed);
  expect(error).toHaveBeenCalledWith('Add some text to this note before creating flashcards.');
  expect(proceed).not.toHaveBeenCalled();
  expect(localStorage.getItem('cardfile.decks.v1')).toBeNull();
});
