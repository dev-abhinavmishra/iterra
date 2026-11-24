import { useEffect, useRef, useState } from 'react';
import SettingsView from '../../apps/margin/views/SettingsView';
import type { AppSettings } from '../../apps/margin/types';
import {
  clearAllNotes,
  getSettings,
  initDB,
  migrateFromLocalStorage,
  saveSettings,
} from '../../apps/margin/services/storageService';
import { onTerrainTheme } from '../../apps/theme';
import '../../apps/margin/index.css';

const DEFAULT_SETTINGS: AppSettings = {
  darkMode: true,
  compactMode: false,
  defaultNoteFormat: 'Structured',
  autoGenerateTitles: true,
  themeColor: '#C2420C',
  editorFontSize: 'medium',
  editorWidth: 'narrow',
  spellcheck: true,
};

export default function MarginToolSettings() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await initDB();
        await migrateFromLocalStorage();
        const stored = await getSettings();
        if (live && stored) setSettingsState((prev) => ({ ...prev, ...stored }));
      } catch {
        /* settings still render with local defaults */
      } finally {
        if (live) setLoaded(true);
      }
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => onTerrainTheme((t) => {
    rootRef.current?.classList.toggle('dark', t === 'graphite');
  }), []);

  const setSettings = (next: AppSettings | ((prev: AppSettings) => AppSettings)) => {
    setSettingsState((prev) => {
      const updated = typeof next === 'function' ? next(prev) : next;
      saveSettings(updated).catch((err) => console.error('Failed to save settings:', err));
      return updated;
    });
  };

  if (!loaded) {
    return (
      <div className="it-place-margin flex h-full items-center justify-center bg-paper text-ink">
        <span className="text-sm text-ink-3">Loading Study Materials settings…</span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="it-place-margin h-full flex bg-paper text-ink">
      <SettingsView
        embedded
        settings={settings}
        onUpdateSettings={setSettings}
        onClearData={async () => { await clearAllNotes(); }}
      />
    </div>
  );
}
