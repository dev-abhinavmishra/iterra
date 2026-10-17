import React, { useRef, useState } from 'react';
import { AppSettings } from '../types';
import { Btn, Icon, Kbd, Modal, ProgressBar, Segmented, Select, Toggle } from '../components/ui/primitives';
import { storageEstimate } from '../services/storageService';
import { exportBackup, importBackup } from '../services/exportService';
import { isIntegrated, setTerrainTheme, terrainIsDark } from '../../theme';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onClearData: () => void;
  onNotesChanged?: () => void;
}

const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

/* One labelled row inside a settings section. */
const Row: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
    <div className="flex items-center justify-between gap-6 py-4">
        <div className="min-w-0">
            <h3 className="text-sm font-medium text-ink">{title}</h3>
            {hint && <p className="text-xs text-ink-3 mt-0.5">{hint}</p>}
        </div>
        <div className="shrink-0">{children}</div>
    </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="bg-card border border-line rounded-[var(--r-lg)] shadow-card px-5 md:px-6">
        <h2 className="font-hand text-[24px] text-ink pt-5 pb-1">{title}</h2>
        <div className="divide-y divide-[var(--line)]">{children}</div>
    </section>
);

const SettingsView: React.FC<SettingsViewProps> = ({ settings, onUpdateSettings, onClearData, onNotesChanged }) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    storageEstimate().then(setStorage);
  }, []);

  const update = (patch: Partial<AppSettings>) => onUpdateSettings({ ...settings, ...patch });

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportStatus('Importing…');
    try {
        const counts = await importBackup(file);
        setImportStatus(`Imported ${counts.notes} notes, ${counts.decks} decks, ${counts.quizzes} quizzes.${counts.skipped ? ` Skipped ${counts.skipped} invalid record${counts.skipped === 1 ? '' : 's'}.` : ''}`);
        onNotesChanged?.();
    } catch (err: any) {
        setImportStatus(err?.message || 'Import failed — not a valid backup file.');
    }
  };

  const shortcuts: { keys: string; action: string }[] = [
      { keys: '⌘K', action: 'Command palette' },
      { keys: '⌘F', action: 'Find in note' },
      { keys: '1–4', action: 'Grade a review card' },
      { keys: 'Space', action: 'Flip the current card' },
  ];

  return (
    <main className="flex-1 flex flex-col min-w-0 relative bg-paper overflow-y-auto custom-scrollbar page-lines lg:pl-[76px]">
      <header className="shrink-0 h-14 border-b border-line flex items-center px-4 md:px-6">
        <h1 className="font-serif text-xl text-ink ink-write ink-underline">Settings</h1>
      </header>

      <div className="max-w-2xl mx-auto w-full px-4 md:px-6 py-8 space-y-6">

        <Section title="Appearance">
          {/* integrated: theme is the terrain's single switch — this row
              flips it for every tool instead of a margin-local pref */}
          <Row title="Theme" hint={isIntegrated() ? 'One terrain switch — every tool follows.' : 'Light for the desk, dark for the night desk.'}>
            <Segmented
                value={(isIntegrated() ? terrainIsDark() : settings.darkMode) ? 'dark' : 'light'}
                onChange={v => isIntegrated()
                    ? setTerrainTheme(v === 'dark' ? 'graphite' : 'paper')
                    : update({ darkMode: v === 'dark' })}
                options={[
                    { value: 'light', label: 'Light', icon: 'light_mode' },
                    { value: 'dark', label: 'Dark', icon: 'dark_mode' },
                ]}
            />
          </Row>
          <Row title="Compact density" hint="Tighter rows in the notes index.">
            <Toggle checked={settings.compactMode} onChange={v => update({ compactMode: v })} />
          </Row>
        </Section>

        <Section title="Editor">
          <Row title="Font size">
            <Segmented
                value={settings.editorFontSize || 'medium'}
                onChange={v => update({ editorFontSize: v as AppSettings['editorFontSize'] })}
                options={[
                    { value: 'small', label: 'Small' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'large', label: 'Large' },
                ]}
            />
          </Row>
          <Row title="Page width" hint="Narrow keeps a focused column; wide uses the desk.">
            <Segmented
                value={settings.editorWidth || 'narrow'}
                onChange={v => update({ editorWidth: v as AppSettings['editorWidth'] })}
                options={[
                    { value: 'narrow', label: 'Narrow' },
                    { value: 'wide', label: 'Wide' },
                ]}
            />
          </Row>
          <Row title="Spellcheck" hint="Underline misspellings while you type.">
            <Toggle checked={settings.spellcheck !== false} onChange={v => update({ spellcheck: v })} />
          </Row>
        </Section>

        <Section title="Notes">
          <Row title="Default format" hint="How AI-structured notes are written.">
            <Select
                value={settings.defaultNoteFormat}
                onChange={e => update({ defaultNoteFormat: e.target.value as AppSettings['defaultNoteFormat'] })}
            >
                <option value="Structured">Structured</option>
                <option value="Summary">Summary</option>
                <option value="Transcript">Transcript</option>
            </Select>
          </Row>
          <Row title="Auto-generate titles" hint="Name sessions from their content.">
            <Toggle checked={settings.autoGenerateTitles} onChange={v => update({ autoGenerateTitles: v })} />
          </Row>
        </Section>

        <Section title="Data">
          <div className="py-4">
            <div className="flex items-center justify-between gap-6 mb-2">
                <h3 className="text-sm font-medium text-ink">Storage</h3>
                <span className="font-mono text-[10px] text-ink-3">
                    {storage ? `${formatBytes(storage.usage)} of ${formatBytes(storage.quota)}` : 'unavailable'}
                </span>
            </div>
            <ProgressBar value={storage && storage.quota > 0 ? (storage.usage / storage.quota) * 100 : 0} />
          </div>
          <Row title="Export backup" hint="Download every note, deck, and quiz as JSON.">
            <Btn size="sm" icon="download" onClick={() => exportBackup()}>Export</Btn>
          </Row>
          <div className="py-4">
            <div className="flex items-center justify-between gap-6">
                <div className="min-w-0">
                    <h3 className="text-sm font-medium text-ink">Import backup</h3>
                    <p className="text-xs text-ink-3 mt-0.5">Restore from a previously exported file.</p>
                    {importStatus && <p className="font-mono text-[10px] text-ink-2 mt-2">{importStatus}</p>}
                </div>
                <div className="shrink-0">
                    <Btn size="sm" icon="upload" onClick={() => fileRef.current?.click()}>Import</Btn>
                    <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />
                </div>
            </div>
          </div>
          <Row title="Clear all notes" hint="Permanently delete every note on this device.">
            <Btn size="sm" variant="danger" onClick={() => setShowClearConfirm(true)}>Clear data</Btn>
          </Row>
        </Section>

        <Section title="Shortcuts">
          <div className="py-4 space-y-2.5">
            {shortcuts.map(s => (
                <div key={s.keys} className="flex items-center justify-between">
                    <span className="text-sm text-ink-2">{s.action}</span>
                    <Kbd>{s.keys}</Kbd>
                </div>
            ))}
          </div>
        </Section>

        <section className="pb-8">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2.5">
                    <Icon name="stacks" size={16} className="text-mark" />
                    <span className="font-serif text-base text-ink">Margin</span>
                </div>
                <span className="font-mono text-[10px] text-ink-3">v0.0.0 · local-first</span>
            </div>
        </section>

      </div>

      <Modal open={showClearConfirm} onClose={() => setShowClearConfirm(false)}>
        <div className="p-5">
            <h3 className="font-serif text-lg text-ink">Clear all notes?</h3>
            <p className="text-sm text-ink-2 mt-2 leading-relaxed">
                Every note and transcript stored on this device will be deleted. Decks and quizzes stay. This can't be undone.
            </p>
            <div className="flex justify-end gap-2 mt-5">
                <Btn onClick={() => setShowClearConfirm(false)}>Cancel</Btn>
                <Btn
                    variant="danger"
                    onClick={() => {
                        onClearData();
                        setShowClearConfirm(false);
                    }}
                >
                    Clear everything
                </Btn>
            </div>
        </div>
      </Modal>
    </main>
  );
};

export default SettingsView;
