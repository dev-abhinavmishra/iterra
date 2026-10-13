import { PLACE_MAP } from './places';

/* hash routing: '' → terrain, 'p/<place>[?query]' → place view,
   'c/<key>' → course dossier. The query rides inside the hash so deep
   links stay same-document navigations — '#/p/timer?minutes=25' parses
   to { place:'timer', query:'minutes=25' }. */
export function parseHash(hash: string): { place: string; course: string; query: string } {
  const h = hash.replace(/^#\/?/, '');
  const c = h.match(/^c\/([^?#]+)/);
  if (c) return { place: '', course: decodeURIComponent(c[1]), query: '' };
  const m = h.match(/^p\/([a-z]+)(\?([^#]*))?/);
  return {
    place: m && PLACE_MAP[m[1]] ? m[1] : '',
    course: '',
    query: m?.[3] || '',
  };
}

export function appUrl(place: string, path = '/'): string {
  return `/apps/${place}${path}`;
}

/* Places used to be framed pages at /apps/<place>/<path>?<query>. Now a
   place is a mounted component addressed by hash — translate an old-style
   app URL into the hash form it navigates by. Returns null for urls that
   don't name a place (external links — caller decides what to do). */
export function placeHashFromAppUrl(url: string): { place: string; query: string } | null {
  const m = url.match(/^\/apps\/([a-z]+)(?:\/[^?#]*)?(?:\?([^#]*))?/);
  if (!m || !PLACE_MAP[m[1]]) return null;
  return { place: m[1], query: m[2] || '' };
}

export function hashFor(place: string, query = ''): string {
  return `#/p/${place}${query ? `?${query}` : ''}`;
}
