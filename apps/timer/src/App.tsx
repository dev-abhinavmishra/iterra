import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { Timer, Watch, Clock, Repeat2, LayoutGrid, BarChart3, Settings } from 'lucide-react';
import { cn, vibrate } from '@/src/lib/utils';
import { unlockAudio, flapTick } from '@/src/lib/sound';
import { applySettings, useSettings } from '@/src/lib/settings';
import TimerView from './views/TimerView';
import StopwatchView from './views/StopwatchView';
import ClockView from './views/ClockView';
import IntervalsView from './views/IntervalsView';
import PresetsView from './views/PresetsView';
import StatsView from './views/StatsView';
import SettingsView from './views/SettingsView';
import { BootSequence } from './components/BootSequence';

type View = 'timer' | 'stopwatch' | 'clock' | 'intervals' | 'presets' | 'stats' | 'settings';

const NAV: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'timer',     label: 'Timer',     icon: <Timer size={19} strokeWidth={2.1} /> },
  { id: 'stopwatch', label: 'Watch',     icon: <Watch size={19} strokeWidth={2.1} /> },
  { id: 'clock',     label: 'Clock',     icon: <Clock size={19} strokeWidth={2.1} /> },
  { id: 'intervals', label: 'Routes',    icon: <Repeat2 size={19} strokeWidth={2.1} /> },
  { id: 'presets',   label: 'Departures',icon: <LayoutGrid size={19} strokeWidth={2.1} /> },
  { id: 'stats',     label: 'Ledger',    icon: <BarChart3 size={19} strokeWidth={2.1} /> },
  { id: 'settings',  label: 'Settings',  icon: <Settings size={19} strokeWidth={2.1} /> },
];

export default function App() {
  const [view, setView] = useState<View>('timer');
  const [preset, setPreset] = useState<{ minutes: number; name?: string; n: number }>({ minutes: 25, n: 0 });
  const [focusMode, setFocusMode] = useState(false);
  const [booted, setBooted] = useState(false);
  const settings = useSettings();
  // views mount on first visit and stay mounted — switching hides rather than
  // unmounts, so a running countdown, stopwatch laps, ringing alarms and
  // routine progress all survive navigation
  const [mounted, setMounted] = useState<Set<View>>(() => new Set<View>(['timer']));
  // at most one takeover owns the screen — the first to surface keeps it;
  // competing ones (e.g. a countdown finishing during a ringing alarm) wait
  // hidden in their own view, still reachable by manual navigation
  const [takeoverOwner, setTakeoverOwner] = useState<View | null>(null);
  const reportTakeover = useCallback((id: View, up: boolean) => {
    setTakeoverOwner(o => (up ? (o ?? id) : o === id ? null : o));
  }, []);
  const requestView = (id: View) => {
    if (takeoverOwner !== null && takeoverOwner !== id) return; // owned by another takeover
    setTakeoverOwner(id);
    go(id);
  };

  const go = (id: View) => {
    if (id === view) return;
    vibrate(18); flapTick(0.03);
    setMounted(m => (m.has(id) ? m : new Set(m).add(id)));
    setView(id);
  };

  useEffect(() => {
    applySettings();
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const selectPreset = (minutes: number, name?: string) => {
    setPreset(p => ({ minutes, name, n: p.n + 1 }));
    go('timer');
  };

  return (
    <MotionConfig reducedMotion={settings.motion === 'reduced' ? 'always' : 'never'}>
    <div className="min-h-screen flex flex-col wall-tex text-ink font-body overflow-x-hidden">
      {!booted && <BootSequence onDone={() => setBooted(true)} />}

      {/* ---------- header ---------- */}
      <AnimatePresence>
        {!focusMode && (
          <motion.header
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 26 }}
            className="w-full flex justify-between items-center px-5 md:px-8 pt-5 pb-1 z-40"
          >
            <div className="flex items-center gap-3">
              {/* wordmark — a tiny two-flap mark + type */}
              <div className="flex gap-[3px]">
                <span className="block w-[13px] h-[18px] rounded-[2px]" style={{ background: 'var(--mark-flap)', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.4)' }} />
                <span className="block w-[13px] h-[18px] rounded-[2px]" style={{ background: 'var(--color-signal)', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.35)' }} />
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-display font-bold text-lg tracking-[0.14em] text-ink">TIMER</span>
                <span className="label-wall text-[8px]" style={{ letterSpacing: '0.34em' }}>TIME INSTRUMENTS</span>
              </div>
            </div>
            <span className="label-wall text-[10px] hidden sm:block" style={{ letterSpacing: '0.28em' }}>
              EST. YOUR WORKDAY
            </span>
          </motion.header>
        )}
      </AnimatePresence>

      {/* ---------- content ---------- */}
      {/* keep-alive: once visited, each view stays mounted inside a display:none
          wrapper — running timers, laps and alarms keep their state, and the
          none→flex swap re-runs the .view-fold-in board-turn on every switch */}
      <main className={cn('flex-1 flex flex-col w-full relative', !focusMode && 'pb-44')}>
        <div className={cn('view-fold-in flex-1 flex-col w-full', view === 'timer' ? 'flex' : 'hidden')}>
          {mounted.has('timer') && (
            <TimerView
              key={preset.n}
              presetMinutes={preset.minutes}
              presetName={preset.name}
              onFocusModeChange={setFocusMode}
              active={view === 'timer'}
              onRequestView={() => requestView('timer')}
              onTakeover={up => reportTakeover('timer', up)}
              takeoverMuted={takeoverOwner !== null && takeoverOwner !== 'timer'}
            />
          )}
        </div>
        <div className={cn('view-fold-in flex-1 flex-col w-full', view === 'stopwatch' ? 'flex' : 'hidden')}>
          {mounted.has('stopwatch') && <StopwatchView active={view === 'stopwatch'} />}
        </div>
        <div className={cn('view-fold-in flex-1 flex-col w-full', view === 'clock' ? 'flex' : 'hidden')}>
          {mounted.has('clock') && (
            <ClockView
              active={view === 'clock'}
              onRequestView={() => requestView('clock')}
              onTakeover={up => reportTakeover('clock', up)}
            />
          )}
        </div>
        <div className={cn('view-fold-in flex-1 flex-col w-full', view === 'intervals' ? 'flex' : 'hidden')}>
          {mounted.has('intervals') && (
            <IntervalsView
              active={view === 'intervals'}
              onRequestView={() => requestView('intervals')}
              onTakeover={up => reportTakeover('intervals', up)}
            />
          )}
        </div>
        <div className={cn('view-fold-in flex-1 flex-col w-full', view === 'presets' ? 'flex' : 'hidden')}>
          {mounted.has('presets') && <PresetsView onSelectPreset={selectPreset} active={view === 'presets'} />}
        </div>
        <div className={cn('view-fold-in flex-1 flex-col w-full', view === 'stats' ? 'flex' : 'hidden')}>
          {mounted.has('stats') && <StatsView active={view === 'stats'} />}
        </div>
        <div className={cn('view-fold-in flex-1 flex-col w-full', view === 'settings' ? 'flex' : 'hidden')}>
          {mounted.has('settings') && <SettingsView active={view === 'settings'} />}
        </div>
      </main>

      {/* ---------- dock ---------- */}
      <AnimatePresence>
        {!focusMode && (
          <motion.nav
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 26, delay: 0.05 }}
            className="fixed bottom-5 left-0 right-0 z-[100] flex justify-center px-4"
          >
            <div className="board board-screws !rounded-2xl px-2 py-2 flex items-center gap-0.5">
              {NAV.map((item, i) => {
                const active = view === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => go(item.id)}
                    className={cn(
                      'relative flex flex-col items-center justify-center px-3 md:px-4 py-2 rounded-xl transition-colors duration-150',
                      active ? 'text-[color:var(--color-signal-bright)]' : 'text-flap-dim hover:text-flap-ink'
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="dock-pip"
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-[3px] rounded-full"
                        style={{ background: 'var(--color-signal-bright)', boxShadow: '0 0 8px var(--color-signal)' }}
                        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                      />
                    )}
                    {/* icon + label hop together when the tab becomes active */}
                    <motion.span
                      animate={active ? { y: [0, -4, 0], scale: [1, 1.12, 1] } : { y: 0, scale: 1 }}
                      transition={{ duration: 0.38, ease: 'easeOut' }}
                      key={`${item.id}-${active}`}
                      className="flex flex-col items-center"
                    >
                      {item.icon}
                      <span className="engraved text-[8px] mt-1.5 hidden sm:block" style={{ letterSpacing: '0.16em' }}>
                        {item.label}
                      </span>
                    </motion.span>
                  </button>
                );
              })}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}
