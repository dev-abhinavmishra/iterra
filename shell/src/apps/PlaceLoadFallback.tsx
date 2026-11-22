import { useEffect, useState } from 'react';
import { usePlaceLoadSnapshot } from './index';
import { Button } from '../ui/primitives';
import { flushPendingNativeWrites } from '../integration/nativePersistence';

export function PlaceLoadFallback({ placeId, placeName, onRetry }: {
  placeId: string;
  placeName: string;
  onRetry: () => void;
}) {
  const { phase, error } = usePlaceLoadSnapshot(placeId);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState('');

  useEffect(() => {
    if (phase !== 'error') return;
    const retryWhenOnline = () => onRetry();
    window.addEventListener('online', retryWhenOnline, { once: true });
    return () => window.removeEventListener('online', retryWhenOnline);
  }, [phase, onRetry]);

  const offline = phase === 'offline';
  const failed = phase === 'error';
  const preparing = phase === 'preparing';
  const message = offline
    ? `${placeName} is not ready offline yet. Reconnect and it will open automatically.`
    : failed
      ? `Iterra couldn't finish loading ${placeName}. Retry when your connection is available. Existing saved data and queued transfers remain in the workspace.`
      : phase === 'loading' && error
        ? `${placeName} is opening online. Offline access could not be confirmed for this tool.`
      : preparing
        ? `Preparing ${placeName} for this workspace…`
        : `Opening ${placeName}…`;

  const reloadSafely = async () => {
    setReloading(true);
    setReloadError('');
    try {
      await flushPendingNativeWrites();
      window.location.reload();
    } catch (cause) {
      setReloadError(String(cause instanceof Error ? cause.message : cause));
      setReloading(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-[var(--color-paper)] p-6">
      <div className="it-card-in anim-rise max-w-sm text-center" role="status" aria-live="polite">
        <div className="it-heading">{offline ? 'Waiting to reconnect' : failed ? 'Tool not ready' : preparing ? `Preparing ${placeName}` : `Opening ${placeName}`}</div>
        <p className="mt-1.5 text-[12.5px] text-[var(--color-mute)]">{message}</p>
        {failed && <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="primary" onClick={onRetry}>Retry</Button>
          <Button variant="secondary" onClick={reloadSafely} disabled={reloading}>{reloading ? 'Reloading…' : 'Reload workspace'}</Button>
        </div>}
        {reloadError && <p className="mt-3 text-[12px] text-[var(--color-bad)]" role="alert">The workspace could not confirm all pending saves. Retry the reload after checking storage.</p>}
        {failed && (error || reloadError) && <details className="mt-3 text-left text-[11px] text-[var(--color-mute)]">
          <summary className="cursor-pointer">Technical details</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words">{[error, reloadError].filter(Boolean).join('\n')}</pre>
        </details>}
      </div>
    </div>
  );
}
