// ── Rhythm — the weekly sequencer ────────────────────────────────────────────
// Chrome is the unit's top edge: engraved wordmark, the tempo lamp, an LCD
// date readout, and the selector bank of section keys. The deck below carries
// the pattern itself — one channel per routine, seven steps per measure.

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
  { key: 'heatmap', label: 'Pattern' },
  { key: 'review', label: 'Weekly review' },
  { key: 'experiments', label: 'Experiments' },
  { key: 'connections', label: 'Signal in' },
  { key: 'settings', label: 'Setup' },
];

export default function App() {
  const booted = useRegister((s) => s.booted);
  const boot = useRegister((s) => s.boot);
  const hasOnboarded = useRegister((s) => s.hasOnboarded);
  const onboardingSeen = useRegister((s) => s.onboardingSeen);
  const markOnboardingSeen = useRegister((s) => s.markOnboardingSeen);
  const motion = useRegister((s) => s.settings.motion);
  const receipt = useRegister((s) => s.receipt);
  const focusedExperimentId = useRegister((s) => s.focusedExperimentId);
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

  /* ?experiment=<id> — land on the Experiments view with that card lit */
  useEffect(() => {
    if (focusedExperimentId) setView('experiments');
  }, [focusedExperimentId]);

  if (!booted) {
    return (
      <div className="grid h-full place-items-center">
        <span className="mono flex items-center gap-2.5 text-[11px] uppercase tracking-[0.22em]" style={{ color: 'var(--color-ink-soft)' }}>
          <span className="led led--tick" aria-hidden="true" />
          powering on
        </span>
      </div>
    );
  }

  // First run (or a reset machine) lands on the channel-patch sheet.
  const showOnboarding = !hasOnboarded() || (routineCount === 0 && !onboardingSeen);
  if (showOnboarding) {
    return (
      <ChassisShell view="today" setView={() => {}} bare>
        <Onboarding
          onDone={() => {
            markOnboardingSeen();
            setView('today');
          }}
        />
      </ChassisShell>
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
    <ChassisShell view={view} setView={goTab} motion={motion}>
      {view === 'today' && <TodayView openRoutine={openRoutine} />}
      {view === 'heatmap' && <HeatmapView openRoutine={openRoutine} />}
      {view === 'review' && <ReviewView openRoutine={openRoutine} />}
      {view === 'experiments' && <ExperimentsView focusId={focusedExperimentId} />}
      {view === 'connections' && <ConnectionsView />}
      {view === 'settings' && <SettingsView />}
      {view === 'routine' && routineId && <RoutineView routineId={routineId} />}

      {receipt && <ReceiptCard receipt={receipt} onClose={dismissReceipt} onOpenConnections={() => goTab('connections')} />}
    </ChassisShell>
  );
}

// ── The chassis top edge — wordmark, tempo lamp, LCD, selector bank ──────────

function ChassisShell({
  view,
  setView,
  children,
  bare,
  motion = 'full',
}: {
  view: View;
  setView: (v: View) => void;
  children: React.ReactNode;
  bare?: boolean;
  motion?: 'full' | 'reduced';
}) {
  return (
    <div className="flex min-h-full flex-col">
      {/* the unit's top edge */}
      <header className="no-print shrink-0 px-4 pt-4 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="flex items-center gap-3">
            <span className="led" aria-hidden="true" title="power" />
            <span className="disp silk text-[21px] font-bold tracking-[0.22em]" style={{ color: 'var(--color-ink)' }}>
              RHYTHM
            </span>
            <span className="mono silk hidden text-[9.5px] uppercase tracking-[0.26em] sm:inline" style={{ color: 'var(--color-ink-faint)' }}>
              weekly sequencer
            </span>
          </div>
          {!bare && (
            <div className="flex items-center gap-3">
              <span className="mono flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em]" style={{ color: 'var(--color-ink-faint)' }}>
                <span className={cx('led', motion === 'full' && 'led--tick')} aria-hidden="true" />
                run
              </span>
              <span className="lcd px-2.5 py-1 text-[10.5px] uppercase tracking-[0.16em]">
                {fmtDayFull(todayISO())}
              </span>
            </div>
          )}
        </div>

        {/* the selector bank */}
        {!bare && (
          <nav className="mx-auto mt-3 max-w-4xl" role="tablist" aria-label="deck sections">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={view === t.key || (view === 'routine' && t.key === 'today')}
                  className="stab"
                  onClick={() => setView(t.key)}
                >
                  {t.label}
                </button>
              ))}
              {view === 'routine' && (
                <span className="stab" aria-selected="true">
                  Channel
                </span>
              )}
            </div>
          </nav>
        )}
      </header>

      {/* the deck */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 sm:px-6">
        <div className={cx('deck mt-3 min-h-[70vh] px-6 py-6 sm:px-9 sm:py-7', bare && 'px-4 sm:px-9')}>
          {children}
        </div>
      </main>
    </div>
  );
}

// ── Signal received — a card over the deck ───────────────────────────────────

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
      <div className="panel p-4">
        <div className="kicker mb-1">Signal received — {APP_DISPLAY[receipt.sourceApp]}</div>
        <p className="mono text-[11.5px]">{receipt.type}</p>
        <p className="mt-1 text-[12px] text-ink-soft">
          {receipt.duplicate
            ? 'Already on the tape — deduplicated, nothing double-counted.'
            : receipt.entriesWritten > 0
              ? `Hit recorded on ${receipt.entriesWritten} ${receipt.entriesWritten === 1 ? 'channel' : 'channels'}${receipt.routineNames.length ? `: ${receipt.routineNames.join(', ')}` : ''}.`
              : 'Held in the inbox — no routing covers it yet.'}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            className="btn btn--quiet !px-2 !py-1"
            onClick={() => {
              onClose();
              onOpenConnections();
            }}
          >
            Signal in
          </button>
          <button className="btn btn--primary !px-2 !py-1" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
