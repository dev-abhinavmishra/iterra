import { useEffect, useRef, useState } from 'react';
import { Moon, Settings2, Sun, ChevronRight, Download, Upload, Sparkles, Eraser, HardDrive, Inbox, AlertTriangle, Trash2 } from 'lucide-react';
import { PLACES } from '../places';
import { Button, Dialog, SectionHeader } from '../ui/primitives';
import { useWorkspaceTheme } from '../ui/theme';
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
   each row here deep-links straight into that tool's settings view so
   nothing is unreachable, it just isn't duplicated across eight apps. */

const SETTINGS_TARGET: Record<string, string> = {
  timer: '#/p/timer?settings',
  ink: '#/p/ink?settings',
  rhythm: '#/p/rhythm?settings',
  proof: '#/p/proof?settings',
  syllabus: '#/p/syllabus?settings',
  gradestack: '#/p/gradestack?p=settings',
  margin: '#/p/margin?settings',
  flashcards: '#/p/flashcards?settings',
};

const SETTINGS_NOTE: Record<string, string> = {
  timer: 'Session defaults, sound, motion',
  ink: 'Editor density, autosave, desk behavior',
  rhythm: 'Routines, week shape, experiments',
  proof: 'Session length, review cadence, motion',
  syllabus: 'Study window, block size, semester',
  gradestack: 'Answer key, rubric, roster defaults',
  margin: 'Titles, format, editor size, transcription',
  flashcards: 'Keyboard map — theme and motion live here in the terrain',
};

export function SettingsSurface({ onGo }: { onGo: (url: string) => void }) {
  const [theme, setTheme] = useWorkspaceTheme();
  const dark = theme === 'graphite';

  return (
    <div className="mx-auto max-w-[720px] px-6 py-8">
      <div className="flex items-center gap-2.5">
        <Settings2 className="h-5 w-5 text-[var(--color-accent)]" strokeWidth={1.8} />
        <h1 className="text-[19px] font-semibold tracking-tight text-[var(--color-ink)]">
          Settings
        </h1>
      </div>
      <p className="mt-1 text-[13px] text-[var(--color-mute)]">
        One place for the terrain and every tool — each row opens that tool's
        settings straight where they live.
      </p>

      {/* Terrain */}
      <section className="pt-6">
        <SectionHeader title="Terrain" />
        <button
          type="button"
          onClick={() => setTheme()}
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
                Theme — {dark ? 'Graphite' : 'Paper'}
              </div>
              <div className="text-[12px] text-[var(--color-mute)]">
                One flick restyles the whole terrain — every tool follows.
              </div>
            </div>
          </div>
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
              dark ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-line)]'
            }`}
            role="switch"
            aria-checked={dark}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--color-sheet)] shadow transition-transform ${
                dark ? 'translate-x-[18px] left-0' : 'left-0.5'
              }`}
            />
          </span>
        </button>
      </section>

      {/* Backup */}
      <BackupSection />

      {/* Sample semester */}
      <DemoSection />

      {/* Integration health */}
      <DiagnosticsSection />

      {/* Start over */}
      <ResetSection />

      {/* Tools */}
      <section className="pt-6">
        <SectionHeader title="Tool settings" />
        <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
          {PLACES.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onGo(SETTINGS_TARGET[p.id] || `#/p/${p.id}`)}
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
              Guides for every tool — the first three moves in each.
            </div>
          </div>
          <span className="text-[12px] font-medium text-[var(--color-accent)]">Open →</span>
        </button>
      </section>
    </div>
  );
}

/* The terrain is local-first — everything lives in this browser, which makes
   a file backup the user's only real safety net (and the way to move between
   machines). Restore replaces the whole terrain, so it confirms first and
   reloads after: every store rehydrates from the restored storage on boot. */
function BackupSection() {
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
      <SectionHeader title="Backup" />
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
            <span className="block truncate text-[12px] text-[var(--color-mute)]">
              One JSON file with every tool's data — notes, cards, sessions, courses.
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
            <span className="block truncate text-[12px] text-[var(--color-mute)]">
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
      {error && <p className="mt-2 text-[12px] text-[var(--color-bad)]">{error}</p>}

      <Dialog
        open={!!pending}
        onClose={() => !restoring && setPending(null)}
        title="Restore this backup?"
        subtitle={
          summary
            ? `${new Date(summary.at).toLocaleString()} — ${summary.records} records across ${summary.dbs} databases, ${summary.lsKeys} settings keys`
            : undefined
        }
      >
        <p className="text-[12.5px] leading-relaxed text-[var(--color-mute)]">
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

/* Cross-tool traffic is invisible by design — a routine check goes through
   the same queue as a big import, so a stuck lane reads as nothing at all.
   This surfaces the two honest diagnostics: deliveries still waiting on
   their tool, and writes the hub quarantined as malformed. */
function DiagnosticsSection() {
  const [diag, setDiag] = useState<{ pending: number; quarantined: number } | null>(null);

  useEffect(() => {
    let live = true;
    const read = async () => {
      let pending = 0;
      let quarantined = 0;
      try {
        const ls = JSON.parse(localStorage.getItem('iterra.v1.store.intakes') || '{}');
        pending += Object.values(ls).filter((r: any) => !r?.delivered).length;
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
          const idbPending = await new Promise<number>((res) => {
            const req = indexedDB.open('iterra');
            req.onsuccess = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains('intakes')) { db.close(); res(0); return; }
              const r = db.transaction('intakes', 'readonly').objectStore('intakes').getAll();
              r.onsuccess = () => {
                db.close();
                res((r.result as any[]).filter((x) => !x?.delivered).length);
              };
              r.onerror = () => { db.close(); res(0); };
            };
            req.onerror = () => res(0);
          });
          pending += idbPending;
        }
      } catch { /* IDB optional */ }
      if (live) setDiag({ pending, quarantined });
    };
    void read();
    const t = window.setInterval(read, 8000);
    return () => { live = false; window.clearInterval(t); };
  }, []);

  if (!diag || (diag.pending === 0 && diag.quarantined === 0)) return null;

  return (
    <section className="pt-6">
      <SectionHeader title="Diagnostics" />
      <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
        {diag.pending > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5">
            <Inbox className="h-4 w-4 shrink-0 text-[var(--color-warn)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-[var(--color-ink)]">
                {diag.pending} deliver{diag.pending === 1 ? 'y' : 'ies'} waiting
              </span>
              <span className="block truncate text-[12px] text-[var(--color-mute)]">
                Send-to deliveries queue until their tool next opens — they land automatically.
              </span>
            </span>
          </div>
        )}
        {diag.quarantined > 0 && (
          <div className={`flex items-center gap-3 px-4 py-2.5 ${diag.pending > 0 ? 'border-t border-[var(--color-line)]' : ''}`}>
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--color-bad)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-[var(--color-ink)]">
                {diag.quarantined} malformed write{diag.quarantined === 1 ? '' : 's'} quarantined
              </span>
              <span className="block truncate text-[12px] text-[var(--color-mute)]">
                The hub rejected these instead of storing them — usually a publisher bug, worth a backup.
              </span>
            </span>
          </div>
        )}
      </div>
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

  if (!info) return null;
  const fmt = (b?: number) =>
    b == null ? '' : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;
  const size = info.usage != null
    ? ` · ${fmt(info.usage)} used${info.quota ? ` of ~${fmt(info.quota)}` : ''}`
    : '';
  /* writes start failing silently well before the quota reads 100% —
     warn early enough that a backup can still download */
  const nearFull = info.usage != null && info.quota != null && info.quota > 0 && info.usage / info.quota > 0.8;

  return (
    <div className="flex w-full items-center gap-3 border-t border-[var(--color-line)] px-4 py-2.5">
      <HardDrive className={`h-4 w-4 shrink-0 ${nearFull ? 'text-amber-600' : 'text-[var(--color-mute)]'}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-[var(--color-ink)]">
          {nearFull ? 'Storage nearly full' : info.persisted ? 'Storage is protected' : 'Storage is best-effort'}
        </span>
        <span className="block truncate text-[12px] text-[var(--color-mute)]">
          {nearFull
            ? `Export a backup, then clear space — writes may start failing${size}.`
            : info.persisted
              ? `This browser won't clear your data automatically${size}.`
              : `The browser may clear data under storage pressure — keep backups${size}.`}
        </span>
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
            Clears every tool, course and record stored in this browser — a fresh terrain.
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
                Three courses, assignments, decks and sessions — the terrain as it looks in use.
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
          Iterra adds a small set of demo records — courses, assignments,
          planned blocks, flashcard decks and focus sessions — alongside
          anything already here. Everything it adds is marked and can be
          removed in one pass from this same panel.
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
