import { useState, useEffect } from 'react';
import { Palette, CheckCircle2, RefreshCcw, AlertTriangle, X, Volume2, Gauge, Keyboard, MoonStar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { vibrate, cn } from '../lib/utils';
import { clearSessions } from '../lib/stats';
import { ACCENTS, useSettings, updateSettings } from '../lib/settings';
import { stationChime, flapTick } from '../lib/sound';
import { KeyButton } from '../components/KeyButton';

export default function SettingsView({ active = true }: { active?: boolean }) {
  const settings = useSettings();
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState(false);

  /* esc backs out of the wipe confirmation */
  useEffect(() => {
    if (!confirm || !active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirm(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, active]);

  const clearAll = () => {
    clearSessions();
    vibrate([50, 50, 50]);
    setConfirm(false);
    setToast(true);
    setTimeout(() => setToast(false), 2800);
  };

  const sectionHead = (icon: React.ReactNode, title: string) => (
    <div className="flex items-center gap-3 mb-5">
      <span className="text-[color:var(--color-signal)]">{icon}</span>
      <h2 className="font-display font-bold text-xl text-ink uppercase leading-none">{title}</h2>
    </div>
  );

  return (
    <div className="flex-1 w-full max-w-3xl mx-auto px-4 md:px-8 py-6">
      <div className="mb-10">
        <div className="label-wall text-[10px] mb-1">Workbench</div>
        <h1 className="font-display text-4xl md:text-5xl font-bold text-ink uppercase tracking-tight leading-none">
          Settings
        </h1>
      </div>

      {/* signal colour */}
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        {sectionHead(<Palette size={20} />, 'Signal colour')}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {ACCENTS.map((t, i) => (
            <motion.button
              key={t.name}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.06 + i * 0.04 }}
              onClick={() => { vibrate(20); flapTick(); updateSettings({ accent: t.name }); }}
              className={cn(
                'panel-wall p-4 flex flex-col items-center gap-3 transition-transform active:scale-95',
                settings.accent === t.name && 'outline-2 outline-[color:var(--color-signal)]'
              )}
              style={settings.accent === t.name ? { outlineColor: t.signal } : undefined}
            >
              <div
                className="w-10 h-10 rounded-md flex items-center justify-center"
                style={{ background: t.signal, boxShadow: `0 3px 0 ${t.deep}` }}
              >
                {settings.accent === t.name && <CheckCircle2 size={18} color="#FFEDE3" />}
              </div>
              <span className="label-wall text-[10px]">{t.name}</span>
            </motion.button>
          ))}
        </div>
      </motion.section>

      {/* behaviour */}
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-10">
        {sectionHead(<Gauge size={20} />, 'Behaviour')}
        <div className="panel-wall divide-y divide-[rgb(var(--ink-rgb)_/_0.1)]">
          {[
            {
              icon: <Volume2 size={17} />,
              title: 'Board sounds',
              desc: 'Relay clicks, landing thunks, and the station chime.',
              on: settings.sound,
              toggle: () => { updateSettings({ sound: !settings.sound }); if (!settings.sound) setTimeout(stationChime, 120); },
            },
            {
              icon: <Gauge size={17} />,
              title: 'Full motion',
              desc: 'Flap flips, cascades and ambient motion — overrides your OS reduce-motion. Off for reduced motion.',
              on: settings.motion === 'full',
              toggle: () => updateSettings({ motion: settings.motion === 'full' ? 'reduced' : 'full' }),
            },
            {
              icon: <MoonStar size={17} />,
              title: 'Night board',
              desc: 'Graphite wall and dim ink for low light. Off keeps the plaster room.',
              on: settings.theme === 'night',
              toggle: () => updateSettings({ theme: settings.theme === 'night' ? 'day' : 'night' }),
            },
          ].map(row => (
            <div key={row.title} className="flex items-center justify-between p-5 gap-4">
              <div className="flex items-center gap-4">
                <span className="text-ink-soft">{row.icon}</span>
                <div>
                  <div className="font-display font-semibold text-ink text-base leading-tight">{row.title}</div>
                  <div className="text-ink-soft text-sm font-body">{row.desc}</div>
                </div>
              </div>
              <button
                onClick={() => { vibrate(15); row.toggle(); }}
                className={cn(
                  'w-14 h-8 rounded-full relative transition-colors shrink-0',
                  row.on
                    ? 'bg-[color:var(--color-signal)]'
                    : 'bg-[rgb(var(--ink-rgb)_/_0.16)] shadow-[inset_0_0_0_1px_rgb(var(--ink-rgb)_/_0.35),inset_0_2px_4px_rgb(var(--ink-rgb)_/_0.2)]'
                )}
                role="switch" aria-checked={row.on}
              >
                <motion.span
                  initial={false}
                  animate={{ x: row.on ? 24 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                  className="absolute top-1 left-1 w-6 h-6 rounded-full bg-[color:var(--rng-thumb-a)] shadow"
                />
              </button>
            </div>
          ))}
        </div>
      </motion.section>

      {/* keys */}
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-10">
        {sectionHead(<Keyboard size={20} />, 'Keys')}
        <div className="panel-wall p-5 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
          {[['Space', 'run / pause'], ['R', 'reset'], ['L', 'lap'], ['F', 'focus mode'], ['Esc', 'exit / close']].map(([k, d]) => (
            <div key={k} className="flex items-center gap-2.5">
              <kbd className="key !px-2.5 !py-1.5 text-[10px] !rounded-md pointer-events-none">{k}</kbd>
              <span className="label-wall text-[9px]">{d}</span>
            </div>
          ))}
        </div>
      </motion.section>

      {/* danger */}
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        {sectionHead(<RefreshCcw size={20} />, 'Data')}
        <div className="panel-wall p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="font-display font-semibold text-ink text-base">Clear session log</div>
            <div className="text-ink-soft text-sm font-body">Deletes every recorded session, streak and stat.</div>
          </div>
          <KeyButton variant="paper" className="px-5 py-2.5 text-[11px] shrink-0" onClick={() => { vibrate(20); setConfirm(true); }}>
            Clear log
          </KeyButton>
        </div>
      </motion.section>

      {/* confirm */}
      <AnimatePresence>
        {confirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-center justify-center p-4"
            style={{ background: 'rgba(15,12,6,0.7)', backdropFilter: 'blur(6px)' }}
            onClick={() => setConfirm(false)}
          >
            <motion.div
              initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 340, damping: 26 }}
              className="board p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-3" style={{ color: 'var(--color-signal-bright)' }}>
                <AlertTriangle size={26} />
                <h3 className="font-display font-bold text-xl text-flap-ink uppercase">Clear the log?</h3>
              </div>
              <p className="text-flap-dim text-sm font-body mb-6">
                This can't be undone. Session history, streaks and stats are wiped from this device.
              </p>
              <div className="flex gap-3 justify-end">
                <KeyButton className="px-4 py-2.5 text-[11px]" onClick={() => setConfirm(false)}>Keep it</KeyButton>
                <KeyButton variant="signal" className="px-4 py-2.5 text-[11px]" onClick={clearAll}>Wipe</KeyButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[150] board px-5 py-3 flex items-center gap-3"
          >
            <CheckCircle2 size={16} style={{ color: 'var(--color-signal-bright)' }} />
            <span className="engraved text-[10px]">Log cleared</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
