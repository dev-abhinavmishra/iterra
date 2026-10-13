/* Place components — the eight terrain apps, mounted directly in the
   shell. No iframes: each is a lazily-imported React subtree addressed
   by '#/p/<id>' and kept alive (display:none) once visited. */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface PlaceProps {
  /** raw query string carried on the hash — '#/p/timer?minutes=25' → 'minutes=25' */
  query: string;
  /** bump on every activation — places re-read the store on wake */
  wakeTick: number;
}

type LazyPlace = LazyExoticComponent<ComponentType<PlaceProps>>;

/* React.lazy caches a rejected import() forever — a transient network
   blip (or a dev-server dep re-optimization) would brick the place until
   reload. Retry twice with a short backoff before giving up. */
function lazyRetry(factory: () => Promise<{ default: ComponentType<PlaceProps> }>): LazyPlace {
  return lazy(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await factory();
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      }
    }
    throw lastErr;
  });
}

export const PLACE_COMPONENTS: Record<string, LazyPlace> = {
  timer: lazyRetry(() => import('./timer/App')),
  ink: lazyRetry(() => import('./ink/App')),
  rhythm: lazyRetry(() => import('./rhythm/App')),
  proof: lazyRetry(() => import('./proof/App')),
  syllabus: lazyRetry(() => import('./syllabus/App')),
  gradestack: lazyRetry(() => import('./gradestack/App')),
  margin: lazyRetry(() => import('./margin/App')),
  flashcards: lazyRetry(() => import('./flashcards/App')),
};

/* Read one param from the place's hash query — replaces the old
   location.search reads (which can't see inside the hash). */
export function placeQueryParam(query: string, key: string): string | null {
  if (!query) return null;
  return new URLSearchParams(query).get(key);
}
