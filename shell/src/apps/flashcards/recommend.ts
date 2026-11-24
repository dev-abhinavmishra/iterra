/* Recommended review session + missed-prompt recovery — pure helpers,
   contract-tested in recommend.test.ts. The deck model schedules by
   status ('new' | 'learning' | 'mastered'), not timestamps: "due" is
   simply every non-mastered card. */

export interface RecCard {
  id?: string;
  status?: string;
  misses?: number;
}

export interface RecDeck {
  cards?: RecCard[];
}

/* flip + recall pace — ~20s per card keeps the estimate honest for
   recall sessions rather than passive flipping */
export const SECS_PER_CARD = 20;
/* a recommended session fits a short break; bigger due sets get capped
   to the first N cards that fit, same spirit as the 25m focus session */
export const SESSION_TARGET_MIN = 15;
/* a prompt is "repeatedly missed" once it has been missed in this many
   separate sessions (each session counts a card at most once) */
export const REPEAT_MISS_THRESHOLD = 2;

export function dueCount(d: RecDeck | null | undefined): number {
  return (d?.cards || []).filter(c => c && c.status !== 'mastered').length;
}

export function estimateMinutes(cardCount: number): number {
  if (cardCount <= 0) return 0;
  return Math.max(1, Math.round((cardCount * SECS_PER_CARD) / 60));
}

export interface SessionRecommendation {
  due: number;      // all reviewable (non-mastered) cards
  count: number;    // cards in the recommended session (capped)
  minutes: number;  // estimated minutes for `count` cards
  label: string;    // e.g. "12 cards due · about 4 min"
}

export function recommendSession(d: RecDeck | null | undefined): SessionRecommendation | null {
  const due = dueCount(d);
  if (!due) return null;
  const maxCards = Math.max(1, Math.floor((SESSION_TARGET_MIN * 60) / SECS_PER_CARD));
  const count = Math.min(due, maxCards);
  const minutes = estimateMinutes(count);
  const label = due <= maxCards
    ? `${due} card${due === 1 ? '' : 's'} due · about ${minutes} min`
    : `first ${count} of ${due} cards · about ${minutes} min`;
  return { due, count, minutes, label };
}

/* of the ids missed in the session that just ended, keep only those the
   deck has missed in REPEAT_MISS_THRESHOLD or more sessions total —
   those are the ambiguous prompts worth editing, not one-off slips */
export function repeatMissed(
  d: RecDeck | null | undefined,
  missedIds: string[],
  threshold: number = REPEAT_MISS_THRESHOLD,
): string[] {
  const byId = new Map<string, RecCard>();
  for (const c of d?.cards || []) if (c && c.id) byId.set(c.id, c);
  return missedIds.filter(id => {
    const c = byId.get(id);
    return !!c && (c.misses || 0) >= threshold;
  });
}
