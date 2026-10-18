/* ── Cross-Module Commands & Events (§3, §4, §5) ────────────────────────────
   Commands request work, validate inputs, carry object and course/topic
   references, enforce idempotency, write durable state across stores,
   record bidirectional relationships, and emit outcome events ONLY after
   the durable state has committed. */

import type {
  ActiveSessionContext,
  CandidateCard,
  CommandResult,
  FollowUpTask,
  ObjectRef,
  RelationshipRecord,
  SessionOutcomeKind,
  SourceBlockExcerpt,
} from './types';
import {
  computeContentHash,
  defaultUrlForRef,
  formatRefKey,
  makeRef,
  normalizeTopicSlug,
  parseRef,
  resolveCanonicalCourse,
  resolveObject,
  saveFollowUpTask,
} from './identity';
import {
  addRelationship,
  cardFingerprint,
  getRelationshipsFor,
} from './relationships';
import {
  getWorkflowContext,
  recordWorkflowHandoff,
  setActiveSessionInContext,
} from './context';

const SESSION_OUTCOMES_KEY = 'iterra.v1.sessionOutcomes';
const LIVE_SESSION_KEY = 'timer.session.live.v1';

/* ── Internal Store Synchronization Helpers ────────────────────────────── */

function readZustandWrapper(storageKey: string): { state: Record<string, any>; version: number } {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { state: {}, version: 1 };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'state' in parsed) {
      return { state: parsed.state || {}, version: typeof parsed.version === 'number' ? parsed.version : 1 };
    }
    return { state: parsed || {}, version: 1 };
  } catch {
    return { state: {}, version: 1 };
  }
}

function writeZustandWrapper(storageKey: string, state: Record<string, any>, version = 1): void {
  localStorage.setItem(storageKey, JSON.stringify({ state, version }));
}

/* a write through localStorage is invisible to a mounted zustand store —
   without a live sync the next in-memory mutation rewrites the file from
   stale state and silently undoes the command. Each app's store module
   publishes its handle on window (e.g. __syllabusFolioStore); merge the
   persisted keys into it. setState merges top-level, and `state` here is
   the persisted (partialize) subset — data keys only, never actions. */
function syncLiveStore(globalName: string, state: Record<string, any>): void {
  try {
    (window as any)[globalName]?.setState?.({ ...state });
  } catch {
    /* store not mounted — the LS write is the truth it boots from */
  }
}

function notifyStoreChange(app: string): void {
  try {
    window.dispatchEvent(new CustomEvent('iterra:authoritative-write', { detail: { app, at: Date.now() } }));
    window.postMessage({ type: 'iterra:wake', app }, window.location.origin || '*');
  } catch {
    /* ignore in headless test environments */
  }
}

async function emitHubEvent(type: string, payload: Record<string, unknown>): Promise<void> {
  const it = (window as any).iterra;
  if (it?.events?.emit) {
    try {
      await it.events.emit(type, payload);
    } catch {
      /* best effort */
    }
  }
}

async function putHubEntity(entity: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
  const it = (window as any).iterra;
  if (it?.store?.put) {
    try {
      const r = await it.store.put(entity);
      if (r && r.ok !== false) return r.entity || entity;
    } catch {
      /* fallback */
    }
  }
  return entity;
}

function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function uid(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMMAND 1: createDeckFromSelection (Ink / Margin → Flashcards Deck)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CreateDeckFromSelectionInput {
  sourceRef: string | Partial<ObjectRef>;
  deckTitle: string;
  cards: CandidateCard[];
  courseId?: string | null;
  course?: string | null;
  topic?: string | null;
  excerpt?: string;
  selectedBlocks?: SourceBlockExcerpt[];
  sourceSnapshot?: string;
  sourceRevision?: number | string;
  appendToDeckId?: string;
  workflowId?: string;
  idempotencyKey?: string;
}

export async function handleCreateDeckFromSelection(
  input: CreateDeckFromSelectionInput,
): Promise<CommandResult<{ deckId: string; deckTitle: string; cardCount: number; cardIds: string[] }>> {
  const srcRef = parseRef(input?.sourceRef);
  if (!srcRef) {
    return {
      ok: false,
      commandId: '',
      code: 'INVALID_SOURCE_REF',
      error: 'A valid source object reference (e.g. ink:note:<id> or margin:note:<id>) is required.',
    };
  }

  const rawCards = Array.isArray(input?.cards) ? input.cards : [];
  const validCards = rawCards
    .map((c) => ({
      q: String(c?.q ?? '').trim(),
      a: String(c?.a ?? '').trim(),
      ex: String(c?.ex ?? '').trim(),
      sourceBlockIndex: c?.sourceBlockIndex,
      sourceExcerpt: c?.sourceExcerpt,
    }))
    .filter((c) => c.q.length > 0 && c.a.length > 0);

  if (validCards.length === 0) {
    return {
      ok: false,
      commandId: '',
      code: 'EMPTY_CARDS',
      error: 'At least one card with both a question/front and answer/back is required.',
    };
  }

  // Resolve source object to verify existence and capture provenance
  const srcObj = await resolveObject(srcRef);
  if (!srcObj || srcObj.status === 'missing' || srcObj.status === 'deleted') {
    return {
      ok: false,
      commandId: '',
      code: 'SOURCE_NOT_FOUND',
      error: `Source object "${srcRef.key}" does not exist or has been deleted.`,
    };
  }
  if (srcObj.status === 'trashed') {
    return {
      ok: false,
      commandId: '',
      code: 'SOURCE_TRASHED',
      error: `Source note "${srcObj.title}" is in the wastebasket. Restore it before creating a deck.`,
    };
  }

  // Resolve course & topic context (explicit input > source object's explicit course/topic)
  const rawCourse = input.course !== undefined ? input.course : srcObj.course;
  const rawCourseId = input.courseId !== undefined ? input.courseId : srcObj.courseId;
  const courseInfo = await resolveCanonicalCourse(
    rawCourseId ? { courseId: rawCourseId, course: rawCourse || undefined } : rawCourse,
    { createIfMissing: Boolean(rawCourse && rawCourse.trim()) },
  );
  const courseId = courseInfo?.courseId || (rawCourseId || undefined);
  const course = courseInfo?.code || (rawCourse?.trim() || undefined);
  const topic = normalizeTopicSlug(input.topic !== undefined ? input.topic : srcObj.topic);

  const deckTitle = String(input.deckTitle || srcObj.title || 'Study Deck').trim() || 'Study Deck';

  // Read Flashcards authoritative store (`cardfile.decks.v1`)
  let decksMap: Record<string, any> = {};
  try {
    decksMap = JSON.parse(localStorage.getItem('cardfile.decks.v1') || '{}') || {};
  } catch {
    decksMap = {};
  }

  const now = Date.now();
  let deck = input.appendToDeckId && decksMap[input.appendToDeckId] ? decksMap[input.appendToDeckId] : null;
  if (!deck) {
    const deckId = uid('d_');
    deck = {
      id: deckId,
      title: deckTitle,
      cards: [],
      flipped: false,
      createdAt: now,
      updatedAt: now,
      lastStudiedAt: 0,
      courseId,
      course,
      topic,
      sourceRef: srcObj.key,
      sourceTitle: srcObj.title,
      sourceUrl: srcObj.url,
    };
    decksMap[deckId] = deck;
  } else {
    deck.title = deckTitle || deck.title;
    if (courseId) deck.courseId = courseId;
    if (course) deck.course = course;
    if (topic) deck.topic = topic;
    deck.updatedAt = now;
  }

  const existingFps = new Set<string>(
    (deck.cards || []).map((c: any) => cardFingerprint(c.q, c.a)),
  );
  const createdCards: any[] = [];
  for (const c of validCards) {
    const fp = cardFingerprint(c.q, c.a);
    if (existingFps.has(fp)) continue;
    existingFps.add(fp);
    const card = {
      id: uid('c_'),
      q: c.q,
      a: c.a,
      ex: c.ex || '',
      starred: false,
      status: 'new',
      sourceRef: srcObj.key,
      sourceBlockIndex: c.sourceBlockIndex,
    };
    deck.cards.push(card);
    createdCards.push(card);
  }

  localStorage.setItem('cardfile.decks.v1', JSON.stringify(decksMap));
  localStorage.setItem('cardfile.lastDeck', deck.id);

  // Update in-memory Flashcards state if mounted
  const fcApp = (window as any).__fcApp;
  if (fcApp?.state?.decks) {
    fcApp.state.decks[deck.id] = deck;
    fcApp.state.currentId = deck.id;
    try {
      fcApp.selectDeck?.(deck.id);
    } catch {
      /* ignore */
    }
  }
  notifyStoreChange('flashcards');

  const deckKey = `flashcards:deck:${deck.id}`;
  const deckUrl = `/apps/flashcards/?deck=${encodeURIComponent(deck.id)}`;
  const dueCount = deck.cards.filter((c: any) => c.status !== 'mastered').length;

  // Mirror deck & card entities into canonical store
  const deckEnt = await putHubEntity({
    app: 'flashcards',
    type: 'deck',
    id: deck.id,
    courseId,
    course,
    topic,
    title: deck.title,
    sub: `${dueCount} due`,
    url: deckUrl,
    createdAt: deck.createdAt,
    data: {
      count: deck.cards.length,
      due: dueCount,
      sourceRef: srcObj.key,
      sourceTitle: srcObj.title,
      topic,
    },
  });

  for (const card of deck.cards) {
    await putHubEntity({
      app: 'flashcards',
      type: 'card',
      id: card.id,
      courseId,
      course,
      topic,
      title: String(card.q).slice(0, 160),
      sub: String(card.a).slice(0, 200),
      url: deckUrl,
      createdAt: deck.createdAt,
      data: {
        deckId: deck.id,
        status: card.status,
        dueAt: card.status === 'mastered' ? null : 0,
        sourceRef: srcObj.key,
      },
    });
  }

  // Provenance snapshot & blocks
  const sourceSnapshot = String(
    input.sourceSnapshot ?? srcObj.contentText ?? input.excerpt ?? '',
  ).slice(0, 16000);
  const sourceRevision = input.sourceRevision ?? srcObj.revision ?? now;
  const sourceContentHash = computeContentHash(sourceSnapshot);
  const initialCardFingerprints = deck.cards.map((c: any) => cardFingerprint(c.q, c.a));

  const relationships: RelationshipRecord[] = [];

  // 1. Primary deck -> source `derivedFrom` relationship
  const relRes = await addRelationship({
    from: {
      key: deckKey,
      app: 'flashcards',
      type: 'deck',
      id: deck.id,
      title: deck.title,
      url: deckUrl,
      courseId,
      course,
      topic,
    },
    to: {
      key: srcObj.key,
      app: srcObj.app,
      type: srcObj.type,
      id: srcObj.id,
      title: srcObj.title,
      url: srcObj.url,
      courseId,
      course,
      topic,
    },
    kind: 'derivedFrom',
    courseId,
    course,
    topic,
    workflowId: input.workflowId,
    meta: {
      fromTitle: deck.title,
      fromUrl: deckUrl,
      toTitle: srcObj.title,
      toUrl: srcObj.url,
      sourceKey: srcObj.key,
      sourceRevision,
      sourceContentHash,
      sourceSnapshot,
      excerpt: (input.excerpt || sourceSnapshot).slice(0, 1000),
      selectedBlocks: input.selectedBlocks,
      initialCardFingerprints,
    },
  });
  if (relRes.relationship) relationships.push(relRes.relationship);

  // 2. Also add card-level `derived` links from source -> card for backward compat with TerrainChips & wireCardSources
  for (const card of createdCards) {
    const cardRel = await addRelationship({
      from: srcObj.key,
      to: `flashcards:card:${card.id}`,
      kind: 'derived',
      courseId,
      course,
      topic,
      workflowId: input.workflowId,
      meta: {
        fromTitle: srcObj.title,
        fromUrl: srcObj.url,
        toTitle: card.q,
        toUrl: deckUrl,
        sourceKey: srcObj.key,
        sourceRevision,
        sourceContentHash,
      },
    });
    if (cardRel.relationship) relationships.push(cardRel.relationship);
  }

  // Update continuous workflow context
  recordWorkflowHandoff({
    workflowName: 'Note to Deck Study Chain',
    workflowId: input.workflowId,
    fromApp: srcObj.app,
    toApp: 'flashcards',
    action: 'createDeckFromSelection',
    sourceRef: makeRef(srcObj.app, srcObj.type, srcObj.id, {
      title: srcObj.title,
      url: srcObj.url,
      courseId,
      course,
      topic,
    }),
    targetRef: makeRef('flashcards', 'deck', deck.id, {
      title: deck.title,
      url: deckUrl,
      courseId,
      course,
      topic,
    }),
    courseId,
    course,
    topic,
  });

  // Emit completion events
  const eventPayload = {
    deckId: deck.id,
    deckKey,
    sourceKey: srcObj.key,
    count: createdCards.length,
    totalCards: deck.cards.length,
    courseId,
    course,
    topic,
    title: deck.title,
    text: `deck created: ${deck.title} (${deck.cards.length} cards from ${srcObj.title})`,
    url: deckUrl,
  };
  await emitHubEvent('deckCreated', eventPayload);
  await emitHubEvent('card.created', eventPayload);

  return {
    ok: true,
    commandId: '',
    ref: deckKey,
    entity: deckEnt,
    relationships,
    event: eventPayload,
    url: deckUrl,
    data: {
      deckId: deck.id,
      deckTitle: deck.title,
      cardCount: deck.cards.length,
      cardIds: createdCards.map((c) => c.id),
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMMAND 2: scheduleReviewBlock (Flashcards / Ink / Proof → Syllabus Block)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ScheduleReviewBlockInput {
  materialRef: string | Partial<ObjectRef>;
  title?: string;
  label?: string;
  plannedDate?: string;
  plannedStart?: string;
  plannedMinutes?: number;
  phase?: 'work' | 'review' | 'practice' | 'draft' | 'outline' | 'read' | 'check';
  courseId?: string | null;
  course?: string | null;
  topic?: string | null;
  commitmentId?: string;
  followUpForRef?: string | Partial<ObjectRef>;
  workflowId?: string;
  idempotencyKey?: string;
}

export async function handleScheduleReviewBlock(
  input: ScheduleReviewBlockInput,
): Promise<
  CommandResult<{
    blockId: string;
    blockRef: string;
    commitmentId: string;
    courseId: string;
    course: string;
    materialRef: string;
    plannedDate: string;
    plannedStart: string;
    plannedMinutes: number;
  }>
> {
  const matRef = parseRef(input?.materialRef);
  if (!matRef) {
    return {
      ok: false,
      commandId: '',
      code: 'INVALID_MATERIAL_REF',
      error: 'A valid study material reference (e.g. flashcards:deck:<id>, proof:problem:<id>, ink:note:<id>) is required.',
    };
  }

  const matObj = await resolveObject(matRef);
  if (!matObj || matObj.status === 'missing' || matObj.status === 'deleted') {
    return {
      ok: false,
      commandId: '',
      code: 'MATERIAL_NOT_FOUND',
      error: `Cannot schedule review block: target material "${matRef.key}" was not found.`,
    };
  }

  const plannedDate =
    input.plannedDate && /^\d{4}-\d{2}-\d{2}$/.test(input.plannedDate)
      ? input.plannedDate
      : todayLocalISO();
  const plannedStart =
    input.plannedStart && /^\d{2}:\d{2}$/.test(input.plannedStart)
      ? input.plannedStart
      : '16:00';
  const plannedMinutes = Math.max(5, Math.min(240, Math.round(Number(input.plannedMinutes) || 25)));
  const validPhases = ['work', 'review', 'practice', 'draft', 'outline', 'read', 'check'] as const;
  const defaultPhase = matObj.type === 'problem' || matObj.type === 'attempt' ? 'practice' : 'review';
  const phase = validPhases.includes(input.phase as any) ? input.phase! : defaultPhase;

  // Inherit course/topic from material or workflow context unless explicitly overridden by user
  const wfCtx = getWorkflowContext();
  const requestedCourse =
    input.course !== undefined
      ? input.course
      : matObj.course || wfCtx.course || 'GEN';
  const requestedCourseId =
    input.courseId !== undefined
      ? input.courseId
      : matObj.courseId || wfCtx.courseId || undefined;
  const topic = normalizeTopicSlug(
    input.topic !== undefined ? input.topic : matObj.topic || wfCtx.topic,
  );

  // Resolve or create the course in Syllabus so scheduling never fails with {url: null}
  const courseInfo = await resolveCanonicalCourse(
    requestedCourseId
      ? { courseId: requestedCourseId, course: requestedCourse || undefined }
      : requestedCourse || 'GEN',
    {
      createIfMissing: true,
      courseName: requestedCourse && requestedCourse !== 'GEN' ? requestedCourse : 'General Study',
    },
  );

  const localCourseId = courseInfo!.localId;
  const canonicalCourseId = courseInfo!.courseId;
  const courseCode = courseInfo!.code;

  const blockTitle =
    (input.title || input.label || '').trim() ||
    (matObj.type === 'deck'
      ? `Review deck: ${matObj.title}`
      : matObj.type === 'problem'
        ? `Retry problem: ${matObj.title}`
        : `Review: ${matObj.title}`);

  const nowIso = new Date().toISOString();
  const blockId = uid('b_');
  const linkId = uid('l_');

  // Update Syllabus authoritative store (`syllabus.folio.v1` + live `useFolio` if loaded)
  const wrapper = readZustandWrapper('syllabus.folio.v1');
  const st = wrapper.state;
  st.terms = st.terms || {};
  st.courses = st.courses || {};
  st.commitments = st.commitments || {};
  st.blocks = st.blocks || {};
  st.links = st.links || {};

  // Ensure course exists in st.courses
  if (!st.courses[localCourseId]) {
    const termId = st.activeTermId || Object.keys(st.terms)[0] || 't_default';
    if (!st.terms[termId]) {
      st.terms[termId] = {
        id: termId,
        name: 'Current Term',
        startDate: plannedDate,
        endDate: '2027-12-31',
        timezone: 'UTC',
        createdAt: nowIso,
      };
    }
    st.activeTermId = st.activeTermId || termId;
    st.courses[localCourseId] = {
      id: localCourseId,
      termId,
      code: courseCode,
      name: courseInfo!.name,
      color: 'teal',
      archived: false,
      createdAt: nowIso,
    };
  }

  // Find or create commitment
  let commitmentId = input.commitmentId && st.commitments[input.commitmentId] ? input.commitmentId : '';
  if (!commitmentId) {
    const existingOpen = Object.values(st.commitments)
      .filter((c: any) => c && c.courseId === localCourseId && c.status === 'open')
      .sort((a: any, b: any) => String(a.dueAt || '').localeCompare(String(b.dueAt || '')))[0] as any;
    if (existingOpen && existingOpen.title === blockTitle) {
      commitmentId = existingOpen.id;
    } else {
      commitmentId = uid('k_');
      st.commitments[commitmentId] = {
        id: commitmentId,
        courseId: localCourseId,
        type: phase === 'practice' ? 'assignment' : 'reading',
        title: blockTitle,
        detail: `Scheduled for ${matObj.app}:${matObj.type} "${matObj.title}"`,
        dueAt: `${plannedDate}T23:59:00.000Z`,
        weight: 0,
        estimatedMinutes: plannedMinutes,
        loggedMinutes: 0,
        status: 'open',
        pinned: false,
        dependencies: [],
        createdAt: nowIso,
      };
    }
  }

  const dayBlocks = Object.values(st.blocks).filter((b: any) => b && b.plannedDate === plannedDate);
  const newBlock = {
    id: blockId,
    commitmentId,
    plannedDate,
    plannedStart,
    plannedMinutes,
    state: 'planned',
    phase,
    label: blockTitle,
    reasons: [`Scheduled for ${matObj.title} (${matObj.app})`],
    score: 50,
    deferCount: 0,
    order: dayBlocks.length + 1,
    createdAt: nowIso,
    materialRef: matObj.key,
    materialUrl: matObj.url,
    materialTitle: matObj.title,
    topic,
  };
  st.blocks[blockId] = newBlock;

  const appTypeMap: Record<string, string> = {
    ink: 'ink',
    flashcards: 'flashcards',
    gradestack: 'gradestack',
    margin: 'modular',
  };
  const resourceLink = {
    id: linkId,
    commitmentId,
    courseId: localCourseId,
    app: appTypeMap[matObj.app] || 'other',
    resourceType: matObj.type,
    resourceId: matObj.id,
    label: matObj.title,
    deepLink: matObj.url,
    createdAt: nowIso,
  };
  st.links[linkId] = resourceLink;

  writeZustandWrapper('syllabus.folio.v1', st, wrapper.version);

  // Also sync live `useFolio` zustand store if loaded in memory
  try {
    const folioMod = (window as any).__syllabusFolioStore;
    if (folioMod?.setState) {
      folioMod.setState({
        terms: { ...st.terms },
        activeTermId: st.activeTermId,
        courses: { ...st.courses },
        commitments: { ...st.commitments },
        blocks: { ...st.blocks },
        links: { ...st.links },
      });
    }
  } catch {
    /* ignore */
  }
  notifyStoreChange('syllabus');

  const blockKey = `syllabus:block:${blockId}`;
  const blockUrl = `/apps/syllabus/?block=${encodeURIComponent(blockId)}`;

  // Mirror entities to canonical store
  await putHubEntity({
    app: 'syllabus',
    type: 'course',
    id: localCourseId,
    course: courseCode,
    title: courseInfo!.name,
    url: courseCode ? `#/c/${encodeURIComponent(courseCode)}` : '/apps/syllabus/',
    data: { code: courseCode, termId: st.courses[localCourseId].termId, color: 'teal' },
  });

  await putHubEntity({
    app: 'syllabus',
    type: 'commitment',
    id: commitmentId,
    courseId: canonicalCourseId,
    course: courseCode,
    topic,
    title: st.commitments[commitmentId].title,
    sub: st.commitments[commitmentId].type,
    url: `/apps/syllabus/?commitment=${encodeURIComponent(commitmentId)}`,
    data: {
      type: st.commitments[commitmentId].type,
      dueAt: st.commitments[commitmentId].dueAt,
      status: st.commitments[commitmentId].status,
      estimatedMinutes: st.commitments[commitmentId].estimatedMinutes,
      loggedMinutes: st.commitments[commitmentId].loggedMinutes,
      materialRef: matObj.key,
    },
  });

  const blockEnt = await putHubEntity({
    app: 'syllabus',
    type: 'block',
    id: blockId,
    courseId: canonicalCourseId,
    course: courseCode,
    topic,
    title: blockTitle,
    sub: `${plannedDate} · ${plannedMinutes}m`,
    url: blockUrl,
    data: {
      commitmentId,
      plannedDate,
      plannedStart,
      plannedMinutes,
      state: 'planned',
      phase,
      score: 50,
      materialRef: matObj.key,
      materialTitle: matObj.title,
      materialUrl: matObj.url,
      topic,
    },
  });

  const relationships: RelationshipRecord[] = [];
  const schedRel = await addRelationship({
    from: {
      key: blockKey,
      app: 'syllabus',
      type: 'block',
      id: blockId,
      title: blockTitle,
      url: blockUrl,
      courseId: canonicalCourseId,
      course: courseCode,
      topic,
    },
    to: {
      key: matObj.key,
      app: matObj.app,
      type: matObj.type,
      id: matObj.id,
      title: matObj.title,
      url: matObj.url,
      courseId: canonicalCourseId,
      course: courseCode,
      topic,
    },
    kind: 'scheduledFor',
    courseId: canonicalCourseId,
    course: courseCode,
    topic,
    workflowId: input.workflowId || wfCtx.originatingWorkflow?.id,
    meta: {
      fromTitle: blockTitle,
      fromUrl: blockUrl,
      toTitle: matObj.title,
      toUrl: matObj.url,
      plannedDate,
      plannedStart,
      plannedMinutes,
      commitmentId,
    },
  });
  if (schedRel.relationship) relationships.push(schedRel.relationship);

  if (input.followUpForRef) {
    const fuRef = parseRef(input.followUpForRef);
    if (fuRef) {
      const fuRel = await addRelationship({
        from: blockKey,
        to: fuRef.key,
        kind: 'followUpFor',
        courseId: canonicalCourseId,
        course: courseCode,
        topic,
        workflowId: input.workflowId || wfCtx.originatingWorkflow?.id,
        meta: {
          fromTitle: blockTitle,
          fromUrl: blockUrl,
          toTitle: fuRef.title || fuRef.key,
          toUrl: fuRef.url || defaultUrlForRef(fuRef),
        },
      });
      if (fuRel.relationship) relationships.push(fuRel.relationship);
    }
  }

  recordWorkflowHandoff({
    workflowName: wfCtx.originatingWorkflow?.name || 'Study Review Schedule',
    workflowId: input.workflowId || wfCtx.originatingWorkflow?.id,
    fromApp: matObj.app,
    toApp: 'syllabus',
    action: 'scheduleReviewBlock',
    sourceRef: makeRef(matObj.app, matObj.type, matObj.id, {
      title: matObj.title,
      url: matObj.url,
      courseId: canonicalCourseId,
      course: courseCode,
      topic,
    }),
    targetRef: makeRef('syllabus', 'block', blockId, {
      title: blockTitle,
      url: blockUrl,
      courseId: canonicalCourseId,
      course: courseCode,
      topic,
    }),
    plannedBlockRef: makeRef('syllabus', 'block', blockId, {
      title: blockTitle,
      url: blockUrl,
      courseId: canonicalCourseId,
      course: courseCode,
      topic,
    }),
    courseId: canonicalCourseId,
    course: courseCode,
    topic,
  });

  const evPayload = {
    blockId,
    blockKey,
    commitmentId,
    materialKey: matObj.key,
    materialTitle: matObj.title,
    courseId: canonicalCourseId,
    course: courseCode,
    topic,
    plannedDate,
    plannedStart,
    plannedMinutes,
    text: `scheduled review block: ${blockTitle} (${plannedMinutes}m)`,
    url: blockUrl,
  };
  await emitHubEvent('reviewBlockScheduled', evPayload);
  await emitHubEvent('materialAttached', evPayload);

  return {
    ok: true,
    commandId: '',
    ref: blockKey,
    entity: blockEnt,
    relationships,
    event: evPayload,
    url: blockUrl,
    data: {
      blockId,
      blockRef: blockKey,
      commitmentId,
      courseId: canonicalCourseId,
      course: courseCode,
      materialRef: matObj.key,
      plannedDate,
      plannedStart,
      plannedMinutes,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMMAND 3: attachMaterialToBlock
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AttachMaterialToBlockInput {
  blockRef: string | Partial<ObjectRef>;
  materialRef: string | Partial<ObjectRef>;
  courseId?: string;
  course?: string;
  topic?: string;
  workflowId?: string;
  idempotencyKey?: string;
}

export async function handleAttachMaterialToBlock(
  input: AttachMaterialToBlockInput,
): Promise<CommandResult<{ blockRef: string; materialRef: string }>> {
  const bRef = parseRef(input?.blockRef);
  const mRef = parseRef(input?.materialRef);
  if (!bRef || bRef.type !== 'block') {
    return { ok: false, commandId: '', code: 'INVALID_BLOCK_REF', error: 'Valid syllabus:block:<id> reference required.' };
  }
  if (!mRef) {
    return { ok: false, commandId: '', code: 'INVALID_MATERIAL_REF', error: 'Valid study material reference required.' };
  }

  const [bObj, mObj] = await Promise.all([resolveObject(bRef), resolveObject(mRef)]);
  if (!bObj || bObj.status === 'missing') {
    return { ok: false, commandId: '', code: 'BLOCK_NOT_FOUND', error: `Block "${bRef.key}" not found.` };
  }
  if (!mObj || mObj.status === 'missing') {
    return { ok: false, commandId: '', code: 'MATERIAL_NOT_FOUND', error: `Material "${mRef.key}" not found.` };
  }

  // Update Syllabus block record with attached material metadata
  const wrapper = readZustandWrapper('syllabus.folio.v1');
  const st = wrapper.state;
  if (st.blocks?.[bObj.id]) {
    st.blocks[bObj.id] = {
      ...st.blocks[bObj.id],
      materialRef: mObj.key,
      materialTitle: mObj.title,
      materialUrl: mObj.url,
    };
    writeZustandWrapper('syllabus.folio.v1', st, wrapper.version);
    try {
      (window as any).__syllabusFolioStore?.setState?.({ blocks: { ...st.blocks } });
    } catch {
      /* ignore */
    }
    notifyStoreChange('syllabus');
  }

  const relRes = await addRelationship({
    from: bObj.key,
    to: mObj.key,
    kind: 'scheduledFor',
    courseId: input.courseId || bObj.courseId || mObj.courseId,
    course: input.course || bObj.course || mObj.course,
    topic: input.topic || bObj.topic || mObj.topic,
    workflowId: input.workflowId,
    meta: {
      fromTitle: bObj.title,
      fromUrl: bObj.url,
      toTitle: mObj.title,
      toUrl: mObj.url,
    },
  });

  const evPayload = {
    blockKey: bObj.key,
    materialKey: mObj.key,
    courseId: bObj.courseId || mObj.courseId,
    course: bObj.course || mObj.course,
    url: bObj.url,
  };
  await emitHubEvent('materialAttached', evPayload);

  return {
    ok: true,
    commandId: '',
    ref: bObj.key,
    relationships: relRes.relationship ? [relRes.relationship] : [],
    event: evPayload,
    url: bObj.url,
    data: { blockRef: bObj.key, materialRef: mObj.key },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMMAND 4: startFocusSession (Syllabus Block / Material → Timer Session)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface StartFocusSessionInput {
  blockRef?: string | Partial<ObjectRef> | null;
  blockId?: string | null;
  commitmentId?: string | null;
  materialRef?: string | Partial<ObjectRef> | null;
  courseId?: string | null;
  course?: string | null;
  topic?: string | null;
  label?: string;
  plannedMinutes?: number;
  thenBreak?: number;
  from?: string;
  openMaterial?: boolean;
  workflowId?: string;
  idempotencyKey?: string;
}

export async function handleStartFocusSession(
  input: StartFocusSessionInput,
): Promise<
  CommandResult<{
    sessionId: string;
    blockRef: string | null;
    blockId: string | null;
    materialRef: string | null;
    materialTitle: string | null;
    materialUrl: string | null;
    timerUrl: string;
    plannedMinutes: number;
    courseId: string | null;
    course: string | null;
    topic: string | null;
  }>
> {
  /* a live session owns the face — writing a second blob would zombie it
     (the timer refuses the link, but the blob + shared.focus would already
     claim a session that never started). Decline up front; the caller can
     navigate to the existing session. */
  try {
    const live = JSON.parse(localStorage.getItem(LIVE_SESSION_KEY) || 'null');
    const liveMs = live?.running
      ? (live.endsAt || 0) - Date.now()
      : live?.paused
        ? (live.remainingSec || 0) * 1000
        : -1;
    if (live && liveMs > 0) {
      return {
        ok: false,
        commandId: '',
        code: 'SESSION_ACTIVE',
        error: `A focus session is already running${live.label ? ` — ${live.label}` : ''}.`,
      };
    }
  } catch {
    /* unreadable blob — proceed; the timer's own guards still apply */
  }

  const bKey = input.blockRef
    ? formatRefKey(input.blockRef)
    : input.blockId
      ? `syllabus:block:${input.blockId}`
      : null;

  let blockObj = bKey ? await resolveObject(bKey) : null;
  if (bKey && (!blockObj || blockObj.status === 'missing')) {
    return {
      ok: false,
      commandId: '',
      code: 'BLOCK_NOT_FOUND',
      error: `Planned block "${bKey}" was not found.`,
    };
  }

  // Discover attached study material from input, block metadata, or `scheduledFor` relationship
  let matKey = input.materialRef ? formatRefKey(input.materialRef) : null;
  if (!matKey && blockObj) {
    const rawBlock = blockObj.raw as any;
    if (rawBlock?.materialRef) {
      matKey = formatRefKey(rawBlock.materialRef);
    }
    if (!matKey) {
      const rels = await getRelationshipsFor(blockObj.key, { kind: 'scheduledFor' });
      const firstMat = rels.outgoing[0]?.to || rels.incoming[0]?.from;
      if (firstMat) matKey = firstMat;
    }
  }

  const matObj = matKey ? await resolveObject(matKey) : null;
  const rawBlock = (blockObj?.raw || {}) as any;

  const plannedMinutes = Math.max(
    1,
    Math.min(720, Math.round(Number(input.plannedMinutes ?? rawBlock.plannedMinutes) || 25)),
  );
  const courseId = input.courseId ?? blockObj?.courseId ?? matObj?.courseId ?? null;
  const course = input.course ?? blockObj?.course ?? matObj?.course ?? null;
  const topic = normalizeTopicSlug(input.topic ?? blockObj?.topic ?? matObj?.topic);
  const commitmentId = input.commitmentId ?? rawBlock.commitmentId ?? null;
  const label =
    (input.label || '').trim() ||
    (blockObj ? `${course ? `${course} — ` : ''}${blockObj.title}` : matObj ? `${course ? `${course} — ` : ''}${matObj.title}` : 'Focus Session');

  const sessionId = uid('sess_');
  const now = Date.now();
  const endsAt = now + plannedMinutes * 60 * 1000;
  const blockId = blockObj?.id ?? input.blockId ?? null;

  // Build Timer deep-link URL carrying block, material, and course bindings
  const q = new URLSearchParams();
  q.set('intent', label);
  q.set('minutes', String(plannedMinutes));
  if (course) q.set('course', course);
  if (courseId) q.set('courseId', courseId);
  if (topic) q.set('topic', topic);
  q.set('from', input.from || (blockId ? 'syllabus' : matObj?.app || 'terrain'));
  if (blockId) q.set('block', blockId);
  if (commitmentId) q.set('commitment', commitmentId);
  if (matObj) {
    q.set('material', matObj.key);
    q.set('materialTitle', matObj.title);
    q.set('materialUrl', matObj.url);
  }
  q.set('sessionId', sessionId);
  q.set('return', '/apps/syllabus');
  q.set('autostart', '1');
  if (input.thenBreak && input.thenBreak > 0) q.set('break', String(Math.round(input.thenBreak)));
  const timerUrl = `/apps/timer/?${q.toString()}`;

  // Mark block in-progress in Syllabus store if bound to a block
  if (blockId) {
    const wrapper = readZustandWrapper('syllabus.folio.v1');
    const st = wrapper.state;
    if (st.blocks?.[blockId] && st.blocks[blockId].state !== 'done') {
      st.blocks[blockId] = {
        ...st.blocks[blockId],
        state: 'in-progress',
        timerSessionUrl: timerUrl,
      };
      writeZustandWrapper('syllabus.folio.v1', st, wrapper.version);
      try {
        (window as any).__syllabusFolioStore?.setState?.({ blocks: { ...st.blocks } });
      } catch {
        /* ignore */
      }
      notifyStoreChange('syllabus');
    }
  }

  // Persist live session state so Timer & all other modules see it immediately and across reloads
  const livePayload = {
    sessionId,
    label,
    intent: label,
    blockId,
    blockRef: blockObj?.key ?? null,
    materialRef: matObj?.key ?? null,
    materialTitle: matObj?.title ?? null,
    materialUrl: matObj?.url ?? null,
    course,
    courseId,
    topic,
    totalMin: plannedMinutes,
    running: true,
    startedAt: now,
    endsAt,
    thenBreak: input.thenBreak || 0,
    syllabus: {
      sessionId,
      block: blockId || undefined,
      returnUrl: '/apps/syllabus',
      course: course || undefined,
      courseId: courseId || undefined,
      commitmentId: commitmentId || undefined,
      from: input.from || 'syllabus',
      materialRef: matObj?.key || undefined,
      materialTitle: matObj?.title || undefined,
      materialUrl: matObj?.url || undefined,
      topic: topic || undefined,
    },
  };
  try {
    localStorage.setItem(LIVE_SESSION_KEY, JSON.stringify(livePayload));
  } catch {
    /* ignore */
  }

  const it = (window as any).iterra;
  try {
    it?.doc?.('shared')?.setField?.('focus', {
      v: {
        sessionId,
        label,
        blockId,
        materialRef: matObj?.key ?? null,
        materialTitle: matObj?.title ?? null,
        materialUrl: matObj?.url ?? null,
        course,
        courseId,
        topic,
        totalMin: plannedMinutes,
        running: true,
        endsAt,
      },
      by: 'timer',
      at: now,
    });
  } catch {
    /* ignore */
  }

  const activeSessionCtx: ActiveSessionContext = {
    sessionId,
    blockRef: blockObj?.key ?? null,
    blockId,
    commitmentId,
    materialRef: matObj?.key ?? null,
    materialTitle: matObj?.title ?? null,
    materialUrl: matObj?.url ?? null,
    courseId,
    course,
    topic: topic ?? null,
    workflowId: input.workflowId ?? getWorkflowContext().originatingWorkflow?.id ?? null,
    label,
    startedAt: now,
    plannedMinutes,
    running: true,
    endsAt,
    from: input.from || 'syllabus',
    returnUrl: '/apps/syllabus',
  };
  setActiveSessionInContext(activeSessionCtx);

  try {
    window.dispatchEvent(new CustomEvent('timer:bind-session', { detail: livePayload }));
  } catch {
    /* ignore */
  }

  const evPayload = {
    sessionId,
    blockId,
    blockRef: blockObj?.key ?? null,
    materialRef: matObj?.key ?? null,
    materialTitle: matObj?.title ?? null,
    materialUrl: matObj?.url ?? null,
    courseId,
    course,
    topic,
    plannedMinutes,
    label,
    url: timerUrl,
  };
  await emitHubEvent('focusSessionStarted', evPayload);
  await emitHubEvent('session.started', evPayload);

  return {
    ok: true,
    commandId: '',
    ref: `timer:session:${sessionId}`,
    event: evPayload,
    url: timerUrl,
    data: {
      sessionId,
      blockRef: blockObj?.key ?? null,
      blockId,
      materialRef: matObj?.key ?? null,
      materialTitle: matObj?.title ?? null,
      materialUrl: matObj?.url ?? null,
      timerUrl,
      plannedMinutes,
      courseId,
      course,
      topic: topic ?? null,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMMAND 5: recordSessionOutcome (Timer Session → Outcome + Syllabus + Material)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RecordSessionOutcomeInput {
  sessionId?: string;
  blockRef?: string | Partial<ObjectRef> | null;
  blockId?: string | null;
  commitmentId?: string | null;
  materialRef?: string | Partial<ObjectRef> | null;
  outcome: SessionOutcomeKind;
  elapsedSeconds?: number;
  elapsedMinutes?: number;
  plannedMinutes?: number;
  confirmedByUser?: boolean;
  label?: string;
  courseId?: string | null;
  course?: string | null;
  topic?: string | null;
  notes?: string;
  /* when the session happened — manual/backfilled entries need a date the
     stats can file under; defaults to now for live-timed runs */
  at?: number;
  /* what produced the row — focus countdowns are the default; interval
     routes and stopwatch runs pass their own so the ledger stays honest */
  sessionKind?: 'focus' | 'break' | 'interval' | 'stopwatch';
  workflowId?: string;
  idempotencyKey?: string;
}

function readRecordedOutcomes(): Record<string, any> {
  try {
    return JSON.parse(localStorage.getItem(SESSION_OUTCOMES_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeRecordedOutcomes(map: Record<string, any>): void {
  try {
    /* bound the ledger — entries exist only to catch immediate retries, so
       keeping the most recent few hundred (insertion order) is plenty */
    const keys = Object.keys(map);
    for (const k of keys.slice(0, Math.max(0, keys.length - 500))) delete map[k];
    localStorage.setItem(SESSION_OUTCOMES_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function handleRecordSessionOutcome(
  input: RecordSessionOutcomeInput,
): Promise<
  CommandResult<{
    sessionId: string;
    outcome: SessionOutcomeKind;
    elapsedSeconds: number;
    elapsedMinutes: number;
    plannedMinutes: number;
    confirmedByUser: boolean;
    blockId: string | null;
    blockState: string | null;
    materialRef: string | null;
  }>
> {
  const validOutcomes: SessionOutcomeKind[] = ['completed', 'partial', 'canceled', 'interrupted'];
  if (!input || !validOutcomes.includes(input.outcome)) {
    return {
      ok: false,
      commandId: '',
      code: 'INVALID_OUTCOME',
      error: 'Session outcome must be one of: completed, partial, canceled, interrupted.',
    };
  }

  // Pull active session context as fallback for fields not explicitly repeated
  const wfCtx = getWorkflowContext();
  const active = wfCtx.activeSession;
  const sessionId = input.sessionId || active?.sessionId || uid('sess_');

  // Duplicate recording protection — by sessionId, and by the caller's
  // idempotencyKey when given (file-back retries must not double-log)
  const outcomesLedger = readRecordedOutcomes();
  const prior =
    outcomesLedger[sessionId] ??
    (input.idempotencyKey ? outcomesLedger[`idem:${input.idempotencyKey}`] : undefined);
  if (prior) {
    return {
      ...prior,
      deduplicated: true,
    };
  }

  const blockId =
    input.blockId ??
    (input.blockRef ? parseRef(input.blockRef)?.id : null) ??
    active?.blockId ??
    null;
  const blockKey = blockId ? `syllabus:block:${blockId}` : null;
  const materialKey =
    (input.materialRef ? formatRefKey(input.materialRef) : null) ??
    active?.materialRef ??
    null;

  // If blockKey exists and materialKey wasn't passed, check block's scheduledFor relationship
  let resolvedMaterialKey = materialKey;
  if (!resolvedMaterialKey && blockKey) {
    const rels = await getRelationshipsFor(blockKey, { kind: 'scheduledFor' });
    resolvedMaterialKey = rels.outgoing[0]?.to || null;
  }

  const plannedMinutes = Math.max(
    1,
    Math.round(Number(input.plannedMinutes ?? active?.plannedMinutes) || 25),
  );
  const rawElapsedSec =
    typeof input.elapsedSeconds === 'number' && Number.isFinite(input.elapsedSeconds)
      ? Math.max(0, Math.round(input.elapsedSeconds))
      : typeof input.elapsedMinutes === 'number' && Number.isFinite(input.elapsedMinutes)
        ? Math.max(0, Math.round(input.elapsedMinutes * 60))
        : input.outcome === 'completed'
          ? plannedMinutes * 60
          : 0;
  const elapsedSeconds = rawElapsedSec;
  const elapsedMinutes =
    input.outcome === 'canceled'
      ? 0
      : elapsedSeconds > 0
        ? Math.max(1, Math.round(elapsedSeconds / 60))
        : 0;
  const confirmedByUser = input.confirmedByUser !== false;

  const courseRaw = input.course ?? active?.course ?? null;
  const courseIdRaw = input.courseId ?? active?.courseId ?? null;
  const courseInfo = await resolveCanonicalCourse(
    courseIdRaw ? { courseId: courseIdRaw, course: courseRaw || undefined } : courseRaw,
  );
  const courseId = courseInfo?.courseId ?? courseIdRaw ?? undefined;
  const course = courseInfo?.code ?? courseRaw ?? undefined;
  const topic = normalizeTopicSlug(input.topic ?? active?.topic);
  const commitmentId = input.commitmentId ?? active?.commitmentId ?? undefined;
  const label = (input.label || active?.label || 'Focus Session').trim();
  const now = Date.now();
  const at =
    typeof input.at === 'number' && Number.isFinite(input.at) && input.at > 0
      ? Math.round(input.at)
      : now;

  // 1. Save session to Timer's authoritative store (`timer.sessions.v1`).
  //    Canceled runs are reconciled (block revert + canceled event + this
  //    ledger entry) but never land in the session log — the stats and CSV
  //    machinery can't distinguish outcome, so a scrubbed timer would
  //    otherwise count as banked focus time.
  let sessions: any[] = [];
  try {
    sessions = JSON.parse(localStorage.getItem('timer.sessions.v1') || '[]') || [];
  } catch {
    sessions = [];
  }
  const sessionKind =
    input.sessionKind === 'break' || input.sessionKind === 'interval' || input.sessionKind === 'stopwatch'
      ? input.sessionKind
      : 'focus';
  if (input.outcome !== 'canceled' && !sessions.some((s) => s && s.id === sessionId)) {
    const newSession = {
      id: sessionId,
      duration: elapsedSeconds,
      type: sessionKind,
      timestamp: at,
      label,
      preset: label,
      course,
      courseId,
      topic,
      commitmentId,
      blockId: blockId || undefined,
      materialRef: resolvedMaterialKey || undefined,
      outcome: input.outcome,
      plannedMinutes,
      confirmedByUser,
      notes: input.notes,
    };
    sessions.push(newSession);
    localStorage.setItem('timer.sessions.v1', JSON.stringify(sessions));
  }
  notifyStoreChange('timer');

  // 2. Mirror session entity to canonical store (`iterra.store`) — skipped
  //    for canceled runs: a scrubbed session isn't a workspace object, so it
  //    shouldn't surface in Recent Work or gather practicedIn edges. The
  //    canceled event + outcome ledger still carry the audit signal.
  const sessionKey = `timer:session:${sessionId}`;
  const sessionEnt = input.outcome === 'canceled' ? undefined : await putHubEntity({
    app: 'timer',
    type: 'session',
    id: sessionId,
    courseId,
    course,
    topic,
    title: label,
    sub: `${elapsedMinutes}m · ${input.outcome}`,
    url: '/apps/timer/',
    /* the entity timestamps the session, not the moment of logging — a
       backfilled entry belongs to its study day in recency ordering */
    createdAt: at,
    data: {
      minutes: elapsedMinutes,
      elapsedSeconds,
      plannedMinutes,
      sessionKind,
      outcome: input.outcome,
      confirmedByUser,
      label,
      blockId: blockId || undefined,
      blockRef: blockKey || undefined,
      commitmentId,
      materialRef: resolvedMaterialKey || undefined,
      startedAt: at - elapsedSeconds * 1000,
      endedAt: at,
      notes: input.notes,
    },
  });

  // 3. Update Syllabus block & commitment according to outcome semantics (§4.D):
  //    - 'completed': mark block 'done' and record actualMinutes
  //    - 'partial' / 'interrupted': record actualMinutes on block & commitment, keep block 'planned' (not 'done')
  //    - 'canceled': revert 'in-progress' to 'planned' without inflating minutes
  let finalBlockState: string | null = null;
  if (blockId) {
    const wrapper = readZustandWrapper('syllabus.folio.v1');
    const st = wrapper.state;
    const blk = st.blocks?.[blockId];
    if (blk) {
      const prevActual = typeof blk.actualMinutes === 'number' ? blk.actualMinutes : 0;
      const comm = st.commitments?.[blk.commitmentId];
      if (input.outcome === 'completed' && confirmedByUser) {
        const nextActual = prevActual + Math.max(1, elapsedMinutes || blk.plannedMinutes || 25);
        st.blocks[blockId] = {
          ...blk,
          state: 'done',
          actualMinutes: nextActual,
          completedAt: new Date(now).toISOString(),
          lastOutcome: 'completed',
        };
        finalBlockState = 'done';
        if (comm) {
          st.commitments[comm.id] = {
            ...comm,
            loggedMinutes: (comm.loggedMinutes || 0) + Math.max(1, elapsedMinutes || blk.plannedMinutes || 25),
            lastWorkedAt: new Date(now).toISOString(),
          };
        }
      } else if (input.outcome === 'partial' || input.outcome === 'interrupted') {
        const nextActual = prevActual + elapsedMinutes;
        st.blocks[blockId] = {
          ...blk,
          state: 'planned',
          actualMinutes: nextActual > 0 ? nextActual : blk.actualMinutes,
          lastOutcome: input.outcome,
        };
        finalBlockState = 'planned';
        if (comm && elapsedMinutes > 0) {
          st.commitments[comm.id] = {
            ...comm,
            loggedMinutes: (comm.loggedMinutes || 0) + elapsedMinutes,
            lastWorkedAt: new Date(now).toISOString(),
          };
        }
      } else if (input.outcome === 'canceled') {
        st.blocks[blockId] = {
          ...blk,
          state: blk.state === 'in-progress' ? 'planned' : blk.state,
          lastOutcome: 'canceled',
        };
        finalBlockState = st.blocks[blockId].state;
      }

      writeZustandWrapper('syllabus.folio.v1', st, wrapper.version);
      try {
        (window as any).__syllabusFolioStore?.setState?.({
          blocks: { ...st.blocks },
          commitments: { ...st.commitments },
        });
      } catch {
        /* ignore */
      }

      const updatedBlk = st.blocks[blockId];
      await putHubEntity({
        app: 'syllabus',
        type: 'block',
        id: blockId,
        courseId,
        course,
        topic,
        title: updatedBlk.label || comm?.title || label,
        sub: `${updatedBlk.plannedDate} · ${updatedBlk.actualMinutes ?? updatedBlk.plannedMinutes}m · ${updatedBlk.state}`,
        url: `/apps/syllabus/?block=${encodeURIComponent(blockId)}`,
        data: {
          commitmentId: updatedBlk.commitmentId,
          plannedDate: updatedBlk.plannedDate,
          plannedStart: updatedBlk.plannedStart,
          plannedMinutes: updatedBlk.plannedMinutes,
          actualMinutes: updatedBlk.actualMinutes,
          state: updatedBlk.state,
          phase: updatedBlk.phase,
          score: updatedBlk.score,
          lastOutcome: input.outcome,
          materialRef: updatedBlk.materialRef || resolvedMaterialKey,
        },
      });
      notifyStoreChange('syllabus');
    }
  }

  // 4. Record `practicedIn` relationships (session -> block, session ->
  //    material) — a canceled run practiced nothing, so it leaves no edges.
  const relationships: RelationshipRecord[] = [];
  const outcomeMeta = {
    outcome: input.outcome,
    elapsedSeconds,
    elapsedMinutes,
    plannedMinutes,
    confirmedByUser,
  };

  if (input.outcome !== 'canceled' && blockKey) {
    const bObj = await resolveObject(blockKey);
    const relBlock = await addRelationship({
      from: {
        key: sessionKey,
        app: 'timer',
        type: 'session',
        id: sessionId,
        title: label,
        url: '/apps/timer/',
        courseId,
        course,
        topic,
      },
      to: {
        key: blockKey,
        app: 'syllabus',
        type: 'block',
        id: blockId!,
        title: bObj?.title || label,
        url: `/apps/syllabus/?block=${encodeURIComponent(blockId!)}`,
        courseId,
        course,
        topic,
      },
      kind: 'practicedIn',
      courseId,
      course,
      topic,
      workflowId: input.workflowId || active?.workflowId || undefined,
      meta: {
        fromTitle: `${label} (${elapsedMinutes}m · ${input.outcome})`,
        fromUrl: '/apps/timer/',
        toTitle: bObj?.title || label,
        toUrl: `/apps/syllabus/?block=${encodeURIComponent(blockId!)}`,
        ...outcomeMeta,
      },
    });
    if (relBlock.relationship) relationships.push(relBlock.relationship);
  }

  if (input.outcome !== 'canceled' && resolvedMaterialKey) {
    const mObj = await resolveObject(resolvedMaterialKey);
    const relMat = await addRelationship({
      from: {
        key: sessionKey,
        app: 'timer',
        type: 'session',
        id: sessionId,
        title: label,
        url: '/apps/timer/',
        courseId,
        course,
        topic,
      },
      to: {
        key: resolvedMaterialKey,
        app: mObj?.app || resolvedMaterialKey.split(':')[0],
        type: mObj?.type || resolvedMaterialKey.split(':')[1],
        id: mObj?.id || resolvedMaterialKey.split(':').slice(2).join(':'),
        title: mObj?.title || resolvedMaterialKey,
        url: mObj?.url || defaultUrlForRef(resolvedMaterialKey),
        courseId,
        course,
        topic,
      },
      kind: 'practicedIn',
      courseId,
      course,
      topic,
      workflowId: input.workflowId || active?.workflowId || undefined,
      meta: {
        fromTitle: `${label} (${elapsedMinutes}m · ${input.outcome})`,
        fromUrl: '/apps/timer/',
        toTitle: mObj?.title || resolvedMaterialKey,
        toUrl: mObj?.url || defaultUrlForRef(resolvedMaterialKey),
        ...outcomeMeta,
      },
    });
    if (relMat.relationship) relationships.push(relMat.relationship);
  }

  // 5. Clear live session state — but only OURS. A backfilled log entry or
  //    an interval-route finish runs this command while a focus countdown
  //    keeps ticking elsewhere: wiping its blob would break reload-restore
  //    and drop the terrain's "focusing" chip mid-session.
  try {
    const live = JSON.parse(localStorage.getItem(LIVE_SESSION_KEY) || 'null');
    /* only when no session is live, or the live one IS this session — a
       live blob missing sessionId belongs to someone else, not us */
    if (!live || live.sessionId === sessionId) {
      localStorage.removeItem(LIVE_SESSION_KEY);
      (window as any).iterra?.doc?.('shared')?.setField?.('focus', {
        v: null,
        by: 'timer',
        at: now,
      });
      setActiveSessionInContext(null);
    }
  } catch {
    /* ignore */
  }

  // 6. Emit outcome events
  const eventPayload = {
    sessionId,
    sessionKey,
    outcome: input.outcome,
    minutes: elapsedMinutes,
    elapsedSeconds,
    plannedMinutes,
    confirmedByUser,
    blockId,
    blockKey,
    materialRef: resolvedMaterialKey,
    courseId,
    course,
    topic,
    text: `session ${input.outcome}: ${label} (${elapsedMinutes}m)`,
    url: blockKey ? `/apps/syllabus/?block=${encodeURIComponent(blockId!)}` : '/apps/timer/',
  };

  if (input.outcome === 'completed') {
    await emitHubEvent('focusSessionCompleted', eventPayload);
    await emitHubEvent('session.completed', eventPayload);
  } else if (input.outcome === 'partial') {
    await emitHubEvent('focusSessionCompleted', eventPayload);
    if (elapsedMinutes > 0) await emitHubEvent('session.completed', eventPayload);
  } else if (input.outcome === 'interrupted') {
    await emitHubEvent('focusSessionInterrupted', eventPayload);
  } else if (input.outcome === 'canceled') {
    await emitHubEvent('focusSessionCanceled', eventPayload);
  }

  const finalResult: CommandResult<{
    sessionId: string;
    outcome: SessionOutcomeKind;
    elapsedSeconds: number;
    elapsedMinutes: number;
    plannedMinutes: number;
    confirmedByUser: boolean;
    blockId: string | null;
    blockState: string | null;
    materialRef: string | null;
  }> = {
    ok: true,
    commandId: '',
    ref: sessionKey,
    entity: sessionEnt,
    relationships,
    event: eventPayload,
    url: blockKey ? `/apps/syllabus/?block=${encodeURIComponent(blockId!)}` : '/apps/timer/',
    data: {
      sessionId,
      outcome: input.outcome,
      elapsedSeconds,
      elapsedMinutes,
      plannedMinutes,
      confirmedByUser,
      blockId,
      blockState: finalBlockState,
      materialRef: resolvedMaterialKey,
    },
  };

  outcomesLedger[sessionId] = finalResult;
  if (input.idempotencyKey) outcomesLedger[`idem:${input.idempotencyKey}`] = finalResult;
  writeRecordedOutcomes(outcomesLedger);
  return finalResult;
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMMAND 6: attachSourceMaterial (Margin → Ink Note / Flashcards Deck)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AttachSourceMaterialInput {
  sourceRef: string | Partial<ObjectRef>;
  targetKind: 'ink-note' | 'flashcards-deck';
  title: string;
  content?: string;
  cards?: CandidateCard[];
  appendToNoteId?: string;
  appendToDeckId?: string;
  courseId?: string | null;
  course?: string | null;
  topic?: string | null;
  excerpt?: string;
  selectedBlocks?: SourceBlockExcerpt[];
  sourceSnapshot?: string;
  sourceRevision?: number | string;
  reviewedByUser: boolean;
  workflowId?: string;
  idempotencyKey?: string;
}

export async function handleAttachSourceMaterial(
  input: AttachSourceMaterialInput,
): Promise<CommandResult<{ targetRef: string; targetUrl: string; targetKind: string }>> {
  if (!input?.reviewedByUser) {
    return {
      ok: false,
      commandId: '',
      code: 'REVIEW_REQUIRED',
      error: 'Generated or parsed source content must be reviewed by the user before saving.',
    };
  }

  const srcRef = parseRef(input.sourceRef);
  if (!srcRef) {
    return {
      ok: false,
      commandId: '',
      code: 'INVALID_SOURCE_REF',
      error: 'A valid source reference (e.g. margin:note:<id>) is required.',
    };
  }

  if (input.targetKind === 'flashcards-deck') {
    const deckRes = await handleCreateDeckFromSelection({
      sourceRef: srcRef,
      deckTitle: input.title,
      cards: input.cards || [],
      courseId: input.courseId,
      course: input.course,
      topic: input.topic,
      excerpt: input.excerpt,
      selectedBlocks: input.selectedBlocks,
      sourceSnapshot: input.sourceSnapshot,
      sourceRevision: input.sourceRevision,
      appendToDeckId: input.appendToDeckId,
      workflowId: input.workflowId,
    });
    if (!deckRes.ok) {
      return {
        ok: false,
        commandId: '',
        code: deckRes.code,
        error: deckRes.error,
      };
    }
    await emitHubEvent('sourceMaterialAttached', {
      sourceKey: srcRef.key,
      targetKey: deckRes.ref,
      targetKind: 'flashcards-deck',
      courseId: input.courseId,
      course: input.course,
      topic: input.topic,
      url: deckRes.url,
    });
    return {
      ok: true,
      commandId: '',
      ref: deckRes.ref,
      entity: deckRes.entity,
      relationships: deckRes.relationships,
      url: deckRes.url,
      data: {
        targetRef: deckRes.ref!,
        targetUrl: deckRes.url!,
        targetKind: 'flashcards-deck',
      },
    };
  }

  // targetKind === 'ink-note'
  const bodyText = String(input.content || input.excerpt || '').trim();
  if (!bodyText) {
    return {
      ok: false,
      commandId: '',
      code: 'EMPTY_CONTENT',
      error: 'Cannot attach empty content to an Ink note.',
    };
  }

  const srcObj = await resolveObject(srcRef, {
    title: srcRef.title,
    url: srcRef.url,
    course: input.course || undefined,
    courseId: input.courseId || undefined,
    topic: input.topic || undefined,
  });

  const courseInfo = await resolveCanonicalCourse(
    input.courseId ? { courseId: input.courseId, course: input.course || undefined } : input.course || srcObj?.course,
  );
  const courseId = courseInfo?.courseId || input.courseId || srcObj?.courseId || undefined;
  const course = courseInfo?.code || input.course || srcObj?.course || undefined;
  const topic = normalizeTopicSlug(input.topic ?? srcObj?.topic);

  const noteTitle = String(input.title || srcObj?.title || 'Notes from Margin').trim();
  const now = Date.now();

  const wrapper = readZustandWrapper('ink-notes-storage');
  const st = wrapper.state;
  st.notes = Array.isArray(st.notes) ? st.notes : [];

  let noteId = input.appendToNoteId || '';
  let targetNote = noteId ? st.notes.find((n: any) => n && n.id === noteId && !n.trashedAt) : null;

  const paragraphs = bodyText
    .split(/\r?\n\r?\n|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] }));

  if (targetNote) {
    let existingDoc: any = { type: 'doc', content: [] };
    try {
      existingDoc = JSON.parse(targetNote.content);
    } catch {
      existingDoc = { type: 'doc', content: [] };
    }
    existingDoc.content = [
      ...(Array.isArray(existingDoc.content) ? existingDoc.content : []),
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: `Attached from ${srcObj?.title || srcRef.key}` }],
      },
      ...paragraphs,
    ];
    targetNote.content = JSON.stringify(existingDoc);
    targetNote.lastModified = now;
    targetNote.wordCount = (targetNote.wordCount || 0) + bodyText.split(/\s+/).length;
    if (course && !(targetNote.tags || []).includes(course)) {
      targetNote.tags = [...(targetNote.tags || []), course];
    }
  } else {
    noteId = uid('ink_');
    const tiptapDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: noteTitle }] },
        ...paragraphs,
      ],
    };
    const tags: string[] = [];
    if (course) tags.push(course);
    if (topic && !tags.includes(topic)) tags.push(topic);
    targetNote = {
      id: noteId,
      title: noteTitle,
      content: JSON.stringify(tiptapDoc),
      tags,
      courseId,
      course,
      topic,
      lastModified: now,
      createdAt: now,
      isPinned: false,
      folder: 'Unfiled',
      wordCount: bodyText.split(/\s+/).length,
      trashedAt: null,
      dailyKey: null,
    };
    st.notes = [targetNote, ...st.notes];
    st.activeNoteId = noteId;
  }

  writeZustandWrapper('ink-notes-storage', st, wrapper.version || 4);
  try {
    (window as any).__inkStore?.setState?.({
      notes: [...st.notes],
      activeNoteId: noteId,
    });
  } catch {
    /* ignore */
  }
  notifyStoreChange('ink');

  const noteKey = `ink:note:${noteId}`;
  const noteUrl = `/apps/ink/?note=${encodeURIComponent(noteId)}`;

  const noteEnt = await putHubEntity({
    app: 'ink',
    type: 'note',
    id: noteId,
    courseId,
    course,
    topic,
    title: targetNote.title,
    sub: bodyText.slice(0, 80),
    url: noteUrl,
    data: {
      updated: now,
      folder: targetNote.folder,
      tags: targetNote.tags,
      words: targetNote.wordCount,
      sourceRef: srcRef.key,
    },
  });

  const snapshot = String(input.sourceSnapshot || srcObj?.contentText || bodyText).slice(0, 16000);
  const revision = input.sourceRevision ?? srcObj?.revision ?? now;

  const relRes = await addRelationship({
    from: {
      key: noteKey,
      app: 'ink',
      type: 'note',
      id: noteId,
      title: targetNote.title,
      url: noteUrl,
      courseId,
      course,
      topic,
    },
    to: {
      key: srcRef.key,
      app: srcRef.app,
      type: srcRef.type,
      id: srcRef.id,
      title: srcObj?.title || input.title,
      url: srcObj?.url || defaultUrlForRef(srcRef),
      courseId,
      course,
      topic,
    },
    kind: 'derivedFrom',
    courseId,
    course,
    topic,
    workflowId: input.workflowId,
    meta: {
      fromTitle: targetNote.title,
      fromUrl: noteUrl,
      toTitle: srcObj?.title || input.title,
      toUrl: srcObj?.url || defaultUrlForRef(srcRef),
      sourceKey: srcRef.key,
      sourceRevision: revision,
      sourceContentHash: computeContentHash(snapshot),
      sourceSnapshot: snapshot,
      excerpt: bodyText.slice(0, 1000),
      selectedBlocks: input.selectedBlocks,
    },
  });

  recordWorkflowHandoff({
    workflowName: 'Margin Source to Ink Note',
    workflowId: input.workflowId,
    fromApp: srcRef.app,
    toApp: 'ink',
    action: 'attachSourceMaterial',
    sourceRef: srcRef,
    targetRef: makeRef('ink', 'note', noteId, { title: targetNote.title, url: noteUrl, courseId, course, topic }),
    courseId,
    course,
    topic,
  });

  const evPayload = {
    noteId,
    noteKey,
    sourceKey: srcRef.key,
    targetKind: 'ink-note',
    courseId,
    course,
    topic,
    title: targetNote.title,
    text: `source attached to ink: ${targetNote.title}`,
    url: noteUrl,
  };
  await emitHubEvent('sourceMaterialAttached', evPayload);
  await emitHubEvent('note.created', evPayload);

  return {
    ok: true,
    commandId: '',
    ref: noteKey,
    entity: noteEnt,
    relationships: relRes.relationship ? [relRes.relationship] : [],
    event: evPayload,
    url: noteUrl,
    data: {
      targetRef: noteKey,
      targetUrl: noteUrl,
      targetKind: 'ink-note',
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMMAND 7: scheduleProblemRetry / createFollowUpTask (Proof → Syllabus)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ScheduleProblemRetryInput {
  problemRef: string | Partial<ObjectRef>;
  attemptRef?: string | Partial<ObjectRef> | null;
  courseId?: string | null;
  course?: string | null;
  topic?: string | null;
  plannedDate?: string;
  plannedStart?: string;
  plannedMinutes?: number;
  reason?: string;
  repairCue?: string;
  divergence?: string;
  errorCategory?: string;
  workflowId?: string;
  idempotencyKey?: string;
}

export async function handleScheduleProblemRetry(
  input: ScheduleProblemRetryInput,
): Promise<
  CommandResult<{
    followUpId: string;
    followUpRef: string;
    blockId: string;
    blockRef: string;
    problemId: string;
    problemRef: string;
    attemptRef: string | null;
    problemUrl: string;
    blockUrl: string;
  }>
> {
  const probRef = parseRef(input?.problemRef);
  if (!probRef || probRef.type !== 'problem') {
    return {
      ok: false,
      commandId: '',
      code: 'INVALID_PROBLEM_REF',
      error: 'A valid proof:problem:<id> reference is required.',
    };
  }

  const probObj = await resolveObject(probRef);
  if (!probObj || probObj.status === 'missing') {
    return {
      ok: false,
      commandId: '',
      code: 'PROBLEM_NOT_FOUND',
      error: `Problem "${probRef.key}" does not exist in Proof.`,
    };
  }

  const attRef = input.attemptRef ? parseRef(input.attemptRef) : null;
  const attObj = attRef ? await resolveObject(attRef) : null;

  const courseInfo = await resolveCanonicalCourse(
    input.courseId
      ? { courseId: input.courseId, course: input.course || undefined }
      : input.course || probObj.course || 'MTH',
    { createIfMissing: true },
  );
  const courseId = courseInfo!.courseId;
  const course = courseInfo!.code;
  const topic = normalizeTopicSlug(input.topic ?? probObj.topic) || 'problem solving';
  const plannedDate =
    input.plannedDate && /^\d{4}-\d{2}-\d{2}$/.test(input.plannedDate)
      ? input.plannedDate
      : todayLocalISO();
  const plannedMinutes = Math.max(10, Math.min(180, Math.round(Number(input.plannedMinutes) || 30)));

  // 1. Update Proof's review schedule so the problem is marked due on `plannedDate`
  const wbWrapper = readZustandWrapper('proof.workbench.v1');
  const wb = wbWrapper.state;
  wb.reviews = wb.reviews || {};
  const existingRev = wb.reviews[probObj.id];
  wb.reviews[probObj.id] = {
    problemId: probObj.id,
    dueAt: `${plannedDate}T09:00:00.000Z`,
    interval: existingRev?.interval ?? 1,
    stability: existingRev?.stability ?? 0,
    lapses: (existingRev?.lapses ?? 0) + 1,
    lastResult: (attObj?.raw as any)?.result || 'incorrect',
    lastAttemptId: attObj?.id || existingRev?.lastAttemptId || '',
  };
  writeZustandWrapper('proof.workbench.v1', wb, wbWrapper.version || 1);
  syncLiveStore('__proofWorkbenchStore', wb);
  notifyStoreChange('proof');

  // 2. Schedule the linked retry block in Syllabus
  const retryTitle = `Retry problem: ${probObj.title}`;
  const blockRes = await handleScheduleReviewBlock({
    materialRef: {
      key: probObj.key,
      app: 'proof',
      type: 'problem',
      id: probObj.id,
      title: probObj.title,
      url: probObj.url,
      courseId,
      course,
      topic,
    },
    title: retryTitle,
    label: retryTitle,
    plannedDate,
    plannedStart: input.plannedStart || '16:00',
    plannedMinutes,
    phase: 'practice',
    courseId,
    course,
    topic,
    followUpForRef: attObj ? attObj.key : probObj.key,
    workflowId: input.workflowId,
  });

  if (!blockRes.ok || !blockRes.data) {
    return {
      ok: false,
      commandId: '',
      code: blockRes.code || 'SCHEDULE_FAILED',
      error: blockRes.error || 'Failed to schedule retry block in Syllabus.',
    };
  }

  // 3. Create durable FollowUpTask record
  const taskId = uid('fu_');
  const taskKey = `proof:followup:${taskId}`;
  const now = Date.now();
  const task: FollowUpTask = {
    id: taskId,
    key: taskKey,
    app: 'proof',
    title: retryTitle,
    detail:
      input.repairCue ||
      input.divergence ||
      input.reason ||
      `Scheduled retry for "${probObj.title}" (${topic})`,
    status: 'scheduled',
    courseId,
    course,
    topic,
    sourceRef: attObj ? attObj.key : probObj.key,
    targetRef: probObj.key,
    scheduledBlockRef: blockRes.data.blockRef,
    createdAt: now,
    updatedAt: now,
    meta: {
      problemId: probObj.id,
      attemptId: attObj?.id,
      repairCue: input.repairCue,
      divergence: input.divergence,
      errorCategory: input.errorCategory,
      plannedDate,
      plannedMinutes,
    },
  };
  await saveFollowUpTask(task);

  const relationships: RelationshipRecord[] = [...(blockRes.relationships || [])];
  const fuRel = await addRelationship({
    from: taskKey,
    to: attObj ? attObj.key : probObj.key,
    kind: 'followUpFor',
    courseId,
    course,
    topic,
    workflowId: input.workflowId,
    meta: {
      fromTitle: task.title,
      fromUrl: probObj.url,
      toTitle: attObj ? attObj.title : probObj.title,
      toUrl: attObj ? attObj.url : probObj.url,
      problemId: probObj.id,
      attemptId: attObj?.id,
      reason: task.detail,
    },
  });
  if (fuRel.relationship) relationships.push(fuRel.relationship);

  const taskToBlockRel = await addRelationship({
    from: blockRes.data.blockRef,
    to: taskKey,
    kind: 'followUpFor',
    courseId,
    course,
    topic,
    workflowId: input.workflowId,
    meta: {
      fromTitle: retryTitle,
      fromUrl: blockRes.url,
      toTitle: task.title,
      toUrl: probObj.url,
      problemId: probObj.id,
      attemptId: attObj?.id,
    },
  });
  if (taskToBlockRel.relationship) relationships.push(taskToBlockRel.relationship);

  const evPayload = {
    followUpId: taskId,
    followUpKey: taskKey,
    blockId: blockRes.data.blockId,
    blockKey: blockRes.data.blockRef,
    problemId: probObj.id,
    problemKey: probObj.key,
    attemptKey: attObj?.key ?? null,
    courseId,
    course,
    topic,
    plannedDate,
    plannedMinutes,
    text: `retry scheduled: ${probObj.title} (${plannedDate})`,
    url: blockRes.url,
  };
  await emitHubEvent('problemRetryScheduled', evPayload);
  await emitHubEvent('followUpTaskCreated', evPayload);

  return {
    ok: true,
    commandId: '',
    ref: blockRes.data.blockRef,
    relationships,
    event: evPayload,
    url: blockRes.url,
    data: {
      followUpId: taskId,
      followUpRef: taskKey,
      blockId: blockRes.data.blockId,
      blockRef: blockRes.data.blockRef,
      problemId: probObj.id,
      problemRef: probObj.key,
      attemptRef: attObj?.key ?? null,
      problemUrl: probObj.url,
      blockUrl: blockRes.url!,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMMAND 8: createTargetedReview (GradeStack → Targeted Review)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CreateTargetedReviewInput {
  assessmentRef: string | Partial<ObjectRef>;
  courseId?: string | null;
  course?: string | null;
  /** Optional explicit question -> topic mapping */
  questionTopics?: Record<number, string>;
  /** User-identified follow-up topics when question mappings are absent */
  selectedTopics?: string[];
  reviewKind?: 'syllabus-block' | 'flashcards-deck' | 'both';
  plannedDate?: string;
  plannedMinutes?: number;
  cards?: CandidateCard[];
  workflowId?: string;
  idempotencyKey?: string;
}

export async function handleCreateTargetedReview(
  input: CreateTargetedReviewInput,
): Promise<
  CommandResult<{
    assessmentRef: string;
    courseId: string;
    course: string;
    topics: string[];
    followUpRefs: string[];
    blockRef?: string;
    deckRef?: string;
  }>
> {
  const assessRef = parseRef(input?.assessmentRef);
  if (!assessRef || assessRef.type !== 'assessment') {
    return {
      ok: false,
      commandId: '',
      code: 'INVALID_ASSESSMENT_REF',
      error: 'A valid gradestack:assessment:<id> reference is required.',
    };
  }

  const assessObj = await resolveObject(assessRef);
  if (!assessObj || assessObj.status === 'missing') {
    return {
      ok: false,
      commandId: '',
      code: 'ASSESSMENT_NOT_FOUND',
      error: `Assessment "${assessRef.key}" was not found in GradeStack.`,
    };
  }

  const rawTest = (assessObj.raw || {}) as any;
  const mergedQuestionTopics: Record<number, string> = {
    ...(rawTest.questionTopics || {}),
    ...(input.questionTopics || {}),
  };

  const mappedTopics = Object.values(mergedQuestionTopics)
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  const manualTopics = (input.selectedTopics || [])
    .map((t) => String(t || '').trim())
    .filter(Boolean);

  const topics = Array.from(new Set([...manualTopics, ...mappedTopics]));

  // CRITICAL HONESTY REQUIREMENT (§5):
  // "Use question/topic mappings only if available, otherwise let the user
  //  identify follow-up topics manually, create or attach review work, do not
  //  infer detailed weaknesses from an overall score alone."
  if (topics.length === 0) {
    return {
      ok: false,
      commandId: '',
      code: 'TOPICS_REQUIRED',
      error:
        'Cannot infer detailed weaknesses from an overall score alone. Please provide question-to-topic mappings or select follow-up topics manually.',
    };
  }

  // Resolve and link assessment to canonical course
  const courseInfo = await resolveCanonicalCourse(
    input.courseId
      ? { courseId: input.courseId, course: input.course || undefined }
      : input.course || assessObj.course || rawTest.courseName || 'GEN',
    { createIfMissing: true },
  );
  const courseId = courseInfo!.courseId;
  const course = courseInfo!.code;

  // Persist course linkage & questionTopics on the GradeStack test record
  const gsWrapper = readZustandWrapper('gradestack-storage');
  const gs = gsWrapper.state;
  if (Array.isArray(gs.tests)) {
    gs.tests = gs.tests.map((t: any) =>
      t && t.id === assessObj.id
        ? {
            ...t,
            courseName: course,
            courseId,
            ...(Object.keys(mergedQuestionTopics).length > 0
              ? { questionTopics: mergedQuestionTopics }
              : {}),
          }
        : t,
    );
    writeZustandWrapper('gradestack-storage', gs, gsWrapper.version || 0);
    syncLiveStore('__gradestackStore', gs);
    notifyStoreChange('gradestack');
  }

  const relationships: RelationshipRecord[] = [];

  // Record `assessedBy` relationship: course -> assessment
  const assessedRel = await addRelationship({
    from: {
      key: courseId,
      app: 'syllabus',
      type: 'course',
      id: courseInfo!.localId,
      title: courseInfo!.name,
      url: `#/c/${encodeURIComponent(course)}`,
      courseId,
      course,
    },
    to: {
      key: assessObj.key,
      app: 'gradestack',
      type: 'assessment',
      id: assessObj.id,
      title: assessObj.title,
      url: assessObj.url,
      courseId,
      course,
    },
    kind: 'assessedBy',
    courseId,
    course,
    topic: topics[0],
    workflowId: input.workflowId,
    meta: {
      fromTitle: courseInfo!.name,
      fromUrl: `#/c/${encodeURIComponent(course)}`,
      toTitle: assessObj.title,
      toUrl: assessObj.url,
      topics,
      assessmentId: assessObj.id,
    },
  });
  if (assessedRel.relationship) relationships.push(assessedRel.relationship);

  const reviewKind = input.reviewKind || 'syllabus-block';
  let deckRef: string | undefined;
  let blockRef: string | undefined;
  let primaryUrl = assessObj.url;

  if (reviewKind === 'flashcards-deck' || reviewKind === 'both') {
    const cardsToCreate: CandidateCard[] =
      input.cards && input.cards.length > 0
        ? input.cards
        : topics.map((t, idx) => ({
            id: `rev-${idx + 1}`,
            q: `${t} — targeted review (${assessObj.title})`,
            a: `Review key concepts and common errors for ${t}`,
            ex: `Follow-up from ${assessObj.title}`,
          }));

    const deckRes = await handleCreateDeckFromSelection({
      sourceRef: {
        key: assessObj.key,
        app: 'gradestack',
        type: 'assessment',
        id: assessObj.id,
        title: assessObj.title,
        url: assessObj.url,
      },
      deckTitle: `${course} — ${assessObj.title} Review (${topics.join(', ')})`,
      cards: cardsToCreate,
      courseId,
      course,
      topic: topics[0],
      workflowId: input.workflowId,
    });
    if (deckRes.ok && deckRes.ref) {
      deckRef = deckRes.ref;
      primaryUrl = deckRes.url || primaryUrl;
      if (deckRes.relationships) relationships.push(...deckRes.relationships);
      const fuDeckRel = await addRelationship({
        from: deckRef,
        to: assessObj.key,
        kind: 'followUpFor',
        courseId,
        course,
        topic: topics[0],
        workflowId: input.workflowId,
        meta: {
          fromTitle: deckRes.data?.deckTitle,
          fromUrl: deckRes.url,
          toTitle: assessObj.title,
          toUrl: assessObj.url,
          topics,
          assessmentId: assessObj.id,
        },
      });
      if (fuDeckRel.relationship) relationships.push(fuDeckRel.relationship);
    }
  }

  if (reviewKind === 'syllabus-block' || reviewKind === 'both') {
    const targetMaterial = deckRef || assessObj.key;
    const blockTitle = `Targeted review: ${topics.join(', ')} (${assessObj.title})`;
    const blockRes = await handleScheduleReviewBlock({
      materialRef: targetMaterial,
      title: blockTitle,
      label: blockTitle,
      plannedDate: input.plannedDate || todayLocalISO(),
      plannedMinutes: input.plannedMinutes || 30,
      phase: 'review',
      courseId,
      course,
      topic: topics[0],
      followUpForRef: assessObj.key,
      workflowId: input.workflowId,
    });
    if (blockRes.ok && blockRes.ref) {
      blockRef = blockRes.ref;
      primaryUrl = blockRes.url || primaryUrl;
      if (blockRes.relationships) relationships.push(...blockRes.relationships);
    }
  }

  // Save durable follow-up task per targeted review
  const followUpRefs: string[] = [];
  const now = Date.now();
  for (const t of topics) {
    const fuId = uid('fu_gs_');
    const fuKey = `gradestack:followup:${fuId}`;
    const task: FollowUpTask = {
      id: fuId,
      key: fuKey,
      app: 'gradestack',
      title: `Review ${t} (${assessObj.title})`,
      detail: `Targeted follow-up for ${assessObj.title} in ${course}`,
      status: blockRef ? 'scheduled' : 'open',
      courseId,
      course,
      topic: t,
      sourceRef: assessObj.key,
      targetRef: deckRef || assessObj.key,
      scheduledBlockRef: blockRef,
      createdAt: now,
      updatedAt: now,
      meta: {
        assessmentId: assessObj.id,
        topic: t,
      },
    };
    await saveFollowUpTask(task);
    followUpRefs.push(fuKey);
  }

  const evPayload = {
    assessmentId: assessObj.id,
    assessmentKey: assessObj.key,
    courseId,
    course,
    topics,
    followUpRefs,
    blockRef,
    deckRef,
    text: `targeted review created for ${assessObj.title}: ${topics.join(', ')}`,
    url: primaryUrl,
  };
  await emitHubEvent('targetedReviewCreated', evPayload);
  await emitHubEvent('followUpTaskCreated', evPayload);

  return {
    ok: true,
    commandId: '',
    ref: blockRef || deckRef || followUpRefs[0],
    relationships,
    event: evPayload,
    url: primaryUrl,
    data: {
      assessmentRef: assessObj.key,
      courseId,
      course,
      topics,
      followUpRefs,
      blockRef,
      deckRef,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMMAND 9: logStudyActivity (Rhythm Explicit Reviewable Activity Logging)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface LogStudyActivityInput {
  activityKind: 'attendance' | 'completed_study' | 'planned_work';
  routineId?: string;
  routineName?: string;
  sourceRef?: string | Partial<ObjectRef> | null;
  courseId?: string | null;
  course?: string | null;
  topic?: string | null;
  date?: string;
  value?: number;
  minutes?: number;
  note?: string;
  confirmedByUser: boolean;
  workflowId?: string;
  idempotencyKey?: string;
}

export async function handleLogStudyActivity(
  input: LogStudyActivityInput,
): Promise<
  CommandResult<{
    entryId: string;
    entryRef: string;
    routineId: string;
    activityKind: 'attendance' | 'completed_study' | 'planned_work';
    date: string;
    value: number;
  }>
> {
  if (!input?.confirmedByUser) {
    return {
      ok: false,
      commandId: '',
      code: 'CONFIRMATION_REQUIRED',
      error: 'Logging attendance or study activity on Rhythm requires explicit user review/confirmation.',
    };
  }
  const validKinds = ['attendance', 'completed_study', 'planned_work'] as const;
  if (!validKinds.includes(input.activityKind)) {
    return {
      ok: false,
      commandId: '',
      code: 'INVALID_ACTIVITY_KIND',
      error: 'activityKind must be attendance, completed_study, or planned_work.',
    };
  }

  const srcRef = input.sourceRef ? parseRef(input.sourceRef) : null;
  const srcObj = srcRef ? await resolveObject(srcRef) : null;
  const courseInfo = await resolveCanonicalCourse(
    input.courseId ? { courseId: input.courseId, course: input.course || undefined } : input.course || srcObj?.course,
  );
  const courseId = courseInfo?.courseId ?? input.courseId ?? srcObj?.courseId ?? undefined;
  const course = courseInfo?.code ?? input.course ?? srcObj?.course ?? undefined;
  const topic = normalizeTopicSlug(input.topic ?? srcObj?.topic);
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : todayLocalISO();
  const nowIso = new Date().toISOString();

  const regWrapper = readZustandWrapper('rhythm.register.v1');
  const st = regWrapper.state;
  st.routines = st.routines || {};
  st.entries = st.entries || {};
  st.courses = st.courses || {};

  // Project course into Rhythm's local course map if present
  let localCourseId: string | undefined;
  if (course) {
    const foundCourse = Object.values(st.courses).find(
      (c: any) => c && String(c.code || c.name || '').toLowerCase() === course.toLowerCase(),
    ) as any;
    if (foundCourse) {
      localCourseId = foundCourse.id;
    } else {
      localCourseId = uid('crs_');
      st.courses[localCourseId] = {
        id: localCourseId,
        name: courseInfo?.name || course,
        code: course,
        createdAt: nowIso,
      };
    }
  }

  // Find or create appropriate routine keeping attendance, planned work, and completed study distinct (§5)
  let routineId = input.routineId && st.routines[input.routineId] ? input.routineId : '';
  if (!routineId) {
    const defaultName =
      input.routineName?.trim() ||
      (input.activityKind === 'attendance'
        ? `${course ? `${course} ` : ''}Class Attendance`
        : input.activityKind === 'planned_work'
          ? `${course ? `${course} ` : ''}Planned Study`
          : `${course ? `${course} ` : ''}Completed Study`);
    const existingRoutine = Object.values(st.routines).find(
      (r: any) =>
        r &&
        r.status !== 'archived' &&
        String(r.name || '').toLowerCase() === defaultName.toLowerCase() &&
        (r.activityKind || 'completed_study') === input.activityKind,
    ) as any;

    if (existingRoutine) {
      routineId = existingRoutine.id;
    } else {
      routineId = uid('rty_');
      const isDuration = input.activityKind !== 'attendance' && (input.minutes || input.value);
      st.routines[routineId] = {
        id: routineId,
        name: defaultName,
        measure: isDuration ? 'duration' : 'check',
        unit: isDuration ? 'minutes' : undefined,
        target: { perWeek: input.activityKind === 'attendance' ? 3 : 5 },
        weekdays: [1, 2, 3, 4, 5],
        accent: input.activityKind === 'attendance' ? 'indigo' : 'teal',
        courseId: localCourseId,
        status: 'active',
        activityKind: input.activityKind,
        createdAt: nowIso,
      };
    }
  }

  const routine = st.routines[routineId];
  const value =
    routine.measure === 'check'
      ? 1
      : Math.max(1, Math.round(Number(input.minutes ?? input.value) || 25));

  const entryId = uid('ent_');
  const entry = {
    id: entryId,
    routineId,
    date,
    value,
    note: input.note || (srcObj ? `Logged from ${srcObj.title}` : undefined),
    context: input.activityKind,
    activityKind: input.activityKind,
    sourceRef: srcObj?.key,
    source: 'manual',
    createdAt: nowIso,
  };
  st.entries[entryId] = entry;

  writeZustandWrapper('rhythm.register.v1', st, regWrapper.version || 2);
  syncLiveStore('__rhythmRegisterStore', st);
  notifyStoreChange('rhythm');

  const entryKey = `rhythm:entry:${entryId}`;
  const entryEnt = await putHubEntity({
    app: 'rhythm',
    type: 'entry',
    id: entryId,
    courseId,
    course,
    topic,
    title: routine.name,
    sub: `${date} · ${input.activityKind}`,
    url: '/apps/rhythm/',
    data: {
      day: date,
      kind: input.activityKind,
      activityKind: input.activityKind,
      value,
      minutes: routine.measure === 'duration' ? value : input.minutes,
      routineId,
      sourceRef: srcObj?.key,
    },
  });

  const relationships: RelationshipRecord[] = [];
  if (srcObj) {
    const rel = await addRelationship({
      from: entryKey,
      to: srcObj.key,
      kind: input.activityKind === 'completed_study' ? 'practicedIn' : 'related',
      courseId,
      course,
      topic,
      workflowId: input.workflowId,
      meta: {
        fromTitle: `${routine.name} (${date})`,
        fromUrl: '/apps/rhythm/',
        toTitle: srcObj.title,
        toUrl: srcObj.url,
        activityKind: input.activityKind,
      },
    });
    if (rel.relationship) relationships.push(rel.relationship);
  }

  const evPayload = {
    entryId,
    entryKey,
    routineId,
    activityKind: input.activityKind,
    date,
    value,
    courseId,
    course,
    topic,
    sourceRef: srcObj?.key,
    text: `${input.activityKind.replace('_', ' ')} logged: ${routine.name}`,
    url: '/apps/rhythm/',
  };
  await emitHubEvent('studyActivityLogged', evPayload);

  return {
    ok: true,
    commandId: '',
    ref: entryKey,
    entity: entryEnt,
    relationships,
    event: evPayload,
    url: '/apps/rhythm/',
    data: {
      entryId,
      entryRef: entryKey,
      routineId,
      activityKind: input.activityKind,
      date,
      value,
    },
  };
}

/* ── Command Registration & Execution Facade ───────────────────────────── */

let commandsRegistered = false;

export function registerIntegrationCommands(): void {
  const it = (window as any).iterra;
  if (!it?.commands?.register) return;
  if (commandsRegistered && it.commands.handlers?.['createDeckFromSelection']) return;
  commandsRegistered = true;

  it.commands.register('createDeckFromSelection', handleCreateDeckFromSelection);
  it.commands.register('scheduleReviewBlock', handleScheduleReviewBlock);
  it.commands.register('attachMaterialToBlock', handleAttachMaterialToBlock);
  it.commands.register('startFocusSession', handleStartFocusSession);
  it.commands.register('recordSessionOutcome', handleRecordSessionOutcome);
  it.commands.register('attachSourceMaterial', handleAttachSourceMaterial);
  it.commands.register('scheduleProblemRetry', handleScheduleProblemRetry);
  it.commands.register('createFollowUpTask', handleScheduleProblemRetry);
  it.commands.register('createTargetedReview', handleCreateTargetedReview);
  it.commands.register('logStudyActivity', handleLogStudyActivity);
}

export async function execCommand<T = Record<string, unknown>>(
  name: string,
  input: Record<string, unknown>,
  opts?: { idempotencyKey?: string; by?: string },
): Promise<CommandResult<T>> {
  registerIntegrationCommands();
  const it = (window as any).iterra;
  if (it?.commands?.exec) {
    return (await it.commands.exec(name, input, opts)) as CommandResult<T>;
  }
  // Standalone fallback if iterra-hub.js is not loaded
  const handlers: Record<string, (inp: any) => Promise<CommandResult<any>>> = {
    createDeckFromSelection: handleCreateDeckFromSelection,
    scheduleReviewBlock: handleScheduleReviewBlock,
    attachMaterialToBlock: handleAttachMaterialToBlock,
    startFocusSession: handleStartFocusSession,
    recordSessionOutcome: handleRecordSessionOutcome,
    attachSourceMaterial: handleAttachSourceMaterial,
    scheduleProblemRetry: handleScheduleProblemRetry,
    createFollowUpTask: handleScheduleProblemRetry,
    createTargetedReview: handleCreateTargetedReview,
    logStudyActivity: handleLogStudyActivity,
  };
  const h = handlers[name];
  if (!h) {
    return { ok: false, commandId: 'standalone', code: 'UNKNOWN_COMMAND', error: `Unknown command: ${name}` };
  }
  try {
    const res = await h(input);
    return { ...res, commandId: res.commandId || `cmd-${Date.now()}` };
  } catch (e) {
    return { ok: false, commandId: `cmd-${Date.now()}`, code: 'EXECUTION_ERROR', error: String(e) };
  }
}

if (typeof window !== 'undefined') {
  registerIntegrationCommands();
}
