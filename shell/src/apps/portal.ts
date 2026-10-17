import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Frame-bound overlay host. `absolute inset-0` overlays resolve against the
 * nearest *positioned* ancestor — a `relative` card or view root would
 * hijack them, so a "modal" could dim only one panel while the app's chrome
 * stayed clickable. `.it-place-<id>` roots are deliberately unpositioned,
 * so overlays portaled there still resolve against the terrain frame —
 * exactly the contract `fixed` → `absolute` was meant to give them. Falls
 * back to <body> (viewport-bound) when no place root exists.
 */
export function usePlaceRoot(place: string): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLElement>(`.it-place-${place}`));
  useEffect(() => {
    // re-query if the root never mounted yet, or remounted (keep-alive
    // unmount would leave `el` pointing at a detached node — portaling
    // into it would render nothing)
    if (!el || !el.isConnected) {
      setEl(document.querySelector<HTMLElement>(`.it-place-${place}`));
    }
  }, [place, el]);
  return el;
}

export function PlacePortal({ place, children }: { place: string; children: ReactNode }) {
  const host = usePlaceRoot(place);
  return createPortal(children, host ?? document.body);
}
