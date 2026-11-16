import type { RecordSessionOutcomeInput } from '../../../integration/commands';

const PREFIX = 'timer.session-outcome.pending.v1:';

function key(sessionId: string): string {
  return `${PREFIX}${encodeURIComponent(sessionId)}`;
}

export function enqueueSessionOutcome(input: RecordSessionOutcomeInput): boolean {
  if (typeof window === 'undefined' || !input.sessionId) return false;
  try {
    const storageKey = key(input.sessionId);
    const serialized = JSON.stringify(input);
    const existing = localStorage.getItem(storageKey);
    if (existing) return JSON.stringify(JSON.parse(existing)) === serialized;
    localStorage.setItem(storageKey, serialized);
    return true;
  } catch {
    return false;
  }
}

export function getPendingSessionOutcomes(): RecordSessionOutcomeInput[] {
  if (typeof window === 'undefined') return [];
  const pending: RecordSessionOutcomeInput[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const storageKey = localStorage.key(index);
      if (!storageKey?.startsWith(PREFIX)) continue;
      const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (value && typeof value === 'object' && typeof value.sessionId === 'string' && value.sessionId) {
        pending.push(value as RecordSessionOutcomeInput);
      }
    }
  } catch {
    /* a corrupt row should not prevent recovery of the rest */
  }
  return pending;
}

export function clearPendingSessionOutcome(sessionId: string, expected?: RecordSessionOutcomeInput): void {
  if (typeof window === 'undefined' || !sessionId) return;
  try {
    const storageKey = key(sessionId);
    if (expected) {
      const current = localStorage.getItem(storageKey);
      if (!current || JSON.stringify(JSON.parse(current)) !== JSON.stringify(expected)) return;
    }
    localStorage.removeItem(storageKey);
  } catch { /* best effort */ }
}
