import { PLACE_MAP } from './places';

export type WorkspaceSection = 'today' | 'courses' | 'library' | 'place';

export interface ParsedRoute {
  place: string;
  course: string;
  query: string;
  section: WorkspaceSection;
}

function attachMeta(
  base: { place: string; course: string },
  query: string,
  section: WorkspaceSection,
): ParsedRoute {
  Object.defineProperty(base, 'query', { value: query, enumerable: false, configurable: true });
  Object.defineProperty(base, 'section', { value: section, enumerable: false, configurable: true });
  return base as ParsedRoute;
}

/* hash routing:
   '' or '#/'       → Today workspace (section: 'today')
   '#/courses'      → Courses directory (section: 'courses')
   '#/c/<key>'      → Course workspace (section: 'courses', course: '<key>')
   '#/library'      → Unified library browser (section: 'library')
   '#/p/<place>[?q]'→ Embedded tool view (section: 'place', place: '<place>')
*/
export function parseHash(hash: string): ParsedRoute {
  const h = hash.replace(/^#\/?/, '');
  if (h === 'courses' || h.startsWith('courses?')) {
    const q = h.includes('?') ? h.slice(h.indexOf('?') + 1) : '';
    return attachMeta({ place: '', course: '' }, q, 'courses');
  }
  if (h === 'library' || h.startsWith('library?')) {
    const q = h.includes('?') ? h.slice(h.indexOf('?') + 1) : '';
    return attachMeta({ place: '', course: '' }, q, 'library');
  }
  const c = h.match(/^c\/([^?#]+)(?:\?([^#]*))?/);
  if (c) {
    return attachMeta(
      { place: '', course: decodeURIComponent(c[1]) },
      c[2] || '',
      'courses',
    );
  }
  const m = h.match(/^p\/([a-z]+)(\?([^#]*))?/);
  if (m && PLACE_MAP[m[1]]) {
    return attachMeta(
      { place: m[1], course: '' },
      m[3] || '',
      'place',
    );
  }
  return attachMeta({ place: '', course: '' }, '', 'today');
}

export function appUrl(place: string, path = '/'): string {
  return `/apps/${place}${path}`;
}

/* Translate an old-style /apps/<place>/<path>?<query> URL into the hash
   route form. Returns null for URLs that don't name a place. */
export function placeHashFromAppUrl(url: string): { place: string; query: string } | null {
  const m = url.match(/^\/apps\/([a-z]+)(?:\/[^?#]*)?(?:\?([^#]*))?/);
  if (!m || !PLACE_MAP[m[1]]) return null;
  return { place: m[1], query: m[2] || '' };
}

export function hashFor(place: string, query = ''): string {
  return `#/p/${place}${query ? `?${query}` : ''}`;
}
