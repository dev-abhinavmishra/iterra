/** A compact guide to where Iterra data lives and what remote sync can cover. */
export function DataCoverage() {
  return (
    <section
      aria-labelledby="data-coverage-title"
    >
      <h3
        id="data-coverage-title"
        className="text-[13px] font-semibold text-[var(--color-ink)]"
      >
        Where your data lives
      </h3>
      <div className="mt-2 space-y-2 text-[12px] leading-relaxed text-[var(--color-mute)]">
        <p>
          Iterra saves your work in this browser. Download a backup to keep a
          copy of your notes, plans, and study materials or move them to another device.
        </p>
        <p>
          When sync is available, some course and study records can follow your
          account across devices. Anonymous sessions stay in this browser.
          Keep a backup of original files and anything that only lives here.
        </p>
        <p>
          GradeStack has its own optional account sync. You can manage it in
          GradeStack settings.
        </p>
      </div>
    </section>
  );
}
