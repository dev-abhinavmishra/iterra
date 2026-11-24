const SHORTCUTS: Array<[string, string]> = [
  ['Space', 'flip card'],
  ['← →', 'next / previous'],
  ['S', 'shuffle deck'],
  ['B', 'star card'],
  ['R', 'swap card sides'],
  ['F', 'fullscreen card'],
  ['*', 'starred-only filter'],
  ['K / L', 'learn: knew it / again'],
  ['1–4', 'quiz: answer 1–4'],
  ['?', 'this keyboard map'],
  ['Esc', 'close dialog'],
];

export default function FlashcardsToolSettings() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-6">
      <div className="mb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-mute)]">
          Cardfile
        </div>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-ink)]">Keyboard map</h2>
        <p className="mt-1 text-[12.5px] text-[var(--color-mute)]">
          Works from anywhere in Flashcards except inside a text field.
        </p>
      </div>

      <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
        {SHORTCUTS.map(([key, action], i) => (
          <div
            key={key}
            className={`flex items-center justify-between gap-4 px-4 py-2.5 ${i > 0 ? 'border-t border-[var(--color-line)]' : ''}`}
          >
            <span className="text-[13px] text-[var(--color-ink)]">{action}</span>
            <kbd className="rounded border border-[var(--color-line)] bg-[var(--color-sheet-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-ink)]">
              {key}
            </kbd>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[12px] text-[var(--color-mute)]">
        Theme and motion follow the workspace Appearance settings.
      </p>
    </div>
  );
}
