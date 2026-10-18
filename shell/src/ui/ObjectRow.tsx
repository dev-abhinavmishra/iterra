import React from 'react';
import {
  FileText,
  Layers,
  CheckSquare,
  Clock,
  Sigma,
  Calendar,
  BookOpen,
  Award,
  Activity,
  PanelRightOpen,
  Share2,
} from 'lucide-react';
import { PLACE_MAP, formatEntityType } from '../places';
import type { StoreEntity } from '../hub';
import { sendTo } from '../hub';
import { isPinned, togglePin } from '../shelf';
import { Badge, DropdownMenu, IconButton } from './primitives';

export interface WorkspaceObject {
  key: string;
  app: string;
  type: string;
  id: string;
  title: string;
  sub?: string;
  courseId?: string;
  course?: string;
  topic?: string;
  url: string;
  updatedAt?: number;
  createdAt?: number;
  dueAt?: number | string | null;
  data?: Record<string, unknown>;
  raw?: StoreEntity;
}

export function toWorkspaceObject(e: StoreEntity): WorkspaceObject {
  const dueRaw = e.data?.dueAt;
  return {
    key: e.key || `${e.app}:${e.type}:${e.id}`,
    app: e.app,
    type: e.type,
    id: e.id,
    title: e.title || 'Untitled',
    sub: e.sub,
    courseId: e.courseId,
    course: e.course || (typeof e.data?.code === 'string' ? e.data.code : undefined),
    topic: e.topic,
    url: e.url || `/apps/${e.app}/`,
    updatedAt: e.updatedAt,
    createdAt: e.createdAt,
    dueAt: typeof dueRaw === 'number' || typeof dueRaw === 'string' ? dueRaw : null,
    data: e.data,
    raw: e,
  };
}

export function iconForObjectType(type: string, app?: string): React.ReactNode {
  const cls = 'h-3.5 w-3.5';
  switch (type) {
    case 'note':
    case 'source':
      return <FileText className={cls} />;
    case 'deck':
    case 'card':
    case 'quiz':
      return <Layers className={cls} />;
    case 'problem':
    case 'attempt':
      return <Sigma className={cls} />;
    case 'block':
    case 'commitment':
    case 'assignment':
      return <Calendar className={cls} />;
    case 'routine':
    case 'experiment':
    case 'entry':
      return <CheckSquare className={cls} />;
    case 'session':
      return <Clock className={cls} />;
    case 'assessment':
    case 'grade':
    case 'scan':
      return <Award className={cls} />;
    case 'course':
      return <BookOpen className={cls} />;
    case 'term':
      return <Calendar className={cls} />;
    case 'goal':
      return <Award className={cls} />;
    default:
      if (app && PLACE_MAP[app]) {
        return <span className="h-3.5 w-3.5 block [&>svg]:h-full [&>svg]:w-full">{PLACE_MAP[app].glyph}</span>;
      }
      return <Activity className={cls} />;
  }
}

export function formatRelativeTime(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const QUICK_SEND_TARGETS = [
  { to: 'timer', action: 'timer.start', label: 'Start 25m focus session' },
  { to: 'flashcards', action: 'cards.create', label: 'Create flashcards' },
  { to: 'margin', action: 'note.create', label: 'Save to Study Materials' },
  { to: 'ink', action: 'note.create', label: 'Create note page' },
  { to: 'proof', action: 'problem.create', label: 'Send to Calculations' },
  { to: 'rhythm', action: 'routine.plan', label: 'Schedule in Attendance' },
  { to: 'syllabus', action: 'block.plan', label: 'Plan a study block' },
] as const;

export function ObjectRow({
  item,
  selected = false,
  onOpen,
  onSelectContext,
  onNavigateCourse,
  onNotify,
  primaryActionLabel,
  onPrimaryAction,
  compact = false,
  contextCourse,
}: {
  item: WorkspaceObject;
  selected?: boolean;
  onOpen: (url: string) => void;
  onSelectContext?: (item: WorkspaceObject) => void;
  onNavigateCourse?: (course: string) => void;
  onNotify?: (msg: string, url?: string) => void;
  primaryActionLabel?: string;
  onPrimaryAction?: (item: WorkspaceObject) => void;
  compact?: boolean;
  /* course code already implied by the surrounding page — suppresses the
     redundant per-row course badge inside its own workspace */
  contextCourse?: string;
}) {
  const place = PLACE_MAP[item.app];
  const moduleLabel = place ? place.label : item.app;
  const typeLabel = formatEntityType(item.type);
  const pinned = isPinned(item.url);

  /* closed work wears its state — dropped/done rows stay listed (history)
     but dim so open work reads first */
  const closedLabel =
    item.data?.status === 'dropped' ? 'dropped'
    : item.data?.status === 'paused' ? 'paused'
    : item.data?.status === 'archived' ? 'archived'
    : item.data?.status === 'done' || item.data?.status === 'completed' ? 'done'
    : item.data?.state === 'done' ? 'stamped'
    : item.data?.state === 'deferred' ? 'deferred'
    : item.data?.state === 'missed' ? 'missed'
    : null;

  const dueInfo = (() => {
    if (closedLabel) return { text: closedLabel, warn: item.data?.state === 'missed' };
    if (item.type === 'deck' && typeof item.data?.due === 'number' && item.data.due > 0) {
      return { text: `${item.data.due} due`, warn: true };
    }
    /* blocks carry plannedDate (YYYY-MM-DD local), not dueAt — a slip that
       stayed planned past its day gets the same warn treatment */
    if (
      item.type === 'block' &&
      item.data?.state === 'planned' &&
      typeof item.data?.plannedDate === 'string'
    ) {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (item.data.plannedDate < today) {
        return {
          text: `slipped · was ${new Date(`${item.data.plannedDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          warn: true,
        };
      }
    }
    if (item.dueAt != null) {
      const ms = typeof item.dueAt === 'number' ? item.dueAt : Date.parse(String(item.dueAt));
      if (!Number.isNaN(ms)) {
        if (ms === 0 || ms <= Date.now()) {
          return { text: item.type === 'card' ? 'Due now' : 'Overdue', warn: true };
        }
        return {
          text: `Due ${new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          warn: false,
        };
      }
    }
    if (typeof item.data?.minutes === 'number' && item.data.minutes > 0) {
      return { text: `${item.data.minutes}m`, warn: false };
    }
    if (typeof item.data?.pct === 'number') {
      return { text: `${Math.round(item.data.pct)}%`, warn: false };
    }
    return null;
  })();

  const handleSend = async (target: (typeof QUICK_SEND_TARGETS)[number]) => {
    const entityPayload = item.raw || {
      app: item.app,
      type: item.type,
      id: item.id,
      title: item.title,
      sub: item.sub,
      course: item.course,
      courseId: item.courseId,
      topic: item.topic,
      url: item.url,
    };
    const r = await sendTo({
      to: target.to,
      action: target.action,
      entity: entityPayload as any,
      payload: {
        name: item.title,
        title: item.title,
        label: item.title,
        prompt: item.title,
        text: item.sub || item.title,
        course: item.course,
        courseId: item.courseId,
        minutes: 25,
        cards: [{ q: item.title, a: item.sub || item.title }],
      },
    });
    if (r.url) {
      onOpen(r.url);
    } else if (onNotify) {
      /* a declined send carries the handler's reason in r.toast — phrase
         that before the generic fallback so the row says *why* */
      onNotify(r.toast || (r.ok ? `Sent to ${PLACE_MAP[target.to]?.label || target.to}` : `Could not send: ${r.error || 'unavailable'}`));
    }
  };

  return (
    <div
      className={`group flex items-center gap-2.5 border-b border-[var(--color-line)] last:border-b-0 px-3 ${
        compact ? 'py-2' : 'py-2.5'
      } transition-colors ${
        selected
          ? 'bg-[var(--color-accent-soft)]/70'
          : 'bg-[var(--color-sheet)] hover:bg-[var(--color-sheet-hover)]'
      }`}
    >
      {/* Type / Module Icon */}
      <button
        type="button"
        onClick={() => {
          onSelectContext?.(item);
          onOpen(item.url);
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] border border-[var(--color-line)] bg-[var(--color-sheet-2)] text-[var(--color-accent)] cursor-pointer"
        title={`${typeLabel} in ${moduleLabel}`}
      >
        {iconForObjectType(item.type, item.app)}
      </button>

      {/* Main Title & Metadata */}
      <button
        type="button"
        onClick={() => {
          onSelectContext?.(item);
          onOpen(item.url);
        }}
        className="min-w-0 flex-1 text-left cursor-pointer focus:outline-none"
      >
        <div className="flex items-center gap-2">
          <span className={`truncate text-[13.5px] font-medium text-[var(--color-ink)] group-hover:text-[var(--color-accent)]${closedLabel ? ' opacity-55 line-through' : ''}`}>
            {item.title}
          </span>
          {dueInfo && (
            <Badge tone={dueInfo.warn ? 'warn' : 'neutral'}>{dueInfo.text}</Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-faint)]">
          <span className="font-medium text-[var(--color-mute)]">{typeLabel}</span>
          <span>·</span>
          <span>{moduleLabel}</span>
          {item.sub && item.sub !== item.course && (
            <>
              <span>·</span>
              <span className="truncate max-w-[200px]">{item.sub}</span>
            </>
          )}
          {item.updatedAt ? (
            <>
              <span>·</span>
              <span>{formatRelativeTime(item.updatedAt)}</span>
            </>
          ) : null}
        </div>
      </button>

      {/* Course & Topic Badges */}
      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        {item.course && item.course.toLowerCase() !== (contextCourse || '').toLowerCase() && (
          <Badge
            tone="accent"
            title={`Open ${item.course} course workspace`}
            onClick={(e) => {
              e.stopPropagation();
              if (onNavigateCourse) onNavigateCourse(item.course!);
              else onOpen(`#/c/${encodeURIComponent(item.course!)}`);
            }}
          >
            {item.course}
          </Badge>
        )}
        {item.topic && item.topic.toLowerCase() !== (item.course || '').toLowerCase() && (
          <Badge tone="neutral" title={`Topic: ${item.topic}`}>
            {item.topic}
          </Badge>
        )}
      </div>

      {/* Optional Primary CTA */}
      {primaryActionLabel && onPrimaryAction && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrimaryAction(item);
          }}
          className="shrink-0 rounded-[4px] border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)] transition-colors cursor-pointer print:hidden"
        >
          {primaryActionLabel}
        </button>
      )}

      {/* Actions: Send-to, Pin, Details (the row itself opens the object) */}
      <div className="flex items-center gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity print:hidden">
        <DropdownMenu
          trigger={(_open, toggle) => (
            <IconButton label={`Send "${item.title}" to another tool`} onClick={toggle}>
              <Share2 className="h-3.5 w-3.5" />
            </IconButton>
          )}
        >
          {(close) => (
            <div>
              {/* syllabus-owned rows can file done in place — off-clock
                  work shouldn't have to open the folio to complete */}
              {(item.type === 'commitment' || item.type === 'block') &&
                item.app === 'syllabus' &&
                !(item.data?.state === 'done' || item.data?.status === 'done' || item.data?.status === 'dropped') && (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    void sendTo({
                      to: 'syllabus',
                      action: item.type === 'commitment' ? 'commitment.done' : 'block.done',
                      payload:
                        item.type === 'commitment'
                          ? { commitmentId: item.id }
                          : { blockId: item.id },
                    }).then((r) => {
                      if (onNotify) onNotify(r.toast || (r.ok ? 'Filed done' : `Could not file: ${r.error || 'unavailable'}`));
                    });
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] cursor-pointer"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  File {item.type === 'commitment' ? 'commitment' : 'slip'} done
                </button>
              )}
              {item.type === 'commitment' &&
                item.app === 'syllabus' &&
                item.data?.status !== 'dropped' &&
                item.data?.status !== 'done' && (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    void sendTo({
                      to: 'syllabus',
                      action: 'commitment.drop',
                      payload: { commitmentId: item.id },
                    }).then((r) => {
                      if (onNotify) onNotify(r.toast || (r.ok ? 'Dropped' : `Could not drop: ${r.error || 'unavailable'}`));
                    });
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-bad)] hover:bg-[var(--color-bad-soft)] cursor-pointer"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  Drop commitment
                </button>
              )}
              <div className="px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-faint)]">
                Use with another tool
              </div>
              {QUICK_SEND_TARGETS.filter((t) => t.to !== item.app).map((t) => (
                <button
                  key={`${t.to}:${t.action}`}
                  type="button"
                  onClick={() => {
                    close();
                    void handleSend(t);
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)] cursor-pointer"
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </DropdownMenu>

        <IconButton
          label={pinned ? `Unpin ${item.title}` : `Pin ${item.title} to shelf`}
          active={pinned}
          onClick={(e) => {
            e.stopPropagation();
            togglePin({
              app: item.app,
              t: item.type,
              id: item.id,
              title: item.title,
              url: item.url,
            });
          }}
        >
          <span className="text-[12px] leading-none">{pinned ? '◈' : '◇'}</span>
        </IconButton>

        {onSelectContext && (
          <IconButton
            label={`Show details for ${item.title}`}
            active={selected}
            onClick={(e) => {
              e.stopPropagation();
              onSelectContext(item);
            }}
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
          </IconButton>
        )}
      </div>
    </div>
  );
}
