import { useEffect, useState } from 'react';
import { PLACES, PLACE_MAP } from './places';
import type { Presence, SharedField, FeedItem, Entity, StoreEntity } from './hub';
import { subscribeShelf, togglePin, type ShelfPin } from './shelf';

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

/* commons fields → a line of text; `by` tells which app wrote it.
   Fresh (<10min) writers render live; older ones are dimmed, very old hidden. */
const COMMONS_FRESH_MS = 10 * 60 * 1000;
const COMMONS_DEAD_MS = 60 * 60 * 1000;

function commonsLine(field: string, f: SharedField): { app: string; text: string } | null {
  const v = (f?.v || {}) as Record<string, any>;
  switch (field) {
    case 'focus':
      // tighter staleness than generic commons: a running session rewrites
      // every minute — >3m old means the instruments tab died mid-session
      return v.running && f.at && Date.now() - f.at < 3 * 60 * 1000
        ? { app: 'timer', text: `focus: ${v.label || 'in session'}${v.endsInMin != null ? ` · ${v.endsInMin}m left` : ''}` }
        : null;
    case 'today':
      return v.slips != null ? { app: 'syllabus', text: `${v.slips} slips · ${v.overdue || 0} late${v.next ? ` — next: ${v.next}` : ''}` } : null;
    case 'activeCourse':
      return v.code ? { app: 'syllabus', text: `course: ${v.code}${v.name ? ` ${v.name}` : ''}` } : null;
    case 'noteActive':
      return v.title ? { app: f.by, text: `editing ${f.by === 'ink' ? 'in ink' : 'in margin'}: ${v.title}` } : null;
    case 'deck':
      return v.deck ? { app: 'flashcards', text: `deck: ${v.deck}${v.due != null ? ` · ${v.due} due` : ''}` } : null;
    case 'session':
      return v.active ? { app: 'proof', text: `proof session${v.topic ? `: ${v.topic}` : ''}${v.minutes ? ` · ${v.minutes}m` : ''}` } : null;
    case 'register':
      return v.marked != null ? { app: 'rhythm', text: `${v.marked} marked${v.pending != null ? ` · ${v.pending} open` : ''}` } : null;
    case 'markbook':
      return v.assessment ? { app: 'gradestack', text: `${v.assessment}${v.scored != null ? ` · ${v.scored}/${v.total ?? '?'} scored` : ''}` } : null;
    default:
      return null;
  }
}

export function Terrain({
  presences,
  shared,
  indexes,
  entities,
  feed,
  onEnter,
  onGo,
}: {
  presences: Record<string, Presence>;
  shared: Record<string, SharedField>;
  indexes: Record<string, Entity[]>;
  entities: StoreEntity[];
  feed: FeedItem[];
  onEnter: (id: string) => void;
  onGo: (url: string) => void;
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
  const [pins, setPins] = useState<ShelfPin[]>([]);
  useEffect(() => subscribeShelf(setPins), []);

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
              {PLACES.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => onEnter(p.id)}
                  className="anim-card place-card group rounded-xl border border-atlas-300 bg-atlas-50/80 p-5 text-left shadow-[0_1px_0_rgba(34,48,42,0.05)] hover:border-moss-400 hover:shadow-[0_10px_30px_-12px_rgba(29,51,42,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-500"
                  style={{ animationDelay: `${i * 45}ms` }}
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
            {/* the ledger — due-counts aggregated across every place's
                presence summary (deck due, proofs due, late slips, pending
                marks); a place that owes nothing stays quiet */}
            {(() => {
              /* the ledger — every line carries a verb: review what's due,
                 attempt a problem, mark the register, open the slip. The
                 verbs read the canonical store, so the action is real even
                 when the owning app has never mounted this session. */
              const dueStore = (type: string) =>
                (entities || []).filter(
                  (e) => e.type === type && typeof (e.data?.dueAt as number) === 'number' && (e.data!.dueAt as number) <= Date.now(),
                );
              const storeDue = {
                cards: dueStore('card').length,
                commitments: (entities || []).filter(
                  (e) =>
                    e.type === 'commitment' &&
                    e.data &&
                    e.data.status !== 'done' &&
                    e.data.status !== 'completed' &&
                    typeof (e.data.dueAt as number) === 'number' &&
                    (e.data.dueAt as number) < Date.now(),
                ).length,
              };
              const owes: { app: string; text: string; stale: boolean; verb: string; url?: string }[] = [];
              const num = (x: unknown) => (typeof x === 'number' && x > 0 ? x : 0);
              const s = (app: string) => (presences[app]?.summary as any) || {};
              const stale = (app: string) => isStale(presences[app]);
              const cardDue = Math.max(num(s('flashcards').due), storeDue.cards);
              if (cardDue) owes.push({ app: 'flashcards', text: `${cardDue} cards due`, stale: stale('flashcards'), verb: 'review', url: '/apps/flashcards/' });
              if (num(s('proof').due)) owes.push({ app: 'proof', text: `${s('proof').due} proofs due`, stale: stale('proof'), verb: 'attempt', url: '/apps/proof/' });
              const slips = Math.max(num(s('syllabus').overdue), storeDue.commitments);
              if (slips) owes.push({ app: 'syllabus', text: `${slips} slips late`, stale: stale('syllabus'), verb: 'open', url: '/apps/syllabus/' });
              if (num(s('rhythm').pending)) owes.push({ app: 'rhythm', text: `${s('rhythm').pending} marks pending`, stale: stale('rhythm'), verb: 'mark', url: '/apps/rhythm/' });
              if (!owes.length) return null;
              return (
                <div className="anim-fade mb-3 rounded-lg border border-atlas-300 bg-atlas-50/70 p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-field-faint">
                    the ledger
                  </div>
                  <ul className="mt-2 space-y-1">
                    {owes.map((o) => (
                      <li key={o.app} className="flex items-baseline gap-2">
                        <button
                          onClick={() => (o.url ? onGo(o.url) : onEnter(o.app))}
                          className={`flex min-w-0 flex-1 items-baseline gap-2 text-left text-[13px] hover:text-moss-700 focus:outline-none ${
                            o.stale ? 'text-atlas-500' : 'text-field-faint'
                          }`}
                        >
                          <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-moss-700">
                            {PLACE_MAP[o.app]?.app || o.app}
                          </span>
                          <span className="min-w-0 flex-1">{o.text}</span>
                        </button>
                        <button
                          onClick={() => (o.url ? onGo(o.url) : onEnter(o.app))}
                          className="shrink-0 rounded-full border border-atlas-300 bg-atlas-50 px-2 py-0.5 text-[10.5px] font-medium text-moss-700 hover:bg-moss-50 focus:outline-none"
                        >
                          {o.verb} →
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            {/* the commons — fields every app writes into the shared doc */}
            {(() => {
              const lines = Object.entries(shared)
                .map(([field, f]) => {
                  if (!f?.at || Date.now() - f.at > COMMONS_DEAD_MS) return null;
                  const line = commonsLine(field, f);
                  if (!line) return null;
                  return { ...line, stale: Date.now() - f.at > COMMONS_FRESH_MS, at: f.at };
                })
                .filter((x): x is { app: string; text: string; stale: boolean; at: number } => !!x)
                .sort((a, b) => a.at - b.at || a.app.localeCompare(b.app));
              if (!lines.length) return null;
              return (
                <div className="anim-fade mb-3 rounded-lg border border-moss-300 bg-moss-50/60 p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-moss-700">
                    the commons
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {lines.map((l, i) => (
                      <li key={i}>
                        <button
                          onClick={() => onEnter(l.app)}
                          className={`flex w-full items-start gap-1.5 text-left text-[13px] hover:text-moss-700 focus:outline-none ${
                            l.stale ? 'text-atlas-500' : 'text-field-faint'
                          }`}
                        >
                          {!l.stale && (
                            <span className="live-dot mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-moss-600" />
                          )}
                          <span>{l.text}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            {/* the shelf — terrain-level pins from dossier rows */}
            {pins.length > 0 && (
              <div className="mb-3 rounded-lg border border-atlas-300 bg-atlas-50/70 p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-field-faint">
                  on the shelf
                </div>
                <ul className="mt-2 space-y-1">
                  {pins.slice(0, 6).map((p) => (
                    <li key={p.url} className="flex items-baseline gap-1.5">
                      <button
                        onClick={() => onGo(p.url)}
                        className="flex min-w-0 flex-1 items-baseline gap-2 text-left text-[13px] text-field-faint hover:text-moss-700 focus:outline-none"
                      >
                        <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-moss-700">
                          {PLACE_MAP[p.app]?.app || p.app}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{p.title}</span>
                      </button>
                      <button
                        onClick={() => togglePin(p)}
                        aria-label={`unpin ${p.title}`}
                        className="shrink-0 px-1 text-[11px] text-moss-700 hover:text-field-faint focus:outline-none"
                      >
                        ◈
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* desks — every course/topic key the terrain knows, one click
                into its dossier */}
            {(() => {
              const keys = new Map<string, string>();
              for (const list of Object.values(indexes || {})) {
                for (const e of list || []) {
                  const k = e?.course || e?.topic;
                  if (k && !keys.has(k.toLowerCase())) keys.set(k.toLowerCase(), k);
                }
              }
              if (!keys.size) return null;
              return (
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-atlas-500">
                    desks
                  </span>
                  {[...keys.values()].slice(0, 8).map((k) => (
                    <button
                      key={k}
                      onClick={() => onGo(`#/c/${encodeURIComponent(k)}`)}
                      className="rounded-full border border-atlas-300 bg-atlas-50 px-2.5 py-1 text-[11px] font-medium text-field-faint hover:border-moss-400 hover:text-moss-700 focus:outline-none"
                    >
                      {k}
                    </button>
                  ))}
                </div>
              );
            })()}
            {/* next up — the terrain's cross-app workflow: read syllabus's
                shared plan, offer one click into a bound timer session that
                files back to the folio when it completes */}
            {(() => {
              // a live focus session supersedes next-up: show what's running.
              // `at` refreshes every minute while endsInMin ticks — a write
              // older than ~3m means the instruments tab died mid-session
              const foc = shared.focus?.v as any;
              const focFresh = shared.focus?.at && Date.now() - shared.focus.at < 3 * 60 * 1000;
              if (foc?.running && focFresh) {
                return (
                  <div className="mb-3 rounded-lg border border-moss-400/70 bg-moss-50 p-3.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-moss-700">
                      in session
                    </span>
                    <p className="mt-1.5 text-[14px] font-medium leading-snug text-field-ink">
                      {foc.label || 'focus'}
                    </p>
                    <button
                      onClick={() => onGo('/apps/timer/')}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-moss-600 px-3 py-1.5 text-[12px] font-medium text-moss-800 hover:bg-moss-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-500"
                    >
                      {foc.endsInMin != null ? `${foc.endsInMin}m left · ` : ''}instruments →
                    </button>
                  </div>
                );
              }
              const t = shared.today?.v as any;
              const nb = t?.nextBlock || null;
              const title = nb?.title || t?.next || null;
              if (!title) {
                /* no folio plan — walk the ledger for the first due thing
                   that deep-links: a due deck → the cardfile, a due problem
                   → the workbench, pending marks → the register */
                const cands: { due: number; ent: any; cta: (n: number) => string }[] = [
                  { due: (presences['flashcards']?.summary as any)?.due || 0, ent: (indexes['flashcards'] || []).find((e) => e?.url), cta: (n) => `review ${n} card${n === 1 ? '' : 's'} →` },
                  { due: (presences['proof']?.summary as any)?.due || 0, ent: (indexes['proof'] || []).find((e) => e?.url), cta: () => 'attempt a due problem →' },
                  { due: (presences['rhythm']?.summary as any)?.pending || 0, ent: (indexes['rhythm'] || []).find((e) => e?.url), cta: (n) => `mark ${n} pending →` },
                ];
                const pick = cands.find((c) => c.due > 0 && c.ent);
                if (!pick) return null;
                return (
                  <div className="mb-3 rounded-lg border border-atlas-300 bg-atlas-50/70 p-3.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-field-faint">
                      due on the terrain
                    </span>
                    <p className="mt-1.5 text-[14px] font-medium leading-snug text-field-ink">{pick.ent.title}</p>
                    <button
                      onClick={() => onGo(pick.ent.url!)}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-moss-600 px-3 py-1.5 text-[12px] font-medium text-moss-800 hover:bg-moss-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-500"
                    >
                      {pick.cta(pick.due)}
                    </button>
                  </div>
                );
              }
              const mins = nb?.minutes || t?.suggestedMinutes || 25;
              const course = nb?.course || shared.activeCourse?.v?.code || '';
              const block = nb?.id || '';
              const url =
                `/apps/timer/?intent=${encodeURIComponent(title)}&minutes=${mins}` +
                `${course ? `&course=${encodeURIComponent(course)}` : ''}` +
                `&from=syllabus${block ? `&block=${encodeURIComponent(block)}` : ''}` +
                `&return=${encodeURIComponent('/apps/syllabus')}`;
              return (
                <div className="mb-3 rounded-lg border border-moss-400/70 bg-moss-50 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-moss-700">
                      next up
                    </span>
                    {course && (
                      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-field-faint">
                        {course}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[14px] font-medium leading-snug text-field-ink">{title}</p>
                  <div className="mt-2.5 flex items-center gap-3">
                    <button
                      onClick={() => onGo(url)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-moss-700 px-3 py-1.5 text-[12px] font-medium text-atlas-50 hover:bg-moss-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-500"
                    >
                      start {mins}m focus →
                    </button>
                    {block && (
                      <button
                        onClick={() => onGo(`/apps/syllabus/?block=${encodeURIComponent(block)}`)}
                        className="text-[12px] font-medium text-moss-700 hover:underline focus:outline-none"
                      >
                        open the slip
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
            {/* stirrings — the unified activity feed */}
            {feed.length > 0 && (
              <div className="mb-3 rounded-lg border border-atlas-300 bg-atlas-50/70 p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-field-faint">
                  stirrings
                </div>
                <ul className="mt-2 space-y-1.5">
                  {feed.filter((it) => !it.at || Date.now() - it.at < 12 * 60 * 60 * 1000).slice(0, 8).map((it, i) => {
                    const ago = Math.max(0, Date.now() - it.at);
                    const mins = Math.floor(ago / 60000);
                    const when = mins < 1 ? 'now' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`;
                    return (
                      <li key={`${it.at}-${i}`} className="anim-stir" style={{ animationDelay: `${Math.min(i, 7) * 26}ms` }}>
                        <button
                          onClick={() => (it.url ? onGo(it.url) : onEnter(it.app))}
                          className="flex w-full items-baseline gap-2 text-left text-[13px] text-field-faint hover:text-moss-700 focus:outline-none"
                        >
                          <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-moss-700">
                            {PLACE_MAP[it.app]?.app || it.app}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{it.text}</span>
                          <span className="shrink-0 text-[10px] text-atlas-500">{when}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
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
