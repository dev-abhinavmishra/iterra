/* Deep-link contract with Syllabus (the registrar's planning folio).
   Inbound:  /?intent=<label>&minutes=<n>&course=<code>&from=syllabus&block=<id>&return=<origin>
   Outbound: {return}/?completedBlock=<id>&actual=<minutes> — filed when the
             student taps "File back" on the completion takeover.
   The contract degrades gracefully: unknown params ignored, a missing
   `return` keeps the filed-back action hidden. */

export interface SyllabusLink {
  intent?: string;
  minutes?: number;
  course?: string;
  block?: string;
  returnUrl?: string;
  autostart: boolean;
}

export function parseSyllabusLink(search: string): SyllabusLink | null {
  const q = new URLSearchParams(search);
  if (q.get('from') !== 'syllabus') return null;
  const minutes = Number(q.get('minutes'));
  return {
    intent: q.get('intent') || undefined,
    minutes: Number.isFinite(minutes) && minutes >= 1 && minutes <= 720 ? Math.round(minutes) : undefined,
    course: q.get('course') || undefined,
    block: q.get('block') || undefined,
    returnUrl: q.get('return') || undefined,
    autostart: q.get('autostart') === '1',
  };
}

export function syllabusReturnUrl(link: { returnUrl?: string; block?: string }, actualMinutes: number): string | null {
  if (!link.returnUrl || !link.block) return null;
  try {
    const u = new URL(link.returnUrl);
    u.searchParams.set('completedBlock', link.block);
    u.searchParams.set('actual', String(Math.max(1, Math.round(actualMinutes))));
    return u.toString();
  } catch {
    return null;
  }
}
