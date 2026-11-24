import { useEffect, useState } from 'react';
import { usePlaceLoadSnapshot } from './index';
import { Button } from '../ui/primitives';
import { flushPendingNativeWrites } from '../integration/nativePersistence';
import { PLACES } from '../places';

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
  const busy = !offline && !failed;
  const place = PLACES.find((candidate) => candidate.id === placeId);
  const message = offline
    ? `${placeName} will open when your connection returns.`
    : failed
      ? 'Try again. If the problem continues, reload the workspace.'
      : phase === 'loading' && error
        ? 'Opening online; offline access may be limited.'
      : preparing
        ? `Getting ${placeName} ready for this session…`
        : 'Starting the workspace…';

  const reloadSafely = async () => {
    setReloading(true);
    setReloadError('');
    try {
      await flushPendingNativeWrites();
      window.location.reload();
    } catch {
      setReloadError('The workspace could not confirm all pending saves. Check storage, then try again.');
      setReloading(false);
    }
  };

  return (
    <div className="flex h-full min-h-[14rem] items-center justify-center bg-[var(--color-paper)] p-4 sm:p-6" aria-busy={busy || reloading}>
      <section className="it-card-in w-full max-w-sm border border-[var(--color-line)] bg-[var(--color-sheet)] px-5 py-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-[var(--color-line)] bg-[var(--color-sheet-2)] text-[var(--color-accent)] [&_svg]:h-7 [&_svg]:w-7" aria-hidden="true">
          {place?.glyph}
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-faint)]">{place?.place || placeName}</p>
        <div role="status" aria-live="polite" aria-atomic="true">
          <h2 className="it-heading mt-1">{offline ? 'Waiting to reconnect' : failed ? `Couldn’t open ${placeName}` : preparing ? `Preparing ${placeName}` : `Opening ${placeName}`}</h2>
          <p className="mt-1.5 text-[12.5px] text-[var(--color-mute)]">{message}</p>
        </div>
        {failed && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" onClick={onRetry}>Retry</Button>
          <Button variant="secondary" onClick={reloadSafely} disabled={reloading}>{reloading ? 'Reloading…' : 'Reload workspace'}</Button>
        </div>}
        {reloadError && <p className="mt-3 text-[12px] text-[var(--color-bad)]" role="alert">The workspace could not confirm all pending saves. Retry the reload after checking storage.</p>}
      </section>
    </div>
  );
}
