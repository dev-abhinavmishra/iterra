import { useEffect, useMemo, useRef, useState } from 'react';
import { Search as SearchIcon, ArrowUpRight, Share2, Terminal, BookOpen } from 'lucide-react';
import { PLACES, PLACE_MAP, formatEntityType } from './places';
import type { Entity, StoreEntity } from './hub';
import { sendTo, readFeed, subscribeFeed, type FeedItem } from './hub';
import { subscribeShelf, togglePin, type ShelfPin } from './shelf';
import { iconForObjectType } from './ui/ObjectRow';

interface Hit {
  app: string;
  label: string;
  sub: string;
  url: string;
  kind: 'command' | 'course' | 'entity' | 'place' | 'stir';
  key?: string;
  uat?: number;
  skey?: string;
  stype?: string;
  entity?: StoreEntity;
  run?: () => void;
}

const SEND_TARGETS: { to: string; action: string; label: string; payload?: Record<string, unknown> }[] = [
  { to: 'flashcards', action: 'cards.create', label: 'Flashcards — new card' },
  { to: 'margin', action: 'note.create', label: 'Study Materials — new document' },
  { to: 'ink', action: 'note.create', label: 'Notes — new page' },
  { to: 'proof', action: 'step.append', label: 'Calculations — append step' },
  /* the intake contract requires kind — without it the register used to
     fabricate a bare session.completed mark with no label at all */
  { to: 'rhythm', action: 'log.activity', label: 'Attendance — log activity', payload: { kind: 'session' } },
  { to: 'timer', action: 'timer.start', label: 'Timer — 25m focus session' },
];

export function Search({
  indexes,
  entities,
  open,
  onClose,
  onGo,
  onToggleTheme,
  onToggleContext,
}: {
  indexes: Record<string, Entity[]>;
  entities: StoreEntity[];
  open: boolean;
  onClose: () => void;
  onGo: (url: string) => void;
  onToggleTheme?: () => void;
  onToggleContext?: () => void;
}) {
  const [feed, setFeed] = useState<FeedItem[]>(() => readFeed());
  useEffect(() => subscribeFeed(setFeed), []);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [pins, setPins] = useState<ShelfPin[]>([]);
  useEffect(() => subscribeShelf(setPins), []);

  const [sendForKey, setSendForKey] = useState<string | null>(null);
  const hitId = (h: Hit) => h.skey || h.url || h.label;
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [staged, setStaged] = useState<Hit[]>([]);

  const pinned = useMemo(() => {
    const s = new Set<string>();
    for (const p of pins) {
      s.add(p.url);
      const m = p.url.match(/^\/apps\/([a-z]+)\/?$/);
      if (m) s.add(`#/p/${m[1]}`);
    }
    return s;
  }, [pins]);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setSendForKey(null);
      setStaged([]);
      setSentNote(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();

    const commands: Hit[] = [
      {
        app: 'timer',
        kind: 'command',
        label: 'Start 25-minute focus session',
        sub: 'Command · Timer',
        url: '#/p/timer',
        run: () => {
          void sendTo({
            to: 'timer',
            action: 'timer.start',
            payload: { label: 'Focus session', minutes: 25, from: 'palette' },
          }).then((r) => onGo(r.url || '#/p/timer'));
        },
      },
      {
        app: 'ink',
        kind: 'command',
        label: 'Create new note in Notes',
        sub: 'Command · Notes',
        url: '#/p/ink',
      },
      {
        app: 'flashcards',
        kind: 'command',
        label: 'Create or import flashcard deck',
        sub: 'Command · Flashcards',
        url: '#/p/flashcards',
      },
      {
        app: 'margin',
        kind: 'command',
        label: 'Import study material or record lecture',
        sub: 'Command · Study Materials',
        url: '#/p/margin',
      },
      {
        app: 'syllabus',
        kind: 'command',
        label: 'Plan today’s study blocks',
        sub: 'Command · Planning',
        url: '#/p/syllabus',
      },
      {
        app: 'terrain',
        kind: 'command',
        label: 'Browse the Library — every object in one place',
        sub: 'Command · Workspace',
        url: '#/library',
      },
      {
        app: 'terrain',
        kind: 'command',
        label: 'Open Courses — every course dossier',
        sub: 'Command · Workspace',
        url: '#/courses',
      },
      {
        app: 'terrain',
        kind: 'command',
        label: 'Open Today — the day’s plan and stirs',
        sub: 'Command · Workspace',
        url: '#/',
      },
      {
        app: 'terrain',
        kind: 'command',
        label: 'Workspace settings — backup, restore, storage',
        sub: 'Command · Workspace',
        url: '#/settings',
      },
      ...(onToggleContext
        ? [
            {
              app: 'terrain',
              kind: 'command' as const,
              label: 'Toggle details panel',
              sub: 'Command · Workspace',
              url: '#/',
              run: () => onToggleContext(),
            },
          ]
        : []),
      ...(onToggleTheme
        ? [
            {
              app: 'terrain',
              kind: 'command' as const,
              label: 'Switch workspace theme (Paper / Graphite)',
              sub: 'Command · Appearance',
              url: '#/',
              run: () => onToggleTheme(),
            },
          ]
        : []),
    ];

    const places: Hit[] = PLACES.map((p) => ({
      app: p.id,
      kind: 'place',
      label: p.label,
      sub: `${p.place} — ${p.shortDesc}`,
      url: `#/p/${p.id}`,
    }));

    // Courses
    const courseSet = new Map<string, { code: string; name?: string }>();
    for (const e of entities || []) {
      if (e.type === 'course') {
        const code = (e.data?.code as string) || e.course || e.title || '';
        if (code) courseSet.set(code.toLowerCase(), { code, name: e.title !== code ? e.title : undefined });
      } else if (e.course && !courseSet.has(e.course.toLowerCase())) {
        courseSet.set(e.course.toLowerCase(), { code: e.course });
      }
    }
    const courseHits: Hit[] = [...courseSet.values()].map((c) => ({
      app: 'syllabus',
      kind: 'course',
      label: `${c.code}${c.name ? ` — ${c.name}` : ''}`,
      sub: 'Course Workspace',
      url: `#/c/${encodeURIComponent(c.code)}`,
      key: c.code,
    }));

    const ents: Hit[] = [];
    const seen = new Set<string>();
    for (const e of entities || []) {
      if (!e?.title || e.type === 'course') continue;
      const sig = `${e.url || ''}|${e.title}`;
      seen.add(sig);
      ents.push({
        app: e.app,
        kind: 'entity',
        label: e.title,
        sub: [formatEntityType(e.type), PLACE_MAP[e.app]?.label || e.app, e.sub, e.course, e.topic]
          .filter(Boolean)
          .join(' · '),
        url: e.url || `#/p/${e.app}`,
        key: e.course || e.topic || undefined,
        uat: e.updatedAt || 0,
        skey: e.key,
        stype: e.type,
        entity: e,
      });
    }

    for (const [app, list] of Object.entries(indexes)) {
      for (const e of list || []) {
        if (!e?.title) continue;
        if (seen.has(`${e.url || ''}|${e.title}`)) continue;
        ents.push({
          app,
          kind: 'entity',
          label: e.title,
          sub: [formatEntityType(e.t), PLACE_MAP[app]?.label || app, e.sub, e.course, e.topic]
            .filter(Boolean)
            .join(' · '),
          url: e.url || `#/p/${app}`,
          key: e.course || e.topic || undefined,
          stype: e.t,
        });
      }
    }

    const stirs: Hit[] = needle
      ? feed.map((f) => ({
          app: f.app,
          kind: 'stir' as const,
          label: f.text,
          sub: `Activity · ${PLACE_MAP[f.app]?.label || f.app}`,
          url: f.url || `#/p/${f.app}`,
          /* feed items carry `at` — fresher stirs rank above same-rank hits */
          uat: f.at || 0,
        }))
      : [];

    if (!needle) {
      const recent = ents.filter((e) => e.uat).sort((a, b) => (b.uat || 0) - (a.uat || 0));
      const rest = ents.filter((e) => !recent.includes(e));
      return [...commands.slice(0, 4), ...courseHits, ...places, ...recent, ...rest].slice(0, 64);
    }

    const all = [...commands, ...courseHits, ...places, ...ents, ...stirs];
    const rank = (h: Hit) => {
      const l = h.label.toLowerCase();
      const s = h.sub.toLowerCase();
      if (l.startsWith(needle)) return 0;
      if (l.includes(needle)) return 1;
      if (s.includes(needle)) return 2;
      if (h.app.includes(needle)) return 3;
      return 9;
    };
    return all
      .map((h) => ({ h, r: rank(h) }))
      .filter((x) => x.r < 9)
      /* same rank → most recently touched wins; alphabetical last */
      .sort((a, b) => a.r - b.r || (b.h.uat || 0) - (a.h.uat || 0) || a.h.label.localeCompare(b.h.label))
      .map((x) => x.h);
  }, [q, indexes, entities, feed, onGo, onToggleContext, onToggleTheme]);

  const groups = useMemo<{ header: string | null; items: { h: Hit; i: number }[] }[]>(() => {
    if (q.trim()) return [{ header: null, items: hits.map((h, i) => ({ h, i })) }];
    const commands = hits.filter((h) => h.kind === 'command');
    const courses = hits.filter((h) => h.kind === 'course');
    const places = hits.filter((h) => h.kind === 'place');
    const nonPlaces = hits.filter((h) => h.kind === 'entity');
    const recentIdx = new Set(
      nonPlaces
        .filter((h) => h.uat)
        .sort((a, b) => (b.uat || 0) - (a.uat || 0))
        .slice(0, 8)
        .map((h) => hits.indexOf(h)),
    );
    const byKey = new Map<string, { label: string; items: { h: Hit; i: number }[] }>();
    const loose: { h: Hit; i: number }[] = [];
    const recent: { h: Hit; i: number }[] = [];
    hits.forEach((h, i) => {
      if (h.kind !== 'entity') return;
      if (recentIdx.has(i)) {
        recent.push({ h, i });
        return;
      }
      const key = (h.key || '').toLowerCase();
      if (!key) {
        loose.push({ h, i });
        return;
      }
      if (!byKey.has(key)) byKey.set(key, { label: h.key!, items: [] });
      byKey.get(key)!.items.push({ h, i });
    });

    const out: { header: string | null; items: { h: Hit; i: number }[] }[] = [];
    if (recent.length) out.push({ header: 'Recent Work', items: recent });
    if (commands.length) out.push({ header: 'Quick Actions', items: commands.map((h) => ({ h, i: hits.indexOf(h) })) });
    if (courses.length) out.push({ header: 'Course Workspaces', items: courses.map((h) => ({ h, i: hits.indexOf(h) })) });
    out.push({ header: 'Tools', items: places.map((h) => ({ h, i: hits.indexOf(h) })) });
    for (const g of byKey.values()) out.push({ header: g.label, items: g.items });
    if (loose.length) out.push({ header: 'Unfiled', items: loose });
    return out;
  }, [hits, q]);

  useEffect(() => setSel(0), [hits.length]);

  const sendHit = useMemo(() => {
    if (!sendForKey) return null;
    return hits.find((h) => hitId(h) === sendForKey) || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendForKey, hits]);

  const [blinks, setBlinks] = useState<{ key: string; title: string; url?: string }[]>([]);
  useEffect(() => {
    const it = (window as any).iterra;
    const e = sendHit?.entity;
    if (!it?.links?.for || !e?.key) {
      setBlinks([]);
      return;
    }
    let alive = true;
    it.links
      .for(e.key)
      .then((r: any) => {
        if (!alive) return;
        const rows = [...(r?.out || []), ...(r?.inn || [])];
        const other = (l: any) => (l?.from === e.key ? l?.to : l?.from);
        setBlinks(
          rows.slice(0, 6).map((l) => {
            const k = other(l);
            const ent = (entities || []).find((x) => x.key === k);
            return { key: k, title: ent?.title || k?.split(':').slice(2).join(':') || k, url: ent?.url };
          }),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendForKey]);

  const doSend = async (h: Hit, t: { to: string; action: string; label: string; payload?: Record<string, unknown> }) => {
    setSendForKey(null);
    if (!h.entity) return;
    const r = await sendTo({ to: t.to, action: t.action, entity: h.entity, payload: t.payload });
    if (!r.ok) {
      setSentNote(`Could not send — ${r.error || 'unavailable'}`);
      return;
    }
    const label = PLACE_MAP[t.to]?.label || t.to;
    setSentNote(
      r.toast ||
        (r.delivered === 'direct'
          ? `Sent to ${label}`
          : `Queued for ${label} — delivers on open`),
    );
    window.setTimeout(() => setSentNote((n) => (n ? null : n)), 5000);
    if (r.url) {
      window.setTimeout(() => {
        setSentNote(null);
        onGo(r.url!);
        onClose();
      }, 900);
    }
  };

  const activateHit = (h: Hit) => {
    if (h.run) {
      h.run();
      onClose();
      return;
    }
    onGo(h.url);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh] p-4 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Global search and command palette"
    >
      <div
        className="anim-rise w-full max-w-2xl overflow-hidden rounded-[8px] border border-[var(--color-line-2)] bg-[var(--color-sheet)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--color-line)] px-4 py-3">
          <SearchIcon className="h-4 w-4 text-[var(--color-accent)] shrink-0" />
          <input
            ref={inputRef}
            value={q}
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="iterra-search-results"
            aria-activedescendant={hits[sel] ? `sr-${hitId(hits[sel])}` : undefined}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (sendForKey) setSendForKey(null);
                else onClose();
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, hits.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              }
              if (e.key === 'Enter' && hits[sel]) {
                activateHit(hits[sel]);
              }
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p' && hits[sel]) {
                e.preventDefault();
                const h = hits[sel];
                togglePin({ app: h.app, title: h.label, url: h.url });
              }
              if ((e.key === 'ArrowRight' || e.key === 'Tab') && hits[sel]?.entity) {
                e.preventDefault();
                setSendForKey((cur) =>
                  hits[sel] && cur === hitId(hits[sel]) ? null : hits[sel] ? hitId(hits[sel]) : cur,
                );
              }
              if (e.key === 'ArrowLeft' && sendForKey) {
                e.preventDefault();
                setSendForKey(null);
              }
            }}
            placeholder="Search notes, decks, problems, courses, or run a command…"
            aria-label="Search workspace or run command"
            className="w-full bg-transparent text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-faint)] focus:outline-none"
          />
          <kbd className="rounded border border-[var(--color-line)] bg-[var(--color-sheet-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-mute)]">
            ESC
          </kbd>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-line)] bg-[var(--color-paper)]/60 px-4 py-1.5 font-mono text-[10px] text-[var(--color-faint)]">
          <span>↑↓ Navigate</span>
          <span>·</span>
          <span>↵ Open</span>
          <span>·</span>
          <span>⌘P Pin to Shelf</span>
          <span>·</span>
          <span>→ Inspect &amp; Send</span>
          <span>·</span>
          <span>⌘1–8 Tools · ⌘0 Today</span>
        </div>

        {staged.length > 0 && (
          <div className="anim-pop flex flex-wrap items-center gap-2 border-b border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-4 py-2">
            <span className="text-[11px] font-semibold text-[var(--color-accent)]">
              {staged.length} selected →
            </span>
            {SEND_TARGETS.map((t) => (
              <button
                key={t.to + t.action}
                type="button"
                className="rounded-[4px] border border-[var(--color-accent)]/40 bg-[var(--color-sheet)] px-2 py-0.5 text-[11px] text-[var(--color-ink)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)] cursor-pointer"
                onClick={() => {
                  const batch = staged.slice();
                  setStaged([]);
                  setSendForKey(null);
                  Promise.all(
                    batch.map((h) =>
                      h.entity
                        ? sendTo({ to: t.to, action: t.action, entity: h.entity, payload: t.payload })
                        : Promise.resolve({ ok: false }),
                    ),
                  ).then((rs) => {
                    const ok = rs.filter((r) => r.ok).length;
                    setSentNote(`${ok}/${batch.length} sent to ${PLACE_MAP[t.to]?.label || t.to}`);
                    window.setTimeout(() => setSentNote((n) => (n ? null : n)), 4000);
                  });
                }}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              className="ml-auto text-[11px] text-[var(--color-mute)] hover:underline cursor-pointer"
              onClick={() => setStaged([])}
            >
              Clear
            </button>
          </div>
        )}

        {sentNote && (
          <div className="anim-fade flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-accent-soft)] px-4 py-1.5 text-[12px] text-[var(--color-accent)]">
            <span className="min-w-0 flex-1 truncate font-medium">{sentNote}</span>
          </div>
        )}

        <ul id="iterra-search-results" role="listbox" className="today-rail max-h-[56vh] overflow-y-auto py-1.5">
          {hits.length ? (
            groups.map((g, gi) => (
              <li key={g.header ?? `g${gi}`} role="presentation">
                {g.header && (
                  <div className="px-4 pb-1 pt-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
                    {g.header}
                  </div>
                )}
                <ul role="presentation">
                  {g.items.map(({ h, i }) => (
                    <li
                      key={`${h.app}-${h.url}-${h.label}-${i}`}
                      id={`sr-${hitId(h)}`}
                      role="option"
                      aria-selected={i === sel}
                    >
                      <div
                        onMouseEnter={() => setSel(i)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                          i === sel ? 'bg-[var(--color-accent-soft)]/75' : 'hover:bg-[var(--color-sheet-hover)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => activateHit(h)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer focus:outline-none"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border border-[var(--color-line)] bg-[var(--color-sheet-2)] text-[var(--color-accent)]">
                            {h.kind === 'command' ? (
                              <Terminal className="h-3.5 w-3.5" />
                            ) : h.kind === 'course' ? (
                              <BookOpen className="h-3.5 w-3.5" />
                            ) : (
                              iconForObjectType(h.stype || '', h.app)
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium text-[var(--color-ink)]">
                              {h.label}
                            </span>
                            {h.sub && (
                              <span className="block truncate text-[11px] text-[var(--color-mute)]">
                                {h.sub}
                              </span>
                            )}
                          </span>
                        </button>

                        {pinned.has(h.url) && (
                          <span className="shrink-0 text-[11px] text-[var(--color-accent)]" title="Pinned on shelf">
                            ◈
                          </span>
                        )}
                        {h.entity && (
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSel(i);
                              if (ev.shiftKey) {
                                setStaged((cur) =>
                                  cur.some((x) => hitId(x) === hitId(h))
                                    ? cur.filter((x) => hitId(x) !== hitId(h))
                                    : [...cur, h],
                                );
                                return;
                              }
                              setSendForKey((cur) => (cur === hitId(h) ? null : hitId(h)));
                            }}
                            aria-label={`Inspect or send ${h.label}`}
                            title="Inspect & send to another tool (→)"
                            className={`shrink-0 rounded p-1 text-[11px] cursor-pointer ${
                              sendForKey === hitId(h)
                                ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
                                : 'text-[var(--color-faint)] hover:text-[var(--color-ink)]'
                            }`}
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => activateHit(h)}
                          aria-label={`Open ${h.label}`}
                          className="shrink-0 text-[11px] text-[var(--color-faint)] cursor-pointer"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {sendForKey === hitId(h) && (
                        <div className="anim-pop border-y border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-2.5">
                          {h.entity && (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pb-2 text-[11px] text-[var(--color-mute)]">
                              <span className="font-mono font-semibold uppercase text-[var(--color-accent)]">
                                {formatEntityType(h.entity.type)}
                              </span>
                              {h.entity.course && <span>· Course: {h.entity.course}</span>}
                              {h.entity.topic && <span>· Topic: {h.entity.topic}</span>}
                              {(() => {
                                /* commitments store ISO strings; cards store
                                   ms epochs (0 = due now, shown as due) */
                                const raw = h.entity.data?.dueAt;
                                const ms =
                                  typeof raw === 'number' ? raw
                                  : typeof raw === 'string' ? Date.parse(raw) : NaN;
                                if (!Number.isFinite(ms)) return null;
                                /* flashcards mark due cards with dueAt:0 —
                                   0 is a sentinel, not the epoch */
                                if (ms === 0) return <span className="text-[var(--color-warn)]">· Due now</span>;
                                const past = ms <= Date.now();
                                return (
                                  <span className={past ? 'text-[var(--color-warn)]' : ''}>
                                    · {past ? 'Was due' : 'Due'}{' '}
                                    {new Date(ms).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </span>
                                );
                              })()}
                            </div>
                          )}
                          {blinks.length > 0 && sendHit === h && (
                            <div className="flex flex-wrap gap-1.5 pb-2">
                              {blinks.map((b) => (
                                <button
                                  key={b.key}
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    if (b.url) {
                                      onGo(b.url);
                                      onClose();
                                    }
                                  }}
                                  className="rounded-[4px] border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--color-accent)] hover:underline cursor-pointer"
                                >
                                  Connected: {b.title}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-faint)]">
                            Send “{h.label}” to:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {SEND_TARGETS.map((t) => (
                              <button
                                key={`${t.to}:${t.action}`}
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  void doSend(h, t);
                                }}
                                className="rounded-[4px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] cursor-pointer"
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))
          ) : (
            <li className="px-4 py-8 text-center text-[13px] text-[var(--color-mute)]">
              No matching objects, courses, or commands found.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
