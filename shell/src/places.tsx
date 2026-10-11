/* The eight places of the terrain. Each keeps its own app's design inside;
   the shell gives every place one shared identity: a place name, a hand-drawn
   glyph, and a live line from the hub. */
import type { ReactNode } from 'react';

export interface TodayItem {
  text: string;
  live?: boolean;
}

export interface Place {
  id: string;
  place: string;      // the terrain name — "the Folio"
  app: string;        // the app's own name — "Syllabus"
  tagline: string;
  glyph: ReactNode;
  today: (summary: any) => TodayItem[];
}

const S = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const PLACES: Place[] = [
  {
    id: 'syllabus',
    place: 'the Folio',
    app: 'Syllabus',
    tagline: 'Registrar’s planning folio — courses filed into ranked daily work slips.',
    glyph: (
      <svg viewBox="0 0 32 32" {...S}>
        <rect x="7" y="4" width="18" height="24" rx="1.5" />
        <path d="M11 4v24" />
        <path d="M15 10h7M15 14h7M15 18h5" />
        <path d="M7 8h3M7 24h3" strokeDasharray="1.5 2" />
      </svg>
    ),
    today: (s) => {
      const items: TodayItem[] = [];
      if (s?.overdue) items.push({ text: `${s.overdue} late item${s.overdue === 1 ? '' : 's'} in the folio` });
      if (s?.slips) items.push({ text: `${s.slips} slip${s.slips === 1 ? '' : 's'} on today’s desk` });
      if (s?.top) items.push({ text: `next: ${s.top}` });
      return items;
    },
  },
  {
    id: 'rhythm',
    place: 'the Register',
    app: 'Rhythm',
    tagline: 'Attendance register — the day ruled into marks.',
    glyph: (
      <svg viewBox="0 0 32 32" {...S}>
        <rect x="5" y="6" width="22" height="20" rx="1.5" />
        <path d="M5 12h22M5 18h22M13 6v20M20 6v20" />
        <path d="M8 9.2l1 1 1.8-2" strokeWidth={1.4} />
      </svg>
    ),
    today: (s) => {
      const items: TodayItem[] = [];
      if (s?.marked != null && s?.total != null) {
        items.push({ text: `${s.marked} of ${s.total} marks taken today` });
      }
      if (s?.pending) items.push({ text: `${s.pending} line${s.pending === 1 ? '' : 's'} still open`, live: true });
      return items;
    },
  },
  {
    id: 'flashcards',
    place: 'the Cardfile',
    app: 'Flashcards',
    tagline: 'Index cards in a tin — decks, drills, due piles.',
    glyph: (
      <svg viewBox="0 0 32 32" {...S}>
        <rect x="6" y="9" width="20" height="14" rx="1.5" transform="rotate(-4 16 16)" />
        <rect x="6" y="7" width="20" height="14" rx="1.5" transform="rotate(3 16 14)" />
        <path d="M10 13h12M10 17h8" transform="rotate(3 16 14)" />
        <path d="M9 25h14" />
      </svg>
    ),
    today: (s) => {
      const items: TodayItem[] = [];
      if (s?.due) items.push({ text: `${s.due} card${s.due === 1 ? '' : 's'} due for review` });
      if (s?.decks) items.push({ text: `${s.decks} deck${s.decks === 1 ? '' : 's'} in the tin` });
      return items;
    },
  },
  {
    id: 'ink',
    place: 'the Desk',
    app: 'Ink',
    tagline: 'A writing desk — notes set down in ink.',
    glyph: (
      <svg viewBox="0 0 32 32" {...S}>
        <path d="M20 5l7 7-13 13-3 1 1-3L20 5z" />
        <path d="M18 7l7 7" />
        <path d="M5 27h9" />
        <path d="M14 25c-1.5-2 .5-4 2.5-3" />
      </svg>
    ),
    today: (s) => {
      const items: TodayItem[] = [];
      if (s?.open) items.push({ text: `on the desk: ${s.open}` });
      if (s?.todayWords) items.push({ text: `${s.todayWords} words set down today` });
      if (s?.notes) items.push({ text: `${s.notes} note${s.notes === 1 ? '' : 's'} on the desk` });
      return items;
    },
  },
  {
    id: 'margin',
    place: 'the Margin',
    app: 'Margin',
    tagline: 'Marginalia — notes, recordings, and study sheets at the edge.',
    glyph: (
      <svg viewBox="0 0 32 32" {...S}>
        <path d="M8 4v24" />
        <path d="M13 8h11M13 12h8M13 16h11M13 20h6" />
        <path d="M24 24c1.5 0 2.5-1 2.5-2.5" />
        <circle cx="26.5" cy="24.5" r="0.8" fill="currentColor" />
      </svg>
    ),
    today: (s) => {
      const items: TodayItem[] = [];
      if (s?.last) items.push({ text: `last margin note: ${s.last}` });
      if (s?.notes) items.push({ text: `${s.notes} note${s.notes === 1 ? '' : 's'} in the margin` });
      return items;
    },
  },
  {
    id: 'gradestack',
    place: 'the Mark Book',
    app: 'GradeStack',
    tagline: 'Bubble sheets scanned, marked, and entered in the book.',
    glyph: (
      <svg viewBox="0 0 32 32" {...S}>
        <rect x="7" y="4" width="18" height="24" rx="1.5" />
        <circle cx="12" cy="10" r="1.4" /><circle cx="16" cy="10" r="1.4" /><circle cx="20" cy="10" r="1.4" />
        <circle cx="12" cy="15" r="1.4" /><circle cx="16" cy="15" r="1.4" fill="currentColor" /><circle cx="20" cy="15" r="1.4" />
        <circle cx="12" cy="20" r="1.4" /><circle cx="16" cy="20" r="1.4" /><circle cx="20" cy="20" r="1.4" />
        <path d="M10 25h12" />
      </svg>
    ),
    today: (s) => {
      const items: TodayItem[] = [];
      if (s?.lastMark?.name) {
        items.push({ text: `marked: ${s.lastMark.name}${s.lastMark.pct != null ? ` · ${Math.round(s.lastMark.pct)}%` : ''}` });
      }
      if (s?.assessments) items.push({ text: `${s.assessments} assessment${s.assessments === 1 ? '' : 's'} in the book` });
      return items;
    },
  },
  {
    id: 'timer',
    place: 'the Instruments',
    app: 'Timer',
    tagline: 'Split-flap time instruments — timers, chronographs, alarms.',
    glyph: (
      <svg viewBox="0 0 32 32" {...S}>
        <rect x="5" y="8" width="22" height="16" rx="2" />
        <path d="M16 8v16" />
        <path d="M5 16h22" strokeDasharray="1.5 2.2" />
        <path d="M9 12l3 0M20 20l3 0" />
        <circle cx="16" cy="16" r="1" fill="currentColor" />
      </svg>
    ),
    today: (s) => {
      const items: TodayItem[] = [];
      if (s?.running?.label) {
        items.push({
          text: `${s.running.label}${s.running.endsInMin != null ? ` — ${s.running.endsInMin}m left` : ''}`,
          live: true,
        });
      }
      if (s?.todayMin) items.push({ text: `${s.todayMin}m on the instruments today` });
      return items;
    },
  },
  {
    id: 'proof',
    place: 'the Workbench',
    app: 'Proof',
    tagline: 'Calculation workbench — problems attempted, compared, kept.',
    glyph: (
      <svg viewBox="0 0 32 32" {...S}>
        <path d="M11 7h10l-7 8 7 10H11" />
        <path d="M8 27h16" />
        <path d="M22 5l4-1-1 4" strokeDasharray="1.5 2" />
      </svg>
    ),
    today: (s) => {
      const items: TodayItem[] = [];
      if (s?.due) items.push({ text: `${s.due} review${s.due === 1 ? '' : 's'} due at the bench` });
      if (s?.attempts) items.push({ text: `${s.attempts} attempt${s.attempts === 1 ? '' : 's'} worked` });
      return items;
    },
  },
];

export const PLACE_MAP: Record<string, Place> = Object.fromEntries(PLACES.map((p) => [p.id, p]));
