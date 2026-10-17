import { useEffect, useRef, useState } from 'react';

/* Drift-free countdown: anchored to timestamps, ticks at ~10Hz for smooth
   progress but renders at 1Hz-equivalent precision for the flap display. */
export function useCountdown() {
  const [totalMs, setTotalMs] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [running, setRunning] = useState(false);
  const endAt = useRef(0);
  const onDone = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      const left = Math.max(0, endAt.current - Date.now());
      setRemainingMs(left);
      if (left <= 0) {
        setRunning(false);
        onDone.current?.();
      }
    }, 50);
    return () => clearInterval(iv);
  }, [running]);

  const start = (ms: number, done?: () => void) => {
    endAt.current = Date.now() + ms;
    setTotalMs(ms);
    setRemainingMs(ms);
    onDone.current = done ?? null;
    setRunning(true);
  };
  /* bank the exact remaining time on pause — freezing the last tick's value
     would silently shave up to a 50ms tick interval off every pause/resume */
  const pause = () => { setRemainingMs(Math.max(0, endAt.current - Date.now())); setRunning(false); };
  const resume = (done?: () => void) => {
    endAt.current = Date.now() + remainingMs;
    if (done) onDone.current = done;
    setRunning(true);
  };
  const stop = () => { setRunning(false); };
  const reset = (ms: number) => {
    setRunning(false);
    setTotalMs(ms);
    setRemainingMs(ms);
  };

  const progress = totalMs > 0 ? 1 - remainingMs / totalMs : 0;
  const secondsLeft = Math.ceil(remainingMs / 1000);
  return { totalMs, remainingMs, secondsLeft, running, progress, start, pause, resume, stop, reset, setRemainingMs, setTotalMs };
}

/* rAF-driven stopwatch — millisecond smooth, anchored to timestamps. */
export function useStopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startAt = useRef(0);
  const banked = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      setElapsed(banked.current + (performance.now() - startAt.current));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [running]);

  /* startAt is stamped in start() (not the effect) so a pause landing before
     the first frame can't bank elapsed against a stale anchor */
  const start = () => { if (!running) { startAt.current = performance.now(); setRunning(true); } };
  /* bank the true elapsed at pause-time, not the last rendered frame —
     that frame is up to ~16ms stale and every pause/resume lost it */
  const pause = () => {
    if (running) { banked.current += performance.now() - startAt.current; setElapsed(banked.current); }
    setRunning(false);
  };
  const reset = () => { setRunning(false); banked.current = 0; setElapsed(0); };

  return { elapsed, running, start, pause, reset };
}

/* Ticking clock — seconds precision. */
export function useNow(stepMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), stepMs);
    return () => clearInterval(iv);
  }, [stepMs]);
  return now;
}

/* Best-effort screen wake lock while a timer runs. */
export function useWakeLock(active: boolean) {
  const lock = useRef<any>(null);
  useEffect(() => {
    let live = true;
    const acquire = async () => {
      try {
        if (live && active && 'wakeLock' in navigator && !lock.current) {
          lock.current = await (navigator as any).wakeLock.request('screen');
        }
      } catch { /* unsupported or denied — fine */ }
    };
    acquire();
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVis);
      // release whatever this effect acquired — re-run or unmount alike
      if (lock.current) { try { lock.current.release(); } catch {} lock.current = null; }
    };
  }, [active]);
}

/* Interval/routine runner — phases with names + durations, repeated N rounds. */
export interface Phase { name: string; seconds: number; kind: 'work' | 'rest' | 'other' }
export interface Routine { id: string; name: string; phases: Phase[]; rounds: number }

export function useRoutineRunner() {
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [round, setRound] = useState(1);
  const [remainingMs, setRemainingMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const endAt = useRef(0);
  const raf = useRef(0);

  const phase: Phase | null = routine ? routine.phases[phaseIdx] : null;

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const left = Math.max(0, endAt.current - Date.now());
      setRemainingMs(left);
      if (left <= 0) {
        advance();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phaseIdx, round, routine]);

  const advance = () => {
    if (!routine) return;
    const now = Date.now();
    let p = phaseIdx;
    let r = round;
    let end = endAt.current;
    // chain from the phase that just ended — in a throttled tab several
    // phases may have elapsed; skip straight to the one still in the future
    for (let i = 0; i < routine.phases.length * routine.rounds + 1; i++) {
      p += 1;
      if (p >= routine.phases.length) { p = 0; r += 1; }
      if (r > routine.rounds) {
        setRunning(false);
        setFinished(true);
        setRemainingMs(0);
        return;
      }
      end += routine.phases[p].seconds * 1000;
      if (end > now) break;
    }
    const next = routine.phases[p];
    if (!next) { setRunning(false); setFinished(true); setRemainingMs(0); return; }
    setPhaseIdx(p);
    setRound(r);
    endAt.current = end;
    setRemainingMs(Math.max(0, end - now));
  };

  const start = (r: Routine) => {
    setRoutine(r);
    setPhaseIdx(0);
    setRound(1);
    setFinished(false);
    const first = r.phases[0];
    endAt.current = Date.now() + first.seconds * 1000;
    setRemainingMs(first.seconds * 1000);
    setRunning(true);
  };
  /* bank the exact remaining time on pause — same shave-the-tick fix as
     the countdown (rAF leaves the last frame up to ~16ms stale) */
  const pause = () => { if (running) setRemainingMs(Math.max(0, endAt.current - Date.now())); setRunning(false); };
  /* a finished run must not resume — remainingMs is 0 and the routine is
     over; keys land on this path from the ROUTE COMPLETE screen */
  const resume = () => {
    if (!routine || finished) return;
    endAt.current = Date.now() + remainingMs;
    setRunning(true);
  };
  const quit = () => { setRunning(false); setRoutine(null); setFinished(false); };

  const isLastLeg = routine ? (round >= routine.rounds && phaseIdx >= routine.phases.length - 1) : false;
  const nextPhase = routine && !isLastLeg ? routine.phases[(phaseIdx + 1) % routine.phases.length] : null;
  return { routine, phase, phaseIdx, round, remainingMs, running, finished, nextPhase, start, pause, resume, quit };
}
