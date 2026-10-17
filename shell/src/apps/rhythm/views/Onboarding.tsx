// ── Onboarding — patching the first channel ──────────────────────────────────
// Not a tour: patch one routine in and the sequencer starts running.

import { useRegister } from '../store';
import { RoutineForm } from '../components/RoutineForm';
import { Pad } from '../components/Pad';

export function Onboarding({ onDone }: { onDone: () => void }) {
  const routines = useRegister((s) => s.routines);
  const count = Object.keys(routines).length;

  return (
    <div className="mx-auto max-w-lg py-6">
      <div className="mb-6 text-center">
        <div className="mb-3 flex justify-center gap-1.5" aria-hidden="true">
          <Pad state="full" size={22} />
          <Pad state="minimum" size={22} />
          <Pad state="partial" size={22} />
          <Pad state="missed" size={22} />
          <Pad state="exception" size={22} />
        </div>
        <div className="kicker mb-1">Rhythm — the weekly sequencer</div>
        <h1 className="disp text-[26px] leading-tight">Power it up</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-snug text-ink-soft">
          Every routine is a channel, every week a measure, every done-day a hit on the
          grid. A calm record of whether your routines are actually sounding — and a way
          to tune them when they are not. No streaks, no flames, no guilt.
        </p>
      </div>

      <div className="panel p-5">
        <div className="kicker mb-3">{count === 0 ? 'Patch the first channel' : `Channel ${count + 1}`}</div>
        <RoutineForm submitLabel={count === 0 ? 'Patch it in' : 'Patch another'} onDone={onDone} autofocusName />
      </div>

      {count > 0 && (
        <button className="btn btn--primary mx-auto mt-5 block !px-8 !py-2.5" onClick={onDone}>
          Start the sequence
        </button>
      )}
    </div>
  );
}
