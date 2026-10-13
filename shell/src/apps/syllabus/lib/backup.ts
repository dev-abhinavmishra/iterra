// ── Folio backup / restore ───────────────────────────────────────────────────
// The whole registrar folio serializes to one JSON document. Restore is
// replace-all (validated first) so an exported file fully reproduces state.

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type FolioBackup,
  type FolioData,
} from './types';

export function exportFolio(data: FolioData): string {
  const backup: FolioBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
  return JSON.stringify(backup, null, 2);
}

export class BackupError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate and normalize an imported backup. Throws BackupError on bad shape. */
export function parseFolioBackup(text: string): FolioData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('That file is not valid JSON.');
  }
  if (!isRecord(parsed)) throw new BackupError('Not a Syllabus backup file.');
  if (parsed.format !== BACKUP_FORMAT)
    throw new BackupError('Not a Syllabus backup — expected format "syllabus-folio".');
  if (typeof parsed.version !== 'number' || parsed.version > BACKUP_VERSION)
    throw new BackupError(`Backup version ${String(parsed.version)} is newer than this app understands.`);
  const d = parsed.data;
  if (!isRecord(d)) throw new BackupError('Backup is missing its data section.');
  for (const key of ['terms', 'courses', 'commitments', 'blocks', 'links', 'reviews'] as const) {
    if (d[key] !== undefined && !isRecord(d[key]))
      throw new BackupError(`Backup section "${key}" is corrupt.`);
  }
  const data = d as unknown as FolioData;
  return {
    terms: data.terms ?? {},
    activeTermId: data.activeTermId,
    courses: data.courses ?? {},
    commitments: data.commitments ?? {},
    blocks: data.blocks ?? {},
    links: data.links ?? {},
    reviews: data.reviews ?? {},
    settings: data.settings,
    dismissed: data.dismissed ?? {},
  };
}
