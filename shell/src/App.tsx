import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PLACES, PLACE_MAP } from './places';
import { subscribePresences, subscribeShared, subscribeIndexes, subscribeFeed, subscribeStore, wakeFrame, pendingIntakes, firstPendingIntake, type Presence, type SharedField, type Entity, type FeedItem, type StoreEntity } from './hub';
import { Terrain } from './Terrain';
import { Search } from './Search';
import { Dossier } from './Dossier';
import { Ambient } from './Ambient';
import { parseHash, appUrl } from './route';

const readHash = () => parseHash(window.location.hash);

export default function App() {
  const [active, setActive] = useState<string>(() => readHash().place);
  const [course, setCourse] = useState<string>(() => readHash().course);
  const [presences, setPresences] = useState<Record<string, Presence>>({});
  const [shared, setShared] = useState<Record<string, SharedField>>({});
  const [indexes, setIndexes] = useState<Record<string, Entity[]>>({});
  const [feed, setFeed] = useState<FeedItem[]>([]);
  /* the canonical store — every entity every app has ever written,
     whether or not its frame has ever mounted. The palette, the dossier
     and the rails read THIS; the index docs stay the thin mirror. */
  const [entities, setEntities] = useState<StoreEntity[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [unanswered, setUnanswered] = useState<string | null>(null); // mounted place that never said hello
  /* frames take seconds to boot a 1-2MB bundle — until iterra:hello lands
     the slot is a blank panel, so track which mounts are still waking and
     show that instead of nothing */
  const [booting, setBooting] = useState<Record<string, number>>({});
  /* per-src mount timestamps — a remount (nonce-nav, watchdog retry,
     intake relaunch) restarts the clock; the hello that clears booting
     must postdate the src that produced it (same rule the watchdog uses) */
  const mountAtRef = useRef<Record<string, number>>({});
  const srcSeenRef = useRef<Record<string, string>>({});
  /* visited places keep their iframes mounted (keep-alive) — the environment
     stays warm: state persists while wandering the terrain. */
  const [frames, setFrames] = useState<Record<string, string>>({});
  const framesRef = useRef<Record<string, string>>({});
  framesRef.current = frames;
  const [switcherOpen, setSwitcherOpen] = useState(false);
  /* queued sends parked in each app's intake — surfaced as 'N waiting'
     badges so a transfer that will deliver on next open isn't silent */
  const [intakes, setIntakes] = useState<Record<string, number>>({});
  const [cheatOpen, setCheatOpen] = useState(false);
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const helloRef = useRef<Record<string, number>>({});

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
    return subscribeStore(pull);
  }, []);

  /* ⌘K / ctrl+K or `/` opens the palette — shell chrome has no text inputs
     of its own so `/` is safe anywhere on the terrain or in chrome */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === '?' && !typing) {
        setCheatOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setCheatOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onHash = () => {
      const { place: id, course: ckey } = readHash();
      setActive(id);
      setCourse(ckey);
      /* mount at the deepest pending ?intake= when one exists — a bare
         mount drains the queue without ever landing on the result.url,
         so 'delivers when opened' would silently evaporate (e.g. a queued
         timer.start resolving to its bound autostart link). */
      if (id && !framesRef.current[id]) {
        firstPendingIntake(id).then((pid) => {
          setFrames((f) => (f[id] ? f : { ...f, [id]: pid ? `/apps/${id}/?intake=${pid}` : appUrl(id) }));
        });
      }
      /* keep-alive frames must refresh from the store on focus — wake
         the frame so its adapter re-reads instead of showing a stale view */
      if (id) {
        const el = iframeRefs.current[id];
        if (el) window.setTimeout(() => wakeFrame(el), 60);
        /* wake-pulse: re-entering an already-live frame flashes a sync dot
           in the chrome so 'it refreshed from the store' is visible, not
           assumed. helloRef means the frame answered once this session. */
        if (el && helloRef.current[id]) {
          setWoke(id);
          window.setTimeout(() => setWoke((w) => (w === id ? null : w)), 1600);
        }
      }
    };
    window.addEventListener('hashchange', onHash);
    onHash();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const place = active ? PLACE_MAP[active] : null;
    document.title = place
      ? `${place.app} · iterra`
      : course
        ? `${course} · iterra`
        : 'iterra — an integrated study terrain';
  }, [active, course]);

  /* environment navigation: apps post iterra:open with an /apps/<p>/ URL. */
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data;
      if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
      if (d.type === 'iterra:open' && typeof d.url === 'string') {
        // terrain hash routes address the shell itself (dossier, home)
        if (/^#\//.test(d.url)) {
          window.location.hash = d.url.slice(1);
          return;
        }
        const m = d.url.match(/^\/apps\/([a-z]+)(\/[^?#]*)?(\?[^#]*)?/);
        if (!m || !PLACE_MAP[m[1]]) {
          if (/^https?:/.test(d.url)) window.open(d.url, '_blank', 'noopener');
          return;
        }
        const [, id, p = '/', q = ''] = m;
        const url = `/apps/${id}${p}${q}`;
        if (!q && !framesRef.current[id]) {
          /* bare open onto a cold place with queued intakes — mount at the
             intake URL so the boot drain lands on result.url instead of
             evaporating it (same rule as hash entry). */
          firstPendingIntake(id).then((pid) => {
            setFrames((f) => (f[id] ? f : { ...f, [id]: pid ? `/apps/${id}/?intake=${pid}` : url }));
          });
        } else {
          setFrames((f) => {
            // identical src => React no-ops and the nav is lost; bust it with a
            // nonce the app ignores so a repeat link still re-navigates
            if (f[id] === url) {
              return { ...f, [id]: `${url}${q ? '&' : '?'}_inav=${Date.now()}` };
            }
            return { ...f, [id]: url };
          });
        }
        window.location.hash = `/p/${id}`;
      }
      if (d.type === 'iterra:hotkey' && typeof d.key === 'string') {
        // frame-forwarded terrain chords (hub yields to the app's own ⌘K)
        const k = d.key;
        if (k === 'k') { setSearchOpen((o) => !o); return; }
        if (k === '0' || k === '`') { goHome(); return; }
        const n = Number(k);
        if (n >= 1 && n <= PLACES.length) enter(PLACES[n - 1].id);
        return;
      }
      if (d.type === 'iterra:hello' && typeof d.app === 'string' && PLACE_MAP[d.app]) {
        const helloApp = d.app as string;
        helloRef.current[helloApp] = Date.now();
        setUnanswered((u) => (u === helloApp ? null : u));
        setBooting((b) => {
          if (!b[helloApp]) return b;
          const n = { ...b };
          delete n[helloApp];
          return n;
        });
        const raw = typeof d.url === 'string' ? d.url : '';
        // only trust hello urls that actually point at the claimed place
        const url = raw.startsWith(`/apps/${helloApp}`) ? raw : `/apps/${helloApp}/`;
        // which mounted frame spoke? if it migrated to another place
        // (in-frame nav that slipped the intercepts), heal the slot back.
        const slot = Object.entries(iframeRefs.current).find(([, el]) => el?.contentWindow === ev.source);
        if (slot && slot[0] !== helloApp) {
          const backId = slot[0];
          /* the vacated slot remounts its app fresh — if that app has queued
             intakes, boot it at ?intake=<id> so the drain lands on result.url. */
          firstPendingIntake(backId).then((pid) => {
            setFrames((f) => ({
              ...f,
              [helloApp]: url,
              [backId]: pid ? `/apps/${backId}/?intake=${pid}` : appUrl(backId),
            }));
          });
          window.location.hash = `/p/${helloApp}`;
        } else {
          setFrames((f) => (f[helloApp] ? f : { ...f, [helloApp]: url }));
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  /* visibilitychange wake — returning to the terrain's own tab re-reads
     the active frame from the store too, not just hash navigation. Every
     adapter answers iterra:wake; this makes 'came back to a stale view'
     impossible across all 8 places. */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible' || !active) return;
      const el = iframeRefs.current[active];
      if (el && helloRef.current[active]) {
        wakeFrame(el);
        setWoke(active);
        window.setTimeout(() => setWoke((w) => (w === active ? null : w)), 1600);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [active]);

  const enter = useCallback((id: string) => {
    window.location.hash = `/p/${id}`;
  }, []);

  const goHome = useCallback(() => {
    window.location.hash = '/';
  }, []);

  /* shared deep-link router — palette hits, feed items, commons lines all
     land here; mirrors the iterra:open message path */
  const goUrl = useCallback((url: string) => {
    if (url.startsWith('#')) {
      window.location.hash = url.slice(1);
      return;
    }
    const m = url.match(/^\/apps\/([a-z]+)(\/[^?#]*)?(\?[^#]*)?/);
    if (!m || !PLACE_MAP[m[1]]) return;
    const [, id, p = '/', q = ''] = m;
    const full = `/apps/${id}${p}${q}`;
    setFrames((f) => ({ ...f, [id]: f[id] === full ? `${full}${q ? '&' : '?'}_inav=${Date.now()}` : full }));
    window.location.hash = `/p/${id}`;
  }, []);

  /* ⌘1..8 jumps straight to a place (PLACES order), ⌘0/⌘` back to the
     terrain — iframe keystrokes never reach the shell, so these can't
     collide with an app's own shortcuts */
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
        e.preventDefault();
        enter(PLACES[n - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enter, goHome]);

  /* wake pulse — the sync dot shown while a warm frame re-reads the store */
  const [woke, setWoke] = useState<string | null>(null);

  /* a frame is 'booting' from the moment its src lands until that app's
     next iterra:hello postdates THIS src — cold first mounts and forced
     remounts both count, so the blank-panel window is always covered */
  useEffect(() => {
    const now = Date.now();
    const next: Record<string, number> = {};
    for (const [id, src] of Object.entries(frames)) {
      if (srcSeenRef.current[id] !== src) mountAtRef.current[id] = now;
      srcSeenRef.current[id] = src;
      if ((helloRef.current[id] || 0) < (mountAtRef.current[id] || 0)) next[id] = mountAtRef.current[id];
    }
    setBooting(next);
  }, [frames]);

  /* watchdog: a mounted frame should say iterra:hello within a few seconds;
     if it never does (dead dev server, 404, crashed app) surface a slim
     notice instead of showing a silent dead frame forever. The hello must
     postdate THIS mount — an older hello can't vouch for a fresh reload.
     An app that has answered before gets a longer grace: a mid-session
     remount (bound link, file-back) can keep the frame's main thread busy
     past the quick window without being dead — a false-positive banner on a
     live frame is worse than a slower warning on a truly dead one. */
  useEffect(() => {
    setUnanswered(null);
    if (!active || !frames[active]) return;
    const mountedAt = Date.now();
    const everAnswered = !!helloRef.current[active];
    const t = window.setTimeout(() => {
      if ((helloRef.current[active] || 0) < mountedAt) setUnanswered(active);
    }, everAnswered ? 20000 : 7000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, frames[active || '']]);

  /* auto-retry: the banner doesn't wait for a click the first time —
     it reloads the frame itself once per mount, then leaves the manual
     retry for a second failure. Tracked per frame-url so each fresh
     mount earns one auto-retry. */
  const autoRetried = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!unanswered || unanswered !== active) return;
    const mountSig = frames[unanswered] || '';
    if (autoRetried.current[unanswered] === mountSig) return;
    const t = window.setTimeout(() => {
      autoRetried.current[unanswered] = mountSig;
      setFrames((f) => ({ ...f, [unanswered]: `${appUrl(unanswered)}?_inav=${Date.now()}` }));
      setUnanswered(null);
    }, 2600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unanswered, active]);

  const activePlace = active ? PLACE_MAP[active] : null;
  const timerEntry = presences['timer'];
  const timerRunning =
    timerEntry && Date.now() - timerEntry.at < 35000 ? (timerEntry.summary as any)?.running : null;

  const chrome = useMemo(() => {
    if (!activePlace) return null;
    return (
      <div className="anim-fade flex h-12 shrink-0 items-center gap-3 border-b border-atlas-300 bg-atlas-50 px-3 sm:px-4">
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
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title="queued sends deliver on open">
                        {intakes[p.id]} waiting
                      </span>
                    ) : frames[p.id] ? (
                      <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-moss-500" title="warm — frame mounted" />
                    ) : null}
                  </button>
                ))}
                {/* linked — entities other apps hold on this place's
                    courses/topics (index.<app> matching on course/topic) */}
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
          <a
            href={frames[active] || appUrl(active)}
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-2 py-1 text-[12px] text-field-faint hover:bg-moss-100 hover:text-moss-700"
            title="Open this place on its own"
          >
            open solo ↗
          </a>
        </div>
      </div>
    );
  }, [active, activePlace, frames, switcherOpen, timerRunning, enter, goHome, goUrl, indexes]);

  return (
    <div className="flex h-full flex-col">
      {activePlace ? chrome : null}
      {/* frames stay mounted even on the terrain home — a running timer or
          half-written note must survive a trip back to the map */}
      <div
        className="relative flex-1 bg-atlas-200"
        style={{ display: activePlace ? 'block' : 'none' }}
      >
        {Object.entries(frames).map(([id, src]) => (
          <iframe
            key={id}
            ref={(el) => {
              iframeRefs.current[id] = el;
            }}
            src={src}
            title={PLACE_MAP[id]?.app || id}
            className="frame-fade absolute inset-0 h-full w-full border-0"
            style={{ display: id === active ? 'block' : 'none' }}
            allow={id === 'margin' ? 'clipboard-read; clipboard-write; microphone' : 'clipboard-read; clipboard-write'}
          />
        ))}
        {/* still waking — the frame is loading its bundle and hasn't said
            hello yet; once the watchdog fires, its banner takes over */}
        {active && booting[active] && unanswered !== active && (
          <div className="anim-rise pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-atlas-400 bg-atlas-50/90 px-3.5 py-1 text-[11px] text-field-faint shadow-sm">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-moss-500" />
            waking {PLACE_MAP[active]?.place?.toLowerCase() || active}…
          </div>
        )}
        {unanswered && unanswered === active && (
          <div className="anim-rise absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-atlas-400 bg-atlas-50/95 px-4 py-1.5 text-[12px] text-field-faint shadow-md">
            <span>
              <span className="font-medium text-field-ink">{PLACE_MAP[unanswered]?.place}</span> isn't answering
            </span>
            <button
              onClick={() =>
                setFrames((f) => ({ ...f, [unanswered]: `${appUrl(unanswered)}?_inav=${Date.now()}` }))
              }
              className="font-medium text-moss-700 hover:underline"
            >
              retry
            </button>
            <a
              href={frames[unanswered] || appUrl(unanswered)}
              target="_blank"
              rel="noreferrer"
              className="text-field-faint hover:text-moss-700 hover:underline"
            >
              open solo ↗
            </a>
          </div>
        )}
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
            <Terrain presences={presences} mounted={Object.keys(frames)} shared={shared} indexes={indexes} entities={entities} feed={feed} intakes={intakes} onEnter={enter} onGo={goUrl} />
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
      {/* the ambient rail — live environment state (running session,
          what's due, what's next, warm frames) floats over every
          surface, frames included */}
      <Ambient
        entities={entities}
        mounted={Object.keys(frames)}
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
