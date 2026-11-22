import { expect, it } from 'vitest';
import { getPlaceComponent } from './index';
import { loadPlaceSafely, type PlaceLoaderDependencies, type PlaceLoadPhase } from './offlinePlaceLoader';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

it('does not import a cold place while offline, then imports only after preparation succeeds', async () => {
  let connected = false;
  let prepared = false;
  let imported = false;
  let releaseOnline!: () => void;
  const phases: PlaceLoadPhase[] = [];
  const dependencies: PlaceLoaderDependencies<string> = {
    isOnline: () => connected,
    prepare: async () => {
      if (!connected) return { ok: false, offline: true, error: 'uncached' };
      prepared = true;
      return { ok: true };
    },
    importPlace: async () => { imported = true; return 'loaded'; },
    waitForOnline: () => new Promise(resolve => { releaseOnline = resolve; }),
    waitForRetry: signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('canceled', 'AbortError')), { once: true })),
    delay: async () => {},
    onPhase: phase => phases.push(phase),
  };
  const controller = new AbortController();
  const pending = loadPlaceSafely(controller.signal, dependencies);
  await Promise.resolve();
  await Promise.resolve();
  expect(imported).toBe(false);
  expect(phases).toContain('offline');

  connected = true;
  releaseOnline();
  await expect(pending).resolves.toBe('loaded');
  expect(prepared).toBe(true);
  expect(imported).toBe(true);
  expect(phases.indexOf('preparing')).toBeLessThan(phases.indexOf('loading'));
});

it('opens an already-warmed place while offline without waiting for a network event', async () => {
  let imported = false;
  let waitedForNetwork = false;
  const phases: PlaceLoadPhase[] = [];
  const controller = new AbortController();
  const dependencies: PlaceLoaderDependencies<string> = {
    isOnline: () => false,
    prepare: async () => ({ ok: true }),
    importPlace: async () => { imported = true; return 'cached'; },
    waitForOnline: async () => { waitedForNetwork = true; },
    waitForRetry: async () => {},
    delay: async () => {},
    onPhase: phase => phases.push(phase),
  };

  await expect(loadPlaceSafely(controller.signal, dependencies)).resolves.toBe('cached');
  expect(imported).toBe(true);
  expect(waitedForNetwork).toBe(false);
  expect(phases).toEqual(['preparing', 'loading', 'ready']);
});

it('continues online when only offline storage failed and exposes that limitation', async () => {
  let imported = false;
  const phases: Array<[PlaceLoadPhase, string | undefined]> = [];
  const controller = new AbortController();
  const dependencies: PlaceLoaderDependencies<string> = {
    isOnline: () => true,
    prepare: async () => ({ ok: true, offlineReady: false, warning: 'Offline cache quota exceeded.' }),
    importPlace: async () => { imported = true; return 'network-loaded'; },
    waitForOnline: async () => {},
    waitForRetry: async () => {},
    delay: async () => {},
    onPhase: (phase, message) => phases.push([phase, message]),
  };

  await expect(loadPlaceSafely(controller.signal, dependencies)).resolves.toBe('network-loaded');
  expect(imported).toBe(true);
  expect(phases).toContainEqual(['loading', 'Offline cache quota exceeded.']);
});

it('bounds online preparation retries and waits for a reset instead of poisoning the lazy import', async () => {
  let attempts = 0;
  let imported = false;
  let reachedRetry = deferred();
  const controller = new AbortController();
  const dependencies: PlaceLoaderDependencies<string> = {
    isOnline: () => true,
    prepare: async () => { attempts += 1; return { ok: false, error: 'server unavailable' }; },
    importPlace: async () => { imported = true; return 'loaded'; },
    waitForOnline: async () => {},
    waitForRetry: signal => {
      reachedRetry.resolve();
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('canceled', 'AbortError')), { once: true }));
    },
    delay: async () => {},
    onPhase: () => {},
  };
  const pending = loadPlaceSafely(controller.signal, dependencies);
  await reachedRetry.promise;
  expect(attempts).toBe(3);
  expect(imported).toBe(false);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});

it('creates a new React.lazy type for an explicit retry generation', () => {
  const first = getPlaceComponent('timer', 71);
  expect(getPlaceComponent('timer', 71)).toBe(first);
  const retried = getPlaceComponent('timer', 72);
  expect(retried).not.toBe(first);
});
