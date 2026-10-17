import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppSettings,
  Commitment,
  CommitmentStatus,
  Course,
  FolioData,
  ISODate,
  ResourceLink,
  Review,
  Term,
  WorkBlock,
} from '../lib/types';
import type { ProposedBlock } from '../lib/schedule';
import { uid, weekStartISO, addDaysISO, dueDateISO, localDateISO, localTimeHHMM, isoAtTime, todayISO } from '../lib/utils';
import { estimateRatio, missedBlocks, remainingMinutes } from '../lib/schedule';
import { exportFolio, parseFolioBackup } from '../lib/backup';

export type { ProposedBlock };

// Module-level StrictMode/re-mount guard — boot(query) runs per query change,
// but the same query must never consume an inbound link twice.
let lastBootQuery: string | undefined;

export const DEFAULT_SETTINGS: AppSettings = {
  timerBaseUrl: '/apps/timer',
  inkBaseUrl: '/apps/ink',
  modularBaseUrl: 'https://modularaistack.vercel.app',
  flashcardsBaseUrl: '/apps/flashcards',
  gradestackBaseUrl: '/apps/gradestack',
  studyWindowStart: '16:00',
  maxBlockMinutes: 90,
  defaultAvailableMinutes: 180,
  weekStartsOn: 1,
  motion: 'full',
};

interface FolioState extends FolioData {
  // ── boot ──
  booted: boolean;
  boot: (query?: string) => void;
  hasOnboarded: () => boolean;
  // Inbound ?block=<id> deep link: boot stashes the id; TodayView consumes it
  // to select the slip, then clears it. Not persisted as navigation state.
  intakeBlockId: string | null;
  clearIntakeBlock: () => void;
  intakeCommitmentId: string | null;
  clearIntakeCommitment: () => void;

  // ── terms ──
  createTerm: (t: Omit<Term, 'id' | 'createdAt'>) => Term;
  updateTerm: (id: string, patch: Partial<Omit<Term, 'id' | 'createdAt'>>) => void;
  setActiveTerm: (id: string) => void;

  // ── courses ──
  addCourse: (c: Omit<Course, 'id' | 'termId' | 'createdAt' | 'archived'> & { termId?: string }) => Course;
  updateCourse: (id: string, patch: Partial<Course>) => void;
  archiveCourse: (id: string, archived: boolean) => void;

  // ── commitments ──
  addCommitment: (
    c: Omit<Commitment, 'id' | 'createdAt' | 'status' | 'loggedMinutes' | 'pinned' | 'dependencies'> & {
      status?: CommitmentStatus;
      pinned?: boolean;
      dependencies?: string[];
    },
  ) => Commitment;
  updateCommitment: (id: string, patch: Partial<Commitment>) => void;
  setCommitmentStatus: (id: string, status: CommitmentStatus) => void;
  togglePin: (id: string) => void;

  // ── work blocks ──
  acceptProposals: (proposals: ProposedBlock[]) => WorkBlock[];
  addBlock: (b: Omit<WorkBlock, 'id' | 'createdAt' | 'deferCount'>) => WorkBlock;
  rescheduleBlock: (id: string, date: ISODate, startHHMM?: string) => void;
  completeBlock: (id: string, actualMinutes?: number) => void;
  unstampBlock: (id: string) => void;
  deferBlock: (id: string, note: string, toDate?: ISODate) => void;
  carryBlock: (id: string, toDate: ISODate) => void;
  deleteBlock: (id: string) => void;
  startBlock: (id: string, timerUrl: string) => void;
  dismissProposal: (date: ISODate, commitmentId: string) => void;
  reorderBlocks: (date: ISODate, orderedIds: string[]) => void;

  // ── links ──
  addLink: (l: Omit<ResourceLink, 'id' | 'createdAt'>) => ResourceLink;
  removeLink: (id: string) => void;

  // ── reviews ──
  saveReview: (weekStart: ISODate, notes: string) => Review;

  // ── settings ──
  updateSettings: (patch: Partial<AppSettings>) => void;

  // ── backup ──
  exportJSON: () => string;
  importJSON: (text: string) => { ok: true } | { ok: false; error: string };
  resetFolio: () => void;
}

/* While a bulk filing runs (import rows, template seeding, onboarding
   course intake), per-row stirs are held — the caller emits ONE summary
   stir after endBulkFeed; a filing wave is one event, not N. */
let bulkFeedDepth = 0;
export const beginBulkFeed = () => { bulkFeedDepth += 1; };
export const endBulkFeed = () => { bulkFeedDepth = Math.max(0, bulkFeedDepth - 1); };

// Unified activity stream (docs/WIRING.md §7): emit only real state changes.
const feed = (text: string, url?: string, course?: string) => {
  if (bulkFeedDepth) return;
  try {
    (window as any).iterra?.feed?.({ text, url, course });
  } catch {
    /* feed is best-effort */
  }
};
export const stir = feed;

const EMPTY_DATA: FolioData = {
  terms: {},
  courses: {},
  commitments: {},
  blocks: {},
  links: {},
  reviews: {},
  settings: DEFAULT_SETTINGS,
  dismissed: {},
};

export const useFolio = create<FolioState>()(
  persist(
    (set, get) => ({
      ...EMPTY_DATA,
      booted: false,

      boot: (query = '') => {
        const s = get();
        if (s.booted && query === lastBootQuery) return;
        lastBootQuery = query;
        if (!s.booted) set({ booted: true });
        // boot() can fire before persist hydration lands — consumeInbound
        // returns false while its param targets aren't readable yet, and a
        // one-shot subscription retries once blocks are.
        const stripPlaceQuery = () => {
          const h = window.location.hash;
          if (h.includes('?')) window.location.hash = h.slice(0, h.indexOf('?'));
        };
        const consumeInbound = (): boolean => {
          if (typeof window === 'undefined') return true;
          const st = get();
          const q = new URLSearchParams(query);
          const blockId = q.get('completedBlock');
          const focusId = q.get('block');
          const commitmentId = q.get('commitment');
          if (!blockId && !focusId && !commitmentId) return true;
          const done = q.get('completedBlock') || q.get('block') || q.get('commitment');
          let consumed = false;
          // Inbound Timer completion: ?completedBlock=<id>&actual=<minutes>
          const actual = Number(q.get('actual'));
          if (blockId && st.blocks[blockId]) {
            const wasDone = st.blocks[blockId].state === 'done';
            st.completeBlock(blockId, Number.isFinite(actual) && actual > 0 ? actual : undefined);
            const stamped = get().blocks[blockId];
            const c = stamped ? get().commitments[stamped.commitmentId] : undefined;
            if (!wasDone) {
              feed(
                `timer filed ${stamped?.actualMinutes ?? (Number.isFinite(actual) ? actual : 0)}m into ${c?.title ?? 'a block'}`,
                `/apps/syllabus/?block=${blockId}`,
                c ? get().courses[c.courseId]?.code : undefined,
              );
            }
            consumed = true;
          }
          // Search-palette deep link: ?block=<id> → select the slip on Today.
          if (focusId && st.blocks[focusId]) {
            set({ intakeBlockId: focusId });
            consumed = true;
          }
          // Index-entity deep link: ?commitment=<id> → open its drawer.
          if (commitmentId && st.commitments[commitmentId]) {
            set({ intakeCommitmentId: commitmentId });
            consumed = true;
          }
          if (consumed) stripPlaceQuery();
          return consumed || !done;
        };
        if (!consumeInbound()) {
          // The retry keeps unconsumed params readable until blocks
          // hydrate. When a retry still can't consume, the ids are
          // permanently ghost — strip the dead params so deep links
          // don't linger in the address bar.
          const stripDead = () => stripPlaceQuery();
          const retry = () => { if (!consumeInbound()) stripDead(); };
          if (useFolio.persist?.hasHydrated?.()) {
            // hydration already done — an unconsumed param is a dead link;
            // yield a tick so mount effects settle, then strip it.
            setTimeout(retry, 0);
          } else {
            // one-shot: detach before consuming — consumeInbound's own set()
            // would re-enter this listener while params are still in the URL.
            const unsub = useFolio.subscribe(() => { unsub(); retry(); });
          }
        }
        maybeNotify(get());
      },

      intakeBlockId: null,
      clearIntakeBlock: () => set({ intakeBlockId: null }),
      intakeCommitmentId: null,
      clearIntakeCommitment: () => set({ intakeCommitmentId: null }),

      hasOnboarded: () => Object.keys(get().courses).length > 0,

      createTerm: (t) => {
        const term: Term = { ...t, id: uid('t_'), createdAt: new Date().toISOString() };
        set((s) => ({
          terms: { ...s.terms, [term.id]: term },
          activeTermId: term.id,
        }));
        feed(`term filed: ${term.name}`, '/apps/syllabus/');
        return term;
      },

      updateTerm: (id, patch) =>
        set((s) => ({
          terms: s.terms[id] ? { ...s.terms, [id]: { ...s.terms[id], ...patch, id } } : s.terms,
        })),

      setActiveTerm: (id) => set({ activeTermId: id }),

      addCourse: (c) => {
        const s = get();
        const termId = c.termId ?? s.activeTermId;
        if (!termId) throw new Error('No active term');
        const course: Course = {
          ...c,
          id: uid('c_'),
          termId,
          archived: false,
          createdAt: new Date().toISOString(),
        };
        set((st) => ({ courses: { ...st.courses, [course.id]: course } }));
        feed(`course filed: ${course.code}`, '/apps/syllabus/', course.code);
        return course;
      },

      updateCourse: (id, patch) =>
        set((s) => ({
          courses: { ...s.courses, [id]: { ...s.courses[id], ...patch } },
        })),

      archiveCourse: (id, archived) => {
        const code = get().courses[id]?.code;
        set((s) => ({
          courses: { ...s.courses, [id]: { ...s.courses[id], archived } },
        }));
        feed(
          `course ${archived ? 'archived' : 'unarchived'}: ${code ?? 'a course'}`,
          '/apps/syllabus/',
          code,
        );
      },

      addCommitment: (c) => {
        const commitment: Commitment = {
          ...c,
          id: uid('k_'),
          status: c.status ?? 'open',
          loggedMinutes: 0,
          pinned: c.pinned ?? false,
          dependencies: c.dependencies ?? [],
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ commitments: { ...s.commitments, [commitment.id]: commitment } }));
        feed(
          `commitment filed: ${commitment.title}`,
          '/apps/syllabus/',
          commitment.courseId ? get().courses[commitment.courseId]?.code : undefined,
        );
        return commitment;
      },

      updateCommitment: (id, patch) =>
        set((s) => ({
          commitments: { ...s.commitments, [id]: { ...s.commitments[id], ...patch } },
        })),

      setCommitmentStatus: (id, status) => {
        const before = get().commitments[id];
        const beforeIds = new Set(Object.keys(get().commitments));
        set((s) => {
          const c = s.commitments[id];
          if (!c) return s;
          const commitments = {
            ...s.commitments,
            [id]: {
              ...c,
              status,
              completedAt: status === 'done' ? new Date().toISOString() : undefined,
            },
          };
          // Recurring filing: done spawns the next weekly instance until the
          // term's end date — the syllabus keeps its rhythm.
          if (status === 'done' && c.recurrence === 'weekly') {
            const term = s.terms[c.courseId ? s.courses[c.courseId]?.termId ?? '' : ''];
            const nextDue = addDaysISO(dueDateISO(c.dueAt), 7);
            if (!term?.endDate || nextDue <= term.endDate) {
              const next: Commitment = {
                ...c,
                id: uid('k_'),
                dueAt: isoAtTime(nextDue, localTimeHHMM(c.dueAt)),
                status: 'open',
                grade: undefined,
                loggedMinutes: 0,
                lastWorkedAt: undefined,
                completedAt: undefined,
                createdAt: new Date().toISOString(),
              };
              commitments[next.id] = next;
            }
          }
          return { commitments };
        });
        if (before && before.status !== status && (status === 'done' || status === 'dropped')) {
          feed(
            `commitment ${status === 'done' ? 'done' : 'dropped'}: ${before.title}`,
            '/apps/syllabus/',
            before.courseId ? get().courses[before.courseId]?.code : undefined,
          );
        }
        // Weekly filing spawns the next instance inside set() — it's a real
        // filing, emit it too.
        const spawned = Object.values(get().commitments).find((c) => !beforeIds.has(c.id));
        if (spawned) {
          feed(
            `commitment filed: ${spawned.title}`,
            '/apps/syllabus/',
            spawned.courseId ? get().courses[spawned.courseId]?.code : undefined,
          );
        }
      },

      togglePin: (id) =>
        set((s) => ({
          commitments: {
            ...s.commitments,
            [id]: { ...s.commitments[id], pinned: !s.commitments[id].pinned },
          },
        })),

      acceptProposals: (proposals) => {
        const made: WorkBlock[] = [];
        set((s) => {
          const blocks = { ...s.blocks };
          proposals.forEach((p, i) => {
            // Double-accepts (a fast second click on a stale proposals array,
            // or RE-PLAN fired twice) replay identical proposals — skip any
            // whose slip already exists live for that slot.
            const dup = Object.values(blocks).some(
              (b) =>
                b.commitmentId === p.commitmentId &&
                b.plannedDate === p.plannedDate &&
                b.plannedStart === p.plannedStart &&
                b.plannedMinutes === p.plannedMinutes &&
                b.phase === p.phase &&
                b.label === p.label &&
                b.state !== 'done' &&
                b.state !== 'missed',
            );
            if (dup) return;
            const b: WorkBlock = {
              id: uid('b_'),
              commitmentId: p.commitmentId,
              plannedDate: p.plannedDate,
              plannedStart: p.plannedStart,
              plannedMinutes: p.plannedMinutes,
              state: 'planned',
              phase: p.phase,
              label: p.label,
              reasons: p.reasons,
              score: p.score,
              deferCount: 0,
              order: Date.now() + i,
              createdAt: new Date().toISOString(),
            };
            blocks[b.id] = b;
            made.push(b);
          });
          return { blocks };
        });
        if (made.length) feed(`plan generated: ${made.length} slip${made.length === 1 ? '' : 's'}`, '/apps/syllabus/');
        return made;
      },

      addBlock: (b) => {
        const block: WorkBlock = {
          ...b,
          id: uid('b_'),
          deferCount: 0,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ blocks: { ...s.blocks, [block.id]: block } }));
        return block;
      },

      rescheduleBlock: (id, date, startHHMM) => {
        const before = get().blocks[id];
        set((s) => {
          const b = s.blocks[id];
          // A stamped slip is a filed record — it never silently un-stamps.
          // To move it, un-stamp it first so the ledger stays honest.
          if (!b || b.state === 'done') return s;
          const moved: WorkBlock = {
            ...b,
            plannedDate: date,
            plannedStart: startHHMM ?? b.plannedStart,
            state: 'planned',
            carriedFrom: b.carriedFrom ?? (b.plannedDate !== date ? b.plannedDate : b.carriedFrom),
          };
          return { blocks: { ...s.blocks, [id]: moved } };
        });
        if (before && before.state !== 'done' && before.plannedDate !== date) {
          const c = get().commitments[before.commitmentId];
          feed(
            `slip moved to ${date}: ${before.label ?? c?.title ?? 'a block'}`,
            `/apps/syllabus/?block=${encodeURIComponent(id)}`,
            c ? get().courses[c.courseId]?.code : undefined,
          );
        }
      },

      completeBlock: (id, actualMinutes) => {
        set((s) => {
          const b = s.blocks[id];
          /* a done block stays stamped — a re-fired ?completedBlock link
             (duplicate navigation, tab restore) must not double-count
             loggedMinutes on the commitment */
          if (!b || b.state === 'done') return s;
          const actual = actualMinutes ?? b.actualMinutes ?? b.plannedMinutes;
          const c = s.commitments[b.commitmentId];
          const blocks = { ...s.blocks, [id]: { ...b, state: 'done' as const, actualMinutes: actual, completedAt: new Date().toISOString() } };
          const commitments = c
            ? {
                ...s.commitments,
                [c.id]: {
                  ...c,
                  loggedMinutes: c.loggedMinutes + actual,
                  lastWorkedAt: new Date().toISOString(),
                },
              }
            : s.commitments;
          return { blocks, commitments };
        });
        // 'slip stamped' is emitted by the ambient layer in lib/iterra.ts on
        // the done transition — no feed write needed here.
      },

      unstampBlock: (id) => {
        const b = get().blocks[id];
        set((s) => {
          const cur = s.blocks[id];
          if (!cur || cur.state !== 'done') return s;
          const c = s.commitments[cur.commitmentId];
          const actual = cur.actualMinutes ?? cur.plannedMinutes;
          const blocks = {
            ...s.blocks,
            [id]: { ...cur, state: 'planned' as const, actualMinutes: undefined, completedAt: undefined, timerSessionUrl: undefined },
          };
          const commitments = c
            ? {
                ...s.commitments,
                [c.id]: { ...c, loggedMinutes: Math.max(0, c.loggedMinutes - actual) },
              }
            : s.commitments;
          return { blocks, commitments };
        });
        if (b?.state === 'done') {
          const c = get().commitments[b.commitmentId];
          feed(
            `slip un-stamped: ${b.label ?? c?.title ?? 'a block'}`,
            `/apps/syllabus/?block=${encodeURIComponent(id)}`,
            c ? get().courses[c.courseId]?.code : undefined,
          );
        }
      },

      deferBlock: (id, note, toDate) => {
        const b = get().blocks[id];
        set((s) => {
          const cur = s.blocks[id];
          if (!cur) return s;
          const moved: WorkBlock = {
            ...cur,
            state: toDate ? 'planned' : 'deferred',
            plannedDate: toDate ?? cur.plannedDate,
            carriedFrom: cur.carriedFrom ?? cur.plannedDate,
            deferNote: note,
            deferCount: cur.deferCount + 1,
          };
          return { blocks: { ...s.blocks, [id]: moved } };
        });
        if (b) {
          const c = get().commitments[b.commitmentId];
          feed(
            `slip ${toDate ? `pushed to ${toDate}` : 'deferred'}: ${b.label ?? c?.title ?? 'a block'}`,
            `/apps/syllabus/?block=${encodeURIComponent(id)}`,
            c ? get().courses[c.courseId]?.code : undefined,
          );
        }
      },

      carryBlock: (id, toDate) => {
        const b = get().blocks[id];
        set((s) => {
          const cur = s.blocks[id];
          if (!cur) return s;
          return {
            blocks: {
              ...s.blocks,
              [id]: {
                ...cur,
                state: 'planned',
                plannedDate: toDate,
                carriedFrom: cur.carriedFrom ?? cur.plannedDate,
              },
            },
          };
        });
        if (b) {
          const c = get().commitments[b.commitmentId];
          feed(
            `slip carried to ${toDate}: ${b.label ?? c?.title ?? 'a block'}`,
            `/apps/syllabus/?block=${encodeURIComponent(id)}`,
            c ? get().courses[c.courseId]?.code : undefined,
          );
        }
      },

      deleteBlock: (id) =>
        set((s) => {
          const blocks = { ...s.blocks };
          delete blocks[id];
          return { blocks };
        }),

      startBlock: (id, timerUrl) =>
        set((s) => ({
          blocks: {
            ...s.blocks,
            [id]: { ...s.blocks[id], state: 'in-progress', timerSessionUrl: timerUrl },
          },
        })),

      dismissProposal: (date, commitmentId) =>
        set((s) => ({
          dismissed: {
            ...s.dismissed,
            [date]: [...(s.dismissed[date] ?? []), commitmentId],
          },
        })),

      reorderBlocks: (date, orderedIds) =>
        set((s) => {
          const blocks = { ...s.blocks };
          orderedIds.forEach((id, i) => {
            if (blocks[id] && blocks[id].plannedDate === date) {
              blocks[id] = { ...blocks[id], order: i };
            }
          });
          return { blocks };
        }),

      addLink: (l) => {
        const link: ResourceLink = { ...l, id: uid('r_'), createdAt: new Date().toISOString() };
        set((s) => ({ links: { ...s.links, [link.id]: link } }));
        return link;
      },

      removeLink: (id) =>
        set((s) => {
          const links = { ...s.links };
          delete links[id];
          return { links };
        }),

      saveReview: (weekStart, notes) => {
        const s = get();
        const blocks = Object.values(s.blocks).filter((b) => {
          return b.plannedDate >= weekStart && b.plannedDate < addDaysISO(weekStart, 7);
        });
        const planned = blocks.reduce((sum, b) => sum + b.plannedMinutes, 0);
        const actual = blocks.reduce((sum, b) => sum + (b.actualMinutes ?? 0), 0);
        const carryovers = blocks.filter((b) => b.state === 'missed' || b.state === 'deferred').map((b) => b.id);
        const completedCommitments = Object.values(s.commitments)
          .filter((c) => c.completedAt && localDateISO(c.completedAt) >= weekStart && localDateISO(c.completedAt) < addDaysISO(weekStart, 7))
          .map((c) => c.id);
        const review: Review = {
          weekStart,
          plannedMinutes: planned,
          actualMinutes: actual,
          carryovers,
          notes,
          completedCommitments,
          estimateRatio: estimateRatio(blocks) ?? undefined,
          createdAt: new Date().toISOString(),
        };
        set((st) => ({ reviews: { ...st.reviews, [weekStart]: review } }));
        feed(`week reviewed: ${actual}m against ${planned}m planned`, '/apps/syllabus/');
        return review;
      },

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      exportJSON: () => {
        const s = get();
        return exportFolio({
          terms: s.terms,
          activeTermId: s.activeTermId,
          courses: s.courses,
          commitments: s.commitments,
          blocks: s.blocks,
          links: s.links,
          reviews: s.reviews,
          settings: s.settings,
          dismissed: s.dismissed,
        });
      },

      importJSON: (text) => {
        try {
          const data = parseFolioBackup(text);
          data.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
          set({ ...data });
          feed('folio restored', '/apps/syllabus/');
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : 'Import failed' };
        }
      },

      resetFolio: () => {
        set({ ...EMPTY_DATA, settings: { ...get().settings } });
        feed('folio struck', '/apps/syllabus/');
      },
    }),
    {
      name: 'syllabus.folio.v1',
      version: 1,
      // Blobs written before array fields existed boot-crash on bare
      // iteration (c.dependencies is not iterable → white screen).
      // Backfill them at the merge boundary, once — same class as the
      // cardfile's loadStore normalize.
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<FolioData>;
        const commitments = { ...(p.commitments || {}) };
        for (const c of Object.values(commitments)) {
          if (!Array.isArray((c as Commitment).dependencies)) (c as Commitment).dependencies = [];
        }
        const blocks = { ...(p.blocks || {}) };
        for (const b of Object.values(blocks)) {
          if (!Array.isArray((b as WorkBlock).reasons)) (b as WorkBlock).reasons = [];
        }
        // Settings are key-wise too: a blob written before a key existed
        // (or a partial write) leaves it undefined — and every deep-link
        // builder dereferences the base URLs. Fill missing keys from
        // DEFAULT_SETTINGS; only real values win.
        const settings = { ...DEFAULT_SETTINGS } as AppSettings;
        for (const [k, v] of Object.entries(p.settings || {})) {
          if (v !== undefined && v !== null) (settings as unknown as Record<string, unknown>)[k] = v;
        }
        return { ...current, ...p, commitments, blocks, settings };
      },
      partialize: (s) => ({
        terms: s.terms,
        activeTermId: s.activeTermId,
        courses: s.courses,
        commitments: s.commitments,
        blocks: s.blocks,
        links: s.links,
        reviews: s.reviews,
        settings: s.settings,
        dismissed: s.dismissed,
      }),
    },
  ),
);

// ── Selectors ────────────────────────────────────────────────────────────────

export function selectActiveTerm(s: FolioState): Term | undefined {
  return s.activeTermId ? s.terms[s.activeTermId] : undefined;
}

export function selectTermCourses(s: FolioState): Course[] {
  const t = selectActiveTerm(s);
  return Object.values(s.courses)
    .filter((c) => !t || c.termId === t.id)
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function selectCourseCommitments(s: FolioState, courseId: string): Commitment[] {
  return Object.values(s.commitments)
    .filter((c) => c.courseId === courseId)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function selectBlocksOnDate(s: FolioState, date: ISODate): WorkBlock[] {
  return Object.values(s.blocks)
    .filter((b) => b.plannedDate === date)
    .sort((a, b) => a.order - b.order || a.plannedStart.localeCompare(b.plannedStart));
}

export function selectMissed(s: FolioState, today: ISODate): WorkBlock[] {
  return missedBlocks(Object.values(s.blocks), today);
}

export function selectDueCommitments(s: FolioState): Commitment[] {
  return Object.values(s.commitments).filter((c) => c.status === 'open' && remainingMinutes(c) > 0);
}

export function selectLinksFor(s: FolioState, commitmentId?: string, courseId?: string): ResourceLink[] {
  return Object.values(s.links).filter(
    (l) => (commitmentId && l.commitmentId === commitmentId) || (courseId && l.courseId === courseId),
  );
}

export function selectWeekKey(s: FolioState, date: ISODate): ISODate {
  return weekStartISO(date, s.settings.weekStartsOn);
}

export function commitmentDueISO(c: Commitment): ISODate {
  return dueDateISO(c.dueAt);
}

/* integration/commands.ts writes syllabus.folio.v1 through localStorage and
   then calls window.__syllabusFolioStore.setState to keep a mounted folio in
   sync — that global was never assigned in the shell, so a command-layer
   write (scheduleReviewBlock, attachMaterialToBlock, recordSessionOutcome)
   landed in localStorage but not memory, and the next folio mutation
   rewrote the file from stale state and silently undid it. Publish the
   handle so the command path reaches the live store. */
if (typeof window !== 'undefined') {
  (window as any).__syllabusFolioStore = useFolio;
}

// ── Optional desk reminders (browser Notification API — never required) ─────
// Fires once per boot when enabled + permission already granted: a single
// registrar's memo naming what's due inside 48h. No scheduling daemon, no
// required permission — the folio works fully without it.
function maybeNotify(s: FolioState) {
  if (!s.settings.remindersEnabled) return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const today = todayISO();
  const soon = addDaysISO(today, 2);
  const open = Object.values(s.commitments).filter((c) => c.status === 'open');
  const overdue = open.filter((c) => dueDateISO(c.dueAt) < today).length;
  const dueSoon = open.filter((c) => {
    const d = dueDateISO(c.dueAt);
    return d >= today && d <= soon;
  }).length;
  if (overdue === 0 && dueSoon === 0) return;
  const parts = [
    overdue > 0 ? `${overdue} overdue` : '',
    dueSoon > 0 ? `${dueSoon} due within 48h` : '',
  ].filter(Boolean).join(' · ');
  try {
    new Notification('Syllabus — registrar’s memo', { body: parts, tag: 'syllabus-desk' });
  } catch {
    // notifications unavailable in this context — never required
  }
}
