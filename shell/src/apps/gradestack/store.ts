import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db, auth } from './lib/firebase';
import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { gradeResponses, GradingScale, DEFAULT_SCALE } from './lib/grading';
import { uid } from './lib/uid';

/* Firestore rejects any document containing undefined field values —
   strip them before every write. */
const stripUndefined = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/* Terrain stir emit — same contract as lib/iterra's feed(), kept local so
   store.ts never imports lib/iterra.ts (which imports this store → cycle). */
const stir = (text: string, url?: string, course?: string) => {
  try {
    (window as any).iterra?.feed?.({ text, url, course });
  } catch {
    /* feed is best-effort */
  }
};

export type QuestionFormat = 'A-D' | 'A-E' | 'TF' | 'A-D-M' | 'A-E-M' | 'SA';

export interface TestSection {
  id: string;
  count: number;
  format: QuestionFormat;
}

export interface Test {
  id: string;
  name: string;
  courseName?: string;
  instructorName?: string;
  date: string;
  numQuestions: number;
  format: QuestionFormat;
  sections?: TestSection[];
  includeStudentId: boolean;
  userId?: string;
  createdAt?: number;
  answerKey?: Record<number, string>;
  /* category weights carried in from the syllabus course registry via the
     'weights.import' intake — e.g. { exam: 50, assignment: 30 }. Display/
     export only; gradestack has no weighting model of its own. */
  weights?: Record<string, number>;
  /* question → topic map, written back by the createTargetedReview command
     so follow-up review work can reuse it next time */
  questionTopics?: Record<number, string>;
}

export interface Scan {
  id: string;
  testId: string;
  studentId: string;
  studentName: string;
  rawScore: number;
  maxScore: number;
  percentage: number;
  grade: string;
  needsReview: boolean;
  responses?: Record<number, string>;
  imageData?: string;
  userId?: string;
  createdAt?: number;
  batchName?: string;
}

interface AppState {
  user: any | null;
  setUser: (user: any | null) => void;
  /* uid that owns the persisted data, or null while working signed-out.
     Guards against uploading one account's records into another's. */
  dataOwnerUid: string | null;
  tests: Test[];
  scans: Scan[];
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  gradingScale: GradingScale;
  setGradingScale: (scale: GradingScale) => void;
  partialCredit: boolean;
  setPartialCredit: (v: boolean) => void;
  geminiKey: string;
  setGeminiKey: (key: string) => void;
  setTests: (tests: Test[]) => void;
  setScans: (scans: Scan[]) => void;
  /* ids pulled in by the last mergeRemote — the ambient watcher skips their
     stir emits so a sign-in sync doesn't spam the feed per-record */
  _mergedIds: Set<string> | null;
  mergeRemote: (tests: Test[], scans: Scan[]) => void;
  addTest: (test: Omit<Test, 'id' | 'date' | 'createdAt' | 'userId'>) => Promise<Test>;
  duplicateTest: (id: string) => Promise<Test | null>;
  deleteTest: (id: string) => Promise<void>;
  addScan: (scan: Omit<Scan, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  deleteScan: (id: string) => Promise<void>;
  deleteScans: (ids: string[]) => Promise<void>;
  updateScan: (id: string, updates: Partial<Scan>) => Promise<void>;
  updateTest: (id: string, updates: Partial<Test>) => Promise<void>;
  regradeAll: () => Promise<void>;
  exportData: () => string;
  importData: (json: string) => number;
  clearAllData: () => Promise<void>;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      setUser: (user) => set({ user }),
      dataOwnerUid: null,
      tests: [],
      scans: [],
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      gradingScale: DEFAULT_SCALE,
      setGradingScale: (gradingScale) => set({ gradingScale }),
      partialCredit: false,
      setPartialCredit: (partialCredit) => set({ partialCredit }),
      geminiKey: '',
      setGeminiKey: (geminiKey) => set({ geminiKey }),
      setTests: (tests) => set({ tests }),
      setScans: (scans) => set({ scans }),
      _mergedIds: null,

      /* Merge server data with anything created locally while signed out,
         then push the local-only items up so nothing is lost on sign-in.
         If the persisted data belongs to a different account, adopt the
         signed-in account's cloud state instead — never upload another
         user's records under a new uid. */
      mergeRemote: (remoteTests, remoteScans) => {
        const state = get();
        const user = auth?.currentUser;

        if (user && state.dataOwnerUid && state.dataOwnerUid !== user.uid) {
          const adopted = remoteTests.length + remoteScans.length;
          set({
            tests: remoteTests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
            scans: remoteScans.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
            dataOwnerUid: user.uid,
            _mergedIds: new Set([...remoteTests, ...remoteScans].map((x) => x.id)),
          });
          if (adopted) stir(`register synced: ${adopted} record${adopted === 1 ? '' : 's'}`, '/apps/gradestack/');
          return;
        }

        const testIds = new Set(remoteTests.map(t => t.id));
        const scanIds = new Set(remoteScans.map(s => s.id));
        const localOnlyTests = state.tests.filter(t => !testIds.has(t.id));
        const localOnlyScans = state.scans.filter(s => !scanIds.has(s.id));

        const tests = [...remoteTests, ...localOnlyTests].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const scans = [...remoteScans, ...localOnlyScans].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        // ids arriving from the cloud — watcher's per-record stirs suppressed
        const incoming = new Set([...remoteTests, ...remoteScans].map((x) => x.id));
        set({ tests, scans, ...(user ? { dataOwnerUid: user.uid } : {}), ...(incoming.size ? { _mergedIds: incoming } : {}) });
        // count only records the merge actually pulls in — a repeat sync of
        // identical remote data isn't a transition worth announcing
        const synced = remoteTests.filter(t => !state.tests.some(l => l.id === t.id)).length
          + remoteScans.filter(x => !state.scans.some(l => l.id === x.id)).length;
        if (synced) stir(`register synced: ${synced} record${synced === 1 ? '' : 's'}`, '/apps/gradestack/');

        if (user) {
          localOnlyTests.forEach(t => {
            setDoc(doc(db, 'tests', t.id), stripUndefined({ ...t, userId: user.uid })).catch(() => {});
          });
          localOnlyScans.forEach(s => {
            setDoc(doc(db, 'scans', s.id), stripUndefined({ ...s, userId: user.uid })).catch(() => {});
          });
        }
      },

      addTest: async (test) => {
        const user = auth?.currentUser;
        const id = uid();
        const newTest: Test = {
          ...test,
          id,
          date: new Date().toISOString(),
          userId: user?.uid,
          createdAt: Date.now()
        };

        set((state) => ({ tests: [newTest, ...state.tests] }));

        if (user && db) {
          try {
            await setDoc(doc(db, 'tests', id), stripUndefined(newTest));
          } catch(e) {
            console.error(e);
          }
        }
        return newTest;
      },

      duplicateTest: async (id) => {
        const source = get().tests.find(t => t.id === id);
        if (!source) return null;
        const { id: _drop, date: _d, createdAt: _c, userId: _u, ...rest } = source;
        return get().addTest({ ...rest, name: `${source.name} (copy)` });
      },

      deleteTest: async (id) => {
        // Cascade: a test's scans go with it — otherwise they orphan forever.
        const orphanIds = get().scans.filter(s => s.testId === id).map(s => s.id);
        const gone = get().tests.find(t => t.id === id);
        set((state) => ({
          tests: state.tests.filter(t => t.id !== id),
          scans: state.scans.filter(s => s.testId !== id),
        }));
        if (gone) {
          stir(`assessment withdrawn: ${gone.name}`, '/apps/gradestack/', gone.courseName || undefined);
        }
        if (auth?.currentUser && db) {
          try {
            await Promise.all([
              deleteDoc(doc(db, 'tests', id)),
              ...orphanIds.map(sid => deleteDoc(doc(db, 'scans', sid))),
            ]);
          } catch(e) {}
        }
      },

      addScan: async (scan) => {
        const user = auth?.currentUser;
        const id = uid();
        const newScan: Scan = {
          ...scan,
          id,
          userId: user?.uid,
          createdAt: Date.now()
        };

        set((state) => ({ scans: [newScan, ...state.scans] }));

        // 'marked: <name> · %' is emitted by the ambient layer in lib/iterra.ts
        // on new-scan detection — no feed write needed here.

        if (user && db) {
          try { await setDoc(doc(db, 'scans', id), stripUndefined(newScan)); } catch(e) {}
        }
      },

      deleteScan: async (id) => {
        const gone = get().scans.find(s => s.id === id);
        set((state) => ({ scans: state.scans.filter(s => s.id !== id) }));
        if (gone) {
          const t = get().tests.find(tt => tt.id === gone.testId);
          stir(`sheet struck: ${gone.studentName}`, '/apps/gradestack/', t?.courseName || undefined);
        }
        if (auth?.currentUser && db) {
          try { await deleteDoc(doc(db, 'scans', id)); } catch(e) {}
        }
      },

      deleteScans: async (ids) => {
        const gone = get().scans.filter(s => ids.includes(s.id));
        set((state) => ({ scans: state.scans.filter(s => !ids.includes(s.id)) }));
        if (gone.length) {
          const testIds = new Set(gone.map(s => s.testId));
          const t = testIds.size === 1 ? get().tests.find(tt => tt.id === gone[0].testId) : undefined;
          stir(`sheets struck: ${gone.length}`, '/apps/gradestack/', t?.courseName || undefined);
        }
        if (auth?.currentUser && db) {
          try {
            await Promise.all(ids.map(id => deleteDoc(doc(db, 'scans', id))));
          } catch(e) {}
        }
      },

      updateScan: async (id, updates) => {
        const before = get().scans.find(s => s.id === id);
        set((state) => ({
          scans: state.scans.map(s => s.id === id ? { ...s, ...updates } : s)
        }));
        // needsReview → cleared is the review-correct signature: emit the
        // re-scored result, not mere edits (name tweaks keep the flag).
        if (before?.needsReview && updates.needsReview === false) {
          const after = get().scans.find(s => s.id === id) ?? { ...before, ...updates };
          const t = get().tests.find(tt => tt.id === before.testId);
          stir(
            `scan reviewed: ${after.studentName}${after.percentage != null ? ` · ${Math.round(after.percentage)}%` : ''}`,
            `/apps/gradestack/?assessment=${before.testId}`,
            t?.courseName || undefined,
          );
        }
        if (auth?.currentUser && db) {
          try { await updateDoc(doc(db, 'scans', id), stripUndefined(updates)); } catch(e) {}
        }
      },

      updateTest: async (id, updates) => {
        const { gradingScale, partialCredit } = get();
        let regradedCount = 0;
        set((state) => {
          const updatedTests = state.tests.map(t => t.id === id ? { ...t, ...updates } : t);

          // If the key changed, re-grade every scan against it.
          let updatedScans = state.scans;
          if (updates.answerKey) {
            updatedScans = state.scans.map(scan => {
              if (scan.testId === id && scan.responses) {
                const result = gradeResponses(scan.responses, updates.answerKey, scan.maxScore, gradingScale, partialCredit);
                regradedCount++;
                return {
                  ...scan,
                  rawScore: result.rawScore,
                  percentage: result.percentage,
                  grade: result.grade,
                  needsReview: result.needsReview,
                };
              }
              return scan;
            });

            if (auth?.currentUser && db) {
              Promise.all(
                updatedScans
                  .filter(s => s.testId === id)
                  .map(s =>
                    updateDoc(doc(db, 'scans', s.id), {
                      rawScore: s.rawScore,
                      percentage: s.percentage,
                      grade: s.grade,
                      needsReview: s.needsReview,
                    }).catch(() => {})
                  )
              );
            }
          }

          return { tests: updatedTests, scans: updatedScans };
        });

        if (updates.answerKey && regradedCount > 0) {
          const t = get().tests.find(tt => tt.id === id);
          stir(
            `key amended: ${t?.name ?? 'a sheet'} → ${regradedCount} sheet${regradedCount === 1 ? '' : 's'} re-graded`,
            `/apps/gradestack/?assessment=${id}`,
            t?.courseName || undefined,
          );
        }

        if (auth?.currentUser && db) {
          try { await updateDoc(doc(db, 'tests', id), stripUndefined(updates)); } catch(e) {}
        }
      },

      /* Re-grade every stored scan — used after the scale or
         partial-credit policy changes. */
      regradeAll: async () => {
        const { gradingScale, partialCredit, tests } = get();
        const keyByTest = new Map(tests.map(t => [t.id, t.answerKey]));
        let regraded = 0;
        set((state) => ({
          scans: state.scans.map(scan => {
            if (!scan.responses) return scan;
            const key = keyByTest.get(scan.testId);
            const result = gradeResponses(scan.responses, key, scan.maxScore, gradingScale, partialCredit);
            regraded++;
            return { ...scan, rawScore: result.rawScore, percentage: result.percentage, grade: result.grade, needsReview: result.needsReview };
          })
        }));
        // scale/policy re-application is a register-wide transition
        if (regraded) stir(`register re-graded: ${regraded} sheet${regraded === 1 ? '' : 's'}`, '/apps/gradestack/');
        if (auth?.currentUser && db) {
          const scans = get().scans;
          Promise.all(scans.map(s =>
            updateDoc(doc(db, 'scans', s.id), {
              rawScore: s.rawScore, percentage: s.percentage, grade: s.grade, needsReview: s.needsReview,
            }).catch(() => {})
          ));
        }
      },

      exportData: () => {
        const { tests, scans, gradingScale, partialCredit, theme } = get();
        return JSON.stringify({
          app: 'gradestack',
          version: 1,
          exportedAt: new Date().toISOString(),
          settings: { gradingScale, partialCredit, theme },
          tests,
          scans: scans.map(s => ({ ...s, imageData: undefined })),
        }, null, 2);
      },

      /* Throws on unparseable or wrong-shaped input so the caller can say
         "not a GradeStack backup" — returning 0 there lied: it read as
         "imported nothing" even for corrupt files. 0 now means only
         "valid file, every record already on the register". */
      importData: (json: string) => {
        const data = JSON.parse(json);
        if (!Array.isArray(data.tests) || !Array.isArray(data.scans)) {
          throw new Error('Not a GradeStack backup — missing tests/scans arrays');
        }
        {
          const state = get();
          const testIds = new Set(state.tests.map(t => t.id));
          const scanIds = new Set(state.scans.map(s => s.id));
          const user = auth?.currentUser;
          const newTests = (data.tests as Test[])
            .filter(t => t && t.id && !testIds.has(t.id))
            .map(t => ({ ...t, userId: user?.uid ?? t.userId }));
          const newScans = (data.scans as Scan[])
            .filter(s => s && s.id && !scanIds.has(s.id))
            .map(s => ({ ...s, userId: user?.uid ?? s.userId }));
          const theme = data.settings?.theme;
          set({
            tests: [...newTests, ...state.tests],
            scans: [...newScans, ...state.scans],
            ...(data.settings?.gradingScale ? { gradingScale: data.settings.gradingScale } : {}),
            ...(typeof data.settings?.partialCredit === 'boolean' ? { partialCredit: data.settings.partialCredit } : {}),
            ...(theme === 'system' || theme === 'light' || theme === 'dark' ? { theme } : {}),
            // imported ids ride the same suppression channel as cloud merges —
            // 'register restored' announces the wave; per-record stirs held
            _mergedIds: new Set([...newTests, ...newScans].map((x) => x.id)),
          });
          const n = newTests.length + newScans.length;
          if (n) stir(`register restored: ${n} record${n === 1 ? '' : 's'}`, '/apps/gradestack/');
          if (user && db) {
            newTests.forEach(t => {
              setDoc(doc(db, 'tests', t.id), stripUndefined(t)).catch(() => {});
            });
            newScans.forEach(s => {
              setDoc(doc(db, 'scans', s.id), stripUndefined(s)).catch(() => {});
            });
          }
          return newTests.length + newScans.length;
        }
      },

      clearAllData: async () => {
        const state = get();
        const user = auth?.currentUser;
        const had = state.tests.length + state.scans.length;

        set({
          tests: [],
          scans: [],
          theme: 'system',
          gradingScale: { ...DEFAULT_SCALE },
          partialCredit: false,
          geminiKey: '',
          dataOwnerUid: user?.uid ?? null,
        });
        if (had) stir(`register struck: ${had} record${had === 1 ? '' : 's'}`, '/apps/gradestack/');

        if (user && db) {
          const deletePromises = [
            ...state.tests.map(t => deleteDoc(doc(db, 'tests', t.id))),
            ...state.scans.map(s => deleteDoc(doc(db, 'scans', s.id)))
          ];
          Promise.all(deletePromises).catch(e => console.error("Error clearing data from Firebase", e));
        }
      }
    }),
    {
      name: 'gradestack-storage',
      partialize: (state) => ({
        tests: state.tests,
        scans: state.scans,
        theme: state.theme,
        gradingScale: state.gradingScale,
        partialCredit: state.partialCredit,
        geminiKey: state.geminiKey,
        dataOwnerUid: state.dataOwnerUid,
      }),
    }
  )
);

/* Downscale a captured sheet image before it is stored — full-res
   photos would blow through the localStorage quota fast. */
export function shrinkImage(dataUrl: string, maxDim = 1100, quality = 0.72): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      if (scale >= 1 && dataUrl.length < 400_000) return resolve(dataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/* the command layer (integration/commands.ts) writes gradestack-storage
   through localStorage and syncs the mounted store through this global —
   without it a command write is invisible to the live gradebook and the
   next mutation rewrites the file from stale state. */
if (typeof window !== 'undefined') {
  (window as any).__gradestackStore = useStore;
}
