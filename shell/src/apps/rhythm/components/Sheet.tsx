import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { placeActive } from '../../active';
import { PlacePortal } from '../../portal';

/** A register panel drawn up over the deck — the app's only modal. */
export function Sheet({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // onClose is an inline closure at every call site — keep it in a ref so the
  // effect below can run once on mount instead of re-focusing on each render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first =
      ref.current?.querySelector<HTMLElement>('input, select, textarea') ??
      ref.current?.querySelector<HTMLElement>('button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (!placeActive("rhythm")) return;
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);

  /* Portal to the place root: rendered inside `.deck` (position: relative)
     an `absolute` sheet would cover only the card — dimming neither the
     chassis chrome nor the frame and leaving header buttons clickable. */
  return (
    <PlacePortal place="rhythm">
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="sheet-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div
          ref={ref}
          className="panel panel--in w-full p-5"
          style={{ maxWidth: wide ? 620 : 440, maxHeight: '88vh', overflowY: 'auto' }}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="disp text-lg" style={{ color: 'var(--color-ink)' }}>{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 text-ink-soft hover:bg-white/5 hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </PlacePortal>
  );
}
