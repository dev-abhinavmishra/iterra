import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PLACES, PLACE_MAP } from './places';
import { subscribePresences, subscribeShared, subscribeIndexes, subscribeFeed, subscribeStore, pendingIntakes, firstPendingIntake, type Presence, type SharedField, type Entity, type FeedItem, type StoreEntity, type IntakeWait } from './hub';
import { Terrain } from './Terrain';
import { Search } from './Search';
import { Dossier } from './Dossier';
import { Ambient } from './Ambient';
import { parseHash, placeHashFromAppUrl } from './route';
import type { StoreEvent as StoreEventT } from './hub';
import { PLACE_COMPONENTS } from './apps';

const readHash = () => parseHash(window.location.hash);

/* A place is a mounted React subtree, not an iframe — a crash in one
   must not take the terrain down with it. Boundary gives the place a
   retry surface instead of a dead panel. */
class PlaceBoundary extends Component<{ name: string; onReset: () => void; children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error(`[iterra] ${this.props.name} crashed`, err); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center bg-paper">
        <div className="it-card-in anim-rise max-w-sm text-center">
          <div className="it-heading">{this.props.name} hit a snag</div>
          <p className="mt-1.5 text-[12.5px] text-mute">{String(this.state.err?.message || this.state.err)}</p>
          <button
            className="it-btn mt-4"
            onClick={() => { this.setState({ err: null }); this.props.onReset(); }}
          >
            restart {this.props.name}
          </button>
        </div>
      </div>
    );
  }
}

export default function App() {
  const [active, setActive] = useState<string>(() => readHash().place);
  const [course, setCourse] = useState<string>(() => readHash().course);
  const [presences, setPresences] = useState<Record<string, Presence>>({});
  const [shared, setShared] = useState<Record<string, SharedField>>({});
  const [indexes, setIndexes] = useState<Record<string, Entity[]>>({});
  const [feed, setFeed] = useState<FeedItem[]>([]);
  /* the canonical store — every entity every app has ever written. The
     palette, the dossier and the rails read THIS; the index docs stay
     the thin mirror. */
  const [entities, setEntities] = useState<StoreEntity[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  /* mounted places — keep-alive: a visited place stays mounted
     (display:none) so a running timer or half-written note survives a
     trip back to the map. Value = the query the place is currently
     addressed by (hash-carried deep links). */
  const [mounted, setMounted] = useState<Record<string, string>>({});
  const mountedRef = useRef(mounted);
  mountedRef.current = mounted;
  /* bumped when a warm place regains focus — adapters re-read the store */
  const [wakeTick, setWakeTick] = useState(0);
  const [woke, setWoke] = useState<string | null>(null);
  /* bump to force-remount a place (error boundary retry) */
  const [restarts, setRestarts] = useState<Record<string, number>>({});
  const [switcherOpen, setSwitcherOpen] = useState(false);
  /* queued sends parked in each app's intake — surfaced as 'N waiting'
     badges so a transfer that will deliver on next open isn't silent */
  const [intakes, setIntakes] = useState<Record<string, IntakeWait>>({});
  const [cheatOpen, setCheatOpen] = useState(false);

  useEffect(() => subscribePresences(setPresences), []);
  useEffect(() => {
    let alive = true;
    const pull = () => pendingIntakes().then((m) => { if (alive) setIntakes(m); });
    pull();
    const t = window.setInterval(pull, 4000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);
  useEffect(() => subscribeShared(setShared), []);
  useEffect(() => subscribeIndexes(setIndexes), []);
  useEffect(() => subscribeFeed(setFeed), []);
  useEffect(() => {
    const pull = () => {
      const it = (window as any).iterra;
      if (!it?.store?.list) return;
      it.store.list({}).then((list: StoreEntity[]) => setEntities(list || [])).catch(() => {});
    };
    pull();
    /* subscribe fires per put — a wake-time re-mirror writes hundreds of
       entities in a burst; trailing-debounce so the terrain re-reads once */
    let t = 0;
    const debounced = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(pull, 150);
    };
    const off = subscribeStore(debounced);
    return () => { if (t) window.clearTimeout(t); off(); };
  }, []);

  /* ⌘K / ctrl+K or `/` opens the palette; `?` the cheat sheet.
     A place may own a chord (ink's ⌘K, proof's ?) — declared at register()
     via ownKeys, so the terrain yields when that place is in front. */
  const owns = useCallback((key: string) => {
    const it = (window as any).iterra;
    return !!(active && it?.ownKeys?.(active)?.includes(key));
  }, [active]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
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
        setSwitcherOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [owns]);

  useEffect(() => {
    const onHash = () => {
      const { place: id, course: ckey, query } = readHash();
      setActive(id);
      setCourse(ckey);
      /* tell the hub which place is in front — feed/open attribution and
         the ownKeys yield follow the active place */
      if (id) (window as any).iterra?.focus?.(id);
      if (!id) return;
      /* mount at the deepest pending ?intake= when one exists — a bare
         mount drains the queue without ever landing on the delivered
         record (e.g. a queued timer.start resolving to its bound link). */
      if (!mountedRef.current[id] && !query.includes('intake=')) {
        firstPendingIntake(id).then((pid) => {
          setMounted((m) => (m[id] ? m : { ...m, [id]: pid ? `intake=${pid}${query ? `&${query}` : ''}` : query }));
        });
      } else {
        setMounted((m) => ({ ...m, [id]: query }));
      }
      /* warm place regaining focus — adapters re-read the store; the
         dot in the chrome makes the refresh visible. Places share this
         window now, so the iterra:wake postMessage lands on the same
         listeners the adapters already subscribe. */
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

  /* visibilitychange wake — returning to the terrain's tab re-reads the
     active place from the store, same contract as hash re-entry */
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
      ? `${place.app} · iterra`
      : course
        ? `${course} · iterra`
        : 'iterra — an integrated study terrain';
  }, [active, course]);

  const enter = useCallback((id: string) => {
    window.location.hash = `/p/${id}`;
  }, []);

  const goHome = useCallback(() => {
    window.location.hash = '/';
  }, []);

  /* shared deep-link router — palette hits, feed items, commons lines,
     and (via the iterra.open shim) the apps' own cross-place links all
     land here. Old-style /apps/<place>/<path>?<query> urls become
     '#/p/<place>?<query>' — the app's own path segment is folded into
     the query as 'p=' so nothing is lost. */
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
    const extra = p && p !== '/' ? `${hit.query ? '&' : ''}p=${encodeURIComponent(p.slice(1))}` : '';
    const q = `${hit.query}${extra}`;
    const target = `/p/${hit.place}${q ? `?${q}` : ''}`;
    /* identical hash => no hashchange => nav lost; bust with a nonce the
       place ignores so a repeat link still re-navigates */
    if (window.location.hash === `#${target}`) {
      window.location.hash = `${target}${q ? '&' : '?'}_inav=${Date.now()}`;
      return;
    }
    window.location.hash = target;
  }, []);

  /* app→app navigation: apps call iterra.open('/apps/<p>/...') or raw
     window.open — the hub's shim posts iterra:open to the parent, which
     IS this window now, and bare window.open calls get patched in
     main.tsx to land here too. */
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data;
      if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
      if (d.type === 'iterra:open' && typeof d.url === 'string') goUrl(d.url);
      if (d.type === 'iterra:hotkey' && typeof d.key === 'string') {
        const k = d.key;
        /* a place owning the chord yields nothing to the terrain — the
           hub forwards keys only for unclaimed bindings */
        if (k === 'k') { setSearchOpen((o) => !o); return; }
        if (k === '0' || k === '`') { goHome(); return; }
        const n = Number(k);
        if (n >= 1 && n <= PLACES.length) enter(PLACES[n - 1].id);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [goUrl, enter, goHome]);

  /* intake landing: a drained send resolves with the target's deep link
     (e.g. a bound autostart timer, the new note). The framed world let
     the hub location.assign that url inside the frame — here it's a hash
     nav to the place, so a delivery is visible, not silent. */
  useEffect(() => {
    const it = (window as any).iterra;
    if (!it?.events?.on) return;
    const off = it.events.on('send.delivered', (rec: StoreEventT) => {
      const url = rec?.payload?.url;
      if (typeof url === 'string' && placeHashFromAppUrl(url)) goUrl(url);
    });
    return typeof off === 'function' ? off : undefined;
  }, [goUrl]);

  /* anchors to /apps/<place>/… rendered inside places (SharedNoteLink et
     al.) — intercept before the browser navigates to a url that doesn't
     exist in the integrated terrain. */
  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
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

  /* ⌘1..8 jumps straight to a place (PLACES order), ⌘0/⌘` back to the
     terrain */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
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
  const timerEntry = presences['timer'];
  const timerRunning =
    timerEntry && Date.now() - timerEntry.at < 35000 ? (timerEntry.summary as any)?.running : null;

  const chrome = useMemo(() => {
    if (!activePlace) return null;
    return (
      <div className="anim-fade relative z-30 flex h-12 shrink-0 items-center gap-3 border-b border-atlas-300 bg-atlas-50 px-3 sm:px-4">
        <button
          onClick={goHome}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium text-moss-700 hover:bg-moss-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-500"
          title="Back to the terrain"
        >
          <span className="font-place text-[15px] tracking-[0.14em] lowercase">iterra</span>
          <span className="text-atlas-400">/</span>
          <span className="text-field-faint">terrain</span>
        </button>

        <span className="h-5 w-px bg-atlas-300" />

        <div className="relative">
          <button
            onClick={() => setSwitcherOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-md px-2 py-1 hover:bg-moss-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-500"
          >
            <span className="h-5 w-5 text-moss-700">{activePlace.glyph}</span>
            <span className="text-[14px] font-medium text-field-ink">{activePlace.place}</span>
            {woke === activePlace.id && (
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-moss-500" title="refreshed from the store" />
            )}
            <span className="hidden text-[11px] uppercase tracking-[0.12em] text-field-faint sm:inline">
              {activePlace.app}
            </span>
            <svg className="h-3.5 w-3.5 text-field-faint" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
          {switcherOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSwitcherOpen(false)} />
              <div className="anim-rise absolute left-0 top-full z-40 mt-1 w-64 rounded-lg border border-atlas-300 bg-atlas-50 p-1.5 shadow-[0_16px_40px_-16px_rgba(29,51,42,0.4)]">
                {/* in this place — the active app's own entities as
                    quick-jump links (from its index.<app> doc) */}
                {(indexes[active || ''] || []).length > 0 && (
                  <div>
                    <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-atlas-500">
                      in this place
                    </div>
                    {(indexes[active || ''] || []).slice(0, 6).map((e, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setSwitcherOpen(false);
                          goUrl(e.url || `/apps/${active}/`);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-moss-100"
                      >
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-field-ink">{e.title}</span>
                        <span className="shrink-0 text-[10px] text-atlas-500">{e.t}</span>
                      </button>
                    ))}
                    <div className="my-1 border-t border-atlas-200" />
                  </div>
                )}
                {PLACES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSwitcherOpen(false);
                      enter(p.id);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-moss-100 ${
                      p.id === active ? 'bg-moss-50' : ''
                    }`}
                  >
                    <span className="h-5 w-5 shrink-0 text-moss-700">{p.glyph}</span>
                    <span className="flex-1">
                      <span className="block text-[13px] font-medium text-field-ink">{p.place}</span>
                      <span className="block text-[11px] uppercase tracking-[0.1em] text-field-faint">{p.app}</span>
                    </span>
                    {intakes[p.id] ? (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          intakes[p.id].stuck ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                        }`}
                        title={intakes[p.id].stuck ? `delivery keeps failing — ${intakes[p.id].stuck}` : 'queued sends deliver on open'}
                      >
                        {intakes[p.id].count} waiting
                      </span>
                    ) : mounted[p.id] !== undefined ? (
                      <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-moss-500" title="warm — mounted" />
                    ) : null}
                  </button>
                ))}
                {/* linked — entities other apps hold on this place's
                    courses/topics */}
                {(() => {
                  if (!active) return null;
                  const keys = new Set<string>();
                  for (const e of indexes[active] || []) {
                    if (e.course) keys.add(e.course.toLowerCase());
                    if (e.topic) keys.add(e.topic.toLowerCase());
                  }
                  if (!keys.size) return null;
                  const related: { app: string; e: Entity }[] = [];
                  for (const [app, list] of Object.entries(indexes)) {
                    if (app === active) continue;
                    for (const e of list || []) {
                      const ek = [e.course, e.topic].filter(Boolean).map((x) => String(x).toLowerCase());
                      if (ek.some((k) => keys.has(k))) related.push({ app, e });
                    }
                  }
                  if (!related.length) return null;
                  return (
                    <div className="mt-1 border-t border-atlas-200 pt-1.5">
                      <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-atlas-500">
                        linked across the terrain
                      </div>
                      {related.slice(0, 5).map(({ app, e }, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setSwitcherOpen(false);
                            goUrl(e.url || `/apps/${app}/`);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-moss-100"
                        >
                          <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-moss-700">
                            {PLACE_MAP[app]?.app || app}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-field-faint">{e.title}</span>
                          <span className="shrink-0 text-[10px] text-atlas-500">{e.course || e.topic || ''}</span>
                        </button>
                      ))}
                      {[...keys].slice(0, 3).map((k) => (
                        <button
                          key={k}
                          onClick={() => {
                            setSwitcherOpen(false);
                            const e = (related[0] && (related[0].e.course || related[0].e.topic)) || '';
                            const label = e.toLowerCase() === k ? e : k;
                            window.location.hash = `/c/${encodeURIComponent(label)}`;
                          }}
                          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-moss-100"
                        >
                          <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-atlas-500">
                            dossier
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] italic text-field-faint">
                            all of {(related.find((r) => (r.e.course || '').toLowerCase() === k || (r.e.topic || '').toLowerCase() === k)?.e.course) || k} →
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
                <div className="mt-1 border-t border-atlas-200 pt-1">
                  <button
                    onClick={() => {
                      setSwitcherOpen(false);
                      goHome();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-moss-100"
                  >
                    <span className="flex h-5 w-5 items-center justify-center text-moss-700">⌂</span>
                    <span className="text-[13px] font-medium text-field-ink">the terrain</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden items-center gap-1.5 rounded-md border border-atlas-300 bg-atlas-50 px-2 py-1 text-[11px] text-atlas-500 hover:border-moss-400 hover:text-moss-700 sm:flex"
            title="Search the terrain (/)"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            search
            <kbd className="rounded border border-atlas-300 px-1 text-[10px]">/</kbd>
          </button>
          {timerRunning?.label && active !== 'timer' && (
            <button
              onClick={() => enter('timer')}
              className="hidden items-center gap-1.5 rounded-full border border-moss-300 bg-moss-50 px-2.5 py-1 text-[12px] text-moss-700 sm:flex"
            >
              <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-moss-600" />
              {timerRunning.label}
            </button>
          )}
          <button
            onClick={() => setRestarts((r) => ({ ...r, [active]: (r[active] || 0) + 1 }))}
            className="rounded-md px-2 py-1 text-[12px] text-field-faint hover:bg-moss-100 hover:text-moss-700"
            title="Restart this place fresh"
          >
            restart ⟳
          </button>
        </div>
      </div>
    );
  }, [active, activePlace, mounted, switcherOpen, timerRunning, enter, goHome, goUrl, indexes, woke, intakes]);

  return (
    <div className="flex h-full flex-col">
      {activePlace ? chrome : null}
      {/* places stay mounted even on the terrain home — a running timer or
          half-written note must survive a trip back to the map */}
      <div
        className="relative flex-1 bg-paper"
        style={{ display: activePlace ? 'block' : 'none' }}
      >
        {PLACES.map((p) => {
          if (mounted[p.id] === undefined) return null;
          const Comp = PLACE_COMPONENTS[p.id];
          if (!Comp) {
            return (
              <div key={p.id} className="absolute inset-0" style={{ display: p.id === active ? 'block' : 'none' }}>
                <div className="flex h-full items-center justify-center">
                  <div className="it-empty max-w-sm">this place hasn't been rebuilt into the terrain yet</div>
                </div>
              </div>
            );
          }
          return (
            <div
              key={`${p.id}:${restarts[p.id] || 0}`}
              className="frame-fade absolute inset-0"
              style={{ display: p.id === active ? 'block' : 'none' }}
            >
              <PlaceBoundary name={p.app} onReset={() => setRestarts((r) => ({ ...r, [p.id]: (r[p.id] || 0) + 1 }))}>
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center">
                      <div className="anim-rise flex items-center gap-2 rounded-full border border-atlas-400 bg-atlas-50/90 px-3.5 py-1 text-[11px] text-field-faint shadow-sm">
                        <span className="live-dot h-1.5 w-1.5 rounded-full bg-moss-500" />
                        waking {p.place.toLowerCase()}…
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
      {!activePlace ? (
        <div className="flex-1 overflow-auto">
          {course ? (
            <Dossier
              course={course}
              indexes={indexes}
              entities={entities}
              shared={shared}
              feed={feed}
              onGo={goUrl}
              onEnter={enter}
              onHome={goHome}
            />
          ) : (
            <Terrain presences={presences} mounted={Object.keys(mounted)} shared={shared} indexes={indexes} entities={entities} feed={feed} intakes={intakes} onEnter={enter} onGo={goUrl} />
          )}
        </div>
      ) : null}
      <Search
        indexes={indexes}
        entities={entities}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onGo={goUrl}
      />
      <Ambient
        entities={entities}
        mounted={Object.keys(mounted)}
        activePlace={active}
        onEnter={enter}
        onGo={goUrl}
      />
      {cheatOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-field-ink/20" onClick={() => setCheatOpen(false)} />
          <div className="anim-rise fixed left-1/2 top-24 z-50 w-80 -translate-x-1/2 rounded-lg border border-atlas-300 bg-atlas-50 p-4 shadow-[0_20px_50px_-20px_rgba(29,51,42,0.5)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-atlas-500">keys on the terrain</div>
            <div className="mt-2.5 space-y-1.5 text-[12.5px]">
              {([
                ['⌘K / ctrl+K / `/`', 'the palette — every entity, uncapped, send-to on a hit'],
                ['?', 'this sheet'],
                ['esc', 'close'],
                ['space (instruments)', 'start / pause the session'],
              ] as [string, string][]).map(([k, d]) => (
                <div key={k} className="flex items-baseline gap-3">
                  <span className="w-32 shrink-0 rounded bg-atlas-100 px-1.5 py-0.5 text-center font-mono text-[11px] text-field-ink">{k}</span>
                  <span className="text-field-faint">{d}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-atlas-200 pt-2.5 text-[11.5px] text-field-faint">
              the ambient rail keeps a running session in view on every surface — pause, resume, or finish it without leaving the place you're in.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
