import type { Difficulty } from '../lib/types';

/** Five-segment difficulty meter — reads at a glance where ●●● was ambiguous. */
export function DiffMeter({ level, className }: { level: Difficulty; className?: string }) {
  return (
    <span
      className={className ? `diff ${className}` : 'diff'}
      role="img"
      aria-label={`difficulty ${level} of 5`}
      title={`difficulty ${level} of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= level ? 'on' : undefined} />
      ))}
    </span>
  );
}
