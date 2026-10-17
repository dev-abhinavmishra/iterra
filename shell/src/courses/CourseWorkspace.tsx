import { useEffect, useMemo, useState } from 'react';
import {
  Play,
  Layers,
  FileText,
  Calendar,
  CheckSquare,
  Sigma,
  Award,
  Clock,
  BookOpen,
  ArrowLeft,
  Plus,
  ChevronDown,
} from 'lucide-react';
import { PLACE_MAP } from '../places';
import { GETTING_STARTED } from '../gettingStarted';
import type { Entity, FeedItem, SharedField, StoreEntity } from '../hub';
import { sendTo } from '../hub';
import { subscribeShelf, togglePin, type ShelfPin } from '../shelf';
import {
  Badge,
  Button,
  DropdownMenu,
  EmptyState,
  RelationshipChip,
  SectionHeader,
  Tabs,
} from '../ui/primitives';
import {
  ObjectRow,
  type WorkspaceObject,
  toWorkspaceObject,
} from '../ui/ObjectRow';
import { WorkspaceChainView } from '../integration/components';

export type CourseTab = 'overview' | 'materials' | 'practice' | 'schedule' | 'results';

interface RawLink {
  key?: string;
  from: string;
  to: string;
  kind?: string;
}

export interface CourseWorkspaceProps {
  course: string;
  indexes: Record<string, Entity[]>;
  entities: StoreEntity[];
  shared: Record<string, SharedField>;
  feed: FeedItem[];
  selectedObject?: WorkspaceObject | null;
  onSelectObject?: (obj: WorkspaceObject) => void;
  onGo: (url: string) => void;
  onEnter: (place: string) => void;
  onHome: () => void;
}

export function CourseWorkspace({
  course,
  indexes,
  entities,
  shared,
  feed,
  selectedObject,
  onSelectObject,
  onGo,
  onEnter,
  onHome,
}: CourseWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<CourseTab>('overview');
  const key = course.toLowerCase();
  const unfiled = key === 'unfiled';

  // Reset to overview when switching courses
  useEffect(() => {
    setActiveTab('overview');
  }, [course]);

  const courseEnt = useMemo(
    () =>
      (entities || []).find(
        (e) =>
          e.type === 'course' &&
          (((e.data?.code as string) || e.course || e.title || '').toLowerCase() === key ||
            (e.key || '').toLowerCase() === key),
      ) || null,
    [entities, key],
  );
  const courseId = courseEnt?.key;
  const display = ((courseEnt?.data?.code as string) || courseEnt?.course || courseEnt?.title || course) as string;
  const courseTitle =
    courseEnt?.title && courseEnt.title !== display
      ? courseEnt.title
      : (courseEnt?.data?.name as string) || undefined;

  const courseEnts = useMemo(() => {
    const d = display.toLowerCase();
    const listed = (entities || []).filter(
      (e) =>
        (courseId && e.courseId === courseId) ||
        (e.courseId || '').toLowerCase() === key ||
        (!unfiled &&
          ((e.course || '').toLowerCase() === key ||
            (e.course || '').toLowerCase() === d ||
            (e.topic || '').toLowerCase() === key ||
            (e.topic || '').toLowerCase() === d)) ||
        (unfiled && !e.courseId && !e.course && !e.topic),
    );
    return courseEnt && !listed.includes(courseEnt) ? [courseEnt, ...listed] : listed;
  }, [entities, courseId, courseEnt, display, key, unfiled]);

  // Unified WorkspaceObjects for this course (store + index mirror)
  const courseObjects = useMemo<WorkspaceObject[]>(() => {
    const out: WorkspaceObject[] = [];
    const seen = new Set<string>();
    const d = display.toLowerCase();

    for (const e of courseEnts) {
      if (!e.title || e.type === 'course' || e.type === 'term' || e.type === 'link') continue;
      const w = toWorkspaceObject(e);
      const sig = `${w.app}|${w.url}|${w.id}|${w.title}`;
      seen.add(sig);
      out.push(w);
    }

    for (const [app, list] of Object.entries(indexes || {})) {
      for (const e of list || []) {
        if (!e?.title) continue;
        const files = unfiled
          ? !e.course && !e.topic
          : (e.course || '').toLowerCase() === key ||
            (e.course || '').toLowerCase() === d ||
            (e.topic || '').toLowerCase() === key ||
            (e.topic || '').toLowerCase() === d;
        if (!files) continue;
        const url = e.url || `/apps/${app}/`;
        const sig = `${app}|${url}|${e.id || ''}|${e.title}`;
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
  }, [courseEnts, indexes, display, key, unfiled]);

  // Categorized sections
  const materials = useMemo(
    () => courseObjects.filter((o) => o.type === 'note' || o.type === 'source'),
    [courseObjects],
  );
  const practiceItems = useMemo(
    () =>
      courseObjects.filter((o) =>
        ['deck', 'quiz', 'problem', 'attempt'].includes(o.type),
      ),
    [courseObjects],
  );
  const dueCards = useMemo(
    () =>
      courseEnts.filter(
        (e) =>
          e.type === 'card' &&
          typeof (e.data?.dueAt as number) === 'number' &&
          (e.data!.dueAt as number) <= Date.now(),
      ),
    [courseEnts],
  );
  const scheduleItems = useMemo(
    () =>
      courseObjects.filter((o) =>
        ['block', 'commitment', 'assignment', 'routine', 'experiment'].includes(o.type),
      ),
    [courseObjects],
  );
  const resultItems = useMemo(
    () =>
      courseObjects.filter((o) =>
        ['assessment', 'grade', 'scan', 'session'].includes(o.type),
      ),
    [courseObjects],
  );

  const nextCommit = useMemo(
    () => {
      /* commitments carry ISO dueAt; blocks carry date-only plannedDate —
         resolve either to ms, or sort last */
      const dueMs = (e: (typeof courseEnts)[number]) => {
        const raw = e.data?.dueAt ?? e.data?.plannedDate;
        const ms = typeof raw === 'number' ? raw : typeof raw === 'string' ? Date.parse(raw) : NaN;
        return Number.isFinite(ms) ? ms : Infinity;
      };
      return courseEnts
        .filter(
          (e) =>
            (e.type === 'commitment' || e.type === 'block') &&
            e.data &&
            /* commitments close via status; blocks close via state */
            e.data.status !== 'done' &&
            e.data.status !== 'completed' &&
            e.data.state !== 'done' &&
            e.data.state !== 'deferred',
        )
        .sort((a, b) => dueMs(a) - dueMs(b))[0] || null;
    },
    [courseEnts],
  );

  const pendingCommits = useMemo(
    () =>
      courseEnts.filter(
        (e) =>
          e.type === 'commitment' &&
          e.data &&
          e.data.status !== 'done' &&
          e.data.status !== 'completed',
      ),
    [courseEnts],
  );

  const sessions = useMemo(() => courseEnts.filter((e) => e.type === 'session'), [courseEnts]);
  const sessionMins = useMemo(
    () => sessions.reduce((n, e) => n + ((e.data?.minutes as number) || 0), 0),
    [sessions],
  );

  const grades = useMemo(
    () => [...courseEnts.filter((e) => e.type === 'grade')].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [courseEnts],
  );
  const latestGrade = grades[0] || null;
  const gradeDelta = useMemo(() => {
    if (grades.length < 2) return null;
    const a = latestGrade?.data?.pct;
    const b = grades[1]?.data?.pct;
    return typeof a === 'number' && typeof b === 'number' ? Math.round(a - b) : null;
  }, [grades, latestGrade]);

  // Explicit graph links from iterra.links
  const [allLinks, setAllLinks] = useState<RawLink[]>([]);
  useEffect(() => {
    const it = window.iterra;
    if (!it?.links?.list) {
      setAllLinks([]);
      return;
    }
    let alive = true;
    it.links
      .list()
      .then((rows: any) => {
        if (alive && Array.isArray(rows)) setAllLinks(rows as RawLink[]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [entities]);

  // Map object key -> resolved explicit relationships
  const relationshipsByKey = useMemo(() => {
    const map = new Map<string, { kind: string; title: string; app: string; url: string }[]>();
    const entByKey = new Map<string, StoreEntity>();
    for (const e of entities) if (e.key) entByKey.set(e.key, e);

    const addRel = (ownerKey: string, otherKey: string, labelKind: string) => {
      const other = entByKey.get(otherKey);
      if (!other || !other.title) return;
      if (!map.has(ownerKey)) map.set(ownerKey, []);
      const list = map.get(ownerKey)!;
      if (!list.some((x) => x.url === other.url && x.title === other.title)) {
        list.push({
          kind: labelKind,
          title: other.title,
          app: PLACE_MAP[other.app]?.label || other.app,
          url: other.url || `/apps/${other.app}/`,
        });
      }
    };

    for (const l of allLinks) {
      if (!l.from || !l.to) continue;
      // If card is linked to a note, also bubble that relationship up to its parent deck
      const toEnt = entByKey.get(l.to);
      const fromEnt = entByKey.get(l.from);
      addRel(l.to, l.from, l.kind === 'derived' ? 'Derived from' : l.kind === 'retest' ? 'Retest for' : 'Linked from');
      addRel(l.from, l.to, l.kind === 'derived' ? 'Produced' : l.kind === 'attached' ? 'Attached' : 'Linked to');
      if (toEnt?.type === 'card' && typeof toEnt.data?.deckId === 'string') {
        const deckKey = `flashcards:deck:${toEnt.data.deckId}`;
        addRel(deckKey, l.from, 'Cards derived from');
        addRel(l.from, deckKey, 'Derived deck');
      }
      if (fromEnt?.type === 'card' && typeof fromEnt.data?.deckId === 'string') {
        const deckKey = `flashcards:deck:${fromEnt.data.deckId}`;
        addRel(deckKey, l.to, 'Linked to');
      }
    }
    return map;
  }, [allLinks, entities]);

  // Course-level backlinks
  const courseBacklinks = useMemo(() => {
    if (!courseEnt?.key) return [];
    return relationshipsByKey.get(courseEnt.key) || [];
  }, [courseEnt?.key, relationshipsByKey]);

  // Sibling courses sharing a topic
  const relatedCourses = useMemo(() => {
    const myTopics = new Set(courseEnts.map((e) => (e.topic || '').toLowerCase()).filter(Boolean));
    if (!myTopics.size) return [];
    const seen = new Map<string, string>();
    for (const e of entities || []) {
      const t = (e.topic || '').toLowerCase();
      if (!t || !myTopics.has(t)) continue;
      const c = e.course || (e.data?.code as string);
      if (!c || String(c).toLowerCase() === key || String(c).toLowerCase() === display.toLowerCase()) continue;
      seen.set(String(c).toLowerCase(), String(c));
    }
    return [...seen.values()].slice(0, 4);
  }, [courseEnts, entities, key, display]);

  // Live focus matching this course
  const fv = shared.focus?.v as any;
  const focusLive =
    (fv?.running === true || fv?.paused === true) &&
    Date.now() - (shared.focus?.at || 0) < 3 * 60 * 1000;
  const courseItemIds = useMemo(() => new Set(courseObjects.map((o) => o.id)), [courseObjects]);
  const focusMatchesCourse =
    focusLive &&
    ((fv.course && String(fv.course).toLowerCase() === key) ||
      (fv.blockId && courseItemIds.has(fv.blockId)));

  // Activity feed mentions
  const mentions = useMemo(() => {
    const keyRe = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const urlSet = new Set(courseObjects.map((o) => o.url));
    return (feed || [])
      .filter(
        (f) =>
          (!unfiled &&
            (keyRe.test(f.text) ||
              (f.course || '').toLowerCase() === key ||
              (f.topic || '').toLowerCase() === key)) ||
          (f.url ? urlSet.has(f.url) : false),
      )
      .slice(0, 8);
  }, [feed, key, unfiled, courseObjects]);

  const [pins, setPins] = useState<ShelfPin[]>([]);
  useEffect(() => subscribeShelf(setPins), []);
  const pinnedUrls = new Set(pins.map((p) => p.url));
  const courseRouteUrl = `#/c/${encodeURIComponent(course)}`;

  const [sent, setSent] = useState<{ t: string; url?: string } | null>(null);
  const showToast = (t: string, url?: string) => {
    setSent({ t, url });
    window.setTimeout(() => setSent(null), 4000);
  };

  /* ── Course-level Actions ── */
  const startSession = async () => {
    const r = await sendTo({
      to: 'timer',
      action: 'timer.start',
      payload: {
        label: nextCommit?.title || `${display} focus`,
        minutes: (nextCommit?.data?.estimatedMinutes as number) || 25,
        commitmentId: nextCommit?.id,
        courseId,
        course: display,
      },
    });
    if (r.url) {
      onGo(r.url);
      return;
    }
    showToast(r.ok ? 'Focus session queued in Timer' : `Could not start: ${r.error || 'unavailable'}`);
  };

  const planRegister = async () => {
    const src = nextCommit;
    const r = await sendTo({
      to: 'rhythm',
      action: 'routine.plan',
      payload: {
        name: src?.title || `${display} study`,
        courseId,
        course: display,
        dueAt: src?.data?.dueAt,
        minutes: src?.data?.estimatedMinutes,
      },
    });
    if (r.url) {
      onGo(r.url);
      return;
    }
    showToast(
      r.ok ? 'Routine scheduled in Attendance' : `Could not schedule: ${r.error || 'unavailable'}`,
      r.ok ? '/apps/rhythm/' : undefined,
    );
  };

  const planWeek = async () => {
    const r = await sendTo({
      to: 'rhythm',
      action: 'routine.plan',
      payload: {
        name: `${display} — weekly commitments`,
        perWeek: Math.max(1, pendingCommits.length),
        unit: 'commitments',
        courseId,
        course: display,
      },
    });
    if (r.url) {
      onGo(r.url);
      return;
    }
    showToast(
      r.ok ? 'Weekly routine scheduled in Attendance' : `Could not schedule: ${r.error || 'unavailable'}`,
      r.ok ? '/apps/rhythm/' : undefined,
    );
  };

  const createCourseNote = async (target: 'ink' | 'margin') => {
    const r = await sendTo({
      to: target,
      action: 'note.create',
      payload: {
        title: `${display} — Notes`,
        text: `# ${display}${courseTitle ? `: ${courseTitle}` : ''}\n\n`,
        course: unfiled ? undefined : display,
        courseId,
      },
    });
    if (r.url) {
      onGo(r.url);
      return;
    }
    showToast(
      r.ok ? `Created note in ${PLACE_MAP[target]?.label || target}` : 'Could not create note',
      `/apps/${target}/`,
    );
  };

  const createCourseProblem = async () => {
    const r = await sendTo({
      to: 'proof',
      action: 'problem.create',
      payload: {
        prompt: nextCommit?.title || `${display} — Practice Problem`,
        topic: display,
        courseId,
        course: unfiled ? undefined : display,
        source: 'course-workspace',
      },
    });
    if (r.url) {
      onGo(r.url);
      return;
    }
    showToast(
      r.ok ? 'Created problem in Calculations' : 'Could not create problem',
      '/apps/proof/',
    );
  };

  const createCourseBlock = async () => {
    const r = await sendTo({
      to: 'syllabus',
      action: 'block.plan',
      payload: {
        title: `${display} study block`,
        course: unfiled ? undefined : display,
        courseId,
        minutes: 25,
      },
    });
    if (r.url) {
      onGo(r.url);
      return;
    }
    showToast(
      r.ok ? 'Planned study block in Planning' : 'Open Planning to add a course block',
      '/apps/syllabus/',
    );
  };

  const renderObjectWithRelationships = (item: WorkspaceObject, primaryActionLabel?: string, onPrimaryAction?: (w: WorkspaceObject) => void) => {
    const rels = relationshipsByKey.get(item.key) || [];
    return (
      <div key={item.key} className="border-b border-[var(--color-line)] last:border-b-0">
        <ObjectRow
          item={item}
          selected={selectedObject?.key === item.key}
          onOpen={onGo}
          onSelectContext={onSelectObject}
          onNotify={showToast}
          primaryActionLabel={primaryActionLabel}
          onPrimaryAction={onPrimaryAction}
          contextCourse={course}
        />
        {rels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 bg-[var(--color-paper)]/45 px-3.5 py-1.5 pl-12 border-t border-dashed border-[var(--color-line)]">
            {rels.slice(0, 4).map((r, idx) => (
              <RelationshipChip
                key={`${r.url}:${idx}`}
                kind={r.kind}
                targetTitle={r.title}
                targetModule={r.app}
                onClick={() => onGo(r.url)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="terrain-map min-h-full">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Top Breadcrumb & Course Header */}
        <div className="rounded-[6px] border border-[var(--color-line-2)] bg-[var(--color-sheet)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--color-mute)]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onHome}
                className="inline-flex items-center gap-1 hover:text-[var(--color-accent)] cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Today
              </button>
              <span className="text-[var(--color-line-2)]">/</span>
              <button
                type="button"
                onClick={() => onGo('#/courses')}
                className="hover:text-[var(--color-accent)] cursor-pointer"
              >
                Courses
              </button>
              <span className="text-[var(--color-line-2)]">/</span>
              <span className="font-mono font-semibold uppercase text-[var(--color-accent)]">
                {unfiled ? 'Getting Started' : display}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  togglePin({
                    app: 'terrain',
                    title: `${display} workspace`,
                    url: courseRouteUrl,
                  })
                }
                aria-label={pinnedUrls.has(courseRouteUrl) ? 'Unpin course workspace' : 'Pin course workspace'}
                className={`rounded-[4px] border px-2 py-0.5 text-[11.5px] font-medium cursor-pointer ${
                  pinnedUrls.has(courseRouteUrl)
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'border-[var(--color-line)] text-[var(--color-mute)] hover:border-[var(--color-line-2)]'
                }`}
              >
                {pinnedUrls.has(courseRouteUrl) ? '◈ Pinned on Shelf' : '◇ Pin Course'}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-2.5">
                <h1 className="font-place text-[26px] font-semibold tracking-tight text-[var(--color-ink)]">
                  {unfiled ? 'Getting Started' : display}
                </h1>
                {courseTitle && (
                  <span className="text-[16px] text-[var(--color-mute)] font-medium">
                    {courseTitle}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[12.5px] text-[var(--color-mute)]">
                {courseObjects.length === 0
                  ? unfiled
                    ? 'Guides for every tool live here — items without a course land here too.'
                    : 'No objects filed under this course yet. Start a focus session, note, deck, or study block below.'
                  : [
                      `${courseObjects.length} item${courseObjects.length === 1 ? '' : 's'}`,
                      materials.length ? `${materials.length} material${materials.length === 1 ? '' : 's'}` : null,
                      practiceItems.length || dueCards.length
                        ? `${practiceItems.length} practice set${practiceItems.length === 1 ? '' : 's'}${
                            dueCards.length ? ` (${dueCards.length} cards due)` : ''
                          }`
                        : null,
                      scheduleItems.length ? `${scheduleItems.length} scheduled` : null,
                      sessionMins > 0 ? `${sessionMins}m logged` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </p>
            </div>

            {/* Latest Grade Pill when present */}
            {latestGrade && (
              <button
                type="button"
                onClick={() => latestGrade.url && onGo(latestGrade.url)}
                className="flex items-center gap-2 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-left text-[12px] hover:border-[var(--color-accent)] cursor-pointer"
                title="Open latest assessment result"
              >
                <Award className="h-4 w-4 text-[var(--color-accent)]" />
                <div>
                  <div className="font-mono text-[10px] uppercase text-[var(--color-faint)]">Latest Result</div>
                  <div className="font-medium text-[var(--color-ink)]">
                    {latestGrade.title}
                    {typeof latestGrade.data?.pct === 'number' && ` · ${Math.round(latestGrade.data.pct)}%`}
                    {gradeDelta !== null && (
                      <span
                        className={`ml-1.5 font-mono text-[11px] ${
                          gradeDelta >= 0 ? 'text-[var(--color-accent)]' : 'text-[var(--color-warn)]'
                        }`}
                      >
                        ({gradeDelta >= 0 ? `+${gradeDelta}%` : `${gradeDelta}%`})
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* Primary Course Actions Bar — the session/review/next-step CTAs
              stay inline; create-in-other-tool actions fold into one menu so
              the bar doesn't compete with the content for attention */}
          {!unfiled && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-3.5">
              <Button
                variant="primary"
                size="sm"
                icon={<Play className="h-3.5 w-3.5" />}
                onClick={() => void startSession()}
              >
                Start Focus Session
              </Button>
              {dueCards.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Layers className="h-3.5 w-3.5" />}
                  onClick={() => onGo('/apps/flashcards/')}
                >
                  Review {dueCards.length} Due Card{dueCards.length === 1 ? '' : 's'}
                </Button>
              )}
              {nextCommit && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  onClick={() => onGo(nextCommit.url || '/apps/syllabus/')}
                >
                  Next: {nextCommit.title}
                </Button>
              )}
              <DropdownMenu
                align="left"
                trigger={(open, toggle) => (
                  <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={open}
                    className="inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--color-ink)] hover:border-[var(--color-line-2)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                    <span>New / schedule</span>
                    <ChevronDown className="h-3 w-3 text-[var(--color-faint)]" />
                  </button>
                )}
              >
                {(close) => (
                  <div className="w-60 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        void createCourseNote('ink');
                      }}
                      className="flex w-full items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-ink)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                      <span className="flex-1">New note</span>
                      <span className="font-mono text-[10px] text-[var(--color-faint)]">Notes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        void createCourseNote('margin');
                      }}
                      className="flex w-full items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-ink)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                      <span className="flex-1">New study sheet</span>
                      <span className="font-mono text-[10px] text-[var(--color-faint)]">Study Materials</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        void createCourseProblem();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-ink)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                    >
                      <Sigma className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                      <span className="flex-1">Add problem</span>
                      <span className="font-mono text-[10px] text-[var(--color-faint)]">Calculations</span>
                    </button>
                    <div className="my-1 border-t border-[var(--color-line)]" />
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        void planRegister();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-ink)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                    >
                      <CheckSquare className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                      <span className="flex-1">Add to attendance</span>
                      <span className="font-mono text-[10px] text-[var(--color-faint)]">Attendance</span>
                    </button>
                    {pendingCommits.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          close();
                          void planWeek();
                        }}
                        title={`Track ${pendingCommits.length} open commitments on the weekly register`}
                        className="flex w-full items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-ink)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                      >
                        <Calendar className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                        <span className="flex-1">Plan week ({pendingCommits.length})</span>
                        <span className="font-mono text-[10px] text-[var(--color-faint)]">Attendance</span>
                      </button>
                    )}
                  </div>
                )}
              </DropdownMenu>
            </div>
          )}

          {/* Guides — the unfiled workspace is the Getting Started folder:
              one card per place with the first three moves, then any
              not-yet-filed items below. */}
          {unfiled && (
            <div className="mt-4 border-t border-[var(--color-line)] pt-3.5">
              <SectionHeader title="Guides for every tool" />
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {GETTING_STARTED.map((g) => {
                  const p = PLACE_MAP[g.place];
                  if (!p) return null;
                  return (
                    <button
                      key={g.place}
                      type="button"
                      onClick={() => onEnter(g.place)}
                      className="group rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] p-3 text-left hover:border-[var(--color-accent)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-4 w-4 shrink-0 text-[var(--color-accent)] [&>svg]:h-full [&>svg]:w-full">
                          {p.glyph}
                        </span>
                        <span className="text-[13px] font-semibold text-[var(--color-ink)]">
                          {p.label}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--color-faint)]">
                          {p.place}
                        </span>
                        <span className="ml-auto text-[11px] font-medium text-[var(--color-accent)] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                          Open →
                        </span>
                      </div>
                      <ol className="mt-2 space-y-1 text-[12px] leading-snug text-[var(--color-mute)] list-none">
                        {g.steps.map((s, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="font-mono text-[10px] text-[var(--color-faint)] mt-px shrink-0">
                              {i + 1}.
                            </span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ol>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {sent && (
            <div className="anim-fade mt-3 flex items-center justify-between gap-2 rounded-[5px] border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-3 py-1.5 text-[12px] text-[var(--color-accent)]">
              <span>{sent.t}</span>
              {sent.url && (
                <button
                  type="button"
                  onClick={() => onGo(sent.url!)}
                  className="font-semibold underline cursor-pointer"
                >
                  Open →
                </button>
              )}
            </div>
          )}

          {/* Live focus banner for this course */}
          {focusMatchesCourse && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-[5px] border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-2 text-[12.5px]">
              <div className="flex items-center gap-2">
                <span className="live-dot h-2 w-2 rounded-full bg-[var(--color-accent)]" />
                <span className="font-semibold text-[var(--color-ink)]">
                  Active Focus: {fv.label || 'Focus Session'}
                </span>
                <span className="font-mono text-[11px] text-[var(--color-accent)]">
                  {fv.endsAt
                    ? `${Math.max(0, Math.ceil((fv.endsAt - Date.now()) / 60000))}m left`
                    : fv.paused
                      ? `Paused (${Math.round((fv.remainingSec || 0) / 60)}m)`
                      : 'Running'}
                </span>
              </div>
              <Button variant="primary" size="xs" onClick={() => onGo('/apps/timer/')}>
                Open Timer →
              </Button>
            </div>
          )}

          {/* Course Workspace Section Tabs */}
          <div className="mt-4 -mb-5">
            <Tabs<CourseTab>
              ariaLabel="Course workspace sections"
              active={activeTab}
              onChange={setActiveTab}
              items={[
                { key: 'overview', label: 'Overview', count: courseObjects.length },
                { key: 'materials', label: 'Materials', count: materials.length },
                {
                  key: 'practice',
                  label: 'Practice',
                  count: practiceItems.length + (dueCards.length > 0 && practiceItems.length === 0 ? dueCards.length : 0),
                },
                { key: 'schedule', label: 'Schedule', count: scheduleItems.length },
                { key: 'results', label: 'Results', count: resultItems.length },
              ]}
            />
          </div>
        </div>

        {/* ── TAB 1: OVERVIEW ── */}
        {activeTab === 'overview' && (
          <>
            <WorkspaceChainView courseKey={course} onGo={onGo} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              {/* Schedule & Next Work */}
              <section>
                <SectionHeader
                  title="Planned Blocks & Commitments"
                  count={scheduleItems.length}
                  action={
                    <button
                      type="button"
                      onClick={() => setActiveTab('schedule')}
                      className="-mx-1 -my-1.5 inline-flex min-h-[28px] items-center px-1 py-1.5 text-[12px] font-medium text-[var(--color-accent)] hover:underline cursor-pointer"
                    >
                      View all →
                    </button>
                  }
                />
                {scheduleItems.length > 0 ? (
                  <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
                    {scheduleItems.slice(0, 5).map((item) =>
                      renderObjectWithRelationships(item, 'Focus', () => {
                        void sendTo({
                          to: 'timer',
                          action: 'timer.start',
                          payload: {
                            label: item.title,
                            minutes: (item.data?.minutes as number) || 25,
                            course: display,
                            courseId,
                            commitmentId: item.type === 'commitment' ? item.id : undefined,
                          },
                        }).then((r) => {
                          if (r.url) onGo(r.url);
                        });
                      }),
                    )}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={<Calendar className="h-4 w-4" />}
                    title="No scheduled blocks or commitments"
                    description="Add assignments, exams, or weekly routines for this course."
                    actions={
                      <>
                        <Button variant="secondary" size="xs" onClick={() => void createCourseBlock()}>
                          Plan Study Block
                        </Button>
                        <Button variant="secondary" size="xs" onClick={() => void planRegister()}>
                          Add Weekly Routine
                        </Button>
                      </>
                    }
                  />
                )}
              </section>

              {/* Materials & Notes */}
              <section>
                <SectionHeader
                  title="Notes, Recordings & Study Sheets"
                  count={materials.length}
                  action={
                    <button
                      type="button"
                      onClick={() => setActiveTab('materials')}
                      className="-mx-1 -my-1.5 inline-flex min-h-[28px] items-center px-1 py-1.5 text-[12px] font-medium text-[var(--color-accent)] hover:underline cursor-pointer"
                    >
                      View all →
                    </button>
                  }
                />
                {materials.length > 0 ? (
                  <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
                    {materials.slice(0, 5).map((item) => renderObjectWithRelationships(item))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={<FileText className="h-4 w-4" />}
                    title="No study materials or notes linked yet"
                    description="Start a course page in Notes (Ink) or import a document/recording in Study Materials (Margin)."
                    actions={
                      <>
                        <Button variant="secondary" size="xs" onClick={() => void createCourseNote('ink')}>
                          New Note in Ink
                        </Button>
                        <Button variant="secondary" size="xs" onClick={() => void createCourseNote('margin')}>
                          New Study Sheet in Margin
                        </Button>
                      </>
                    }
                  />
                )}
              </section>
            </div>

            <div className="space-y-6 lg:col-span-5">
              {/* Practice: Decks, Quizzes & Problems */}
              <section>
                <SectionHeader
                  title="Decks, Quizzes & Calculations"
                  count={practiceItems.length}
                  action={
                    <button
                      type="button"
                      onClick={() => setActiveTab('practice')}
                      className="-mx-1 -my-1.5 inline-flex min-h-[28px] items-center px-1 py-1.5 text-[12px] font-medium text-[var(--color-accent)] hover:underline cursor-pointer"
                    >
                      View all →
                    </button>
                  }
                />
                {practiceItems.length > 0 ? (
                  <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
                    {practiceItems.slice(0, 5).map((item) =>
                      renderObjectWithRelationships(
                        item,
                        item.type === 'deck' ? 'Study' : item.type === 'problem' ? 'Solve' : undefined,
                        (w) => onGo(w.url),
                      ),
                    )}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={<Layers className="h-4 w-4" />}
                    title="No practice decks or problems yet"
                    description="Create a flashcard deck or calculation problem set for active recall."
                    actions={
                      <>
                        <Button variant="secondary" size="xs" onClick={() => onEnter('flashcards')}>
                          Open Flashcards
                        </Button>
                        <Button variant="secondary" size="xs" onClick={() => void createCourseProblem()}>
                          New Problem in Calculations
                        </Button>
                      </>
                    }
                  />
                )}
              </section>

              {/* Results & Focus Log */}
              <section>
                <SectionHeader
                  title="Assessments & Logged Sessions"
                  count={resultItems.length}
                  action={
                    <button
                      type="button"
                      onClick={() => setActiveTab('results')}
                      className="-mx-1 -my-1.5 inline-flex min-h-[28px] items-center px-1 py-1.5 text-[12px] font-medium text-[var(--color-accent)] hover:underline cursor-pointer"
                    >
                      View all →
                    </button>
                  }
                />
                {resultItems.length > 0 ? (
                  <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
                    {resultItems.slice(0, 5).map((item) => renderObjectWithRelationships(item))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={<Award className="h-4 w-4" />}
                    title="No assessments or focus sessions logged"
                    description="Completed focus timers and graded assessments for this course are recorded here."
                    actions={
                      <>
                        <Button variant="secondary" size="xs" onClick={() => void startSession()}>
                          Start 25m Session
                        </Button>
                        <Button variant="secondary" size="xs" onClick={() => onEnter('gradestack')}>
                          Open Assessments
                        </Button>
                      </>
                    }
                  />
                )}
              </section>

              {/* Connected Graph Links & Related Courses */}
              {(courseBacklinks.length > 0 || relatedCourses.length > 0) && (
                <section className="rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] p-3.5 space-y-3">
                  {courseBacklinks.length > 0 && (
                    <div>
                      <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-faint)] mb-1.5">
                        Connected Across Workspace
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {courseBacklinks.map((b, i) => (
                          <RelationshipChip
                            key={`${b.url}:${i}`}
                            kind={b.kind}
                            targetTitle={b.title}
                            targetModule={b.app}
                            onClick={() => onGo(b.url)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {relatedCourses.length > 0 && (
                    <div>
                      <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-faint)] mb-1.5">
                        Courses Sharing Topics
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {relatedCourses.map((rc) => (
                          <Badge
                            key={rc}
                            tone="accent"
                            onClick={() => onGo(`#/c/${encodeURIComponent(rc)}`)}
                          >
                            {rc} →
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Activity Mentions */}
              {mentions.length > 0 && (
                <section>
                  <SectionHeader title="Recent Course Events" />
                  <div className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
                    {mentions.map((f, i) => (
                      <button
                        key={`${f.at}-${i}`}
                        type="button"
                        onClick={() => (f.url ? onGo(f.url) : onEnter(f.app))}
                        className="flex w-full items-baseline gap-2.5 px-3.5 py-2 text-left text-[12px] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                      >
                        <span className="w-24 shrink-0 font-mono text-[10px] font-semibold uppercase text-[var(--color-accent)] truncate">
                          {PLACE_MAP[f.app]?.label || f.app}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[var(--color-ink)]">{f.text}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
            </div>
          </>
        )}

        {/* ── TAB 2: MATERIALS ── */}
        {activeTab === 'materials' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionHeader
                title={`Notes, Recordings & Study Guides (${materials.length})`}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="xs"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => void createCourseNote('ink')}
                >
                  New Note
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => void createCourseNote('margin')}
                >
                  New Study Sheet
                </Button>
              </div>
            </div>
            {materials.length > 0 ? (
              <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
                {materials.map((item) => renderObjectWithRelationships(item))}
              </div>
            ) : (
              <EmptyState
                icon={<FileText className="h-4 w-4" />}
                title="No notes or study materials for this course"
                description="Write lecture notes in Notes (Ink) or import PDFs, recordings, and study sheets in Study Materials (Margin)."
                actions={
                  <>
                    <Button variant="primary" size="xs" onClick={() => void createCourseNote('ink')}>
                      Create Note in Ink
                    </Button>
                    <Button variant="secondary" size="xs" onClick={() => void createCourseNote('margin')}>
                      Create Study Sheet in Margin
                    </Button>
                  </>
                }
              />
            )}
          </section>
        )}

        {/* ── TAB 3: PRACTICE ── */}
        {activeTab === 'practice' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionHeader
                title={`Flashcard Decks, Quizzes & Calculation Problems (${practiceItems.length})`}
              />
              <div className="flex items-center gap-2">
                {dueCards.length > 0 && (
                  <Button
                    variant="primary"
                    size="xs"
                    onClick={() => onGo('/apps/flashcards/')}
                  >
                    Review {dueCards.length} Due Cards
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="xs"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => onEnter('flashcards')}
                >
                  Open Flashcards
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => void createCourseProblem()}
                >
                  New Problem in Calculations
                </Button>
              </div>
            </div>
            {practiceItems.length > 0 ? (
              <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
                {practiceItems.map((item) =>
                  renderObjectWithRelationships(
                    item,
                    item.type === 'deck' ? 'Study Deck' : item.type === 'problem' ? 'Solve' : undefined,
                    (w) => onGo(w.url),
                  ),
                )}
              </div>
            ) : (
              <EmptyState
                icon={<Layers className="h-4 w-4" />}
                title="No practice decks or calculation problems yet"
                description="Build a flashcard deck or add step-by-step math/proof problems for this course."
                actions={
                  <>
                    <Button variant="primary" size="xs" onClick={() => onEnter('flashcards')}>
                      Create Flashcard Deck
                    </Button>
                    <Button variant="secondary" size="xs" onClick={() => void createCourseProblem()}>
                      Create Calculation Problem
                    </Button>
                  </>
                }
              />
            )}
          </section>
        )}

        {/* ── TAB 4: SCHEDULE ── */}
        {activeTab === 'schedule' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionHeader
                title={`Planned Blocks, Commitments & Attendance Routines (${scheduleItems.length})`}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="xs"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => void createCourseBlock()}
                >
                  Plan Study Block
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => void planRegister()}
                >
                  Schedule in Attendance
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => onEnter('syllabus')}
                >
                  Open Planning
                </Button>
              </div>
            </div>
            {scheduleItems.length > 0 ? (
              <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
                {scheduleItems.map((item) =>
                  renderObjectWithRelationships(item, 'Start Focus', () => {
                    void sendTo({
                      to: 'timer',
                      action: 'timer.start',
                      payload: {
                        label: item.title,
                        minutes: (item.data?.minutes as number) || 25,
                        course: display,
                        courseId,
                        commitmentId: item.type === 'commitment' ? item.id : undefined,
                      },
                    }).then((r) => {
                      if (r.url) onGo(r.url);
                    });
                  }),
                )}
              </div>
            ) : (
              <EmptyState
                icon={<Calendar className="h-4 w-4" />}
                title="No scheduled blocks or routines for this course"
                description="Schedule assignments, exams, and daily study blocks in Planning or weekly habits in Attendance."
                actions={
                  <>
                    <Button variant="primary" size="xs" onClick={() => void createCourseBlock()}>
                      Plan Study Block
                    </Button>
                    <Button variant="secondary" size="xs" onClick={() => void planRegister()}>
                      Schedule Attendance Routine
                    </Button>
                  </>
                }
              />
            )}
          </section>
        )}

        {/* ── TAB 5: RESULTS ── */}
        {activeTab === 'results' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionHeader
                title={`Assessments, Grades & Focus Sessions (${resultItems.length})`}
              />
              <div className="flex items-center gap-2">
                {sessionMins > 0 && (
                  <Badge tone="accent">
                    <Clock className="h-3 w-3 mr-1" />
                    {sessionMins}m total logged
                  </Badge>
                )}
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => onEnter('gradestack')}
                >
                  Open Assessments
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => void startSession()}
                >
                  Start Focus Session
                </Button>
              </div>
            </div>
            {resultItems.length > 0 ? (
              <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
                {resultItems.map((item) =>
                  renderObjectWithRelationships(
                    item,
                    item.type === 'assessment' || item.type === 'grade' ? 'Follow-up Cards' : undefined,
                    item.type === 'assessment' || item.type === 'grade'
                      ? (w) => {
                          void sendTo({
                            to: 'flashcards',
                            action: 'cards.create',
                            entity: w.raw as any,
                            payload: {
                              deckTitle: `${display} — ${w.title} Review`,
                              course: display,
                              courseId,
                              cards: [{ q: `${w.title} — key review question`, a: w.sub || 'Review missed items' }],
                            },
                          }).then((r) => {
                            if (r.url) onGo(r.url);
                            else showToast('Created review deck in Flashcards', '/apps/flashcards/');
                          });
                        }
                      : undefined,
                  ),
                )}
              </div>
            ) : (
              <EmptyState
                icon={<BookOpen className="h-4 w-4" />}
                title="No assessment results or logged sessions yet"
                description="Scan or grade assessments in Assessments (GradeStack) or complete focus sessions in Timer to build your course record."
                actions={
                  <>
                    <Button variant="primary" size="xs" onClick={() => onEnter('gradestack')}>
                      Open Assessments
                    </Button>
                    <Button variant="secondary" size="xs" onClick={() => void startSession()}>
                      Start 25m Focus Session
                    </Button>
                  </>
                }
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
