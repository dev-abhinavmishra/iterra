import { useEffect, useRef } from 'react';
import { FLASHCARDS_MARKUP } from './markup';
import { mountFlashcards } from './controller';
import './index.css';

/* The cardfile was written as a vanilla app — the migration keeps its
   battle-tested controller and mounts its static DOM inside the place
   root, where mountFlashcards scopes all of its queries. */
export default function App({ query = '' }: { query?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rootRef.current) mountFlashcards(rootRef.current, query);
  }, [query]);

  return (
    <div
      ref={rootRef}
      className="it-place-flashcards h-full"
      dangerouslySetInnerHTML={{ __html: FLASHCARDS_MARKUP }}
    />
  );
}
