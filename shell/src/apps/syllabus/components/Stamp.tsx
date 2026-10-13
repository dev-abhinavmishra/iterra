import { cn } from '../lib/utils';

/** Rubber-stamp mark — lands once per completion (or used statically for dates). */
export function Stamp({
  text,
  tone = 'ink',
  animate = false,
  className,
}: {
  text: string;
  tone?: 'ink' | 'late' | 'ok' | 'course';
  animate?: boolean;
  className?: string;
}) {
  const color =
    tone === 'late'
      ? 'text-[color:var(--color-late)]'
      : tone === 'ok'
        ? 'text-[color:var(--color-ok)]'
        : tone === 'course'
          ? 'text-[color:var(--stamp-course,var(--color-ink-soft))]'
          : 'text-[color:var(--color-ink-soft)]';
  return (
    <span
      className={cn('stamp text-[11px]', color, animate && 'stamp--in', className)}
      aria-label={text}
    >
      {text}
    </span>
  );
}
