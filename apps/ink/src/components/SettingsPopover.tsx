import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { Download, Upload, Check, BookText } from 'lucide-react';
import { useStore, type Prefs } from '../store';
import { downloadFile, libraryToMarkdown } from '../lib/notes';

const textSizes: { id: Prefs['editorTextSize']; label: string; sample: string }[] = [
  { id: 'sm', label: 'Small', sample: 'Aa' },
  { id: 'md', label: 'Medium', sample: 'Aa' },
  { id: 'lg', label: 'Large', sample: 'Aa' },
];

export const SettingsPopover: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { prefs, setPrefs, notes, importNotes, setNotice } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const exportAll = () => {
    const live = notes.filter(n => !n.trashedAt);
    downloadFile('ink-library.json', JSON.stringify(live, null, 2), 'application/json');
  };

  const bindLibrary = () => {
    const live = notes.filter(n => !n.trashedAt);
    downloadFile('ink-library.md', libraryToMarkdown(live));
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const count = importNotes(parsed);
      setNotice({ message: count ? `Imported ${count} note${count === 1 ? '' : 's'}` : 'Nothing to import in that file' });
      onClose();
    } catch {
      setNotice({ message: 'That file is not valid JSON' });
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-full left-2 right-2 mb-2 z-[81] bg-paper border border-line rounded-md shadow-pop overflow-hidden"
          >
            <div className="px-4 pt-3 pb-2 border-b border-line">
              <p className="font-serif text-[15px] font-semibold text-ink">Desk settings</p>
            </div>

            <div className="px-4 py-3 space-y-3.5">
              {/* Text size */}
              <div>
                <p className="text-[11px] font-medium text-ink-ghost mb-1.5">Writing size</p>
                <div className="flex gap-1">
                  {textSizes.map(size => (
                    <button
                      key={size.id}
                      onClick={() => setPrefs({ editorTextSize: size.id })}
                      className={clsx(
                        'flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded border transition-colors',
                        prefs.editorTextSize === size.id
                          ? 'border-ink bg-paper-dim text-ink'
                          : 'border-line text-ink-faint hover:border-line-strong hover:text-ink'
                      )}
                    >
                      <span className={clsx('font-serif leading-none', size.id === 'sm' ? 'text-[13px]' : size.id === 'md' ? 'text-[16px]' : 'text-[19px]')}>
                        {size.sample}
                      </span>
                      <span className="text-2xs">{size.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <Toggle
                label="Wet ink"
                hint="words land wet on the page and dry as you write"
                checked={prefs.wetInk}
                onChange={() => setPrefs({ wetInk: !prefs.wetInk })}
              />
              <Toggle
                label="Typewriter mode"
                hint="dim everything but the current paragraph in Deep work"
                checked={prefs.typewriter}
                onChange={() => setPrefs({ typewriter: !prefs.typewriter })}
              />
            </div>

            <div className="px-4 py-3 border-t border-line flex items-center gap-2">
              <button
                onClick={exportAll}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-ink border border-line rounded py-1.5 hover:bg-paper-dim transition-colors"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                Export
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-ink border border-line rounded py-1.5 hover:bg-paper-dim transition-colors"
              >
                <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
                Import
              </button>
              <button
                onClick={bindLibrary}
                title="Every page as one Markdown volume"
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-ink border border-line rounded py-1.5 hover:bg-paper-dim transition-colors"
              >
                <BookText className="w-3.5 h-3.5" strokeWidth={1.75} />
                Bind
              </button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportFile} />
            </div>

            <p className="px-4 pb-3 text-2xs text-ink-ghost leading-relaxed">
              Ink is local-first. Notes live in this browser's storage — export for backup.
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const Toggle: React.FC<{ label: string; hint: string; checked: boolean; onChange: () => void }> = ({ label, hint, checked, onChange }) => (
  <button onClick={onChange} className="w-full flex items-center justify-between gap-3 text-left group">
    <span>
      <span className="block text-[13px] font-medium text-ink">{label}</span>
      <span className="block text-2xs text-ink-ghost">{hint}</span>
    </span>
    <span className={clsx(
      'w-8 h-[18px] rounded-full flex items-center px-0.5 transition-colors flex-shrink-0',
      checked ? 'bg-ink justify-end' : 'bg-line-strong justify-start'
    )}>
      <span className={clsx('w-3.5 h-3.5 rounded-full bg-paper shadow-sm flex items-center justify-center')}>
        {checked && <Check className="w-2.5 h-2.5 text-ink" strokeWidth={3} />}
      </span>
    </span>
  </button>
);
