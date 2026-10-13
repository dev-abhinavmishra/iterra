import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkbench } from '../store';
import type { CourseColor, Rubric } from '../lib/types';
import { exportProblemSet } from '../lib/backup';
import { uid } from '../lib/utils';
import { Field } from '../components/Field';
import { Download, FileUp, Plus, Trash2 } from 'lucide-react';

const COLORS: CourseColor[] = ['oxblood', 'hunter', 'navy', 'ochre', 'plum', 'teal', 'slate', 'rust'];

export function SettingsView() {
  const settings = useWorkbench((s) => s.settings);
  const updateSettings = useWorkbench((s) => s.updateSettings);
  const courses = useWorkbench(useShallow((s) => Object.values(s.courses)));
  const addCourse = useWorkbench((s) => s.addCourse);
  const archiveCourse = useWorkbench((s) => s.archiveCourse);
  const rubrics = useWorkbench(useShallow((s) => Object.values(s.rubrics)));
  const addRubric = useWorkbench((s) => s.addRubric);
  const deleteRubric = useWorkbench((s) => s.deleteRubric);
  const problems = useWorkbench((s) => s.problems);
  const exportJSON = useWorkbench((s) => s.exportJSON);
  const importJSON = useWorkbench((s) => s.importJSON);
  const resetWorkbench = useWorkbench((s) => s.resetWorkbench);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [rubricTitle, setRubricTitle] = useState('');
  const [rubricCriteria, setRubricCriteria] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const download = (text: string, filename: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const urlFields: [keyof typeof settings, string][] = [
    ['timerBaseUrl', 'Timer'],
    ['inkBaseUrl', 'Ink'],
    ['modularBaseUrl', 'Modular AI'],
    ['flashcardsBaseUrl', 'Flashcards'],
    ['syllabusBaseUrl', 'Syllabus'],
    ['gradestackBaseUrl', 'GradeStack'],
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <div className="pad mt-3 space-y-6 p-5">
        <section>
          <div className="kicker mb-2">workbench</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Motion">
              <select className="f-select" value={settings.motion} onChange={(e) => updateSettings({ motion: e.target.value as 'full' | 'reduced' })}>
                <option value="full">full</option>
                <option value="reduced">reduced</option>
              </select>
            </Field>
            <Field label="Default session minutes">
              <input className="f-input" type="number" min={5} max={180} value={settings.defaultSessionMinutes} onChange={(e) => updateSettings({ defaultSessionMinutes: Number(e.target.value) || 30 })} />
            </Field>
          </div>
        </section>

        <section>
          <div className="kicker mb-2">suite base URLs — deep links retarget here</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {urlFields.map(([k, label]) => (
              <Field key={k} label={label}>
                <input className="f-input font-mono !text-[11.5px]" value={settings[k]} onChange={(e) => updateSettings({ [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        </section>

        <section>
          <div className="kicker mb-2">courses — problems file under these</div>
          <div className="flex items-end gap-2">
            <Field label="Code"><input className="f-input !w-32" value={code} onChange={(e) => setCode(e.target.value)} placeholder="PHYS201" /></Field>
            <Field label="Name"><input className="f-input !w-64" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mechanics" /></Field>
            <button
              className="btn btn--blueprint mb-0.5"
              disabled={!code.trim()}
              onClick={() => { addCourse({ code: code.trim().toUpperCase(), name: name.trim() || code.trim(), color: COLORS[Object.keys(courses).length % COLORS.length] }); setCode(''); setName(''); }}
            >
              <span className="inline-flex items-center gap-1"><Plus size={12} /> Add</span>
            </button>
          </div>
          <ul className="mt-2 divide-y divide-[var(--color-rule)]">
            {courses.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-1.5 text-[13px]">
                <span><span className="mono font-semibold">{c.code}</span> — {c.name} {c.archived && <em className="text-[var(--color-ink-faint)]">(archived)</em>}</span>
                <button className="xbtn mono text-[10px]" onClick={() => archiveCourse(c.id, !c.archived)}>{c.archived ? 'restore' : 'archive'}</button>
              </li>
            ))}
            {!courses.length && <li className="py-1.5 text-[12px] text-[var(--color-ink-faint)]">no courses yet</li>}
          </ul>
        </section>

        <section>
          <div className="kicker mb-2">rubrics — structured self-check for open work</div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="New rubric title"><input className="f-input" value={rubricTitle} onChange={(e) => setRubricTitle(e.target.value)} placeholder="Proof quality" /></Field>
            <Field label="Criteria — one per line" hint="levels are missing / partial / met">
              <textarea className="f-textarea !text-[12px]" rows={3} value={rubricCriteria} onChange={(e) => setRubricCriteria(e.target.value)} placeholder={'correct method chosen\nsteps justified\nanswer stated with units'} />
            </Field>
          </div>
          <button
            className="btn btn--blueprint"
            disabled={!rubricTitle.trim() || !rubricCriteria.trim()}
            onClick={() => {
              addRubric({
                title: rubricTitle.trim(),
                criteria: rubricCriteria.split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ id: uid('rc_'), text })),
                levels: ['missing', 'partial', 'met'],
                scoringMode: 'all-or-nothing',
              });
              setRubricTitle(''); setRubricCriteria('');
            }}
          >
            <span className="inline-flex items-center gap-1"><Plus size={12} /> Author rubric</span>
          </button>
          <ul className="mt-2 divide-y divide-[var(--color-rule)]">
            {rubrics.map((r: Rubric) => (
              <li key={r.id} className="flex items-start justify-between gap-2 py-1.5 text-[13px]">
                <span><span className="font-medium">{r.title}</span> — {r.criteria.map((c) => c.text).join('; ')}</span>
                <button className="xbtn" onClick={() => deleteRubric(r.id)} aria-label={`delete ${r.title}`}><Trash2 size={13} /></button>
              </li>
            ))}
            {!rubrics.length && <li className="py-1.5 text-[12px] text-[var(--color-ink-faint)]">no rubrics yet</li>}
          </ul>
        </section>

        <section>
          <div className="kicker mb-2">backup — every problem and attempt, export and restore</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn--blueprint" onClick={() => download(exportJSON(), `proof-backup-${new Date().toISOString().slice(0, 10)}.json`)}>
              <span className="inline-flex items-center gap-1.5"><Download size={12} /> Export everything</span>
            </button>
            <button className="btn btn--ghost" onClick={() => download(exportProblemSet(problems, useWorkbench.getState().rubrics), 'proof-set.json')}>
              Share problem set
            </button>
            <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
              <span className="inline-flex items-center gap-1.5"><FileUp size={12} /> Restore backup</span>
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => {
                  const res = importJSON(String(r.result));
                  setMsg(res.ok ? '✓ backup restored' : `✕ ${res.error}`);
                };
                r.readAsText(f);
                e.target.value = '';
              }} />
            <button
              className="btn btn--ghost"
              onClick={() => {
                if (window.confirm('Wipe the whole workbench? Problems, attempts, errors, sessions — all of it.')) {
                  resetWorkbench();
                  setMsg('workbench reset');
                }
              }}
            >
              Reset workbench
            </button>
          </div>
          {msg && <div className="mark mark--correct mt-2">{msg}</div>}
        </section>
      </div>
    </div>
  );
}
