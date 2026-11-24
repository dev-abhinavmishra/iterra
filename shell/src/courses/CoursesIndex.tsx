import { useIterraGlass } from '../ui/glass';
import { useMemo, useState } from 'react';
import { BookOpen, Plus, ArrowUpRight, FolderOpen } from 'lucide-react';
import './workspace-atlas.css';
import type { Entity, StoreEntity } from '../hub';
import { Badge, Button, EmptyState, SectionHeader } from '../ui/primitives';

export function CoursesIndex({
  entities,
  indexes,
  onGo,
  onEnter,
}: {
  entities: StoreEntity[];
  indexes: Record<string, Entity[]>;
  onGo: (url: string) => void;
  onEnter: (place: string) => void;
}) {
  const actionLens = useIterraGlass<HTMLDivElement>('actions');
  const [search, setSearch] = useState('');
  const { courses, unfiledCount } = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        code: string;
        name?: string;
        materials: number;
        practice: number;
        dueCards: number;
        schedule: number;
        results: number;
        total: number;
      }
    >();

    const ensure = (rawCode: string, name?: string) => {
      const k = rawCode.trim().toLowerCase();
      if (!k || k === 'unfiled') return null;
      if (!map.has(k)) {
        map.set(k, {
          key: k,
          code: rawCode.trim(),
          name,
          materials: 0,
          practice: 0,
          dueCards: 0,
          schedule: 0,
          results: 0,
          total: 0,
        });
      } else if (name && !map.get(k)!.name) {
        map.get(k)!.name = name;
      }
      return map.get(k)!;
    };

    let unfiled = 0;
    const seenSigs = new Set<string>();

    /* card entities carry their parent deck id — a deck whose cards are
       mirrored reports due per-card (line below); a deck entity with no
       mirrored children falls back to its data.due count. Without this
       split the same cards count twice. */
    const decksWithCards = new Set<string>();
    for (const e of entities || []) {
      if (e?.type === 'card' && typeof e.data?.deckId === 'string') {
        decksWithCards.add(e.data.deckId);
      }
    }

    for (const e of entities || []) {
      if (e.type === 'course') {
        const code = (e.data?.code as string) || e.course || e.title || '';
        const name = e.title && e.title !== code ? e.title : (e.data?.name as string) || undefined;
        if (code) ensure(code, name);
        continue;
      }
      if (!e.title || e.type === 'term' || e.type === 'link' || e.type === 'event') continue;
      const sig = `${e.app}|${e.url || ''}|${e.title}`;
      seenSigs.add(sig);
      const code = e.course || e.topic;
      if (!code) {
        unfiled++;
        continue;
      }
      const g = ensure(code);
      if (!g) continue;
      g.total++;
      if (e.type === 'note' || e.type === 'source') g.materials++;
      else if (['deck', 'quiz', 'problem', 'attempt'].includes(e.type)) {
        g.practice++;
        if (e.type === 'deck' && typeof e.data?.due === 'number' && !decksWithCards.has(e.id)) {
          g.dueCards += e.data.due;
        }
      } else if (e.type === 'card') {
        if (typeof e.data?.dueAt === 'number' && e.data.dueAt <= Date.now()) g.dueCards++;
      } else if (['block', 'commitment', 'assignment', 'routine', 'experiment'].includes(e.type)) {
        /* the card's Schedule figure means live work — a dropped
           commitment or stamped/deferred slip still exists but isn't
           scheduled anything */
        const st = (e.data?.status ?? e.data?.state) as string | undefined;
        if (st !== 'done' && st !== 'dropped' && st !== 'deferred' && st !== 'completed' && st !== 'archived' && st !== 'paused') {
          g.schedule++;
        }
      } else if (['assessment', 'grade', 'scan', 'session'].includes(e.type)) {
        g.results++;
      }
    }

    for (const [app, list] of Object.entries(indexes || {})) {
      for (const e of list || []) {
        if (!e?.title) continue;
        const sig = `${app}|${e.url || ''}|${e.title}`;
        if (seenSigs.has(sig)) continue;
        seenSigs.add(sig);
        const code = e.course || e.topic;
        if (!code) {
          unfiled++;
          continue;
        }
        const g = ensure(code);
        if (!g) continue;
        g.total++;
        if (e.t === 'note') g.materials++;
        else if (['deck', 'quiz', 'problem'].includes(e.t || '')) g.practice++;
        else if (['block', 'routine', 'experiment'].includes(e.t || '')) g.schedule++;
        else if (['assessment', 'session'].includes(e.t || '')) g.results++;
      }
    }

    return {
      courses: [...map.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
      unfiledCount: unfiled,
    };
  }, [entities, indexes]);

  const needle = search.trim().toLowerCase();
  const visible = courses.filter(c => [c.code, c.name].some(value => value?.toLowerCase().includes(needle)));
  return (
    <div className="terrain-map min-h-full">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <header className="study-masthead course-masthead">
          <div><h1>Your courses</h1><p>Open a course, or jump straight to its materials, practice, schedule, or results.</p></div>
          <div ref={actionLens} className="study-action-lens it-lens flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => onEnter('syllabus')}
            >
              Manage Courses in Planning
            </Button>
          </div>
        </header>

        {courses.length > 0 ? (
          <>
            <div className="study-filter-line">
              <label htmlFor="course-search">Find a course</label>
              <input id="course-search" type="search" placeholder="Course name or code" value={search} onChange={e => setSearch(e.target.value)} />
              <span role="status">{visible.length} of {courses.length} courses</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map(c => {
                const url = `#/c/${encodeURIComponent(c.code)}`;
                return <article className="study-course" key={c.key}>
                  <a className="study-course-title" href={url}>
                    <span className="study-code">{c.code}</span>
                    <h2>{c.name || c.code}</h2>
                    {c.dueCards > 0 && <Badge tone="warn">{c.dueCards} cards due</Badge>}
                    <ArrowUpRight size={17} aria-hidden="true" />
                  </a>
                  <div className="study-course-links">
                    {([['materials', 'Materials', c.materials], ['practice', 'Practice', c.practice],
                      ['schedule', 'Schedule', c.schedule], ['results', 'Results', c.results]] as const).map(([tab, label, count]) => (
                      <a key={tab} href={url + '?tab=' + tab} aria-label={c.code + ' ' + label + ', ' + count}>
                        <strong>{count}</strong><span>{label}</span>
                      </a>
                    ))}
                  </div>
                </article>;
              })}
            </div>
            {visible.length === 0 && <EmptyState title="No matching courses" description="Try another name or course code."
              actions={<Button onClick={() => setSearch('')}>Clear search</Button>} />}
          </>
        ) : (
          <EmptyState
            icon={<BookOpen className="h-4 w-4" />}
            title="No courses registered yet"
            description="Register your semester courses in Planning (Syllabus) to organize your notes, flashcard decks, problems, and assessments by course."
            actions={
              <Button variant="primary" size="sm" onClick={() => onEnter('syllabus')}>
                Open Planning to Add Courses
              </Button>
            }
          />
        )}

        {/* Getting Started workspace — guides + anything not yet filed */}
        <section className="pt-2">
          <SectionHeader title="Getting Started" />
          <button
            type="button"
            onClick={() => onGo('#/c/unfiled')}
            className="flex w-full items-center justify-between gap-4 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-4 py-3 text-left hover:border-[var(--color-accent)] cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-[5px] bg-[var(--color-sheet-2)] text-[var(--color-mute)]">
                <FolderOpen className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[13.5px] font-semibold text-[var(--color-ink)]">
                  Getting Started
                </div>
                <div className="text-[12px] text-[var(--color-mute)]">
                  {unfiledCount > 0
                    ? `Guides for every tool, plus ${unfiledCount} item${unfiledCount === 1 ? '' : 's'} not yet assigned to a course`
                    : 'Guides for every tool — everything current is filed under a course'}
                </div>
              </div>
            </div>
            <span className="text-[12px] font-medium text-[var(--color-accent)]">
              Open →
            </span>
          </button>
        </section>
      </div>
    </div>
  );
}
