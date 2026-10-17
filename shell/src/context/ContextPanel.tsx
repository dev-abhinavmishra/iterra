import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Play,
  Layers,
  FileText,
  Calendar,
  CheckSquare,
  Sigma,
  ArrowUpRight,
  Link2,
  BookOpen,
  Clock,
  Sparkles,
} from 'lucide-react';
import { PLACES, PLACE_MAP, formatEntityType } from '../places';
import type { Entity, SharedField, StoreEntity } from '../hub';
import { sendTo } from '../hub';
import { execCommand } from '../integration/commands';
import { isPinned, subscribeShelf, togglePin, type ShelfPin } from '../shelf';
import { Badge, Button, Disclosure, IconButton } from '../ui/primitives';
import {
  type WorkspaceObject,
  toWorkspaceObject,
  iconForObjectType,
  formatRelativeTime,
} from '../ui/ObjectRow';

export interface LinkedEdge {
  key: string;
  direction: 'source' | 'connected';
  kind: string;
  title: string;
  app: string;
  type: string;
  url: string;
}

const REL_KIND_LABELS: Record<string, string> = {
  derivedFrom: 'derived from',
  scheduledFor: 'scheduled',
  practicedIn: 'practiced',
  assessedBy: 'assessed by',
  followUpFor: 'follow-up',
};

function formatRelKind(kind: string): string {
  return REL_KIND_LABELS[kind] || kind;
}

/**
 * Resolves the currently active object across the workspace:
 * 1. Explicit user selection (`manualObject`) if still valid.
 * 2. When inside an embedded module (`activePlace`), the active object reported
 *    by `shared` commons or the canonical store for that module.
 * 3. When on a Course Workspace (`activeCourse`), the course entity or its top item.
 * 4. Otherwise, the most recently active object across `shared` / `entities`.
 */
export function resolveActiveWorkspaceObject({
  manual,
  activePlace,
  activeCourse,
  shared,
  entities,
  indexes,
}: {
  manual: WorkspaceObject | null;
  activePlace: string;
  activeCourse: string;
  shared: Record<string, SharedField>;
  entities: StoreEntity[];
  indexes: Record<string, Entity[]>;
}): WorkspaceObject | null {
  // If user explicitly inspected an object and we haven't switched to a different module that owns its own active item
  if (manual && (!activePlace || manual.app === activePlace)) {
    const fresh = entities.find((e) => e.key === manual.key);
    return fresh ? toWorkspaceObject(fresh) : manual;
  }

  // Module-specific active object resolution
  if (activePlace) {
    if (activePlace === 'ink' || activePlace === 'margin') {
      const na = shared.noteActive?.v as { app?: string; id?: string; title?: string; at?: number } | undefined;
      if (na && na.app === activePlace && na.id) {
        const hit = entities.find((e) => e.app === activePlace && e.id === na.id);
        if (hit) return toWorkspaceObject(hit);
        return {
          key: `${activePlace}:note:${na.id}`,
          app: activePlace,
          type: 'note',
          id: na.id,
          title: na.title || 'Active note',
          url: `/apps/${activePlace}/?note=${encodeURIComponent(na.id)}`,
          updatedAt: na.at || shared.noteActive?.at,
        };
      }
    }

    if (activePlace === 'flashcards') {
      const fcState = (window as any).__fcApp?.state;
      const curId = fcState?.currentId;
      if (curId && fcState?.decks?.[curId]) {
        const d = fcState.decks[curId];
        const hit = entities.find((e) => e.app === 'flashcards' && e.type === 'deck' && e.id === curId);
        if (hit) return toWorkspaceObject(hit);
        const dueCount = Array.isArray(d.cards) ? d.cards.filter((c: any) => c.status !== 'mastered').length : 0;
        return {
          key: `flashcards:deck:${d.id}`,
          app: 'flashcards',
          type: 'deck',
          id: d.id,
          title: d.title || 'Untitled deck',
          sub: `${d.cards?.length || 0} cards · ${dueCount} due`,
          course: d.course,
          courseId: d.courseId,
          url: `/apps/flashcards/?deck=${encodeURIComponent(d.id)}`,
          updatedAt: d.lastStudiedAt || d.createdAt,
          data: { count: d.cards?.length || 0, due: dueCount },
        };
      }
      const sd = shared.deck?.v as { deck?: string; due?: number } | undefined;
      if (sd?.deck) {
        const hit = entities.find((e) => e.app === 'flashcards' && e.type === 'deck' && e.title === sd.deck);
        if (hit) return toWorkspaceObject(hit);
      }
    }

    if (activePlace === 'syllabus') {
      const nb = (shared.today?.v as any)?.nextBlock;
      if (nb?.id) {
        const hit = entities.find((e) => e.app === 'syllabus' && e.id === nb.id);
        if (hit) return toWorkspaceObject(hit);
        return {
          key: `syllabus:block:${nb.id}`,
          app: 'syllabus',
          type: 'block',
          id: nb.id,
          title: nb.title || 'Scheduled block',
          course: nb.course,
          url: `/apps/syllabus/?block=${encodeURIComponent(nb.id)}`,
          data: { minutes: nb.minutes },
        };
      }
    }

    if (activePlace === 'timer') {
      const fv = shared.focus?.v as any;
      if (fv && (fv.running || fv.paused)) {
        if (fv.blockId) {
          const bound = entities.find((e) => e.id === fv.blockId);
          if (bound) return toWorkspaceObject(bound);
        }
        return {
          key: `timer:session:live`,
          app: 'timer',
          type: 'session',
          id: 'live',
          title: fv.label || 'Focus Session',
          course: fv.course,
          url: '/apps/timer/',
          updatedAt: shared.focus?.at,
          data: { minutes: fv.totalMin || 25 },
        };
      }
    }

    if (activePlace === 'gradestack') {
      const mb = shared.markbook?.v as { assessment?: string; scored?: number; total?: number } | undefined;
      if (mb?.assessment) {
        const hit = entities.find((e) => e.app === 'gradestack' && e.title === mb.assessment);
        if (hit) return toWorkspaceObject(hit);
      }
    }

    // Fallback to newest store entity or index row for the active place
    const placeEnt = entities
      .filter((e) => e.app === activePlace && e.title)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    if (placeEnt) return toWorkspaceObject(placeEnt);

    const idxEnt = (indexes[activePlace] || [])[0];
    if (idxEnt && idxEnt.title) {
      return {
        key: `${activePlace}:${idxEnt.t || 'item'}:${idxEnt.id || idxEnt.title}`,
        app: activePlace,
        type: idxEnt.t || 'item',
        id: idxEnt.id || idxEnt.title,
        title: idxEnt.title,
        sub: idxEnt.sub,
        course: idxEnt.course,
        topic: idxEnt.topic,
        url: idxEnt.url || `/apps/${activePlace}/`,
        updatedAt: idxEnt.at,
      };
    }
  }

  // Course workspace fallback
  if (activeCourse && activeCourse !== 'unfiled') {
    const key = activeCourse.toLowerCase();
    const courseEnt = entities.find(
      (e) =>
        e.type === 'course' &&
        (((e.data?.code as string) || e.course || e.title || '').toLowerCase() === key ||
          (e.key || '').toLowerCase() === key),
    );
    if (courseEnt) return toWorkspaceObject(courseEnt);
  }

  if (manual) return manual;

  // Global most recent active object
  const na = shared.noteActive;
  if (na?.v?.title && na.at && Date.now() - na.at < 15 * 60_000) {
    const hit = entities.find((e) => e.app === na.v.app && e.id === na.v.id);
    if (hit) return toWorkspaceObject(hit);
  }
  const newest = entities
    .filter((e) => e.title && e.type !== 'course' && e.type !== 'term')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  return newest ? toWorkspaceObject(newest) : null;
}

export function ContextPanel({
  open,
  onClose,
  object,
  entities,
  indexes,
  activeCourseFilter,
  onGo,
  onSelectObject,
}: {
  open: boolean;
  onClose: () => void;
  object: WorkspaceObject | null;
  entities: StoreEntity[];
  indexes: Record<string, Entity[]>;
  activeCourseFilter?: string;
  onGo: (url: string) => void;
  onSelectObject: (obj: WorkspaceObject) => void;
}) {
  const [edges, setEdges] = useState<LinkedEdge[]>([]);
  const [feedback, setFeedback] = useState<{ text: string; url?: string } | null>(null);
  const [attachCommitmentId, setAttachCommitmentId] = useState<string>('');
  /* the pinned working set crosses every tool — show it beside the object
     so the shelf is never more than one disclosure away */
  const [pins, setPins] = useState<ShelfPin[]>([]);
  useEffect(() => subscribeShelf(setPins), []);

  // Query canonical links (both inbound source & outbound connected work)
  useEffect(() => {
    setFeedback(null);
    const it = window.iterra;
    if (!object?.key || !it?.links?.for) {
      setEdges([]);
      return;
    }
    let alive = true;
    it.links
      .for(object.key)
      .then(async (res: any) => {
        if (!alive) return;
        const inn = Array.isArray(res?.inn) ? res.inn : [];
        const out = Array.isArray(res?.out) ? res.out : [];
        const resolved: LinkedEdge[] = [];
        const seen = new Set<string>();

        const resolveKey = async (targetKey: string, direction: 'source' | 'connected', kind: string) => {
          if (!targetKey || seen.has(`${direction}:${targetKey}`)) return;
          seen.add(`${direction}:${targetKey}`);
          let ent = entities.find((e) => e.key === targetKey) || null;
          if (!ent && it.store?.get) {
            ent = await it.store.get(targetKey).catch(() => null);
          }
          const parts = targetKey.split(':');
          const app = ent?.app || parts[0] || 'unknown';
          const type = ent?.type || parts[1] || 'item';
          const title = ent?.title || parts.slice(2).join(':') || targetKey;
          const url = ent?.url || `/apps/${app}/`;
          resolved.push({ key: targetKey, direction, kind: kind || 'linked', title, app, type, url });
        };

        /* direction is kind-aware: derivedFrom runs created→source, so an
           inbound one names work derived FROM this object (connected) and an
           outbound one names this object's source (from). Other kinds keep
           inn→source / out→connected (attached lands on the object, etc). */
        for (const l of inn.slice(0, 6)) {
          const kind = String(l?.kind || 'linked');
          await resolveKey(String(l?.from || ''), kind === 'derivedFrom' ? 'connected' : 'source', kind);
        }
        for (const l of out.slice(0, 8)) {
          const kind = String(l?.kind || 'linked');
          await resolveKey(String(l?.to || ''), kind === 'derivedFrom' ? 'source' : 'connected', kind);
        }
        if (alive) setEdges(resolved);
      })
      .catch(() => {
        if (alive) setEdges([]);
      });
    return () => {
      alive = false;
    };
  }, [object?.key, entities]);

  // Resolve course details if object belongs to a course
  const resolvedCourse = useMemo(() => {
    const code = object?.course || activeCourseFilter;
    if (!code || code === 'unfiled') return null;
    const low = code.toLowerCase();
    const courseEnt = entities.find(
      (e) =>
        e.type === 'course' &&
        (((e.data?.code as string) || e.course || e.title || '').toLowerCase() === low ||
          (e.key || '').toLowerCase() === low),
    );
    return {
      code: (courseEnt?.data?.code as string) || courseEnt?.course || code,
      name: courseEnt?.title && courseEnt.title !== code ? courseEnt.title : (courseEnt?.data?.name as string) || undefined,
      key: courseEnt?.key,
    };
  }, [object?.course, activeCourseFilter, entities]);

  // Related items sharing the same course or topic (excluding self & already-linked edges)
  const siblingObjects = useMemo(() => {
    if (!object) return [];
    const cKey = (object.course || '').toLowerCase();
    const tKey = (object.topic || '').toLowerCase();
    if (!cKey && !tKey) return [];
    const edgeKeys = new Set(edges.map((e) => e.key));
    const matches: WorkspaceObject[] = [];
    for (const e of entities) {
      if (!e.title || e.key === object.key || edgeKeys.has(e.key) || e.type === 'course') continue;
      const ec = (e.course || '').toLowerCase();
      const et = (e.topic || '').toLowerCase();
      if ((cKey && ec === cKey) || (tKey && (et === tKey || ec === tKey))) {
        matches.push(toWorkspaceObject(e));
      }
      if (matches.length >= 6) break;
    }
    if (matches.length < 6) {
      for (const [app, list] of Object.entries(indexes)) {
        for (const e of list || []) {
          if (!e?.title) continue;
          const k = `${app}:${e.t || 'item'}:${e.id || e.title}`;
          if (k === object.key || edgeKeys.has(k) || matches.some((m) => m.url === e.url && m.title === e.title)) continue;
          const ec = (e.course || '').toLowerCase();
          const et = (e.topic || '').toLowerCase();
          if ((cKey && ec === cKey) || (tKey && (et === tKey || ec === tKey))) {
            matches.push({
              key: k,
              app,
              type: e.t || 'item',
              id: e.id || e.title,
              title: e.title,
              sub: e.sub,
              course: e.course,
              topic: e.topic,
              url: e.url || `/apps/${app}/`,
              updatedAt: e.at,
            });
          }
          if (matches.length >= 6) break;
        }
      }
    }
    return matches;
  }, [object, entities, indexes, edges]);

  // Open commitments/blocks we can attach this object to via iterra.links.add
  const openCommitments = useMemo(() => {
    return entities
      .filter(
        (e) =>
          (e.type === 'commitment' || e.type === 'block') &&
          e.title &&
          e.data?.status !== 'done' &&
          e.data?.status !== 'completed',
      )
      .slice(0, 12);
  }, [entities]);

  if (!open) return null;

  const sourceEdges = edges.filter((e) => e.direction === 'source');
  const connectedEdges = edges.filter((e) => e.direction === 'connected');
  const place = object ? PLACE_MAP[object.app] : null;
  const pinned = object ? isPinned(object.url) : false;

  const showMsg = (text: string, url?: string) => {
    setFeedback({ text, url });
    window.setTimeout(() => setFeedback((cur) => (cur?.text === text ? null : cur)), 4500);
  };

  const triggerAction = async (opts: {
    to: string;
    action: string;
    payload: Record<string, unknown>;
    successLabel: string;
    autoNavigate?: boolean;
  }) => {
    if (!object) return;
    const entityPayload = object.raw || {
      app: object.app,
      type: object.type,
      id: object.id,
      title: object.title,
      sub: object.sub,
      course: object.course,
      courseId: object.courseId,
      topic: object.topic,
      url: object.url,
    };
    const r = await sendTo({
      to: opts.to,
      action: opts.action,
      entity: entityPayload as any,
      payload: opts.payload,
    });
    if (!r.ok) {
      showMsg(`Action failed: ${r.error || 'unavailable'}`);
      return;
    }
    if (opts.autoNavigate && r.url) {
      onGo(r.url);
      return;
    }
    showMsg(opts.successLabel, r.url || `/apps/${opts.to}/`);
  };

  const handleAttachToBlock = async () => {
    if (!object || !attachCommitmentId) return;
    const it = window.iterra;
    if (!it?.links?.add) return;
    const targetEnt = openCommitments.find((c) => c.key === attachCommitmentId);
    if (!targetEnt) return;
    // Ensure current object is in canonical store before linking
    if (!object.raw && it.store?.put) {
      await it.store.put({
        app: object.app,
        type: object.type,
        id: object.id,
        title: object.title,
        sub: object.sub,
        course: object.course,
        topic: object.topic,
        url: object.url,
      });
    }
    await (it.links.add as any)(targetEnt.key, object.key, 'attached');
    setAttachCommitmentId('');
    showMsg(`Attached to "${targetEnt.title}"`, targetEnt.url || '/apps/syllabus/');
    // Refresh edges
    const res: any = await it.links.for(object.key).catch(() => null);
    if (res) {
      setEdges((prev) => [
        ...prev.filter((x) => x.key !== targetEnt.key),
        {
          key: targetEnt.key,
          direction: 'source',
          kind: 'attached',
          title: targetEnt.title || 'Work block',
          app: targetEnt.app,
          type: targetEnt.type,
          url: targetEnt.url || '/apps/syllabus/',
        },
      ]);
    }
  };

  const panelBody = (
    <div className="flex h-full flex-col bg-[var(--color-sheet)] text-[var(--color-ink)]">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--color-line)] px-3.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-mute)]">
            Details
          </span>
        </div>
        <IconButton label="Close details panel" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      {!object ? (
        <ContextHome entities={entities} onGo={onGo} onSelectObject={onSelectObject} />
      ) : (
        <div className="today-rail flex-1 overflow-y-auto divide-y divide-[var(--color-line)]">
          {/* Selected Object Summary */}
          <section className="p-3.5">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-[var(--color-line)] bg-[var(--color-sheet-2)] text-[var(--color-accent)]">
                {iconForObjectType(object.type, object.app)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                    {formatEntityType(object.type)}
                  </span>
                  <span className="text-[11px] text-[var(--color-faint)]">·</span>
                  <span className="text-[11px] text-[var(--color-mute)]">
                    {place ? `${place.label} (${place.place})` : object.app}
                  </span>
                </div>
                <h3 className="mt-0.5 text-[14.5px] font-semibold leading-snug text-[var(--color-ink)] break-words">
                  {object.title}
                </h3>
                {object.sub && (
                  <p className="mt-0.5 text-[12px] text-[var(--color-mute)] break-words">{object.sub}</p>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button
                variant="primary"
                size="xs"
                icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                onClick={() => onGo(object.url)}
              >
                Open in {place?.label || object.app}
              </Button>
              <Button
                variant="secondary"
                size="xs"
                onClick={() =>
                  togglePin({
                    app: object.app,
                    t: object.type,
                    id: object.id,
                    title: object.title,
                    url: object.url,
                  })
                }
              >
                {pinned ? '◈ Pinned' : '◇ Pin to Shelf'}
              </Button>
            </div>
          </section>

          {/* Pinned working set — the shelf crosses every tool */}
          {pins.length > 0 && (
            <section className="px-3.5 py-2.5">
              <Disclosure label={`Pinned — ${pins.length} across the terrain`}>
                <div className="mt-1.5 space-y-0.5">
                  {pins.slice(0, 6).map((pin) => (
                    <button
                      key={pin.url}
                      type="button"
                      onClick={() => onGo(pin.url)}
                      className="flex w-full items-center gap-2 rounded-[5px] px-1.5 py-1.5 text-left hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                      title={pin.title}
                    >
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-faint)] w-16 shrink-0 truncate">
                        {PLACE_MAP[pin.app]?.label || pin.app}
                      </span>
                      <span className="truncate text-[12px] text-[var(--color-ink)]">
                        {pin.title}
                      </span>
                    </button>
                  ))}
                </div>
              </Disclosure>
            </section>
          )}

          {/* 1. Course & Topic — one quiet line, not two boxed cells */}
          <section className="px-3.5 py-2.5">
            <div className="flex items-center gap-1.5 text-[12.5px] min-w-0">
              <BookOpen className="h-3.5 w-3.5 shrink-0 text-[var(--color-faint)]" />
              {resolvedCourse ? (
                <button
                  type="button"
                  onClick={() => onGo(`#/c/${encodeURIComponent(resolvedCourse.code)}`)}
                  className="font-semibold text-[var(--color-accent)] hover:underline cursor-pointer truncate"
                  title={resolvedCourse.name}
                >
                  {resolvedCourse.code}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onGo('#/c/unfiled')}
                  className="text-[var(--color-mute)] hover:text-[var(--color-accent)] cursor-pointer"
                >
                  Getting Started
                </button>
              )}
              {object.topic && (
                <>
                  <span className="text-[var(--color-faint)]">·</span>
                  <button
                    type="button"
                    onClick={() => onGo(`#/c/${encodeURIComponent(object.topic!)}`)}
                    className="truncate text-[var(--color-ink)] hover:text-[var(--color-accent)] cursor-pointer"
                  >
                    {object.topic}
                  </button>
                </>
              )}
              {resolvedCourse?.name && (
                <span className="truncate text-[11px] text-[var(--color-faint)]">
                  {resolvedCourse.name}
                </span>
              )}
            </div>
          </section>

          {/* 2. Where it came from — only when a real source exists */}
          {sourceEdges.length > 0 && (
            <section className="p-3.5 space-y-1.5">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
                From
              </div>
              {sourceEdges.map((src) => (
                <button
                  key={src.key}
                  type="button"
                  onClick={() => onGo(src.url)}
                  className="flex w-full items-center gap-2 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-paper)]/70 px-2.5 py-1.5 text-left text-[12px] hover:border-[var(--color-accent)] cursor-pointer"
                >
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-[var(--color-ink)]">{src.title}</div>
                    <div className="text-[10.5px] text-[var(--color-faint)]">
                      {formatRelKind(src.kind)} · {PLACE_MAP[src.app]?.label || src.app}
                    </div>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-faint)]" />
                </button>
              ))}
            </section>
          )}

          {/* 3. Connected Work */}
          <section className="p-3.5 space-y-2.5">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
              Connected Work
            </div>

            {connectedEdges.length > 0 ? (
              <div className="space-y-1.5">
                {connectedEdges.map((edge) => (
                  <button
                    key={edge.key}
                    type="button"
                    onClick={() => onGo(edge.url)}
                    className="flex w-full items-center gap-2 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-paper)]/70 px-2.5 py-1.5 text-left text-[12px] hover:border-[var(--color-accent)] cursor-pointer"
                  >
                    {iconForObjectType(edge.type, edge.app)}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-[var(--color-ink)]">{edge.title}</div>
                      <div className="text-[10.5px] text-[var(--color-faint)]">
                        {formatEntityType(edge.type)} in {PLACE_MAP[edge.app]?.label || edge.app} · {formatRelKind(edge.kind)}
                      </div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-faint)]" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[var(--color-faint)]">
                No direct links yet. Attach this item to a study block or generate connected work below.
              </p>
            )}

            {/* Attach to an existing block — behind a disclosure so the
                panel doesn't lead with plumbing */}
            {openCommitments.length > 0 && object.type !== 'commitment' && object.type !== 'block' && (
              <Disclosure label="Attach to a planned block…" className="pt-0.5">
                <div className="flex items-center gap-1.5">
                  <select
                    value={attachCommitmentId}
                    onChange={(e) => setAttachCommitmentId(e.target.value)}
                    aria-label="Select a planned block or commitment"
                    className="min-w-0 flex-1 rounded-[4px] border border-[var(--color-line)] bg-[var(--color-paper)] px-2 py-1 text-[11.5px] text-[var(--color-ink)]"
                  >
                    <option value="">Choose block…</option>
                    {openCommitments.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.course ? `[${c.course}] ` : ''}{c.title}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    size="xs"
                    disabled={!attachCommitmentId}
                    onClick={() => void handleAttachToBlock()}
                  >
                    Attach
                  </Button>
                </div>
              </Disclosure>
            )}

            {/* Related in same course/topic */}
            {siblingObjects.length > 0 && (
              <div className="pt-2 border-t border-[var(--color-line)]/60">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[var(--color-mute)]">
                    Related in {object.course || object.topic}
                  </span>
                  <Badge tone="neutral">{siblingObjects.length}</Badge>
                </div>
                <div className="space-y-1">
                  {siblingObjects.slice(0, 4).map((sib) => (
                    <div
                      key={sib.key}
                      className="flex items-center gap-1.5 rounded-[4px] px-2 py-1 hover:bg-[var(--color-sheet-hover)]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectObject(sib);
                          onGo(sib.url);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-[12px] cursor-pointer"
                      >
                        <span className="text-[var(--color-accent)] shrink-0">
                          {iconForObjectType(sib.type, sib.app)}
                        </span>
                        <span className="truncate text-[var(--color-ink)] font-medium">{sib.title}</span>
                      </button>
                      <span className="shrink-0 text-[10px] text-[var(--color-faint)]">
                        {PLACE_MAP[sib.app]?.label || sib.app}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 4. Available Actions */}
          <section className="p-3.5 space-y-2">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
              Available Actions
            </div>

            {feedback && (
              <div className="anim-fade flex items-center justify-between gap-2 rounded-[5px] border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-2.5 py-1.5 text-[12px] text-[var(--color-accent)]">
                <span className="truncate font-medium">{feedback.text}</span>
                {feedback.url && (
                  <button
                    type="button"
                    onClick={() => onGo(feedback.url!)}
                    className="shrink-0 font-semibold underline cursor-pointer"
                  >
                    Open →
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-1.5">
              {/* Start Focus Session */}
              <button
                type="button"
                onClick={() =>
                  void triggerAction({
                    to: 'timer',
                    action: 'timer.start',
                    payload: {
                      label: object.title,
                      minutes: (object.data?.minutes as number) || (object.data?.estimatedMinutes as number) || 25,
                      course: object.course,
                      courseId: object.courseId,
                      commitmentId: object.type === 'commitment' ? object.id : undefined,
                    },
                    successLabel: 'Started 25m focus session',
                    autoNavigate: true,
                  })
                }
                className="flex w-full items-center gap-2.5 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-paper)]/60 px-2.5 py-2 text-left text-[12.5px] font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]/50 transition-colors cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 text-[var(--color-accent)] shrink-0" />
                <span className="flex-1">Start 25m focus session</span>
                <Clock className="h-3 w-3 text-[var(--color-faint)]" />
              </button>

              {/* Open Source Material (when inbound link exists) */}
              {sourceEdges[0] && (
                <button
                  type="button"
                  onClick={() => onGo(sourceEdges[0].url)}
                  className="flex w-full items-center gap-2.5 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-paper)]/60 px-2.5 py-2 text-left text-[12.5px] font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]/50 transition-colors cursor-pointer"
                >
                  <ArrowUpRight className="h-3.5 w-3.5 text-[var(--color-accent)] shrink-0" />
                  <span className="flex-1 truncate">Open source: {sourceEdges[0].title}</span>
                </button>
              )}

              {/* Create Flashcards */}
              {object.app !== 'flashcards' && (
                <button
                  type="button"
                  onClick={() =>
                    void triggerAction({
                      to: 'flashcards',
                      action: 'cards.create',
                      payload: {
                        deckTitle: object.course ? `${object.course} — ${object.title}` : object.title,
                        course: object.course,
                        courseId: object.courseId,
                        cards: [{ q: `${object.title} — key concept`, a: object.sub || object.title }],
                      },
                      successLabel: 'Created flashcard in deck',
                    })
                  }
                  className="flex w-full items-center gap-2.5 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-paper)]/60 px-2.5 py-2 text-left text-[12.5px] font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]/50 transition-colors cursor-pointer"
                >
                  <Layers className="h-3.5 w-3.5 text-[var(--color-accent)] shrink-0" />
                  <span className="flex-1">Create flashcards from this</span>
                </button>
              )}

              {/* Less-used handoffs fold away — same actions, less noise */}
              <Disclosure label="More actions" className="pt-0.5">
                <div className="grid grid-cols-1 gap-1.5">
                  {/* Create Follow-up Study Block in Syllabus — attaches this
                      object as the block's material via scheduleReviewBlock,
                      so starting the block opens the real deck/note/problem. */}
                  {object.app !== 'syllabus' && (
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await execCommand('scheduleReviewBlock', {
                          materialRef: object.key,
                          title: `Follow up: ${object.title}`,
                          course: object.course,
                          courseId: object.courseId,
                          topic: object.topic,
                          plannedMinutes: 25,
                        });
                        if (r.ok) {
                          showMsg('Scheduled study block in Planning');
                        } else {
                          showMsg(`Action failed: ${r.error || 'unavailable'}`);
                        }
                      }}
                      className="flex w-full items-center gap-2.5 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-paper)]/60 px-2.5 py-2 text-left text-[12.5px] font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]/50 transition-colors cursor-pointer"
                    >
                      <Calendar className="h-3.5 w-3.5 text-[var(--color-accent)] shrink-0" />
                      <span className="flex-1">Plan a study block</span>
                    </button>
                  )}

                  {/* Schedule Routine in Attendance (Rhythm) */}
                  {object.app !== 'rhythm' && (
                    <button
                      type="button"
                      onClick={() =>
                        void triggerAction({
                          to: 'rhythm',
                          action: 'routine.plan',
                          payload: {
                            name: object.title,
                            course: object.course,
                            courseId: object.courseId,
                            minutes: 25,
                          },
                          successLabel: 'Added routine to Attendance',
                        })
                      }
                      className="flex w-full items-center gap-2.5 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-paper)]/60 px-2.5 py-2 text-left text-[12.5px] font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]/50 transition-colors cursor-pointer"
                    >
                      <CheckSquare className="h-3.5 w-3.5 text-[var(--color-accent)] shrink-0" />
                      <span className="flex-1">Add to weekly Attendance</span>
                    </button>
                  )}

                  {/* Send to Notes (Ink) */}
                  {object.app !== 'ink' && (
                    <button
                      type="button"
                      onClick={() =>
                        void triggerAction({
                          to: 'ink',
                          action: 'note.create',
                          payload: {
                            title: object.title,
                            text: object.sub ? `${object.title}\n\n${object.sub}` : object.title,
                            course: object.course,
                          },
                          successLabel: 'Created note in Notes (Ink)',
                        })
                      }
                      className="flex w-full items-center gap-2.5 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-paper)]/60 px-2.5 py-2 text-left text-[12.5px] font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]/50 transition-colors cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5 text-[var(--color-accent)] shrink-0" />
                      <span className="flex-1">Open as a note</span>
                    </button>
                  )}

                  {/* Send to Study Materials (Margin) */}
                  {object.app !== 'margin' && (
                    <button
                      type="button"
                      onClick={() =>
                        void triggerAction({
                          to: 'margin',
                          action: 'note.create',
                          payload: {
                            title: object.title,
                            text: object.sub || object.title,
                            course: object.course,
                          },
                          successLabel: 'Sent to Study Materials (Margin)',
                        })
                      }
                      className="flex w-full items-center gap-2.5 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-paper)]/60 px-2.5 py-2 text-left text-[12.5px] font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]/50 transition-colors cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)] shrink-0" />
                      <span className="flex-1">Save to study materials</span>
                    </button>
                  )}

                  {/* Send to Calculations (Proof) */}
                  {object.app !== 'proof' && (
                    <button
                      type="button"
                      onClick={() =>
                        void triggerAction({
                          to: 'proof',
                          action: 'problem.create',
                          payload: {
                            prompt: object.title,
                            topic: object.topic || object.course || 'Practice',
                            course: object.course,
                            courseId: object.courseId,
                            source: object.app,
                          },
                          successLabel: 'Added problem to Calculations (Proof)',
                        })
                      }
                      className="flex w-full items-center gap-2.5 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-paper)]/60 px-2.5 py-2 text-left text-[12.5px] font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]/50 transition-colors cursor-pointer"
                    >
                      <Sigma className="h-3.5 w-3.5 text-[var(--color-accent)] shrink-0" />
                      <span className="flex-1">Work it as a problem</span>
                    </button>
                  )}
                </div>
              </Disclosure>
            </div>
          </section>

          {/* 5. Details — provenance meta hidden behind a disclosure */}
          <section className="p-3.5">
            <Disclosure label="Details">
              <div className="space-y-1.5 text-[12px] pt-0.5">
                <div className="flex items-center justify-between text-[var(--color-mute)]">
                  <span>Tool</span>
                  <span className="font-medium text-[var(--color-ink)]">
                    {place ? `${place.label} · ${place.app}` : object.app}
                  </span>
                </div>
                {object.updatedAt ? (
                  <div className="flex items-center justify-between text-[var(--color-mute)]">
                    <span>Last updated</span>
                    <span className="font-mono text-[11.5px] text-[var(--color-ink)]">
                      {formatRelativeTime(object.updatedAt)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between text-[var(--color-mute)]">
                  <span>Persistence</span>
                  <span className="text-[11.5px] text-[var(--color-accent)] font-medium">
                    Saved in workspace
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[var(--color-mute)]">
                  <span>Reference</span>
                  <span className="font-mono text-[10.5px] text-[var(--color-faint)] truncate" title={object.key}>
                    {object.key}
                  </span>
                </div>
              </div>
            </Disclosure>
          </section>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop right-hand docked details panel */}
      <aside
        aria-label="Details panel"
        className="hidden lg:block w-80 shrink-0 border-l border-[var(--color-line)] bg-[var(--color-sheet)] h-full overflow-hidden"
      >
        {panelBody}
      </aside>

      {/* Narrow-screen slide-over drawer/sheet (never squeezes 3 columns together) */}
      <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
        <div
          className="fixed inset-0 bg-black/35 backdrop-blur-[1px]"
          onClick={onClose}
          aria-hidden="true"
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Details panel"
          className="anim-rise relative z-10 h-full w-full sm:w-80 sm:max-w-[88vw] sm:border-l border-[var(--color-line-2)] bg-[var(--color-sheet)] shadow-2xl"
        >
          {panelBody}
        </aside>
      </div>
    </>
  );
}

/* No-selection home — the panel earns its place even before anything is
   selected: every tool one click away, the pinned working set, and what
   moved most recently across the whole terrain. */
function ContextHome({
  entities,
  onGo,
  onSelectObject,
}: {
  entities: StoreEntity[];
  onGo: (url: string) => void;
  onSelectObject: (obj: WorkspaceObject) => void;
}) {
  const [pins, setPins] = useState<ShelfPin[]>([]);
  useEffect(() => subscribeShelf(setPins), []);

  const latest = useMemo(
    () =>
      entities
        .filter((e) => e.type !== 'course' && e.title)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 6),
    [entities],
  );

  return (
    <div className="today-rail flex-1 overflow-y-auto divide-y divide-[var(--color-line)]">
      {/* Every tool, one click away */}
      <section className="p-3.5">
        <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
          Tools
        </div>
        <div className="grid grid-cols-2 gap-1">
          {PLACES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onGo(`#/p/${p.id}`)}
              title={`${p.app} — ${p.tagline}`}
              className="flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[12.5px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
            >
              <span className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)] [&>svg]:h-full [&>svg]:w-full">
                {p.glyph}
              </span>
              <span className="truncate">{p.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Pinned working set — crosses every tool */}
      <section className="p-3.5">
        <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
          Pinned
        </div>
        {pins.length === 0 ? (
          <p className="text-[12px] text-[var(--color-mute)]">
            Pin an item's shelf mark to keep it here across tools.
          </p>
        ) : (
          <div className="space-y-0.5">
            {pins.slice(0, 8).map((pin) => (
              <div
                key={pin.url}
                className="group flex items-center gap-2 rounded-[5px] px-1.5 py-1.5 hover:bg-[var(--color-sheet-hover)]"
              >
                <button
                  type="button"
                  onClick={() => onGo(pin.url)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                  title={pin.title}
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-faint)] w-16 shrink-0 truncate">
                    {PLACE_MAP[pin.app]?.label || pin.app}
                  </span>
                  <span className="truncate text-[12.5px] text-[var(--color-ink)]">
                    {pin.title}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => togglePin(pin)}
                  title="Unpin"
                  className="shrink-0 rounded p-0.5 text-[var(--color-faint)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-[var(--color-ink)] cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Latest across the terrain — select to inspect and act on */}
      <section className="p-3.5">
        <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
          Latest across the terrain
        </div>
        {latest.length === 0 ? (
          <p className="text-[12px] text-[var(--color-mute)]">
            Nothing yet — work in any tool lands here.
          </p>
        ) : (
          <div className="space-y-0.5">
            {latest.map((e) => (
              <button
                key={e.key}
                type="button"
                onClick={() => onSelectObject(toWorkspaceObject(e))}
                className="flex w-full items-center gap-2 rounded-[5px] px-1.5 py-1.5 text-left hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                title={`${formatEntityType(e.type)} — inspect`}
              >
                <span className="h-3.5 w-3.5 shrink-0 text-[var(--color-mute)] [&>svg]:h-full [&>svg]:w-full">
                  {iconForObjectType(e.type, e.app)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--color-ink)]">
                  {e.title}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--color-faint)]">
                  {PLACE_MAP[e.app]?.label || e.app}
                  {e.updatedAt ? ` · ${formatRelativeTime(e.updatedAt)}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="mt-2.5 text-[11px] leading-relaxed text-[var(--color-faint)]">
          Select any item to inspect its course, provenance, connected work, and actions.
        </p>
      </section>
    </div>
  );
}
