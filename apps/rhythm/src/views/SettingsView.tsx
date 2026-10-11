// ── Settings — the registrar's back office ───────────────────────────────────
// Register preferences, courses, suite base URLs, and the export/restore desk.
// Everything lives on this device; export is the whole register, one document.

import { useRef, useState } from 'react';
import { useRegister } from '../store';
import { Field } from '../components/Field';
import { Sheet } from '../components/Sheet';
import { RoutineForm } from '../components/RoutineForm';
import { cx } from '../lib/utils';

export function SettingsView() {
  const s = useRegister();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [routineOpen, setRoutineOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  const download = () => {
    const blob = new Blob([s.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rhythm-register-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('The register was exported as one JSON document.');
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-5">
        <div className="kicker mb-1">Back office</div>
        <h1 className="datestamp text-2xl">Register settings</h1>
      </div>

      {/* ── Routines ─────────────────────────────────────────────── */}
      <section className="slip mb-5 p-4" aria-label="routines">
        <div className="mb-2 flex items-center justify-between">
          <span className="kicker">Routines on file</span>
          <button className="btn btn--quiet !px-2 !py-1" onClick={() => setRoutineOpen(true)}>
            + file a routine
          </button>
        </div>
        {Object.values(s.routines).length === 0 && (
          <p className="text-[12.5px] text-ink-faint">None yet — file the first line of the register.</p>
        )}
        {Object.values(s.routines).map((r) => (
          <div key={r.id} className="lrow flex items-center justify-between py-1.5 text-[13px]">
            <span className="flex items-center gap-2">
              <i className="inline-block h-3 w-3 rounded-full" style={{ background: `var(--color-acc-${r.accent})` }} />
              {r.name}
            </span>
            <span className="mono text-[10px] uppercase text-ink-faint">
              {r.status === 'active' ? `${r.target.perWeek}×/wk` : r.status}
            </span>
          </div>
        ))}
      </section>

      {/* ── Preferences ──────────────────────────────────────────── */}
      <section className="slip mb-5 p-4" aria-label="preferences">
        <div className="kicker mb-3">Preferences</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Week starts on">
            <select
              className="f-select"
              value={s.settings.weekStartsOn}
              onChange={(e) => s.updateSettings({ weekStartsOn: Number(e.target.value) as 0 | 1 })}
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </select>
          </Field>
          <Field label="Motion">
            <select
              className="f-select"
              value={s.settings.motion}
              onChange={(e) => s.updateSettings({ motion: e.target.value as 'full' | 'reduced' })}
            >
              <option value="full">Full — stamps press, pages turn</option>
              <option value="reduced">Reduced — instant marks</option>
            </select>
          </Field>
        </div>
      </section>

      {/* ── Courses ──────────────────────────────────────────────── */}
      <section className="slip mb-5 p-4" aria-label="courses">
        <div className="kicker mb-2">Courses (context for routines + filters)</div>
        {Object.values(s.courses).map((c) => (
          <div key={c.id} className="lrow flex items-center justify-between py-1.5 text-[13px]">
            <span>
              {c.name} {c.code && <span className="mono text-[10px] uppercase text-ink-faint">{c.code}</span>}
            </span>
            <button className="mono text-[10px] uppercase text-ink-faint underline" onClick={() => s.removeCourse(c.id)}>
              strike
            </button>
          </div>
        ))}
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!courseName.trim()) return;
            s.addCourse({ name: courseName, code: courseCode || undefined });
            setCourseName('');
            setCourseCode('');
          }}
        >
          <input className="f-input !w-40" value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="course name" />
          <input className="f-input !w-24" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder="HIST 140" />
          <button type="submit" className="btn btn--quiet" disabled={!courseName.trim()}>
            File course
          </button>
        </form>
      </section>

      {/* ── Suite base URLs ──────────────────────────────────────── */}
      <section className="slip mb-5 p-4" aria-label="suite links">
        <div className="kicker mb-2">Suite addresses</div>
        <p className="mb-3 text-[11.5px] text-ink-faint">
          Used for evidence links and connection hints. Leave defaults unless a sibling app lives
          somewhere else.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['timerBaseUrl', 'Timer'],
              ['flashcardsBaseUrl', 'Flashcards'],
              ['inkBaseUrl', 'Ink'],
              ['syllabusBaseUrl', 'Syllabus'],
              ['proofBaseUrl', 'Proof'],
              ['gradestackBaseUrl', 'GradeStack'],
              ['modularBaseUrl', 'Modular AI'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                className="f-input mono !text-[11.5px]"
                value={s.settings[key]}
                onChange={(e) => s.updateSettings({ [key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
      </section>

      {/* ── Export / restore ─────────────────────────────────────── */}
      <section className="slip mb-5 p-4" aria-label="backup">
        <div className="kicker mb-2">The register, in one document</div>
        <p className="mb-3 text-[12px] leading-snug text-ink-soft">
          Local-first means you hold the file. Export carries every routine, line, event, mapping,
          exception, friction note, review, experiment, and setting.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn--primary" onClick={download}>
            Export JSON
          </button>
          <button className="btn btn--quiet" onClick={() => fileRef.current?.click()}>
            Restore…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const res = s.importJSON(await f.text());
              setMsg(res.ok ? 'Register restored from backup.' : `Restore failed: ${res.error}`);
              e.target.value = '';
            }}
          />
        </div>
        {msg && <p className="mt-2 text-[12px] text-indigo">{msg}</p>}
      </section>

      {/* ── Danger ───────────────────────────────────────────────── */}
      <section className="slip p-4" aria-label="danger">
        <div className="kicker mb-2">Close the register</div>
        <p className="mb-3 text-[12px] text-ink-soft">
          Strikes every line. Export first — there is no undo for a closed register.
        </p>
        <button className={cx('btn', resetConfirm ? 'btn--danger' : 'btn--quiet')} onClick={() => (resetConfirm ? (s.resetRegister(), setResetConfirm(false)) : setResetConfirm(true))}>
          {resetConfirm ? 'Really strike everything?' : 'Reset the register…'}
        </button>
      </section>

      {routineOpen && (
        <Sheet title="File a routine" onClose={() => setRoutineOpen(false)} wide>
          <RoutineForm onDone={() => setRoutineOpen(false)} autofocusName />
        </Sheet>
      )}
    </div>
  );
}
