import { useEffect, useMemo, useRef, useState } from 'react';
import { Moon, Sun, ChevronRight, Download, Upload, Sparkles, Eraser, HardDrive, Inbox, AlertTriangle, Trash2 } from 'lucide-react';
import { PLACES } from '../places';
import { AtlasMasthead } from '../mosaic/AtlasMasthead';
import { Button, Dialog, SectionHeader } from '../ui/primitives';
import { formatRelativeTime } from '../ui/ObjectRow';
import { useWorkspaceTheme } from '../ui/theme';
import { ACCENTS, type Accent } from '../ui/accent';
import { WorkspaceAccount } from './WorkspaceAccount';
import { hasToolSettings, ToolSettings } from './toolSettings';
import { DataCoverage } from './DataCoverage';
import type { DataStatus } from './dataStatus';
import {
  collectBackup,
  downloadBackup,
  parseBackup,
  restoreBackup,
  summarizeBackup,
  wipeAll,
  type IterraBackup,
} from '../integration/backup';
import { demoRowCount, isDemoLoaded, removeDemoData, seedDemoSemester } from '../integration/demo';

/* Central settings — the one doorway for terrain preferences and every
   tool's settings. Per-app settings chrome is hidden while integrated;
   tool rows stay inside this surface and mount only the selected tool's
   settings panel, so nothing is duplicated across eight apps. */

const SETTINGS_NOTE: Record<string, string> = {
  timer: 'Session defaults, sound, motion',
  ink: 'Editor layout and autosave',
  rhythm: 'Routines and weekly schedule',
  proof: 'Practice time, review schedule, and animation',
  syllabus: 'Study hours, session length, and semester dates',
  gradestack: 'Answer keys, rubrics, and class lists',
  margin: 'Titles, format, editor size, transcription',
  flashcards: 'Keyboard shortcuts',
};

export function SettingsSurface({ onGo, query = '', dataStatus, accent, onAccentChange }: {
  onGo: (url: string) => void;
  query?: string;
  dataStatus: DataStatus;
  accent: Accent;
  onAccentChange: (accent: Accent) => void;
}) {
  const [theme, setTheme] = useWorkspaceTheme();
  const dark = theme === 'graphite';
  const selectedTool = useMemo(() => {
    const tool = new URLSearchParams(query).get('tool');
    return hasToolSettings(tool) ? tool : null;
  }, [query]);

  return (
    <div className="mx-auto max-w-[720px] px-6 py-8">
      <AtlasMasthead
        compact
        object="none"
        eyebrow="the Cellar"
        title="Settings"
        sub="Make Iterra feel like yours, manage your backups, or adjust settings for a tool."
      />
      <div className="mt-6" />

      {/* Terrain */}
      <section className="pt-6">
        <SectionHeader title="Appearance" />
        <button
          type="button"
          onClick={() => setTheme()}
          role="switch"
          aria-checked={dark}
          aria-label="Dark theme"
          className="flex w-full items-center justify-between gap-4 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-4 py-3 text-left hover:border-[var(--color-accent)] cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[5px] bg-[var(--color-sheet-2)] text-[var(--color-mute)]">
              {dark ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </div>
            <div>
              <div className="text-[13.5px] font-semibold text-[var(--color-ink)]">
                {dark ? 'Graphite theme' : 'Paper theme'}
              </div>
              <div className="text-[12px] text-[var(--color-mute)]">
                Switch between light and dark across Iterra.
              </div>
            </div>
          </div>
          <span
            aria-hidden="true"
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
              dark ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-line)]'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--color-sheet)] shadow transition-transform ${
                dark ? 'translate-x-[18px] left-0' : 'left-0.5'
              }`}
            />
          </span>
        </button>
        <fieldset className="mt-3 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-4 pb-4">
          <legend className="px-1 text-[13px] font-semibold text-[var(--color-ink)]">Accent color</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ACCENTS.map(({ id, label, swatch }) => (
              <label key={id} className="flex cursor-pointer items-center gap-2 rounded border border-[var(--color-line)] px-2.5 py-2 text-[13px] text-[var(--color-ink)]">
                <input
                  type="radio"
                  name="workspace-accent"
                  value={id}
                  checked={accent === id}
                  onChange={() => onAccentChange(id)}
                  className="accent-[var(--color-accent)]"
                />
                <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: swatch }} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <BackupSection dataStatus={dataStatus} />

      {/* Sample semester */}
      <DemoSection />

      {/* Integration health */}
      <DiagnosticsSection />

      {/* Start over */}
      <ResetSection />

      {/* Tools */}
      <section className="pt-6">
        <SectionHeader title="Tool settings" />
        {selectedTool ? (
          <ToolSettings tool={selectedTool} onBack={() => onGo('#/settings')} />
        ) : (
          <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
            {/* only tools that actually own a settings view — Boxed has none,
                so it stays out of this list rather than opening the app */}
            {PLACES.filter((p) => hasToolSettings(p.id)).map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onGo(`#/settings?tool=${p.id}`)}
                className={`group flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--color-sheet-hover)] cursor-pointer ${
                  i > 0 ? 'border-t border-[var(--color-line)]' : ''
                }`}
              >
                <span className="h-4 w-4 shrink-0 text-[var(--color-accent)] [&>svg]:h-full [&>svg]:w-full">
                  {p.glyph}
                </span>
                <span className="w-24 shrink-0 text-[13px] font-medium text-[var(--color-ink)]">
                  {p.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-mute)]">
                  {SETTINGS_NOTE[p.id] || p.shortDesc}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-faint)] group-hover:text-[var(--color-accent)] transition-colors" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Getting started */}
      <section className="pt-6">
        <SectionHeader title="Learn" />
        <button
          type="button"
          onClick={() => onGo('#/c/unfiled')}
          className="flex w-full items-center justify-between gap-4 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-4 py-3 text-left hover:border-[var(--color-accent)] cursor-pointer"
        >
          <div>
            <div className="text-[13.5px] font-semibold text-[var(--color-ink)]">
              Getting Started
            </div>
            <div className="text-[12px] text-[var(--color-mute)]">
              Quick guides to help you get started with each tool.
            </div>
          </div>
          <span className="text-[12px] font-medium text-[var(--color-accent)]">Open →</span>
        </button>
      </section>
    </div>
  );
}

/* Restore replaces local data, so it confirms first and reloads to
   rehydrate the stores from the restored browser storage. */
function BackupSection({ dataStatus }: { dataStatus: DataStatus }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<IterraBackup | null>(null);
  const [restoring, setRestoring] = useState(false);

  const onDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      downloadBackup(await collectBackup());
    } catch {
      setError('Backup failed — storage may be unavailable in this browser.');
    } finally {
      setBusy(false);
    }
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setPending(parseBackup(await file.text()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  const onRestore = async () => {
    if (!pending) return;
    if (readSyncEnabled()) {
      setPending(null);
      setError('Turn off shared record sync before restoring a backup.');
      return;
    }
    setRestoring(true);
    try {
      await restoreBackup(pending);
      window.location.reload();
    } catch {
      setRestoring(false);
      setPending(null);
      setError('Restore failed partway — download a backup of what is here now before retrying.');
    }
  };

  const summary = pending ? summarizeBackup(pending) : null;

  return (
    <section className="pt-6">
      <SectionHeader title="Data & sync" />
      <div className="mb-3 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-4 py-3">
        <div role="status" className="mb-3">
          <p className={`text-[13px] font-semibold ${
            dataStatus.tone === 'warn' ? 'text-[var(--color-warn)]' : 'text-[var(--color-ink)]'
          }`}>
            {dataStatus.label}
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-mute)]">{dataStatus.detail}</p>
        </div>
        <DataCoverage />
      </div>
      <WorkspaceAccount />
      <SyncConsentControl />
      <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--color-sheet-hover)] cursor-pointer disabled:opacity-50"
        >
          <Download className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-[var(--color-ink)]">
              {busy ? 'Gathering data…' : 'Download backup'}
            </span>
            <span className="block text-[12px] text-[var(--color-mute)]">
              Export a copy of the data stored in this browser.
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center gap-3 border-t border-[var(--color-line)] px-4 py-2.5 text-left hover:bg-[var(--color-sheet-hover)] cursor-pointer"
        >
          <Upload className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-[var(--color-ink)]">
              Restore from file
            </span>
            <span className="block text-[12px] text-[var(--color-mute)]">
              Replaces everything currently stored in this browser.
            </span>
          </span>
        </button>
        <StorageRow />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          void onPick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error && <p role="alert" className="mt-2 text-[12px] text-[var(--color-bad)]">{error}</p>}

      <Dialog
        open={!!pending}
        onClose={() => !restoring && setPending(null)}
        title="Restore this backup?"
        descriptionId="restore-backup-warning"
        subtitle={
          summary
            ? `${new Date(summary.at).toLocaleString()} — ${summary.records} records across ${summary.dbs} databases, ${summary.lsKeys} settings keys`
            : undefined
        }
      >
        <p id="restore-backup-warning" className="text-[12.5px] leading-relaxed text-[var(--color-mute)]">
          Everything currently stored in this browser will be replaced by the
          backup's contents. This can't be undone — download a fresh backup
          first if there's anything recent you want to keep.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setPending(null)} disabled={restoring}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onRestore} disabled={restoring}>
            {restoring ? 'Restoring…' : 'Replace everything'}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

const SYNC_ENABLED_KEY = 'iterra.v1.sync.enabled';

function readSyncEnabled(): boolean {
  try {
    const status = window.iterra?.sync?.status?.();
    return typeof status?.enabled === 'boolean'
      ? status.enabled
      : window.localStorage.getItem(SYNC_ENABLED_KEY) === '1';
  } catch { return false; }
}

function SyncConsentControl() {
  const [enabled, setEnabled] = useState(readSyncEnabled);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setEnabled(readSyncEnabled());
    const timer = window.setInterval(refresh, 1500);
    window.addEventListener('iterra:sync-consent-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('iterra:sync-consent-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const change = (next: boolean) => {
    setError(null);
    try {
      const result = window.iterra?.sync?.setEnabled?.(next);
      if (!result?.ok) {
        setError(result?.error || 'Sync preference could not be saved in this browser.');
        return false;
      }
      setEnabled(next);
      return true;
    } catch {
      setError('Sync preference could not be saved in this browser.');
      return false;
    }
  };

  return (
    <div className="mb-3 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[13px] font-semibold text-[var(--color-ink)]">Shared record sync</p>
          <p className="mt-1 text-[12px] text-[var(--color-mute)]">
            {enabled ? 'Enabled for this browser identity.' : 'Off by default. Your records stay in this browser.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Sync shared records"
          onClick={() => enabled ? change(false) : setConfirm(true)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${enabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-line)]'}`}
        >
          <span className={`h-5 w-5 rounded-full bg-[var(--color-sheet)] shadow transition-transform ${enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-[12px] text-[var(--color-bad)]">{error}</p>}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Enable shared record sync?"
        descriptionId="sync-consent-description"
      >
        <div id="sync-consent-description" className="space-y-2 text-[12.5px] leading-relaxed text-[var(--color-mute)]">
          <p>Enabling sync may upload existing canonical shared records from this browser and future changes. These records can include titles, course links, and study metadata.</p>
          <p>Private tool databases, including full Margin notes and flashcard contents, stay in this browser. Sync uses your current workspace identity. To use shared records on another device, link an email in Workspace account.</p>
          <p>Turning sync off stops future transfers. It does not remove copies already stored remotely.</p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setConfirm(false)}>Keep off</Button>
          <Button variant="primary" onClick={() => { if (change(true)) setConfirm(false); }}>Enable sync</Button>
        </div>
      </Dialog>
    </div>
  );
}

/* Cross-tool traffic is invisible by design — a routine check goes through
   the same queue as a big import, so a stuck lane reads as nothing at all.
   This surfaces the two honest diagnostics: deliveries still waiting on
   their tool, and writes the hub quarantined as malformed. */
function DiagnosticsSection() {
  const [diag, setDiag] = useState<{ pending: number; quarantined: number; stuck: number } | null>(null);
  const [journal, setJournal] = useState<{ type: string; app: string; at: number; text?: string }[]>([]);
  const [journalOpen, setJournalOpen] = useState(false);

  useEffect(() => {
    let live = true;
    const read = async () => {
      let pending = 0;
      let stuck = 0;
      let quarantined = 0;
      try {
        const ls = JSON.parse(localStorage.getItem('iterra.v1.store.intakes') || '{}');
        const rows = Object.values(ls).filter((r: any) => !r?.delivered);
        pending += rows.length;
        stuck += rows.filter((r: any) => (r?.attempts || 0) >= 3).length;
      } catch { /* ignore */ }
      try {
        const q = JSON.parse(localStorage.getItem('iterra.v1.quarantine') || '[]');
        quarantined += Array.isArray(q) ? q.length : 0;
      } catch { /* ignore */ }
      /* the hub's IDB lane — count undelivered intake rows without
         creating the database (open() would make an empty one) */
      try {
        const names = (await indexedDB.databases?.())?.map((d) => d.name) ?? [];
        if (names.includes('iterra')) {
          const idbRows = await new Promise<{ pending: number; stuck: number }>((res) => {
            const req = indexedDB.open('iterra');
            req.onsuccess = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains('intakes')) { db.close(); res({ pending: 0, stuck: 0 }); return; }
              const r = db.transaction('intakes', 'readonly').objectStore('intakes').getAll();
              r.onsuccess = () => {
                db.close();
                const rows = (r.result as any[]).filter((x) => !x?.delivered);
                res({ pending: rows.length, stuck: rows.filter((x) => (x?.attempts || 0) >= 3).length });
              };
              r.onerror = () => { db.close(); res({ pending: 0, stuck: 0 }); };
            };
            req.onerror = () => res({ pending: 0, stuck: 0 });
          });
          pending += idbRows.pending;
          stuck += idbRows.stuck;
        }
      } catch { /* IDB optional */ }
      if (live) setDiag({ pending, quarantined, stuck });
    };
    void read();
    const t = window.setInterval(read, 8000);
    return () => { live = false; window.clearInterval(t); };
  }, []);

  /* the typed event journal — distinct from stirs (which are human-authored
     feed lines). Every intake resolution, lifecycle transition and entity
     mutation lands here; surfacing it turns "did that send land?" into a
     glance instead of a DevTools session. */
  useEffect(() => {
    let live = true;
    const read = async () => {
      try {
        const rows = await (window as any).iterra?.events?.list?.({ limit: 24 });
        if (!live || !Array.isArray(rows)) return;
        setJournal(
          rows
            .filter((r: any) => r && r.type && r.at)
            .map((r: any) => ({
              type: String(r.type),
              app: String(r.app || r.payload?.app || '?'),
              at: r.at,
              text:
                typeof r.payload?.title === 'string' ? r.payload.title
                : typeof r.payload?.text === 'string' ? r.payload.text
                : typeof r.payload?.toast === 'string' ? r.payload.toast
                : typeof r.payload?.to === 'string' ? `→ ${r.payload.to} · ${r.payload.action ?? ''}`
                : undefined,
            })),
        );
      } catch { /* journal optional */ }
    };
    void read();
    const t = window.setInterval(read, 12000);
    const off = (window as any).iterra?.events?.on?.('*', read);
    return () => { live = false; window.clearInterval(t); try { off?.(); } catch { /* */ } };
  }, []);

  const hasIssues = diag && (diag.pending > 0 || diag.quarantined > 0 || diag.stuck > 0);
  if (!hasIssues && journal.length === 0) return null;

  return (
    <section className="pt-6">
      <SectionHeader title="Diagnostics" />
      {hasIssues && (
      <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
        {diag.pending > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5">
            <Inbox className="h-4 w-4 shrink-0 text-[var(--color-warn)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-[var(--color-ink)]">
                {diag.pending} deliver{diag.pending === 1 ? 'y' : 'ies'} waiting
              </span>
              <span className="block truncate text-[12px] text-[var(--color-mute)]">
                These items will arrive when you open the tool you sent them to.
              </span>
            </span>
          </div>
        )}
        {/* a stuck delivery has failed >=3 times — the badge rail says the
            same thing; settings is where the detail belongs */}
        {diag.stuck > 0 && (
          <div className={`flex items-center gap-3 px-4 py-2.5 ${diag.pending > 0 ? 'border-t border-[var(--color-line)]' : ''}`}>
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--color-bad)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-[var(--color-ink)]">
                {diag.stuck} deliver{diag.stuck === 1 ? 'y is' : 'ies are'} stuck retrying
              </span>
              <span className="block truncate text-[12px] text-[var(--color-mute)]">
                Open the destination tool to check whether the item is still there, then try sending it again.
              </span>
            </span>
          </div>
        )}
        {diag.quarantined > 0 && (
          <div className={`flex items-center gap-3 px-4 py-2.5 ${diag.pending > 0 ? 'border-t border-[var(--color-line)]' : ''}`}>
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--color-bad)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-[var(--color-ink)]">
                {diag.quarantined} record{diag.quarantined === 1 ? '' : 's'} could not be saved
              </span>
              <span className="block truncate text-[12px] text-[var(--color-mute)]">
                Iterra set these records aside because it couldn’t read them. Download a backup to keep a copy.
              </span>
            </span>
          </div>
        )}
      </div>
      )}
      {journal.length > 0 && (
        <div className={`overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] ${hasIssues ? 'mt-2.5' : ''}`}>
          <button
            type="button"
            onClick={() => setJournalOpen((x) => !x)}
            aria-expanded={journalOpen}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--color-sheet-hover)] cursor-pointer"
          >
            <ChevronRight className={`h-4 w-4 shrink-0 text-[var(--color-faint)] transition-transform ${journalOpen ? 'rotate-90' : ''}`} />
            <span className="min-w-0 flex-1 text-[13px] font-medium text-[var(--color-ink)]">
              Journal — {journal.length} recent event{journal.length === 1 ? '' : 's'}
            </span>
          </button>
          {journalOpen && (
            <div className="border-t border-[var(--color-line)]">
              {journal.map((r, i) => (
                <div key={`${r.at}:${i}`} className="flex items-baseline gap-3 px-4 py-1.5 text-[12px]">
                  <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--color-accent)] truncate">{r.app}</span>
                  <span className="shrink-0 font-mono text-[10px] text-[var(--color-faint)]">{r.type}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--color-mute)]">{r.text || '—'}</span>
                  <span className="shrink-0 font-mono text-[10px] text-[var(--color-faint)]">{formatRelativeTime(r.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* Local-first means the browser owns durability — this row reports whether
   storage is pinned against automatic eviction (we request it at boot via
   navigator.storage.persist) and how much of the quota the terrain uses. */
function StorageRow() {
  const [info, setInfo] = useState<{ persisted: boolean; usage?: number; quota?: number } | null>(null);

  useEffect(() => {
    let live = true;
    const s = navigator.storage;
    if (typeof s?.persisted !== 'function') return;
    void Promise.all([s.persisted(), typeof s.estimate === 'function' ? s.estimate() : Promise.resolve(undefined)])
      .then(([persisted, est]) => {
        if (live) setInfo({ persisted, usage: est?.usage, quota: est?.quota });
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  /* when space runs out the useful question is 'which tool is heavy' —
     weigh each localStorage key and name the top three. Hook stays above
     the !info early return so the order never shifts. */
  const nearFull =
    info?.usage != null && info?.quota != null && info.quota > 0 && info.usage / info.quota > 0.8;
  const heaviest = useMemo(() => {
    if (!nearFull) return [] as { key: string; bytes: number }[];
    const rows: { key: string; bytes: number }[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        rows.push({ key: k, bytes: (localStorage.getItem(k) || '').length * 2 });
      }
    } catch { /* unreadable — skip the breakdown */ }
    return rows.sort((a, b) => b.bytes - a.bytes).slice(0, 3);
  }, [nearFull]);

  if (!info) return null;
  const fmt = (b?: number) =>
    b == null ? '' : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;
  const size = info.usage != null
    ? ` · ${fmt(info.usage)} used${info.quota ? ` of ~${fmt(info.quota)}` : ''}`
    : '';

  return (
    <div className="flex w-full items-center gap-3 border-t border-[var(--color-line)] px-4 py-2.5">
      <HardDrive className={`h-4 w-4 shrink-0 ${nearFull ? 'text-amber-600' : 'text-[var(--color-mute)]'}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-[var(--color-ink)]">
          {nearFull ? 'Storage nearly full' : info.persisted ? 'Browser storage is protected' : 'Browser storage may be cleared'}
        </span>
        <span className="block truncate text-[12px] text-[var(--color-mute)]">
          {nearFull
            ? `Export a backup, then clear space — writes may start failing${size}.`
            : info.persisted
              ? `This browser won't clear your data automatically${size}.`
              : `The browser may clear data under storage pressure — keep backups${size}.`}
        </span>
        {heaviest.length > 0 && (
          <span className="block truncate text-[11px] text-[var(--color-faint)]">
            Largest: {heaviest.map((r) => `${r.key.split('.')[0]} ${fmt(r.bytes)}`).join(' · ')}
          </span>
        )}
      </span>
    </div>
  );
}

/* The escape hatch a local-first app owes its users — wipe every store and
   database the terrain owns. Confirm dialog offers a backup download before
   the point of no return; the terrain reloads into a clean boot after. */
function ResetSection() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backing, setBacking] = useState(false);

  const backupFirst = async () => {
    setBacking(true);
    try {
      downloadBackup(await collectBackup());
    } finally {
      setBacking(false);
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      await wipeAll();
      window.location.reload();
    } catch {
      setBusy(false);
    }
  };

  return (
    <section className="pt-6">
      <SectionHeader title="Start over" />
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex w-full items-center gap-3 rounded-[6px] border border-[var(--color-bad)]/30 bg-[var(--color-sheet)] px-4 py-2.5 text-left hover:bg-[var(--color-sheet-hover)] cursor-pointer"
      >
        <Trash2 className="h-4 w-4 shrink-0 text-[var(--color-bad)]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-[var(--color-ink)]">
            Erase all workspace data
          </span>
          <span className="block truncate text-[12px] text-[var(--color-mute)]">
            Deletes all Iterra data stored in this browser.
          </span>
        </span>
      </button>

      <Dialog
        open={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Erase everything?"
      >
        <p className="text-[12.5px] leading-relaxed text-[var(--color-mute)]">
          Every note, deck, problem, session, routine, grade and course stored
          in this browser is permanently deleted. This can't be undone —
          download a backup first unless you're sure.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button>
          <Button onClick={backupFirst} disabled={busy || backing}>
            {backing ? 'Gathering…' : 'Download backup first'}
          </Button>
          <Button variant="danger" onClick={run} disabled={busy}>
            {busy ? 'Erasing…' : 'Erase everything'}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

/* A sample semester is how the terrain shows what it does before a student
   has real work behind it — three courses, commitments, planned blocks,
   decks, sessions — all through the same stores the tools write. Everything
   it adds is demo-marked and removable in one pass; both directions reload
   so mounted tools rehydrate from the new state rather than overwrite it. */
function DemoSection() {
  const [loaded] = useState(isDemoLoaded);
  const [rows, setRows] = useState(0);
  const [confirming, setConfirming] = useState<'seed' | 'remove' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void demoRowCount().then((n) => { if (live) setRows(n); });
    return () => { live = false; };
  }, [loaded]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = confirming === 'seed' ? await seedDemoSemester() : await removeDemoData();
      if (!res.ok) throw new Error((res as { error?: string }).error ?? 'failed');
      window.location.reload();
    } catch {
      setBusy(false);
      setConfirming(null);
      setError(confirming === 'seed'
        ? 'The sample semester did not finish loading — try again.'
        : 'Cleanup did not finish — remaining sample rows are marked “demo” and can be removed again.');
    }
  };

  return (
    <section className="pt-6">
      <SectionHeader title="Sample semester" />
      <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
        {!loaded ? (
          <button
            type="button"
            onClick={() => setConfirming('seed')}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--color-sheet-hover)] cursor-pointer"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-[var(--color-ink)]">
                Load a sample semester
              </span>
              <span className="block truncate text-[12px] text-[var(--color-mute)]">
                Try Iterra with three sample courses, assignments, decks, and focus sessions.
              </span>
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming('remove')}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--color-sheet-hover)] cursor-pointer"
          >
            <Eraser className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-[var(--color-ink)]">
                Remove sample data
              </span>
              <span className="block truncate text-[12px] text-[var(--color-mute)]">
                {rows > 0
                  ? `${rows} sample records loaded — removes every one, keeps everything you made.`
                  : 'Removes every sample record, keeps everything you made.'}
              </span>
            </span>
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-[12px] text-[var(--color-bad)]">{error}</p>}

      <Dialog
        open={confirming === 'seed'}
        onClose={() => !busy && setConfirming(null)}
        title="Load a sample semester?"
      >
        <p className="text-[12.5px] leading-relaxed text-[var(--color-mute)]">
          The sample adds courses, assignments, study blocks, flashcards, and
          focus sessions alongside your work. You can remove it here anytime.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setConfirming(null)} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={run} disabled={busy}>
            {busy ? 'Loading…' : 'Load sample'}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirming === 'remove'}
        onClose={() => !busy && setConfirming(null)}
        title="Remove the sample semester?"
      >
        <p className="text-[12.5px] leading-relaxed text-[var(--color-mute)]">
          Every demo-marked record is deleted — including the notes and
          problems the sample queued into Ink, Margin and Proof. Anything you
          created or edited yourself is untouched.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setConfirming(null)} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={run} disabled={busy}>
            {busy ? 'Removing…' : 'Remove sample data'}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
