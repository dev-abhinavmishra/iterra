// ── Onboarding — the register's first leaf ───────────────────────────────────
// Not a tour: an intake sheet. File one routine and the register opens.

import { useRegister } from '../store';
import { RoutineForm } from '../components/RoutineForm';
import { Mark } from '../components/Mark';

export function Onboarding({ onDone }: { onDone: () => void }) {
  const routines = useRegister((s) => s.routines);
  const count = Object.keys(routines).length;

  return (
    <div className="mx-auto max-w-lg py-6">
      <div className="mb-6 text-center">
        <div className="mb-3 flex justify-center gap-1.5" aria-hidden="true">
          <Mark state="full" size={22} />
          <Mark state="minimum" size={22} />
          <Mark state="partial" size={22} />
          <Mark state="missed" size={22} />
          <Mark state="exception" size={22} />
        </div>
        <div className="kicker mb-1">Rhythm — the attendance register</div>
        <h1 className="datestamp text-[26px] leading-tight">Open the register</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-snug text-ink-soft">
          A calm record of whether your academic routines are actually happening — and a way to
          repair them when they are not. No streaks, no flames, no guilt.
        </p>
      </div>

      <div className="slip p-5">
        <div className="kicker mb-3">{count === 0 ? 'File the first routine' : `Routine ${count + 1}`}</div>
        <RoutineForm submitLabel={count === 0 ? 'File it' : 'File another'} onDone={onDone} autofocusName />
      </div>

      {count > 0 && (
        <button className="btn btn--primary mx-auto mt-5 block !px-8 !py-2.5" onClick={onDone}>
          Open the register
        </button>
      )}
    </div>
  );
}
