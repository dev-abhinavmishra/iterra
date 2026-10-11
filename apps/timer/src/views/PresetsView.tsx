import React, { useState, useEffect } from 'react';
import { Play, Coffee, TreePine, Zap, Plus, Brain, Flame, Moon, X, Trash2, BookOpen, PenLine, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { vibrate, cn } from '../lib/utils';
import { FlipRow } from '../components/Flip';
import { KeyButton } from '../components/KeyButton';
import { flapTick } from '../lib/sound';

interface PresetsViewProps {
  onSelectPreset: (minutes: number, name?: string) => void;
}

export interface Preset {
  id: string;
  name: string;
  minutes: number;
  description: string;
  icon: string;
  accent: boolean;
}

const DEFAULT_PRESETS: Preset[] = [
  { id: 'default-0', name: 'Deep Work', minutes: 25, description: 'One thing, full attention.', icon: 'Brain', accent: true },
  { id: 'default-1', name: 'Recess', minutes: 5, description: 'Stand up, look far away.', icon: 'Coffee', accent: false },
  { id: 'default-2', name: 'Long Recess', minutes: 15, description: 'Proper detachment.', icon: 'TreePine', accent: false },
  { id: 'default-3', name: 'Sprint', minutes: 10, description: 'Ship the small thing.', icon: 'Zap', accent: false },
  { id: 'default-4', name: 'Reading', minutes: 20, description: 'No screen, just pages.', icon: 'BookOpen', accent: true },
  { id: 'default-5', name: 'Practice', minutes: 30, description: 'Repetition is the lesson.', icon: 'Music', accent: false },
];

const IconMap: Record<string, React.ElementType> = {
  Coffee, TreePine, Zap, Brain, Flame, Moon, BookOpen, PenLine, Music
};

const KEY = 'timer.presets.v1';
const LEGACY_KEYS = ['platform.presets.v1', 'obsidian_custom_presets'];

export default function PresetsView({ onSelectPreset, active = true }: PresetsViewProps & { active?: boolean }) {
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  const [newName, setNewName] = useState('');
  const [newMinutes, setNewMinutes] = useState(20);
  const [newDesc, setNewDesc] = useState('');
  const [newIcon, setNewIcon] = useState('Brain');
  const [newAccent, setNewAccent] = useState(false);

  /* esc closes the new-departure sheet */
  useEffect(() => {
    if (!showAddModal || !active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowAddModal(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAddModal, active]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) { setCustomPresets(JSON.parse(saved)); return; }
      const legacyKey = LEGACY_KEYS.find(k => localStorage.getItem(k));
      if (legacyKey) {
        const raw = JSON.parse(localStorage.getItem(legacyKey)!);
        const parsed = raw.map((p: any) => ({
          id: p.id, name: p.name, minutes: p.minutes,
          description: p.description || '', icon: p.icon || 'Brain',
          accent: 'accent' in p ? p.accent : (p.color === 'primary' || p.color === 'orange' || p.color === 'rose'),
        }));
        setCustomPresets(parsed);
        localStorage.setItem(KEY, JSON.stringify(parsed));
      }
    } catch {}
  }, []);

  const savePresets = (presets: Preset[]) => {
    setCustomPresets(presets);
    localStorage.setItem(KEY, JSON.stringify(presets));
  };

  const handleAddPreset = () => {
    if (!newName) return;
    savePresets([...customPresets, {
      id: Math.random().toString(36).substring(2, 9),
      name: newName, minutes: newMinutes, description: newDesc, icon: newIcon, accent: newAccent,
    }]);
    setShowAddModal(false);
    setNewName(''); setNewMinutes(20); setNewDesc(''); setNewAccent(false);
  };

  const handleDelete = (id: string) => {
    vibrate(20);
    savePresets(customPresets.filter(p => p.id !== id));
  };

  const handleSelect = (minutes: number, name?: string) => {
    vibrate(35);
    flapTick();
    onSelectPreset(minutes, name);
  };

  const all = [...DEFAULT_PRESETS, ...customPresets];

  return (
    <div className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-8 py-6">
      <div className="mb-10">
        <div className="label-wall text-[10px] mb-1">Timetable</div>
        <h1 className="font-display text-4xl md:text-5xl font-bold text-ink uppercase tracking-tight leading-none">
          Departures
        </h1>
        <p className="text-ink-soft font-body text-sm mt-2 max-w-md">
          Saved durations, ready to board. One press sets the timer.
        </p>
      </div>

      <motion.div
        initial="hidden" animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.055 } } }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
      >
        {all.map((preset) => {
          const Icon = IconMap[preset.icon] || Brain;
          const isCustom = customPresets.some(p => p.id === preset.id);
          return (
            <motion.div
              key={preset.id}
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
              }}
              whileHover={{ y: -3, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
              className="panel-wall p-5 flex flex-col relative group"
            >
              <div className="flex items-start justify-between mb-5">
                <div className={cn(
                  'w-11 h-11 rounded-md flex items-center justify-center',
                  preset.accent ? 'bg-[rgb(var(--signal-rgb)_/_0.12)] text-[color:var(--color-signal)]' : 'bg-[rgb(var(--ink-rgb)_/_0.07)] text-ink-soft'
                )}>
                  <Icon size={20} strokeWidth={1.8} />
                </div>
                <div className="flex items-center gap-1.5">
                  {isCustom && (
                    <button onClick={() => handleDelete(preset.id)}
                      className="w-8 h-8 flex items-center justify-center text-ink-faint hover:text-[color:var(--color-signal)] transition-colors">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* mini flap readout */}
              <div className="mb-4 origin-left scale-[0.62] -translate-y-1">
                <FlipRow text={`${preset.minutes}M`} size={40} sound={false} quiet={!preset.accent} accent={preset.accent} />
              </div>

              <div className="font-display text-xl font-bold text-ink uppercase leading-none mb-1">{preset.name}</div>
              <p className="text-ink-soft text-sm font-body mb-5">{preset.description}</p>

              <div className="mt-auto">
                <KeyButton
                  variant={preset.accent ? 'signal' : 'dark'}
                  className="w-full py-2.5 text-[11px]"
                  onClick={() => handleSelect(preset.minutes, preset.name)}
                >
                  <Play size={13} fill="currentColor" /> Board {preset.minutes}m
                </KeyButton>
              </div>
            </motion.div>
          );
        })}

        {/* new preset */}
        <motion.button
          variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
          }}
          whileHover={{ y: -3, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
          whileTap={{ scale: 0.97 }}
          onClick={() => { vibrate(20); setShowAddModal(true); }}
          className="flex flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-rule p-6 min-h-[230px] hover:border-ink transition-colors"
        >
          <div className="w-11 h-11 rounded-full border border-rule flex items-center justify-center mb-3">
            <Plus size={20} className="text-ink-soft" />
          </div>
          <span className="font-display font-semibold text-ink-soft uppercase text-sm">New departure</span>
        </motion.button>
      </motion.div>

      {/* ---------- ADD PRESET ---------- */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-center justify-center p-4"
            style={{ background: 'rgba(15,12,6,0.7)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ y: 40, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="board board-screws p-6 w-full max-w-md max-h-[88vh] overflow-y-auto custom-scrollbar"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <span className="engraved text-xs">New departure</span>
                <button onClick={() => setShowAddModal(false)} className="text-flap-dim hover:text-flap-ink"><X size={18} /></button>
              </div>

              <div className="space-y-4 mb-6">
                <input
                  name="preset-name"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Name — e.g. Guitar practice"
                  className="w-full bg-[#0F0C06] border border-[rgba(242,233,207,0.12)] rounded-lg px-4 py-2.5 text-sm text-flap-ink placeholder:text-flap-dim focus:outline-none font-body"
                />
                <div>
                  <div className="engraved text-[10px] mb-2">Duration — {newMinutes}m</div>
                  <input name="preset-minutes" type="range" min={1} max={120} value={newMinutes}
                    onChange={e => setNewMinutes(parseInt(e.target.value))} className="rng w-full" />
                </div>
                <input
                  name="preset-note"
                  value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="Note — e.g. Scales first"
                  className="w-full bg-[#0F0C06] border border-[rgba(242,233,207,0.12)] rounded-lg px-4 py-2.5 text-sm text-flap-ink placeholder:text-flap-dim focus:outline-none font-body"
                />
                <div>
                  <div className="engraved text-[10px] mb-2">Mark</div>
                  <div className="flex gap-2 flex-wrap">
                    {Object.keys(IconMap).map(iconName => {
                      const IconCmp = IconMap[iconName];
                      return (
                        <button key={iconName} onClick={() => setNewIcon(iconName)}
                          className={cn('w-10 h-10 rounded-lg flex items-center justify-center transition-all',
                            newIcon === iconName
                              ? 'bg-[rgba(232,73,15,0.2)] text-[color:var(--color-signal-bright)] border border-[color:var(--color-signal)]'
                              : 'bg-board-3 text-flap-dim border border-transparent hover:text-flap-ink')}>
                          <IconCmp size={18} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="engraved text-[10px]">Signal colour</span>
                  <button
                    onClick={() => setNewAccent(a => !a)}
                    className={cn('chip px-3 py-1.5 text-[10px]', newAccent && 'chip--on')}
                    style={{ borderColor: 'rgba(242,233,207,0.2)', color: newAccent ? undefined : 'var(--color-flap-dim)', background: 'transparent' }}
                  >
                    {newAccent ? 'Signal' : 'Standard'}
                  </button>
                </div>
              </div>

              <KeyButton variant="signal" className="w-full py-3.5 text-sm" onClick={handleAddPreset} disabled={!newName}>
                Post departure
              </KeyButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
