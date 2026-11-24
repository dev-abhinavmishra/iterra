import { useMemo, useState } from 'react';
import { Button, Dialog } from '../../../ui/primitives';
import { execCommand } from '../../../integration/commands';
import { defaultUrlForRef } from '../../../integration/identity';
import { openTerrain } from '../components/terrain';
import { reviewCardBack, reviewCardFront, reviewQuestions } from '../lib/review';
import type { Scan, Test } from '../store';

type SavedReview = { blockRef?: string; deckRef?: string; warning?: string };

export function AssessmentReview({ test, scans, scope, courseId, onClose }: {
  test: Test;
  scans: Scan[];
  scope: string;
  courseId?: string;
  onClose: () => void;
}) {
  const questions = useMemo(() => reviewQuestions(test, scans), [test, scans]);
  const [selected, setSelected] = useState(() => new Set(questions.slice(0, 5).map(question => question.number)));
  const [topics, setTopics] = useState('');
  const [deck, setDeck] = useState(true);
  const [block, setBlock] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<SavedReview | null>(null);
  /* per-question prompt edits for deck cards — prefilled from
     test.questionPrompts when the assessment carries question text */
  const [promptEdits, setPromptEdits] = useState<Record<number, string>>({});
  const selectedQuestions = questions.filter(question => selected.has(question.number)).map(question => question.number);
  const selectedTopics = topics.split(',').map(topic => topic.trim()).filter(Boolean);
  const makeDeck = deck && selectedQuestions.length > 0;
  const makeBlock = block && (selectedQuestions.length > 0 || selectedTopics.length > 0);
  const selectedQuestionObjs = questions.filter(question => selected.has(question.number));
  const promptFor = (question: (typeof questions)[number]) => promptEdits[question.number] ?? question.prompt ?? '';
  const missingPrompts = makeDeck
    ? selectedQuestionObjs.filter(question => !promptFor(question).trim()).map(question => question.number)
    : [];

  const save = async () => {
    if (saving || (!makeBlock && !makeDeck)) return;
    if (missingPrompts.length > 0) {
      setError(`Add the question text for question${missingPrompts.length > 1 ? 's' : ''} ${missingPrompts.join(', ')} so the cards work without the answer sheet.`);
      return;
    }
    setSaving(true);
    setError('');
    const cards = makeDeck
      ? selectedQuestionObjs.map(question => ({
          id: `question-${question.number}`,
          q: reviewCardFront({ number: question.number, topic: question.topic, prompt: promptFor(question) }),
          a: reviewCardBack(question),
          ex: `Question ${question.number} from ${test.name}${question.topic ? ` · ${question.topic}` : ''}.`,
        }))
      : undefined;
    try {
      const result = await execCommand<SavedReview>('createTargetedReview', {
        assessmentRef: `gradestack:assessment:${test.id}`,
        selectedQuestions,
        selectedTopics,
        scanIds: scans.map(scan => scan.id),
        reviewKind: makeDeck ? (makeBlock ? 'both' : 'flashcards-deck') : 'syllabus-block',
        course: test.courseName,
        courseId,
        ...(cards ? { cards } : {}),
      });
      if (result.ok && result.data) setSaved(result.data);
      else setError(result.error || 'Could not save the review. Try again.');
    } catch {
      setError('Could not save the review. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const openSaved = (ref: string) => {
    onClose();
    openTerrain(defaultUrlForRef(ref));
  };

  return (
    <Dialog open onClose={() => { if (!saving) onClose(); }} title="Plan assessment review" subtitle={`${test.name} · ${scope}`} maxWidth="max-w-xl">
      {saved ? (
        <div className="space-y-4">
          <p role="status" className="text-sm">Saved {saved.blockRef && saved.deckRef ? 'a study block and a deck' : saved.blockRef ? 'a study block' : 'a deck'} linked to this assessment.</p>
          {saved.warning && <p role="alert" className="text-sm text-[var(--color-warn)]">{saved.warning}</p>}
          <div className="flex flex-wrap gap-2 justify-end">
            <Button size="sm" onClick={onClose}>Done</Button>
            {saved.deckRef && <Button size="sm" variant={saved.blockRef ? 'secondary' : 'primary'} onClick={() => openSaved(saved.deckRef!)}>Open review deck</Button>}
            {saved.blockRef && <Button size="sm" variant="primary" onClick={() => openSaved(saved.blockRef!)}>Open study block</Button>}
          </div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
          {questions.length > 0 ? (
            <fieldset>
              <legend className="text-sm font-semibold">Questions to revisit</legend>
              <p className="mt-1 text-xs text-[var(--color-mute)]">Based on confirmed sheets. Cards ask “Why is this answer correct?” — add question text where it is missing so the deck works without the answer sheet.</p>
              <div className="mt-2 max-h-[28vh] overflow-y-auto divide-y divide-[var(--color-line)]">
                {questions.map(question => (
                  <label className="flex items-start gap-2 py-2 text-sm" key={question.number}>
                    <input type="checkbox" className="mt-1 accent-[var(--color-accent)]" checked={selected.has(question.number)}
                      onChange={event => {
                        const next = new Set(selected);
                        if (event.target.checked) next.add(question.number); else next.delete(question.number);
                        setSelected(next);
                      }} />
                    <span className="min-w-0 flex-1">Question {question.number}{question.topic ? ` · ${question.topic}` : ''}</span>
                    <span className="text-xs text-[var(--color-mute)]">{question.missed} of {question.answered} missed</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : <p className="text-sm text-[var(--color-mute)]">There are no confirmed missed answers in these results. Add a topic to plan time for it.</p>}
          <label className="block text-sm">
            <span>Add topics <span className="text-xs text-[var(--color-mute)]">(optional, separated by commas)</span></span>
            <input className="it-input mt-1 w-full" value={topics} onChange={event => setTopics(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <label className="flex gap-2"><input type="checkbox" checked={block} onChange={event => setBlock(event.target.checked)} /> Plan a study block</label>
            {questions.length > 0 && <label className="flex gap-2"><input type="checkbox" checked={deck} onChange={event => setDeck(event.target.checked)} /> Make answer-key cards</label>}
          </div>
          {makeDeck && (
            <fieldset>
              <legend className="text-sm font-semibold">Question prompts for cards</legend>
              <p className="mt-1 text-xs text-[var(--color-mute)]">Each card shows the question on the front and “Answer: … · Why is this answer correct?” on the back. Fill in the question text — a number and answer letter alone is not enough to practice.</p>
              <div className="mt-2 max-h-[30vh] space-y-3 overflow-y-auto">
                {selectedQuestionObjs.map(question => (
                  <label className="block text-sm" key={question.number}>
                    <span className="font-medium">Question {question.number}{question.topic ? ` · ${question.topic}` : ''} <span className="text-xs font-normal text-[var(--color-mute)]">— answer {question.answer}</span></span>
                    <textarea
                      className="it-input mt-1 w-full"
                      rows={2}
                      required
                      placeholder="Question text…"
                      value={promptFor(question)}
                      onChange={event => setPromptEdits(previous => ({ ...previous, [question.number]: event.target.value }))}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {error && <p role="alert" className="text-sm text-[var(--color-bad)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" size="sm" variant="primary" disabled={saving || (!makeBlock && !makeDeck)}>{saving ? 'Saving…' : 'Save review'}</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
