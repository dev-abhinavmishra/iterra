import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Focus, Minus, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, vibrate } from '../lib/utils';
import { saveSession } from '../lib/stats';
import { useCountdown, useWakeLock } from '../hooks/useTimer';
import { useViewport } from '../hooks/useViewport';
import { useSettings, updateSettings } from '../lib/settings';
import { FlipRow, FlipText, Board } from '../components/Flip';
import { RotaryDial } from '../components/RotaryDial';
import { KeyButton } from '../components/KeyButton';
import { stationChime, secondTick, flapLand } from '../lib/sound';
import { parseSyllabusLink, syllabusReturnUrl } from '../lib/deeplink';
import { boundCourseCode, inTerrain, openTerrain, recentCourses, queuedTimerControls, dequeueTimerControl, type RecentCourse } from '../lib/iterra-adapter';
import { placeActive } from '../../active';

const QUICK = [5, 10, 15, 25, 30, 45, 60, 90];
/* app-local mirror of the live session — the publish effect writes it,
   mount restores it, completion/reset clears it. shared.focus is the
   cross-app read; this key is the reload-survival restore point. */
const LIVE_SESSION_KEY = 'timer.session.live.v1';

function fmt(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function TimerView({ presetMinutes = 25, presetName, linkQuery = '', onFocusModeChange, active = true, onRequestView, onTakeover, takeoverMuted = false }: {
  presetMinutes?: number;
  presetName?: string;
  linkQuery?: string;                  // the place's hash query — deep links ride it
  onFocusModeChange?: (f: boolean) => void;
  active?: boolean;                    // false while another view is on screen
  onRequestView?: () => void;          // ask the shell to surface this view
  onTakeover?: (up: boolean) => void;  // report takeover up/down to the shell
  takeoverMuted?: boolean;             // another view's takeover owns the screen
}) {
  const cd = useCountdown();
  const settings = useSettings();
  const vp = useViewport();

  const [setMinutes, setSetMinutes] = useState(presetMinutes);
  const [label, setLabel] = useState<string | undefined>(presetName);
  const [intent, setIntent] = useState('');
  const [thenBreak, setThenBreak] = useState(0);
  const [isBreak, setIsBreak] = useState(false);
  const [focus, setFocus] = useState(false);
  const [ringIn, setRingIn] = useState(false); // edge ring draws itself once on focus entry
  const [customOpen, setCustomOpen] = useState(false);
  const [customMin, setCustomMin] = useState(25);
  const [done, setDone] = useState<null | 'focus' | 'break'>(null);
  const [keyFlash, setKeyFlash] = useState<string | null>(null);
  const [syllabus, setSyllabus] = useState<{ block?: string; returnUrl?: string; course?: string; from?: string; courseId?: string; commitmentId?: string } | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* UX-TRACKER #81 — recent courses: the terrain's session entities,
     newest-first, offered as bound 25m quick-starts */
  const [courseChips, setCourseChips] = useState<RecentCourse[]>([]);
  useEffect(() => {
    let live = true;
    void recentCourses().then((r) => { if (live) setCourseChips(r); });
    return () => { live = false; };
  }, []);

  /* UX-TRACKER #82 — the session's bound course as a dossier chip:
     '#/c/<code>' is the shell's dossier route, framed-terrain only */
  const [boundCode, setBoundCode] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void boundCourseCode(syllabus?.courseId, syllabus?.course).then((c) => { if (live) setBoundCode(c); });
    return () => { live = false; };
  }, [syllabus?.courseId, syllabus?.course]);

  const flashKey = (k: string) => { setKeyFlash(k); setTimeout(() => setKeyFlash(null), 160); };

  /* cancel a pending focus→break hand-off on unmount */
  useEffect(() => () => { if (chainTimer.current) clearTimeout(chainTimer.current); }, []);

  const hasTime = cd.totalMs > 0;
  const running = cd.running;
  const atTop = !running && !done && cd.remainingMs === cd.totalMs; // set-but-not-started → show the dial

  useWakeLock(running || focus);

  /* commons: publish the live focus session (WIRING §7 shared.focus).
     A running session carries endsAt — every frame computes its own
     second-accurate countdown without a republish. A PAUSED session
     stays visible ({paused, remainingSec}) — the ambient rail shows
     'paused · 12m' rather than the session vanishing. Null only when
     the timer is cleared or back at the top, never merely stopped. */
  const remainingSec = cd.secondsLeft;
  const paused = hasTime && !running && !done && cd.remainingMs < cd.totalMs;
  useEffect(() => {
    const doc = (window as any).iterra?.doc?.('shared');
    if (!doc) return;
    const base = {
      label: isBreak ? 'Break' : intent || label || 'Focus',
      blockId: syllabus?.block ?? null,
      course: syllabus?.course ?? null,
      totalMin: Math.round(cd.totalMs / 60000),
      break: isBreak || undefined,
    };
    const beat = () => {
      const v = running
        ? { ...base, running: true, endsAt: Date.now() + cd.remainingMs }
        : paused
          ? { ...base, paused: true, remainingSec }
          : null;
      doc.setField('focus', { v, by: 'timer', at: Date.now() });
      /* mirror the same doc app-locally so a reload/remount can re-arm the
         session — shared.focus is the cross-app read; this is the
         restore source of truth */
      try {
        if (v) localStorage.setItem(LIVE_SESSION_KEY, JSON.stringify({ ...v, intent, syllabus, thenBreak }));
        else localStorage.removeItem(LIVE_SESSION_KEY);
      } catch { /* storage full/blocked — restore just won't happen */ }
    };
    beat();
    /* a paused session never ticks — remainingMs is frozen, so without a
       heartbeat `at` ages out of the rail's 15-min freshness window and a
       genuinely live pause vanishes. Re-stamp while paused; a dead page
       stops beating and still expires on schedule. */
    if (!paused) return;
    const iv = setInterval(beat, 60000);
    return () => clearInterval(iv);
    /* deliberately NOT keyed on remainingMs/secondsLeft: a running session
       publishes endsAt once — frames compute the countdown locally and a
       per-tick republish would rewrite the shared doc 20x a second. A paused
       session freezes remainingMs, so the same value republishes unchanged.
       eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [running, paused, isBreak, label, intent, syllabus, cd.totalMs]);

  /* commons read: index.syllabus — when this session came in bound to a
     block, resolve the block's real title from the folio's entity index
     (WIRING §7 — the index is where per-entity lookups live) */
  const [blockTitle, setBlockTitle] = useState<string | null>(null);
  useEffect(() => {
    const blockId = syllabus?.block;
    if (!blockId) { setBlockTitle(null); return; }
    const iterra = (window as any).iterra;
    const read = () => {
      const ents: any[] = iterra?.index?.('syllabus') ?? [];
      const hit = ents.find((e) => e && e.id === blockId);
      setBlockTitle(hit?.title ?? null);
    };
    read();
    return iterra?.onIndex?.(read);
  }, [syllabus]);

  /* ---------- preset plumbing + inbound Syllabus deep link ----------
     The link is captured once per mount (TimerView remounts per preset key,
     so a later Presets pick gets a fresh parse with the params already
     stripped). It lives inside the plumbing effect so StrictMode's dev
     double-invoke re-applies the link rather than stomping it back to the
     preset — never clear pendingLink; this instance stays a link session. */
  const pendingLink = useRef(parseSyllabusLink(linkQuery));
  /* captured at render time — the publish effect's first beat clears the
     live key on an idle mount, so the restore must read it before any
     effect runs (same reason pendingLink is a ref) */
  const pendingLive = useRef<any>((() => {
    try { return JSON.parse(localStorage.getItem(LIVE_SESSION_KEY) || 'null'); } catch { return null; }
  })());
  useEffect(() => {
    const link = pendingLink.current;
    if (link) {
      setSetMinutes(link.minutes ?? presetMinutes);
      setLabel(link.course ?? presetName);
      setIsBreak(false);
      setDone(null);
      if (link.intent) setIntent(link.intent);
      /* the link fully describes the session it arms — no break param
         means no chained recess, not whatever the user last dialed */
      setThenBreak(link.thenBreak ?? 0);
      /* a returnUrl the file-back gate would reject stays out of state —
         otherwise it renders a dead 'file back' button */
      const returnUrl = link.returnUrl && syllabusReturnUrl(link, 1) ? link.returnUrl : undefined;
      setSyllabus({ block: link.block, returnUrl, course: link.course, from: link.from, courseId: link.courseId, commitmentId: link.commitmentId });
      /* strip the link params from the hash — a reload mid-session must
         hit the live-restore path, not re-arm the original link */
      const h = window.location.hash.replace(/\?[^#]*$/, '');
      window.history.replaceState({}, '', window.location.pathname + window.location.search + h);
      const ms = (link.minutes ?? presetMinutes) * 60000;
      cd.reset(ms);
      if (link.autostart) cd.start(ms, completeFocusLive);
      return;
    }
    /* reload survival — the publish effect mirrors the live session into
       timer.session.live.v1; re-arm it here so a mid-session reload (or a
       keep-alive remount) doesn't evaporate a running clock. A session
       whose endsAt already passed while dead is dropped — it wasn't
       observed, and stamping the full minutes would be fake. */
    {
      /* kept (not consumed) — StrictMode re-runs mount effects in dev, and
         re-applying an identical restore is harmless; the ref is fresh per
         mount anyway */
      const live = pendingLive.current;
      const resumeMs = live?.running ? (live.endsAt || 0) - Date.now()
        : live?.paused ? (live.remainingSec || 0) * 1000 : -1;
      if (live && resumeMs > 0) {
        setSetMinutes(Math.round((live.totalMin || 25)));
        setLabel(live.label ?? presetName);
        setIntent(live.intent || '');
        setIsBreak(!!live.break);
        setThenBreak(live.thenBreak || 0);
        setSyllabus(live.syllabus ?? null);
        const totalMs = (live.totalMin || 25) * 60000;
        if (live.running) {
          /* start() re-arms at ms as the total — restore the ORIGINAL total
             after so progress, paused-derivation and the completion log all
             stay honest about the session's real size */
          cd.start(resumeMs, live.break ? completeBreakLive : completeFocusLive);
          cd.setTotalMs(totalMs);
        } else {
          /* paused restores to the paused board: arm at the original total,
             then bank the saved remainder so paused === true */
          cd.reset(totalMs);
          cd.setRemainingMs(resumeMs);
        }
        return;
      }
      if (live) { try { localStorage.removeItem(LIVE_SESSION_KEY); } catch { /* ignore */ } }
    }
    setSetMinutes(presetMinutes);
    setLabel(presetName);
    setIsBreak(false);
    setDone(null);
    cd.reset(presetMinutes * 60000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetMinutes, presetName]);

  /* the focus session's elapsed minutes, captured at completion — after a
     chained recess, cd holds the BREAK countdown and would misreport the
     filed time */
  const filedActual = useRef<number | null>(null);

  const fileBackToSyllabus = () => {
    if (!syllabus) return;
    const actual = filedActual.current ?? Math.round((cd.totalMs - cd.remainingMs) / 60000);
    const url = syllabusReturnUrl(syllabus, actual);
    if (!url) return;
    const iterra = (window as any).iterra;
    iterra?.feed?.({ text: `filed ${actual}m into ${blockTitle ?? syllabus.block ?? 'block'}`, url, course: syllabus.course });
    // inside the terrain, file-back routes through the shell — the folio
    // wakes with ?completedBlock instead of this page walking away
    if (iterra?.isFramed?.()) iterra.open(url);
    else window.location.href = url;
    // the binding is spent — clear it with the session so a hidden framed
    // mount doesn't keep offering file-back (a second tap double-stamps)
    setDone(null);
    resetTimer();
  };

  /* ---------- title bar ---------- */
  // a hidden running countdown must not stomp a takeover's title (e.g. the
  // ● ALARM label) — muted while another view's takeover owns the screen
  const mutedRef = useRef(false);
  mutedRef.current = takeoverMuted;
  useEffect(() => {
    if (!takeoverMuted) {
      if (running) document.title = `${fmt(cd.secondsLeft)} — ${isBreak ? 'Break' : (label || 'Focus')}`;
      else document.title = 'Timer — Time Instruments';
    }
    return () => { if (!mutedRef.current) document.title = 'Timer — Time Instruments'; };
  }, [running, cd.secondsLeft, label, isBreak, takeoverMuted]);

  /* ---------- per-second tick (only while this view is on screen; the
     final three beats + chime still announce from a hidden view) ---------- */
  const lastSec = useRef(0);
  useEffect(() => {
    if (running && cd.secondsLeft !== lastSec.current) {
      lastSec.current = cd.secondsLeft;
      if (cd.secondsLeft <= 3 && cd.secondsLeft > 0) flapLand(0.12); // final beats hit harder
      else if (active) secondTick();
    }
  }, [cd.secondsLeft, running, active]);

  /* ---------- AFK → focus mode ---------- */
  const enterFocus = (v: boolean) => {
    setFocus(v); onFocusModeChange?.(v);
    // next frame: dasharray grows 0→len so the ring wipes once around the
    // edge on entry, then keeps draining with the countdown
    if (v) { setRingIn(false); setTimeout(() => setRingIn(true), 70); }
  };
  useEffect(() => {
    // AFK only arms while this view is on screen — a hidden timer must not
    // steal the app into focus mode where nothing can be seen or undone
    if (!active) {
      if (idle.current) { clearTimeout(idle.current); idle.current = null; }
      return;
    }
    const wake = () => {
      enterFocus(false);
      if (idle.current) clearTimeout(idle.current);
      if (running) idle.current = setTimeout(() => enterFocus(true), 10000);
    };
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('mousemove', wake, opts);
    window.addEventListener('keydown', wake, opts);
    window.addEventListener('pointerdown', wake, opts);
    window.addEventListener('wheel', wake, opts);
    // Arm the AFK timer on (re)run, but don't exit focus here — that only
    // happens on real user input (running flips mid-takeover otherwise).
    if (idle.current) clearTimeout(idle.current);
    if (running) idle.current = setTimeout(() => enterFocus(true), 10000);
    return () => {
      ['mousemove', 'keydown', 'pointerdown', 'wheel'].forEach(e => window.removeEventListener(e, wake));
      if (idle.current) clearTimeout(idle.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, active]);

  /* the completion takeover pulls the app back to this board if it fires
     while another view is up — a chime with nobody watching is a missed call.
     The takeover itself is reported up/down so the shell can keep only one
     on screen; a competing takeover wins and this one waits for a manual visit */
  useEffect(() => {
    if (done && !active) onRequestView?.();
  }, [done, active, onRequestView]);
  useEffect(() => {
    onTakeover?.(!!done);
  }, [done, onTakeover]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    if (!active) return; // keys belong to whichever view is on screen
    const onKey = (e: KeyboardEvent) => {
      if (!placeActive("timer")) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (done) {
        // the completion takeover owns the keys — no ghost restarts underneath
        if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); setDone(null); resetTimer(); }
        else if (e.key === 'r' || e.key === 'R') resetTimer();
        /* Escape dismisses to the dial too — dismissing but leaving the
           countdown parked at 00:00 stranded the board on a dead 'run' panel */
        else if (e.key === 'Escape') resetTimer();
        return;
      }
      if (e.code === 'Space') { e.preventDefault(); flashKey('toggle'); toggle(); }
      else if (e.key === 'r' || e.key === 'R') { flashKey('reset'); resetTimer(); }
      else if (e.key === 'f' || e.key === 'F') { if (running) { flashKey('focus'); enterFocus(true); } }
      else if (e.key === 'Escape') { enterFocus(false); setCustomOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const completeFocus = () => {
    vibrate([120, 80, 120, 80, 300]);
    stationChime();
    const recess = isBreak || /recess|break|rest/i.test(label ?? secLabel(cd.totalMs / 1000));
    saveSession({
      duration: cd.totalMs / 1000,
      type: recess ? 'break' : 'focus',
      label: intent || undefined,
      preset: label,
      course: syllabus?.course,
      courseId: syllabus?.courseId,
      commitmentId: syllabus?.commitmentId,
    });
    if (!recess) filedActual.current = Math.round((cd.totalMs - cd.remainingMs) / 60000);
    /* standalone complete → 'completed Nm' stir; a session bound for
       file-back emits only its 'filed Xm' (the file-back IS its stir) */
    const willFileBack = !!(syllabus?.block && syllabus?.returnUrl);
    if (!recess && !willFileBack) (window as any).iterra?.feed?.({ text: `completed ${Math.round(cd.totalMs / 60000)}m ${label || 'focus'}`, course: syllabus?.course });
    if (!isBreak && thenBreak > 0) {
      setDone('focus');
      if (chainTimer.current) clearTimeout(chainTimer.current);
      chainTimer.current = setTimeout(() => {
        chainTimer.current = null;
        setDone(null);
        setIsBreak(true);
        cd.start(thenBreak * 60000, completeBreakLive);
      }, 2600);
    } else {
      setDone(isBreak ? 'break' : 'focus');
    }
  };
  const completeBreak = () => {
    vibrate([80, 60, 80]);
    stationChime();
    saveSession({ duration: thenBreak * 60, type: 'break', label: 'Recess' });
    setDone('break');
  };

  /* the countdown stores its onComplete for up to an hour while label /
     intent / cd.totalMs keep re-rendering — wrappers read a ref at call
     time so the LIVE closure always runs (autostarted links relied on a
     pre-setLabel closure and misreported the session as recess) */
  const latestFocus = useRef<() => void>(() => {});
  const latestBreak = useRef<() => void>(() => {});
  useEffect(() => {
    latestFocus.current = completeFocus;
    latestBreak.current = completeBreak;
  });
  const completeFocusLive = () => latestFocus.current();
  const completeBreakLive = () => latestBreak.current();

  const toggle = () => {
    vibrate(running ? 35 : 55);
    if (running) cd.pause();
    else if (hasTime && cd.remainingMs > 0) cd.resume(isBreak ? completeBreakLive : completeFocusLive);
    else cd.start(setMinutes * 60000, completeFocusLive);
  };

  /* the deep-link / intake / chip binding is ONE-SHOT — it belongs to the
     session it armed. Consume it when that session is finished, reset,
     re-dialed, dismissed, or filed back; otherwise blockId / course /
     commitmentId / returnUrl leak into whatever the user starts next
     (a phantom bound chip, '← syllabus' return, a double file-back). */
  const clearBinding = () => {
    if (!syllabus) return;
    setSyllabus(null);
    setIntent('');
    setLabel(presetName);
    filedActual.current = null;
  };

  const resetTimer = () => {
    vibrate([25, 40, 25]);
    if (chainTimer.current) { clearTimeout(chainTimer.current); chainTimer.current = null; }
    clearBinding();
    cd.reset(setMinutes * 60000);
    setIsBreak(false);
    setDone(null);
  };

  /* UX-TRACKER #81 — a recent-course chip starts a bound 25m focus: the
     same binding a 'timer.start' intake carries (label + course +
     courseId), autostarted like the deep link it builds */
  const startCourse = (c: RecentCourse) => {
    flapLand(0.05);
    setSetMinutes(25);
    setLabel(c.course);
    setIntent('');
    setSyllabus({ course: c.course, courseId: c.courseId, from: 'terrain' });
    setIsBreak(false);
    setDone(null);
    cd.start(25 * 60000, completeFocusLive);
  };

  /* finish early: log only the minutes actually run — completeFocus
     would stamp the full preset duration and lie about the session */
  const finishEarly = () => {
    const elapsedSec = Math.round((cd.totalMs - cd.remainingMs) / 1000);
    if (elapsedSec >= 60) {
      saveSession({
        duration: elapsedSec,
        type: isBreak ? 'break' : 'focus',
        label: intent || undefined,
        preset: label,
        course: syllabus?.course,
        courseId: syllabus?.courseId,
        commitmentId: syllabus?.commitmentId,
      });
    }
    resetTimer();
  };

  /* the ambient rail steers this session from anywhere in the terrain:
     adapter intake 'timer.control' re-dispatches {op} here. pause /
     resume run the same code path as the Space key; finish logs the
     elapsed minutes then clears (a sub-minute session just clears). */
  /* returns whether the op actually applied — an op arriving before the
     countdown is armed stays queued so the drain retries it when state
     catches up (the ?intake= landing race) */
  const applyOp = (op: string): boolean => {
    const jot = (type: 'session.paused' | 'session.resumed') => {
      const it = (window as any).iterra;
      try {
        it?.events?.emit?.(type, {
          label: label ?? undefined, courseId: syllabus?.courseId ?? undefined,
          course: syllabus?.course ?? undefined, remainingSec: Math.round(cd.remainingMs / 1000),
        });
      } catch { /* journal best-effort */ }
    };
    if (op === 'pause' && running) { cd.pause(); jot('session.paused'); return true; }
    if (op === 'resume' && !running && hasTime && cd.remainingMs > 0) {
      cd.resume(isBreak ? completeBreakLive : completeFocusLive);
      jot('session.resumed');
      return true;
    }
    if (op === 'finish' && hasTime) { finishEarly(); return true; }
    return false;
  };

  useEffect(() => {
    const onCtl = (e: Event) => {
      const op = (e as CustomEvent<{ op?: string }>).detail?.op;
      if (!op) return;
      /* applied → consume the queued copy so the drain can't re-run it;
         not applicable yet → leave queued for the drain below */
      if (applyOp(op)) {
        const entry = queuedTimerControls().find((x) => x.op === op);
        if (entry) dequeueTimerControl(entry);
      }
    };
    window.addEventListener('timer:control', onCtl);
    return () => window.removeEventListener('timer:control', onCtl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, hasTime, isBreak, cd.remainingMs]);

  /* drain ops that arrived while this view wasn't listening — each fires
     once its state precondition holds (running flips true after the link
     consume re-arms the countdown); stale ops >30s drop — a steering op
     that old no longer means anything */
  useEffect(() => {
    const now = Date.now();
    for (const entry of queuedTimerControls()) {
      if (now - entry.at > 30000) { dequeueTimerControl(entry); continue; }
      const applicable =
        (entry.op === 'pause' && running) ||
        (entry.op === 'resume' && !running && hasTime && cd.remainingMs > 0) ||
        (entry.op === 'finish' && hasTime);
      if (applicable && applyOp(entry.op)) dequeueTimerControl(entry);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, hasTime, isBreak, cd.remainingMs]);

  const applyMinutes = (m: number) => {
    /* re-dialing abandons the one-shot binding — the new minutes were
       chosen by the user, not the link that armed them */
    clearBinding();
    setSetMinutes(m);
    setLabel(undefined);
    if (!running) { cd.reset(m * 60000); setIsBreak(false); setDone(null); }
  };

  const secLabel = (secs: number) => {
    if (isBreak) return 'Recess';
    if (label) return label;
    const m = secs / 60;
    if (m <= 5) return 'Short Recess';
    if (m <= 15) return 'Long Recess';
    if (m <= 25) return 'Deep Work';
    return 'Extended Focus';
  };

  const dispSec = hasTime ? cd.secondsLeft : setMinutes * 60;
  const dispStr = fmt(dispSec);
  const flipSize = Math.max(64, Math.min(150, Math.round(vp.w / (dispStr.length === 5 ? 7.2 : 8))));
  /* the dial is a 60-minute knob but quick chips go to 90 and custom to
     180 — grow its scale in 30m steps so a >60m set doesn't paint every
     tick lit behind a bezel engraved '60' */
  const dialMax = Math.min(180, Math.max(60, Math.ceil(setMinutes / 30) * 30));

  /* ======================= RENDER ======================= */
  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center px-4 md:px-8 py-6 relative">
      {/* ---------- MAIN LAYOUT ---------- */}
      <section className="w-full max-w-6xl flex flex-col lg:flex-row items-center lg:items-start justify-center gap-8 lg:gap-14">

        {/* THE BOARD */}
        <motion.div layout className="w-full max-w-2xl">
          <Board
            screws
            label={isBreak ? 'RECESS' : secLabel(dispSec)}
            right={
              <div className="flex items-center gap-3">
                {running && (
                  <span className="flex items-center gap-1.5">
                    <motion.i
                      animate={{ opacity: [1, 0.15, 1] }}
                      transition={{ duration: 1.6, repeat: Infinity }}
                      className="block w-2 h-2 rounded-full bg-signal not-italic"
                      style={{ background: 'var(--color-signal)' }}
                    />
                    <span className="engraved text-[10px] md:text-xs" style={{ color: 'var(--color-signal-bright)' }}>On time</span>
                  </span>
                )}
                <button
                  onClick={() => updateSettings({ sound: !settings.sound })}
                  className="text-flap-dim hover:text-flap-ink transition-colors"
                  title={settings.sound ? 'Sound on' : 'Sound off'}
                >
                  {settings.sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </button>
              </div>
            }
          >
            <div className="flex items-center justify-center py-2">
              <FlipRow text={dispStr} size={flipSize} live={running} accent={isBreak} />
            </div>
            {/* progress tape along the board floor — glides between second ticks */}
            <div className="mt-4 h-[3px] rounded-full" style={{ background: 'rgba(242,233,207,0.08)' }}>
              <div
                className="h-full rounded-full origin-left"
                style={{ background: 'var(--color-signal-bright)', transform: `scaleX(${hasTime ? cd.progress : 0})`, transition: 'transform 0.3s linear' }}
              />
            </div>
            <div className="mt-3 flex justify-between items-baseline px-0.5">
              <span className="engraved text-[9px] md:text-[10px]">
                {intent ? intent.toUpperCase() : 'TIMER TIMEKEEPING'}
                {blockTitle && <span className="block">{`BLOCK ${blockTitle.toUpperCase()}`}</span>}
                {/* '← terrain' is a shell hash route — standalone it can
                    only spawn a dead timer tab, so it stays terrain-only.
                    App-sourced links ('← syllabus') still work standalone:
                    iterra.open drops them onto /apps/<from>/ in a tab. */}
                {syllabus?.from && (inTerrain() || syllabus.from !== 'terrain') && (
                  <button
                    className="block text-left uppercase tracking-inherit opacity-70 hover:opacity-100 transition-opacity"
                    title={`Bound from ${syllabus.from} — return there`}
                    onClick={() =>
                      (window as any).iterra?.open?.(
                        syllabus.from === 'terrain'
                          ? (syllabus.course ? `#/c/${encodeURIComponent(syllabus.course)}` : '#/')
                          : `/apps/${syllabus.from}/`,
                      )
                    }
                  >{`← ${syllabus.from}`}</button>
                )}
              </span>
              <span className="engraved text-[9px] md:text-[10px]">
                {hasTime ? `${Math.round(cd.progress * 100)}% ELAPSED` : `SET FOR ${fmt(setMinutes * 60)}`}
              </span>
            </div>
          </Board>

          {/* transport */}
          <div className="mt-8 flex items-center justify-center gap-5">
            <KeyButton onClick={resetTimer} title="Reset (R)" className={cn('w-16 h-16 !rounded-full', keyFlash === 'reset' && 'key--pressed')} haptic={0}>
              <RotateCcw size={22} />
            </KeyButton>
            <KeyButton
              onClick={toggle}
              variant="signal"
              className={cn('w-24 h-24 !rounded-full', keyFlash === 'toggle' && 'key--pressed')}
              title="Start / Pause (Space)"
            >
              {running ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" className="ml-1.5" />}
            </KeyButton>
            <KeyButton
              onClick={() => enterFocus(!focus)}
              disabled={!running && !focus}
              title="Focus mode (F)"
              className={cn('w-16 h-16 !rounded-full', keyFlash === 'focus' && 'key--pressed')}
            >
              <Focus size={22} />
            </KeyButton>
          </div>
          <div className="mt-4 flex items-center justify-center gap-6 label-wall text-[10px]">
            <span>Space — run/pause</span><span>R — reset</span><span>F — focus</span>
          </div>
        </motion.div>

        {/* RIGHT RAIL */}
        <div className="w-full max-w-sm flex flex-col gap-7">
          <AnimatePresence mode="wait">
            {atTop ? (
              <motion.div
                key="set"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center gap-6"
              >
                <RotaryDial minutes={setMinutes} onChange={applyMinutes} size={250} max={dialMax} disabled={running}>
                  <div className="flex flex-col items-center">
                    <FlipRow text={fmt(setMinutes * 60)} size={46} sound={false} />
                    <span className="label-wall text-[9px] mt-1">Turn to set</span>
                  </div>
                </RotaryDial>

                <div className="flex flex-wrap justify-center gap-2">
                  {QUICK.map(m => (
                    <button
                      key={m}
                      onClick={() => { flapLand(0.05); applyMinutes(m); }}
                      className={cn('chip px-3 py-1.5 text-[11px]', setMinutes === m && !label && 'chip--on')}
                    >
                      {m}
                    </button>
                  ))}
                  <button onClick={() => setCustomOpen(true)} className="chip px-3 py-1.5 text-[11px]">Other</button>
                </div>

                {/* UX-TRACKER #81 — recent courses as bound 25m starts */}
                {courseChips.length > 0 && (
                  <div className="w-full">
                    <div className="label-wall text-[9px] mb-1.5 text-center">Recent courses — bound 25m</div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {courseChips.map((c) => (
                        <button
                          key={c.courseId ?? c.course}
                          onClick={() => startCourse(c)}
                          className="chip px-3 py-1.5 text-[11px]"
                          title={`25m bound to ${c.course}`}
                        >
                          {c.course}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="w-full">
                  <input
                    name="timer-intent"
                    value={intent}
                    onChange={e => setIntent(e.target.value)}
                    placeholder="Working on… (optional)"
                    className="w-full bg-transparent border-b border-rule px-1 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-ink transition-colors font-body"
                  />
                </div>

                <div className="w-full flex items-center justify-between">
                  <span className="label-wall text-[10px]">Then break</span>
                  <div className="flex gap-1.5">
                    {[0, 5, 15].map(b => (
                      <button
                        key={b}
                        onClick={() => { vibrate(15); setThenBreak(b); }}
                        className={cn('chip px-2.5 py-1 text-[10px]', thenBreak === b && 'chip--on')}
                      >
                        {b === 0 ? 'Off' : `${b}m`}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="run"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
                className="panel-wall p-6 flex flex-col gap-5"
              >
                <div>
                  <div className="label-wall text-[10px] mb-1">Session</div>
                  <div className="font-display text-2xl font-bold text-ink leading-none uppercase">{secLabel(dispSec)}</div>
                  {intent && <div className="text-sm text-ink-soft mt-1 font-body">{intent}</div>}
                </div>
                {/* UX-TRACKER #82 — bound course → the shell dossier */}
                {boundCode && inTerrain() && (
                  <div className="flex justify-between text-sm">
                    <span className="text-ink-soft font-body">Bound</span>
                    <button
                      className="font-display font-semibold uppercase hover:underline"
                      style={{ color: 'var(--color-signal)' }}
                      onClick={() => openTerrain(`#/c/${encodeURIComponent(boundCode)}`)}
                    >
                      {boundCode} dossier →
                    </button>
                  </div>
                )}
                <hr className="rule-h" />
                <div className="flex justify-between text-sm">
                  <span className="text-ink-soft font-body">Elapsed</span>
                  <span className="font-display font-semibold text-ink">{fmt(Math.floor((cd.totalMs - cd.remainingMs) / 1000))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-soft font-body">Set for</span>
                  <span className="font-display font-semibold text-ink">{fmt(Math.round(cd.totalMs / 1000))}</span>
                </div>
                {thenBreak > 0 && !isBreak && (
                  <div className="flex justify-between text-sm">
                    <span className="text-ink-soft font-body">After this</span>
                    <span className="font-display font-semibold text-ink">{thenBreak}m recess</span>
                  </div>
                )}
                {isBreak && (
                  <div className="flex justify-between text-sm">
                    <span className="text-ink-soft font-body">Phase</span>
                    <span className="font-display font-semibold" style={{ color: 'var(--color-signal)' }}>Recess</span>
                  </div>
                )}
                <hr className="rule-h" />
                <p className="text-[11px] text-ink-faint font-body leading-relaxed">
                  Step away and the board takes over — focus mode fills the screen after 10 seconds idle.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ---------- FOCUS MODE ---------- */}
      <AnimatePresence>
        {focus && (
          <motion.div
            key="focus"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(180deg, #16130B 0%, #0F0C06 100%)' }}
          >
            {/* slow ambient breathing */}
            <motion.div
              animate={{ opacity: [0.05, 0.14, 0.05] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(60% 45% at 50% 42%, var(--color-signal), transparent 70%)', opacity: 0.08 }}
            />
            {/* edge progress ring — remaining time drains clockwise around
                the screen edge (the original focus frame). On entry it wipes
                once around the border; after that the dasharray transition
                glides the drain between second ticks instead of stepping. */}
            {(() => {
              const inset = 13;
              const w = Math.max(0, vp.w - inset * 2);
              const h = Math.max(0, vp.h - inset * 2);
              const r = 10;
              const P = 2 * (w + h) - 8 * r + 2 * Math.PI * r;
              const frac = hasTime ? Math.min(1, Math.max(0, cd.progress)) : 0;
              const len = (1 - frac) * P;
              const dash = ringIn ? `${len} ${P}` : `0 ${P}`;
              return (
                <motion.svg
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, delay: 0.15 }}
                  className="absolute inset-0 pointer-events-none"
                  width={vp.w}
                  height={vp.h}
                >
                  <rect x={inset} y={inset} width={w} height={h} rx={r}
                    fill="none" stroke="rgba(242,233,207,0.09)" strokeWidth={2} />
                  <rect x={inset} y={inset} width={w} height={h} rx={r}
                    fill="none" stroke="var(--color-signal-bright)" strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeDasharray={dash}
                    style={{ transition: 'stroke-dasharray 1s linear', filter: 'drop-shadow(0 0 6px var(--color-signal))' }}
                  />
                </motion.svg>
              );
            })()}
            <motion.div
              initial={{ scale: 0.94, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 20 }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              className="w-full px-6 flex flex-col items-center"
            >
              <FlipRow
                text={dispStr}
                size={Math.min(220, Math.round(vp.w / (dispStr.length === 5 ? 6.4 : 7.2)))}
                live={running}
                accent={isBreak}
              />
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.4, duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
                className="w-full max-w-4xl mt-12 md:mt-16 h-[3px] origin-left"
                style={{ background: 'rgba(242,233,207,0.12)' }}
              >
                <div className="h-full origin-left" style={{ background: 'var(--color-signal-bright)', transform: `scaleX(${hasTime ? cd.progress : 0})`, transition: 'transform 0.2s linear' }} />
              </motion.div>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.55 }}
                transition={{ delay: 0.7 }}
                className="engraved text-xs md:text-sm mt-8"
                style={{ letterSpacing: '0.5em' }}
              >
                {isBreak ? 'RECESS' : 'BOARD ACTIVE — FOCUS'}
              </motion.span>
              {intent && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.35 }}
                  transition={{ delay: 0.9 }}
                  className="engraved text-[10px] mt-3"
                >
                  {intent.toUpperCase()}
                </motion.span>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- CUSTOM DURATION ---------- */}
      <AnimatePresence>
        {customOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-center justify-center p-4"
            style={{ background: 'rgba(15,12,6,0.7)', backdropFilter: 'blur(6px)' }}
            onClick={() => setCustomOpen(false)}
          >
            <motion.div
              initial={{ y: 40, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="board board-screws p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <span className="engraved text-xs">Set duration</span>
                <button onClick={() => setCustomOpen(false)} className="text-flap-dim hover:text-flap-ink" aria-label="Close" title="Close"><X size={18} /></button>
              </div>
              <div className="flex items-center justify-center gap-4 mb-6">
                <KeyButton className="w-11 h-11 !rounded-lg" onClick={() => setCustomMin(m => Math.max(1, m - 1))} title="One minute less"><Minus size={16} /></KeyButton>
                <FlipRow text={String(customMin).padStart(2, '0')} size={64} sound={false} />
                <span className="engraved text-xs">MIN</span>
                <KeyButton className="w-11 h-11 !rounded-lg" onClick={() => setCustomMin(m => Math.min(180, m + 1))} title="One minute more"><Plus size={16} /></KeyButton>
              </div>
              <input
                name="custom-minutes"
                type="range" min={1} max={180} value={customMin}
                onChange={e => setCustomMin(parseInt(e.target.value))}
                className="rng w-full mb-6"
              />
              <KeyButton variant="signal" className="w-full py-3.5 text-sm" onClick={() => { applyMinutes(customMin); setCustomOpen(false); }}>
                Set timer
              </KeyButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- COMPLETION TAKEOVER ---------- */}
      <AnimatePresence>
        {done && (
          <motion.div
            key="done"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-[300] flex flex-col items-center justify-center overflow-hidden"
            style={{ background: 'linear-gradient(180deg, #16130B 0%, #0F0C06 100%)' }}
          >
            {/* punched-ticket confetti */}
            {Array.from({ length: 40 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ x: 0, y: '-10vh', rotate: 0, opacity: 1 }}
                animate={{
                  x: (Math.random() - 0.5) * vp.w * 0.9,
                  y: vp.h * (0.55 + Math.random() * 0.5),
                  rotate: (Math.random() - 0.5) * 720,
                  opacity: [1, 1, 0],
                }}
                transition={{ duration: 1.6 + Math.random() * 1.4, delay: Math.random() * 0.4, ease: [0.15, 0.6, 0.4, 1] }}
                className="absolute top-1/4 w-2.5 h-4 pointer-events-none"
                style={{
                  left: '50%',
                  background: i % 5 === 0 ? 'var(--color-signal-bright)' : i % 3 === 0 ? 'var(--color-brass-hi)' : '#D9CFB2',
                  borderRadius: 1.5,
                  boxShadow: '0 0 0 1px rgba(15,12,6,0.4)',
                }}
              />
            ))}

            <motion.div
              initial={{ scale: 0.9, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 160, damping: 18, delay: 0.15 }}
              className="flex flex-col items-center gap-10 z-10 px-6"
            >
              <FlipText text={done === 'break' ? 'RECESS OVER' : 'SESSION COMPLETE'} size={Math.min(72, vp.w / 16)} accent={false} />
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 0.6, y: 0 }}
                transition={{ delay: 0.9 }}
                className="engraved text-sm md:text-base text-center"
                style={{ letterSpacing: '0.4em' }}
              >
                {done === 'break' ? 'BOARD READY — NEXT DEPARTURE AWAITS' : thenBreak > 0 ? `RECESS ${thenBreak}M BOARDING` : 'TIME WELL KEPT'}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1 }}
                className="flex gap-4"
              >
                <KeyButton variant="signal" className="px-10 py-4 text-sm" onClick={() => { setDone(null); resetTimer(); }}>
                  Continue
                </KeyButton>
                {(done === 'focus' || done === 'break') && syllabus?.block && syllabus?.returnUrl && (
                  <KeyButton className="px-10 py-4 text-sm" onClick={fileBackToSyllabus} title="Return to Syllabus and file this time">
                    File back → Syllabus
                  </KeyButton>
                )}
              </motion.div>
            </motion.div>

            {/* expanding rings */}
            {[0, 0.35, 0.7].map((d, i) => (
              <motion.div
                key={i}
                animate={{ scale: [1, 2.6], opacity: [0.35, 0] }}
                transition={{ duration: 2.2, delay: d, repeat: Infinity, ease: 'easeOut' }}
                className="absolute w-56 h-56 rounded-full border-2 pointer-events-none"
                style={{ borderColor: 'var(--color-signal)' }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
