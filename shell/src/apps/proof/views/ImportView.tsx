import { useState } from 'react';
import { useWorkbench } from '../store';
import { extractDrafts, parseItemAnalysis, type DraftProblem } from '../lib/imports';
import { parseProblemSet } from '../lib/backup';
import { docToText } from '../lib/doc';
import { cn } from '../lib/utils';
import { Field } from '../components/Field';
import type { ViewKey } from '../components/TopTabs';
import { FileUp, ClipboardPaste, CheckSquare, Square } from 'lucide-react';

type Tab = 'worksheet' | 'gradestack' | 'set';

export function ImportView({ goView }: { goView: (v: ViewKey) => void }) {
  const importDrafts = useWorkbench((s) => s.importDrafts);
  const importProblemSet = useWorkbench((s) => s.importProblemSet);
  const courses = useWorkbench((s) => s.courses);

  const [tab, setTab] = useState<Tab>('worksheet');
  const [raw, setRaw] = useState('');
  const [source, setSource] = useState('worksheet');
  const [drafts, setDrafts] = useState<DraftProblem[]>([]);
  const [error, setError] = useState('');
  const [filed, setFiled] = useState(0);

  const extract = () => {
    setError('');
    setFiled(0);
    try {
      if (tab === 'gradestack') setDrafts(parseItemAnalysis(raw));
      else setDrafts(extractDrafts(raw, source));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse that input');
      setDrafts([]);
    }
  };

  const fileAll = () => {
    const chosen = drafts.filter((d) => d.selected);
    if (!chosen.length) return;
    importDrafts(chosen);
    setFiled(chosen.length);
    setDrafts([]);
    setRaw('');
  };

  const importSet = (file: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const { problems, rubrics } = parseProblemSet(String(r.result));
        const n = importProblemSet(problems, rubrics);
        setFiled(n);
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Not a problem set file');
      }
    };
    r.readAsText(file);
  };

  const patch = (id: string, p: Partial<DraftProblem>) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)));

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <div className="pad mt-3 p-5">
        <div className="kicker">import — everything is reviewed by a human before it files</div>
        <p className="mb-4 mt-1 text-[13px] text-[var(--color-ink-soft)]">
          Paste worksheet text (from Modular AI extraction, a textbook page, anywhere) or a
          GradeStack item-analysis export. Nothing files itself — you pick what earns a slot.
        </p>

        <div className="mb-3 flex gap-1.5">
          {([['worksheet', 'worksheet text'], ['gradestack', 'gradestack JSON'], ['set', 'problem set file']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} className={cn('chip cursor-pointer', tab === k && 'chip--blue !border-[var(--color-blueprint)]')} onClick={() => { setTab(k); setDrafts([]); setError(''); }}>
              {l}
            </button>
          ))}
        </div>

        {tab === 'set' ? (
          <div className="film rounded p-5 text-center">
            <label className="btn btn--blueprint cursor-pointer">
              <span className="inline-flex items-center gap-1.5"><FileUp size={13} /> Choose .proof-set.json</span>
              <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importSet(e.target.files[0])} />
            </label>
            <div className="mt-2 text-[11.5px] text-[var(--color-ink-faint)]">Shared problem sets export from Settings → share a set.</div>
          </div>
        ) : (
          <div>
            {tab === 'worksheet' && (
              <div className="mb-2 flex items-end gap-2">
                <Field label="Source label">
                  <input className="f-input w-56" value={source} onChange={(e) => setSource(e.target.value)} placeholder="worksheet, textbook ch.4…" />
                </Field>
                <Field label="Course (optional)">
                  <select className="f-select w-44" onChange={(e) => setDrafts((ds) => ds.map((d) => ({ ...d, courseId: e.target.value } as DraftProblem)))}>
                    <option value="">— none —</option>
                    {Object.values(courses).filter((c) => !c.archived).map((c) => (
                      <option key={c.id} value={c.id}>{c.code}</option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <textarea
              className="f-textarea font-mono text-[12px]"
              rows={8}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={tab === 'worksheet'
                ? '1. A projectile leaves at 20 m/s…\n2. Differentiate x^2 sin(x)…\n\nProblems split on numbered lines or blank-line blocks.'
                : '[{"question": "…", "answer": "…", "missRate": 0.7, "topic": "…"}, …] — hardest items become proposed repair problems.'}
            />
            <div className="mt-2 flex items-center gap-2">
              <button className="btn btn--blueprint" onClick={extract} disabled={!raw.trim()}>
                <span className="inline-flex items-center gap-1.5"><ClipboardPaste size={12} /> Extract for review</span>
              </button>
              {error && <span className="mark mark--incorrect">✕ {error}</span>}
            </div>
          </div>
        )}

        {drafts.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="kicker">{drafts.filter((d) => d.selected).length} of {drafts.length} selected</span>
              <div className="flex gap-1">
                <button className="xbtn mono text-[10px]" onClick={() => setDrafts((ds) => ds.map((d) => ({ ...d, selected: true })))}>all</button>
                <button className="xbtn mono text-[10px]" onClick={() => setDrafts((ds) => ds.map((d) => ({ ...d, selected: false })))}>none</button>
              </div>
            </div>
            <ul className="divide-y divide-[var(--color-rule)]">
              {drafts.map((d) => (
                <li key={d.id} className={cn('py-2.5', !d.selected && 'opacity-50')}>
                  <div className="flex items-start gap-2.5">
                    <button className="xbtn mt-0.5" onClick={() => patch(d.id, { selected: !d.selected })} aria-label={d.selected ? 'unselect' : 'select'}>
                      {d.selected ? <CheckSquare size={15} className="text-[var(--color-blueprint)]" /> : <Square size={15} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] leading-snug">{docToText(d.promptDoc, 220)}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <input className="f-input !w-40 !py-1 !text-[11.5px]" value={d.topic} onChange={(e) => patch(d.id, { topic: e.target.value })} placeholder="topic" />
                        <select className="f-select !w-24 !py-1 !text-[11.5px]" value={d.difficulty} onChange={(e) => patch(d.id, { difficulty: Number(e.target.value) as DraftProblem['difficulty'] })}>
                          {[1, 2, 3, 4, 5].map((x) => <option key={x} value={x}>{x} — {['', 'routine', 'standard', 'tricky', 'hard', 'brutal'][x]}</option>)}
                        </select>
                        <input className="f-input !w-44 !py-1 !text-[11.5px]" value={d.answerText} onChange={(e) => patch(d.id, { answerText: e.target.value })} placeholder="expected answer (optional)" />
                        <input className="f-input !w-36 !py-1 !text-[11.5px]" value={d.tags.join(', ')} onChange={(e) => patch(d.id, { tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} placeholder="tags" />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <button className="btn btn--blueprint mt-3" onClick={fileAll}>
              File {drafts.filter((d) => d.selected).length} reviewed problems
            </button>
          </div>
        )}

        {filed > 0 && (
          <div className="mark mark--correct mt-3">
            ✓ {filed} problem{filed > 1 ? 's' : ''} filed — <button className="underline" onClick={() => goView('library')}>open the library</button>
          </div>
        )}
      </div>
    </div>
  );
}
