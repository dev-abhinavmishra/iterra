import { useState, useEffect } from 'react';
import { Timer, Activity, CheckCircle2, Clock, Flame, Download, Coffee, TimerReset, Trash2, PenLine } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { vibrate } from '../lib/utils';
import { getStats, getSessions, sessionsCsv, deleteSession, Session } from '../lib/stats';
import { boundCourseCode, inTerrain, openTerrain } from '../lib/iterra-adapter';
import { execCommand } from '../../../integration/commands';

export default function StatsView({ active = true }: { active?: boolean }) {
  const [stats, setStats] = useState(() => getStats());
  const [showAll, setShowAll] = useState(false);
  /* two-tap delete — one accidental click can't lose a logged session */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  /* manual entry — studied off-timer shouldn't be lost from the ledger */
  const [logOpen, setLogOpen] = useState(false);
  const [logLabel, setLogLabel] = useState('');
  const [logMinutes, setLogMinutes] = useState('25');
  const [logBusy, setLogBusy] = useState(false);

  // keep-alive shell: re-read the ledger every time this view is shown —
  // sessions logged while it was hidden must appear on the next visit
  useEffect(() => { if (active) setStats(getStats()); }, [active]);

  const fmtDur = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };
  const fmtTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
    new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  const exportCsv = () => {
    vibrate(25);
    const blob = new Blob([sessionsCsv(getSessions())], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'timer-sessions.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayIdx = (new Date().getDay() + 6) % 7;
  const labels = Array.from({ length: 7 }, (_, i) => days[(todayIdx - 6 + i + 7) % 7]);

  const typeMeta = (s: Session) =>
    s.type === 'focus' ? { icon: Timer, name: s.label || 'Focus session', tag: 'Complete' }
    : s.type === 'interval' ? { icon: TimerReset, name: s.preset ? `${s.preset} route` : 'Interval route', tag: 'Route done' }
    : s.type === 'stopwatch' ? { icon: Clock, name: 'Chronograph run', tag: 'Logged' }
    : { icon: Coffee, name: s.label || 'Recess', tag: 'Rested' };

  return (
    <div className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-8 py-6">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <div className="label-wall text-[10px] mb-1">Ledger</div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-ink uppercase tracking-tight leading-none">
            Time kept
          </h1>
          <p className="text-ink-soft font-body text-sm mt-2">The last seven days, and everything before them.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setLogOpen((v) => !v)}
            className="chip px-3 py-1.5 text-[10px] flex items-center gap-1.5"
            aria-expanded={logOpen}
          >
            <PenLine size={12} /> Log
          </button>
          {stats.allSessions.length > 0 && (
            <button onClick={exportCsv} className="chip px-3 py-1.5 text-[10px] flex items-center gap-1.5">
              <Download size={12} /> CSV
            </button>
          )}
        </div>
      </div>

      {/* Manual session entry — goes through recordSessionOutcome so the
          row counts in stats, files its minutes to any bound work, and
          lands on the feed like a live-timed session would. */}
      <AnimatePresence>
        {logOpen && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="panel-wall mb-8 overflow-hidden p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const mins = Math.max(1, Math.min(600, Math.round(Number(logMinutes) || 0)));
              if (!mins || logBusy) return;
              setLogBusy(true);
              try {
                const res = await execCommand('recordSessionOutcome', {
                  outcome: 'completed',
                  elapsedMinutes: mins,
                  plannedMinutes: mins,
                  label: logLabel.trim() || 'Focus session',
                  confirmedByUser: true,
                  idempotencyKey: `manual:${Date.now()}`,
                });
                if (res?.ok !== false) {
                  setStats(getStats());
                  setLogLabel('');
                  setLogOpen(false);
                }
              } finally {
                setLogBusy(false);
              }
            }}
          >
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex-1 min-w-40">
                <span className="label-wall text-[9px] block mb-1">What did you work on</span>
                <input
                  value={logLabel}
                  onChange={(e) => setLogLabel(e.target.value)}
                  placeholder="e.g. Lab report draft"
                  className="w-full bg-transparent border-b border-[var(--color-line,#333)] py-1 font-body text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-[var(--color-signal)]"
                />
              </label>
              <label className="w-24">
                <span className="label-wall text-[9px] block mb-1">Minutes</span>
                <input
                  value={logMinutes}
                  onChange={(e) => setLogMinutes(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  className="w-full bg-transparent border-b border-[var(--color-line,#333)] py-1 font-body text-sm text-ink focus:outline-none focus:border-[var(--color-signal)]"
                />
              </label>
              <button type="submit" disabled={logBusy} className="chip px-4 py-2 text-[10px] disabled:opacity-50">
                {logBusy ? 'Logging…' : 'Log session'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {stats.allSessions.length === 0 ? (
        <div className="panel-wall p-10 flex flex-col items-center text-center">
          <Activity className="text-ink-faint mb-4" size={30} />
          <h3 className="font-display text-xl font-bold text-ink uppercase mb-1">Nothing on the board yet</h3>
          <p className="text-ink-soft font-body text-sm max-w-sm">
            Run a timer or an interval route and this page fills in — streaks, weekly spread, and a full session log.
          </p>
        </div>
      ) : (
        <>
          {/* stat strip */}
          <motion.div
            initial="hidden" animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8"
          >
            {[
              { icon: Timer, label: 'This week', big: stats.totalFocusHours, unit: 'hrs' },
              { icon: Activity, label: 'All time', big: stats.allTimeHours, unit: 'hrs' },
              { icon: Flame, label: 'Streak', big: String(stats.streak), unit: stats.streak === 1 ? 'day' : 'days' },
              { icon: CheckCircle2, label: 'Sessions', big: String(stats.completedSessions), unit: 'this week' },
            ].map((s) => (
              <motion.div
                key={s.label}
                variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } }}
                className="panel-wall p-5"
              >
                <s.icon size={17} className="text-ink-soft mb-3" />
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display font-bold text-4xl text-ink leading-none tracking-tight">{s.big}</span>
                  <span className="label-wall text-[9px]">{s.unit}</span>
                </div>
                <div className="label-wall text-[9px] mt-2">{s.label}</div>
              </motion.div>
            ))}
          </motion.div>

          <div className="grid lg:grid-cols-5 gap-5 mb-10">
            {/* weekly spread */}
            <div className="panel-wall p-6 lg:col-span-3">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <div className="font-display font-bold text-lg text-ink uppercase leading-none">Weekly spread</div>
                  <div className="label-wall text-[9px] mt-1.5">Focus minutes per day</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5" style={{ background: 'var(--color-signal)' }} />
                  <span className="label-wall text-[9px]">Focus</span>
                </div>
              </div>
              <div className="flex items-end justify-between h-44 gap-3">
                {stats.chartData.map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-3 h-full">
                    <div className="w-full h-full relative rounded-t-[3px] overflow-hidden" style={{ background: 'rgb(var(--ink-rgb) / 0.08)' }}>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: h }}
                        transition={{ duration: 0.9, delay: 0.15 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute bottom-0 w-full"
                        style={{ background: i === 6 ? 'var(--color-signal)' : 'var(--color-ink)' }}
                      />
                    </div>
                    <span className="label-wall text-[9px]">{labels[i]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* focus gauge */}
            <div className="board board-screws p-6 lg:col-span-2 flex flex-col items-center justify-center">
              <span className="engraved text-xs mb-5">Focus gauge</span>
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90">
                  <circle cx="72" cy="72" fill="transparent" r="62" stroke="rgba(242,233,207,0.1)" strokeWidth="9" />
                  <motion.circle
                    initial={{ strokeDashoffset: 389.6 }}
                    animate={{ strokeDashoffset: 389.6 - (stats.deepFocusScore / 100) * 389.6 }}
                    transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
                    cx="72" cy="72" fill="transparent" r="62"
                    stroke="var(--color-signal-bright)" strokeDasharray="389.6" strokeWidth="9" strokeLinecap="round"
                  />
                </svg>
                <span className="absolute font-display font-bold text-4xl text-flap-ink">{stats.deepFocusScore}</span>
              </div>
              <span className="engraved text-[10px] mt-5" style={{ letterSpacing: '0.3em' }}>
                {stats.deepFocusScore >= 80 ? 'Express service' : stats.deepFocusScore >= 50 ? 'Steady service' : 'Warming up'}
              </span>
              <span className="engraved text-[9px] mt-2 opacity-60">Best day {fmtDur(stats.bestDayMinutes * 60)}</span>
            </div>
          </div>
        </>
      )}

      {/* log — only once something is on the board */}
      {stats.allSessions.length > 0 && (
      <>
      <div className="flex items-end justify-between mb-5">
        <div className="font-display text-2xl font-bold text-ink uppercase leading-none">
          {showAll ? 'Full log' : 'Recent runs'}
        </div>
        {stats.allSessions.length > 5 && (
          <button onClick={() => { vibrate(15); setShowAll(!showAll); }} className="chip px-3 py-1.5 text-[10px]">
            {showAll ? 'Show less' : 'Full log'}
          </button>
        )}
      </div>
      <div className="space-y-2 pb-4">
        <AnimatePresence mode="popLayout">
          {stats.recentSessions.length === 0 ? (
            <div className="panel-wall p-6 text-sm text-ink-soft font-body text-center">No runs yet.</div>
          ) : (
            (showAll ? stats.allSessions : stats.recentSessions).map((s, i) => {
              const m = typeMeta(s);
              return (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(i * 0.03, 0.4) }}
                  className="panel-wall px-4 py-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-9 h-9 rounded-md bg-[rgb(var(--ink-rgb)_/_0.07)] flex items-center justify-center shrink-0">
                      <m.icon size={16} className={s.type === 'focus' ? 'text-[color:var(--color-signal)]' : 'text-ink-soft'} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-display font-bold text-ink text-base leading-tight truncate">{m.name}</div>
                      <div className="label-wall text-[9px] mt-0.5">{fmtDate(s.timestamp)}</div>
                      <BoundChip s={s} />
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-4">
                    <div className="font-display font-bold text-ink text-lg leading-none">{fmtTime(s.duration)}</div>
                    <div className="label-wall text-[9px] mt-0.5" style={{ color: s.type === 'focus' || s.type === 'interval' ? 'var(--color-signal)' : undefined }}>
                      {m.tag}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={confirmingId === s.id ? `Confirm delete ${m.name}` : `Delete ${m.name}`}
                    title={confirmingId === s.id ? 'Tap again to delete' : 'Delete session'}
                    onClick={() => {
                      vibrate(15);
                      if (confirmingId === s.id) {
                        deleteSession(s.id);
                        setStats(getStats());
                        setConfirmingId(null);
                      } else {
                        setConfirmingId(s.id);
                        window.setTimeout(() => setConfirmingId((c) => (c === s.id ? null : c)), 3000);
                      }
                    }}
                    className={`ml-3 shrink-0 flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
                      confirmingId === s.id
                        ? 'text-[var(--color-signal)] bg-[rgb(var(--ink-rgb)_/_0.08)]'
                        : 'text-ink-soft opacity-60 hover:opacity-100 hover:bg-[rgb(var(--ink-rgb)_/_0.06)]'
                    }`}
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
      </>
      )}
    </div>
  );
}

/* ── bound chip — UX-TRACKER #80 ─────────────────────────────────────────────
   A session bound to a commitment/course gets a chip back to it: the folio's
   '/apps/syllabus/?commitment=<id>' deep link wins; else the shell's
   '#/c/<code>' dossier route. Both only exist framed inside the terrain, so
   the chip renders nothing standalone. */
function BoundChip({ s }: { s: Session }) {
  const [code, setCode] = useState<string | null>(s.course && !s.course.includes(':') ? s.course : null);
  useEffect(() => {
    let live = true;
    void boundCourseCode(s.courseId, s.course).then((c) => { if (live) setCode(c); });
    return () => { live = false; };
  }, [s.courseId, s.course]);
  if (!inTerrain() || (!s.commitmentId && !code)) return null;
  return (
    <button
      className="label-wall text-[9px] mt-0.5 block uppercase tracking-wide hover:underline"
      style={{ color: 'var(--color-signal)' }}
      onClick={() =>
        openTerrain(
          s.commitmentId
            ? `/apps/syllabus/?commitment=${encodeURIComponent(s.commitmentId)}`
            : `#/c/${encodeURIComponent(code!)}`,
        )
      }
    >
      {s.commitmentId ? 'commitment →' : `${code} dossier →`}
    </button>
  );
}
