import type { CourseColor } from './types';

export const COURSE_COLORS: { key: CourseColor; name: string }[] = [
  { key: 'oxblood', name: 'Oxblood' },
  { key: 'hunter', name: 'Hunter' },
  { key: 'navy', name: 'Registry navy' },
  { key: 'ochre', name: 'Ochre' },
  { key: 'plum', name: 'Plum' },
  { key: 'teal', name: 'Teal' },
  { key: 'slate', name: 'Slate' },
  { key: 'rust', name: 'Rust' },
];

export function courseColorVar(color: CourseColor): string {
  return `var(--color-course-${color})`;
}

export function courseColorRgb(color: CourseColor): string {
  return `var(--course-${color}-rgb)`;
}

/** Auto-assign the least-used course color so tabs stay distinct. */
export function nextCourseColor(used: CourseColor[]): CourseColor {
  const counts = new Map<CourseColor, number>();
  for (const c of COURSE_COLORS) counts.set(c.key, 0);
  for (const u of used) counts.set(u, (counts.get(u) ?? 0) + 1);
  let best: CourseColor = 'oxblood';
  let bestN = Infinity;
  for (const c of COURSE_COLORS) {
    const n = counts.get(c.key) ?? 0;
    if (n < bestN) {
      bestN = n;
      best = c.key;
    }
  }
  return best;
}
