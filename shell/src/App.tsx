import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PLACES, PLACE_MAP } from './places';
import { subscribePresences, subscribeShared, subscribeIndexes, subscribeFeed, type Presence, type SharedField, type Entity, type FeedItem } from './hub';
import { Terrain } from './Terrain';
import { Search } from './Search';
import { Dossier } from './Dossier';

/* ── hash routing: '' → terrain, 'p/<place>' → place view,
   'c/<key>' → course dossier ── */
function parseHash(): { place: string; course: string } {
  const h = window.location.hash.replace(/^#\/?/, '');
  const c = h.match(/^c\/([^?#]+)/);
  if (c) return { place: '', course: decodeURIComponent(c[1]) };
  const m = h.match(/^p\/([a-z]+)/);
  return { place: m && PLACE_MAP[m[1]] ? m[1] : '', course: '' };
}

function appUrl(place: string, path = '/'): string {
  return `/apps/${place}${path}`;
}

export default function App() {
  const [active, setActive] = useState<string>(() => parseHash().place);
  const [course, setCourse] = useState<string>(() => parseHash().course);
  const [presences, setPresences] = useState<Record<string, Presence>>({});
  const [shared, setShared] = useState<Record<string, SharedField>>({});
  const [indexes, setIndexes] = useState<Record<string, Entity[]>>({});
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [unanswered, setUnanswered] = useState<string | null>(null); // mounted place that never said hello
  /* visited places keep their iframes mounted (keep-alive) — the environment
     stays warm: state persists while wandering the terrain. */
  const [frames, setFrames] = useState<Record<string, string>>({});
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const helloRef = useRef<Record<string, number>>({});

  useEffect(() => subscribePresences(setPresences), []);
  useEffect(() => subscribeShared(setShared), []);
  useEffect(() => subscribeIndexes(setIndexes), []);
  useEffect(() => subscribeFeed(setFeed), []);

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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onHash = () => {
      const { place: id, course: ckey } = parseHash();
      setActive(id);
      setCourse(ckey);
      if (id) setFrames((f) => (f[id] ? f : { ...f, [id]: appUrl(id) }));
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
        const m = d.url.match(/^\/apps\/([a-z]+)(\/[^?#]*)?(\?[^#]*)?/);
        if (!m || !PLACE_MAP[m[1]]) {
          if (/^https?:/.test(d.url)) window.open(d.url, '_blank', 'noopener');
          return;
        }
        const [, id, p = '/', q = ''] = m;
        const url = `/apps/${id}${p}${q}`;
        setFrames((f) => {
          // identical src => React no-ops and the nav is lost; bust it with a
          // nonce the app ignores so a repeat link still re-navigates
          if (f[id] === url) {
            return { ...f, [id]: `${url}${q ? '&' : '?'}_inav=${Date.now()}` };
          }
          return { ...f, [id]: url };
        });
        window.location.hash = `/p/${id}`;
      }
      if (d.type === 'iterra:hello' && typeof d.app === 'string' && PLACE_MAP[d.app]) {
        const helloApp = d.app as string;
        helloRef.current[helloApp] = Date.now();
        setUnanswered((u) => (u === helloApp ? null : u));
        const raw = typeof d.url === 'string' ? d.url : '';
        // only trust hello urls that actually point at the claimed place
        const url = raw.startsWith(`/apps/${helloApp}`) ? raw : `/apps/${helloApp}/`;
        // which mounted frame spoke? if it migrated to another place
        // (in-frame nav that slipped the intercepts), heal the slot back.
        const slot = Object.entries(iframeRefs.current).find(([, el]) => el?.contentWindow === ev.source);
        if (slot && slot[0] !== helloApp) {
          setFrames((f) => ({ ...f, [helloApp]: url, [slot[0]]: appUrl(slot[0]) }));
          window.location.hash = `/p/${helloApp}`;
        } else {
          setFrames((f) => (f[helloApp] ? f : { ...f, [helloApp]: url }));
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

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

  /* watchdog: a mounted frame should say iterra:hello within a few seconds;
     if it never does (dead dev server, 404, crashed app) surface a slim
     notice instead of showing a silent dead frame forever. The hello must
     postdate THIS mount — an older hello can't vouch for a fresh reload. */
  useEffect(() => {
    setUnanswered(null);
    if (!active || !frames[active]) return;
    const mountedAt = Date.now();
    const t = window.setTimeout(() => {
      if ((helloRef.current[active] || 0) < mountedAt) setUnanswered(active);
    }, 7000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, frames[active || '']]);

  const activePlace = active ? PLACE_MAP[active] : null;
  const timerEntry = presences['timer'];
  const timerRunning =
    timerEntry && Date.now() - timerEntry.at < 35000 ? (timerEntry.summary as any)?.running : null;

  const chrome = useMemo(() => {
    if (!activePlace) return null;
    return (
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-atlas-300 bg-atlas-50 px-3 sm:px-4">
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
              <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-lg border border-atlas-300 bg-atlas-50 p-1.5 shadow-[0_16px_40px_-16px_rgba(29,51,42,0.4)]">
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
            className="absolute inset-0 h-full w-full border-0"
            style={{ display: id === active ? 'block' : 'none' }}
            allow="clipboard-read; clipboard-write"
          />
        ))}
        {unanswered && unanswered === active && (
          <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-atlas-400 bg-atlas-50/95 px-4 py-1.5 text-[12px] text-field-faint shadow-md">
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
              shared={shared}
              feed={feed}
              onGo={goUrl}
              onEnter={enter}
              onHome={goHome}
            />
          ) : (
            <Terrain presences={presences} shared={shared} indexes={indexes} feed={feed} onEnter={enter} onGo={goUrl} />
          )}
        </div>
      ) : null}
      <Search
        indexes={indexes}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onGo={goUrl}
      />
    </div>
  );
}
