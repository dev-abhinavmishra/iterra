import { useEffect } from 'react';
import '../../apps/timer/index.css';
import SettingsView from '../../apps/timer/views/SettingsView';
import { applySettings } from '../../apps/timer/lib/settings';
import { onTerrainTheme } from '../../apps/theme';

export default function TimerToolSettings() {
  useEffect(() => {
    applySettings();
    return onTerrainTheme(() => applySettings());
  }, []);

  return (
    <div className="it-place-timer h-full wall-tex text-ink font-body" data-theme="day" data-motion="full">
      <SettingsView active />
    </div>
  );
}
