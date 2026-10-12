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
  /** which terrain app bound this session (syllabus, flashcards, terrain…) */
  from?: string;
  /** canonical course key + bound commitment — carried onto the session
      record so completion publishes propagate them (timer.start intake) */
  courseId?: string;
  commitmentId?: string;
  /** recess minutes to chain after the focus session (pomodoro bound
      sessions — the 'Then break' chips' contract carried by the link) */
  thenBreak?: number;
  autostart: boolean;
}

export function parseSyllabusLink(search: string): SyllabusLink | null {
  const q = new URLSearchParams(search);
  // same contract from any terrain app (study slips, practice sessions,
  // …) — `from` names the sender, `return` says where to file back
  const from = q.get('from');
  if (!from || !/^[a-z]{2,16}$/.test(from)) return null;
  const minutes = Number(q.get('minutes'));
  const thenBreak = Number(q.get('break'));
  return {
    intent: q.get('intent') || undefined,
    minutes: Number.isFinite(minutes) && minutes >= 1 && minutes <= 720 ? Math.round(minutes) : undefined,
    course: q.get('course') || undefined,
    block: q.get('block') || undefined,
    returnUrl: q.get('return') || undefined,
    from,
    courseId: q.get('courseId') || undefined,
    commitmentId: q.get('commitment') || undefined,
    thenBreak: Number.isFinite(thenBreak) && thenBreak >= 1 && thenBreak <= 60 ? Math.round(thenBreak) : undefined,
    autostart: q.get('autostart') === '1',
  };
}

/* Routine intake — standalone (unlike the syllabus link, no `from=` gate):
   any app, palette hit or dossier row can point at a named interval routine
   via ?routine=<name>. IntervalsView focuses the matching card; unknown
   names degrade to a plain open. */
export function parseRoutineLink(search: string): string | null {
  const name = new URLSearchParams(search).get('routine')?.trim();
  return name || null;
}

export function syllabusReturnUrl(link: { returnUrl?: string; block?: string }, actualMinutes: number): string | null {
  if (!link.returnUrl || !link.block) return null;
  try {
    // returnUrl may be origin-absolute (solo suite) or relative like
    // '/apps/syllabus' inside the terrain — resolve against this origin
    const u = new URL(link.returnUrl, window.location.origin);
    // http(s) only — a javascript:/data: return param would execute on the
    // file-back navigation (window.location.href); intake params are hostile
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.searchParams.set('completedBlock', link.block);
    u.searchParams.set('actual', String(Math.max(1, Math.round(actualMinutes))));
    return u.toString();
  } catch {
    return null;
  }
}
