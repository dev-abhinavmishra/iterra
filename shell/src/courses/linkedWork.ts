import type { Entity, StoreEntity } from '../hub';
import { toWorkspaceObject, type WorkspaceObject } from '../ui/ObjectRow';
import { PLACE_MAP, formatEntityType } from '../places';

/* ── Linked-work grouping for the course workspace ────────────────────────
   Given the canonical link graph (iterra.links rows) plus the entity/index
   mirrors, collect the study blocks, notes, decks, and sessions connected
   to each quiz / commitment / assessment so a course page can show
   yesterday's materials grouped under the work they serve — e.g. a Biology
   quiz with its lecture note, review deck, and scheduled block. Only links
   (and a quiz/deck's own sourceNoteId provenance) that already exist are
   used; nothing is inferred from titles. */

export interface LinkEdge {
  key?: string;
  from?: string;
  to?: string;
  kind?: string;
  canonicalKind?: string;
}

export interface LinkedWorkItem extends WorkspaceObject {
  /** short relation tag — 'scheduled', 'derived', 'source', … */
  via?: string;
}

const ANCHOR_TYPES = new Set(['quiz', 'commitment', 'assessment']);
/* cards flood deck edges and course/term/link rows aren't work items */
const SKIP_TYPES = new Set(['card', 'course', 'term', 'link', 'event']);
/* one extra hop through scheduled blocks/commitments and through a quiz's
   source note is what surfaces "the review deck for this quiz's lecture
   note"; deeper hops would just re-list the whole course */
const BRIDGE_TYPES = new Set(['block', 'commitment']);
const MAX_CHILDREN = 8;

const TYPE_ORDER: Record<string, number> = {
  block: 0,
  commitment: 0,
  note: 1,
  source: 1,
  deck: 2,
  quiz: 3,
  problem: 3,
  attempt: 3,
  session: 4,
};

function kindTag(kind?: string | null): string {
  switch (String(kind || '').toLowerCase()) {
    case 'scheduledfor':
      return 'scheduled';
    case 'derivedfrom':
    case 'derived':
      return 'derived';
    case 'practicedin':
      return 'session';
    case 'assessedby':
      return 'assessed';
    case 'followupfor':
    case 'retest':
      return 'follow-up';
    case 'attached':
      return 'attached';
    default:
      return 'linked';
  }
}

/** "scheduled · Work Block · Planning" — the clear per-child label. */
export function linkedWorkLabel(item: LinkedWorkItem): string {
  return [
    item.via,
    formatEntityType(item.type),
    item.app ? PLACE_MAP[item.app]?.label || item.app : null,
  ]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join(' · ');
}

function indexToObject(app: string, e: Entity): WorkspaceObject {
  return {
    key: `${app}:${e.t || 'item'}:${e.id || e.title}`,
    app,
    type: e.t || 'item',
    id: e.id || e.title || '',
    title: e.title || 'Untitled',
    sub: e.sub,
    course: e.course,
    topic: e.topic,
    url: e.url || `/apps/${app}/`,
    updatedAt: e.at,
  };
}

export function buildLinkedWorkGroups(opts: {
  /** candidate anchors — typically the course's WorkspaceObjects; only
      quiz/commitment/assessment rows produce groups */
  anchors: WorkspaceObject[];
  /** every canonical store entity (all courses — a link is explicit) */
  entities: StoreEntity[];
  /** published per-app entity indexes */
  indexes: Record<string, Entity[]>;
  links: LinkEdge[];
}): Map<string, LinkedWorkItem[]> {
  const { anchors, entities, indexes, links } = opts;
  const out = new Map<string, LinkedWorkItem[]>();

  // Resolution tables: canonical key -> workspace object, across store
  // entities and index mirrors so link endpoints resolve wherever they live.
  const byKey = new Map<string, WorkspaceObject>();
  for (const e of entities || []) {
    if (!e?.key) continue;
    byKey.set(e.key, toWorkspaceObject(e));
  }
  for (const [app, list] of Object.entries(indexes || {})) {
    for (const e of list || []) {
      if (!e?.title) continue;
      const o = indexToObject(app, e);
      if (!byKey.has(o.key)) byKey.set(o.key, o);
    }
  }

  const resolve = (key: string): WorkspaceObject | null => {
    const hit = byKey.get(key);
    if (hit) return hit;
    // link endpoints are 'app:type:id' — fall back to a parsed stub so a
    // link to an unmirrored object still opens its app rather than vanishing
    const m = key.match(/^([a-z]+):([^:]+):(.+)$/);
    if (!m) return null;
    const [, app, type, id] = m;
    for (const e of (indexes?.[app] || [])) {
      if (e?.id === id || e?.title === id) {
        const o = indexToObject(app, e);
        byKey.set(key, o);
        return o;
      }
    }
    const stub: WorkspaceObject = {
      key,
      app,
      type,
      id,
      title: id,
      url: `/apps/${app}/`,
    };
    byKey.set(key, stub);
    return stub;
  };

  // Adjacency: key -> [{other, tag}] in both directions
  const neighbors = new Map<string, { other: string; tag: string }[]>();
  const addEdge = (from: string | undefined, to: string | undefined, tag: string) => {
    if (!from || !to || from === to) return;
    if (!neighbors.has(from)) neighbors.set(from, []);
    neighbors.get(from)!.push({ other: to, tag });
  };
  for (const l of links || []) {
    if (!l?.from || !l?.to) continue;
    const tag = kindTag(l.canonicalKind || l.kind);
    addEdge(l.from, l.to, tag);
    addEdge(l.to, l.from, tag);
  }

  const sourceNoteKeyFor = (anchor: WorkspaceObject): string | null => {
    const sid = anchor.data?.sourceNoteId;
    if (typeof sid !== 'string' || !sid) return null;
    const ent = (entities || []).find(
      (e) => e?.type === 'note' && (e.id === sid || e.key === `${anchor.app}:note:${sid}`),
    );
    if (ent?.key) return ent.key;
    const guess = `${anchor.app}:note:${sid}`;
    return byKey.has(guess) ? guess : null;
  };

  for (const anchor of anchors || []) {
    if (!anchor?.key || !ANCHOR_TYPES.has(anchor.type)) continue;

    const seen = new Set<string>([anchor.key]);
    const children: LinkedWorkItem[] = [];
    const push = (key: string | undefined, via: string) => {
      if (!key || seen.has(key)) return;
      const obj = resolve(key);
      if (!obj || SKIP_TYPES.has(obj.type)) return;
      seen.add(key);
      children.push({ ...obj, via });
    };

    // 1. direct link neighbors
    for (const n of neighbors.get(anchor.key) || []) push(n.other, n.tag);

    // 2. provenance: a quiz/deck made from a note links back to it, and
    //    whatever derived from that same note (the review deck) comes along
    const srcKey = sourceNoteKeyFor(anchor);
    if (srcKey) {
      push(srcKey, 'source');
      for (const n of neighbors.get(srcKey) || []) push(n.other, n.tag);
      // decks/notes carrying the same sourceNoteId but no edge yet
      const sid = anchor.data?.sourceNoteId as string;
      for (const e of entities || []) {
        if (e?.key && e.key !== anchor.key && e.data?.sourceNoteId === sid) {
          push(e.key, 'source');
        }
      }
    }

    // 3. one hop through scheduled blocks/commitments — the slip that
    //    carries this quiz also carries its deck/note material
    for (const n of [...(neighbors.get(anchor.key) || [])]) {
      const mid = byKey.get(n.other);
      if (!mid || !BRIDGE_TYPES.has(mid.type)) continue;
      for (const m of neighbors.get(n.other) || []) {
        if (m.other === anchor.key) continue;
        push(m.other, m.tag);
      }
    }

    if (!children.length) continue;
    children.sort(
      (a, b) =>
        (TYPE_ORDER[a.type] ?? 5) - (TYPE_ORDER[b.type] ?? 5) ||
        a.title.localeCompare(b.title),
    );
    out.set(anchor.key, children.slice(0, MAX_CHILDREN));
  }
  return out;
}
