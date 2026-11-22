import { useCallback, useEffect, useState } from 'react';
import {
  flushNativeStore,
  getNativePersistenceError,
  getNativePersistenceErrorPhase,
  hasPendingNativeReceipts,
  retryNativeProjection,
  type NativeStateKey,
} from './nativePersistence';

type NoticeState = { kind: 'pending' | 'error' | 'restored'; message: string; phase?: string } | null;

function initialNotice(key: NativeStateKey): NoticeState {
  const error = getNativePersistenceError(key);
  if (error) return { kind: 'error', message: error.message, phase: getNativePersistenceErrorPhase(key) ?? undefined };
  return hasPendingNativeReceipts(key)
    ? { kind: 'pending', message: 'Recovering a saved change on this device…' }
    : null;
}

function currentWorkspaceText(key: NativeStateKey): string {
  const name = key === 'ink-notes-storage' ? '__inkStore' : '__syllabusFolioStore';
  const state = (window as any)[name]?.getState?.();
  if (!state) return '';
  const fields = key === 'ink-notes-storage'
    ? ['notes', 'folders', 'drafts', 'activeNoteId', 'activeFolder', 'prefs']
    : ['terms', 'activeTermId', 'courses', 'commitments', 'blocks', 'links', 'reviews', 'settings', 'dismissed'];
  return JSON.stringify(Object.fromEntries(fields.map(field => [field, state[field]])), null, 2);
}

export function NativePersistenceNotice({ storeKey, onRetryHydration }: {
  storeKey: NativeStateKey;
  onRetryHydration?: () => void;
}) {
  const [notice, setNotice] = useState<NoticeState>(() => initialNotice(storeKey));
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;
    const keyMatches = (event: Event) => {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key;
      return !key || key === storeKey;
    };
    const onPending = (event: Event) => {
      if (!keyMatches(event)) return;
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => setNotice({ kind: 'pending', message: 'Saving changes on this device…' }), 350);
    };
    const onError = (event: Event) => {
      if (!keyMatches(event)) return;
      clearTimeout(pendingTimer);
      const detail = (event as CustomEvent<{ phase?: string; message?: string }>).detail;
      const message = detail?.phase === 'hydrate'
        ? 'Saved data could not be loaded. Retry loading before editing.'
        : detail?.phase === 'receipt'
        ? 'This change could not be saved. Copy your current work before leaving this page.'
        : detail?.phase === 'stale'
          ? 'This tab is out of date after a restore. Copy current work, then reload to continue.'
          : detail?.phase === 'projection'
            ? 'Your change is saved in local native storage, but the workspace projection could not be refreshed. Retry to sync it.'
          : 'A change is safely queued on this device but has not finished saving yet. Keep this tab open and retry.';
      setNotice({ kind: 'error', message: detail?.message ? `${message} ${detail.message}` : message, phase: detail?.phase });
    };
    const onSaved = (event: Event) => {
      if (!keyMatches(event)) return;
      clearTimeout(pendingTimer);
      setNotice(null);
    };
    const onRestored = (event: Event) => {
      if (!keyMatches(event)) return;
      const detail = (event as CustomEvent<{ stale?: boolean }>).detail;
      if (detail?.stale) {
        setNotice({ kind: 'error', message: 'This tab is out of date after a restore. Copy current work, then reload to continue.' });
        return;
      }
      const error = getNativePersistenceError(storeKey);
      if (error) {
        setNotice({ kind: 'error', message: `The workspace data was restored, but its local projection needs attention. ${error.message}` });
        return;
      }
      setNotice({ kind: 'restored', message: 'The restored workspace is loaded in this tab.' });
      setTimeout(() => setNotice(current => current?.kind === 'restored' ? null : current), 5000);
    };
    window.addEventListener('iterra:native-persistence-pending', onPending);
    window.addEventListener('iterra:native-persistence-error', onError);
    window.addEventListener('iterra:native-persistence-saved', onSaved);
    window.addEventListener('iterra:native-state-restored', onRestored);
    return () => {
      clearTimeout(pendingTimer);
      window.removeEventListener('iterra:native-persistence-pending', onPending);
      window.removeEventListener('iterra:native-persistence-error', onError);
      window.removeEventListener('iterra:native-persistence-saved', onSaved);
      window.removeEventListener('iterra:native-state-restored', onRestored);
    };
  }, [storeKey]);

  const retry = useCallback(async () => {
    if (notice?.phase === 'hydrate' && onRetryHydration) {
      onRetryHydration();
      return;
    }
    try {
      await flushNativeStore(storeKey);
      await retryNativeProjection(storeKey);
      setNotice(null);
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'The change is still waiting to save.' });
    }
  }, [storeKey, notice?.phase, onRetryHydration]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(currentWorkspaceText(storeKey));
      setCopyStatus('Current work copied.');
    } catch {
      setCopyStatus('Clipboard access is unavailable. Select and copy your work before reloading.');
    }
  }, [storeKey]);

  if (!notice) return null;
  const isError = notice.kind === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={`fixed inset-x-3 top-2 z-[100] mx-auto flex max-w-screen-xl flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs shadow-sm ${
        isError
          ? 'border-[var(--color-warn)] bg-[var(--color-warn-soft)] text-[var(--color-ink)]'
          : 'border-[var(--color-line)] bg-[var(--color-sheet)] text-[var(--color-mute)]'
      }`}
      data-native-persistence={notice.kind}
    >
      <span className="flex-1">{notice.message}</span>
      {isError && <button type="button" className="underline underline-offset-2" onClick={() => void copy()}>Copy current work</button>}
      {notice.kind === 'error' && <button type="button" className="underline underline-offset-2" onClick={() => void retry()}>{notice.phase === 'hydrate' ? 'Retry loading' : 'Retry save'}</button>}
      {notice.kind === 'error' && <button type="button" className="underline underline-offset-2" onClick={() => window.location.reload()}>Reload</button>}
      {copyStatus && <span className="w-full">{copyStatus}</span>}
    </div>
  );
}
