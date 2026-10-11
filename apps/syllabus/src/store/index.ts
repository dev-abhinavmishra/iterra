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
import { uid, weekStartISO, addDaysISO } from '../lib/utils';
import { estimateRatio, missedBlocks, remainingMinutes } from '../lib/schedule';
import { exportFolio, parseFolioBackup } from '../lib/backup';

export type { ProposedBlock };

export const DEFAULT_SETTINGS: AppSettings = {
  timerBaseUrl: 'https://timerstack.vercel.app',
  inkBaseUrl: 'https://ink-notes.vercel.app',
  modularBaseUrl: 'https://modularaistack.vercel.app',
  flashcardsBaseUrl: 'https://flashcards-stack.vercel.app',
  gradestackBaseUrl: 'https://gradestack.vercel.app',
  studyWindowStart: '16:00',
  maxBlockMinutes: 90,
  defaultAvailableMinutes: 180,
  weekStartsOn: 1,
  motion: 'full',
};

interface FolioState extends FolioData {
  // ── boot ──
  booted: boolean;
  boot: () => void;
  hasOnboarded: () => boolean;

  // ── terms ──
  createTerm: (t: Omit<Term, 'id' | 'createdAt'>) => Term;
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

      boot: () => {
        const s = get();
        if (s.booted) return;
        set({ booted: true });
        // Inbound Timer completion: ?completedBlock=<id>&actual=<minutes>
        if (typeof window !== 'undefined') {
          const q = new URLSearchParams(window.location.search);
          const blockId = q.get('completedBlock');
          const actual = Number(q.get('actual'));
          if (blockId && s.blocks[blockId]) {
            get().completeBlock(blockId, Number.isFinite(actual) && actual > 0 ? actual : undefined);
            const url = new URL(window.location.href);
            url.search = '';
            window.history.replaceState({}, '', url.toString());
          }
        }
        maybeNotify(get());
      },

      hasOnboarded: () => Object.keys(get().courses).length > 0,

      createTerm: (t) => {
        const term: Term = { ...t, id: uid('t_'), createdAt: new Date().toISOString() };
        set((s) => ({
          terms: { ...s.terms, [term.id]: term },
          activeTermId: term.id,
        }));
        return term;
      },

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
        return course;
      },

      updateCourse: (id, patch) =>
        set((s) => ({
          courses: { ...s.courses, [id]: { ...s.courses[id], ...patch } },
        })),

      archiveCourse: (id, archived) =>
        set((s) => ({
          courses: { ...s.courses, [id]: { ...s.courses[id], archived } },
        })),

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
        return commitment;
      },

      updateCommitment: (id, patch) =>
        set((s) => ({
          commitments: { ...s.commitments, [id]: { ...s.commitments[id], ...patch } },
        })),

      setCommitmentStatus: (id, status) =>
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
            const nextDue = addDaysISO(c.dueAt.slice(0, 10), 7);
            if (!term?.endDate || nextDue <= term.endDate) {
              const next: Commitment = {
                ...c,
                id: uid('k_'),
                dueAt: nextDue + c.dueAt.slice(10),
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
        }),

      togglePin: (id) =>
        set((s) => ({
          commitments: {
            ...s.commitments,
            [id]: { ...s.commitments[id], pinned: !s.commitments[id].pinned },
          },
        })),

      acceptProposals: (proposals) => {
        const made = proposals.map((p, i) => {
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
          return b;
        });
        set((s) => {
          const blocks = { ...s.blocks };
          for (const b of made) blocks[b.id] = b;
          return { blocks };
        });
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

      rescheduleBlock: (id, date, startHHMM) =>
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
        }),

      completeBlock: (id, actualMinutes) =>
        set((s) => {
          const b = s.blocks[id];
          if (!b) return s;
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
        }),

      unstampBlock: (id) =>
        set((s) => {
          const b = s.blocks[id];
          if (!b || b.state !== 'done') return s;
          const c = s.commitments[b.commitmentId];
          const actual = b.actualMinutes ?? b.plannedMinutes;
          const blocks = {
            ...s.blocks,
            [id]: { ...b, state: 'planned' as const, actualMinutes: undefined, completedAt: undefined, timerSessionUrl: undefined },
          };
          const commitments = c
            ? {
                ...s.commitments,
                [c.id]: { ...c, loggedMinutes: Math.max(0, c.loggedMinutes - actual) },
              }
            : s.commitments;
          return { blocks, commitments };
        }),

      deferBlock: (id, note, toDate) =>
        set((s) => {
          const b = s.blocks[id];
          if (!b) return s;
          const moved: WorkBlock = {
            ...b,
            state: toDate ? 'planned' : 'deferred',
            plannedDate: toDate ?? b.plannedDate,
            carriedFrom: b.carriedFrom ?? b.plannedDate,
            deferNote: note,
            deferCount: b.deferCount + 1,
          };
          return { blocks: { ...s.blocks, [id]: moved } };
        }),

      carryBlock: (id, toDate) =>
        set((s) => {
          const b = s.blocks[id];
          if (!b) return s;
          return {
            blocks: {
              ...s.blocks,
              [id]: {
                ...b,
                state: 'planned',
                plannedDate: toDate,
                carriedFrom: b.carriedFrom ?? b.plannedDate,
              },
            },
          };
        }),

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
          .filter((c) => c.completedAt && c.completedAt.slice(0, 10) >= weekStart && c.completedAt.slice(0, 10) < addDaysISO(weekStart, 7))
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
          if (!data.settings) data.settings = DEFAULT_SETTINGS;
          set({ ...data });
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : 'Import failed' };
        }
      },

      resetFolio: () => set({ ...EMPTY_DATA, settings: { ...get().settings } }),
    }),
    {
      name: 'syllabus.folio.v1',
      version: 1,
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
  return c.dueAt.slice(0, 10);
}

// ── Optional desk reminders (browser Notification API — never required) ─────
// Fires once per boot when enabled + permission already granted: a single
// registrar's memo naming what's due inside 48h. No scheduling daemon, no
// required permission — the folio works fully without it.
function maybeNotify(s: FolioState) {
  if (!s.settings.remindersEnabled) return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const today = new Date().toISOString().slice(0, 10);
  const soon = addDaysISO(today, 2);
  const open = Object.values(s.commitments).filter((c) => c.status === 'open');
  const overdue = open.filter((c) => c.dueAt.slice(0, 10) < today).length;
  const dueSoon = open.filter((c) => {
    const d = c.dueAt.slice(0, 10);
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
