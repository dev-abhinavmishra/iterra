import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'T', action: 'Today desk' },
  { keys: 'E', action: 'Semester folio' },
  { keys: 'C', action: 'Calendar' },
  { keys: 'W', action: 'Weekly review' },
  { keys: ',', action: 'Registry settings' },
  { keys: 'N', action: 'Quick-file a commitment' },
  { keys: 'J / K', action: 'Move block selection (Today)' },
  { keys: 'Shift+J / Shift+K', action: 'Reorder selected block up/down (Today)' },
  { keys: 'Enter', action: 'Open selected commitment' },
  { keys: 'D', action: 'Stamp selected block done' },
  { keys: 'X', action: 'Defer selected block' },
  { keys: 'P', action: 'Pin selected commitment' },
  { keys: '?', action: 'This card' },
  { keys: 'Esc', action: 'Close sheet / card' },
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(var(--desk-rgb)/0.72)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard map"
      onClick={onClose}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className="sheet max-w-sm w-full p-6 outline-none animate-[slip-in_0.3s_cubic-bezier(0.22,0.9,0.3,1)_both]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="kicker mb-1">KEY MAP</div>
            <h2 className="slab text-xl font-semibold">Registrar’s shorthand</h2>
          </div>
          <button className="xbtn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <ul className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center gap-3">
              <kbd className="mono text-[10.5px] font-semibold border border-[color:var(--color-rule-dark)] rounded-[3px] px-1.5 py-0.5 bg-[color:var(--color-form)] min-w-11 text-center">
                {s.keys}
              </kbd>
              <span className="text-[13px] text-[color:var(--color-ink-soft)]">{s.action}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
