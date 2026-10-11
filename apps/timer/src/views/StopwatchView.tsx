import { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Flag, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, vibrate } from '../lib/utils';
import { saveSession } from '../lib/stats';
import { useStopwatch } from '../hooks/useTimer';
import { useViewport } from '../hooks/useViewport';
import { FlipRow, RollDigit } from '../components/Flip';
import { KeyButton } from '../components/KeyButton';
import { flapTick, flapLand } from '../lib/sound';

interface Lap { id: number; time: number; diff: number }

function fmtMs(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((ms % 1000) / 10);
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
function fmtCs(ms: number) {
  return Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
}
function fmtFull(ms: number) {
  return `${fmtMs(ms)}.${fmtCs(ms)}`;
}

export default function StopwatchView({ active = true }: { active?: boolean }) {
  const sw = useStopwatch();
  const vp = useViewport();
  const [laps, setLaps] = useState<Lap[]>([]);
  const [copied, setCopied] = useState(false);
  const [keyFlash, setKeyFlash] = useState<string | null>(null);

  const flashKey = (k: string) => { setKeyFlash(k); setTimeout(() => setKeyFlash(null), 160); };

  const running = sw.running;
  const time = sw.elapsed;

  /* keyboard: space toggle, L lap, R reset */
  useEffect(() => {
    if (!active) return; // keys belong to whichever view is on screen
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') { e.preventDefault(); flashKey('toggle'); toggle(); }
      else if (e.key === 'l' || e.key === 'L') { flashKey('lap'); addLap(); }
      else if (e.key === 'r' || e.key === 'R') { flashKey('reset'); resetAll(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const toggle = () => {
    vibrate(running ? 35 : 55);
    if (running) sw.pause();
    else sw.start();
  };

  const resetAll = () => {
    vibrate([25, 40, 25]);
    if (time > 30000) saveSession({ duration: Math.round(time / 1000), type: 'stopwatch' });
    sw.reset();
    setLaps([]);
  };

  const addLap = () => {
    if (!running || time === 0) return;
    vibrate(25);
    flapLand(0.09);
    const lastLapTime = laps.length > 0 ? laps[0].time : 0;
    setLaps([{ id: Date.now(), time, diff: time - lastLapTime }, ...laps]);
  };

  const copyLaps = () => {
    const text = laps.slice().reverse().map((l, i) => `Lap ${i + 1},${fmtFull(l.diff)},${fmtFull(l.time)}`).join('\n');
    navigator.clipboard?.writeText(`Lap,Split,Total\n${text}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  const dispStr = fmtMs(time);
  const bestId = laps.length > 1 ? laps.reduce((a, b) => (a.diff < b.diff ? a : b)).id : -1;
  const worstId = laps.length > 1 ? laps.reduce((a, b) => (a.diff > b.diff ? a : b)).id : -1;

  const dialSize = Math.min(vp.w - 48, 380);

  return (
    <div className="flex-1 w-full flex flex-col lg:flex-row items-center lg:items-start justify-center gap-10 lg:gap-16 px-4 md:px-8 py-6 max-w-6xl mx-auto">

      {/* ---------- THE CHRONOGRAPH ---------- */}
      <div className="board board-screws p-5 md:p-7 shrink-0">
        <div className="flex items-center justify-between mb-4 px-0.5">
          <span className="engraved text-[10px] md:text-xs">Chronograph</span>
          <span className="engraved text-[10px] md:text-xs" style={{ color: running ? 'var(--color-signal-bright)' : undefined }}>
            {running ? '● Sweeping' : 'Standby'}
          </span>
        </div>
        <div className="board-inset p-3 md:p-5">
          <div className="relative mx-auto" style={{ width: dialSize, height: dialSize }}>
            <svg viewBox="0 0 300 300" className="absolute inset-0 w-full h-full overflow-visible">
              <defs>
                <filter id="sw-glow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feComposite in="SourceGraphic" in2="b" operator="over" />
                </filter>
                <linearGradient id="sw-comet" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--color-signal-bright)" />
                  <stop offset="100%" stopColor="var(--color-brass-hi)" />
                </linearGradient>
              </defs>

              {/* tick ring — 120 marks */}
              {Array.from({ length: 120 }).map((_, i) => {
                const a = i * 3 * Math.PI / 180;
                const major = i % 10 === 0, med = i % 5 === 0;
                const r1 = major ? 128 : med ? 133 : 137, r2 = 142;
                return (
                  <line key={i}
                    x1={150 + r1 * Math.sin(a)} y1={150 - r1 * Math.cos(a)}
                    x2={150 + r2 * Math.sin(a)} y2={150 - r2 * Math.cos(a)}
                    stroke="var(--color-flap-ink)"
                    strokeWidth={major ? 2.2 : 1}
                    opacity={major ? 0.5 : med ? 0.28 : 0.12}
                  />
                );
              })}
              <circle cx="150" cy="150" r="142" fill="none" stroke="var(--color-flap-ink)" strokeWidth="0.8" opacity="0.14" />

              {/* lap markers on the rim */}
              <AnimatePresence>
                {laps.map(lap => {
                  const ang = ((lap.time % 60000) / 60000) * 360;
                  return (
                    <motion.line
                      key={lap.id}
                      initial={{ opacity: 0, pathLength: 0 }}
                      animate={{ opacity: 1, pathLength: 1 }}
                      x1="150" y1="4" x2="150" y2="19"
                      stroke="var(--color-brass-hi)" strokeWidth="3.4" strokeLinecap="round"
                      transform={`rotate(${ang} 150 150)`}
                    />
                  );
                })}
              </AnimatePresence>

              {/* seconds orbit — comet arc */}
              <circle
                cx="150" cy="150" r="142" fill="none"
                stroke="url(#sw-comet)" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 142}
                strokeDashoffset={2 * Math.PI * 142 * (1 - (time % 60000) / 60000)}
                transform="rotate(-90 150 150)"
                filter="url(#sw-glow)"
              />
              <g transform={`rotate(${((time % 60000) / 60000) * 360} 150 150)`}>
                <circle cx="150" cy="8" r="7" fill="var(--color-signal-bright)" filter="url(#sw-glow)" />
                <circle cx="150" cy="8" r="2.6" fill="#FFF7E8" />
              </g>

              {/* centisecond inner orbit */}
              <circle cx="150" cy="150" r="114" fill="none" stroke="var(--color-flap-ink)" strokeWidth="0.8" strokeDasharray="3 5" opacity="0.12" />
              <circle
                cx="150" cy="150" r="114" fill="none"
                stroke="var(--color-brass)" strokeWidth="2.4" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 114}
                strokeDashoffset={2 * Math.PI * 114 * (1 - (time % 1000) / 1000)}
                transform="rotate(-90 150 150)"
                opacity={0.85}
              />
              <g transform={`rotate(${((time % 1000) / 1000) * 360} 150 150)`}>
                <circle cx="150" cy="36" r="4" fill="var(--color-brass-hi)" filter="url(#sw-glow)" />
              </g>
            </svg>

            {/* knurled bezel rings — rotate while running */}
            <div
              className="absolute inset-3 rounded-full border-2 border-dashed pointer-events-none animate-spin"
              style={{ borderColor: 'rgba(242,233,207,0.14)', animationDuration: '36s', animationPlayState: running ? 'running' : 'paused' }}
            />
            <div
              className="absolute inset-10 rounded-full border border-dotted pointer-events-none animate-spin"
              style={{ borderColor: 'rgba(185,143,62,0.3)', animationDuration: '22s', animationDirection: 'reverse', animationPlayState: running ? 'running' : 'paused' }}
            />

            {/* ambient breath while running */}
            <AnimatePresence>
              {running && (
                <motion.div
                  key="breath"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.3, rotate: 180 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', repeatType: 'reverse' }}
                  className="absolute inset-14 rounded-full pointer-events-none -z-0"
                  style={{ background: 'radial-gradient(circle, rgba(232,73,15,0.28), transparent 65%)', filter: 'blur(22px)' }}
                />
              )}
            </AnimatePresence>

            {/* flap readout inside the dial */}
            <motion.div
              animate={{ scale: running ? 1 : 0.985 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center"
            >
              <FlipRow text={dispStr} size={dialSize > 320 ? 56 : 44} live={running} sound={false} />
              <div className="mt-2 flex items-baseline font-display font-bold text-brass-hi" style={{ color: 'var(--color-brass-hi)', fontSize: dialSize > 320 ? 26 : 20 }}>
                <span className="engraved text-[9px] mr-1.5" style={{ letterSpacing: '0.2em' }}>CS</span>
                <span>.</span>
                <RollDigit value={fmtCs(time)[0]} />
                <RollDigit value={fmtCs(time)[1]} />
              </div>
            </motion.div>

            {/* lap ripples */}
            <AnimatePresence>
              {laps.slice(0, 2).map(lap => (
                <motion.div
                  key={`r-${lap.id}`}
                  initial={{ opacity: 0.5, scale: 0.85 }}
                  animate={{ opacity: 0, scale: 1.5 }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                  className="absolute inset-0 rounded-full border-2 pointer-events-none"
                  style={{ borderColor: 'var(--color-brass-hi)' }}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* transport */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <KeyButton onClick={addLap} disabled={!running} className={cn('h-20 flex-col', keyFlash === 'lap' && 'key--pressed')} title="Lap (L)">
            <Flag size={20} />
            <span className="text-[9px]">Lap</span>
          </KeyButton>
          <KeyButton onClick={toggle} variant="signal" className={cn('h-20 flex-col', keyFlash === 'toggle' && 'key--pressed')} title="Start / Stop (Space)">
            {running ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
            <span className="text-[9px]">{running ? 'Stop' : 'Start'}</span>
          </KeyButton>
          <KeyButton onClick={resetAll} className={cn('h-20 flex-col', keyFlash === 'reset' && 'key--pressed')} title="Reset (R)">
            <RotateCcw size={20} />
            <span className="text-[9px]">Reset</span>
          </KeyButton>
        </div>
      </div>

      {/* ---------- LAP TICKETS ---------- */}
      <div className="w-full max-w-sm flex-1 flex flex-col min-h-0">
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="label-wall text-[10px] mb-1">Splits</div>
            <div className="font-display text-3xl font-bold text-ink uppercase leading-none">
              {laps.length === 0 ? 'No laps yet' : `${laps.length} lap${laps.length === 1 ? '' : 's'}`}
            </div>
          </div>
          {laps.length > 0 && (
            <button onClick={copyLaps} className="chip px-3 py-1.5 text-[10px] flex items-center gap-1.5">
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>

        {laps.length === 0 ? (
          <div className="panel-wall p-6 text-sm text-ink-soft font-body leading-relaxed">
            Start the chronograph and press LAP to punch a split. Fastest and slowest laps are marked on the dial rim.
          </div>
        ) : (
          <div className="space-y-2 max-h-[52vh] lg:max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
            <AnimatePresence initial={false}>
              {laps.map((lap, i) => {
                const lapNo = laps.length - i;
                const isBest = lap.id === bestId, isWorst = lap.id === worstId;
                return (
                  <motion.div
                    key={lap.id}
                    layout
                    initial={{ opacity: 0, y: -18, rotateX: -40 }}
                    animate={{ opacity: 1, y: 0, rotateX: 0 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    className="panel-wall px-4 py-3 flex items-center justify-between relative overflow-hidden"
                    style={{ transformOrigin: 'top' }}
                  >
                    {(isBest || isWorst) && (
                      <div className="absolute left-0 top-0 bottom-0 w-1"
                        style={{ background: isBest ? 'var(--color-signal)' : 'var(--color-ink-faint)' }} />
                    )}
                    <div className="flex items-center gap-4">
                      <span className="font-display font-bold text-ink-faint text-lg w-7 text-right">
                        {String(lapNo).padStart(2, '0')}
                      </span>
                      <div>
                        <div className={cn('font-display font-bold text-xl leading-none', isBest && 'text-[color:var(--color-signal)]')}>
                          {fmtFull(lap.diff)}
                        </div>
                        <div className="label-wall text-[9px] mt-0.5">
                          {isBest ? 'Fastest' : isWorst ? 'Slowest' : 'Split'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display font-semibold text-ink-soft text-sm">{fmtFull(lap.time)}</div>
                      <div className="label-wall text-[9px] mt-0.5">Total</div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
        <div className="mt-4 label-wall text-[9px] flex gap-5">
          <span>Space — run</span><span>L — lap</span><span>R — reset</span>
        </div>
      </div>
    </div>
  );
}
