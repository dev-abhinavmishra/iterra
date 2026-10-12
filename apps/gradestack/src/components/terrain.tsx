/* ── terrain bridges — chips that read sibling state from the canonical
   store and route through the shell (docs/WIRING.md §7). Each surface uses
   the mark book's own chip styling; nothing renders until the store
   answers with a real count — no decorative chips. */

import { useDueCardCount } from '../lib/iterra-adapter';

export function openTerrain(url: string) {
  try {
    (window as any).iterra?.open?.(url);
  } catch {
    /* navigation is best-effort */
  }
}

const chipBtn =
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border border-mark/40 text-mark-deep bg-mark-mist/60 dark:text-mark text-[11px] font-semibold hover:border-mark transition-colors';

/** "N cards due" — the cardfile's due count for this course, deep-linked to
 *  the decks place. Hidden while unresolved or zero. */
export function DueCardsChip({ courseName }: { courseName?: string }) {
  const due = useDueCardCount(courseName);
  if (due == null || due === 0) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openTerrain('/apps/flashcards/');
      }}
      className={chipBtn}
      title="Review due cards in Flashcards"
    >
      {due} card{due === 1 ? '' : 's'} due
    </button>
  );
}
