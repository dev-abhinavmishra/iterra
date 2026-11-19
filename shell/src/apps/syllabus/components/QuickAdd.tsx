import { useEffect, useMemo, useRef, useState } from 'react';
import { useFolio } from '../store';
import type { Course, CommitmentType } from '../lib/types';
import { fmtMinutes, isoAtTime, stampDate, todayISO, modalOpen } from '../lib/utils';
import { placeActive } from '../../active';
import { CornerDownLeft } from 'lucide-react';

/**
 * Quick intake — one line files a commitment without leaving the keyboard.
 * Tokens: @code course · #type · due:YYYY-MM-DD|today|tomorrow|+Nd|weekday · ~90m · !pin
 *   “PS4 problem set @math211 #assignment due:+7 ~120m”
 */
export function QuickAdd({ courses, autoFocusKey }: { courses: Course[]; autoFocusKey?: string }) {
  const addCommitment = useFolio((s) => s.addCommitment);
  const [value, setValue] = useState('');
  const [flash, setFlash] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocusKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (!placeActive('syllabus')) return;
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (modalOpen()) return; // a sheet/drawer owns the keys — don't open behind it
      if (e.key.toLowerCase() === autoFocusKey.toLowerCase()) {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [autoFocusKey]);

  const parsed = useMemo(() => parseQuick(value, courses), [value, courses]);

  const parse = () => {
    const p = parseQuick(value, courses);
    if (!p.title) {
      setFlash('Add a title — e.g. “Problem set 4 @math210”');
      setTimeout(() => setFlash(''), 2600);
      return;
    }
    if (!p.course) {
      setFlash(`Add a course code — e.g. @${courses[0]?.code.toLowerCase() ?? 'math211'}`);
      setTimeout(() => setFlash(''), 2600);
      return;
    }

    addCommitment({
      courseId: p.course.id,
      type: p.type,
      title: p.title,
      dueAt: isoAtTime(p.due, '23:59'),
      weight: p.type === 'exam' ? 25 : p.type === 'project' ? 20 : 10,
      estimatedMinutes: p.minutes,
      pinned: p.pinned,
    });
    setValue('');
    setFlash(`Added “${p.title}”`);
    setTimeout(() => setFlash(''), 2200);
  };

  if (!open) {
    return (
      <button
        className="w-full slip pl-6 pr-4 py-3 text-left group"
        aria-label="Add a course commitment"
        title={`Add coursework or an exam${autoFocusKey ? ` (press ${autoFocusKey.toUpperCase()})` : ''}`}
        onClick={() => { setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()); }}
      >
        <span className="mono text-[11px] text-[color:var(--color-ink-faint)] group-hover:text-[color:var(--color-ink-soft)] transition-colors">
          {autoFocusKey ? `press ${autoFocusKey.toUpperCase()} — ` : ''}add coursework or an exam…
        </span>
      </button>
    );
  }

  return (
    <div className="slip pl-6 pr-3 py-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
              e.preventDefault();
              parse();
            }
            if (e.key === 'Escape') { setOpen(false); setValue(''); }
          }}
          onBlur={(e) => {
            const next = e.relatedTarget;
            const row = e.currentTarget.parentElement;
            if (!value.trim() && (!(next instanceof Node) || !row?.contains(next))) setOpen(false);
          }}
          placeholder="e.g. Essay @bio101 due:+7 ~90m"
          className="min-w-0 flex-1 bg-transparent outline-none text-[14px] placeholder:text-[color:var(--color-ink-faint)]"
          aria-label="Coursework or exam title and course"
        />
        <button className="xbtn" onMouseDown={(e) => e.preventDefault()} onClick={parse} title="Add this commitment" aria-label="Add commitment">
          <CornerDownLeft size={15} />
        </button>
      </div>
      <p className="mono text-[10px] leading-relaxed text-[color:var(--color-ink-faint)] mt-1.5">
        Optional: <code>#assignment</code> · <code>due:+7</code> · <code>~90m</code>
      </p>
      <p role="status" className="text-[12px] text-[color:var(--color-ink-soft)] empty:hidden">{flash}</p>
      {value.trim() && !flash && (
        <div className="mono text-[9.5px] text-[color:var(--color-ink-soft)] mt-1" aria-live="polite">
          {describeParsed(parsed) || 'parsed: title only — add @course #type due: ~min !pin'}
        </div>
      )}
    </div>
  );
}

interface Parsed {
  title: string;
  course?: Course;
  type: CommitmentType;
  due: string;
  minutes: number;
  pinned: boolean;
}

export function parseQuick(raw: string, courses: Course[]): Parsed {
  let rest = raw.trim();
  let course: Course | undefined;
  let type: CommitmentType = 'assignment';
  let due = todayISO();
  let minutes = 60;
  let pinned = false;

  const courseMatch = rest.match(/@(\w[\w-]*)/i);
  if (courseMatch) {
    const code = courseMatch[1].toLowerCase();
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    // '@math241' should file under 'MATH 241' — compare space-insensitive,
    // then allow prefix matches ('@math' → MATH 241) and exact raw codes.
    course = courses.find((c) => {
      const cnorm = norm(c.code);
      return cnorm === code || cnorm.startsWith(code) || c.code.toLowerCase() === code;
    });
    rest = rest.replace(courseMatch[0], ' ');
  }
  const typeMatch = rest.match(/#(\w+)/);
  if (typeMatch) {
    const t = typeMatch[1].toLowerCase();
    const known: CommitmentType[] = ['assignment', 'exam', 'quiz', 'reading', 'project', 'lab', 'custom'];
    if (known.includes(t as CommitmentType)) type = t as CommitmentType;
    rest = rest.replace(typeMatch[0], ' ');
  }
  const dueMatch = rest.match(/due:(\S+)/i);
  if (dueMatch) {
    const d = dueMatch[1].toLowerCase();
    let dueParsed = false;
    const setDue = (iso: string) => { due = iso; dueParsed = true; };
    /* weekday names land on the next occurrence — 'due:fri' on a Tuesday
       is the coming Friday, not a silent title token */
    const DOW: Record<string, number> = {
      sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
      wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
      fri: 5, friday: 5, sat: 6, saturday: 6,
    };
    if (d === 'today') setDue(todayISO());
    else if (d === 'tomorrow') setDue(addDays(todayISO(), 1));
    else if (/^\+(\d+)d?$/.test(d)) setDue(addDays(todayISO(), Number(d.slice(1).replace('d', ''))));
    else if (d in DOW) {
      const delta = (DOW[d] - new Date().getDay() + 7) % 7 || 7;
      setDue(addDays(todayISO(), delta));
    }
    else if (/^\d{4}-\d{2}-\d{2}$/.test(d) && isRealDate(d)) setDue(d);
    else if (/^(\d{1,2})\/(\d{1,2})$/.test(d)) {
      const [m, dd] = d.split('/').map(Number);
      // m/d means this year if it hasn't passed, else next — but only
      // when the civil date actually exists (13/40 must not roll over).
      const y = new Date().getFullYear();
      for (const yy of [y, y + 1]) {
        const cand = `${yy}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        if (isRealDate(cand) && cand >= todayISO()) { setDue(cand); break; }
      }
    }
    /* only consume the token when a branch actually parsed it — an
       unrecognized 'due:xyz' in the raw text stays in the title where the
       user can see it, not silently eaten with the default date kept */
    if (dueParsed) rest = rest.replace(dueMatch[0], ' ');
  }
  // Match hours first so `~4h` is not mistaken for a four-minute estimate.
  const hourMatch = rest.match(/~(\d+(?:\.\d+)?)\s*h\b/i);
  if (hourMatch) {
    minutes = Math.min(2400, Math.max(15, Math.round(Number(hourMatch[1]) * 60)));
    rest = rest.replace(hourMatch[0], ' ');
  }
  const minMatch = rest.match(/~(\d+)\s*(?:m|min)?\b/i);
  if (minMatch) {
    minutes = Math.min(2400, Math.max(15, Number(minMatch[1])));
    rest = rest.replace(minMatch[0], ' ');
  }
  // '!pin'/'!pinned' is the pin token — a bare '!' is punctuation and stays
  // in the title.
  const pinMatch = rest.match(/!pin(?:ned)?\b/i);
  if (pinMatch) {
    pinned = true;
    rest = rest.replace(pinMatch[0], ' ');
  }
  rest = rest.replace(/\s+/g, ' ').trim();
  return { title: rest, course, type, due, minutes, pinned };
}

function describeParsed(p: Parsed): string {
  const parts: string[] = [];
  if (p.course) parts.push(`@${p.course.code}`);
  if (p.type !== 'assignment') parts.push(p.type);
  parts.push(stampDate(p.due));
  parts.push(fmtMinutes(p.minutes));
  if (p.pinned) parts.push('pinned');
  return `parsed: ${parts.join(' · ')}`;
}

/** True when 'YYYY-MM-DD' names a real civil date (not 2026-13-40 or Feb 30). */
function isRealDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00`);
  return !isNaN(d.getTime()) && addDays(iso, 0) === iso;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
