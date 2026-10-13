import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useWorkbench,
  selectActiveProblems,
  selectAllTopics,
  selectAllTags,
} from '../store';
import type { Attempt, Problem } from '../lib/types';
import { docToText } from '../lib/doc';
import { specSummary } from '../lib/checking';
import { isDue } from '../lib/schedule';
import { cn } from '../lib/utils';
import { DocView } from '../components/DocView';
import { DiffMeter } from '../components/DiffMeter';
import { Field } from '../components/Field';
import { ProblemEditor } from './ProblemEditor';
import {
  Plus, Search, Archive, ArchiveRestore, Pencil, Play, RotateCcw,
  ChevronDown, ChevronRight,
} from 'lucide-react';

type ResultKind = 'correct' | 'partial' | 'incorrect';

function lastResult(attempts: Attempt[]): ResultKind | undefined {
  const g = attempts.filter((a) => a.result);
  return g.length ? g[g.length - 1].result : undefined;
}

export function LibraryView({ onAttempt }: { onAttempt: (a: Attempt) => void }) {
  const problems = useWorkbench(useShallow(selectActiveProblems));
  const archived = useWorkbench(useShallow((s) => Object.values(s.problems).filter((p) => p.archived)));
  const topics = useWorkbench(useShallow(selectAllTopics));
  const tags = useWorkbench(useShallow(selectAllTags));
  const reviews = useWorkbench((s) => s.reviews);
  const attempts = useWorkbench((s) => s.attempts);
  const courses = useWorkbench((s) => s.courses);
  const rubrics = useWorkbench((s) => s.rubrics);
  const startAttempt = useWorkbench((s) => s.startAttempt);

  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('');
  const [tag, setTag] = useState('');
  const [diff, setDiff] = useState(0);
  const [state, setState] = useState<'all' | 'new' | 'due' | 'missed'>('all');
  const [editing, setEditing] = useState<Problem | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return problems.filter((p) => {
      if (topic && p.topic !== topic) return false;
      if (tag && !p.tags.includes(tag)) return false;
      if (diff && p.difficulty !== diff) return false;
      if (state === 'new' && reviews[p.id]) return false;
      if (state === 'new' && Object.values(attempts).some((a) => a.problemId === p.id)) return false;
      if (state === 'due' && !isDue(reviews[p.id])) return false;
      if (state === 'missed') {
        const r = lastResult(Object.values(attempts).filter((a) => a.problemId === p.id));
        if (r !== 'incorrect' && r !== 'partial') return false;
      }
      if (needle) {
        const hay = `${p.promptDoc} ${p.topic} ${p.tags.join(' ')} ${p.source ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [problems, q, topic, tag, diff, state, reviews, attempts]);

  const begin = (p: Problem) => {
    const a = startAttempt(p.id);
    onAttempt(a);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <div className="pad mt-3 p-5">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Field label="Search the bank">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]" />
                <input
                  className="f-input !pl-8"
                  placeholder="prompt text, topic, tag, source…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </Field>
          </div>
          <Field label="Topic">
            <select className="f-select" value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">all topics</option>
              {topics.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Tag">
            <select className="f-select" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">all tags</option>
              {tags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Difficulty">
            <select className="f-select" value={diff} onChange={(e) => setDiff(Number(e.target.value))}>
              <option value={0}>any</option>
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>{d} — {['', 'routine', 'standard', 'tricky', 'hard', 'brutal'][d]}</option>
              ))}
            </select>
          </Field>
          <Field label="State">
            <select className="f-select" value={state} onChange={(e) => setState(e.target.value as typeof state)}>
              <option value="all">all</option>
              <option value="new">never attempted</option>
              <option value="due">due for retry</option>
              <option value="missed">last missed</option>
            </select>
          </Field>
          <button className="btn btn--blueprint" onClick={() => setEditing('new')}>
            <span className="inline-flex items-center gap-1.5"><Plus size={13} /> New problem</span>
          </button>
        </div>

        <div className="kicker mb-2">
          {filtered.length} of {problems.length} problems
        </div>

        {filtered.length === 0 && (
          <div className="py-10 text-center text-[13px] text-[var(--color-ink-soft)]">
            Nothing matches. Loosen a filter or file a new problem.
          </div>
        )}

        <ul className="divide-y divide-[var(--color-rule)]">
          {filtered.map((p) => (
            <ProblemRow
              key={p.id}
              problem={p}
              attempts={Object.values(attempts).filter((a) => a.problemId === p.id)}
              reviewDue={isDue(reviews[p.id])}
              courseCode={p.courseId ? courses[p.courseId]?.code : undefined}
              rubricTitle={p.answerSpec.kind === 'rubric' ? rubrics[p.answerSpec.rubricId]?.title : undefined}
              expanded={expanded === p.id}
              onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
              onEdit={() => setEditing(p)}
              onBegin={() => begin(p)}
            />
          ))}
        </ul>

        {archived.length > 0 && (
          <div className="mt-4">
            <button className="kicker flex items-center gap-1" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {archived.length} archived
            </button>
            {showArchived && (
              <ul className="mt-2 divide-y divide-[var(--color-rule)] opacity-70">
                {archived.map((p) => (
                  <ArchivedRow key={p.id} problem={p} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {editing && (
        <ProblemEditor
          problem={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ProblemRow({
  problem: p,
  attempts,
  reviewDue,
  courseCode,
  rubricTitle,
  expanded,
  onToggle,
  onEdit,
  onBegin,
}: {
  problem: Problem;
  attempts: Attempt[];
  reviewDue: boolean;
  courseCode?: string;
  rubricTitle?: string;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onBegin: () => void;
}) {
  const archiveProblem = useWorkbench((s) => s.archiveProblem);
  const res = lastResult(attempts);
  const unaided = attempts.filter((a) => a.result && a.hintLevel === 0);
  const unaidedHits = unaided.filter((a) => a.result === 'correct').length;
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <button className="xbtn mt-0.5 shrink-0" onClick={onToggle} aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] leading-snug">{docToText(p.promptDoc, 200) || <em className="text-[var(--color-ink-faint)]">empty prompt</em>}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="chip chip--blue">{p.topic || 'general'}</span>
            {courseCode && <span className="chip">{courseCode}</span>}
            <DiffMeter level={p.difficulty} />
            {p.tags.map((t) => (
              <span key={t} className="chip">#{t}</span>
            ))}
            {reviewDue && <span className="chip chip--violet" title="due for retry"><RotateCcw size={9} className="mr-0.5 inline" />due</span>}
            {res && (
              <span className={cn('mark text-[10px]', res === 'correct' ? 'mark--correct' : res === 'partial' ? 'mark--partial' : 'mark--incorrect')}>
                {res === 'correct' ? '✓' : res === 'partial' ? '◐' : '✕'} last {res}
              </span>
            )}
            {unaided.length > 0 && (
              <span className="chip" title="unaided successes / unaided attempts">
                {unaidedHits}/{unaided.length} unaided
              </span>
            )}
            {p.source && <span className="chip">{p.source}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button className="xbtn" title="Edit problem" aria-label="Edit problem" onClick={onEdit}>
            <Pencil size={14} />
          </button>
          <button
            className="xbtn"
            title="Archive problem"
            aria-label="Archive problem"
            onClick={() => archiveProblem(p.id, true)}
          >
            <Archive size={14} />
          </button>
          <button className="btn btn--blueprint !px-3 !py-1.5" onClick={onBegin} title="Start an attempt">
            <span className="inline-flex items-center gap-1"><Play size={11} /> Attempt</span>
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 grid gap-3 pl-9 md:grid-cols-2">
          <div className="film rounded p-3">
            <div className="kicker mb-1.5">prompt</div>
            <DocView doc={p.promptDoc} />
            {p.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {p.attachments.map((a) => (
                  <img key={a.id} src={a.dataUrl} alt={a.name} className="max-h-28 rounded border border-[var(--color-rule)]" />
                ))}
              </div>
            )}
          </div>
          <div className="film rounded p-3">
            <div className="kicker mb-1.5">answer — {specSummary(p.answerSpec, rubricTitle ? { title: rubricTitle } : undefined)}</div>
            <div className="text-[12px] text-[var(--color-ink-soft)]">
              {p.answerSpec.kind === 'rubric' && <span>rubric: {rubricTitle ?? 'missing'}</span>}
              {p.hints.length > 0 && <div className="mt-1">{p.hints.filter(Boolean).length} hint level(s) loaded</div>}
              {p.workedSolutionDoc.trim() ? (
                <div className="mt-1">{p.workedSolutionDoc.length} chars of worked solution</div>
              ) : (
                <div className="mark mark--hint mt-1">no worked solution filed</div>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function ArchivedRow({ problem: p }: { problem: Problem }) {
  const archiveProblem = useWorkbench((s) => s.archiveProblem);
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--color-ink-soft)]">
        {docToText(p.promptDoc, 120)} — <span className="mono">{p.topic}</span>
      </span>
      <button className="xbtn" title="Restore" aria-label="Restore" onClick={() => archiveProblem(p.id, false)}>
        <ArchiveRestore size={14} />
      </button>
    </li>
  );
}
