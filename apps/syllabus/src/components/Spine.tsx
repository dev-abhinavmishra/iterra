import type { Course, Term } from '../lib/types';
import { courseColorVar } from '../lib/colors';
import { stampDate } from '../lib/utils';
import { LibraryBig } from 'lucide-react';

interface SpineProps {
  term?: Term;
  courses: Course[];
  activeCourseId?: string;
  onOpenCourse: (id: string) => void;
  onOpenSemester: () => void;
}

/**
 * The vertical semester spine — the folio's signature element.
 * Course tabs are its only large color surfaces; everything else stays neutral.
 */
export function Spine({ term, courses, activeCourseId, onOpenCourse, onOpenSemester }: SpineProps) {
  const active = courses.filter((c) => !c.archived);
  return (
    <nav
      aria-label="Semester spine"
      className="no-print shrink-0 w-14 sm:w-16 flex flex-col items-stretch bg-[color:var(--color-desk-deep)] border-r border-[color:var(--color-desk-edge)]"
    >
      {/* registrar seal */}
      <button
        onClick={onOpenSemester}
        className="group flex flex-col items-center pt-4 pb-3 px-1 focus-visible:outline-2 focus-visible:outline-white"
        title="Semester folio"
      >
        <span
          className="mono text-[9px] font-semibold tracking-[0.28em] text-[#8f97a3] group-hover:text-[#c9cfd8] transition-colors"
          style={{ writingMode: 'vertical-rl' }}
        >
          SYLLABUS
        </span>
        <LibraryBig size={15} className="mt-2 text-[#6b7280] group-hover:text-[#aeb6c0] transition-colors" aria-hidden />
      </button>

      <div className="mx-3 border-t border-[#34383f]" />

      {/* course tabs */}
      <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-1.5 items-end pr-0 pl-2">
        {active.map((c) => (
          <button
            key={c.id}
            onClick={() => onOpenCourse(c.id)}
            className={`ctab ${activeCourseId === c.id ? 'ctab--on' : ''}`}
            style={{ background: courseColorVar(c.color) }}
            title={`${c.code} — ${c.name}`}
            aria-current={activeCourseId === c.id ? 'page' : undefined}
          >
            {c.code}
          </button>
        ))}
        {active.length === 0 && (
          <span className="mono text-[9px] tracking-[0.2em] text-[#5c636e] rotate-180" style={{ writingMode: 'vertical-rl' }}>
            NO COURSES FILED
          </span>
        )}
      </div>

      {/* term imprint at the foot of the spine */}
      {term && (
        <div className="px-1 pb-3 pt-2 flex flex-col items-center gap-1">
          <span
            className="mono text-[8.5px] tracking-[0.18em] text-[#5c636e]"
            style={{ writingMode: 'vertical-rl' }}
            title={`${term.name} · ${stampDate(term.startDate)} – ${stampDate(term.endDate)}`}
          >
            {term.name.toUpperCase()}
          </span>
        </div>
      )}
    </nav>
  );
}
