import { useEffect, useState } from 'react';
import { PLACES } from './places';
import type { Presence } from './hub';

const DATE_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
/* presence heartbeats land ~every 10s; past ~3 missed beats the writer is
   gone (tab closed, frame dead) — show it dimmed, live-dots off */
const STALE_MS = 35000;
const isStale = (p: Presence | undefined) => !p || Date.now() - p.at > STALE_MS;

function StatusLine({ p, stale }: { p: Presence | undefined; stale: boolean }) {
  if (!p || !p.summary) return <span className="text-atlas-500 italic">quiet</span>;
  const s = p.summary as Record<string, any>;
  const dim = stale ? 'opacity-60' : '';
  if (s.running?.label) {
    return (
      <span className={`flex items-center gap-1.5 ${stale ? 'text-field-faint' : 'text-moss-700'} ${dim}`}>
        {!stale && <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-moss-600" />}
        {s.running.label}
      </span>
    );
  }
  if (s.top) return <span className={`text-field-faint ${dim}`}>next: {s.top}</span>;
  if (s.open) return <span className={`text-field-faint ${dim}`}>open: {s.open}</span>;
  if (s.last) return <span className={`text-field-faint ${dim}`}>last: {s.last}</span>;
  if (s.lastMark?.name) return <span className={`text-field-faint ${dim}`}>marked: {s.lastMark.name}</span>;
  if (s.due) return <span className={`text-field-faint ${dim}`}>{s.due} due</span>;
  if (s.marked != null && s.total != null) return <span className={`text-field-faint ${dim}`}>{s.marked}/{s.total} marked</span>;
  if (s.slips != null) return <span className={`text-field-faint ${dim}`}>{s.slips} slips today</span>;
  if (s.notes) return <span className={`text-field-faint ${dim}`}>{s.notes} notes</span>;
  return <span className="text-atlas-500 italic">quiet</span>;
}

export function Terrain({
  presences,
  onEnter,
}: {
  presences: Record<string, Presence>;
  onEnter: (id: string) => void;
}) {
  const today = new Date();
  // tick so stale-ness updates without waiting for a storage event
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setTick((t) => t + 1), STALE_MS / 2);
    return () => clearInterval(h);
  }, []);
  const timerEntry = presences['timer'];
  const timerRunning = isStale(timerEntry) ? null : (timerEntry?.summary as any)?.running;

  return (
    <div className="terrain-map min-h-full">
      {/* header */}
      <header className="mx-auto flex max-w-6xl items-baseline justify-between px-6 pt-8 sm:px-10">
        <div>
          <h1 className="font-place text-3xl tracking-[0.18em] text-moss-800 lowercase">iterra</h1>
          <p className="mt-1 text-[13px] tracking-wide text-field-faint">an integrated study terrain</p>
        </div>
        <div className="text-right">
          <p className="text-[13px] text-field-faint">{DATE_FMT.format(today)}</p>
          {timerRunning?.label && (
            <a
              href="#/p/timer"
              className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-moss-300 bg-moss-50 px-2.5 py-0.5 text-[12px] text-moss-700"
            >
              <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-moss-600" />
              {timerRunning.label}
              {timerRunning.endsInMin != null && ` · ${timerRunning.endsInMin}m`}
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16 pt-10 sm:px-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          {/* the places */}
          <section>
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-moss-700">
              the terrain
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {PLACES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onEnter(p.id)}
                  className="place-card group rounded-xl border border-atlas-300 bg-atlas-50/80 p-5 text-left shadow-[0_1px_0_rgba(34,48,42,0.05)] hover:border-moss-400 hover:shadow-[0_10px_30px_-12px_rgba(29,51,42,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-500"
                >
                  <div className="flex items-start justify-between">
                    <span className="block h-9 w-9 text-moss-700 transition-colors group-hover:text-moss-600">
                      {p.glyph}
                    </span>
                    <span className="mt-1 text-[11px] uppercase tracking-[0.14em] text-atlas-500 group-hover:text-moss-600">
                      enter →
                    </span>
                  </div>
                  <h3 className="font-place mt-3 text-lg leading-tight text-field-ink">{p.place}</h3>
                  <p className="mt-0.5 text-[12px] font-medium uppercase tracking-[0.1em] text-moss-700">{p.app}</p>
                  <p className="mt-2 text-[13px] leading-snug text-field-faint">{p.tagline}</p>
                  <div className="mt-3 border-t border-dashed border-atlas-300 pt-2.5 text-[12px]">
                    <StatusLine p={presences[p.id]} stale={isStale(presences[p.id])} />
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* today rail */}
          <aside>
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-moss-700">
              today across the terrain
            </h2>
            <div className="today-rail max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {PLACES.map((p) => {
                const pres = presences[p.id];
                const stale = isStale(pres);
                const items = stale ? [] : p.today(pres?.summary);
                return (
                  <button
                    key={p.id}
                    onClick={() => onEnter(p.id)}
                    className="block w-full rounded-lg border border-atlas-300 bg-atlas-50/70 p-3.5 text-left hover:border-moss-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-500"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-4 text-moss-700">{p.glyph}</span>
                      <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-field-ink">
                        {p.place}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {items.length ? (
                        items.map((it, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[13px] text-field-faint">
                            {it.live && (
                              <span className="live-dot mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-moss-600" />
                            )}
                            <span>{it.text}</span>
                          </li>
                        ))
                      ) : (
                        <li className="text-[12px] italic text-atlas-500">
                          {stale && pres ? 'last seen earlier' : 'nothing stirring'}
                        </li>
                      )}
                    </ul>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
