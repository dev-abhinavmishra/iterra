import { useCallback, useEffect, useMemo, useState } from 'react';
import { PLACES, PLACE_MAP } from './places';
import { subscribePresences, type Presence } from './hub';
import { Terrain } from './Terrain';

/* ── hash routing: '' → terrain, 'p/<place>' → place view ── */
function parseHash(): string {
  const h = window.location.hash.replace(/^#\/?/, '');
  const m = h.match(/^p\/([a-z]+)/);
  return m && PLACE_MAP[m[1]] ? m[1] : '';
}

function appUrl(place: string, path = '/'): string {
  return `/apps/${place}${path}`;
}

export default function App() {
  const [active, setActive] = useState<string>(() => parseHash());
  const [presences, setPresences] = useState<Record<string, Presence>>({});
  /* visited places keep their iframes mounted (keep-alive) — the environment
     stays warm: state persists while wandering the terrain. */
  const [frames, setFrames] = useState<Record<string, string>>({});
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});

  useEffect(() => subscribePresences(setPresences), []);

  useEffect(() => {
    const onHash = () => {
      const id = parseHash();
      setActive(id);
      if (id) setFrames((f) => (f[id] ? f : { ...f, [id]: appUrl(id) }));
    };
    window.addEventListener('hashchange', onHash);
    onHash();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const place = active ? PLACE_MAP[active] : null;
    document.title = place ? `${place.app} · iterra` : 'iterra — an integrated study terrain';
  }, [active]);

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
        setFrames((f) => ({ ...f, [id]: url }));
        window.location.hash = `/p/${id}`;
      }
      if (d.type === 'iterra:hello' && typeof d.app === 'string' && PLACE_MAP[d.app]) {
        const helloApp = d.app as string;
        const url = typeof d.url === 'string' ? d.url : `/apps/${helloApp}/`;
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

  const activePlace = active ? PLACE_MAP[active] : null;
  const timerRunning = (presences['timer']?.summary as any)?.running;

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
  }, [active, activePlace, frames, switcherOpen, timerRunning, enter, goHome]);

  return (
    <div className="flex h-full flex-col">
      {activePlace ? (
        <>
          {chrome}
          <div className="relative flex-1 bg-atlas-200">
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
          </div>
        </>
      ) : (
        <Terrain presences={presences} onEnter={enter} />
      )}
    </div>
  );
}
