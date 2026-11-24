export type PlaceLoadPhase = 'idle' | 'preparing' | 'offline' | 'loading' | 'error' | 'ready';

export interface ToolPrepareResult {
  ok: boolean;
  offline?: boolean;
  error?: string;
  offlineReady?: boolean;
  warning?: string;
}

export interface PlaceLoaderDependencies<T> {
  isOnline(): boolean;
  prepare(signal: AbortSignal): Promise<ToolPrepareResult>;
  importPlace(): Promise<T>;
  waitForOnline(signal: AbortSignal): Promise<void>;
  waitForRetry(signal: AbortSignal): Promise<void>;
  delay(ms: number, signal: AbortSignal): Promise<void>;
  onPhase(phase: PlaceLoadPhase, error?: string): void;
}

export function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Place load was canceled', 'AbortError');
  const error = new Error('Place load was canceled');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

export async function loadPlaceSafely<T>(signal: AbortSignal, deps: PlaceLoaderDependencies<T>): Promise<T> {
  let consecutiveFailures = 0;
  let onlineOnlyWarning: string | undefined;
  while (true) {
    throwIfAborted(signal);
    deps.onPhase('preparing');
    let ready: ToolPrepareResult;
    try {
      ready = await deps.prepare(signal);
    } catch (error) {
      throwIfAborted(signal);
      ready = { ok: false, offline: !deps.isOnline(), error: String(error) };
    }
    throwIfAborted(signal);

    if (ready.ok) {
      if (ready.offlineReady === false) onlineOnlyWarning = ready.warning || 'This opened online, but it isn\u2019t ready to work offline yet.';
      break;
    }
    if (!deps.isOnline()) {
      deps.onPhase('offline', ready.error);
      await deps.waitForOnline(signal);
      consecutiveFailures = 0;
      continue;
    }

    consecutiveFailures += 1;
    if (consecutiveFailures < 3) {
      await deps.delay(300 * consecutiveFailures, signal);
      continue;
    }
    deps.onPhase('error', ready.error || 'This tool couldn\u2019t be opened.');
    await deps.waitForRetry(signal);
    consecutiveFailures = 0;
  }

  throwIfAborted(signal);
  deps.onPhase('loading', onlineOnlyWarning);
  try {
    const component = await deps.importPlace();
    throwIfAborted(signal);
    deps.onPhase('ready');
    return component;
  } catch (error) {
    throwIfAborted(signal);
    deps.onPhase('error', String(error instanceof Error ? error.message : error));
    // The current React.lazy instance stays pending and its fallback offers a
    // real retry. The caller aborts this loader and creates a fresh lazy type
    // before invoking importPlace again.
    await deps.waitForRetry(signal);
    throw abortError();
  }
}
