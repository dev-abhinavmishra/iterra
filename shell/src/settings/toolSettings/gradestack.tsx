import { useEffect, useRef } from 'react';
import { MotionConfig } from 'motion/react';
import { Settings } from '../../apps/gradestack/pages/Settings';
import { FirebaseProvider } from '../../apps/gradestack/components/FirebaseProvider';
import { onTerrainTheme } from '../../apps/theme';
import '../../apps/gradestack/index.css';

export default function GradeStackToolSettings() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => onTerrainTheme((t) => {
    rootRef.current?.classList.toggle('dark', t === 'graphite');
  }), []);

  return (
    <FirebaseProvider>
      <MotionConfig reducedMotion="user">
        <div ref={rootRef} className="it-place-gradestack h-full w-full bg-paper overflow-hidden relative">
          <main className="h-full overflow-y-auto">
            <Settings />
          </main>
        </div>
      </MotionConfig>
    </FirebaseProvider>
  );
}
