import { useEffect, useState } from 'react';
import { PLACE_MAP } from './places';
import type { Entity, FeedItem, SharedField } from './hub';
import { subscribeShelf, togglePin, type ShelfPin } from './shelf';

/* course dossier — everything the terrain knows about one course/topic key:
   each app's entities that carry it, commons fields pointing at it, and the
   stirrings that mention it. The mesh read as one class's desk. */
export function Dossier({
  course,
  indexes,
  shared,
  feed,
  onGo,
  onEnter,
  onHome,
}: {
  course: string;
  indexes: Record<string, Entity[]>;
  shared: Record<string, SharedField>;
  feed: FeedItem[];
  onGo: (url: string) => void;
  onEnter: (place: string) => void;
  onHome: () => void;
}) {
  const key = course.toLowerCase();
  const [pins, setPins] = useState<ShelfPin[]>([]);
  useEffect(() => subscribeShelf(setPins), []);
  const pinnedUrls = new Set(pins.map((p) => p.url));
  const byApp = Object.entries(indexes)
    .map(([app, list]) => ({
      app,
      ents: (list || []).filter(
        (e) => e?.title && ((e.course || '').toLowerCase() === key || (e.topic || '').toLowerCase() === key),
      ),
    }))
    .filter((g) => g.ents.length > 0);
  const total = byApp.reduce((n, g) => n + g.ents.length, 0);
  const mentions = feed.filter((f) => f.text.toLowerCase().includes(key)).slice(0, 8);
  const nb = (shared.today?.v as any)?.nextBlock;
  const ac = (shared.activeCourse?.v as any);
  /* live focus: a running timer session files under this dossier when it
     carries the course key, or when its bound block's entity does. Commons
     entries older than the live window read as dead — ignore them. */
  const fv = (shared.focus?.v as any);
  const focusLive =
    fv?.running === true && Date.now() - (shared.focus?.at || 0) < 10 * 60 * 1000;
  const focusIds = new Set(byApp.flatMap((g) => g.ents.map((e) => e.id)));
  const focusMatch =
    focusLive &&
    ((fv.course && String(fv.course).toLowerCase() === key) || (fv.blockId && focusIds.has(fv.blockId)));
  const knownKeys = [...new Set(
    Object.values(indexes).flatMap((list) =>
      (list || []).flatMap((e) => [e.course, e.topic].filter(Boolean) as string[]),
    ),
  )].filter((k) => k.toLowerCase() !== key).slice(0, 6);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <button onClick={onHome} className="mb-6 text-[12px] text-field-faint hover:text-moss-700">
        ← terrain
      </button>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-moss-700">
        course dossier
      </div>
      <h1 className="mb-2 text-[26px] font-semibold tracking-tight text-field-ink">{course}</h1>
      <p className="mb-8 text-[13px] text-field-faint">
        {total === 0
          ? 'nothing on the terrain carries this key yet'
          : `${total} ${total === 1 ? 'thing' : 'things'} across ${byApp.length} ${byApp.length === 1 ? 'place' : 'places'}`}
      </p>
      {total === 0 && knownKeys.length > 0 && (
        <div className="mb-8 flex flex-wrap items-baseline gap-1.5 text-[12px] text-field-faint">
          <span>the terrain does know:</span>
          {knownKeys.map((k) => (
            <button
              key={k}
              onClick={() => onGo(`#/c/${encodeURIComponent(k)}`)}
              className="rounded-full border border-atlas-300 px-2.5 py-0.5 text-[11px] text-moss-700 hover:bg-moss-50"
            >
              {k}
            </button>
          ))}
        </div>
      )}

      {(nb?.course && String(nb.course).toLowerCase() === key) || (ac && String(ac.code || ac).toLowerCase() === key) || focusMatch ? (
        <div className="mb-6 rounded-lg border border-moss-400/70 bg-moss-50 p-3.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-moss-700">live in the commons</div>
          {focusMatch && (
            <button
              onClick={() => onGo('/apps/timer/')}
              className="mt-1.5 block text-[13px] font-medium text-moss-700 hover:underline"
            >
              focus: {fv.label || 'Focus'} · {typeof fv.endsInMin === 'number' ? `${fv.endsInMin}m left` : 'running'}
            </button>
          )}
          {nb?.course && String(nb.course).toLowerCase() === key && nb?.title && (
            <div className="mt-1.5 text-[13px] text-field-ink">
              next up: {nb.title}
              {nb.minutes ? ` · ${nb.minutes}m` : ''}
            </div>
          )}
          {ac && (
            <div className="mt-1 text-[12px] text-field-faint">
              the folio's active course is {typeof ac === 'object' ? ac.name || ac.code : ac}
            </div>
          )}
        </div>
      ) : null}

      {byApp.map(({ app, ents }) => (
        <section key={app} className="mb-6">
          <button
            onClick={() => onEnter(app)}
            className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-moss-700 hover:underline"
          >
            {PLACE_MAP[app]?.app || app}
            <span className="font-normal normal-case tracking-normal text-field-faint">
              · {PLACE_MAP[app]?.place} · {ents.length}
            </span>
          </button>
          <ul className="overflow-hidden rounded-lg border border-atlas-300 bg-atlas-50">
            {ents.map((e, i) => (
              <li key={`${e.id}-${i}`} className={i ? 'border-t border-atlas-200' : ''}>
                <div className="flex w-full items-center hover:bg-moss-50">
                  <button
                    onClick={() => onGo(e.url || `/apps/${app}/`)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-field-ink">{e.title}</span>
                      {(e.sub || e.t) && (
                        <span className="block truncate text-[11px] text-atlas-500">
                          {[e.t, e.sub].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      togglePin({ app, t: e.t, id: e.id, title: e.title || '(untitled)', url: e.url || `/apps/${app}/` })
                    }
                    aria-label={pinnedUrls.has(e.url || `/apps/${app}/`) ? `unpin ${e.title}` : `pin ${e.title} to the shelf`}
                    title={pinnedUrls.has(e.url || `/apps/${app}/`) ? 'on the shelf — click to unpin' : 'pin to the shelf'}
                    className={`shrink-0 px-3 py-2.5 text-[12px] focus:outline-none ${
                      pinnedUrls.has(e.url || `/apps/${app}/`) ? 'text-moss-700' : 'text-atlas-400 hover:text-moss-700'
                    }`}
                  >
                    {pinnedUrls.has(e.url || `/apps/${app}/`) ? '◈' : '◇'}
                  </button>
                  <button
                    onClick={() => onGo(e.url || `/apps/${app}/`)}
                    className="shrink-0 px-3 py-2.5 text-[11px] text-atlas-500 hover:text-moss-700"
                  >
                    →
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {mentions.length > 0 && (
        <section>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-atlas-500">
            stirrings that mention it
          </div>
          <ul className="overflow-hidden rounded-lg border border-atlas-300 bg-atlas-50">
            {mentions.map((f, i) => (
              <li key={`${f.at}-${i}`} className={i ? 'border-t border-atlas-200' : ''}>
                <button
                  onClick={() => (f.url ? onGo(f.url) : onEnter(f.app))}
                  className="flex w-full items-baseline gap-3 px-4 py-2 text-left hover:bg-moss-50"
                >
                  <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-moss-700">
                    {PLACE_MAP[f.app]?.app || f.app}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-field-ink">{f.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
