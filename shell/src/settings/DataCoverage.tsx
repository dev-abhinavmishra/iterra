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
          Iterra saves your work in this browser. A downloaded backup contains
          the data saved here, such as notes, plans, and study materials. Keep
          the file somewhere safe to move or restore that data.
        </p>
        <p>
          Some course and study records can sync across devices when sync is
          available and you use the same account. An anonymous session stays
          with this browser. Original files and tool-specific or private data
          may also stay here, so use a backup for those items.
        </p>
        <p>
          GradeStack offers separate, optional account sync for its register.
          Manage it in GradeStack settings; it is separate from Iterra sync.
        </p>
      </div>
    </section>
  );
}
