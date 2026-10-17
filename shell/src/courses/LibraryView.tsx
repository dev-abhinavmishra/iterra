import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, FileText, Layers, Sigma, Calendar } from 'lucide-react';
import type { Entity, StoreEntity } from '../hub';
import { Button, EmptyState, Input, Select, Tabs } from '../ui/primitives';
import {
  ObjectRow,
  type WorkspaceObject,
  toWorkspaceObject,
} from '../ui/ObjectRow';

type LibraryFilter = 'all' | 'materials' | 'practice' | 'schedule' | 'results';

export function LibraryView({
  entities,
  indexes,
  activeCourseFilter = '',
  selectedObject,
  onSelectObject,
  onGo,
  onEnter,
}: {
  entities: StoreEntity[];
  indexes: Record<string, Entity[]>;
  activeCourseFilter?: string;
  selectedObject?: WorkspaceObject | null;
  onSelectObject?: (obj: WorkspaceObject) => void;
  onGo: (url: string) => void;
  onEnter: (place: string) => void;
}) {
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');
  /* starts on the ambient filter but is local state: 'All courses' (value
     '') must be able to clear it — falling back to the ambient value here
     would make that option a dead end while a course filter is active */
  const [coursePick, setCoursePick] = useState<string>(activeCourseFilter);
  useEffect(() => setCoursePick(activeCourseFilter), [activeCourseFilter]);

  const allObjects = useMemo<WorkspaceObject[]>(() => {
    const out: WorkspaceObject[] = [];
    const seen = new Set<string>();
    for (const e of entities || []) {
      if (!e?.title || e.type === 'course' || e.type === 'term' || e.type === 'link' || e.type === 'event' || e.type === 'card') {
        continue;
      }
      const w = toWorkspaceObject(e);
      const sig = `${w.app}|${w.url}|${w.title}`;
      seen.add(sig);
      out.push(w);
    }
    for (const [app, list] of Object.entries(indexes || {})) {
      for (const e of list || []) {
        if (!e?.title) continue;
        const url = e.url || `/apps/${app}/`;
        const sig = `${app}|${url}|${e.title}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push({
          key: `${app}:${e.t || 'item'}:${e.id || e.title}`,
          app,
          type: e.t || 'item',
          id: e.id || e.title,
          title: e.title,
          sub: e.sub,
          course: e.course,
          topic: e.topic,
          url,
          updatedAt: e.at,
        });
      }
    }
    return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [entities, indexes]);

  const availableCourses = useMemo(() => {
    const set = new Set<string>();
    for (const e of entities) {
      if (e.type === 'course') {
        const c = (e.data?.code as string) || e.course || e.title;
        if (c) set.add(c);
      } else if (e.course) {
        set.add(e.course);
      }
    }
    for (const o of allObjects) if (o.course) set.add(o.course);
    return [...set].sort();
  }, [entities, allObjects]);

  /* course+query context first — the category tabs count and the list both
     filter inside it, so a badge never promises rows the list doesn't have */
  const contextObjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cFilter = coursePick.trim().toLowerCase();
    return allObjects.filter((o) => {
      if (cFilter) {
        if (cFilter === 'unfiled') {
          if (o.course || o.topic) return false;
        } else if (
          (o.course || '').toLowerCase() !== cFilter &&
          (o.topic || '').toLowerCase() !== cFilter
        ) {
          return false;
        }
      }
      if (q) {
        const hay = [o.title, o.sub, o.course, o.topic, o.type, o.app]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allObjects, query, coursePick]);

  const filtered = useMemo(
    () =>
      contextObjects.filter((o) => {
        if (filter === 'materials' && !['note', 'source'].includes(o.type)) return false;
        if (filter === 'practice' && !['deck', 'quiz', 'problem', 'attempt'].includes(o.type)) return false;
        if (filter === 'schedule' && !['block', 'commitment', 'assignment', 'routine', 'experiment'].includes(o.type)) return false;
        if (filter === 'results' && !['assessment', 'grade', 'scan', 'session'].includes(o.type)) return false;
        return true;
      }),
    [contextObjects, filter],
  );

  return (
    <div className="terrain-map min-h-full">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
              Workspace Repository
            </div>
            <h1 className="font-place text-[24px] font-semibold text-[var(--color-ink)]">
              Library
            </h1>
            <p className="mt-0.5 text-[13px] text-[var(--color-mute)]">
              Browse, filter, and connect notes, study materials, decks, problems, schedules, and results across every tool.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="xs"
              icon={<FileText className="h-3.5 w-3.5" />}
              onClick={() => onEnter('ink')}
            >
              New Note
            </Button>
            <Button
              variant="secondary"
              size="xs"
              icon={<Layers className="h-3.5 w-3.5" />}
              onClick={() => onEnter('flashcards')}
            >
              New Deck
            </Button>
            <Button
              variant="secondary"
              size="xs"
              icon={<Sigma className="h-3.5 w-3.5" />}
              onClick={() => onEnter('proof')}
            >
              New Problem
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] p-3.5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-faint)]" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by title, course, topic, or type…"
                aria-label="Filter library objects"
                className="pl-8"
              />
            </div>

            <Select
              value={coursePick}
              onChange={(e) => setCoursePick(e.target.value)}
              aria-label="Filter by course"
            >
              <option value="">All courses</option>
              {availableCourses.map((c) => (
                <option key={c} value={c}>
                  Course: {c}
                </option>
              ))}
              <option value="unfiled">Unfiled only</option>
            </Select>
          </div>

          <div className="-mb-3.5">
            <Tabs<LibraryFilter>
              ariaLabel="Object category filter"
              active={filter}
              onChange={setFilter}
              items={[
                { key: 'all', label: 'All Objects', count: contextObjects.length },
                {
                  key: 'materials',
                  label: 'Notes & Materials',
                  count: contextObjects.filter((o) => ['note', 'source'].includes(o.type)).length,
                },
                {
                  key: 'practice',
                  label: 'Decks & Calculations',
                  count: contextObjects.filter((o) => ['deck', 'quiz', 'problem', 'attempt'].includes(o.type)).length,
                },
                {
                  key: 'schedule',
                  label: 'Schedule & Routines',
                  count: contextObjects.filter((o) => ['block', 'commitment', 'assignment', 'routine', 'experiment'].includes(o.type)).length,
                },
                {
                  key: 'results',
                  label: 'Assessments & Logs',
                  count: contextObjects.filter((o) => ['assessment', 'grade', 'scan', 'session'].includes(o.type)).length,
                },
              ]}
            />
          </div>
        </div>

        {/* Results List */}
        {filtered.length > 0 ? (
          <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
            {filtered.map((item) => (
              <ObjectRow
                key={item.key}
                item={item}
                selected={selectedObject?.key === item.key}
                onOpen={onGo}
                onSelectContext={onSelectObject}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Plus className="h-4 w-4" />}
            title={query || coursePick ? 'No matching workspace objects' : 'Your workspace library is empty'}
            description={
              query || coursePick
                ? 'Try clearing the search filter or selecting "All courses".'
                : 'Create notes, import study sheets, build flashcard decks, or schedule course blocks to populate your library.'
            }
            actions={
              query || coursePick ? (
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => {
                    setQuery('');
                    setCoursePick('');
                    setFilter('all');
                  }}
                >
                  Reset Filters
                </Button>
              ) : (
                <>
                  <Button variant="primary" size="xs" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => onEnter('ink')}>
                    Write a Note
                  </Button>
                  <Button variant="secondary" size="xs" icon={<Layers className="h-3.5 w-3.5" />} onClick={() => onEnter('flashcards')}>
                    Create a Deck
                  </Button>
                  <Button variant="secondary" size="xs" icon={<Calendar className="h-3.5 w-3.5" />} onClick={() => onEnter('syllabus')}>
                    Plan Course Work
                  </Button>
                </>
              )
            }
          />
        )}
      </div>
    </div>
  );
}
