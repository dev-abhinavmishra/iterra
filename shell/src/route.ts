import { PLACE_MAP } from './places';

/* hash routing: '' → terrain, 'p/<place>' → place view,
   'c/<key>' → course dossier */
export function parseHash(hash: string): { place: string; course: string } {
  const h = hash.replace(/^#\/?/, '');
  const c = h.match(/^c\/([^?#]+)/);
  if (c) return { place: '', course: decodeURIComponent(c[1]) };
  const m = h.match(/^p\/([a-z]+)/);
  return { place: m && PLACE_MAP[m[1]] ? m[1] : '', course: '' };
}

export function appUrl(place: string, path = '/'): string {
  return `/apps/${place}${path}`;
}
