import { describe, expect, it, vi } from 'vitest';
import { initialNotes } from '../apps/ink/store';
import {
  applyNativeDelta,
  createNativeStateStorage,
  diffNativeState,
  getNativePersistenceError,
  getNativePersistenceErrorPhase,
  mergeUnhydratedNativeState,
  nativePersistenceTestReset,
  type NativeStateKey,
} from './nativePersistence';

const inkKey: NativeStateKey = 'ink-notes-storage';
const folioKey: NativeStateKey = 'syllabus.folio.v1';

describe('native store delta reconciliation', () => {
  it('treats a pre-hydration default snapshot as additive and preserves saved values', () => {
    const savedFolio = {
      settings: { ...{ timerBaseUrl: '/timer', studyWindowStart: '08:30' } },
      terms: { term1: { id: 'term1', name: 'Fall' } },
      courses: { course1: { id: 'course1', code: 'BIO' } },
    };
    const unhydratedFolio = {
      settings: { timerBaseUrl: '/apps/timer', studyWindowStart: '16:00' },
      terms: {}, courses: {}, commitments: { newTask: { id: 'newTask', title: 'New task' } },
    };
    const folio = mergeUnhydratedNativeState(folioKey, savedFolio, unhydratedFolio);
    expect(folio.settings).toEqual(savedFolio.settings);
    expect(folio.terms).toEqual(savedFolio.terms);
    expect(folio.courses).toEqual(savedFolio.courses);
    expect(folio.commitments).toEqual(unhydratedFolio.commitments);

    const savedInk = {
      notes: [{ id: 'saved', title: 'Saved note', content: 'body' }],
      folders: [{ id: 'folder1', name: 'Research' }],
      drafts: { saved: [{ title: 'Checkpoint', content: 'draft' }] },
      prefs: { editorTextSize: 'lg', wetInk: false, typewriter: true },
      sortOrder: 'title',
    };
    const unhydratedInk = {
      notes: [...initialNotes, { id: 'new', title: 'Early note', content: 'early body' }],
      folders: [{ id: 'folder2', name: 'New folder' }],
      drafts: {},
      prefs: { editorTextSize: 'md', wetInk: true, typewriter: false },
      sortOrder: 'modified',
    };
    const ink = mergeUnhydratedNativeState(inkKey, savedInk, unhydratedInk);
    expect(ink.notes).toEqual([...savedInk.notes, { id: 'new', title: 'Early note', content: 'early body' }]);
    expect(ink.folders).toEqual([...savedInk.folders, ...unhydratedInk.folders]);
    expect(ink.drafts).toEqual(savedInk.drafts);
    expect(ink.prefs).toEqual(savedInk.prefs);
    expect(ink.sortOrder).toBe('title');
  });

  it('reports a failed native hydration and clears it only after an explicit successful retry', async () => {
    await nativePersistenceTestReset();
    const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('IndexedDB unavailable for retry test');
    });
    const storage = createNativeStateStorage(folioKey);
    await expect(storage.getItem(folioKey)).rejects.toThrow('IndexedDB unavailable for retry test');
    expect(getNativePersistenceError(folioKey)?.message).toContain('IndexedDB unavailable for retry test');
    expect(getNativePersistenceErrorPhase(folioKey)).toBe('hydrate');
    open.mockRestore();

    await expect(storage.getItem(folioKey)).resolves.toMatch(/activeTermId/);
    expect(getNativePersistenceError(folioKey)).toBeNull();
    expect(getNativePersistenceErrorPhase(folioKey)).toBeNull();
    await nativePersistenceTestReset();
  });

  it('merges distinct Ink and Planning additions from the same stale baseline', () => {
    const inkBase = { notes: [{ id: 'seed', title: 'Seed', content: 'body' }], folders: [], drafts: {} };
    const inkA = { ...inkBase, notes: [...inkBase.notes, { id: 'a', title: 'A', content: 'A body' }] };
    const inkB = { ...inkBase, notes: [...inkBase.notes, { id: 'b', title: 'B', content: 'B body' }] };
    const inkAfterA = applyNativeDelta(inkBase, {}, inkKey, diffNativeState(inkKey, inkBase, inkA));
    const inkAfterB = applyNativeDelta(inkAfterA.state, inkAfterA.recordRevisions, inkKey, diffNativeState(inkKey, inkBase, inkB));
    expect(inkAfterB.state.notes.map((note: any) => note.id).sort()).toEqual(['a', 'b', 'seed']);

    const folioBase = { commitments: { seed: { id: 'seed', title: 'Seed' } }, courses: { c1: { id: 'c1', code: 'BIO' } } };
    const folioA = { ...folioBase, commitments: { ...folioBase.commitments, a: { id: 'a', title: 'A' } } };
    const folioB = { ...folioBase, commitments: { ...folioBase.commitments, b: { id: 'b', title: 'B' } } };
    const folioAfterA = applyNativeDelta(folioBase, {}, folioKey, diffNativeState(folioKey, folioBase, folioA));
    const folioAfterB = applyNativeDelta(folioAfterA.state, folioAfterA.recordRevisions, folioKey, diffNativeState(folioKey, folioBase, folioB));
    expect(Object.keys(folioAfterB.state.commitments).sort()).toEqual(['a', 'b', 'seed']);
    expect(folioAfterB.state.courses).toEqual(folioBase.courses);
  });

  it('applies separate field edits to one Ink note and gives same-field conflicts to the later commit', () => {
    const base = { notes: [{ id: 'n1', title: 'Old', content: 'Old body', trashedAt: null }] };
    const revisions = { 'notes:n1': 1 };
    const titleEdit = { notes: [{ ...base.notes[0], title: 'New title' }] };
    const contentEdit = { notes: [{ ...base.notes[0], content: 'New body' }] };
    const first = applyNativeDelta(base, revisions, inkKey, diffNativeState(inkKey, base, titleEdit, revisions));
    const second = applyNativeDelta(first.state, first.recordRevisions, inkKey, diffNativeState(inkKey, base, contentEdit, revisions));
    expect(second.state.notes[0]).toEqual({ id: 'n1', title: 'New title', content: 'New body', trashedAt: null });

    const sameFieldA = { notes: [{ ...base.notes[0], title: 'Tab A' }] };
    const sameFieldB = { notes: [{ ...base.notes[0], title: 'Tab B' }] };
    const a = applyNativeDelta(base, revisions, inkKey, diffNativeState(inkKey, base, sameFieldA, revisions));
    const b = applyNativeDelta(a.state, a.recordRevisions, inkKey, diffNativeState(inkKey, base, sameFieldB, revisions));
    expect(b.state.notes[0].title).toBe('Tab B');
  });

  it('does not resurrect a row when a stale edit lands after deletion', () => {
    const base = { notes: [{ id: 'n1', title: 'Before', content: 'body' }] };
    const revisions = { 'notes:n1': 4 };
    const deleted = applyNativeDelta(base, revisions, inkKey, diffNativeState(inkKey, base, { notes: [] }, revisions));
    const staleEdit = { notes: [{ ...base.notes[0], title: 'Edited in old tab' }] };
    const afterEdit = applyNativeDelta(deleted.state, deleted.recordRevisions, inkKey, diffNativeState(inkKey, base, staleEdit, revisions));
    expect(afterEdit.state.notes).toEqual([]);
    expect(afterEdit.recordRevisions).toEqual(deleted.recordRevisions);
  });

  it('merges separate Planning commitment fields while same-field conflicts use commit order', () => {
    const base = { commitments: { k1: { id: 'k1', title: 'Lab', loggedMinutes: 0, status: 'open' } } };
    const revisions = { 'commitments:k1': 2 };
    const titleEdit = { commitments: { k1: { ...base.commitments.k1, title: 'Lab report' } } };
    const timerCredit = { commitments: { k1: { ...base.commitments.k1, loggedMinutes: 25 } } };
    const first = applyNativeDelta(base, revisions, folioKey, diffNativeState(folioKey, base, titleEdit, revisions));
    const second = applyNativeDelta(first.state, first.recordRevisions, folioKey, diffNativeState(folioKey, base, timerCredit, revisions));
    expect(second.state.commitments.k1).toEqual({ id: 'k1', title: 'Lab report', loggedMinutes: 25, status: 'open' });

    const creditA = { commitments: { k1: { ...base.commitments.k1, loggedMinutes: 25 } } };
    const creditB = { commitments: { k1: { ...base.commitments.k1, loggedMinutes: 40 } } };
    const a = applyNativeDelta(base, revisions, folioKey, diffNativeState(folioKey, base, creditA, revisions));
    const b = applyNativeDelta(a.state, a.recordRevisions, folioKey, diffNativeState(folioKey, base, creditB, revisions));
    expect(b.state.commitments.k1.loggedMinutes).toBe(40);
  });

  it('keeps restore and delete operations explicit and preserves drafts/folders metadata', () => {
    const base = {
      notes: [{ id: 'n1', title: 'Trashed', content: 'body', trashedAt: 10 }],
      folders: [{ id: 'f1', name: 'Research' }],
      drafts: { n1: [{ title: 'Checkpoint', content: 'draft', wordCount: 1, savedAt: 10 }] },
      activeNoteId: 'n1', activeFolder: 'Research',
    };
    const restored = { ...base, notes: [{ ...base.notes[0], trashedAt: null }] };
    const result = applyNativeDelta(base, { 'notes:n1': 1 }, inkKey, diffNativeState(inkKey, base, restored, { 'notes:n1': 1 }));
    expect(result.state.notes[0].trashedAt).toBeNull();
    expect(result.state.folders).toEqual(base.folders);
    expect(result.state.drafts).toEqual(base.drafts);
    expect(result.state.activeNoteId).toBe('n1');
  });

  it('keeps a multi-commitment add in one complete delta', () => {
    const base = { commitments: { seed: { id: 'seed', title: 'Seed' } }, courses: { c1: { id: 'c1' } } };
    const next = { ...base, commitments: {
      ...base.commitments, a: { id: 'a', title: 'A' }, b: { id: 'b', title: 'B' },
    } };
    const delta = diffNativeState(folioKey, base, next);
    expect(delta).toHaveLength(2);
    const applied = applyNativeDelta(base, {}, folioKey, delta);
    expect(Object.keys(applied.state.commitments).sort()).toEqual(['a', 'b', 'seed']);
  });
});
