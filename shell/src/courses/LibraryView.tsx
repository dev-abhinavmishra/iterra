import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, FileText, Layers, Sigma, Calendar } from 'lucide-react';
import { AtlasMasthead } from '../mosaic/AtlasMasthead';
import './workspace-atlas.css';
import { readShelf, subscribeShelf } from '../shelf';
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
  const storageKey = 'iterra.library.view.' + activeCourseFilter;
  const [initial] = useState(() => {
    try { return new URLSearchParams(sessionStorage.getItem(storageKey) || ''); }
    catch { return new URLSearchParams(); }
  });
  const firstFilter = initial.get('category');
  const [filter, setFilter] = useState<LibraryFilter>(
    firstFilter === 'materials' || firstFilter === 'practice' || firstFilter === 'schedule' || firstFilter === 'results' ? firstFilter : 'all'
  );
  const [query, setQuery] = useState(initial.get('q') || '');
  const [coursePick, setCoursePick] = useState(initial.get('course') ?? activeCourseFilter);
  const [pinnedOnly, setPinnedOnly] = useState(initial.get('pins') === '1');
  const [sort, setSort] = useState(initial.get('sort') === 'name' ? 'name' : 'recent');
  const [pins, setPins] = useState(readShelf);
  useEffect(() => subscribeShelf(setPins), []);
  const pinnedUrls = useMemo(() => new Set(pins.map(pin => pin.url)), [pins]);
  useEffect(() => {
    const state = new URLSearchParams({ q: query, course: coursePick, category: filter, pins: pinnedOnly ? '1' : '0', sort });
    try { sessionStorage.setItem(storageKey, state.toString()); } catch { /* Storage may be disabled. */ }
  }, [storageKey, query, coursePick, filter, pinnedOnly, sort]);
  const narrowed = Boolean(query || coursePick || pinnedOnly || filter !== 'all');
  const resetFilters = () => { setQuery(''); setCoursePick(''); setFilter('all'); setPinnedOnly(false); };

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
      if (pinnedOnly && !pinnedUrls.has(o.url)) return false;
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
        if (!q.split(/\s+/).every(word => hay.includes(word))) return false;
      }
      return true;
    });
  }, [allObjects, query, coursePick, pinnedOnly, pinnedUrls]);

  const filtered = useMemo(
    () =>
      contextObjects.filter((o) => {
        if (filter === 'materials' && !['note', 'source'].includes(o.type)) return false;
        if (filter === 'practice' && !['deck', 'quiz', 'problem', 'attempt'].includes(o.type)) return false;
        if (filter === 'schedule' && !['block', 'commitment', 'assignment', 'routine', 'experiment', 'followup'].includes(o.type)) return false;
        if (filter === 'results' && !['assessment', 'grade', 'scan', 'session'].includes(o.type)) return false;
        return true;
      }).sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title, undefined, { numeric: true }) : (b.updatedAt || 0) - (a.updatedAt || 0)),
    [contextObjects, filter, sort],
  );

  /* pages of rows — a multi-semester workspace can carry thousands of
     entities; render the first page and expand on demand */
  const PAGE = 150;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [query, coursePick, filter, pinnedOnly, sort]);

  return (
    <div className="terrain-map min-h-full">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-5">
        <AtlasMasthead
          object="books"
          eyebrow="the Stacks"
          title="Study library"
          sub="Find a note, reopen a deck, or pick up the work you pinned."
          actions={
            <>
              <Button
                variant="secondary"
                size="xs"
                icon={<FileText className="h-3.5 w-3.5" />}
                onClick={() => onEnter('ink')}
              >
                Open Notes
              </Button>
              <Button
                variant="secondary"
                size="xs"
                icon={<Layers className="h-3.5 w-3.5" />}
                onClick={() => onEnter('flashcards')}
              >
                Open Flashcards
              </Button>
              <Button
                variant="secondary"
                size="xs"
                icon={<Sigma className="h-3.5 w-3.5" />}
                onClick={() => onEnter('proof')}
              >
                Open Calculations
              </Button>
            </>
          }
        />

        {/* Filter Bar */}
        <div className="rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] p-3.5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[min(100%,200px)]">
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

          <div className="-mb-3.5 overflow-x-auto">
            <Tabs<LibraryFilter>
              ariaLabel="Filter by category"
              active={filter}
              onChange={setFilter}
              items={[
                { key: 'all', label: 'All', count: contextObjects.length },
                {
                  key: 'materials',
                  label: 'Notes & materials',
                  count: contextObjects.filter((o) => ['note', 'source'].includes(o.type)).length,
                },
                {
                  key: 'practice',
                  label: 'Decks & problems',
                  count: contextObjects.filter((o) => ['deck', 'quiz', 'problem', 'attempt'].includes(o.type)).length,
                },
                {
                  key: 'schedule',
                  label: 'Schedule & routines',
                  count: contextObjects.filter((o) => ['block', 'commitment', 'assignment', 'routine', 'experiment', 'followup'].includes(o.type)).length,
                },
                {
                  key: 'results',
                  label: 'Results & logs',
                  count: contextObjects.filter((o) => ['assessment', 'grade', 'scan', 'session'].includes(o.type)).length,
                },
              ]}
            />
          </div>
        </div>

        <div className="study-results-bar">
          <span role="status">{filtered.length} {filtered.length === 1 ? 'item' : 'items'}</span>
          <button type="button" className="study-pin-filter" aria-pressed={pinnedOnly} onClick={() => setPinnedOnly(value => !value)}>Pinned</button>
          <Select aria-label="Sort library" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="recent">Recently updated</option><option value="name">Title A–Z</option>
          </Select>
          {narrowed && <button type="button" className="study-reset" onClick={resetFilters}>Clear filters</button>}
        </div>
        {/* Results List */}
        {filtered.length > 0 ? (
          <div>
            <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
              {filtered.slice(0, shown).map((item) => (
                <ObjectRow
                  key={item.key}
                  item={item}
                  selected={selectedObject?.key === item.key}
                  onOpen={onGo}
                  onSelectContext={onSelectObject}
                />
              ))}
            </div>
            {filtered.length > shown && (
              <button
                type="button"
                onClick={() => setShown(current => current + PAGE)}
                className="mt-2 w-full rounded-[6px] border border-dashed border-[var(--color-line)] py-2 text-[12px] font-medium text-[var(--color-mute)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                Show {Math.min(PAGE, filtered.length - shown)} more
              </button>
            )}
          </div>
        ) : (
          <EmptyState
            icon={<Plus className="h-4 w-4" />}
            title={narrowed ? 'No matching items' : 'Your library is empty'}
            description={
              narrowed
                ? 'Clear the filters to see the rest of your library.'
                : 'Notes, imported sheets, decks, and scheduled blocks will all live here.'
            }
            actions={
              narrowed ? (
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={resetFilters}
                >
                  Clear filters
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
                    Plan course work
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
