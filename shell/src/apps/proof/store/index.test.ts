import { beforeEach, describe, expect, it, vi } from 'vitest';

const installStorage = () => {
  const mem = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
};

beforeEach(() => {
  vi.resetModules();
  installStorage();
});

const problemInput = {
  topic: 'algebra',
  promptDoc: 'Solve for x.',
  answerSpec: { kind: 'open' } as const,
  workedSolutionDoc: '',
  hints: ['name the invariant'],
  tags: [],
  difficulty: 3 as const,
  attachments: [],
};

describe('error-cue hints', () => {
  it('persists a filed repair cue on the problem without auto-revealing it', async () => {
    const { useWorkbench } = await import('./index');
    const s = useWorkbench.getState();
    const p = s.addProblem(problemInput);
    const first = s.startAttempt(p.id);
    s.submitAttempt(first.id, { result: 'incorrect', resultSource: 'auto' });

    const err = s.fileError({
      attemptId: first.id,
      category: 'wrong-strategy',
      divergence: 'isolated too early',
      repairCue: 'check the units before solving',
      divergentSteps: [0],
    });

    const cue = useWorkbench.getState().problems[p.id].errorCues?.[0];
    expect(cue).toMatchObject({
      text: 'check the units before solving',
      sourceAttemptId: first.id,
      sourceErrorId: err.id,
    });

    const retry = useWorkbench.getState().startAttempt(p.id);
    expect(useWorkbench.getState().attempts[retry.id].cueReveals ?? []).toEqual([]);

    useWorkbench.getState().revealCue(retry.id, cue!.id);
    expect(useWorkbench.getState().attempts[retry.id].cueReveals).toHaveLength(1);
  });

  it('stamps correct solves as independent, hint-assisted, or cue-assisted', async () => {
    const { useWorkbench } = await import('./index');
    const s = useWorkbench.getState();
    const p = s.addProblem(problemInput);
    const missed = s.startAttempt(p.id);
    s.submitAttempt(missed.id, { result: 'incorrect', resultSource: 'auto' });
    s.fileError({
      attemptId: missed.id,
      category: 'algebra-arithmetic',
      divergence: '',
      repairCue: 'keep the units attached',
      divergentSteps: [],
    });
    const cueId = useWorkbench.getState().problems[p.id].errorCues![0].id;

    const cueSolve = useWorkbench.getState().startAttempt(p.id);
    useWorkbench.getState().revealCue(cueSolve.id, cueId);
    useWorkbench.getState().submitAttempt(cueSolve.id, { result: 'correct', resultSource: 'auto' });
    expect(useWorkbench.getState().attempts[cueSolve.id].solveAssistance).toBe('cue-assisted');

    const independent = useWorkbench.getState().startAttempt(p.id);
    useWorkbench.getState().submitAttempt(independent.id, { result: 'correct', resultSource: 'auto' });
    expect(useWorkbench.getState().attempts[independent.id].solveAssistance).toBe('independent');

    const hinted = useWorkbench.getState().startAttempt(p.id);
    useWorkbench.getState().revealHint(hinted.id);
    useWorkbench.getState().submitAttempt(hinted.id, { result: 'correct', resultSource: 'auto' });
    expect(useWorkbench.getState().attempts[hinted.id].solveAssistance).toBe('hint-assisted');
  });

  it('keeps cue and assistance fields through backup export/import', async () => {
    const { useWorkbench } = await import('./index');
    const s = useWorkbench.getState();
    const p = s.addProblem(problemInput);
    const missed = s.startAttempt(p.id);
    s.submitAttempt(missed.id, { result: 'incorrect', resultSource: 'auto' });
    s.fileError({
      attemptId: missed.id,
      category: 'misread-prompt',
      divergence: '',
      repairCue: 'underline what is asked',
      divergentSteps: [],
    });
    const cueId = useWorkbench.getState().problems[p.id].errorCues![0].id;
    const retry = useWorkbench.getState().startAttempt(p.id);
    useWorkbench.getState().revealCue(retry.id, cueId);
    useWorkbench.getState().submitAttempt(retry.id, { result: 'correct', resultSource: 'self' });

    const json = useWorkbench.getState().exportJSON();
    const parsed = JSON.parse(json);
    expect(parsed.data.problems[p.id].errorCues).toHaveLength(1);
    expect(parsed.data.attempts[retry.id].solveAssistance).toBe('cue-assisted');

    expect(useWorkbench.getState().importJSON(json)).toEqual({ ok: true });
    const restored = useWorkbench.getState();
    expect(restored.problems[p.id].errorCues?.[0].text).toBe('underline what is asked');
    expect(restored.attempts[retry.id].cueReveals).toHaveLength(1);
    expect(restored.attempts[retry.id].solveAssistance).toBe('cue-assisted');
  });
});
