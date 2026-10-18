import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Search as SearchIcon,
  Play,
  Pause,
  Check,
  PanelRight,
  Sun,
  Moon,
  ChevronDown,
  RotateCcw,
  HelpCircle,
  CheckCircle2,
  BookOpen,
  LayoutDashboard,
  Library,
  GraduationCap,
  Wrench,
  EllipsisVertical,
  Settings2,
} from 'lucide-react';
import { PLACES, PLACE_MAP } from './places';
import { SettingsSurface } from './settings/SettingsSurface';
import {
  subscribePresences,
  subscribeShared,
  subscribeIndexes,
  subscribeFeed,
  subscribeStore,
  pendingIntakes,
  firstPendingIntake,
  sendTo,
  type Presence,
  type SharedField,
  type Entity,
  type FeedItem,
  type StoreEntity,
  type IntakeWait,
  type StoreEvent as StoreEventT,
} from './hub';
import { TodayWorkspace } from './today/TodayWorkspace';
import { CourseWorkspace } from './courses/CourseWorkspace';
import { CoursesIndex } from './courses/CoursesIndex';
import { LibraryView } from './courses/LibraryView';
import { Search } from './Search';
import { Ambient } from './Ambient';
import {
  ContextPanel,
  resolveActiveWorkspaceObject,
} from './context/ContextPanel';
import { parseHash, placeHashFromAppUrl, type WorkspaceSection } from './route';
import { PLACE_COMPONENTS } from './apps';
import IntegrationModals from './integration/ModalsHost';
import { useWorkspaceTheme } from './ui/theme';
import { Dialog, DropdownMenu, IconButton } from './ui/primitives';
import { type WorkspaceObject } from './ui/ObjectRow';

const readHash = () => parseHash(window.location.hash);

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* Per-place persisted-state prefixes — a module that crashes on every
   mount is almost always choking on its own saved blob. The boundary's
   wipe escape clears exactly these keys so a broken place is recoverable
   without touching anything else. */
const PLACE_STORAGE: Record<string, { lsPrefixes: string[]; idbNames?: string[] }> = {
  rhythm: { lsPrefixes: ['rhythm.'] },
  proof: { lsPrefixes: ['proof.'] },
  syllabus: { lsPrefixes: ['syllabus.'] },
  gradestack: { lsPrefixes: ['gradestack'] },
  ink: { lsPrefixes: ['ink'] },
  timer: { lsPrefixes: ['timer.', 'platform.'] },
  flashcards: { lsPrefixes: ['cardfile'] },
  margin: { lsPrefixes: ['margin.'], idbNames: ['ModularAINotesDB'] },
};

async function wipePlaceStorage(placeId: string) {
  const spec = PLACE_STORAGE[placeId];
  if (!spec) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && spec.lsPrefixes.some((p) => k.startsWith(p))) doomed.push(k);
    }
    /* the app's entity index doc — a wiped place that can't boot again to
       republish would otherwise leave its entities ghosted in Search */
    doomed.push(`iterra.v1.doc.index.${placeId}`);
    for (const k of doomed) localStorage.removeItem(k);
    /* presence + shared fields are JSON blobs keyed inside — surgically
       drop the app's entries (fields stamp `by`, so ownership is known) */
    try {
      const apps = JSON.parse(localStorage.getItem('iterra.v1.apps') || '{}');
      if (apps[placeId]) {
        delete apps[placeId];
        localStorage.setItem('iterra.v1.apps', JSON.stringify(apps));
      }
    } catch { /* best-effort */ }
    try {
      const shared = JSON.parse(localStorage.getItem('iterra.v1.doc.shared') || '{}');
      let touched = false;
      for (const [k, f] of Object.entries(shared)) {
        if ((f as { by?: string })?.by === placeId) { delete shared[k]; touched = true; }
      }
      if (touched) localStorage.setItem('iterra.v1.doc.shared', JSON.stringify(shared));
    } catch { /* best-effort */ }
  } catch { /* storage unreadable — the crash probably says why */ }
  for (const name of spec.idbNames ?? []) {
    try { indexedDB.deleteDatabase(name); } catch { /* best-effort */ }
  }
  /* canonical store entities published under this app's key prefix — the
     same ghost problem as the index doc, one layer deeper */
  try {
    const ents = (await (window as any).iterra?.store?.list?.({ app: placeId })) ?? [];
    for (const e of ents) {
      try { await (window as any).iterra.store.remove(e.key); } catch { /* keep going */ }
    }
  } catch { /* store unreachable — entities linger until next publish */ }
}

class PlaceBoundary extends Component<
  { name: string; placeId?: string; onReset: () => void; children: ReactNode },
  { err: Error | null }
> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error) {
    console.error(`[iterra] ${this.props.name} crashed`, err);
  }
  render() {
    if (!this.state.err) return this.props.children;
    const wipe = this.props.placeId ? PLACE_STORAGE[this.props.placeId] : undefined;
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-paper)] p-6">
        <div className="it-card-in anim-rise max-w-sm text-center">
          <div className="it-heading">{this.props.name} encountered an error</div>
          <p className="mt-1.5 text-[12.5px] text-[var(--color-mute)]">
            {String(this.state.err?.message || this.state.err)}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              className="it-btn"
              onClick={() => {
                this.setState({ err: null });
                this.props.onReset();
              }}
            >
              Reload {this.props.name}
            </button>
            {wipe && (
              <button
                type="button"
                className="it-btn text-[var(--color-bad)]"
                title="Corrupted saved data is the usual cause of a crash that reloads can't fix"
                onClick={() => {
                  if (!window.confirm(
                    `Clear ${this.props.name}'s saved data and reload? ` +
                    `This cannot be undone — other tools and your courses keep their data.`
                  )) return;
                  /* a full reload, not a remount — the module's zustand
                     singletons keep the corrupt state in memory across a
                     React remount, so only a fresh module graph boots
                     clean. The wipe's IDB removes are awaited (bounded)
                     so the reload doesn't race them. */
                  const pid = this.props.placeId;
                  const wipe = pid ? wipePlaceStorage(pid) : Promise.resolve();
                  Promise.race([wipe, new Promise((r) => setTimeout(r, 1500))])
                    .catch(() => {})
                    .finally(() => window.location.reload());
                }}
              >
                Clear data &amp; reload
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

/* The same boundary around the whole shell — a crash in chrome, routing,
   or a workspace surface otherwise whitescreens with no recovery path. */
export function ShellBoundary({ children }: { children: ReactNode }) {
  return (
    <PlaceBoundary name="iterra" onReset={() => window.location.reload()}>
      {children}
    </PlaceBoundary>
  );
}

export default function App() {
  const [routeState, setRouteState] = useState(() => readHash());
  const active = routeState.place;
  const course = routeState.course;
  const section: WorkspaceSection = routeState.section;

  const [presences, setPresences] = useState<Record<string, Presence>>({});
  const [shared, setShared] = useState<Record<string, SharedField>>({});
  const [indexes, setIndexes] = useState<Record<string, Entity[]>>({});
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [entities, setEntities] = useState<StoreEntity[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  /* keep-alive mounted places */
  const [mounted, setMounted] = useState<Record<string, string>>({});
  const mountedRef = useRef(mounted);
  mountedRef.current = mounted;

  const [wakeTick, setWakeTick] = useState(0);
  const [woke, setWoke] = useState<string | null>(null);
  const [restarts, setRestarts] = useState<Record<string, number>>({});
  const [intakes, setIntakes] = useState<Record<string, IntakeWait>>({});
  const [cheatOpen, setCheatOpen] = useState(false);

  /* Theme & Workspace Context state */
  const [theme, setTheme] = useWorkspaceTheme();
  const [contextOpen, setContextOpen] = useState<boolean>(() => {
    /* under lg the panel is a full-screen drawer — always start closed there;
       a persisted "open" from a desktop session must not cover a phone. */
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return false;
    try {
      const v = localStorage.getItem('iterra.v1.contextOpen');
      if (v !== null) return v !== '0';
    } catch { /* ignore */ }
    return true;
  });
  const toggleContext = useCallback(() => {
    setContextOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('iterra.v1.contextOpen', next ? '1' : '0');
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const [manualObject, setManualObject] = useState<WorkspaceObject | null>(null);
  const [courseFilter, setCourseFilter] = useState<string>('');
  const [lastSavedAt, setLastSavedAt] = useState<number>(() => Date.now());

  // Tick for live focus countdown in global top bar
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => subscribePresences(setPresences), []);
  useEffect(() => {
    let alive = true;
    const pull = () =>
      pendingIntakes().then((m) => {
        if (alive) setIntakes(m);
      });
    pull();
    const t = window.setInterval(pull, 4000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  useEffect(() => subscribeShared(setShared), []);
  useEffect(() => subscribeIndexes(setIndexes), []);
  useEffect(() => subscribeFeed(setFeed), []);
  useEffect(() => {
    /* consecutive store failures mean the canonical layer is unreachable
       (IDB blocked/private mode) — the terrain looks empty either way, so
       say why once rather than let every surface silently show nothing */
    let failures = 0;
    const pull = () => {
      const it = (window as any).iterra;
      if (!it?.store?.list) return;
      it.store
        .list({})
        .then((list: StoreEntity[]) => {
          failures = 0;
          setEntities(list || []);
          setLastSavedAt(Date.now());
        })
        .catch(() => {
          if (++failures === 2) {
            try {
              window.dispatchEvent(new CustomEvent('iterra:toast', {
                detail: { text: 'Local data store is unreachable — check storage permissions', url: '#/settings' },
              }));
            } catch { /* no window to notify */ }
          }
        });
    };
    pull();
    /* a broken store may never raise a subscribe event — the 15s sweep
       keeps entity views fresh and gives the failure counter a second
       observation to warn on */
    const sweep = window.setInterval(pull, 15000);
    let t = 0;
    const debounced = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(pull, 150);
    };
    const off = subscribeStore(debounced);
    return () => {
      if (t) window.clearTimeout(t);
      window.clearInterval(sweep);
      off();
    };
  }, []);

  // Listen for custom object selection events from embedded modules (e.g. Flashcards deck selection)
  useEffect(() => {
    const onCustomSelect = (ev: Event) => {
      const detail = (ev as CustomEvent<WorkspaceObject>).detail;
      if (detail && detail.title) {
        setManualObject(detail);
      }
    };
    window.addEventListener('iterra:select-object', onCustomSelect);
    return () => window.removeEventListener('iterra:select-object', onCustomSelect);
  }, []);

  const owns = useCallback(
    (key: string) => {
      const it = (window as any).iterra;
      return !!(active && it?.ownKeys?.(active)?.includes(key));
    },
    [active],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (owns('k')) return;
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else if (e.key === '/' && !typing) {
        if (owns('/')) return;
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === '?' && !typing) {
        if (owns('?')) return;
        e.preventDefault();
        setCheatOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setCheatOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [owns]);

  useEffect(() => {
    const onHash = () => {
      const parsed = readHash();
      setRouteState(parsed);
      const id = parsed.place;
      const query = parsed.query;
      (window as any).iterra?.focus?.(id || null);
      if (!id) return;
      if (!mountedRef.current[id] && !query.includes('intake=')) {
        firstPendingIntake(id).then((pid) => {
          setMounted((m) =>
            m[id]
              ? m
              : { ...m, [id]: pid ? `intake=${pid}${query ? `&${query}` : ''}` : query },
          );
        });
      } else {
        setMounted((m) => ({ ...m, [id]: query }));
      }
      if (mountedRef.current[id]) {
        setWakeTick((t) => t + 1);
        setWoke(id);
        window.setTimeout(() => {
          window.postMessage({ type: 'iterra:wake', app: id }, window.location.origin);
        }, 60);
        window.setTimeout(() => setWoke((w) => (w === id ? null : w)), 1600);
      }
    };
    window.addEventListener('hashchange', onHash);
    onHash();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible' || !active || !mountedRef.current[active]) return;
      window.postMessage({ type: 'iterra:wake', app: active }, window.location.origin);
      setWoke(active);
      window.setTimeout(() => setWoke((w) => (w === active ? null : w)), 1600);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [active]);

  useEffect(() => {
    const place = active ? PLACE_MAP[active] : null;
    document.title = place
      ? `${place.label} (${place.place}) · Iterra`
      : course
        ? `${course} · Iterra`
        : section === 'courses'
          ? 'Courses · Iterra'
          : section === 'library'
            ? 'Library · Iterra'
            : section === 'settings'
              ? 'Settings · Iterra'
              : 'Iterra — Study Workspace';
  }, [active, course, section]);

  const enter = useCallback((id: string) => {
    window.location.hash = `/p/${id}`;
  }, []);

  const goHome = useCallback(() => {
    window.location.hash = '/';
  }, []);

  const goUrl = useCallback((url: string) => {
    if (url.startsWith('#')) {
      window.location.hash = url.slice(1);
      return;
    }
    const hit = placeHashFromAppUrl(url);
    if (!hit) {
      if (/^https?:/.test(url)) window.open(url, '_blank', 'noopener');
      return;
    }
    const p = url.match(/^\/apps\/[a-z]+(\/[^?#]*)/)?.[1];
    const extra =
      p && p !== '/' ? `${hit.query ? '&' : ''}p=${encodeURIComponent(p.slice(1))}` : '';
    const q = `${hit.query}${extra}`;
    const target = `/p/${hit.place}${q ? `?${q}` : ''}`;
    if (window.location.hash === `#${target}`) {
      window.location.hash = `${target}${q ? '&' : '?'}_inav=${Date.now()}`;
      return;
    }
    window.location.hash = target;
  }, []);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data;
      if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
      if (d.type === 'iterra:open' && typeof d.url === 'string') goUrl(d.url);
      if (d.type === 'iterra:hotkey' && typeof d.key === 'string') {
        const k = d.key;
        if (k === 'k') {
          setSearchOpen((o) => !o);
          return;
        }
        if (k === '0' || k === '`') {
          goHome();
          return;
        }
        const n = Number(k);
        if (n >= 1 && n <= PLACES.length) enter(PLACES[n - 1].id);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [goUrl, enter, goHome]);

  useEffect(() => {
    const it = (window as any).iterra;
    if (!it?.events?.on) return;
    const off = it.events.on('send.delivered', (rec: StoreEventT) => {
      const url = rec?.payload?.url;
      if (typeof url === 'string' && placeHashFromAppUrl(url)) goUrl(url);
    });
    return typeof off === 'function' ? off : undefined;
  }, [goUrl]);

  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      if (
        ev.defaultPrevented ||
        ev.button !== 0 ||
        ev.metaKey ||
        ev.ctrlKey ||
        ev.shiftKey ||
        ev.altKey
      )
        return;
      const a = (ev.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!placeHashFromAppUrl(href)) return;
      ev.preventDefault();
      goUrl(href);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [goUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      /* no typing guard — a meta-chord never inserts text, and ⌘K already
         works mid-edit; ⌘3 doing nothing inside a note reads as broken */
      if (e.key === '0' || e.key === '`') {
        e.preventDefault();
        goHome();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= PLACES.length) {
        if (owns(String(n))) return;
        e.preventDefault();
        enter(PLACES[n - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enter, goHome, owns]);

  const activePlace = active ? PLACE_MAP[active] : null;

  // Known courses for global course context selector
  const knownCourses = useMemo(() => {
    const map = new Map<string, { code: string; name?: string }>();
    for (const e of entities) {
      if (e.type === 'course') {
        const code = (e.data?.code as string) || e.course || e.title || '';
        const name = e.title && e.title !== code ? e.title : (e.data?.name as string) || undefined;
        if (code) map.set(code.toLowerCase(), { code, name });
      } else if (e.course && !map.has(e.course.toLowerCase())) {
        map.set(e.course.toLowerCase(), { code: e.course });
      }
    }
    for (const list of Object.values(indexes)) {
      for (const e of list || []) {
        if (e?.course && !map.has(e.course.toLowerCase())) {
          map.set(e.course.toLowerCase(), { code: e.course });
        }
      }
    }
    const ac = shared.activeCourse?.v as { code?: string; name?: string } | undefined;
    if (ac?.code && !map.has(ac.code.toLowerCase())) {
      map.set(ac.code.toLowerCase(), { code: ac.code, name: ac.name });
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [entities, indexes, shared.activeCourse]);

  // Active Focus Session state for top bar
  const focusField = shared.focus;
  const fv = (focusField?.v || {}) as {
    running?: boolean;
    paused?: boolean;
    label?: string;
    course?: string;
    endsAt?: number;
    remainingSec?: number;
    totalMin?: number;
  };
  const focusLive =
    !!focusField?.at &&
    now - focusField.at < 3 * 60 * 1000 &&
    (fv.running === true || fv.paused === true);
  const focusSecLeft =
    fv.running && fv.endsAt
      ? Math.max(0, (fv.endsAt - now) / 1000)
      : fv.remainingSec ?? 0;

  const timerCtl = (op: 'pause' | 'resume' | 'finish') => {
    void sendTo({ to: 'timer', action: 'timer.control', payload: { op } });
  };

  const quickStartFocus = (courseCode?: string) => {
    void sendTo({
      to: 'timer',
      action: 'timer.start',
      payload: {
        label: courseCode ? `${courseCode} focus` : 'Focus session',
        minutes: 25,
        course: courseCode,
        from: 'workspace',
      },
    }).then((r) => {
      if (r.url) goUrl(r.url);
    });
  };

  // Resolve currently active object for the shared Context Panel
  const resolvedObject = useMemo(
    () =>
      resolveActiveWorkspaceObject({
        manual: manualObject,
        activePlace: active,
        activeCourse: course || courseFilter,
        shared,
        entities,
        indexes,
      }),
    [manualObject, active, course, courseFilter, shared, entities, indexes],
  );

  const handleSelectObject = useCallback((obj: WorkspaceObject) => {
    setManualObject(obj);
    setContextOpen(true);
  }, []);

  // Persistence / Sync status
  const persistenceStatus = useMemo(() => {
    const it = (window as any).iterra;
    const sync = it?.sync?.status?.() as
      | { attached?: boolean; adapter?: string; error?: string; queued?: number }
      | undefined;
    const totalPendingIntakes = Object.values(intakes).reduce((acc, w) => acc + (w?.count || 0), 0);
    if (sync?.error) {
      return { label: 'Sync issue · Saved locally', tone: 'warn' as const, detail: sync.error };
    }
    if (totalPendingIntakes > 0) {
      return {
        label: `${totalPendingIntakes} transfer${totalPendingIntakes === 1 ? '' : 's'} queued`,
        tone: 'warn' as const,
        detail: 'Queued actions will deliver when the target tool opens',
      };
    }
    if (sync?.attached) {
      return {
        label: `Synced (${sync.adapter || 'cloud'})`,
        tone: 'ok' as const,
        detail: 'Saved locally in IndexedDB and synced to cloud',
      };
    }
    return {
      label: 'Saved locally',
      tone: 'ok' as const,
      detail: 'Persisted in browser storage (IndexedDB + localStorage)',
    };
  }, [intakes, lastSavedAt]);

  const effectiveCourseContext =
    course ||
    courseFilter ||
    resolvedObject?.course ||
    ((shared.activeCourse?.v as any)?.code as string) ||
    '';

  /* Course-context menu body — shared between the header selector (md+) and
     the bottom tab bar's Course item (< lg), which opens it upward. */
  const courseMenuContent = (close: () => void) => (
    <div className="w-60 p-1">
      <div className="px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-faint)]">
        Course Context
      </div>
      <button
        type="button"
        onClick={() => {
          close();
          setCourseFilter('');
          if (section === 'courses' && course) goUrl('#/courses');
        }}
        className={`flex w-full items-center justify-between rounded-[4px] px-2.5 py-1.5 text-left text-[12px] cursor-pointer ${
          !effectiveCourseContext
            ? 'bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent)]'
            : 'text-[var(--color-ink)] hover:bg-[var(--color-sheet-hover)]'
        }`}
      >
        <span>All Courses</span>
      </button>
      {knownCourses.map((c) => (
        <div
          key={c.code}
          className="flex items-center justify-between gap-1 rounded-[4px] px-2 py-1 hover:bg-[var(--color-sheet-hover)]"
        >
          <button
            type="button"
            onClick={() => {
              close();
              setCourseFilter(c.code);
              if (section === 'courses') {
                goUrl(`#/c/${encodeURIComponent(c.code)}`);
              }
            }}
            className="min-w-0 flex-1 text-left text-[12px] text-[var(--color-ink)] cursor-pointer"
          >
            <span className="font-mono font-semibold text-[var(--color-accent)]">
              {c.code}
            </span>
            {c.name && (
              <span className="ml-1.5 truncate text-[var(--color-mute)]">
                {c.name}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              goUrl(`#/c/${encodeURIComponent(c.code)}`);
            }}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] cursor-pointer"
            title={`Open ${c.code} workspace`}
          >
            Open →
          </button>
        </div>
      ))}
      <div className="mt-1 border-t border-[var(--color-line)] pt-1">
        <button
          type="button"
          onClick={() => {
            close();
            goUrl('#/c/unfiled');
          }}
          className="flex w-full items-center justify-between rounded-[4px] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-mute)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
        >
          <span>Getting Started</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );

  /* shared tab-bar item styling — icon over label, accent when current.
     h-full lets the dropdown trigger fill its stretch-wrapped slot. */
  const navItemCls = (on: boolean) =>
    `flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10.5px] font-medium transition-colors cursor-pointer ${
      on ? 'text-[var(--color-accent)]' : 'text-[var(--color-mute)] hover:text-[var(--color-ink)]'
    }`;

  return (
    <div className="flex h-full flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
      {/* Skip link — first Tab stop, lands on the workspace region. The hash
          router claims raw fragments, so the href can't drive this — focus is
          moved programmatically instead (target carries tabIndex={-1}). */}
      <a
        href="#iterra-workspace"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('iterra-workspace')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[999] focus:rounded-[5px] focus:border focus:border-[var(--color-accent)] focus:bg-[var(--color-sheet)] focus:px-3 focus:py-1.5 focus:text-[12.5px] focus:font-medium focus:text-[var(--color-accent)]"
      >
        Skip to workspace
      </a>
      {/* ── CONSISTENT GLOBAL WORKSPACE HEADER ── */}
      <header className="relative z-30 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] bg-[var(--color-sheet)] px-3 sm:px-4">
        {/* Left: Brand + Primary Navigation (Today, Courses, Library, Tools) */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <button
            type="button"
            onClick={goHome}
            className="flex items-center gap-2 rounded-[5px] px-2 py-1 text-left hover:bg-[var(--color-sheet-2)] cursor-pointer"
            title="Iterra Workspace — Today (⌘0)"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-place text-[12px] font-bold">
              i
            </span>
            <span className="font-place text-[16px] font-semibold tracking-tight text-[var(--color-ink)] hidden sm:inline">
              iterra
            </span>
          </button>

          <span className="h-4 w-px bg-[var(--color-line)] hidden lg:block" />

          {/* Primary Navigation Items — lg+ only; below lg the bottom tab
              bar carries these (the row overlapped the header controls) */}
          <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-0.5">
            <button
              type="button"
              onClick={goHome}
              aria-current={section === 'today' ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
                section === 'today'
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold'
                  : 'text-[var(--color-mute)] hover:bg-[var(--color-sheet-2)] hover:text-[var(--color-ink)]'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
              <span>Today</span>
            </button>

            <button
              type="button"
              onClick={() => goUrl('#/courses')}
              aria-current={section === 'courses' ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
                section === 'courses'
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold'
                  : 'text-[var(--color-mute)] hover:bg-[var(--color-sheet-2)] hover:text-[var(--color-ink)]'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              <span>Courses</span>
              {course && (
                <span className="rounded-[3px] bg-[var(--color-accent)] px-1.5 py-0.2 font-mono text-[10px] text-[var(--color-accent-fg)]">
                  {course}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => goUrl('#/library')}
              aria-current={section === 'library' ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
                section === 'library'
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold'
                  : 'text-[var(--color-mute)] hover:bg-[var(--color-sheet-2)] hover:text-[var(--color-ink)]'
              }`}
            >
              <Library className="h-3.5 w-3.5 shrink-0" />
              <span>Library</span>
            </button>
          </nav>

          {/* Tools Dropdown / Active Tool Switcher — stays in the header at
              every size: it's the place switcher when a tool is mounted */}
          <div className="flex items-center">
            {/* kept outside the lg-only nav above */}
            <DropdownMenu
              align="left"
              trigger={(open, toggle) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={open}
                  title={activePlace ? `${activePlace.app} · ${activePlace.place}` : 'Workspace tools'}
                  className={`inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
                    activePlace
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold'
                      : 'text-[var(--color-mute)] hover:bg-[var(--color-sheet-2)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {activePlace ? (
                    <>
                      <span className="h-4 w-4 shrink-0 text-[var(--color-accent)] [&>svg]:h-full [&>svg]:w-full">
                        {activePlace.glyph}
                      </span>
                      <span>{activePlace.label}</span>
                      {woke === activePlace.id && (
                        <span
                          className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
                          title="Refreshed from workspace store"
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <Wrench className="h-3.5 w-3.5 shrink-0" />
                      <span>Tools</span>
                    </>
                  )}
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </button>
              )}
            >
              {(close) => (
                <div className="w-72 p-1">
                  <div className="px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
                    Tools (⌘1–8)
                  </div>
                  {PLACES.map((p, idx) => {
                    const isCurrent = p.id === active;
                    const wait = intakes[p.id];
                    const isWarm = mounted[p.id] !== undefined;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          close();
                          enter(p.id);
                        }}
                        aria-current={isCurrent ? 'page' : undefined}
                        title={`${p.app} — ${p.tagline}`}
                        className={`flex w-full items-center gap-2.5 rounded-[5px] px-2.5 py-2 text-left transition-colors cursor-pointer ${
                          isCurrent
                            ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                            : 'hover:bg-[var(--color-sheet-hover)] text-[var(--color-ink)]'
                        }`}
                      >
                        <span className="h-4 w-4 shrink-0 text-[var(--color-accent)] [&>svg]:h-full [&>svg]:w-full">
                          {p.glyph}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-1.5">
                            <span className="text-[13px] font-semibold">{p.label}</span>
                            <span className="font-mono text-[10px] text-[var(--color-faint)]">
                              {p.place}
                            </span>
                          </span>
                          <span className="block truncate text-[11px] text-[var(--color-mute)]">
                            {p.shortDesc}
                          </span>
                        </span>
                        {wait && wait.count > 0 ? (
                          <span
                            title={wait.stuck ? `Delivery is failing: ${wait.stuck}` : `${wait.count} waiting — opens here`}
                            className={`shrink-0 rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                              wait.stuck
                                ? 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]'
                                : 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]'
                            }`}
                          >
                            {wait.stuck ? '!' : wait.count}
                          </span>
                        ) : isWarm ? (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
                            title="Open — resumes where you left it"
                          />
                        ) : (
                          <kbd className="font-mono text-[10px] text-[var(--color-faint)]">
                            ⌘{idx + 1}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                  {activePlace && (
                    <div className="mt-1 border-t border-[var(--color-line)] pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          close();
                          setRestarts((r) => ({ ...r, [active]: (r[active] || 0) + 1 }));
                        }}
                        className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-mute)] hover:bg-[var(--color-sheet-hover)] hover:text-[var(--color-ink)] cursor-pointer"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reload {activePlace.label}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </DropdownMenu>
          </div>
        </div>

        {/* Center/Right: Course Context + Global Search + Active Focus Status + Save Status + Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Course / Topic Context Selector */}
          <DropdownMenu
            align="right"
            trigger={(_open, toggle) => (
              <button
                type="button"
                onClick={toggle}
                title="Current course context"
                className="hidden md:inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-paper)]/70 px-2.5 py-1 text-[12px] text-[var(--color-ink)] hover:border-[var(--color-accent)] cursor-pointer"
              >
                <span className="font-mono text-[10px] uppercase text-[var(--color-faint)]">
                  Course:
                </span>
                <span className="font-semibold text-[var(--color-accent)] max-w-[100px] truncate">
                  {effectiveCourseContext || 'All'}
                </span>
                <ChevronDown className="h-3 w-3 text-[var(--color-faint)]" />
              </button>
            )}
          >
            {courseMenuContent}
          </DropdownMenu>

          {/* Global Search / Command Palette */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex items-center gap-2 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-paper)]/70 px-2.5 py-1 text-[12px] text-[var(--color-mute)] hover:border-[var(--color-accent)] hover:text-[var(--color-ink)] cursor-pointer"
            title="Search workspace or run command (⌘K or /)"
            aria-label="Search workspace or run command"
          >
            <SearchIcon className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden sm:inline rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-1 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>

          {/* Active Focus Session Status & Inline Controls */}
          {focusLive ? (
            <div className="flex items-center gap-1 rounded-[5px] border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-0.5 text-[12px]">
              <span
                className={`h-2 w-2 rounded-full ${
                  fv.paused ? 'bg-[var(--color-warn)]' : 'bg-[var(--color-accent)] live-dot'
                }`}
              />
              <button
                type="button"
                onClick={() => enter('timer')}
                className="flex items-center gap-1.5 text-left cursor-pointer"
                title="Open Timer"
              >
                <span className="hidden xl:inline max-w-[110px] truncate font-medium text-[var(--color-ink)]">
                  {fv.label || 'Focus'}
                </span>
                <span className="font-mono text-[11.5px] font-semibold tabular-nums text-[var(--color-accent)]">
                  {fmtClock(focusSecLeft)}
                </span>
              </button>
              {fv.running ? (
                <button
                  type="button"
                  onClick={() => timerCtl('pause')}
                  aria-label="Pause focus session"
                  title="Pause session"
                  className="rounded p-0.5 text-[var(--color-accent)] hover:bg-[var(--color-sheet)] cursor-pointer"
                >
                  <Pause className="h-3 w-3" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => timerCtl('resume')}
                  aria-label="Resume focus session"
                  title="Resume session"
                  className="rounded p-0.5 text-[var(--color-accent)] hover:bg-[var(--color-sheet)] cursor-pointer"
                >
                  <Play className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => timerCtl('finish')}
                aria-label="Finish focus session"
                title="Finish and log session"
                className="rounded p-0.5 text-[var(--color-accent)] hover:bg-[var(--color-sheet)] cursor-pointer"
              >
                <Check className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <DropdownMenu
              align="right"
              trigger={(_open, toggle) => (
                <button
                  type="button"
                  onClick={toggle}
                  title="Start a 25m focus session"
                  className="hidden sm:inline-flex items-center gap-1 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-2 py-1 text-[12px] font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] cursor-pointer"
                >
                  <Play className="h-3 w-3 text-[var(--color-accent)]" />
                  <span>Focus</span>
                </button>
              )}
            >
              {(close) => (
                <div className="w-52 p-1">
                  <div className="px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-faint)]">
                    Start 25m Focus Session
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      quickStartFocus(effectiveCourseContext || undefined);
                    }}
                    className="flex w-full items-center justify-between rounded-[4px] px-2.5 py-1.5 text-left text-[12px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)] cursor-pointer"
                  >
                    <span>
                      {effectiveCourseContext ? `Focus: ${effectiveCourseContext}` : 'General Focus'}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--color-faint)]">25m</span>
                  </button>
                  {knownCourses.slice(0, 4).map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => {
                        close();
                        quickStartFocus(c.code);
                      }}
                      className="flex w-full items-center justify-between rounded-[4px] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-ink)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                    >
                      <span className="truncate">{c.code}</span>
                      <span className="font-mono text-[10px] text-[var(--color-faint)]">25m</span>
                    </button>
                  ))}
                  <div className="mt-1 border-t border-[var(--color-line)] pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        enter('timer');
                      }}
                      className="flex w-full items-center justify-between rounded-[4px] px-2.5 py-1.5 text-left text-[11.5px] text-[var(--color-mute)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                    >
                      <span>Open Timer</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              )}
            </DropdownMenu>
          )}

          {/* Workspace overflow — theme, shortcuts, and the save-status
              readout fold into one quiet menu instead of three chrome
              buttons */}
          <DropdownMenu
            align="right"
            trigger={(_open, toggle) => (
              <button
                type="button"
                onClick={toggle}
                title="Workspace options"
                aria-label="Workspace options"
                className="inline-flex h-7 w-7 items-center justify-center rounded-[5px] border border-transparent text-[var(--color-mute)] hover:bg-[var(--color-sheet-2)] hover:text-[var(--color-ink)] transition-colors cursor-pointer"
              >
                <EllipsisVertical className="h-4 w-4" />
              </button>
            )}
          >
            {(close) => (
              <div className="w-56 p-1">
                {/* save state — read-only line, the detail lives on the row */}
                <div className="flex items-center gap-2 px-2.5 py-1.5" title={persistenceStatus.detail}>
                  <CheckCircle2
                    className={`h-3.5 w-3.5 shrink-0 ${
                      persistenceStatus.tone === 'warn'
                        ? 'text-[var(--color-warn)]'
                        : 'text-[var(--color-accent)]'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-[var(--color-ink)]">
                      {persistenceStatus.label}
                    </div>
                    <div className="text-[10.5px] text-[var(--color-faint)] truncate">
                      {persistenceStatus.detail}
                    </div>
                  </div>
                </div>
                <div className="my-1 border-t border-[var(--color-line)]" />
                <button
                  type="button"
                  onClick={() => {
                    close();
                    setTheme();
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-ink)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                >
                  {theme === 'paper' ? (
                    <Moon className="h-3.5 w-3.5 text-[var(--color-mute)]" />
                  ) : (
                    <Sun className="h-3.5 w-3.5 text-[var(--color-mute)]" />
                  )}
                  <span>{theme === 'paper' ? 'Graphite theme' : 'Paper theme'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    goUrl('#/settings');
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-ink)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                >
                  <Settings2 className="h-3.5 w-3.5 text-[var(--color-mute)]" />
                  <span>Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    setCheatOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-ink)] hover:bg-[var(--color-sheet-hover)] cursor-pointer"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-[var(--color-mute)]" />
                  <span>Keyboard shortcuts</span>
                  <kbd className="ml-auto rounded border border-[var(--color-line)] bg-[var(--color-sheet-2)] px-1 font-mono text-[10px] text-[var(--color-faint)]">?</kbd>
                </button>
              </div>
            )}
          </DropdownMenu>

          {/* Shared Context Panel Toggle */}
          <IconButton
            label={contextOpen ? 'Hide details panel' : 'Show details panel'}
            active={contextOpen}
            onClick={toggleContext}
          >
            <PanelRight className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      {/* ── MAIN WORKSPACE AREA + SHARED CONTEXT PANEL ── */}
      <div id="iterra-workspace" tabIndex={-1} className="flex flex-1 min-h-0 overflow-hidden outline-none">
        {/* Central Working Surface */}
        <div className="relative flex-1 min-w-0 h-full overflow-hidden">
          {/* Keep-alive embedded tools container with .it-workspace-mode */}
          <div
            className="it-workspace-mode relative h-full w-full bg-[var(--color-paper)]"
            style={{ display: activePlace ? 'block' : 'none' }}
          >
            {PLACES.map((p) => {
              if (mounted[p.id] === undefined) return null;
              const Comp = PLACE_COMPONENTS[p.id];
              if (!Comp) {
                return (
                  <div
                    key={p.id}
                    className="absolute inset-0"
                    style={{ display: p.id === active ? 'block' : 'none' }}
                  >
                    <div className="flex h-full items-center justify-center">
                      <div className="it-empty max-w-sm">
                        This tool is not available in the current build.
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={`${p.id}:${restarts[p.id] || 0}`}
                  className="frame-fade absolute inset-0 overflow-hidden"
                  data-terrain={theme}
                  style={{ display: p.id === active ? 'block' : 'none' }}
                >
                  <PlaceBoundary
                    name={p.label}
                    placeId={p.id}
                    onReset={() => setRestarts((r) => ({ ...r, [p.id]: (r[p.id] || 0) + 1 }))}
                  >
                    <Suspense
                      fallback={
                        <div className="flex h-full items-center justify-center">
                          <div className="anim-rise flex items-center gap-2 rounded-full border border-[var(--color-line-2)] bg-[var(--color-sheet)] px-3.5 py-1.5 text-[12px] text-[var(--color-mute)] shadow-sm">
                            <span className="live-dot h-2 w-2 rounded-full bg-[var(--color-accent)]" />
                            Loading {p.label}…
                          </div>
                        </div>
                      }
                    >
                      <Comp query={mounted[p.id]} wakeTick={wakeTick} />
                    </Suspense>
                  </PlaceBoundary>
                </div>
              );
            })}
          </div>

          {/* Shell Workspaces (Today, Course Workspace, Courses Index, Library) */}
          {!activePlace && (
            <main className="h-full overflow-y-auto">
              {section === 'courses' && course ? (
                <CourseWorkspace
                  course={course}
                  indexes={indexes}
                  entities={entities}
                  shared={shared}
                  feed={feed}
                  selectedObject={resolvedObject}
                  onSelectObject={handleSelectObject}
                  onGo={goUrl}
                  onEnter={enter}
                  onHome={goHome}
                />
              ) : section === 'courses' ? (
                <CoursesIndex
                  entities={entities}
                  indexes={indexes}
                  onGo={goUrl}
                  onEnter={enter}
                />
              ) : section === 'settings' ? (
                <SettingsSurface onGo={goUrl} />
              ) : section === 'library' ? (
                <LibraryView
                  entities={entities}
                  indexes={indexes}
                  activeCourseFilter={courseFilter}
                  selectedObject={resolvedObject}
                  onSelectObject={handleSelectObject}
                  onGo={goUrl}
                  onEnter={enter}
                />
              ) : (
                <TodayWorkspace
                  presences={presences}
                  mounted={Object.keys(mounted)}
                  shared={shared}
                  indexes={indexes}
                  entities={entities}
                  feed={feed}
                  intakes={intakes}
                  activeCourseFilter={courseFilter}
                  selectedObject={resolvedObject}
                  onSelectObject={handleSelectObject}
                  onEnter={enter}
                  onGo={goUrl}
                />
              )}
            </main>
          )}
        </div>

        {/* Shared Collapsible Context Panel */}
        <ContextPanel
          open={contextOpen}
          onClose={() => setContextOpen(false)}
          object={resolvedObject}
          entities={entities}
          indexes={indexes}
          activeCourseFilter={effectiveCourseContext}
          onGo={goUrl}
          onSelectObject={handleSelectObject}
        />
      </div>

      {/* ── BOTTOM TAB BAR — small screens only. Primary destinations plus
          the course-context selector (the header versions are lg+/md+ only).
          In-flow so nothing floats over content. The bar is 3.5rem of items
          *plus* safe-area padding — a fixed h-14 + padding would squeeze the
          items on home-indicator devices. Matches --iterra-bottom-inset. */}
      <nav
        aria-label="Primary navigation — compact"
        className="flex h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] shrink-0 items-stretch border-t border-[var(--color-line)] bg-[var(--color-sheet)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <button
          type="button"
          onClick={goHome}
          aria-current={section === 'today' ? 'page' : undefined}
          className={navItemCls(section === 'today')}
        >
          <LayoutDashboard className="h-[18px] w-[18px]" />
          <span>Today</span>
        </button>
        <button
          type="button"
          onClick={() => goUrl('#/courses')}
          aria-current={section === 'courses' ? 'page' : undefined}
          className={navItemCls(section === 'courses')}
        >
          <BookOpen className="h-[18px] w-[18px]" />
          <span>Courses</span>
        </button>
        <button
          type="button"
          onClick={() => goUrl('#/library')}
          aria-current={section === 'library' ? 'page' : undefined}
          className={navItemCls(section === 'library')}
        >
          <Library className="h-[18px] w-[18px]" />
          <span>Library</span>
        </button>
        <DropdownMenu
          side="top"
          align="right"
          className="min-w-0 flex-1"
          trigger={(_open, toggle) => (
            <button
              type="button"
              onClick={toggle}
              aria-label={`Course context: ${effectiveCourseContext || 'All'}`}
              className={navItemCls(!!effectiveCourseContext)}
            >
              <GraduationCap className="h-[18px] w-[18px]" />
              <span className="max-w-full truncate px-1">
                {effectiveCourseContext || 'Course'}
              </span>
            </button>
          )}
        >
          {courseMenuContent}
        </DropdownMenu>
      </nav>

      {/* Global Search / Command Palette */}
      <Search
        indexes={indexes}
        entities={entities}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onGo={goUrl}
        onToggleTheme={() => setTheme()}
        onToggleContext={toggleContext}
      />

      {/* Non-intrusive Session / Intake Toast */}
      <Ambient
        entities={entities}
        mounted={Object.keys(mounted)}
        activePlace={active}
        panelOpen={contextOpen}
        onEnter={enter}
        onGo={goUrl}
      />

      {/* Keyboard Shortcuts Dialog */}
      <Dialog
        open={cheatOpen}
        onClose={() => setCheatOpen(false)}
        title="Workspace Keyboard Shortcuts"
        subtitle="Navigate between tools, search objects, and control sessions from the keyboard."
        maxWidth="max-w-md"
      >
        <div className="space-y-2 text-[12.5px]">
          {(
            [
              ['⌘K / Ctrl+K / /', 'Open global search & command palette'],
              ['⌘P / Ctrl+P (in palette)', 'Pin the highlighted result to the shelf'],
              ['Tab / → (in palette)', 'Send the highlighted result to another tool'],
              ['⌘0 / Ctrl+0', 'Return to Today workspace'],
              ['⌘1 – ⌘8', 'Switch directly to tool 1–8'],
              ['?', 'Show keyboard shortcuts'],
              ['Esc', 'Close active dialog or menu'],
              ['Space (in Timer)', 'Start or pause active countdown'],
              ['R (in Timer)', 'Reset the current timer'],
              ['F (in Timer)', 'Enter focus mode while running'],
              ['L (in Stopwatch)', 'Mark a lap'],
            ] as [string, string][]
          ).map(([k, d]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 py-1 border-b border-[var(--color-line)] last:border-b-0">
              <kbd className="shrink-0 rounded border border-[var(--color-line)] bg-[var(--color-sheet-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-ink)]">
                {k}
              </kbd>
              <span className="text-right text-[var(--color-mute)]">{d}</span>
            </div>
          ))}
        </div>
      </Dialog>

      {/* Cross-module workflow modals — any place dispatches 'iterra:modal' */}
      <IntegrationModals />
    </div>
  );
}
