import { useEffect, useState } from 'react';
import { Play, Pause, Plus, X, Trash2, ArrowRight, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, vibrate } from '../lib/utils';
import { saveSession } from '../lib/stats';
import { useRoutineRunner, Routine, Phase } from '../hooks/useTimer';
import { useViewport } from '../hooks/useViewport';
import { FlipRow, FlipText, Board } from '../components/Flip';
import { KeyButton } from '../components/KeyButton';
import { stationChime, flapLand, secondTick } from '../lib/sound';
import { useRef } from 'react';

const KEY = 'timer.routines.v1';
const LEGACY_KEY = 'platform.routines.v1';

const BUILT_INS: Routine[] = [
  { id: 'pomodoro', name: 'Pomodoro', rounds: 4, phases: [
    { name: 'Focus', seconds: 25 * 60, kind: 'work' },
    { name: 'Recess', seconds: 5 * 60, kind: 'rest' },
  ]},
  { id: 'tabata', name: 'Tabata', rounds: 8, phases: [
    { name: 'Work', seconds: 20, kind: 'work' },
    { name: 'Rest', seconds: 10, kind: 'rest' },
  ]},
  { id: '5217', name: '52 / 17', rounds: 2, phases: [
    { name: 'Focus', seconds: 52 * 60, kind: 'work' },
    { name: 'Recess', seconds: 17 * 60, kind: 'rest' },
  ]},
];

function loadRoutines(): Routine[] {
  try {
    const data = localStorage.getItem(KEY);
    if (data) return JSON.parse(data);
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      localStorage.setItem(KEY, legacy);
      localStorage.removeItem(LEGACY_KEY);
      return parsed;
    }
  } catch { /* fall through */ }
  return [];
}

function fmtDur(s: number) {
  return s >= 60 ? `${Math.round(s / 60)}m` : `${s}s`;
}
function fmtKept(s: number) {
  return s >= 90 ? `${Math.round(s / 60)} MIN KEPT` : `${s} SEC KEPT`;
}
function fmtTotal(s: number) {
  return s >= 60 ? `${Math.round(s / 60)} min total` : `${s}s total`;
}
function fmt(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
const routineTotal = (r: Routine) => r.phases.reduce((a, p) => a + p.seconds, 0) * r.rounds;
const routineWork = (r: Routine) => r.phases.filter(p => p.kind !== 'rest').reduce((a, p) => a + p.seconds, 0) * r.rounds;

export default function IntervalsView({ active = true, onRequestView, onTakeover }: {
  active?: boolean;                    // false while another view is on screen
  onRequestView?: () => void;          // ask the shell to surface this view
  onTakeover?: (up: boolean) => void;  // report takeover up/down to the shell
}) {
  const run = useRoutineRunner();
  const vp = useViewport();
  const [custom, setCustom] = useState<Routine[]>(loadRoutines);
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState(0); // increments on phase change → triggers board flash
  const [keyFlash, setKeyFlash] = useState<string | null>(null);
  const flashKey = (k: string) => { setKeyFlash(k); setTimeout(() => setKeyFlash(null), 160); };

  // editor draft
  const [name, setName] = useState('');
  const [rounds, setRounds] = useState(3);
  const [phases, setPhases] = useState<Phase[]>([
    { name: 'Work', seconds: 60, kind: 'work' },
    { name: 'Rest', seconds: 30, kind: 'rest' },
  ]);

  const lastPhase = useRef(-1);
  useEffect(() => {
    if (!run.running || !run.routine) return;
    const key = run.phaseIdx * 100 + run.round;
    if (lastPhase.current !== key) {
      lastPhase.current = key;
      setFlash(f => f + 1);
      flapLand(0.14);
      vibrate([60, 40, 60]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.phaseIdx, run.round, run.running]);

  /* completion */
  useEffect(() => {
    if (run.finished) {
      stationChime();
      vibrate([120, 80, 120, 80, 300]);
      if (run.routine) saveSession({ duration: routineWork(run.routine), type: 'interval', preset: run.routine.name });
      // pull the app back to the board so ROUTE COMPLETE is actually seen
      if (!active) onRequestView?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.finished]);

  /* report the completion screen so the shell keeps only one takeover up */
  useEffect(() => {
    onTakeover?.(run.finished);
  }, [run.finished, onTakeover]);

  /* per-second tick sound while running — only while this view is on screen,
     same policy as the countdown (phase flaps + the finish chime still
     announce from hidden) */
  const lastSec = useRef(0);
  const secsLeft = Math.ceil(run.remainingMs / 1000);
  useEffect(() => {
    if (run.running && secsLeft !== lastSec.current) {
      lastSec.current = secsLeft;
      if (active) secondTick();
    }
  }, [secsLeft, run.running, active]);

  /* keyboard */
  useEffect(() => {
    if (!active) return; // keys belong to whichever view is on screen
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (editing) { if (e.key === 'Escape') setEditing(false); return; }
      if (e.code === 'Space') { e.preventDefault(); if (run.routine) { flashKey('toggle'); run.running ? run.pause() : run.resume(); } }
      else if (e.key === 'r' || e.key === 'R') { if (run.routine) { flashKey('restart'); run.start(run.routine); } }
      else if (e.key === 'Escape') { if (run.routine) { flashKey('quit'); run.quit(); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const saveCustom = () => {
    if (!name.trim() || phases.length === 0) return;
    const r: Routine = { id: Math.random().toString(36).slice(2, 8), name: name.trim(), phases, rounds };
    const next = [...custom, r];
    setCustom(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    setEditing(false);
    setName(''); setRounds(3);
    setPhases([{ name: 'Work', seconds: 60, kind: 'work' }, { name: 'Rest', seconds: 30, kind: 'rest' }]);
  };
  const deleteCustom = (id: string) => {
    const next = custom.filter(r => r.id !== id);
    setCustom(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const phase = run.phase;
  const phaseTotal = phase ? phase.seconds * 1000 : 1;
  const phaseProgress = phase ? 1 - run.remainingMs / phaseTotal : 0;

  /* ============ RUNNER MODE ============ */
  if (run.routine || run.finished) {
    const dispStr = fmt(secsLeft);
    const flipSize = Math.max(72, Math.min(170, Math.round(vp.w / 7.6)));
    return (
      <div className="flex-1 w-full flex flex-col items-center justify-center px-4 py-6 relative">
        {/* phase-change flash */}
        <AnimatePresence>
          {flash > 0 && (
            <motion.div
              key={flash}
              initial={{ opacity: 0.55 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className="fixed inset-0 pointer-events-none z-[60]"
              style={{ background: phase?.kind === 'rest' ? 'var(--color-signal)' : 'var(--color-ink)' }}
            />
          )}
        </AnimatePresence>

        {run.finished ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-10"
          >
            <FlipText text="ROUTE COMPLETE" size={Math.min(64, vp.w / 15)} />
            <div className="engraved text-sm" style={{ letterSpacing: '0.4em' }}>
              {run.routine?.name.toUpperCase()} — {fmtKept(routineTotal(run.routine!))}
            </div>
            <KeyButton variant="signal" className="px-10 py-4 text-sm" onClick={run.quit}>Done</KeyButton>
          </motion.div>
        ) : (
          <>
            <div className="w-full max-w-3xl flex flex-col items-center gap-6">
              {/* current phase in letter flaps */}
              <FlipText
                text={phase?.name.toUpperCase() || ''}
                size={Math.min(52, vp.w / 14)}
                accent={phase?.kind === 'rest'}
              />

              <Board className="w-full max-w-2xl" label={run.routine?.name} right={
                <span className="engraved text-[10px] md:text-xs" style={{ color: 'var(--color-signal-bright)' }}>
                  Round {run.round} / {run.routine?.rounds}
                </span>
              }>
                <div className="flex items-center justify-center py-1">
                  <FlipRow text={dispStr} size={flipSize} live={run.running} accent={phase?.kind === 'rest'} />
                </div>
                <div className="mt-4 h-[3px] rounded-full" style={{ background: 'rgba(242,233,207,0.08)' }}>
                  <div className="h-full rounded-full" style={{ background: 'var(--color-signal-bright)', width: `${phaseProgress * 100}%`, transition: 'width 0.15s linear' }} />
                </div>
                <div className="mt-3 flex justify-between px-0.5">
                  <span className="engraved text-[9px] md:text-[10px]">
                    {run.nextPhase ? `NEXT — ${run.nextPhase.name.toUpperCase()} ${fmtDur(run.nextPhase.seconds)}` : 'FINAL PHASE'}
                  </span>
                  <span className="engraved text-[9px] md:text-[10px]">
                    {fmtDur(Math.round(run.remainingMs / 1000))} LEFT
                  </span>
                </div>
              </Board>

              {/* route map — all phases as a ribbon */}
              <div className="flex items-center gap-1.5 flex-wrap justify-center max-w-2xl">
                {run.routine && Array.from({ length: run.routine.rounds }).flatMap((_, r) =>
                  run.routine!.phases.map((p, pIdx) => {
                    const done = r + 1 < run.round || (r + 1 === run.round && pIdx < run.phaseIdx);
                    const current = r + 1 === run.round && pIdx === run.phaseIdx;
                    return (
                      <div key={`${r}-${pIdx}`} className="flex items-center gap-1.5">
                        <div className={cn(
                          'label-wall text-[9px] px-2 py-1 rounded border transition-colors',
                          current ? 'border-[color:var(--color-signal)] text-ink bg-[rgb(var(--signal-rgb)_/_0.12)]'
                                  : done ? 'border-transparent text-ink-faint line-through' : 'border-rule text-ink-soft'
                        )}>
                          {p.name} {fmtDur(p.seconds)}
                        </div>
                        {!(pIdx === run.routine!.phases.length - 1 && r === run.routine!.rounds - 1) && (
                          <ArrowRight size={10} className="text-ink-faint" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex items-center gap-5 mt-2">
                <KeyButton onClick={run.quit} className={cn('w-16 h-16 !rounded-full', keyFlash === 'quit' && 'key--pressed')} title="Quit (Esc)"><X size={22} /></KeyButton>
                <KeyButton onClick={() => run.running ? run.pause() : run.resume()} variant="signal" className={cn('w-24 h-24 !rounded-full', keyFlash === 'toggle' && 'key--pressed')} title="Space">
                  {run.running ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" className="ml-1.5" />}
                </KeyButton>
                <KeyButton onClick={() => run.start(run.routine!)} className={cn('w-16 h-16 !rounded-full', keyFlash === 'restart' && 'key--pressed')} title="Restart"><RotateCcw size={22} /></KeyButton>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  /* ============ PICKER / EDITOR ============ */
  const all = [...BUILT_INS, ...custom];
  return (
    <div className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-8 py-6">
      <div className="mb-10">
        <div className="label-wall text-[10px] mb-1">Routes</div>
        <h1 className="font-display text-4xl md:text-5xl font-bold text-ink uppercase tracking-tight leading-none">
          Interval boards
        </h1>
        <p className="text-ink-soft font-body text-sm mt-2 max-w-md">
          Chained phases that run back to back — work, rest, repeat. Pick a route or build your own.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {all.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 24 }}
            whileHover={{ y: -3, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
            className="panel-wall p-5 flex flex-col group relative"
          >
            {custom.some(c => c.id === r.id) && (
              <button
                onClick={() => deleteCustom(r.id)}
                className="absolute top-4 right-4 text-ink-faint hover:text-[color:var(--color-signal)] transition-colors"
              >
                <Trash2 size={15} />
              </button>
            )}
            <div className="font-display text-2xl font-bold text-ink uppercase leading-none mb-1">{r.name}</div>
            <div className="label-wall text-[9px] mb-4">{r.rounds} round{r.rounds > 1 ? 's' : ''} — {fmtTotal(routineTotal(r))}</div>
            <div className="flex flex-wrap gap-1.5 mb-5">
              {r.phases.map((p, j) => (
                <span key={j} className={cn('chip px-2 py-1 text-[9px] cursor-default', p.kind === 'rest' && 'opacity-70')}>
                  {p.name} {fmtDur(p.seconds)}
                </span>
              ))}
            </div>
            <div className="mt-auto">
              <KeyButton variant="signal" className="w-full py-2.5 text-[11px]" onClick={() => { vibrate(30); run.start(r); }}>
                <Play size={13} fill="currentColor" /> Board this route
              </KeyButton>
            </div>
          </motion.div>
        ))}

        {/* new routine card */}
        <motion.button
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: all.length * 0.06 }}
          whileHover={{ y: -3, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setEditing(true)}
          className="flex flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-rule p-6 min-h-[190px] hover:border-ink transition-colors group"
        >
          <div className="w-11 h-11 rounded-full border border-rule flex items-center justify-center mb-3 group-hover:border-ink transition-colors">
            <Plus size={20} className="text-ink-soft" />
          </div>
          <span className="font-display font-semibold text-ink-soft uppercase text-sm">New route</span>
        </motion.button>
      </div>

      {/* ---------- ROUTINE EDITOR ---------- */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-center justify-center p-4"
            style={{ background: 'rgba(15,12,6,0.7)', backdropFilter: 'blur(6px)' }}
            onClick={() => setEditing(false)}
          >
            <motion.div
              initial={{ y: 40, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="board board-screws p-6 w-full max-w-md max-h-[88vh] overflow-y-auto custom-scrollbar"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <span className="engraved text-xs">New route</span>
                <button onClick={() => setEditing(false)} className="text-flap-dim hover:text-flap-ink"><X size={18} /></button>
              </div>

              <input
                name="route-name"
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Route name — e.g. Kettlebell ladder"
                className="w-full mb-5 bg-[#0F0C06] border border-[rgba(242,233,207,0.12)] rounded-lg px-4 py-2.5 text-sm text-flap-ink placeholder:text-flap-dim focus:outline-none focus:border-[rgba(242,233,207,0.3)] font-body"
              />

              <div className="engraved text-[10px] mb-2">Phases</div>
              <div className="space-y-2 mb-4">
                {phases.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      name={`phase-name-${i}`}
                      value={p.name}
                      onChange={e => setPhases(phases.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      className="flex-1 min-w-0 bg-[#0F0C06] border border-[rgba(242,233,207,0.12)] rounded-lg px-3 py-2 text-sm text-flap-ink focus:outline-none font-body"
                    />
                    <div className="flex items-center gap-1">
                      <button onClick={() => setPhases(phases.map((x, j) => j === i ? { ...x, seconds: Math.max(5, x.seconds - (x.seconds > 60 ? 30 : 5)) } : x))}
                        className="w-7 h-7 rounded bg-board-3 text-flap-ink text-sm">−</button>
                      <span className="w-12 text-center font-display font-bold text-flap-ink text-sm">{fmtDur(p.seconds)}</span>
                      <button onClick={() => setPhases(phases.map((x, j) => j === i ? { ...x, seconds: Math.min(3600, x.seconds + (x.seconds >= 60 ? 30 : 5)) } : x))}
                        className="w-7 h-7 rounded bg-board-3 text-flap-ink text-sm">+</button>
                    </div>
                    <button
                      onClick={() => setPhases(phases.map((x, j) => j === i ? { ...x, kind: x.kind === 'work' ? 'rest' : 'work' } : x))}
                      className={cn('chip px-2 py-1.5 text-[9px]', p.kind === 'rest' && 'chip--on')}
                    >
                      {p.kind === 'rest' ? 'Rest' : 'Work'}
                    </button>
                    <button onClick={() => setPhases(phases.filter((_, j) => j !== i))}
                      className="text-flap-dim hover:text-signal-bright"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setPhases([...phases, { name: 'Phase', seconds: 30, kind: 'other' }])}
                className="chip px-3 py-1.5 text-[10px] mb-5"
                style={{ borderColor: 'rgba(242,233,207,0.2)', color: 'var(--color-flap-dim)', background: 'transparent' }}
              >
                + Add phase
              </button>

              <div className="flex items-center justify-between mb-6">
                <span className="engraved text-[10px]">Rounds</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setRounds(r => Math.max(1, r - 1))} className="w-8 h-8 rounded bg-board-3 text-flap-ink">−</button>
                  <span className="w-10 text-center font-display font-bold text-flap-ink text-lg">{rounds}</span>
                  <button onClick={() => setRounds(r => Math.min(20, r + 1))} className="w-8 h-8 rounded bg-board-3 text-flap-ink">+</button>
                </div>
              </div>

              <KeyButton variant="signal" className="w-full py-3.5 text-sm" onClick={saveCustom} disabled={!name.trim() || phases.length === 0}>
                Save route
              </KeyButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
