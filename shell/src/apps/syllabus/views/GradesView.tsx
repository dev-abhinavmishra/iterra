import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import { useFolio, selectTermCourses } from '../store';
import { buildCourseGradebook, formatRequiredAverage, type CourseGradebook, type GradebookEntry } from '../lib/gradebook';
import { stampDate } from '../lib/utils';
import { courseColorVar } from '../lib/colors';

export function GradesView({ onOpenCourse, onInspect }: {
  onOpenCourse: (id: string) => void;
  onInspect: (id: string) => void;
}) {
  const courses = useFolio(useShallow(selectTermCourses));
  const commitments = useFolio((state) => state.commitments);
  const books = useMemo(() => courses
    .filter((course) => !course.archived)
    .map((course) => buildCourseGradebook(
      course,
      Object.values(commitments).filter((commitment) => commitment.courseId === course.id),
    )), [courses, commitments]);

  return (
    <div className="syllabus-grades max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <header className="mb-6">
        <p className="kicker">TERM LEDGER · SCORES FROM FILED WORK</p>
        <h1 className="slab text-[30px] font-semibold leading-tight mt-1">Grades</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--color-ink-soft)]">
          Scores and weights stay attached to their commitments. Open a record to enter or correct its grade.
          Each course is calculated separately from scored, weighted work.
        </p>
      </header>

      {books.length === 0 ? (
        <div className="gradebook-empty" role="status">
          No courses are filed in this term yet. File a course in Semester to start a grade ledger.
        </div>
      ) : (
        <div className="space-y-5">
          {books.map((book) => (
            <CourseGradeCard key={book.course.id} book={book} onOpenCourse={onOpenCourse} onInspect={onInspect} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseGradeCard({ book, onOpenCourse, onInspect }: {
  book: CourseGradebook;
  onOpenCourse: (id: string) => void;
  onInspect: (id: string) => void;
}) {
  const { course, scenario } = book;
  const total = book.totalWeight;
  const shownRemaining = scenario?.remainingWeight ?? total;
  const targetText = book.targetLabel === 'recognized'
    ? `${course.targetGrade} · ${book.targetPercent}%`
    : book.targetLabel === 'unrecognized'
      ? `Unrecognized: “${course.targetGrade}”`
      : 'Not set';

  return (
    <section className="gradebook-course" aria-labelledby={`gradebook-${course.id}`}>
      <div className="gradebook-course-head" style={{ borderInlineStartColor: courseColorVar(course.color) }}>
        <div className="min-w-0">
          <p className="kicker">{course.code}</p>
          <h2 id={`gradebook-${course.id}`} className="slab text-xl font-semibold leading-tight">{course.name}</h2>
        </div>
        <button className="btn btn--ghost gradebook-open" onClick={() => onOpenCourse(course.id)}>
          <BookOpen size={14} aria-hidden />
          <span>Open course</span>
          <ArrowUpRight size={13} aria-hidden />
        </button>
      </div>

      <div className="gradebook-summary" role="group" aria-label={`${course.code} grade summary`}>
        <SummaryMetric label="Weighted standing" value={scenario ? `${formatPercent(scenario.standing)}%` : 'No weighted scores'} />
        <SummaryMetric label="Scored weight" value={`${scenario?.gradedWeight ?? 0} / ${total}`} detail="weight points" />
        <SummaryMetric label="Ungraded weight" value={`${shownRemaining}`} detail="weight points" />
        <SummaryMetric label="Target" value={targetText} />
      </div>

      <TargetStatus book={book} />

      <div className="gradebook-list-heading">
        <h3 className="kicker">COMMITMENT RECORDS</h3>
        <span className="mono text-[10px] text-[color:var(--color-ink-faint)]">
          {book.entries.length} {book.entries.length === 1 ? 'record' : 'records'}
        </span>
      </div>
      {book.entries.length === 0 ? (
        <p className="gradebook-empty-records">No graded work has been filed for this course.</p>
      ) : (
        <ul className="gradebook-entries" aria-label={`${course.code} commitment records`}>
          {book.entries.map((entry) => (
            <GradeEntryRow key={entry.commitment.id} entry={entry} onInspect={onInspect} />
          ))}
        </ul>
      )}
      {(book.unweightedCount > 0 || book.droppedCount > 0 || book.invalidCount > 0) && (
        <p className="gradebook-footnote">
          {book.unweightedCount > 0 && `${book.unweightedCount} without weight`}
          {book.unweightedCount > 0 && book.droppedCount > 0 && ' · '}
          {book.droppedCount > 0 && `${book.droppedCount} dropped and excluded`}
          {(book.unweightedCount > 0 || book.droppedCount > 0) && book.invalidCount > 0 && ' · '}
          {book.invalidCount > 0 && `${book.invalidCount} invalid score${book.invalidCount === 1 ? '' : 's'} need correction`}
        </p>
      )}
    </section>
  );
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="gradebook-metric">
      <span className="kicker">{label}</span>
      <span className="gradebook-metric-value">{value}</span>
      {detail && <span className="gradebook-metric-detail">{detail}</span>}
    </div>
  );
}

function TargetStatus({ book }: { book: CourseGradebook }) {
  if (book.targetLabel === 'unset') {
    return <p className="gradebook-target-note">Set a target in the course record to see what average is needed on ungraded work.</p>;
  }
  if (book.targetLabel === 'unrecognized') {
    return <p className="gradebook-target-note" role="status">This target isn’t recognized, so the target calculation is unavailable.</p>;
  }
  const scenario = book.scenario;
  if (!scenario) {
    if (book.requiredAverage != null) {
      return (
        <p className="gradebook-target-note">
          No weighted scores yet. Need an average of <strong>{formatRequiredAverage(book.requiredAverage)}%</strong>
          {' '}across {book.totalWeight} filed weight points to reach {book.course.targetGrade}.
        </p>
      );
    }
    return <p className="gradebook-target-note">No weighted work has been filed yet for the {book.course.targetGrade} target.</p>;
  }
  if (scenario.needed == null) {
    return (
      <p className="gradebook-target-note" role="status">
        No weighted work remains. The final standing {scenario.secured ? 'meets' : 'does not meet'} the target.
      </p>
    );
  }
  if (scenario.secured) {
    return <p className="gradebook-target-note" role="status">Target secured by the current standing; {scenario.remainingWeight} weight points remain ungraded.</p>;
  }
  if (!scenario.reachable) {
    return <p className="gradebook-target-note" role="status">Target is no longer reachable from the current standing and remaining weight.</p>;
  }
  return (
    <p className="gradebook-target-note">
      Need an average of <strong>{formatRequiredAverage(scenario.needed)}%</strong> across {scenario.remainingWeight} remaining weight points to reach {book.course.targetGrade}.
    </p>
  );
}

function GradeEntryRow({ entry, onInspect }: { entry: GradebookEntry; onInspect: (id: string) => void }) {
  const { commitment, state } = entry;
  const status = {
    scored: 'Scored', invalid: 'Invalid score', awaiting: 'Filed · awaiting grade', upcoming: 'Open · no score',
    unweighted: 'Unweighted · excluded', dropped: 'Dropped · excluded',
  }[state];
  const grade = typeof commitment.grade === 'number' && Number.isFinite(commitment.grade)
    ? `${commitment.grade} / 100`
    : '—';

  return (
    <li className="gradebook-entry">
      <div className="min-w-0">
        <button className="gradebook-record-link" onClick={() => onInspect(commitment.id)} aria-label={`Open grade editor for ${commitment.title}`}>
          {commitment.title}
        </button>
        <p className="gradebook-record-meta">{commitment.type} · due {stampDate(commitment.dueAt.slice(0, 10))}</p>
      </div>
      <span className={`gradebook-record-state gradebook-record-state--${state}`}>{status}</span>
      <span className="gradebook-record-score" aria-label={state === 'scored' ? `Grade ${grade}` : status}>{grade}</span>
      <span className="gradebook-record-weight">{commitment.weight} wt</span>
    </li>
  );
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
