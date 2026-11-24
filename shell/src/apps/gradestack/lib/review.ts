import type { Scan, Test } from '../store';
import { answersMatch } from './grading';

/** Only reviewed sheets with a readable mark and a keyed answer provide evidence. */
export function questionResults(test: Test, scans: Scan[]) {
  const trusted = scans.filter(scan => scan.testId === test.id && !scan.needsReview);
  return Object.entries(test.answerKey ?? {}).flatMap(([key, answer]) => {
    const number = Number(key);
    if (!Number.isInteger(number) || number < 1 || number > test.numQuestions ||
        typeof answer !== 'string' || !answer.trim() || answer.trim() === '?') return [];
    let answered = 0;
    let missed = 0;
    for (const scan of trusted) {
      const response = scan.responses?.[number];
      if (typeof response !== 'string' || !response.trim() || response.trim() === '?') continue;
      answered++;
      if (!answersMatch(response, answer)) missed++;
    }
    if (!answered) return [];
    const topic = test.questionTopics?.[number];
    const prompt = test.questionPrompts?.[number];
    return [{
      number,
      answer: answer.trim(),
      answered,
      missed,
      topic: typeof topic === 'string' ? topic.trim() : undefined,
      prompt: typeof prompt === 'string' && prompt.trim() ? prompt.trim() : undefined,
    }];
  }).sort((a, b) => b.missed / b.answered - a.missed / a.answered ||
    b.missed - a.missed || a.number - b.number);
}

export function reviewQuestions(test: Test, scans: Scan[]) {
  return questionResults(test, scans).filter(question => question.missed > 0);
}

/** Card front for a missed question: heading plus the real prompt when one
    exists. A bare "Question 7" front is not practicable — callers must check
    `prompt` before using this for a deck. */
export function reviewCardFront(question: { number: number; topic?: string; prompt?: string }): string {
  const heading = `Question ${question.number}${question.topic ? ` · ${question.topic}` : ''}`;
  const prompt = question.prompt?.trim();
  return prompt ? `${heading}\n${prompt}` : heading;
}

/** Card back: the keyed answer plus the "why" prompt so the card teaches
    reasoning instead of only revealing a letter. */
export function reviewCardBack(question: { answer: string }): string {
  return `Answer: ${question.answer}\nWhy is this answer correct? Explain the reasoning in your own words, then check it against the original assessment.`;
}
