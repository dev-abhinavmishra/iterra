import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { FlipRow, FlipText } from './Flip';
import { useViewport } from '../hooks/useViewport';

/* Power-on self-test: digits scramble then settle on the real time —
   the split-flap board's wake-up ritual. Shows once per page load. */
const GLYPHS = '0123456789';

export function BootSequence({ onDone }: { onDone: () => void }) {
  const vp = useViewport();
  const [phase, setPhase] = useState(0); // 0 scramble, 1 settle, 2 open
  const [scramble, setScramble] = useState('88:88:88');
  const skipped = useRef(false);

  // one exit path: fade then open — whichever arrives first wins
  const finish = (withFade: boolean) => {
    if (skipped.current) return;
    skipped.current = true;
    if (withFade) { setPhase(2); setTimeout(onDone, 500); }
    else onDone();
  };

  useEffect(() => {
    const iv = setInterval(() => {
      setScramble(s => s.split('').map(c => c === ':' ? ':' : GLYPHS[Math.floor(Math.random() * 10)]).join(''));
    }, 85);
    const t1 = setTimeout(() => {
      clearInterval(iv);
      const d = new Date();
      setScramble(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`);
      setPhase(1);
    }, 1100);
    const t2 = setTimeout(() => setPhase(2), 2050);
    const t3 = setTimeout(() => finish(false), 2550);
    // click or any key jumps straight to the fade-out
    const onSkip = () => finish(true);
    window.addEventListener('pointerdown', onSkip);
    window.addEventListener('keydown', onSkip);
    return () => {
      clearInterval(iv); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      window.removeEventListener('pointerdown', onSkip);
      window.removeEventListener('keydown', onSkip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const size = Math.max(56, Math.min(120, Math.round(vp.w / 9.4)));

  return (
    <motion.div
      className="fixed inset-0 z-[400] flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(180deg, #16130B 0%, #0F0C06 100%)' }}
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === 2 ? 0 : 1, scale: phase === 2 ? 1.04 : 1 }}
      transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
    >
      <div className="engraved text-[10px] mb-6" style={{ letterSpacing: '0.5em' }}>
        {phase === 0 ? 'POWER ON SELF TEST' : 'TIMER — TIME INSTRUMENTS'}
      </div>
      <FlipRow text={scramble} size={size} duration={phase === 0 ? 90 : 300} delayStep={phase === 0 ? 20 : 55} />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 1 ? 0.5 : 0 }}
        className="mt-8"
      >
        {/* mounts at the reveal so the flaps visibly snap in from blank */}
        {phase >= 1 && <FlipText text="ALL POINTS CLEAR" size={18} delayStep={40} sound={false} />}
      </motion.div>
    </motion.div>
  );
}
