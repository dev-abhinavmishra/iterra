import { useWorkbench } from '../../apps/proof/store';
import { SettingsView } from '../../apps/proof/views/SettingsView';
import '../../apps/proof/index.css';

export default function ProofToolSettings() {
  const motion = useWorkbench((s) => s.settings.motion);

  return (
    <div className="it-place-proof h-full" data-motion={motion}>
      <div className="h-full overflow-y-auto">
        <SettingsView />
      </div>
    </div>
  );
}
