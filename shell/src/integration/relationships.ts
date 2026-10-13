/* ── Meaningful Cross-Module Relationships & Provenance (§2) ───────────────
   Supports explicit relationship types:
     - derivedFrom  (deck/note derived from source note/material)
     - scheduledFor (planned block scheduled for deck/problem/material)
     - practicedIn  (timer/practice session practiced against block/material)
     - assessedBy   (course/topic/commitment assessed by assessment)
     - followUpFor  (block/deck/task created as follow-up for attempt/assessment)
   Preserves provenance (source object, selected blocks/excerpt, creation-time
   snapshot & revision). Detects source changes without overwriting user edits. */

import type {
  CandidateCard,
  ObjectRef,
  RelationshipKind,
  RelationshipMeta,
  RelationshipRecord,
  SourceFreshnessReport,
} from './types';
import {
  computeContentHash,
  defaultUrlForRef,
  extractCandidateCardsFromText,
  formatRefKey,
  parseRef,
  resolveObject,
} from './identity';

const KIND_ALIASES: Record<string, RelationshipKind> = {
  derivedFrom: 'derivedFrom',
  derived: 'derivedFrom',
  scheduledFor: 'scheduledFor',
  practicedIn: 'practicedIn',
  assessedBy: 'assessedBy',
  followUpFor: 'followUpFor',
  retest: 'followUpFor',
  related: 'related',
};

export function normalizeRelationshipKind(kind?: string | null): RelationshipKind {
  if (!kind) return 'related';
  return KIND_ALIASES[kind] || 'related';
}

export function cardFingerprint(q: string, a: string): string {
  const nq = String(q || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const na = String(a || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${nq}::${na}`;
}

function normalizeRecord(raw: any): RelationshipRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const from = formatRefKey(raw.from);
  const to = formatRefKey(raw.to);
  if (!from || !to) return null;
  const kind = String(raw.kind || 'related');
  const canonicalKind = normalizeRelationshipKind(raw.canonicalKind || kind);
  return {
    key: raw.key || `${from}|${kind}|${to}`,
    from,
    to,
    kind,
    canonicalKind,
    by: raw.by,
    at: typeof raw.at === 'number' ? raw.at : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : raw.at,
    courseId: raw.courseId || raw.meta?.courseId,
    course: raw.course || raw.meta?.course,
    topic: raw.topic || raw.meta?.topic,
    workflowId: raw.workflowId || raw.meta?.workflowId,
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : undefined,
  };
}

export async function addRelationship(opts: {
  from: string | Partial<ObjectRef>;
  to: string | Partial<ObjectRef>;
  kind: RelationshipKind | string;
  courseId?: string;
  course?: string;
  topic?: string;
  workflowId?: string;
  meta?: RelationshipMeta;
}): Promise<{ ok: boolean; relationship?: RelationshipRecord; error?: string }> {
  const fromRef = parseRef(opts.from);
  const toRef = parseRef(opts.to);
  if (!fromRef || !toRef) {
    return { ok: false, error: 'Relationship requires valid from and to object references (app:type:id)' };
  }
  const canonicalKind = normalizeRelationshipKind(opts.kind);
  const meta: RelationshipMeta = {
    fromTitle: fromRef.title || opts.meta?.fromTitle,
    fromUrl: fromRef.url || opts.meta?.fromUrl || defaultUrlForRef(fromRef),
    toTitle: toRef.title || opts.meta?.toTitle,
    toUrl: toRef.url || opts.meta?.toUrl || defaultUrlForRef(toRef),
    ...(opts.meta || {}),
  };

  const it = (window as any).iterra;
  if (it?.links?.add) {
    try {
      const res = await it.links.add({
        from: fromRef.key,
        to: toRef.key,
        kind: canonicalKind,
        courseId: opts.courseId || fromRef.courseId || toRef.courseId,
        course: opts.course || fromRef.course || toRef.course,
        topic: opts.topic || fromRef.topic || toRef.topic,
        workflowId: opts.workflowId,
        meta,
      });
      if (res && res.ok !== false && res.link) {
        const rec = normalizeRecord(res.link)!;
        return { ok: true, relationship: rec };
      }
      return { ok: false, error: res?.error || 'Failed to store relationship' };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  // Fallback directly to localStorage if hub is not loaded (standalone mode)
  try {
    const key = 'iterra.v1.store.links';
    const map = JSON.parse(localStorage.getItem(key) || '{}') || {};
    const rec: RelationshipRecord = {
      key: `${fromRef.key}|${canonicalKind}|${toRef.key}`,
      from: fromRef.key,
      to: toRef.key,
      kind: canonicalKind,
      canonicalKind,
      at: Date.now(),
      updatedAt: Date.now(),
      courseId: opts.courseId || fromRef.courseId || toRef.courseId,
      course: opts.course || fromRef.course || toRef.course,
      topic: opts.topic || fromRef.topic || toRef.topic,
      workflowId: opts.workflowId,
      meta,
    };
    map[rec.key] = rec;
    localStorage.setItem(key, JSON.stringify(map));
    return { ok: true, relationship: rec };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function updateRelationshipMeta(
  from: string | Partial<ObjectRef>,
  to: string | Partial<ObjectRef>,
  kind: RelationshipKind | string,
  patchMeta: Partial<RelationshipMeta>,
): Promise<boolean> {
  const fromKey = formatRefKey(from);
  const toKey = formatRefKey(to);
  if (!fromKey || !toKey) return false;
  const it = (window as any).iterra;
  if (it?.links?.updateMeta) {
    const res = await it.links.updateMeta(fromKey, toKey, kind, patchMeta);
    return !!(res && res.ok !== false);
  }
  const existing = await getRelationshipsBetween(fromKey, toKey);
  const target = existing.find(
    (l) => l.from === fromKey && l.to === toKey && l.canonicalKind === normalizeRelationshipKind(kind),
  );
  const res = await addRelationship({
    from: fromKey,
    to: toKey,
    kind: target?.kind || kind,
    courseId: target?.courseId,
    course: target?.course,
    topic: target?.topic,
    workflowId: target?.workflowId,
    meta: { ...(target?.meta || {}), ...patchMeta },
  });
  return res.ok;
}

export async function removeRelationship(
  from: string | Partial<ObjectRef>,
  to: string | Partial<ObjectRef>,
  kind?: RelationshipKind | string,
): Promise<boolean> {
  const fromKey = formatRefKey(from);
  const toKey = formatRefKey(to);
  if (!fromKey || !toKey) return false;
  const it = (window as any).iterra;
  if (it?.links?.remove) {
    await it.links.remove(fromKey, toKey, kind || 'related');
    return true;
  }
  return false;
}

/** Discover relationships from either endpoint (`from` or `to`). */
export async function getRelationshipsFor(
  ref: string | Partial<ObjectRef>,
  filter?: { kind?: RelationshipKind | string },
): Promise<{ outgoing: RelationshipRecord[]; incoming: RelationshipRecord[]; all: RelationshipRecord[] }> {
  const key = formatRefKey(ref);
  if (!key) return { outgoing: [], incoming: [], all: [] };
  const wantKind = filter?.kind ? normalizeRelationshipKind(filter.kind) : null;

  let rawOut: any[] = [];
  let rawIn: any[] = [];

  const it = (window as any).iterra;
  if (it?.links?.for) {
    try {
      const res = await it.links.for(key);
      if (res && typeof res === 'object') {
        rawOut = Array.isArray(res.out) ? res.out : [];
        rawIn = Array.isArray(res.inn) ? res.inn : [];
      }
    } catch {
      /* fallback below */
    }
  } else {
    try {
      const map = JSON.parse(localStorage.getItem('iterra.v1.store.links') || '{}') || {};
      for (const l of Object.values(map) as any[]) {
        if (l?.from === key) rawOut.push(l);
        if (l?.to === key) rawIn.push(l);
      }
    } catch {
      /* ignore */
    }
  }

  const outgoing = rawOut
    .map(normalizeRecord)
    .filter((r): r is RelationshipRecord => !!r && (!wantKind || r.canonicalKind === wantKind));
  const incoming = rawIn
    .map(normalizeRecord)
    .filter((r): r is RelationshipRecord => !!r && (!wantKind || r.canonicalKind === wantKind));

  return {
    outgoing,
    incoming,
    all: [...outgoing, ...incoming],
  };
}

export async function getRelationshipsBetween(
  refA: string | Partial<ObjectRef>,
  refB: string | Partial<ObjectRef>,
): Promise<RelationshipRecord[]> {
  const a = formatRefKey(refA);
  const b = formatRefKey(refB);
  if (!a || !b) return [];
  const { all } = await getRelationshipsFor(a);
  return all.filter((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a));
}

export async function listAllRelationships(filter?: {
  kind?: RelationshipKind;
  courseId?: string;
  course?: string;
}): Promise<RelationshipRecord[]> {
  const it = (window as any).iterra;
  let rows: any[] = [];
  if (it?.links?.list) {
    try {
      rows = (await it.links.list(filter)) || [];
    } catch {
      rows = [];
    }
  } else {
    try {
      const map = JSON.parse(localStorage.getItem('iterra.v1.store.links') || '{}') || {};
      rows = Object.values(map);
    } catch {
      rows = [];
    }
  }
  const wantKind = filter?.kind ? normalizeRelationshipKind(filter.kind) : null;
  const wantCourseId = filter?.courseId;
  const wantCourse = filter?.course?.toLowerCase();
  return rows
    .map(normalizeRecord)
    .filter((r): r is RelationshipRecord => {
      if (!r) return false;
      if (wantKind && r.canonicalKind !== wantKind) return false;
      if (wantCourseId && r.courseId !== wantCourseId) return false;
      if (wantCourse && String(r.course || '').toLowerCase() !== wantCourse) return false;
      return true;
    });
}

/* ── Source-Change Detection & Non-Destructive Review (§2) ─────────────── */

/** Inspect whether any source object (`ink:note:<id>` or `margin:note:<id>`)
    that `targetRef` (`flashcards:deck:<id>` or `ink:note:<id>`) was derived
    from has changed since derivation.
    NEVER overwrites user-edited cards in the target deck. */
export async function checkSourceFreshness(
  targetRef: string | Partial<ObjectRef>,
): Promise<SourceFreshnessReport[]> {
  const targetKey = formatRefKey(targetRef);
  if (!targetKey) return [];
  const { outgoing, incoming } = await getRelationshipsFor(targetKey, { kind: 'derivedFrom' });

  // Convention:
  // New `derivedFrom` links have `from = derivedObject` -> `to = sourceObject`
  // Legacy `derived` links had `from = sourceObject` -> `to = derivedObject`
  const sourceEdges: { sourceKey: string; rel: RelationshipRecord; dir: 'out' | 'in' }[] = [];
  for (const r of outgoing) {
    const srcKey = r.meta?.sourceKey || r.to;
    if (srcKey && srcKey !== targetKey) sourceEdges.push({ sourceKey: srcKey, rel: r, dir: 'out' });
  }
  for (const r of incoming) {
    // Only treat incoming `derivedFrom` as a source if it was a legacy `derived` link from a note to this deck/card
    if (r.kind === 'derived' || (r.meta?.sourceKey && r.meta.sourceKey === r.from)) {
      sourceEdges.push({ sourceKey: r.from, rel: r, dir: 'in' });
    }
  }

  const reports: SourceFreshnessReport[] = [];
  const seenSources = new Set<string>();

  // Resolve target object to inspect user edits on cards
  const targetObj = await resolveObject(targetKey);
  const currentCards: { q: string; a: string; ex?: string }[] = Array.isArray((targetObj?.raw as any)?.cards)
    ? (targetObj!.raw as any).cards
    : [];

  for (const edge of sourceEdges) {
    if (seenSources.has(edge.sourceKey)) continue;
    seenSources.add(edge.sourceKey);

    const meta = edge.rel.meta || {};
    const srcObj = await resolveObject(edge.sourceKey, {
      title: meta.toTitle || meta.fromTitle,
      url: meta.toUrl || meta.fromUrl,
      course: edge.rel.course,
      courseId: edge.rel.courseId,
      topic: edge.rel.topic,
    });

    const initialFps = new Set<string>(Array.isArray(meta.initialCardFingerprints) ? meta.initialCardFingerprints : []);
    const userEditedCardCount = initialFps.size
      ? currentCards.filter((c) => !initialFps.has(cardFingerprint(c.q, c.a))).length
      : 0;

    if (!srcObj || srcObj.status === 'missing' || srcObj.status === 'deleted') {
      reports.push({
        targetKey,
        sourceKey: edge.sourceKey,
        relationshipKey: edge.rel.key,
        status: 'sourceMissing',
        derivedRevision: meta.sourceRevision,
        derivedHash: meta.sourceContentHash,
        acknowledgedRevision: meta.acknowledgedRevision,
        sourceTitle: srcObj?.title || meta.toTitle || edge.sourceKey,
        sourceUrl: srcObj?.url || defaultUrlForRef(edge.sourceKey),
        sourceSnapshot: String(meta.sourceSnapshot || meta.excerpt || ''),
        currentContent: '',
        addedExcerpts: [],
        removedExcerpts: [],
        proposedNewCards: [],
        userEditedCardCount,
        totalCardCount: currentCards.length,
      });
      continue;
    }

    if (srcObj.status === 'trashed') {
      reports.push({
        targetKey,
        sourceKey: edge.sourceKey,
        relationshipKey: edge.rel.key,
        status: 'sourceTrashed',
        derivedRevision: meta.sourceRevision,
        currentRevision: srcObj.revision,
        derivedHash: meta.sourceContentHash,
        currentHash: srcObj.contentHash,
        acknowledgedRevision: meta.acknowledgedRevision,
        sourceTitle: srcObj.title,
        sourceUrl: srcObj.url,
        sourceSnapshot: String(meta.sourceSnapshot || meta.excerpt || ''),
        currentContent: srcObj.contentText || '',
        addedExcerpts: [],
        removedExcerpts: [],
        proposedNewCards: [],
        userEditedCardCount,
        totalCardCount: currentCards.length,
      });
      continue;
    }

    const snapshot = String(meta.sourceSnapshot || meta.excerpt || '').trim();
    const currentText = String(srcObj.contentText || '').trim();
    const derivedHash = meta.sourceContentHash || (snapshot ? computeContentHash(snapshot) : undefined);
    const currentHash = srcObj.contentHash || computeContentHash(currentText);
    const ackHash = meta.acknowledgedHash;
    const ackRev = meta.acknowledgedRevision;

    const hashChanged = Boolean(
      derivedHash &&
        currentHash &&
        currentText.length > 0 &&
        currentHash !== derivedHash &&
        currentHash !== ackHash,
    );
    const revChanged = Boolean(
      !derivedHash &&
        meta.sourceRevision != null &&
        srcObj.revision != null &&
        srcObj.revision !== meta.sourceRevision &&
        srcObj.revision !== ackRev,
    );

    const isChanged = hashChanged || revChanged;

    const oldLines = snapshot
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const newLines = currentText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);
    const addedExcerpts = newLines.filter((l) => !oldSet.has(l));
    const removedExcerpts = oldLines.filter((l) => !newSet.has(l));

    // Propose candidate cards from added/modified excerpts that are not already in the deck
    const existingCardFps = new Set(currentCards.map((c) => cardFingerprint(c.q, c.a)));
    const existingAnswersLower = new Set(currentCards.map((c) => String(c.a || '').trim().toLowerCase()));
    const rawCandidates = isChanged
      ? extractCandidateCardsFromText(
          addedExcerpts.length > 0 ? addedExcerpts.join('\n') : currentText,
          srcObj.title,
        )
      : [];
    const proposedNewCards = rawCandidates.filter(
      (c) =>
        !existingCardFps.has(cardFingerprint(c.q, c.a)) &&
        !existingAnswersLower.has(c.a.trim().toLowerCase()),
    );

    reports.push({
      targetKey,
      sourceKey: edge.sourceKey,
      relationshipKey: edge.rel.key,
      status: isChanged ? 'sourceChanged' : 'fresh',
      derivedRevision: meta.sourceRevision,
      currentRevision: srcObj.revision,
      derivedHash,
      currentHash,
      acknowledgedRevision: meta.acknowledgedRevision,
      sourceTitle: srcObj.title,
      sourceUrl: srcObj.url,
      sourceSnapshot: snapshot,
      currentContent: currentText,
      addedExcerpts,
      removedExcerpts,
      proposedNewCards,
      userEditedCardCount,
      totalCardCount: currentCards.length,
    });
  }

  return reports;
}

/** Acknowledge a source change without modifying any user-edited cards in the deck. */
export async function acknowledgeSourceChange(
  targetRef: string | Partial<ObjectRef>,
  sourceRef: string | Partial<ObjectRef>,
): Promise<boolean> {
  const targetKey = formatRefKey(targetRef);
  const sourceKey = formatRefKey(sourceRef);
  if (!targetKey || !sourceKey) return false;
  const srcObj = await resolveObject(sourceKey);
  const currentContent = srcObj?.contentText || '';
  const currentHash = srcObj?.contentHash || computeContentHash(currentContent);
  const currentRevision = srcObj?.revision ?? Date.now();

  const ok = await updateRelationshipMeta(targetKey, sourceKey, 'derivedFrom', {
    acknowledgedRevision: currentRevision,
    acknowledgedHash: currentHash,
    sourceRevision: currentRevision,
    sourceContentHash: currentHash,
    sourceSnapshot: currentContent || undefined,
  });

  const it = (window as any).iterra;
  try {
    await it?.events?.emit?.('sourceChangeReviewed', {
      targetKey,
      sourceKey,
      action: 'acknowledged',
      revision: currentRevision,
    });
  } catch {
    /* best effort */
  }
  return ok;
}

/** Apply user-reviewed card additions from an updated source note into a Flashcards deck,
    preserving all existing/user-edited cards untouched (§2). */
export async function applyReviewedDeckUpdate(
  deckId: string,
  sourceRef: string | Partial<ObjectRef>,
  approvedCards: CandidateCard[],
): Promise<{ ok: boolean; addedCount: number; totalCount: number; error?: string }> {
  const sourceKey = formatRefKey(sourceRef);
  if (!deckId || !sourceKey) {
    return { ok: false, addedCount: 0, totalCount: 0, error: 'Deck ID and source reference are required' };
  }
  try {
    const raw = localStorage.getItem('cardfile.decks.v1');
    const decks: Record<string, any> = raw ? JSON.parse(raw) : {};
    const deck = decks[deckId];
    if (!deck || !Array.isArray(deck.cards)) {
      return { ok: false, addedCount: 0, totalCount: 0, error: `Deck ${deckId} not found` };
    }

    const existingFps = new Set(deck.cards.map((c: any) => cardFingerprint(c.q, c.a)));
    let addedCount = 0;
    for (const c of approvedCards) {
      const q = String(c.q || '').trim();
      const a = String(c.a || '').trim();
      const ex = String(c.ex || '').trim();
      if (!q || !a) continue;
      const fp = cardFingerprint(q, a);
      if (existingFps.has(fp)) continue;
      existingFps.add(fp);
      const cardId = `${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
      deck.cards.push({
        id: cardId,
        q,
        a,
        ex,
        starred: false,
        status: 'new',
      });
      addedCount++;
    }

    deck.updatedAt = Date.now();
    localStorage.setItem('cardfile.decks.v1', JSON.stringify(decks));

    // Sync in-memory Flashcards state if mounted
    const fcApp = (window as any).__fcApp;
    if (fcApp?.state?.decks) {
      fcApp.state.decks[deckId] = deck;
      try {
        fcApp.saveStore?.();
      } catch {
        /* ignore */
      }
    }

    await acknowledgeSourceChange(`flashcards:deck:${deckId}`, sourceKey);
    return { ok: true, addedCount, totalCount: deck.cards.length };
  } catch (e) {
    return { ok: false, addedCount: 0, totalCount: 0, error: String(e) };
  }
}
