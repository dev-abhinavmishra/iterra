/* iterra bridges for the open page (docs/ADAPTER.md):
   - backlink chips: links.for(ink:note:<id>) — 'in margin · in deck · in
     attempt' for pages this note fed (out), 'from <app>' where it came
     from (inn); the other end resolves to a real entity url via the store
   - course binder: the first tag resolving via courses.byCode rides to
     '#/c/<code>' — never a fabricated key
   Guarded — standalone renders nothing. */
import { useEffect, useState } from 'react';
import type { Note } from '../../store';

const iterra = () => (window as any).iterra;

/* place names, the way the terrain calls them */
const PLACE: Record<string, string> = { margin: 'margin', flashcards: 'deck', proof: 'attempt' };

interface Hit {
  label: string;
  url: string;
  title?: string;
}

export function TerrainChips({ note }: { note: Note }) {
  const [hits, setHits] = useState<Hit[]>([]);
  const [course, setCourse] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setHits([]);
    const it = iterra();
    if (!it?.links?.for || !it?.store?.get) return;
    it.links
      .for(`ink:note:${note.id}`)
      .then(async (res: any) => {
        const refs: { key: string; dir: 'in' | 'from' }[] = [
          ...((res?.out ?? []) as Array<{ to?: string }>).map((l) => ({ key: String(l.to), dir: 'in' as const })),
          ...((res?.inn ?? []) as Array<{ from?: string }>).map((l) => ({ key: String(l.from), dir: 'from' as const })),
        ].filter((r) => /^[a-z]+:[a-z]+:.+/.test(r.key) && PLACE[r.key.split(':')[0]]);
        if (!refs.length) return;
        const seen = new Set<string>();
        const out: Hit[] = [];
        for (const r of refs.slice(0, 8)) {
          const app = r.key.split(':')[0];
          const label = `${r.dir} ${PLACE[app]}`;
          if (seen.has(label)) continue;
          const ent = await it.store.get(r.key).catch(() => null);
          if (!live) return;
          seen.add(label);
          out.push({ label, url: ent?.url || `/apps/${app}/`, title: ent?.title });
          if (out.length >= 3) break;
        }
        if (live) setHits(out);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [note.id]);

  /* course binder — the page's own tags resolve against the registry */
  useEffect(() => {
    let live = true;
    setCourse(null);
    const it = iterra();
    if (!it?.courses?.byCode || !note.tags?.length) return;
    (async () => {
      for (const tag of note.tags) {
        const ent = await it.courses.byCode(tag).catch(() => null);
        if (!live) return;
        if (ent?.key) {
          const code = ent.data?.code || ent.course || ent.id || tag;
          setCourse(String(code));
          return;
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [note.id, note.tags]);

  if (!hits.length && !course) return null;
  return (
    <>
      {course && (
        <button
          type="button"
          className="text-fountain/70 hover:text-fountain transition-colors"
          title="Open this course's dossier"
          onClick={() => {
            const it = iterra();
            try {
              it?.open ? it.open(`#/c/${encodeURIComponent(course)}`) : undefined;
            } catch {
              /* standalone — nothing to open */
            }
          }}
        >
          # {course.toLowerCase()}
        </button>
      )}
      {hits.map((h) => (
        <button
          key={h.label}
          type="button"
          className="text-fountain/70 hover:text-fountain transition-colors"
          title={h.title ? String(h.title) : h.label}
          onClick={() => {
            const it = iterra();
            try {
              it?.open ? it.open(h.url) : window.open(h.url, '_blank');
            } catch {
              window.open(h.url, '_blank');
            }
          }}
        >
          {h.label} →
        </button>
      ))}
    </>
  );
}
