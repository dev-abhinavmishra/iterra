import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkbench } from '../store';
import type { Attempt } from '../lib/types';
import { errorRecurrence } from '../lib/metrics';
import { docToText } from '../lib/doc';
import { cn, fmtDateTime } from '../lib/utils';
import { Field } from '../components/Field';
import type { ViewKey } from '../components/TopTabs';
import { Play, RotateCcw, Wrench } from 'lucide-react';

const CAT_LABELS: Record<string, string> = {
  'conceptual-gap': 'conceptual gap',
  'wrong-strategy': 'wrong strategy',
  'algebra-arithmetic': 'algebra / arithmetic',
  'misread-prompt': 'misread prompt',
  'incomplete-explanation': 'incomplete explanation',
  'careless-execution': 'careless execution',
  none: 'no error',
  custom: 'custom',
};

export function LedgerView({ onAttempt, goView }: { onAttempt: (a: Attempt) => void; goView: (v: ViewKey) => void }) {
  const errors = useWorkbench(useShallow((s) => Object.values(s.errors).sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
  const problems = useWorkbench((s) => s.problems);
  const attempts = useWorkbench((s) => s.attempts);
  const reviews = useWorkbench((s) => s.reviews);
  const createSession = useWorkbench((s) => s.createSession);
  const startAttempt = useWorkbench((s) => s.startAttempt);
  const [filter, setFilter] = useState('');

  const recurrence = useMemo(() => errorRecurrence(errors), [errors]);
  const filtered = errors.filter((e) => {
    if (!filter) return true;
    const k = e.category === 'custom' ? `custom:${e.customLabel ?? 'custom'}` : e.category;
    return k === filter;
  });

  // repair session: problems that carry the filtered error class and still
  // have a pending retry or were never re-attempted correctly
  const repair = () => {
    const pids = [...new Set(
      filtered
        .map((e) => e.problemId)
        .filter((pid) => {
          const p = problems[pid];
          if (!p || p.archived) return false;
          const later = Object.values(attempts)
            .filter((a) => a.problemId === pid)
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
          return !later || later.result !== 'correct';
        }),
    )];
    if (!pids.length) return;
    const s = createSession(
      { courseIds: [], topics: [], minDifficulty: 1, maxDifficulty: 5, minutes: 30, newRatio: 0, order: 'interleaved' },
      `repair — ${filter || 'all errors'}`,
    );
    // createSession builds its own list; override with the repair set
    useWorkbench.setState((st) => ({
      sessions: { ...st.sessions, [s.id]: { ...s, problemIds: pids } },
    }));
    const a = startAttempt(pids[0], s.id);
    onAttempt(a);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <div className="pad mt-3 p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="kicker">error ledger — recurring weaknesses, not a blame list</div>
            <p className="mt-1 text-[13px] text-[var(--color-ink-soft)]">
              Every classified miss lands here. Filter the class, read the examples, schedule the repair.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <Field label="Category">
              <select className="f-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">all</option>
                {recurrence.map((r) => (
                  <option key={r.category} value={r.category}>
                    {CAT_LABELS[r.category] ?? r.category.replace('custom:', 'custom — ')} ({r.count})
                  </option>
                ))}
              </select>
            </Field>
            <button className="btn btn--correct" onClick={repair} disabled={!filtered.length} title="Build a session from unresolved problems in this class">
              <span className="inline-flex items-center gap-1.5"><Wrench size={12} /> Schedule repair</span>
            </button>
          </div>
        </div>

        {recurrence.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-3">
            {recurrence.map((r) => (
              <button
                key={r.category}
                className={cn('film flex items-center gap-2 rounded px-3 py-1.5 text-left', filter === r.category && 'ring-1 ring-[var(--color-correct)]')}
                onClick={() => setFilter(filter === r.category ? '' : r.category)}
              >
                <span className="mono text-[15px] font-semibold text-[var(--color-correct-deep)]">{r.count}</span>
                <span className="text-[12px] text-[var(--color-ink-soft)]">
                  {CAT_LABELS[r.category] ?? r.category.replace('custom:', 'custom — ')}
                </span>
              </button>
            ))}
          </div>
        )}

        {!filtered.length && (
          <div className="py-10 text-center text-[13px] text-[var(--color-ink-soft)]">
            {errors.length ? 'Nothing in this class.' : 'No errors filed yet — misses classify themselves in Compare.'}
          </div>
        )}

        <ul className="divide-y divide-[var(--color-rule)]">
          {filtered.map((e) => {
            const p = problems[e.problemId];
            const a = attempts[e.attemptId];
            const due = reviews[e.problemId]?.dueAt;
            return (
              <li key={e.id} className="py-3">
                <div className="flex items-start gap-3">
                  <span className="chip chip--violet mt-0.5 shrink-0">
                    {e.category === 'custom' ? e.customLabel : CAT_LABELS[e.category] ?? e.category}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px]">{p ? docToText(p.promptDoc, 160) : '(problem removed)'}</div>
                    {e.divergence && (
                      <div className="margin-note mt-1.5 text-[12px]">
                        <span className="kicker !text-[9px] !text-[var(--color-correct-deep)]">broke —</span> {e.divergence}
                      </div>
                    )}
                    {e.repairCue && (
                      <div className="mt-0.5 text-[12px] text-[var(--color-blueprint-deep)]">
                        <span className="kicker !text-[9px]">cue</span> {e.repairCue}
                      </div>
                    )}
                    <div className="mt-1 text-[10.5px] text-[var(--color-ink-faint)]">
                      {fmtDateTime(e.createdAt)}
                      {p && ` · ${p.topic}`}
                      {due && ` · retry due ${fmtDateTime(due)}`}
                      {a && ` · conf ${a.confidence}/5 · h${a.hintLevel}`}
                    </div>
                  </div>
                  {p && (
                    <button
                      className="btn btn--blueprint !px-3 !py-1.5"
                      onClick={() => {
                        const att = startAttempt(p.id);
                        onAttempt(att);
                      }}
                      title="Attempt this problem again"
                    >
                      <span className="inline-flex items-center gap-1"><Play size={11} /> Retry</span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 text-[11.5px] text-[var(--color-ink-faint)]">
          <RotateCcw size={11} className="mr-1 inline" />
          Retries live on the session queue — <button className="underline" onClick={() => goView('session')}>open session builder</button>
        </div>
      </div>
    </div>
  );
}
