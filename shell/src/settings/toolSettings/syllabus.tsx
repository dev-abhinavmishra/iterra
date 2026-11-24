import { useEffect, useRef } from 'react';
import { useFolio } from '../../apps/syllabus/store';
import { SettingsView } from '../../apps/syllabus/views/SettingsView';
import '../../apps/syllabus/index.css';

export default function SyllabusToolSettings() {
  const settings = useFolio((s) => s.settings);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rootRef.current) rootRef.current.dataset.motion = settings.motion;
  }, [settings.motion]);

  return (
    <div ref={rootRef} className="it-place-syllabus h-full" data-app="syllabus">
      <div className="h-full overflow-y-auto">
        <SettingsView />
      </div>
    </div>
  );
}
