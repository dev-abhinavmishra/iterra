/* commons read-side: when margin's desk has a fresher active note, offer a
   quiet path to it — renders only in the terrain (iterra doc absent → null). */
import { useOtherNoteActive } from '../../lib/iterra';

export function SharedNoteLink() {
  const other = useOtherNoteActive();
  if (!other?.v) return null;
  return (
    <a
      href={`/apps/margin/?note=${encodeURIComponent(other.v.id)}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${other.v.title} in margin`}
      className="text-fountain/70 hover:text-fountain transition-colors"
    >
      on margin's desk: “{other.v.title}” →
    </a>
  );
}
