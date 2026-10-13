import { useEffect, useState } from 'react';
import { useWorkbench } from './store';
import { TopTabs, type ViewKey } from './components/TopTabs';
import { LibraryView } from './views/LibraryView';
import { SessionSetupView } from './views/SessionSetupView';
import { AttemptDesk } from './views/AttemptDesk';
import { CompareView } from './views/CompareView';
import { LedgerView } from './views/LedgerView';
import { ProgressView } from './views/ProgressView';
import { ImportView } from './views/ImportView';
import { SettingsView } from './views/SettingsView';
import { Onboarding } from './views/Onboarding';
import { HelpOverlay } from './components/HelpOverlay';
import type { InboundLink } from './lib/links';

export interface RouteState {
  view: ViewKey;
  attemptId?: string;
  sessionId?: string;
  compareAttemptId?: string;
  inbound?: InboundLink | null;
}

export function App() {
  const settings = useWorkbench((s) => s.settings);
  const problemCount = useWorkbench((s) => Object.keys(s.problems).length);
  /* due badge counts only reviews whose problem still exists and isn't
     archived — same rule the adapter's presence summary reports */
  const due = useWorkbench((s) => s.dueReviews().length);
  const booted = useWorkbench((s) => s.booted);
  const consumeInbound = useWorkbench((s) => s.consumeInbound);

  const [route, setRoute] = useState<RouteState>({ view: 'library' });
  const [helpOpen, setHelpOpen] = useState(false);
  const [onboardingSeen, setOnboardingSeen] = useState(false);

  const nav = (patch: Partial<RouteState>) => setRoute((r) => ({ ...r, ...patch }));
  const goView = (view: ViewKey) => { setOnboardingSeen(true); setRoute({ view }); };
  const startAttempt = (attemptId: string, sessionId?: string) =>
    setRoute({ view: 'attempt', attemptId, sessionId });
  const openCompare = (attemptId: string) => setRoute({ view: 'compare', compareAttemptId: attemptId });

  // inbound deep links (Syllabus session requests, ?problem=<id>) — once, after boot
  useEffect(() => {
    if (!booted) return;
    const inbound = consumeInbound();
    if (inbound?.kind === 'syllabus-session') {
      // carry the consumed link down — SessionSetupView reads it as a prop,
      // a second consumeInbound() would always see null
      setRoute({ view: 'session', inbound });
    } else if ((inbound?.kind === 'problem' || inbound?.kind === 'attempt') && inbound.attemptId) {
      /* ?attempt=<id> naming a submitted attempt lands on compare — the
         work is read-only on the desk anyway; the verdict, the worked
         proof and the retry affordance all live on the compare pane */
      const a = useWorkbench.getState().attempts[inbound.attemptId];
      if (a?.submittedAt) setRoute({ view: 'compare', compareAttemptId: a.id });
      else setRoute({ view: 'attempt', attemptId: inbound.attemptId });
    }
  }, [booted, consumeInbound]);

  useEffect(() => {
    document.documentElement.dataset.motion = settings.motion;
  }, [settings.motion]);

  useEffect(() => {
    document.title = 'Proof — Calculation Workbench';
  }, []);

  // global keyboard map — inactive while typing or while a modal is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing =
        t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
      if (e.key === '?' && !typing) {
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const views: Record<string, ViewKey> = {
        l: 'library',
        s: 'session',
        e: 'ledger',
        p: 'progress',
        i: 'import',
      };
      if (e.key === 'Escape' && helpOpen) {
        setHelpOpen(false);
        return;
      }
      /* the help overlay and modals (problem editor has role="dialog") own
         the keyboard — a bare 'l' must not navigate behind them */
      if (helpOpen || document.querySelector('[role="dialog"]')) return;
      if (views[e.key.toLowerCase()]) {
        e.preventDefault();
        goView(views[e.key.toLowerCase()]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  if (!booted) return null;

  return (
    <div className="flex h-full flex-col">
      <TopTabs route={route} goView={goView} due={due} onHelp={() => setHelpOpen(true)} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        {problemCount === 0 && !onboardingSeen ? (
          <Onboarding goView={goView} />
        ) : (
          <>
            {route.view === 'library' && <LibraryView onAttempt={(a) => startAttempt(a.id, a.sessionId)} />}
            {route.view === 'session' && (
              <SessionSetupView
                sessionId={route.sessionId}
                inbound={route.inbound ?? null}
                onSession={(sess) => nav({ sessionId: sess?.id })}
                onAttempt={(a) => startAttempt(a.id, a.sessionId)}
              />
            )}
            {route.view === 'attempt' && route.attemptId && (
              <AttemptDesk attemptId={route.attemptId} onCompare={openCompare} goView={goView} />
            )}
            {route.view === 'compare' && route.compareAttemptId && (
              <CompareView attemptId={route.compareAttemptId} goView={goView} goSession={(sid) => nav({ view: 'session', sessionId: sid })} onAttempt={(a) => startAttempt(a.id, a.sessionId)} />
            )}
            {route.view === 'ledger' && <LedgerView onAttempt={(a) => startAttempt(a.id, a.sessionId)} goView={goView} />}
            {route.view === 'progress' && <ProgressView />}
            {route.view === 'import' && <ImportView goView={goView} />}
            {route.view === 'settings' && <SettingsView />}
          </>
        )}
      </main>
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
