import { useMemo } from 'react';
import { BookOpen, Plus, ArrowUpRight, FolderOpen } from 'lucide-react';
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
        if (e.type === 'deck' && typeof e.data?.due === 'number') {
          g.dueCards = Math.max(g.dueCards, e.data.due);
        }
      } else if (e.type === 'card') {
        if (typeof e.data?.dueAt === 'number' && e.data.dueAt <= Date.now()) g.dueCards++;
      } else if (['block', 'commitment', 'assignment', 'routine', 'experiment'].includes(e.type)) {
        g.schedule++;
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

    return { courses: [...map.values()], unfiledCount: unfiled };
  }, [entities, indexes]);

  return (
    <div className="terrain-map min-h-full">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-line)] pb-4">
          <div>
            <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
              Directory
            </div>
            <h1 className="font-place text-[24px] font-semibold text-[var(--color-ink)]">
              Course Workspaces
            </h1>
            <p className="mt-0.5 text-[13px] text-[var(--color-mute)]">
              Each course workspace brings together its schedule, study materials, practice decks, calculations, and results.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => onEnter('syllabus')}
            >
              Manage Courses in Planning
            </Button>
          </div>
        </div>

        {courses.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => onGo(`#/c/${encodeURIComponent(c.code)}`)}
                className="place-card group flex flex-col justify-between rounded-[6px] border border-[var(--color-line-2)] bg-[var(--color-sheet)] p-4 text-left hover:border-[var(--color-accent)] cursor-pointer"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[13px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                      {c.code}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {c.dueCards > 0 && <Badge tone="warn">{c.dueCards} due</Badge>}
                      <ArrowUpRight className="h-4 w-4 text-[var(--color-faint)] group-hover:text-[var(--color-accent)]" />
                    </div>
                  </div>
                  <h2 className="mt-1 text-[16px] font-semibold text-[var(--color-ink)]">
                    {c.name || `${c.code} Workspace`}
                  </h2>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2 border-t border-[var(--color-line)] pt-3 text-center">
                  <div>
                    <div className="font-mono text-[13px] font-semibold text-[var(--color-ink)]">
                      {c.materials}
                    </div>
                    <div className="text-[10px] text-[var(--color-faint)]">Materials</div>
                  </div>
                  <div>
                    <div className="font-mono text-[13px] font-semibold text-[var(--color-ink)]">
                      {c.practice}
                    </div>
                    <div className="text-[10px] text-[var(--color-faint)]">Practice</div>
                  </div>
                  <div>
                    <div className="font-mono text-[13px] font-semibold text-[var(--color-ink)]">
                      {c.schedule}
                    </div>
                    <div className="text-[10px] text-[var(--color-faint)]">Schedule</div>
                  </div>
                  <div>
                    <div className="font-mono text-[13px] font-semibold text-[var(--color-ink)]">
                      {c.results}
                    </div>
                    <div className="text-[10px] text-[var(--color-faint)]">Results</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
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
