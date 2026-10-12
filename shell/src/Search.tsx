import { useEffect, useMemo, useRef, useState } from 'react';
import { PLACE_MAP } from './places';
import type { Entity, StoreEntity } from './hub';
import { sendTo } from './hub';
import { subscribeShelf, togglePin, type ShelfPin } from './shelf';
import { readFeed, subscribeFeed, type FeedItem } from './hub';

interface Hit {
  app: string;
  label: string;
  sub: string;
  url: string;
  kind: 'entity' | 'place' | 'stir';
  key?: string;
  uat?: number;
  /* canonical-store provenance — sendable */
  skey?: string;
  stype?: string;
  entity?: StoreEntity;
}

/* the shared send-to menu — every object in any app can be handed to a
   sibling action (docs/ADAPTER.md intake catalogue). Order reads as a
   sentence: make it a card, file it as a note, attach it, log it. */
const SEND_TARGETS: { to: string; action: string; label: string }[] = [
  { to: 'flashcards', action: 'cards.create', label: 'a flashcards card' },
  { to: 'margin', action: 'note.create', label: 'a margin note' },
  { to: 'ink', action: 'note.create', label: 'an ink page' },
  { to: 'proof', action: 'step.append', label: 'a proof step' },
  { to: 'rhythm', action: 'log.activity', label: 'a mark on the register' },
  { to: 'timer', action: 'timer.start', label: 'a focus session' },
];

/* unified palette — every app's published index + the places themselves.
   Opens with ⌘K or `/`, arrows move, enter goes. */
export function Search({
  indexes,
  entities,
  open,
  onClose,
  onGo,
}: {
  indexes: Record<string, Entity[]>;
  entities: StoreEntity[];
  open: boolean;
  onClose: () => void;
  onGo: (url: string) => void;
}) {
  const [feed, setFeed] = useState<FeedItem[]>(() => readFeed());
  useEffect(() => subscribeFeed(setFeed), []);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [pins, setPins] = useState<ShelfPin[]>([]);
  useEffect(() => subscribeShelf(setPins), []);
  /* sendFor tracks a hit by its stable identity (entity key / url), not the
     object — hits rebuild on every store poll, so `sendFor === h` never
     survives a refresh and the menu would die the moment it opened. */
  const [sendForKey, setSendForKey] = useState<string | null>(null);
  const hitId = (h: Hit) => h.skey || h.url;
  const [sentNote, setSentNote] = useState<string | null>(null);
  const pinned = useMemo(() => {
    const s = new Set<string>();
    for (const p of pins) {
      s.add(p.url);
      // '/apps/x' bare and '#/p/x' are the same destination — match either
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
      setSentNote(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    const places: Hit[] = Object.values(PLACE_MAP).map((p) => ({
      app: p.id,
      kind: 'place',
      label: p.place,
      sub: p.app,
      url: `#/p/${p.id}`,
    }));
    const ents: Hit[] = [];
    const seen = new Set<string>();
    /* canonical store first — the truth, uncapped. Every entity every app
       wrote lives here, including apps that never mounted this session. */
    for (const e of entities || []) {
      if (!e?.title) continue;
      const sig = `${e.url || ''}|${e.title}`;
      seen.add(sig);
      ents.push({
        app: e.app,
        kind: 'entity',
        label: e.title,
        sub: [e.type, e.sub, e.course, e.topic].filter(Boolean).join(' · '),
        url: e.url || `#/p/${e.app}`,
        key: e.course || e.topic || undefined,
        uat: e.updatedAt || 0,
        skey: e.key,
        stype: e.type,
        entity: e,
      });
    }
    /* index rows not mirrored in the store yet (older writers) still show */
    for (const [app, list] of Object.entries(indexes)) {
      for (const e of list || []) {
        if (!e?.title) continue;
        if (seen.has(`${e.url || ''}|${e.title}`)) continue;
        ents.push({
          app,
          kind: 'entity',
          label: e.title,
          sub: [e.t, e.sub, e.course, e.topic].filter(Boolean).join(' · '),
          url: e.url || `#/p/${app}`,
          key: e.course || e.topic || undefined,
        });
      }
    }
    /* stirrings are searchable too — "filed", "stamped", "imported" queries
       should find the activity, not just entities */
    const stirs: Hit[] = needle
      ? feed.map((f) => ({
          app: f.app,
          kind: 'stir' as const,
          label: f.text,
          sub: f.app,
          url: f.url || `#/p/${f.app}`,
        }))
      : [];
    const all = [...places, ...ents, ...stirs];
    if (!needle) {
      /* recency-first browse: the newest store entities lead, then the
         places, then the rest — an empty palette answers 'what just
         happened' before 'where can I go'. */
      const recent = ents.filter((e) => e.uat).sort((a, b) => (b.uat || 0) - (a.uat || 0));
      const rest = ents.filter((e) => !recent.includes(e));
      return [...places, ...recent, ...rest].slice(0, 60);
    }
    const rank = (h: Hit) => {
      const l = h.label.toLowerCase();
      const s = h.sub.toLowerCase();
      if (l.startsWith(needle)) return 0;
      if (l.includes(needle)) return 1;
      if (s.includes(needle)) return 2;
      if (h.app.includes(needle)) return 3;
      return 9;
    };
    /* no row cap on store results — the scroll list is the budget */
    return all
      .map((h) => ({ h, r: rank(h) }))
      .filter((x) => x.r < 9)
      .sort((a, b) => a.r - b.r || a.h.label.localeCompare(b.h.label))
      .map((x) => x.h);
  }, [q, indexes, entities, feed]);

  /* browse mode (no query): newest entities lead under a 'recent' header,
     then the places, then course/topic groups — the dossier view plus
     immediacy. */
  const groups = useMemo<{ header: string | null; items: { h: Hit; i: number }[] }[]>(() => {
    if (q.trim()) return [{ header: null, items: hits.map((h, i) => ({ h, i })) }];
    const places = hits.filter((h) => h.kind === 'place');
    const nonPlaces = hits.filter((h) => h.kind !== 'place');
    const recentIdx = new Set(
      nonPlaces.filter((h) => h.uat).sort((a, b) => (b.uat || 0) - (a.uat || 0)).slice(0, 8).map((h) => hits.indexOf(h)),
    );
    const byKey = new Map<string, { label: string; items: { h: Hit; i: number }[] }>();
    const loose: { h: Hit; i: number }[] = [];
    const recent: { h: Hit; i: number }[] = [];
    hits.forEach((h, i) => {
      if (h.kind === 'place') return;
      if (recentIdx.has(i)) { recent.push({ h, i }); return; }
      const key = (h.key || '').toLowerCase();
      if (!key) { loose.push({ h, i }); return; }
      if (!byKey.has(key)) byKey.set(key, { label: h.key!, items: [] });
      byKey.get(key)!.items.push({ h, i });
    });
    const out: { header: string | null; items: { h: Hit; i: number }[] }[] = [];
    if (recent.length) out.push({ header: 'recent', items: recent });
    out.push({ header: null, items: places.map((h) => ({ h, i: hits.indexOf(h) })) });
    for (const g of byKey.values()) out.push({ header: g.label, items: g.items });
    if (loose.length) out.push({ header: 'elsewhere', items: loose });
    return out;
  }, [hits, q]);

  useEffect(() => setSel(0), [hits.length]);

  /* ⇥ drawer — inspect + send: the field drawer shows what the entity IS
     (type · app · course · when · due), its backlinks via links.for, then
     the send targets. One surface, three answers. */
  const sendHit = useMemo(() => {
    if (!sendForKey) return null;
    return hits.find((h) => hitId(h) === sendForKey) || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendForKey, hits]);
  const [blinks, setBlinks] = useState<{ key: string; title: string; url?: string }[]>([]);
  useEffect(() => {
    const it = (window as any).iterra;
    const e = sendHit?.entity;
    if (!it?.links?.for || !e?.key) { setBlinks([]); return; }
    let alive = true;
    it.links.for(e.key).then((r: any) => {
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
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendForKey]);

  /* the global send-to: hand the store entity to a sibling action. When
     the target is live it delivers direct; otherwise it queues as a
     pending intake the target's adapter drains on boot. */
  const doSend = async (h: Hit, t: { to: string; action: string; label: string }) => {
    setSendForKey(null);
    if (!h.entity) return;
    const r = await sendTo({ to: t.to, action: t.action, entity: h.entity });
    if (!r.ok) {
      setSentNote(`couldn't send — ${r.error || "the hub isn't answering"}`);
      return;
    }
    const place = PLACE_MAP[t.to]?.place || t.to;
    setSentNote(
      r.delivered === 'direct'
        ? `sent to ${place} — ${r.url ? 'it answered' : 'delivered'}`
        : `filed for ${place} — it picks it up next visit`,
    );
    window.setTimeout(() => setSentNote((n) => (n ? null : n)), 5000);
    if (r.url) {
      /* a delivered intake hands back where it landed — offer the jump */
      window.setTimeout(() => {
        setSentNote(null);
        onGo(r.url!);
        onClose();
      }, 1400);
    }
  };

  if (!open) return null;
  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-start justify-center bg-field-ink/25 pt-[14vh] backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search the terrain"
    >
      <div
        className="anim-rise w-full max-w-xl overflow-hidden rounded-xl border border-atlas-300 bg-atlas-50 shadow-[0_24px_60px_-16px_rgba(29,51,42,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-atlas-300 px-4 py-3">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-moss-700" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === 'Enter' && hits[sel]) { onGo(hits[sel].url); onClose(); }
              /* ⌘P / ctrl+p shelves the selected hit — the palette can pin,
                 not just show what's pinned */
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p' && hits[sel]) {
                e.preventDefault();
                const h = hits[sel];
                togglePin({ app: h.app, title: h.label, url: h.url });
              }
              /* → or Tab on a store-backed hit opens the send-to menu —
                 any object can be handed to a sibling action */
              if ((e.key === 'ArrowRight' || e.key === 'Tab') && hits[sel]?.entity) {
                e.preventDefault();
                setSendForKey((cur) => (hits[sel] && cur === hitId(hits[sel]) ? null : hits[sel] ? hitId(hits[sel]) : cur));
              }
              if (e.key === 'ArrowLeft' && sendForKey) { e.preventDefault(); setSendForKey(null); }
            }}
            placeholder="search the terrain — notes, decks, blocks, sessions…"
            className="w-full bg-transparent text-[14px] text-field-ink placeholder-atlas-500 focus:outline-none"
          />
          <kbd className="rounded border border-atlas-300 px-1.5 py-0.5 text-[10px] text-atlas-500">esc</kbd>
        </div>
        <div className="flex items-center gap-2 border-t border-atlas-200 px-4 py-1.5 text-[10px] text-atlas-500">
          <span className="tracking-wide">⌘1–8 places</span>
          <span className="text-atlas-300">·</span>
          <span className="tracking-wide">⌘0 terrain</span>
          <span className="text-atlas-300">·</span>
          <span className="tracking-wide">↑↓ choose · ↵ go · ⌘P pin · → inspect & send</span>
        </div>
        {sentNote && (
          <div className="anim-fade flex items-center gap-2 border-t border-atlas-200 bg-moss-50/60 px-4 py-1.5 text-[11.5px] text-moss-700">
            <span className="min-w-0 flex-1 truncate">{sentNote}</span>
          </div>
        )}
        <ul className="max-h-[52vh] overflow-y-auto py-1.5">
          {hits.length ? (
            groups.map((g, gi) => (
              <li key={g.header ?? `g${gi}`}>
                {g.header && (
                  g.header === 'elsewhere' ? (
                    <button
                      onClick={() => { onGo('#/c/unfiled'); onClose(); }}
                      className="block w-full px-4 pb-0.5 pt-2.5 text-left text-[9.5px] font-semibold uppercase tracking-[0.14em] text-atlas-500 hover:text-moss-700"
                    >
                      the unfiled →
                    </button>
                  ) : (
                    <button
                      onClick={() => { onGo(`#/c/${encodeURIComponent(g.header!)}`); onClose(); }}
                      className="block w-full px-4 pb-0.5 pt-2.5 text-left text-[9.5px] font-semibold uppercase tracking-[0.14em] text-atlas-500 hover:text-moss-700"
                    >
                      {g.header} →
                    </button>
                  )
                )}
                <ul>
                  {g.items.map(({ h, i }) => (
                    <li key={`${h.app}-${h.url}-${i}`} className="anim-stir" style={{ animationDelay: `${Math.min(i, 9) * 14}ms` }}>
                      <button
                        onMouseEnter={() => setSel(i)}
                        onClick={() => { onGo(h.url); onClose(); }}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                          i === sel ? 'bg-moss-50' : ''
                        }`}
                      >
                        <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-moss-700">
                          {PLACE_MAP[h.app]?.app || h.app}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] text-field-ink">{h.label}</span>
                          {h.sub && <span className="block truncate text-[11px] text-atlas-500">{h.sub}</span>}
                        </span>
                        {pinned.has(h.url) && (
                          <span className="shrink-0 text-[11px] text-moss-700" title="on the shelf">◈</span>
                        )}
                        {h.entity && (
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSel(i);
                              setSendForKey((cur) => (cur === hitId(h) ? null : hitId(h)));
                            }}
                            title="send to another place (s)"
                            className={`shrink-0 rounded px-1 text-[11px] focus:outline-none ${
                              sendForKey === hitId(h) ? 'text-moss-700' : 'text-atlas-400 hover:text-moss-700'
                            }`}
                          >
                            ⇥
                          </button>
                        )}
                        <span className="text-[11px] text-atlas-500">{i === sel ? '↵' : '→'}</span>
                      </button>
                      {sendForKey === hitId(h) && (
                        <div className="anim-rise border-t border-atlas-200 bg-atlas-100/60 px-4 py-1.5">
                          {h.entity && (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pb-1.5 text-[10.5px] text-atlas-500">
                              <span className="font-semibold uppercase tracking-[0.1em] text-moss-700">{h.entity.type}</span>
                              {h.entity.course && <span>· {h.entity.course}</span>}
                              {h.entity.topic && <span>· {h.entity.topic}</span>}
                              {typeof h.entity.data?.dueAt === 'number' && (
                                <span className={h.entity.data.dueAt <= Date.now() ? 'text-amber-700' : ''}>
                                  · due {new Date(h.entity.data.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                              {h.entity.updatedAt ? <span>· {new Date(h.entity.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> : null}
                            </div>
                          )}
                          {blinks.length > 0 && sendHit === h && (
                            <div className="flex flex-wrap gap-1 pb-1.5">
                              {blinks.map((b) => (
                                <button
                                  key={b.key}
                                  onClick={(ev) => { ev.stopPropagation(); if (b.url) { onGo(b.url); onClose(); } }}
                                  className="rounded-full border border-moss-300 bg-moss-50/70 px-2 py-0.5 text-[10px] text-moss-700 hover:bg-moss-50 focus:outline-none"
                                  title={b.key}
                                >
                                  ⇔ {b.title.length > 28 ? b.title.slice(0, 28) + '…' : b.title}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="pb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-atlas-500">
                            send “{h.label}” to…
                          </div>
                          <div className="flex flex-wrap gap-1.5 pb-1">
                            {SEND_TARGETS.map((t) => (
                              <button
                                key={`${t.to}:${t.action}`}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  doSend(h, t);
                                }}
                                className="rounded-full border border-atlas-300 bg-atlas-50 px-2.5 py-1 text-[11px] font-medium text-field-faint hover:border-moss-400 hover:text-moss-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-500"
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
            <li className="px-4 py-6 text-center text-[13px] italic text-atlas-500">
              nothing in the terrain matches
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
