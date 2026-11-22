import type { ReactNode } from 'react';
import { Button, EmptyState } from './ui/primitives';

export function WorkspaceDataGate({ state, children, onRetry, allowFallback = false }: {
  state: 'loading' | 'ready' | 'error'; children: ReactNode; onRetry: () => void; allowFallback?: boolean;
}) {
  if (state === 'ready') return <>{children}</>;
  return <><div className="mx-auto max-w-5xl px-4 py-8" aria-busy={state === 'loading'}>
    {state === 'loading' ? <p role="status" className="text-sm text-[var(--color-mute)]">Loading your workspace…</p> :
      <div role="alert"><EmptyState title="Your workspace data could not be loaded" description={allowFallback ? 'Some saved items may be missing. Check storage permissions, then try again.' : 'Check storage permissions, then try again.'}
        actions={<Button variant="secondary" onClick={onRetry}>Retry</Button>} /></div>}
  </div>{state === 'error' && allowFallback && children}</>;
}
