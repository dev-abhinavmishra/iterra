// ── Backup / restore ─────────────────────────────────────────────────────────
// Every problem and attempt exports and restores — an acceptance criterion.
// The file is plain JSON, versioned, and human-auditable.

import type { WorkbenchData } from './types';

export const BACKUP_KIND = 'proof-workbench';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  data: WorkbenchData;
}

export function exportWorkbench(data: WorkbenchData): string {
  const file: BackupFile = {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
  return JSON.stringify(file, null, 2);
}

export function parseWorkbenchBackup(text: string): WorkbenchData {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON');
  }
  const f = obj as Partial<BackupFile>;
  if (f?.kind !== BACKUP_KIND) throw new Error('Not a Proof backup file');
  if (typeof f.version !== 'number' || f.version > BACKUP_VERSION)
    throw new Error(`Backup version ${f.version} is newer than this app understands`);
  const d = f.data as WorkbenchData;
  if (!d || typeof d !== 'object') throw new Error('Backup has no data');
  return {
    problems: d.problems ?? {},
    attempts: d.attempts ?? {},
    errors: d.errors ?? {},
    sessions: d.sessions ?? {},
    reviews: d.reviews ?? {},
    rubrics: d.rubrics ?? {},
    courses: d.courses ?? {},
    settings: d.settings,
  };
}

// ── problem-set export: just problems, for sharing ──
export const SET_KIND = 'proof-problem-set';

export function exportProblemSet(problems: WorkbenchData['problems'], rubrics: WorkbenchData['rubrics']): string {
  return JSON.stringify({ kind: SET_KIND, version: 1, problems, rubrics }, null, 2);
}

export function parseProblemSet(text: string): { problems: WorkbenchData['problems']; rubrics: WorkbenchData['rubrics'] } {
  const f = JSON.parse(text) as { kind?: string; problems?: WorkbenchData['problems']; rubrics?: WorkbenchData['rubrics'] };
  if (f?.kind !== SET_KIND) throw new Error('Not a Proof problem set');
  return { problems: f.problems ?? {}, rubrics: f.rubrics ?? {} };
}
