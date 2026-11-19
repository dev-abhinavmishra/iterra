import type { MouseEventHandler } from 'react';

export function WorkspaceHomeButton({ onClick }: { onClick: MouseEventHandler<HTMLButtonElement> }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Iterra workspace — Today"
      className="flex items-center gap-2 rounded-[5px] px-2 py-1 text-left hover:bg-[var(--color-sheet-2)] cursor-pointer"
      title="Go to Today (Ctrl or ⌘ + 0)"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-place text-[12px] font-bold">
        i
      </span>
      <span className="font-place text-[16px] font-semibold tracking-tight text-[var(--color-ink)] hidden sm:inline">
        iterra
      </span>
    </button>
  );
}
