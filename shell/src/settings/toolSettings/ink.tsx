import { useEffect, useState } from 'react';
import { useStore } from '../../apps/ink/store';
import { SettingsPopover } from '../../apps/ink/components/SettingsPopover';
import '../../apps/ink/index.css';

export default function InkToolSettings() {
  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated());

  useEffect(() => {
    if (useStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <div className="it-place-ink flex h-full items-center justify-center bg-paper text-ink">
        <span className="text-sm text-muted-foreground">Loading Notes settings…</span>
      </div>
    );
  }

  return (
    <div className="it-place-ink h-full bg-paper">
      <SettingsPopover open embedded onClose={() => {}} />
    </div>
  );
}
