/* iterra bridges for the open page (docs/ADAPTER.md):
   - backlink chips: links.for(ink:note:<id>) — 'in margin · in deck · in
     attempt' for pages this note fed (out), 'from <app>' where it came
     from (inn); the other end resolves to a real entity url via the store
   - course binder: the first tag resolving via courses.byCode rides to
     '#/c/<code>' — never a fabricated key
   Guarded — standalone renders nothing. */
import { useEffect, useState } from 'react';
import type { Note } from '../../store';

interface IterraLinksResult {
  out?: { to?: string }[];
  inn?: { from?: string }[];
}
interface IterraSurface {
  links?: { for: (key: string) => Promise<IterraLinksResult> };
  store?: { get: (key: string) => Promise<{ url?: string; title?: string } | null> };
  courses?: { byCode: (code: string) => Promise<{ key?: string; data?: { code?: string }; course?: string; id?: string } | null> };
  open?: (url: string) => void;
}

const iterra = (): IterraSurface | undefined => (window as unknown as { iterra?: IterraSurface }).iterra;

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
    const links = iterra()?.links;
    const store = iterra()?.store;
    void (async () => {
      if (links?.for && store?.get) {
        const res = await links.for(`ink:note:${note.id}`).catch(() => null);
        if (res) {
          const refs: { key: string; dir: 'in' | 'from' }[] = [
            ...(res.out ?? []).map((l) => ({ key: String(l.to), dir: 'in' as const })),
            ...(res.inn ?? []).map((l) => ({ key: String(l.from), dir: 'from' as const })),
          ].filter((r) => /^[a-z]+:[a-z]+:.+/.test(r.key) && PLACE[r.key.split(':')[0]]);
          if (refs.length) {
            const seen = new Set<string>();
            const out: Hit[] = [];
            for (const r of refs.slice(0, 8)) {
              const app = r.key.split(':')[0];
              const label = `${r.dir} ${PLACE[app]}`;
              if (seen.has(label)) continue;
              const ent = await store.get(r.key).catch(() => null);
              if (!live) return;
              seen.add(label);
              out.push({ label, url: ent?.url || `/apps/${app}/`, title: ent?.title });
              if (out.length >= 3) break;
            }
            if (live) setHits(out);
            return;
          }
        }
      }
      if (live) setHits([]);
    })();
    return () => {
      live = false;
    };
  }, [note.id]);

  /* course binder — the page's own tags resolve against the registry */
  useEffect(() => {
    let live = true;
    const byCode = iterra()?.courses?.byCode;
    void (async () => {
      if (byCode && note.tags?.length) {
        for (const tag of note.tags) {
          const ent = await byCode(tag).catch(() => null);
          if (!live) return;
          if (ent?.key) {
            const code = ent.data?.code || ent.course || ent.id || tag;
            setCourse(String(code));
            return;
          }
        }
      }
      if (live) setCourse(null);
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
              it?.open?.(`#/c/${encodeURIComponent(course)}`);
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
              if (it?.open) it.open(h.url);
              else window.open(h.url, '_blank');
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
