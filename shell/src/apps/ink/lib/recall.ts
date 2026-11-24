/* Recall cards — a selected sentence becomes one flashcards card through
   the canonical createDeckFromSelection command, so storage, provenance
   (card.sourceRef = ink:note:<id>, deck.sourceUrl) and course links stay
   flashcards' own. Cards collect in a single "Recall — Ink" deck; the
   command appends to it via appendToDeckId when it already exists. */
import type { Note } from '../store';

export const RECALL_DECK_TITLE = 'Recall — Ink';

const STORAGE_KEY = 'cardfile.decks.v1';

/** Id of the shared recall deck, if one exists — append keeps every
    sentence-card in one place instead of spawning a deck per selection. */
export function findRecallDeckId(storage: Pick<Storage, 'getItem'> = localStorage): string | null {
  try {
    const decks = JSON.parse(storage.getItem(STORAGE_KEY) || '{}') as Record<string, { title?: string }>;
    for (const [id, deck] of Object.entries(decks)) {
      if (deck?.title === RECALL_DECK_TITLE) return id;
    }
  } catch { /* unreadable store — the command creates the deck */ }
  return null;
}

/** Selected text → recall prompt: collapse whitespace, unwrap [[wikilinks]]
    to their titles so the card reads as a sentence, not markup. */
export function recallFrontFromSelection(text: string): string {
  return text
    .replace(/\[\[([^\][\n]+)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function recallBackDefault(note: Note): string {
  return `From “${note.title || 'Untitled'}”`;
}

/** Deep link back to the source page — the same shape iterra.ts publishes. */
export function noteDeepLink(noteId: string): string {
  return `/apps/ink/?note=${encodeURIComponent(noteId)}`;
}

/** Payload for execCommand('createDeckFromSelection'). The command stamps
    sourceRef/sourceUrl/course onto the deck and sourceRef onto the card —
    provenance for course "linked work" grouping comes free. */
export function recallCardPayload(
  note: Note,
  selection: string,
  front: string,
  back: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): Record<string, unknown> {
  const title = note.title || 'Untitled';
  const url = noteDeepLink(note.id);
  const deckId = findRecallDeckId(storage);
  return {
    sourceRef: { app: 'ink', type: 'note', id: note.id, title },
    deckTitle: RECALL_DECK_TITLE,
    cards: [{
      q: front.trim(),
      a: back.trim(),
      /* the back of the card carries where it came from — title plus the
         deep link, so reviewing the card can jump straight back to the page */
      ex: `Source: ${title} · ${url}`,
    }],
    /* leave absent fields undefined — the command then falls back to the
       resolved source object's own course/topic rather than nulling them */
    course: note.course,
    courseId: note.courseId,
    topic: note.tags?.[0] || undefined,
    excerpt: selection,
    sourceSnapshot: selection,
    ...(deckId ? { appendToDeckId: deckId } : {}),
  };
}
