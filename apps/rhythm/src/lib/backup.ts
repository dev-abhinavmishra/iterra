// ── Backup & restore ─────────────────────────────────────────────────────────
// One document carries the whole register. Restore validates the envelope and
// each collection shallowly; unknown fields pass through (forward-compatible),
// missing collections become empty.

import type { RegisterBackup, RegisterData } from './types';
import { BACKUP_VERSION } from './types';

export function exportRegister(data: RegisterData): string {
  const backup: RegisterBackup = {
    app: 'rhythm',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
  return JSON.stringify(backup, null, 2);
}

const COLLECTIONS = [
  'routines',
  'entries',
  'events',
  'mappings',
  'exceptions',
  'friction',
  'reviews',
  'experiments',
  'courses',
] as const;

export function parseRegisterBackup(text: string):
  | { ok: true; data: RegisterData }
  | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not valid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, error: 'not a backup object' };
  const o = parsed as Record<string, unknown>;
  if (o.app !== 'rhythm') return { ok: false, error: 'not a Rhythm backup (app ≠ "rhythm")' };
  if (typeof o.version !== 'number' || o.version > BACKUP_VERSION) {
    return { ok: false, error: `backup version ${String(o.version)} is newer than this app understands` };
  }
  const data = o.data;
  if (typeof data !== 'object' || data === null) return { ok: false, error: 'backup has no data' };

  const d = data as Record<string, unknown>;
  if (typeof d.settings !== 'object' || d.settings === null) {
    return { ok: false, error: 'backup is missing settings' };
  }
  const out = { settings: d.settings } as unknown as RegisterData;
  for (const c of COLLECTIONS) {
    const v = d[c];
    (out as unknown as Record<string, unknown>)[c] =
      typeof v === 'object' && v !== null && !Array.isArray(v) ? v : {};
  }
  return { ok: true, data: out };
}
