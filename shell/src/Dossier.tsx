import { useEffect, useMemo, useState } from 'react';
import { PLACE_MAP } from './places';
import type { Entity, FeedItem, SharedField, StoreEntity } from './hub';
import { sendTo } from './hub';
import { subscribeShelf, togglePin, type ShelfPin } from './shelf';

/* course dossier — everything the terrain knows about one course/topic key:
   each app's entities that carry it, commons fields pointing at it, and the
   stirrings that mention it. The mesh read as one class's desk. */
export function Dossier({
  course,
  indexes,
  entities,
  shared,
  feed,
  onGo,
  onEnter,
  onHome,
}: {
  course: string;
  indexes: Record<string, Entity[]>;
  entities: StoreEntity[];
  shared: Record<string, SharedField>;
  feed: FeedItem[];
  onGo: (url: string) => void;
  onEnter: (place: string) => void;
  onHome: () => void;
}) {
  const key = course.toLowerCase();
  /* 'unfiled' is a sentinel dossier: every entity with no course AND no
     topic lands here — notes that can't file under a class still group. */
  const unfiled = key === 'unfiled';

  /* the canonical course entity — the registry id everything else files
     under. Resolved by code (the dossier key IS the code) or by the
     courseId every store entity carries. */
  const courseEnt = useMemo(
    () =>
      (entities || []).find(
        (e) =>
          e.type === 'course' &&
          ((e.data?.code as string) || e.course || e.title || '').toLowerCase() === key,
      ) || null,
    [entities, key],
  );
  const courseId = courseEnt?.key;
  /* everything the store files under this course — mounted or not */
  const courseEnts = useMemo(
    () =>
      (entities || []).filter(
        (e) =>
          (courseId && e.courseId === courseId) ||
          (!unfiled && (e.course || '').toLowerCase() === key) ||
          (unfiled && !e.courseId && !e.course && !e.topic),
      ),
    [entities, courseId, key, unfiled],
  );
  /* actionable dossier — the four verbs: start a session, review what's
     due, open the next assignment, see the grade state. All from the
     canonical store, no app needs to be mounted. */
  const dueCards = courseEnts.filter(
    (e) => e.type === 'card' && typeof (e.data?.dueAt as number) === 'number' && (e.data!.dueAt as number) <= Date.now(),
  );
  const nextCommit = courseEnts
    .filter((e) => e.type === 'commitment' && e.data && e.data.status !== 'done' && e.data.status !== 'completed')
    .sort((a, b) => ((a.data?.dueAt as number) || Infinity) - ((b.data?.dueAt as number) || Infinity))[0];
  const sessions = courseEnts.filter((e) => e.type === 'session');
  const sessionMins = sessions.reduce((n, e) => n + ((e.data?.minutes as number) || 0), 0);
  const grades = courseEnts.filter((e) => e.type === 'grade');
  const [sent, setSent] = useState<string | null>(null);
  const startSession = async () => {
    const r = await sendTo({
      to: 'timer',
      action: 'timer.start',
      payload: {
        label: nextCommit?.title || `drill ${course}`,
        minutes: (nextCommit?.data?.estimatedMinutes as number) || 25,
        commitmentId: nextCommit?.id,
        courseId,
        course,
      },
    });
    if (r.url) { onGo(r.url); return; }
    setSent(r.ok ? 'session queued for the instruments' : `couldn't start — ${r.error || 'no hub'}`);
    window.setTimeout(() => setSent(null), 4000);
  };
  const [pins, setPins] = useState<ShelfPin[]>([]);
  useEffect(() => subscribeShelf(setPins), []);
  const pinnedUrls = new Set(pins.map((p) => p.url));
  /* rows come from the canonical store first (mounted or not), with the
     index mirror folded in for writers that haven't migrated */
  const byApp = useMemo(() => {
    const seen = new Set<string>();
    const groups = new Map<string, Entity[]>();
    const push = (app: string, e: Entity) => {
      const sig = `${e.url || ''}|${e.title}|${e.id || ''}`;
      if (seen.has(sig)) return;
      seen.add(sig);
      if (!groups.has(app)) groups.set(app, []);
      groups.get(app)!.push(e);
    };
    for (const e of courseEnts) {
      if (!e.title) continue;
      push(e.app, { t: e.type, id: e.id, title: e.title, sub: e.sub, course: e.course, topic: e.topic, url: e.url });
    }
    for (const [app, list] of Object.entries(indexes)) {
      for (const e of list || []) {
        if (!e?.title) continue;
        const files = unfiled
          ? !e.course && !e.topic
          : (e.course || '').toLowerCase() === key || (e.topic || '').toLowerCase() === key;
        if (files) push(app, e);
      }
    }
    return [...groups.entries()].map(([app, ents]) => ({ app, ents }));
  }, [courseEnts, indexes, key, unfiled]);
  const total = byApp.reduce((n, g) => n + g.ents.length, 0);
  /* stirs that mention the key — word-boundary on the text so 'mth' doesn't
     match 'smith', plus url resolution: a stir linking an entity that files
     here counts even when its text never spells the key ('slip stamped:
     ps4 problem set' → /apps/syllabus/?block=… → that block's course). */
  const keyRe = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  const urlKeys = new Map<string, string>();
  for (const g of byApp) for (const e of g.ents) if (e.url) urlKeys.set(e.url, key);
  const mentions = feed
    .filter(
      (f) =>
        (unfiled
          ? false
          : keyRe.test(f.text) ||
            (f.course || '').toLowerCase() === key ||
            (f.topic || '').toLowerCase() === key) ||
        (f.url ? urlKeys.has(f.url) : false),
    )
    .slice(0, 8);
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
        {unfiled ? 'the unfiled' : 'course dossier'}
      </div>
      <div className="mb-2 flex items-baseline gap-2">
        <h1 className="text-[26px] font-semibold tracking-tight text-field-ink">{unfiled ? 'unfiled' : course}</h1>
        <button
          onClick={() => togglePin({ app: 'terrain', title: `${course} desk`, url: `#/c/${encodeURIComponent(course)}` })}
          title={pinnedUrls.has(`#/c/${encodeURIComponent(course)}`) ? 'unpin this desk' : 'pin this desk to the shelf'}
          className={`text-[15px] leading-none focus:outline-none ${
            pinnedUrls.has(`#/c/${encodeURIComponent(course)}`) ? 'text-moss-700' : 'text-atlas-400 hover:text-moss-700'
          }`}
          aria-label="pin desk"
        >
          {pinnedUrls.has(`#/c/${encodeURIComponent(course)}`) ? '◈' : '◇'}
        </button>
      </div>
      <p className="mb-4 text-[13px] text-field-faint">
        {total === 0
          ? (unfiled ? 'everything on the terrain is filed under a key' : 'nothing on the terrain carries this key yet')
          : `${total} ${total === 1 ? 'thing' : 'things'} across ${byApp.length} ${byApp.length === 1 ? 'place' : 'places'}`}
      </p>
      {/* the actionable dossier — one desk, four verbs, no app-hopping.
          Every verb reads the canonical store, so it works even when the
          owning app has never been mounted this session. */}
      {!unfiled && (
        <div className="mb-8 rounded-lg border border-moss-400/70 bg-moss-50/70 p-3.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-moss-700">
            the desk — {course}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={startSession}
              className="rounded-md bg-moss-700 px-3 py-1.5 text-[12px] font-medium text-atlas-50 hover:bg-moss-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-500"
            >
              start a session →
            </button>
            {dueCards.length > 0 && (
              <button
                onClick={() => onGo('/apps/flashcards/')}
                className="rounded-md border border-moss-400/70 bg-atlas-50 px-3 py-1.5 text-[12px] font-medium text-moss-700 hover:bg-moss-50"
              >
                review {dueCards.length} due card{dueCards.length === 1 ? '' : 's'} →
              </button>
            )}
            {nextCommit && (
              <button
                onClick={() => onGo(nextCommit.url || '/apps/syllabus/')}
                className="rounded-md border border-atlas-300 bg-atlas-50 px-3 py-1.5 text-[12px] font-medium text-field-faint hover:border-moss-400 hover:text-moss-700"
              >
                next: {nextCommit.title} →
              </button>
            )}
            <span className="text-[11.5px] text-atlas-500">
              {[
                sessionMins > 0 ? `${sessionMins}m logged` : null,
                grades.length ? `${grades.length} grade${grades.length === 1 ? '' : 's'} on the book` : null,
                sessions.length && !sessionMins ? `${sessions.length} sessions` : null,
              ].filter(Boolean).join(' · ') || (courseId ? 'registered on the folio' : 'no folio entry yet')}
            </span>
          </div>
          {sent && <div className="anim-fade mt-2 text-[11.5px] text-moss-700">{sent}</div>}
        </div>
      )}
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
