import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FLASHCARDS_MARKUP } from './markup';
import { mountFlashcards } from './controller';
import { SourceChangedBanner } from '../../integration/components';
import { AtlasMasthead } from '../../mosaic/AtlasMasthead';
import './index.css';

/* The cardfile was written as a vanilla app — the migration keeps its
   battle-tested controller and mounts its static DOM inside the place
   root, where mountFlashcards scopes all of its queries. The controller
   announces the open deck via 'fc:deck' so React can portal the
   derivedFrom freshness banner into #fc-source-banner. */
export default function App({ query = '' }: { query?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [bannerHost, setBannerHost] = useState<HTMLElement | null>(null);
  const [deckId, setDeckId] = useState<string | null>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    mountFlashcards(rootRef.current, query);
    setBannerHost(rootRef.current.querySelector<HTMLElement>('#fc-source-banner'));
  }, [query]);

  useEffect(() => {
    const on = (e: Event) => {
      setDeckId((e as CustomEvent<{ deckId: string | null }>).detail?.deckId ?? null);
    };
    window.addEventListener('fc:deck', on);
    return () => window.removeEventListener('fc:deck', on);
  }, []);

  return (
    <>
      {/* the cardfile's own topbar lives inside the mounted markup — the
          painted cartouche rides above it in a shared scroll column */}
      <div className="h-full overflow-y-auto">
        <AtlasMasthead
          compact
          object="cards"
          place="flashcards"
          title="Flashcards"
          sub="Decks, spaced review, multiple-choice quizzes, and written recall."
          className="mx-3 mt-3 mb-3 sm:mx-5"
        />
        <div
          ref={rootRef}
          className="it-place-flashcards"
          dangerouslySetInnerHTML={{ __html: FLASHCARDS_MARKUP }}
        />
      </div>
      {bannerHost && deckId &&
        createPortal(<SourceChangedBanner deckId={deckId} />, bannerHost)}
    </>
  );
}
