const KEYS: [string, string][] = [
  ['L', 'Library'],
  ['S', 'Session setup'],
  ['E', 'Error ledger'],
  ['P', 'Progress'],
  ['I', 'Import'],
  ['?', 'This sheet'],
  ['Esc', 'Close sheet / back out'],
  ['h', 'Reveal next hint level (attempt desk)'],
  ['1–5', 'Set confidence (attempt desk)'],
  ['⏎', 'Submit answer (attempt desk)'],
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-[rgb(22_24_27/0.6)] p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div className="film max-w-sm rounded p-5" onClick={(e) => e.stopPropagation()}>
        <div className="kicker mb-3">Keyboard map</div>
        <table className="w-full">
          <tbody>
            {KEYS.map(([k, v]) => (
              <tr key={k} className="border-b border-[var(--color-rule)] last:border-0">
                <td className="mono py-1.5 pr-4 text-[12px] font-semibold text-[var(--color-blueprint-deep)]">{k}</td>
                <td className="py-1.5 text-[13px] text-[var(--color-ink)]">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn--ghost mt-4 w-full" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </div>
  );
}
