/* iterra bridges for the workbench (docs/ADAPTER.md):
   - <RetestChip>: links.for(proof:attempt:<id>).out to flashcards cards —
     'retest due' when a card's data.dueAt is past, else 'scheduled';
     click rides to the deck
   - <ToMarginButton>: sends the attempt to margin via note.create —
     a real note on the margin desk, then navigate to the returned url
   Guarded — standalone renders nothing. */
import { useEffect, useState } from 'react';
import type { Attempt, Problem } from '../lib/types';
import { docToText } from '../lib/doc';
import { openDeep } from '../lib/iterra';
import { SquareArrowOutUpRight } from 'lucide-react';

const iterra = () => (window as any).iterra;

export function RetestChip({ attemptId }: { attemptId: string }) {
  const [state, setState] = useState<{ due: boolean; url: string } | null>(null);

  useEffect(() => {
    let live = true;
    setState(null);
    const it = iterra();
    if (!it?.links?.for || !it?.store?.get) return;
    it.links
      .for(`proof:attempt:${attemptId}`)
      .then(async (res: any) => {
        const outs = ((res?.out ?? []) as Array<{ to?: string }>).filter((l) =>
          String(l?.to ?? '').startsWith('flashcards:card:'),
        );
        if (!live || !outs.length) return;
        let due = false;
        let url = '/apps/flashcards/';
        for (const l of outs) {
          const ent = await it.store.get(l.to).catch(() => null);
          if (!live) return;
          if (ent?.url) url = ent.url;
          const dueAt = ent?.data?.dueAt;
          if (dueAt != null && dueAt <= Date.now()) due = true;
          if (due) break;
        }
        if (live) setState({ due, url });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [attemptId]);

  if (!state) return null;
  return (
    <button
      type="button"
      className={state.due ? 'chip chip--violet' : 'chip'}
      title={state.due ? 'Retest cards from this attempt are due in flashcards' : 'Retest cards from this attempt live in a deck'}
      onClick={() => openDeep(state.url)}
    >
      {state.due ? 'retest due' : 'retest scheduled'} →
    </button>
  );
}

export function ToMarginButton({ attempt, problem }: { attempt: Attempt; problem: Problem }) {
  const [sent, setSent] = useState(false);
  const it = iterra();
  if (!it?.send) return null;

  /* the note body: the claim + the student's work, as plain text */
  const noteText = () => {
    const prompt = docToText(problem.promptDoc, 400);
    const steps = (attempt.work || [])
      .map((w, i) => `${i + 1}. ${docToText(w.text, 240)}`)
      .filter((l) => l.trim().length > 3);
    return [prompt, ...steps].join('\n').slice(0, 4000);
  };

  const send = async () => {
    const res = await it
      .send({
        to: 'margin',
        action: 'note.create',
        entity: {
          app: 'proof',
          type: 'attempt',
          id: attempt.id,
          title: `attempt — ${problem.topic || 'untitled'}`,
        },
        payload: { text: noteText() },
      })
      .catch(() => null);
    if (res && res.ok !== false) {
      setSent(true);
      openDeep(res.url || '/apps/margin/');
    }
  };

  return (
    <button
      className="btn btn--ghost !py-1.5"
      onClick={() => void send()}
      disabled={sent}
      title="Send this attempt to a new margin note"
    >
      <span className="inline-flex items-center gap-1.5">
        <SquareArrowOutUpRight size={12} /> {sent ? 'on the margin' : 'to margin'}
      </span>
    </button>
  );
}
