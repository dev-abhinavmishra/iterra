import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppSettings,
  CourseRef,
  DayException,
  Entry,
  EventMapping,
  ExceptionKind,
  Experiment,
  FrictionKind,
  FrictionNote,
  ISODate,
  RegisterData,
  Routine,
  RoutineAccent,
  RoutineMeasure,
  SuiteApp,
  WeeklyReview,
} from '../lib/types';
import { nowISO, todayISO, uid } from '../lib/dates';
import { entriesFromSource, intakeEvent, matchMappings, deriveEntry } from '../lib/events';
import type { IntakeResult } from '../lib/events';
import { parseInboundLink } from '../lib/links';
import { exportRegister, parseRegisterBackup } from '../lib/backup';

export const DEFAULT_SETTINGS: AppSettings = {
  weekStartsOn: 1,
  motion: 'full',
  timerBaseUrl: '/apps/timer',
  inkBaseUrl: '/apps/ink',
  modularBaseUrl: 'https://modularaistack.vercel.app',
  flashcardsBaseUrl: '/apps/flashcards',
  gradestackBaseUrl: '/apps/gradestack',
  syllabusBaseUrl: '/apps/syllabus',
  proofBaseUrl: '/apps/proof',
};

/** A one-time receipt for an event accepted at boot or via import. */
export interface EventReceipt {
  eventId: string;
  sourceApp: SuiteApp;
  type: string;
  entriesWritten: number;
  routineNames: string[];
  duplicate: boolean;
}

interface RegisterState extends RegisterData {
  // ── boot ──
  booted: boolean;
  onboardingSeen: boolean;
  receipt: EventReceipt | null;
  focusedRoutineName: string | null;
  focusedExperimentId: string | null;
  boot: (query?: string) => void;
  hasOnboarded: () => boolean;
  dismissReceipt: () => void;
  markOnboardingSeen: () => void;

  // ── routines ──
  addRoutine: (r: {
    name: string;
    measure: RoutineMeasure;
    unit?: string;
    perWeek: number;
    perDay?: number;
    weekdays: number[];
    minimumLabel?: string;
    minimumPerWeek?: number;
    accent?: RoutineAccent;
    courseId?: string;
    windowStart?: string;
    windowEnd?: string;
  }) => Routine;
  updateRoutine: (id: string, patch: Partial<Routine>) => void;
  archiveRoutine: (id: string) => void;
  pauseRoutine: (id: string, reason?: string) => void;
  resumeRoutine: (id: string) => void;

  // ── entries (check-ins) ──
  checkIn: (
    routineId: string,
    opts?: { value?: number; isMinimum?: boolean; note?: string; context?: string; date?: ISODate },
  ) => Entry | null;
  removeEntry: (id: string) => void;
  updateEntryNote: (id: string, note: string) => void;

  // ── exceptions ──
  addException: (e: { routineId: string | 'all'; date: ISODate; kind: ExceptionKind; note?: string }) => DayException;
  removeException: (id: string) => void;

  // ── friction log ──
  logFriction: (f: { routineId: string; date?: ISODate; kind: FrictionKind; note?: string }) => FrictionNote;
  removeFriction: (id: string) => void;

  // ── events & mappings ──
  intakeRaw: (raw: unknown) => IntakeResult;
  addMapping: (m: { eventType: string; routineId: string; valueRule: EventMapping['valueRule']; metricKey?: string }) => EventMapping;
  updateMapping: (id: string, patch: Partial<EventMapping>) => void;
  removeMapping: (id: string) => void;
  deleteEventsBySource: (app: SuiteApp) => { removedEvents: number; removedEntries: number };
  removeEvent: (id: string) => void;

  // ── weekly review ──
  saveReview: (r: { weekStart: ISODate; confirmed: string[]; reflection: string; adjustment?: string }) => WeeklyReview;

  // ── experiments ──
  addExperiment: (e: { routineId: string; hypothesis: string; change: string; startDate: ISODate; endDate: ISODate }) => Experiment;
  resolveExperiment: (id: string, status: 'completed' | 'abandoned', outcome?: string) => void;

  // ── courses ──
  addCourse: (c: { name: string; code?: string }) => CourseRef;
  removeCourse: (id: string) => void;

  // ── settings & backup ──
  updateSettings: (patch: Partial<AppSettings>) => void;
  exportJSON: () => string;
  importJSON: (text: string) => { ok: true } | { ok: false; error: string };
  resetRegister: () => void;
}

const EMPTY_DATA = (): RegisterData => ({
  routines: {},
  entries: {},
  events: {},
  mappings: {},
  exceptions: {},
  friction: {},
  reviews: {},
  experiments: {},
  courses: {},
  settings: DEFAULT_SETTINGS,
});

let accentCursor = 0;
const ACCENTS: RoutineAccent[] = ['indigo', 'oxblood', 'hunter', 'ochre', 'plum', 'teal', 'slate', 'rust'];
function nextAccent(routines: Record<string, Routine>): RoutineAccent {
  const used = new Set(Object.values(routines).map((r) => r.accent));
  for (let i = 0; i < ACCENTS.length; i++) {
    const a = ACCENTS[(accentCursor + i) % ACCENTS.length];
    if (!used.has(a)) {
      accentCursor = (accentCursor + i + 1) % ACCENTS.length;
      return a;
    }
  }
  return ACCENTS[accentCursor++ % ACCENTS.length];
}

/** Write derived entries for an accepted event (pure helper over set()). */
function writeEntries(
  state: RegisterState,
  derived: Omit<Entry, 'id' | 'createdAt'>[],
): { entries: Record<string, Entry>; written: number; names: string[] } {
  const entries = { ...state.entries };
  const names: string[] = [];
  let written = 0;
  for (const d of derived) {
    // Never write the same (eventId, routineId) twice.
    const already = Object.values(entries).some(
      (e) => e.eventId === d.eventId && e.routineId === d.routineId,
    );
    if (already) continue;
    const id = uid('ent');
    entries[id] = { ...d, id, createdAt: nowISO() } as Entry;
    written++;
    const name = state.routines[d.routineId]?.name;
    if (name && !names.includes(name)) names.push(name);
  }
  return { entries, written, names };
}

/* module-level boot-query dedupe — kept out of persisted state on purpose:
   a consumed link is a fact of this mount, not data to restore next boot. */
let _lastBootQuery: string | null = null;

export const useRegister = create<RegisterState>()(
  persist(
    (set, get) => ({
      ...EMPTY_DATA(),
      booted: false,
      onboardingSeen: false,
      receipt: null,
      focusedRoutineName: null,
      focusedExperimentId: null,

      /* The terrain passes the place query in — it lives inside the hash
         now ('#/p/rhythm?event=…'), not window.location.search. A re-call
         with a fresh query is a live re-delivery, so only a queryless
         call short-circuits once booted. */
      boot: (query?: string) => {
        if (get().booted && query === undefined) return;
        /* StrictMode re-invokes effects — a query string consumed twice
           would double-write the intake. One pass per string. */
        if (query !== undefined) {
          if (query === _lastBootQuery) return;
          _lastBootQuery = query;
        }
        const search = query ?? (typeof window !== 'undefined' ? window.location.search : '');
        const link = search ? parseInboundLink(search) : null;
        if (!link) {
          if (!get().booted) set({ booted: true });
          return;
        }
        // Consume the URL so a refresh doesn't re-deliver the event.
        try {
          if (query !== undefined) {
            window.history.replaceState(null, '', '#/p/rhythm');
          } else {
            const url = new URL(window.location.href);
            url.searchParams.delete('event');
            url.searchParams.delete('from');
            url.searchParams.delete('routine');
            url.searchParams.delete('experiment');
            window.history.replaceState(null, '', url.toString());
          }
        } catch {
          /* replaceState unavailable — still boot */
        }
        if (link.event !== undefined) {
          const res = get().intakeRaw(link.event);
          const st = get();
          if (res.kind === 'accepted' || res.kind === 'unmapped' || res.kind === 'duplicate') {
            const event = res.event;
            const routineNames =
              res.kind === 'accepted'
                ? res.entries.map((e) => st.routines[e.routineId]?.name).filter(Boolean) as string[]
                : [];
            set({
              booted: true,
              receipt: {
                eventId: event.id,
                sourceApp: event.sourceApp,
                type: event.type,
                entriesWritten: res.kind === 'accepted' ? res.entries.length : 0,
                routineNames,
                duplicate: res.kind === 'duplicate',
              },
              focusedRoutineName: link.routineName ?? null,
              focusedExperimentId: link.experimentId ?? null,
            });
            return;
          }
        }
        set({
          booted: true,
          focusedRoutineName: link?.routineName ?? null,
          focusedExperimentId: link?.experimentId ?? null,
        });
      },

      hasOnboarded: () => get().onboardingSeen || Object.keys(get().routines).length > 0,
      dismissReceipt: () => set({ receipt: null }),
      markOnboardingSeen: () => set({ onboardingSeen: true }),

      // ── routines ──
      addRoutine: (r) => {
        const routine: Routine = {
          id: uid('rtn'),
          name: r.name.trim(),
          measure: r.measure,
          unit: r.unit?.trim() || undefined,
          target: { perWeek: Math.max(1, Math.round(r.perWeek)), perDay: r.perDay },
          weekdays: [...r.weekdays].sort(),
          minimum: r.minimumLabel
            ? { label: r.minimumLabel.trim(), perWeek: r.minimumPerWeek }
            : undefined,
          accent: r.accent ?? nextAccent(get().routines),
          courseId: r.courseId,
          status: 'active',
          windowStart: r.windowStart,
          windowEnd: r.windowEnd,
          createdAt: nowISO(),
        };
        set((s) => ({ routines: { ...s.routines, [routine.id]: routine } }));
        return routine;
      },

      updateRoutine: (id, patch) =>
        set((s) => ({
          routines: { ...s.routines, [id]: { ...s.routines[id], ...patch, id } },
        })),

      archiveRoutine: (id) => get().updateRoutine(id, { status: 'archived' }),

      pauseRoutine: (id, reason) =>
        set((s) => {
          const r = s.routines[id];
          if (!r || r.status === 'paused') return {};
          const pauses = [...(r.pauses ?? []), { from: todayISO() }];
          return {
            routines: {
              ...s.routines,
              [id]: { ...r, status: 'paused', pausedAt: nowISO(), pauseReason: reason, pauses },
            },
          };
        }),

      resumeRoutine: (id) =>
        set((s) => {
          const r = s.routines[id];
          if (!r || r.status !== 'paused') return {};
          const pauses = (r.pauses ?? []).map((p, i, arr) =>
            i === arr.length - 1 && p.to === undefined ? { ...p, to: todayISO() } : p,
          );
          return {
            routines: {
              ...s.routines,
              [id]: { ...r, status: 'active', pausedAt: undefined, pauseReason: undefined, pauses },
            },
          };
        }),

      // ── entries ──
      checkIn: (routineId, opts = {}) => {
        const s = get();
        const routine = s.routines[routineId];
        if (!routine || routine.status === 'archived') return null;
        const date = opts.date ?? todayISO();
        // Check routines are idempotent per day — a stamp can't land twice.
        if (
          routine.measure === 'check' &&
          !opts.isMinimum &&
          Object.values(s.entries).some(
            (e) => e.routineId === routineId && e.date === date && !e.isMinimum,
          )
        ) {
          return null;
        }
        const entry: Entry = {
          id: uid('ent'),
          routineId,
          date,
          value: routine.measure === 'check' ? 1 : Math.max(0, opts.value ?? 1),
          isMinimum: opts.isMinimum || undefined,
          note: opts.note?.trim() || undefined,
          context: opts.context?.trim() || undefined,
          source: 'manual',
          createdAt: nowISO(),
        };
        set((st) => ({ entries: { ...st.entries, [entry.id]: entry } }));
        return entry;
      },

      removeEntry: (id) =>
        set((s) => {
          const entries = { ...s.entries };
          delete entries[id];
          return { entries };
        }),

      updateEntryNote: (id, note) =>
        set((s) =>
          s.entries[id]
            ? { entries: { ...s.entries, [id]: { ...s.entries[id], note: note.trim() || undefined } } }
            : {},
        ),

      // ── exceptions ──
      addException: (e) => {
        const ex: DayException = {
          id: uid('exc'),
          routineId: e.routineId,
          date: e.date,
          kind: e.kind,
          note: e.note?.trim() || undefined,
          createdAt: nowISO(),
        };
        set((s) => ({ exceptions: { ...s.exceptions, [ex.id]: ex } }));
        return ex;
      },

      removeException: (id) =>
        set((s) => {
          const exceptions = { ...s.exceptions };
          delete exceptions[id];
          return { exceptions };
        }),

      // ── friction ──
      logFriction: (f) => {
        const note: FrictionNote = {
          id: uid('frc'),
          routineId: f.routineId,
          date: f.date ?? todayISO(),
          kind: f.kind,
          note: f.note?.trim() || undefined,
          createdAt: nowISO(),
        };
        set((s) => ({ friction: { ...s.friction, [note.id]: note } }));
        return note;
      },

      removeFriction: (id) =>
        set((s) => {
          const friction = { ...s.friction };
          delete friction[id];
          return { friction };
        }),

      // ── events & mappings ──
      intakeRaw: (raw) => {
        const s = get();
        const res = intakeEvent(raw, s.events, Object.values(s.mappings), s.routines);
        if (res.kind === 'invalid') return res;
        if (res.kind === 'duplicate') return res;
        // Store the event (append-only) even when unmapped — evidence stays.
        const events = { ...s.events, [res.event.id]: res.event };
        if (res.kind === 'accepted') {
          const { entries } = writeEntries(s, res.entries);
          set({ events, entries });
        } else {
          set({ events });
        }
        return res;
      },

      addMapping: (m) => {
        const mapping: EventMapping = {
          id: uid('map'),
          eventType: m.eventType.trim(),
          routineId: m.routineId,
          valueRule: m.valueRule,
          metricKey: m.metricKey?.trim() || undefined,
          enabled: true,
          createdAt: nowISO(),
        };
        set((s) => ({ mappings: { ...s.mappings, [mapping.id]: mapping } }));
        // Retro-derive entries for stored events this mapping now covers.
        const s = get();
        const toWrite: Omit<Entry, 'id' | 'createdAt'>[] = [];
        for (const ev of Object.values(s.events)) {
          if (!matchMappings([mapping], ev).length) continue;
          const routine = s.routines[mapping.routineId];
          if (!routine || routine.status === 'archived') continue;
          const d = deriveEntry(ev, routine, mapping);
          if (d) toWrite.push(d);
        }
        if (toWrite.length) {
          const { entries } = writeEntries(s, toWrite);
          set({ entries });
        }
        return mapping;
      },

      updateMapping: (id, patch) =>
        set((s) =>
          s.mappings[id]
            ? { mappings: { ...s.mappings, [id]: { ...s.mappings[id], ...patch, id } } }
            : {},
        ),

      removeMapping: (id) =>
        set((s) => {
          const mappings = { ...s.mappings };
          delete mappings[id];
          return { mappings };
        }),

      deleteEventsBySource: (app) => {
        const s = get();
        const removedEventIds = new Set(
          Object.values(s.events).filter((e) => e.sourceApp === app).map((e) => e.id),
        );
        const removedEntryIds = new Set(entriesFromSource(s.entries, s.events, app));
        const events = { ...s.events };
        const entries = { ...s.entries };
        for (const id of removedEventIds) delete events[id];
        for (const id of removedEntryIds) delete entries[id];
        set({ events, entries });
        return { removedEvents: removedEventIds.size, removedEntries: removedEntryIds.size };
      },

      removeEvent: (id) =>
        set((s) => {
          const ev = s.events[id];
          if (!ev) return {};
          const events = { ...s.events };
          delete events[id];
          const entries = { ...s.entries };
          for (const e of Object.values(entries)) {
            if (e.eventId === id) delete entries[e.id];
          }
          return { events, entries };
        }),

      // ── weekly review ──
      saveReview: (r) => {
        const review: WeeklyReview = {
          id: r.weekStart,
          weekStart: r.weekStart,
          confirmed: r.confirmed,
          reflection: r.reflection.trim(),
          adjustment: r.adjustment?.trim() || undefined,
          createdAt: nowISO(),
        };
        set((s) => ({ reviews: { ...s.reviews, [review.id]: review } }));
        return review;
      },

      // ── experiments ──
      addExperiment: (e) => {
        const ex: Experiment = {
          id: uid('exp'),
          routineId: e.routineId,
          hypothesis: e.hypothesis.trim(),
          change: e.change.trim(),
          startDate: e.startDate,
          endDate: e.endDate,
          status: 'active',
          createdAt: nowISO(),
        };
        set((s) => ({ experiments: { ...s.experiments, [ex.id]: ex } }));
        return ex;
      },

      resolveExperiment: (id, status, outcome) =>
        set((s) =>
          s.experiments[id]
            ? {
                experiments: {
                  ...s.experiments,
                  [id]: { ...s.experiments[id], status, outcome: outcome?.trim() || undefined },
                },
              }
            : {},
        ),

      // ── courses ──
      addCourse: (c) => {
        const course: CourseRef = {
          id: uid('crs'),
          name: c.name.trim(),
          code: c.code?.trim() || undefined,
          createdAt: nowISO(),
        };
        set((s) => ({ courses: { ...s.courses, [course.id]: course } }));
        return course;
      },

      removeCourse: (id) =>
        set((s) => {
          const courses = { ...s.courses };
          delete courses[id];
          return { courses };
        }),

      // ── settings & backup ──
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      exportJSON: () => {
        const s = get();
        return exportRegister({
          routines: s.routines,
          entries: s.entries,
          events: s.events,
          mappings: s.mappings,
          exceptions: s.exceptions,
          friction: s.friction,
          reviews: s.reviews,
          experiments: s.experiments,
          courses: s.courses,
          settings: s.settings,
        });
      },

      importJSON: (text) => {
        const res = parseRegisterBackup(text);
        if (!res.ok) return res;
        set({ ...res.data });
        return { ok: true };
      },

      resetRegister: () =>
        set({ ...EMPTY_DATA(), receipt: null, focusedRoutineName: null, focusedExperimentId: null, onboardingSeen: false }),
    }),
    {
      name: 'rhythm.register.v1',
      version: 2,
      /* v2: vendored sibling apps always live under /apps/<name> — an
         absolute http(s) baseUrl persisted before vendoring (the old
         *.vercel.app prod defaults, or any manual absolute) would make
         evidence/source links escape the terrain, so normalize them once.
         modularBaseUrl is untouched — Modular AI isn't vendored. */
      migrate: (persisted, version) => {
        const s = persisted as { settings?: AppSettings } | undefined;
        if (version < 2 && s?.settings) {
          const vendored: [keyof AppSettings, string][] = [
            ['timerBaseUrl', 'timer'],
            ['inkBaseUrl', 'ink'],
            ['flashcardsBaseUrl', 'flashcards'],
            ['gradestackBaseUrl', 'gradestack'],
            ['syllabusBaseUrl', 'syllabus'],
            ['proofBaseUrl', 'proof'],
          ];
          for (const [key, slug] of vendored) {
            const v = s.settings[key];
            if (typeof v === 'string' && /^https?:\/\//.test(v)) {
              (s.settings as unknown as Record<string, string>)[key] = `/apps/${slug}`;
            }
          }
        }
        return persisted;
      },
      partialize: (s) => ({
        routines: s.routines,
        entries: s.entries,
        events: s.events,
        mappings: s.mappings,
        exceptions: s.exceptions,
        friction: s.friction,
        reviews: s.reviews,
        experiments: s.experiments,
        courses: s.courses,
        settings: s.settings,
        onboardingSeen: s.onboardingSeen,
      }),
    },
  ),
);
