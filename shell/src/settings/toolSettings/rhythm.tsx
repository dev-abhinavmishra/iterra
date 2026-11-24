import '../../apps/rhythm/index.css';
import { useRegister } from '../../apps/rhythm/store';
import { SettingsView } from '../../apps/rhythm/views/SettingsView';

export default function RhythmToolSettings() {
  const motion = useRegister((s) => s.settings.motion);

  return (
    <div className="it-place-rhythm h-full" data-motion={motion}>
      <div className="rhythm-scroll">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
          <div className="deck min-h-[60vh] px-6 py-6 sm:px-9 sm:py-7">
            <SettingsView />
          </div>
        </div>
      </div>
    </div>
  );
}
