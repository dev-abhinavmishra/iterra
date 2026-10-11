import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db, auth } from './lib/firebase';
import { collection, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { gradeResponses, letterFor, GradingScale, DEFAULT_SCALE } from './lib/grading';

/* Firestore rejects any document containing undefined field values —
   strip them before every write. */
const stripUndefined = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

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

      /* Merge server data with anything created locally while signed out,
         then push the local-only items up so nothing is lost on sign-in.
         If the persisted data belongs to a different account, adopt the
         signed-in account's cloud state instead — never upload another
         user's records under a new uid. */
      mergeRemote: (remoteTests, remoteScans) => {
        const state = get();
        const user = auth?.currentUser;

        if (user && state.dataOwnerUid && state.dataOwnerUid !== user.uid) {
          set({
            tests: remoteTests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
            scans: remoteScans.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
            dataOwnerUid: user.uid,
          });
          return;
        }

        const testIds = new Set(remoteTests.map(t => t.id));
        const scanIds = new Set(remoteScans.map(s => s.id));
        const localOnlyTests = state.tests.filter(t => !testIds.has(t.id));
        const localOnlyScans = state.scans.filter(s => !scanIds.has(s.id));

        const tests = [...remoteTests, ...localOnlyTests].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const scans = [...remoteScans, ...localOnlyScans].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        set({ tests, scans, ...(user ? { dataOwnerUid: user.uid } : {}) });

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
        const id = crypto.randomUUID();
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
        set((state) => ({
          tests: state.tests.filter(t => t.id !== id),
          scans: state.scans.filter(s => s.testId !== id),
        }));
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
        const id = crypto.randomUUID();
        const newScan: Scan = {
          ...scan,
          id,
          userId: user?.uid,
          createdAt: Date.now()
        };

        set((state) => ({ scans: [newScan, ...state.scans] }));

        if (user && db) {
          try { await setDoc(doc(db, 'scans', id), stripUndefined(newScan)); } catch(e) {}
        }
      },

      deleteScan: async (id) => {
        set((state) => ({ scans: state.scans.filter(s => s.id !== id) }));
        if (auth?.currentUser && db) {
          try { await deleteDoc(doc(db, 'scans', id)); } catch(e) {}
        }
      },

      deleteScans: async (ids) => {
        set((state) => ({ scans: state.scans.filter(s => !ids.includes(s.id)) }));
        if (auth?.currentUser && db) {
          try {
            await Promise.all(ids.map(id => deleteDoc(doc(db, 'scans', id))));
          } catch(e) {}
        }
      },

      updateScan: async (id, updates) => {
        set((state) => ({
          scans: state.scans.map(s => s.id === id ? { ...s, ...updates } : s)
        }));
        if (auth?.currentUser && db) {
          try { await updateDoc(doc(db, 'scans', id), stripUndefined(updates)); } catch(e) {}
        }
      },

      updateTest: async (id, updates) => {
        const { gradingScale, partialCredit } = get();
        set((state) => {
          const updatedTests = state.tests.map(t => t.id === id ? { ...t, ...updates } : t);

          // If the key changed, re-grade every scan against it.
          let updatedScans = state.scans;
          if (updates.answerKey) {
            updatedScans = state.scans.map(scan => {
              if (scan.testId === id && scan.responses) {
                const result = gradeResponses(scan.responses, updates.answerKey, scan.maxScore, gradingScale, partialCredit);
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

        if (auth?.currentUser && db) {
          try { await updateDoc(doc(db, 'tests', id), stripUndefined(updates)); } catch(e) {}
        }
      },

      /* Re-grade every stored scan — used after the scale or
         partial-credit policy changes. */
      regradeAll: async () => {
        const { gradingScale, partialCredit, tests } = get();
        const keyByTest = new Map(tests.map(t => [t.id, t.answerKey]));
        set((state) => ({
          scans: state.scans.map(scan => {
            if (!scan.responses) return scan;
            const key = keyByTest.get(scan.testId);
            const result = gradeResponses(scan.responses, key, scan.maxScore, gradingScale, partialCredit);
            return { ...scan, rawScore: result.rawScore, percentage: result.percentage, grade: result.grade, needsReview: result.needsReview };
          })
        }));
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

      importData: (json: string) => {
        try {
          const data = JSON.parse(json);
          if (!Array.isArray(data.tests) || !Array.isArray(data.scans)) return 0;
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
          });
          if (user && db) {
            newTests.forEach(t => {
              setDoc(doc(db, 'tests', t.id), stripUndefined(t)).catch(() => {});
            });
            newScans.forEach(s => {
              setDoc(doc(db, 'scans', s.id), stripUndefined(s)).catch(() => {});
            });
          }
          return newTests.length + newScans.length;
        } catch {
          return 0;
        }
      },

      clearAllData: async () => {
        const state = get();
        const user = auth?.currentUser;

        set({
          tests: [],
          scans: [],
          theme: 'system',
          gradingScale: { ...DEFAULT_SCALE },
          partialCredit: false,
          geminiKey: '',
          dataOwnerUid: user?.uid ?? null,
        });

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
