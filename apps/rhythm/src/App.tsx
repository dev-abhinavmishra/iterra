// ── Rhythm — the attendance register ─────────────────────────────────────────
// Chrome is the cloth-bound cover: wordmark, today's date stamp, index tabs
// along the fore-edge. The leaf below carries the register itself.

import { useEffect, useState } from 'react';
import { useRegister } from './store';
import { fmtDayFull, todayISO } from './lib/dates';
import { APP_DISPLAY } from './lib/links';
import { cx } from './lib/utils';
import { TodayView } from './views/TodayView';
import { HeatmapView } from './views/HeatmapView';
import { RoutineView } from './views/RoutineView';
import { ReviewView } from './views/ReviewView';
import { ExperimentsView } from './views/ExperimentsView';
import { ConnectionsView } from './views/ConnectionsView';
import { SettingsView } from './views/SettingsView';
import { Onboarding } from './views/Onboarding';

type View = 'today' | 'heatmap' | 'review' | 'experiments' | 'connections' | 'settings' | 'routine';

const TABS: { key: View; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'heatmap', label: 'Heatmap' },
  { key: 'review', label: 'Weekly review' },
  { key: 'experiments', label: 'Experiments' },
  { key: 'connections', label: 'Connections' },
  { key: 'settings', label: 'Settings' },
];

export default function App() {
  const booted = useRegister((s) => s.booted);
  const boot = useRegister((s) => s.boot);
  const hasOnboarded = useRegister((s) => s.hasOnboarded);
  const onboardingSeen = useRegister((s) => s.onboardingSeen);
  const markOnboardingSeen = useRegister((s) => s.markOnboardingSeen);
  const motion = useRegister((s) => s.settings.motion);
  const receipt = useRegister((s) => s.receipt);
  const dismissReceipt = useRegister((s) => s.dismissReceipt);
  const routineCount = useRegister((s) => Object.keys(s.routines).length);

  const [view, setView] = useState<View>('today');
  const [routineId, setRoutineId] = useState<string | null>(null);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);

  if (!booted) {
    return <div className="grid h-full place-items-center text-sm" style={{ color: 'rgb(241 235 215 / 0.6)' }}>opening the register…</div>;
  }

  // First run (or a reset register) lands on the intake sheet.
  const showOnboarding = !hasOnboarded() || (routineCount === 0 && !onboardingSeen);
  if (showOnboarding) {
    return (
      <CoverShell view="today" setView={() => {}} bare>
        <Onboarding
          onDone={() => {
            markOnboardingSeen();
            setView('today');
          }}
        />
      </CoverShell>
    );
  }

  const openRoutine = (id: string) => {
    setRoutineId(id);
    setView('routine');
  };

  const goTab = (v: View) => {
    if (v !== 'routine') setRoutineId(null);
    setView(v);
  };

  return (
    <CoverShell view={view} setView={goTab}>
      {view === 'today' && <TodayView openRoutine={openRoutine} />}
      {view === 'heatmap' && <HeatmapView openRoutine={openRoutine} />}
      {view === 'review' && <ReviewView openRoutine={openRoutine} />}
      {view === 'experiments' && <ExperimentsView />}
      {view === 'connections' && <ConnectionsView />}
      {view === 'settings' && <SettingsView />}
      {view === 'routine' && routineId && <RoutineView routineId={routineId} />}

      {receipt && <ReceiptCard receipt={receipt} onClose={dismissReceipt} onOpenConnections={() => goTab('connections')} />}
    </CoverShell>
  );
}

// ── The cover — binding rail, wordmark, date stamp, index tabs ───────────────

function CoverShell({
  view,
  setView,
  children,
  bare,
}: {
  view: View;
  setView: (v: View) => void;
  children: React.ReactNode;
  bare?: boolean;
}) {
  return (
    <div className="flex min-h-full flex-col">
      {/* cover header */}
      <header className="no-print shrink-0 px-4 pt-4 sm:px-6" style={{ color: 'rgb(241 235 215 / 0.9)' }}>
        <div className="mx-auto flex max-w-4xl flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-3">
            <span className="datestamp text-[22px] font-bold tracking-[0.16em]" style={{ color: 'rgb(241 235 215 / 0.95)' }}>
              RHYTHM
            </span>
            <span className="mono hidden text-[10px] uppercase tracking-[0.22em] sm:inline" style={{ color: 'rgb(241 235 215 / 0.5)' }}>
              attendance register
            </span>
          </div>
          {!bare && (
            <span className="mono text-[11px] uppercase tracking-[0.18em]" style={{ color: 'rgb(241 235 215 / 0.6)' }}>
              {fmtDayFull(todayISO())}
            </span>
          )}
        </div>

        {/* index tabs along the fore-edge */}
        {!bare && (
          <nav className="mx-auto mt-3 max-w-4xl" role="tablist" aria-label="register sections">
            <div className="flex gap-0.5 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={view === t.key || (view === 'routine' && t.key === 'today')}
                  className="rtab"
                  onClick={() => setView(t.key)}
                >
                  {t.label}
                </button>
              ))}
              {view === 'routine' && (
                <span className="rtab" aria-selected="true" style={{ background: 'var(--color-leaf)', color: 'var(--color-ink)' }}>
                  Routine
                </span>
              )}
            </div>
          </nav>
        )}
      </header>

      {/* the leaf */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 sm:px-6">
        <div className={cx('leaf mt-3 min-h-[70vh] px-6 py-6 sm:px-9 sm:py-7', bare && 'px-4 sm:px-9')}>
          {children}
        </div>
      </main>
    </div>
  );
}

// ── Event receipt — a slip slid under the register door ──────────────────────

function ReceiptCard({
  receipt,
  onClose,
  onOpenConnections,
}: {
  receipt: { eventId: string; sourceApp: keyof typeof APP_DISPLAY; type: string; entriesWritten: number; routineNames: string[]; duplicate: boolean };
  onClose: () => void;
  onOpenConnections: () => void;
}) {
  return (
    <div
      className="fixed bottom-5 right-5 z-50 w-80 no-print"
      style={{ animation: 'var(--animate-receipt-in)' }}
      role="status"
    >
      <div className="slip p-4">
        <div className="kicker mb-1">Event received — {APP_DISPLAY[receipt.sourceApp]}</div>
        <p className="mono text-[11.5px]">{receipt.type}</p>
        <p className="mt-1 text-[12px] text-ink-soft">
          {receipt.duplicate
            ? 'Already on file — deduplicated, nothing double-counted.'
            : receipt.entriesWritten > 0
              ? `Stamped ${receipt.entriesWritten} ${receipt.entriesWritten === 1 ? 'line' : 'lines'}${receipt.routineNames.length ? `: ${receipt.routineNames.join(', ')}` : ''}.`
              : 'Filed in the intake ledger — no mapping covers it yet.'}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            className="btn btn--quiet !px-2 !py-1"
            onClick={() => {
              onClose();
              onOpenConnections();
            }}
          >
            Connections
          </button>
          <button className="btn btn--primary !px-2 !py-1" onClick={onClose}>
            File it away
          </button>
        </div>
      </div>
    </div>
  );
}
