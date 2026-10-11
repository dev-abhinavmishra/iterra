import { useEffect, useMemo, useRef, useState } from 'react';
import { PLACE_MAP } from './places';
import type { Entity } from './hub';

interface Hit {
  app: string;
  label: string;
  sub: string;
  url: string;
  kind: 'entity' | 'place';
  key?: string;
}

/* unified palette — every app's published index + the places themselves.
   Opens with ⌘K or `/`, arrows move, enter goes. */
export function Search({
  indexes,
  open,
  onClose,
  onGo,
}: {
  indexes: Record<string, Entity[]>;
  open: boolean;
  onClose: () => void;
  onGo: (url: string) => void;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
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
    for (const [app, list] of Object.entries(indexes)) {
      for (const e of list || []) {
        if (!e?.title) continue;
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
    const all = [...places, ...ents];
    if (!needle) return all.slice(0, 30);
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
      .sort((a, b) => a.r - b.r || a.h.label.localeCompare(b.h.label))
      .slice(0, 30)
      .map((x) => x.h);
  }, [q, indexes]);

  /* browse mode (no query): group entities under their course/topic so one
     class's blocks, decks, notes and sessions read as one dossier */
  const groups = useMemo<{ header: string | null; items: { h: Hit; i: number }[] }[]>(() => {
    if (q.trim()) return [{ header: null, items: hits.map((h, i) => ({ h, i })) }];
    const places = hits.filter((h) => h.kind === 'place');
    const byKey = new Map<string, { label: string; items: { h: Hit; i: number }[] }>();
    const loose: { h: Hit; i: number }[] = [];
    hits.forEach((h, i) => {
      if (h.kind === 'place') return;
      const key = (h.key || '').toLowerCase();
      if (!key) { loose.push({ h, i }); return; }
      if (!byKey.has(key)) byKey.set(key, { label: h.key!, items: [] });
      byKey.get(key)!.items.push({ h, i });
    });
    const out: { header: string | null; items: { h: Hit; i: number }[] }[] = [
      { header: null, items: places.map((h) => ({ h, i: hits.indexOf(h) })) },
    ];
    for (const g of byKey.values()) out.push({ header: g.label, items: g.items });
    if (loose.length) out.push({ header: 'elsewhere', items: loose });
    return out;
  }, [hits, q]);

  useEffect(() => setSel(0), [hits.length]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-field-ink/25 pt-[14vh] backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search the terrain"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-atlas-300 bg-atlas-50 shadow-[0_24px_60px_-16px_rgba(29,51,42,0.4)]"
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
          <span className="tracking-wide">↑↓ choose · ↵ go</span>
        </div>
        <ul className="max-h-[52vh] overflow-y-auto py-1.5">
          {hits.length ? (
            groups.map((g, gi) => (
              <li key={g.header ?? `g${gi}`}>
                {g.header && (
                  g.header === 'elsewhere' ? (
                    <div className="px-4 pb-0.5 pt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-atlas-500">
                      {g.header}
                    </div>
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
                    <li key={`${h.app}-${h.url}-${i}`}>
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
                        <span className="text-[11px] text-atlas-500">{i === sel ? '↵' : '→'}</span>
                      </button>
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
