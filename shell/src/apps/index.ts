/* Place components — the eight study apps plus Boxed, mounted directly in
   the shell. Modules stay lazy; a cold place is prepared by the active
   service worker before its dynamic import can enter the browser module map. */
import { lazy, useSyncExternalStore, type ComponentType, type LazyExoticComponent } from 'react';
import { abortError, loadPlaceSafely, type PlaceLoadPhase, type ToolPrepareResult } from './offlinePlaceLoader';

export interface PlaceProps {
  /** raw query string carried by '#/p/<id>?…' */
  query: string;
  /** bump on every activation — places re-read the store on wake */
  wakeTick: number;
}

type PlaceModule = { default: ComponentType<PlaceProps> };
type LazyPlace = LazyExoticComponent<ComponentType<PlaceProps>>;
type PlaceImporter = () => Promise<PlaceModule>;
type LoadSnapshot = { phase: PlaceLoadPhase; error?: string };

const IDLE: LoadSnapshot = Object.freeze({ phase: 'idle' });
const importers: Record<string, PlaceImporter> = {
  timer: () => import('./timer/App'),
  ink: () => import('./ink/App'),
  rhythm: () => import('./rhythm/App'),
  proof: () => import('./proof/App'),
  syllabus: () => import('./syllabus/App'),
  gradestack: () => import('./gradestack/App'),
  margin: () => import('./margin/App'),
  flashcards: () => import('./flashcards/App'),
  boxed: () => import('./boxed/App'),
};

const snapshots = new Map<string, LoadSnapshot>();
const subscribers = new Map<string, Set<() => void>>();
const activeLazy = new Map<string, { generation: number; component: LazyPlace; controller: AbortController }>();

function publish(id: string, phase: PlaceLoadPhase, error?: string) {
  const previous = snapshots.get(id) || IDLE;
  if (previous.phase === phase && previous.error === error) return;
  snapshots.set(id, error ? { phase, error } : { phase });
  for (const listener of subscribers.get(id) || []) listener();
}

export function subscribePlaceLoad(id: string, listener: () => void) {
  let set = subscribers.get(id);
  if (!set) { set = new Set(); subscribers.set(id, set); }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set?.size === 0) subscribers.delete(id);
  };
}

export function getPlaceLoadSnapshot(id: string): LoadSnapshot {
  return snapshots.get(id) || IDLE;
}

export function usePlaceLoadSnapshot(id: string): LoadSnapshot {
  return useSyncExternalStore(
    listener => subscribePlaceLoad(id, listener),
    () => getPlaceLoadSnapshot(id),
    () => IDLE,
  );
}

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function waitForOnline(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  if (online()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener('online', onOnline);
      signal.removeEventListener('abort', onAbort);
    };
    const onOnline = () => { cleanup(); resolve(); };
    const onAbort = () => { cleanup(); reject(abortError()); };
    window.addEventListener('online', onOnline, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function waitForRetry(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((_, reject) => signal.addEventListener('abort', () => reject(abortError()), { once: true }));
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { cleanup(); resolve(); }, ms);
    const onAbort = () => { cleanup(); reject(abortError()); };
    const cleanup = () => { window.clearTimeout(timer); signal.removeEventListener('abort', onAbort); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function prepareTool(id: string, signal: AbortSignal): Promise<ToolPrepareResult> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || typeof MessageChannel === 'undefined') {
    return Promise.resolve(online()
      ? { ok: true, offlineReady: false, warning: 'This tool can open online, but offline caching is unavailable in this browser session.' }
      : { ok: false, offline: true, error: 'This tool has not been checked for offline availability.' });
  }
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise(resolve => {
    let settled = false;
    let timeout: number | undefined;
    let startTimeout: number | undefined;
    let abortListener: (() => void) | undefined;
    let channel: MessageChannel | undefined;
    const finish = (result: ToolPrepareResult) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (startTimeout !== undefined) window.clearTimeout(startTimeout);
      if (abortListener) signal.removeEventListener('abort', abortListener);
      if (channel) { channel.port1.close(); channel.port2.close(); }
      resolve(result);
    };

    const begin = async () => {
      let worker = navigator.serviceWorker.controller;
      if (!worker) {
        try {
          let readyTimer: number | undefined;
          const registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>(resolveReady => { readyTimer = window.setTimeout(() => resolveReady(null), 4000); }),
          ]);
          if (readyTimer !== undefined) window.clearTimeout(readyTimer);
          if (settled || signal.aborted) return;
          worker = navigator.serviceWorker.controller || registration?.active || null;
        } catch { worker = null; }
      }
      if (settled || signal.aborted) return;
      if (!worker) {
        finish(online()
          ? { ok: true, offlineReady: false, warning: 'This tool can open online, but offline caching is not ready yet.' }
          : { ok: false, offline: true, error: 'No active offline worker is available.' });
        return;
      }

      channel = new MessageChannel();
      const requestId = `${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      channel.port1.onmessage = event => {
        if (event.data?.id !== requestId) return;
        if (event.data?.type === 'iterra:tool-prepare-started') {
          if (startTimeout !== undefined) window.clearTimeout(startTimeout);
          return;
        }
        if (event.data?.type !== 'iterra:tool-ready') return;
        finish({ ok: event.data.ok === true, offline: event.data.offline === true, error: event.data.error,
          offlineReady: event.data.offlineReady, warning: event.data.warning });
      };
      timeout = window.setTimeout(() => finish(
        online()
          ? { ok: true, offlineReady: false, warning: 'This tool can open online, but offline readiness could not be confirmed.' }
          : { ok: false, offline: true, error: 'The tool is not cached for offline use.' },
      ), 120_000);
      startTimeout = window.setTimeout(() => finish(
        online()
          ? { ok: true, offlineReady: false, warning: 'This tool can open online, but offline caching is not available yet.' }
          : { ok: false, offline: true, error: 'The offline worker did not acknowledge this tool.' },
      ), 4_000);
      try {
        worker.postMessage({ type: 'iterra:prepare-tool', tool: id, id: requestId }, [channel.port2]);
      } catch (error) {
        finish(online()
          ? { ok: true, offlineReady: false, warning: 'This tool can open online, but offline caching could not be confirmed.' }
          : { ok: false, offline: true, error: String(error) });
      }
    };

    abortListener = () => finish({ ok: false, offline: !online(), error: 'Tool preparation was canceled.' });
    signal.addEventListener('abort', abortListener, { once: true });
    void begin().catch(error => finish(online()
      ? { ok: true, offlineReady: false, warning: 'This tool can open online, but offline caching could not be confirmed.' }
      : { ok: false, offline: true, error: String(error) }));
  });
}

export function getPlaceComponent(id: string, generation: number): LazyPlace | undefined {
  const importer = importers[id];
  if (!importer) return undefined;
  const previous = activeLazy.get(id);
  if (previous?.generation === generation) return previous.component;
  previous?.controller.abort();
  const controller = new AbortController();
  const component = lazy(() => loadPlaceSafely(controller.signal, {
    isOnline: online,
    prepare: signal => prepareTool(id, signal),
    importPlace: importer,
    waitForOnline,
    waitForRetry,
    delay,
    onPhase: (phase, error) => publish(id, phase, error),
  }));
  activeLazy.set(id, { generation, component, controller });
  return component;
}

/** A route update supersedes any unresolved offline wait for that place. */
export function cancelPlaceLoad(id: string) {
  activeLazy.get(id)?.controller.abort();
  activeLazy.delete(id);
  publish(id, 'idle');
}

/* Read one param from the place's hash query — replaces the old
   location.search reads (which can't see inside the hash). */
export function placeQueryParam(query: string, key: string): string | null {
  if (!query) return null;
  return new URLSearchParams(query).get(key);
}
