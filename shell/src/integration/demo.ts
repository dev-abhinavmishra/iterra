/* demo.ts — the sample semester.

   A first-booted terrain is honest but empty: every place opens on its
   empty state and the cross-module wiring is invisible until a student
   has hours of real data behind it. For evaluation (and for a user who
   wants to feel the shape before committing) that undersells the system.

   seedDemoSemester() plants a complete small semester — three courses,
   seven commitments, two planned blocks, two cardfile decks, five focus
   sessions — through the SAME envelopes and hub calls the real writers
   use, so every surface (Today, Courses, dossiers, search, feed, place
   UIs) renders the seed exactly as it would real work.

   Three delivery lanes:
     1. zustand persist envelopes (syllabus folio, cardfile, timer) —
        merged into existing state, never replacing it.
     2. canonical store entities via iterra.store.put — the validated
        path; the syllabus mirror's later writes are idempotent over
        identical ids.
     3. pending intake rows written straight into the hub's intake
        bucket with deterministic ids (in-demo-*) — the adapters' own
        intake-derived ids (ink 'intake-<recid>', margin the same,
        proof 'p_<recid>') then land demo-prefixed too, so removal can
        find everything the delivery produced.

   Everything the seed writes carries a 'demo-'/'in-demo-' id prefix
   (feed items carry demo:true). removeDemoData() sweeps every lane by
   that prefix — nothing the user created themselves is touched. Both
   operations are followed by a full reload by the caller, because
   mounted places hold their stores in memory and only a reload
   rehydrates them from the new envelopes. */
import { openDatabase, storeAllKeys, storeAllRecords, listDatabases } from './backup';

export const DEMO_FLAG_KEY = 'iterra.v1.demo';
export const DEMO_PREFIX = 'demo-';
const DEMO_INTAKE_PREFIX = 'in-demo-';
const HUB_DB = 'iterra';
const MARGIN_DB = 'ModularAINotesDB';
const FEED_KEY = 'iterra.v1.doc.feed';
const FOLIO_KEY = 'syllabus.folio.v1';
const CARD_KEY = 'cardfile.decks.v1';
const CARD_LAST_KEY = 'cardfile.lastDeck';
const SESSIONS_KEY = 'timer.sessions.v1';
const LS_INTAKES_KEY = 'iterra.v1.store.intakes';
const LS_ENTITIES_KEY = 'iterra.v1.store.entities';
const LS_LINKS_KEY = 'iterra.v1.store.links';
const INK_KEY = 'ink-notes-storage';
const PROOF_KEY = 'proof.workbench.v1';

/* every artifact the seed can leave behind — direct rows carry 'demo-*',
   objects created by a drained demo intake carry the adapter's own
   intake-derived id ('intake-in-demo-*' for ink/margin, 'p_in-demo-*' for
   proof). One predicate for all three so removal can't strand the
   delivered lane. */
const isDemoId = (id: unknown): boolean => {
  const s = String(id ?? '');
  return s.startsWith(DEMO_PREFIX) || s.startsWith(`intake-${DEMO_INTAKE_PREFIX}`) || s.startsWith(`p_${DEMO_INTAKE_PREFIX}`);
};
/* canonical store key is 'app:type:id' — the demo mark lives in the id slot */
const isDemoKey = (key: unknown): boolean => isDemoId(String(key ?? '').split(':').slice(2).join(':'));

/* mounted zustand stores hold their state in memory — a set() after a
   seed/remove LS write would re-persist the stale memory over the fresh
   blob (the publish mirrors' entity notifies are enough to trigger it).
   Push the current blob into the live stores so memory, LS, and mirrors
   all agree before the caller reloads. */
function syncMountedStores() {
  try {
    const folioNow = lsGet<{ state: Record<string, any> }>(FOLIO_KEY);
    if (folioNow?.state) {
      const s = folioNow.state;
      (window as any).__syllabusFolioStore?.setState?.({
        terms: s.terms, courses: s.courses, commitments: s.commitments,
        blocks: s.blocks, links: s.links, reviews: s.reviews,
        dismissed: s.dismissed, activeTermId: s.activeTermId,
      });
    }
    const inkNow = lsGet<{ state?: { notes?: any[]; activeNoteId?: string | null } }>(INK_KEY);
    if (inkNow?.state) {
      (window as any).__inkStore?.setState?.({
        notes: inkNow.state.notes, activeNoteId: inkNow.state.activeNoteId ?? null,
      });
    }
    const proofNow = lsGet<{ state?: { problems?: Record<string, any>; courses?: Record<string, any> } }>(PROOF_KEY);
    if (proofNow?.state) {
      /* courses ride along: intake mirrors canonical syllabus:course:* keys
         into proof's local registry — removal must retract them the same way */
      (window as any).__proofWorkbenchStore?.setState?.({
        problems: proofNow.state.problems, courses: proofNow.state.courses,
      });
    }
  } catch { /* unmounted or a foreign shape — the LS writes already landed */ }
}

/* ── small storage helpers ─────────────────────────────────────────── */

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function lsSet(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* quota — the seed is best-effort per store; flag records what landed */
  }
}

async function idbDelete(name: string, store: string, keys: IDBValidKey[]): Promise<void> {
  if (!keys.length) return;
  const db = await openDatabase(name);
  if (!db) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      for (const k of keys) tx.objectStore(store).delete(k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

type Hub = {
  ready?: Promise<unknown>;
  store?: {
    put(e: Record<string, unknown>): Promise<{ ok?: boolean }>;
    list(q?: Record<string, unknown>): Promise<Array<{ key?: string; id?: string }>>;
    remove?(key: string): Promise<unknown>;
  };
};
const hub = (): Hub | undefined =>
  typeof window !== 'undefined' ? (window as { iterra?: Hub }).iterra : undefined;

/* ── state ─────────────────────────────────────────────────────────── */

export function isDemoLoaded(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return !!localStorage.getItem(DEMO_FLAG_KEY);
  } catch {
    return false;
  }
}

/** rough inventory of seeded rows still present — for the Settings row */
export async function demoRowCount(): Promise<number> {
  if (!isDemoLoaded()) return 0;
  let n = 0;
  const folio = lsGet<{ state?: Record<string, Record<string, unknown>> }>(FOLIO_KEY)?.state;
  if (folio) {
    for (const bucket of ['terms', 'courses', 'commitments', 'blocks']) {
      n += Object.keys(folio[bucket] ?? {}).filter((k) => k.startsWith(DEMO_PREFIX)).length;
    }
  }
  n += Object.keys(lsGet<Record<string, unknown>>(CARD_KEY) ?? {}).filter((k) => k.startsWith(DEMO_PREFIX)).length;
  const sessions = lsGet<Array<{ id?: string }>>(SESSIONS_KEY) ?? [];
  n += sessions.filter((s) => s?.id?.startsWith(DEMO_PREFIX)).length;
  try {
    const ents = (await hub()?.store?.list()) ?? [];
    n += ents.filter((e) => e.id?.startsWith(DEMO_PREFIX)).length;
  } catch {
    /* hub list is best-effort */
  }
  return n;
}

/* ── the semester ──────────────────────────────────────────────────── */

const DAY = 24 * 3600 * 1000;

function localISODate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysFromNow(n: number, hour = 17, minute = 0): string {
  const d = new Date(Date.now() + n * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function seedFolio() {
  interface FolioBlob { state: Record<string, any>; version: number }
  const blob = lsGet<FolioBlob>(FOLIO_KEY) ?? { state: {}, version: 1 };
  const s = blob.state;
  s.terms = s.terms ?? {}; s.courses = s.courses ?? {}; s.commitments = s.commitments ?? {};
  s.blocks = s.blocks ?? {}; s.links = s.links ?? {}; s.reviews = s.reviews ?? {};
  s.dismissed = s.dismissed ?? {};
  if (s.courses[`${DEMO_PREFIX}bio201`]) return false; // already seeded

  const now = new Date().toISOString();
  const termId = `${DEMO_PREFIX}fall`;
  const termStart = new Date(); termStart.setMonth(termStart.getMonth() - 2);
  const termEnd = new Date(); termEnd.setMonth(termEnd.getMonth() + 2);
  s.terms[termId] = {
    id: termId, name: 'Fall Semester',
    startDate: localISODate(termStart), endDate: localISODate(termEnd),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    createdAt: now,
  };
  if (!s.activeTermId) s.activeTermId = termId;

  const course = (id: string, name: string, code: string, instructor: string, color: string, meetingPattern: string) => ({
    id, termId, name, code, instructor, color, meetingPattern, archived: false, createdAt: now,
  });
  s.courses[`${DEMO_PREFIX}bio201`] = course(`${DEMO_PREFIX}bio201`, 'Cell Biology', 'BIO 201', 'Dr. Rivera', 'hunter', 'MWF 09:10–10:00 · Rm 214');
  s.courses[`${DEMO_PREFIX}engl210`] = course(`${DEMO_PREFIX}engl210`, 'American Literature', 'ENGL 210', 'Prof. Chen', 'navy', 'TTh 11:00–12:15 · Rm 108');
  s.courses[`${DEMO_PREFIX}stat220`] = course(`${DEMO_PREFIX}stat220`, 'Statistics for Social Sciences', 'STAT 220', 'Dr. Okafor', 'ochre', 'MW 14:00–15:15 · Rm 330');

  const commit = (
    id: string, courseId: string, type: string, title: string,
    dueDays: number, weight: number, est: number,
    extra: Record<string, unknown> = {},
  ) => ({
    id, courseId, type, title, dueAt: daysFromNow(dueDays, 23, 59),
    weight, estimatedMinutes: est, loggedMinutes: 0, status: 'open',
    dependencies: [], createdAt: now, ...extra,
  });
  s.commitments[`${DEMO_PREFIX}quiz-bio`] = commit(`${DEMO_PREFIX}quiz-bio`, `${DEMO_PREFIX}bio201`, 'quiz', 'Chapter 7 quiz — cellular respiration', 1, 10, 45, { pinned: true });
  s.commitments[`${DEMO_PREFIX}lab-bio`] = commit(`${DEMO_PREFIX}lab-bio`, `${DEMO_PREFIX}bio201`, 'lab', 'Lab report — enzyme kinetics', 4, 15, 120);
  s.commitments[`${DEMO_PREFIX}pset-bio`] = commit(`${DEMO_PREFIX}pset-bio`, `${DEMO_PREFIX}bio201`, 'assignment', 'Chapter 5 problem set', -3, 10, 60, { status: 'done', grade: 92, loggedMinutes: 55, completedAt: daysFromNow(-3, 16) });
  s.commitments[`${DEMO_PREFIX}essay-engl`] = commit(`${DEMO_PREFIX}essay-engl`, `${DEMO_PREFIX}engl210`, 'assignment', 'Essay 2 draft — Gatsby and the American Dream', 5, 20, 180, { pinned: true });
  s.commitments[`${DEMO_PREFIX}read-engl`] = commit(`${DEMO_PREFIX}read-engl`, `${DEMO_PREFIX}engl210`, 'reading', 'Read Gatsby ch. 7–9', 0, 5, 40);
  s.commitments[`${DEMO_PREFIX}pset-stat`] = commit(`${DEMO_PREFIX}pset-stat`, `${DEMO_PREFIX}stat220`, 'assignment', 'Problem set 6 — regression', 2, 10, 90);
  s.commitments[`${DEMO_PREFIX}mid-stat`] = commit(`${DEMO_PREFIX}mid-stat`, `${DEMO_PREFIX}stat220`, 'exam', 'Midterm — inference and regression', 9, 25, 240, { pinned: true });

  const today = localISODate(new Date());
  const block = (id: string, commitmentId: string, start: string, minutes: number, phase: string, label: string, order: number) => ({
    id, commitmentId, plannedDate: today, plannedStart: start, plannedMinutes: minutes,
    state: 'planned', phase, label, reasons: ['demo semester'], score: 0,
    deferCount: 0, order, createdAt: now,
  });
  s.blocks[`${DEMO_PREFIX}blk-bio`] = block(`${DEMO_PREFIX}blk-bio`, `${DEMO_PREFIX}quiz-bio`, '16:00', 25, 'review', 'quiz review', 0);
  s.blocks[`${DEMO_PREFIX}blk-stat`] = block(`${DEMO_PREFIX}blk-stat`, `${DEMO_PREFIX}pset-stat`, '19:30', 50, 'work', 'problem set', 1);

  lsSet(FOLIO_KEY, { state: s, version: blob.version ?? 1 });
  return true;
}

function seedCardfile() {
  const decks = lsGet<Record<string, any>>(CARD_KEY) ?? {};
  if (decks[`${DEMO_PREFIX}deck-bio`]) return false;
  const now = Date.now();
  const card = (id: string, q: string, a: string, ex = '') => ({ id, q, a, ex, starred: false, status: 'new' });
  const bioCards = [
    card(`${DEMO_PREFIX}c1`, 'Where does glycolysis occur?', 'Cytoplasm'),
    card(`${DEMO_PREFIX}c2`, 'Net ATP from glycolysis?', '2 ATP (and 2 NADH)'),
    card(`${DEMO_PREFIX}c3`, 'Inputs of the Krebs cycle?', 'Acetyl-CoA + oxaloacetate → citrate'),
    card(`${DEMO_PREFIX}c4`, 'Where is the electron transport chain?', 'Inner mitochondrial membrane', 'Cristae — the folded inner membrane'),
    card(`${DEMO_PREFIX}c5`, 'Final electron acceptor in aerobic respiration?', 'Oxygen → reduced to water'),
    card(`${DEMO_PREFIX}c6`, 'Typical ATP yield per glucose (eukaryote)?', '~30–32 ATP'),
  ];
  const englCards = [
    card(`${DEMO_PREFIX}c7`, 'Motif', 'A recurring element with symbolic significance', 'The green light in Gatsby'),
    card(`${DEMO_PREFIX}c8`, 'Foil', 'A character whose traits contrast with another’s', 'Nick vs. Tom'),
    card(`${DEMO_PREFIX}c9`, 'Unreliable narrator', 'A narrator whose credibility is compromised'),
    card(`${DEMO_PREFIX}c10`, 'In medias res', 'Beginning the narrative mid-action'),
    card(`${DEMO_PREFIX}c11`, 'Bildungsroman', 'A coming-of-age novel'),
    card(`${DEMO_PREFIX}c12`, 'Green light (Gatsby)', 'Motif for unreachable dreams — Daisy’s dock'),
  ];
  decks[`${DEMO_PREFIX}deck-bio`] = {
    id: `${DEMO_PREFIX}deck-bio`, title: 'Cellular respiration', cards: bioCards,
    course: 'BIO 201', courseId: `syllabus:course:${DEMO_PREFIX}bio201`,
    flipped: false, createdAt: now - 6 * DAY, lastStudiedAt: now - DAY,
  };
  decks[`${DEMO_PREFIX}deck-engl`] = {
    id: `${DEMO_PREFIX}deck-engl`, title: 'Literary terms', cards: englCards,
    course: 'ENGL 210', courseId: `syllabus:course:${DEMO_PREFIX}engl210`,
    flipped: false, createdAt: now - 5 * DAY, lastStudiedAt: now - 2 * DAY,
  };
  lsSet(CARD_KEY, decks);
  return true;
}

function seedSessions() {
  const sessions = lsGet<Array<Record<string, unknown>>>(SESSIONS_KEY) ?? [];
  if (sessions.some((s) => String(s?.id ?? '').startsWith(DEMO_PREFIX))) return [];
  const mk = (id: string, daysAgo: number, minutes: number, label: string, course: string, courseId: string, commitmentId?: string) => ({
    id, type: 'focus', duration: minutes * 60, timestamp: Date.now() - daysAgo * DAY - 2 * 3600 * 1000,
    label, preset: 'pomodoro', course, courseId, commitmentId,
  });
  const rows = [
    mk(`${DEMO_PREFIX}ses-1`, 0, 25, 'quiz review', 'BIO 201', `syllabus:course:${DEMO_PREFIX}bio201`, `${DEMO_PREFIX}quiz-bio`),
    mk(`${DEMO_PREFIX}ses-2`, 1, 45, 'Essay 2 draft', 'ENGL 210', `syllabus:course:${DEMO_PREFIX}engl210`, `${DEMO_PREFIX}essay-engl`),
    mk(`${DEMO_PREFIX}ses-3`, 2, 50, 'problem set 6', 'STAT 220', `syllabus:course:${DEMO_PREFIX}stat220`, `${DEMO_PREFIX}pset-stat`),
    mk(`${DEMO_PREFIX}ses-4`, 4, 30, 'lab report outline', 'BIO 201', `syllabus:course:${DEMO_PREFIX}bio201`),
    mk(`${DEMO_PREFIX}ses-5`, 5, 60, 'reading — Gatsby ch. 4–6', 'ENGL 210', `syllabus:course:${DEMO_PREFIX}engl210`),
  ];
  lsSet(SESSIONS_KEY, [...rows, ...sessions]);
  return rows;
}

async function seedHub(sessions: Array<Record<string, any>>) {
  const it = hub();
  if (!it?.store?.put) return;
  await it.ready?.catch(() => {});
  const put = (e: Record<string, unknown>) => it.store!.put(e).catch(() => ({ ok: false }));
  const ckey = (id: string) => `syllabus:course:${id}`;
  const now = Date.now();
  const s = lsGet<{ state?: any }>(FOLIO_KEY)?.state ?? {};

  /* courses — the registry entities every other place resolves against */
  for (const id of [`${DEMO_PREFIX}bio201`, `${DEMO_PREFIX}engl210`, `${DEMO_PREFIX}stat220`]) {
    const c = s.courses?.[id];
    if (!c) continue;
    await put({
      app: 'syllabus', type: 'course', id: c.id, title: c.name, course: c.code,
      url: '/apps/syllabus/',
      data: { code: c.code, termId: c.termId, color: c.color, instructor: c.instructor },
    });
  }
  await put({
    app: 'syllabus', type: 'term', id: `${DEMO_PREFIX}fall`, title: 'Fall Semester',
    url: '/apps/syllabus/', data: { startDate: s.terms?.[`${DEMO_PREFIX}fall`]?.startDate, endDate: s.terms?.[`${DEMO_PREFIX}fall`]?.endDate },
  });

  /* commitments + today's blocks — so dossiers/search/recent work see them
     before syllabus mounts and mirrors them itself */
  for (const [id, c] of Object.entries<any>(s.commitments ?? {})) {
    if (!id.startsWith(DEMO_PREFIX)) continue;
    const code = s.courses?.[c.courseId]?.code;
    await put({
      app: 'syllabus', type: 'commitment', id: c.id,
      courseId: ckey(c.courseId), course: code,
      title: c.title, sub: c.type,
      url: `/apps/syllabus/?commitment=${encodeURIComponent(c.id)}`,
      data: { type: c.type, dueAt: c.dueAt, weight: c.weight, status: c.status, estimatedMinutes: c.estimatedMinutes, loggedMinutes: c.loggedMinutes, grade: c.grade, pinned: c.pinned || undefined },
    });
  }
  for (const [id, b] of Object.entries<any>(s.blocks ?? {})) {
    if (!id.startsWith(DEMO_PREFIX)) continue;
    const c = s.commitments?.[b.commitmentId];
    await put({
      app: 'syllabus', type: 'block', id: b.id,
      courseId: c ? ckey(c.courseId) : undefined,
      course: c ? s.courses?.[c.courseId]?.code : undefined,
      title: b.label || c?.title || 'a block',
      url: `/apps/syllabus/?block=${encodeURIComponent(b.id)}`,
      data: { commitmentId: b.commitmentId, plannedDate: b.plannedDate, plannedStart: b.plannedStart, plannedMinutes: b.plannedMinutes, state: b.state, phase: b.phase },
    });
  }

  /* session entities — same shape timer's own adapter publishes */
  for (const ses of sessions) {
    const minutes = Math.round((ses.duration ?? 0) / 60);
    await put({
      app: 'timer', type: 'session', id: ses.id,
      courseId: ses.courseId, course: ses.course,
      title: ses.label || 'focus', sub: `${minutes}m`, url: '/apps/timer/',
      createdAt: ses.timestamp,
      data: { minutes, label: ses.label, commitmentId: ses.commitmentId, startedAt: ses.timestamp - minutes * 60000, endedAt: ses.timestamp },
    });
  }

  /* queued deliveries — each place's adapter drains these on first mount:
     ink opens a page, margin files a note, proof benches a problem.
     Deterministic demo ids mean the objects they create (intake-in-demo-*,
     p_in-demo-*) are demo-prefixed for removal too. */
  /* intake entities are REAL seeded commitments (with their canonical keys)
     — the delivered object's derivedFrom edge resolves to a clickable source
     in the dossier instead of dangling at a pseudo-entity */
  const cent = (id: string, title: string, courseId: string, course: string) => ({
    app: 'syllabus', type: 'commitment', id, key: `syllabus:commitment:${id}`,
    title, courseId, course, url: `/apps/syllabus/?commitment=${encodeURIComponent(id)}`,
  });
  const intakes: Array<Record<string, unknown>> = [
    {
      id: `${DEMO_INTAKE_PREFIX}ink1`, to: 'ink', action: 'note.create',
      entity: cent(`${DEMO_PREFIX}lab-bio`, 'Lab report — enzyme kinetics', ckey(`${DEMO_PREFIX}bio201`), 'BIO 201'),
      payload: { text: 'Michaelis-Menten: reaction rate vs. substrate concentration. Km = substrate at half Vmax. Competitive inhibitors raise apparent Km; non-competitive lower Vmax.\n\nFor the lab report: plot rate curves for the enzyme trials, estimate Vmax/Km, and discuss the inhibitor result.' },
      from: 'syllabus', at: now, delivered: null,
    },
    {
      id: `${DEMO_INTAKE_PREFIX}ink2`, to: 'ink', action: 'note.create',
      entity: cent(`${DEMO_PREFIX}essay-engl`, 'Essay 2 draft — Gatsby and the American Dream', ckey(`${DEMO_PREFIX}engl210`), 'ENGL 210'),
      payload: { text: 'Thesis directions: the green light as a motif for the unreachable American Dream; Nick as an unreliable narrator; the valley of ashes vs. West Egg.\n\nOutline due before the draft — pull quotes from ch. 7–9 reading.' },
      from: 'syllabus', at: now, delivered: null,
    },
    {
      id: `${DEMO_INTAKE_PREFIX}margin1`, to: 'margin', action: 'note.create',
      entity: cent(`${DEMO_PREFIX}quiz-bio`, 'Chapter 7 quiz — cellular respiration', ckey(`${DEMO_PREFIX}bio201`), 'BIO 201'),
      payload: { text: 'Glycolysis (cytoplasm): glucose → 2 pyruvate, net 2 ATP + 2 NADH.\nKrebs cycle (matrix): 2 acetyl-CoA → 4 CO2, 6 NADH, 2 FADH2, 2 ATP.\nETC (inner membrane): ~26–28 ATP via chemiosmosis; O2 is the final acceptor.' },
      from: 'syllabus', at: now, delivered: null,
    },
    {
      id: `${DEMO_INTAKE_PREFIX}proof1`, to: 'proof', action: 'problem.create',
      entity: cent(`${DEMO_PREFIX}mid-stat`, 'Midterm — inference and regression', ckey(`${DEMO_PREFIX}stat220`), 'STAT 220'),
      payload: { prompt: 'Two independent samples: n1 = 24, x̄1 = 82, s1 = 6; n2 = 21, x̄2 = 78, s2 = 8. Test whether the means differ at α = 0.05 (two-tailed). State hypotheses, the test statistic, and your conclusion.', topic: 'hypothesis testing', courseId: ckey(`${DEMO_PREFIX}stat220`), course: 'STAT 220', difficulty: 3, tags: ['midterm', 'inference'], source: 'demo' },
      from: 'syllabus', at: now, delivered: null,
    },
  ];
  await writeIntakes(intakes);
  seedFeed(now);
  /* a mounted folio still holds pre-seed memory — without this its next
     persist/mirror pass re-stamps the empty state over the seed */
  syncMountedStores();
}

async function writeIntakes(rows: Array<Record<string, unknown>>) {
  /* the hub stores intakes in IDB when available, else the LS bucket —
     write where it reads. Row shape mirrors intakeSend() exactly. Only
     open the DB if it already exists with an 'intakes' store: a bare
     indexedDB.open() would otherwise create an empty v1 database, and the
     hub's own schema migration would then never fire. */
  const exists = (await listDatabases()).some((d) => d.name === HUB_DB);
  const db = exists ? await openDatabase(HUB_DB).catch(() => null) : null;
  if (db && db.objectStoreNames.contains('intakes')) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('intakes', 'readwrite');
        const st = tx.objectStore('intakes');
        for (const r of rows) st.put(r);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
      return;
    } catch {
      db.close();
      /* fall through to LS */
    }
  } else {
    db?.close();
  }
  const bucket = lsGet<Record<string, unknown>>(LS_INTAKES_KEY) ?? {};
  for (const r of rows) bucket[String(r.id)] = r;
  lsSet(LS_INTAKES_KEY, bucket);
}

function seedFeed(now: number) {
  const doc = lsGet<{ items?: Array<Record<string, unknown>> }>(FEED_KEY) ?? { items: [] };
  const items = Array.isArray(doc.items) ? doc.items : [];
  if (items.some((it) => it?.demo === true)) return;
  const stirs = [
    { app: 'syllabus', text: 'planned 2 blocks for tomorrow', url: '/apps/syllabus/', course: 'BIO 201', at: now - 3600 * 1000, demo: true },
    { app: 'flashcards', text: '6 cards to review in "Cellular respiration"', url: '/apps/flashcards/', course: 'BIO 201', at: now - 2 * 3600 * 1000, demo: true },
    { app: 'timer', text: 'focus · 45m — Essay 2 draft', url: '/apps/timer/', course: 'ENGL 210', at: now - DAY, demo: true },
  ];
  doc.items = [...stirs, ...items].slice(0, 30);
  lsSet(FEED_KEY, doc);
}

/* ── public api ────────────────────────────────────────────────────── */

export interface DemoResult { ok: boolean; already?: boolean; error?: string }

export async function seedDemoSemester(): Promise<DemoResult> {
  if (typeof localStorage === 'undefined') return { ok: false, error: 'no local storage' };
  if (isDemoLoaded()) return { ok: true, already: true };
  try {
    const folioSeeded = seedFolio();
    seedCardfile();
    const sessions = seedSessions();
    await seedHub(sessions);
    /* flag records the seed regardless of per-store success so removal
       still sweeps anything that did land */
    try {
      localStorage.setItem(DEMO_FLAG_KEY, JSON.stringify({ v: 1, seededAt: Date.now(), folioSeeded }));
    } catch { /* still seeded — the row sweep finds demo ids anyway */ }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'seed failed' };
  }
}

export async function removeDemoData(): Promise<{ ok: boolean }> {
  try {
    /* collect the demo course codes first — downstream mirrors (shared
       context, feed stirs other apps emitted) reference the display code,
       not the demo id */
    const demoCodes = new Set<string>();
    const folioPeek = lsGet<{ state?: { courses?: Record<string, { id?: string; code?: string; name?: string }> } }>(FOLIO_KEY);
    for (const [k, c] of Object.entries(folioPeek?.state?.courses ?? {})) {
      if (k.startsWith(DEMO_PREFIX)) {
        if (c?.code) demoCodes.add(c.code);
        if (c?.name) demoCodes.add(c.name);
      }
    }
    const looksDemo = (json: string) =>
      json.includes(DEMO_PREFIX) || [...demoCodes].some((c) => c && json.includes(`"${c}"`));

    /* folio — strip demo rows; if the active term was the demo one, fall
       back to another term (or none) */
    const folio = lsGet<{ state: Record<string, any>; version?: number }>(FOLIO_KEY);
    if (folio?.state) {
      const s = folio.state;
      for (const bucket of ['terms', 'courses', 'commitments', 'blocks', 'links', 'reviews', 'dismissed']) {
        const b = s[bucket];
        if (b && typeof b === 'object') {
          for (const k of Object.keys(b)) {
            if (k.startsWith(DEMO_PREFIX)) delete b[k];
          }
        }
      }
      /* links/reviews keyed by other ids may still point at demo rows */
      for (const bucket of ['links', 'reviews']) {
        const b = s[bucket];
        if (b && typeof b === 'object') {
          for (const [k, v] of Object.entries<any>(b)) {
            const t = JSON.stringify(v);
            if (t && t.includes(`"${DEMO_PREFIX}`)) delete b[k];
          }
        }
      }
      if (typeof s.activeTermId === 'string' && s.activeTermId.startsWith(DEMO_PREFIX)) {
        s.activeTermId = Object.keys(s.terms ?? {})[0] ?? null;
      }
      lsSet(FOLIO_KEY, folio);
    }

    /* cardfile */
    const decks = lsGet<Record<string, any>>(CARD_KEY);
    if (decks) {
      for (const k of Object.keys(decks)) if (k.startsWith(DEMO_PREFIX)) delete decks[k];
      lsSet(CARD_KEY, decks);
    }
    try {
      const last = localStorage.getItem(CARD_LAST_KEY);
      if (last && last.includes(DEMO_PREFIX)) localStorage.removeItem(CARD_LAST_KEY);
    } catch { /* best-effort */ }

    /* timer sessions */
    const sessions = lsGet<Array<{ id?: string }>>(SESSIONS_KEY);
    if (sessions) lsSet(SESSIONS_KEY, sessions.filter((x) => !x?.id?.startsWith(DEMO_PREFIX)));

    /* ink — delivered demo intakes became notes 'intake-in-demo-*' */
    const ink = lsGet<{ state?: { notes?: Array<{ id?: string }>; activeNoteId?: string | null }; version?: number }>(INK_KEY);
    if (ink?.state?.notes) {
      ink.state.notes = ink.state.notes.filter((n) => !isDemoId(n?.id));
      if (isDemoId(ink.state.activeNoteId)) ink.state.activeNoteId = null;
      lsSet(INK_KEY, ink);
    }

    /* proof — 'p_in-demo-*' problems */
    const proof = lsGet<{ state?: Record<string, any>; version?: number }>(PROOF_KEY);
    if (proof?.state?.problems) {
      const p = proof.state.problems;
      for (const k of Object.keys(p)) if (isDemoId(k)) delete p[k];
      /* intake mirrors canonical courses into the local registry keyed by
         syllabus:course:demo-* — sweep those too or the picker keeps
         offering courses that no longer exist */
      const cs = proof.state.courses;
      if (cs) for (const k of Object.keys(cs)) if (isDemoKey(k)) delete cs[k];
      lsSet(PROOF_KEY, proof);
    }

    /* feed — seed stirs carry demo:true; stirs the adapters emitted while
       draining demo intakes only show it in the url */
    const feed = lsGet<{ items?: Array<{ demo?: boolean }> }>(FEED_KEY);
    if (feed?.items) {
      feed.items = feed.items.filter((i) => i?.demo !== true && !looksDemo(JSON.stringify(i ?? {})));
      lsSet(FEED_KEY, feed);
    }

    /* doc mirrors — two shapes share the iterra.v1.doc.* namespace:
       index.<app> is {entities:[{t,id,title,sub,course,url,at}]}, and
       doc.shared is {field:{v,by,at}} — the ambient context ("COURSE: BIO
       201", today's next block) that would keep pointing at removed demo
       rows. Filter array slots; drop context fields referencing demo
       ids or the demo course codes collected above. */
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('iterra.v1.doc.')) continue;
        const doc = lsGet<Record<string, unknown>>(k);
        if (!doc || typeof doc !== 'object') continue;
        let touched = false;
        for (const [slot, val] of Object.entries(doc)) {
          if (Array.isArray(val)) {
            const kept = val.filter((r) => !looksDemo(JSON.stringify(r ?? {})));
            if (kept.length !== val.length) { doc[slot] = kept; touched = true; }
          } else if (val && typeof val === 'object' && 'v' in (val as object)) {
            /* shared-context field: {v,by,at} — drop if the payload
               references the demo material */
            if (looksDemo(JSON.stringify((val as { v: unknown }).v ?? {}))) {
              delete doc[slot];
              touched = true;
            }
          }
        }
        if (touched) lsSet(k, doc);
      }
    } catch { /* index sweep is best-effort */ }

    /* LS intake bucket (ls-mode hub) */
    const bucket = lsGet<Record<string, { id?: string; entity?: { id?: string } }>>(LS_INTAKES_KEY);
    if (bucket) {
      for (const [k, r] of Object.entries(bucket)) {
        if (k.startsWith(DEMO_INTAKE_PREFIX) || isDemoId(r?.entity?.id)) delete bucket[k];
      }
      lsSet(LS_INTAKES_KEY, bucket);
    }
    /* LS entity bucket */
    const ents = lsGet<Record<string, { id?: string; key?: string }>>(LS_ENTITIES_KEY);
    if (ents) {
      for (const [k, e] of Object.entries(ents)) {
        if (isDemoId(e?.id) || isDemoKey(k)) delete ents[k];
      }
      lsSet(LS_ENTITIES_KEY, ents);
    }

    /* push the cleaned buckets into mounted stores before the IDB deletes —
       a live publish mirror would otherwise re-stamp the demo rows it's
       still holding in memory */
    syncMountedStores();

    /* IDB hub store — entities + queued/delivered intake rows */
    const dbNames = (await listDatabases()).map((d) => d.name);
    if (dbNames.includes(HUB_DB)) {
      try {
        const keys = await storeAllKeys(HUB_DB, 'entities');
        await idbDelete(HUB_DB, 'entities', keys.filter(isDemoKey));
      } catch { /* store may not exist in older dbs */ }
      try {
        const ikeys = await storeAllKeys(HUB_DB, 'intakes');
        await idbDelete(HUB_DB, 'intakes', ikeys.filter((k) => String(k).startsWith(DEMO_INTAKE_PREFIX)));
      } catch { /* best-effort */ }
      try {
        /* derivedFrom edges the demo deliveries wrote — a link is demo-side
           when either endpoint key carries a demo id */
        const links = await storeAllRecords<{ key?: string; from?: string; to?: string }>(HUB_DB, 'links');
        await idbDelete(
          HUB_DB,
          'links',
          links.filter((l) => isDemoKey(l?.key) || isDemoKey(l?.from) || isDemoKey(l?.to)).map((l) => l.key as IDBValidKey),
        );
      } catch { /* best-effort */ }
    }
    /* LS links bucket — same sweep for deployments without IDB */
    const lsLinks = lsGet<Record<string, { from?: string; to?: string }>>(LS_LINKS_KEY);
    if (lsLinks) {
      let touched = false;
      for (const [k, l] of Object.entries(lsLinks)) {
        if (isDemoKey(k) || isDemoKey(l?.from) || isDemoKey(l?.to)) { delete lsLinks[k]; touched = true; }
      }
      if (touched) lsSet(LS_LINKS_KEY, lsLinks);
    }
    /* margin notes — 'intake-in-demo-*' */
    if (dbNames.includes(MARGIN_DB)) {
      try {
        const nkeys = await storeAllKeys(MARGIN_DB, 'notes');
        await idbDelete(MARGIN_DB, 'notes', nkeys.filter(isDemoId));
      } catch { /* best-effort */ }
    }

    /* second pass — anything a mounted store re-stamped while the IDB
       deletes ran gets flattened again before the flag drops */
    syncMountedStores();

    try { localStorage.removeItem(DEMO_FLAG_KEY); } catch { /* ok */ }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
