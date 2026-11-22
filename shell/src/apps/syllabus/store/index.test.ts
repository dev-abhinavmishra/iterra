import { afterEach, describe, expect, it, vi } from 'vitest';

const folioKey = 'syllabus.folio.v1' as const;

const seed = {
  activeTermId: 'term-fall',
  terms: { 'term-fall': { id: 'term-fall', name: 'Fall 2026' } },
  courses: { 'course-bio': { id: 'course-bio', termId: 'term-fall', code: 'BIO 201', name: 'Biology' } },
  commitments: {},
  blocks: {},
  links: {},
  reviews: {},
  settings: {
    timerBaseUrl: '/apps/timer',
    inkBaseUrl: '/apps/ink',
    modularBaseUrl: 'https://modularaistack.vercel.app',
    flashcardsBaseUrl: '/apps/flashcards',
    gradestackBaseUrl: '/apps/gradestack',
    studyWindowStart: '16:00',
    maxBlockMinutes: 90,
    defaultAvailableMinutes: 180,
    weekStartsOn: 1,
    motion: 'full',
  },
  dismissed: {},
};

async function loadSeededStore(version: number) {
  vi.resetModules();
  const native = await import('../../../integration/nativePersistence');
  await native.nativePersistenceTestReset();
  await native.replaceNativeStores({ [folioKey]: { state: seed, version } });

  const { useFolio } = await import('./index');
  if (version > 1) {
    // Unsupported migrations do not emit a finish-hydration event.
    await useFolio.persist.rehydrate();
  } else if (!useFolio.persist.hasHydrated()) {
    await new Promise<void>(resolve => {
      const unsubscribe = useFolio.persist.onFinishHydration(() => {
        unsubscribe();
        resolve();
      });
      if (useFolio.persist.hasHydrated()) {
        unsubscribe();
        resolve();
      }
    });
  }
  return { native, store: useFolio };
}

afterEach(async () => {
  vi.resetModules();
  const native = await import('../../../integration/nativePersistence');
  await native.nativePersistenceTestReset();
});

describe('Folio persist version migration', () => {
  it('hydrates populated version 0 data, upgrades it to v1, and keeps it through boot', async () => {
    const { native, store } = await loadSeededStore(0);

    expect(store.persist.hasHydrated()).toBe(true);
    expect(store.getState().courses).toEqual(seed.courses);
    expect(store.getState().terms).toEqual(seed.terms);

    store.getState().boot();
    await native.flushNativeStore(folioKey);

    const snapshot = await native.readNativeSnapshot(folioKey);
    expect(snapshot.version).toBe(1);
    expect(snapshot.state.courses).toEqual(seed.courses);
    expect(snapshot.state.terms).toEqual(seed.terms);
  });

  it('leaves populated version 1 data unchanged through hydration and boot', async () => {
    const { native, store } = await loadSeededStore(1);
    const before = await native.readNativeSnapshot(folioKey);

    expect(store.persist.hasHydrated()).toBe(true);
    expect(store.getState().courses).toEqual(seed.courses);
    store.getState().boot();
    await native.flushNativeStore(folioKey);

    const after = await native.readNativeSnapshot(folioKey);
    expect(after.version).toBe(1);
    expect(after.revision).toBe(before.revision);
    expect(after.state).toEqual(before.state);
  });

  it('rejects a future version without overwriting its native snapshot', async () => {
    const { native, store } = await loadSeededStore(2);
    const snapshot = await native.readNativeSnapshot(folioKey);

    expect(store.persist.hasHydrated()).toBe(false);
    expect(store.getState().courses).toEqual({});
    expect(snapshot.version).toBe(2);
    expect(snapshot.state.courses).toEqual(seed.courses);
  });
});
