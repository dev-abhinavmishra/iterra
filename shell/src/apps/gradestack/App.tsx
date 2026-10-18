import { useState, useEffect, useRef } from 'react';
import { MemoryRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import type { InitialEntry } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { MobileHeader } from './components/MobileHeader';
import { Dashboard } from './pages/Dashboard';
import { SheetBuilder } from './pages/SheetBuilder';
import { ScanSheets } from './pages/ScanSheets';
import { ScoreAnalytics } from './pages/ScoreAnalytics';
import { TestHistory } from './pages/TestHistory';
import { Settings } from './pages/Settings';
import { FirebaseProvider } from './components/FirebaseProvider';
import { useStore } from './store';
import { onTerrainTheme } from '../theme';
import './lib/iterra';
import './index.css';

function AppLayout({ query }: { query: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const theme = useStore(state => state.theme);

  const stripPlaceQuery = (...keys: string[]) => {
    const h = window.location.hash;
    const qi = h.indexOf('?');
    if (qi === -1) return;
    const q = new URLSearchParams(h.slice(qi + 1));
    let touched = false;
    for (const k of keys) if (q.has(k)) { q.delete(k); touched = true; }
    if (!touched) return;
    const rest = q.toString();
    window.location.hash = h.slice(0, qi) + (rest ? '?' + rest : '');
  };

  /* a link naming something that isn't here strips silently — surface the
     dead end through the terrain's toast rail instead */
  const deadLink = (text: string, url: string) => {
    try {
      window.dispatchEvent(new CustomEvent('iterra:toast', { detail: { text, url } }));
    } catch { /* no window to notify */ }
  };

  // Inbound suite link: ?assessment=<id> → open that test's analytics page,
  // then strip the param so it can't re-fire. Unknown ids are ignored.
  useEffect(() => {
    const id = new URLSearchParams(query).get('assessment');
    if (!id) return;
    if (useStore.getState().tests.some((t) => t.id === id)) {
      navigate(`/analytics?testId=${id}`);
    } else {
      deadLink('That assessment no longer exists', '#/p/gradestack?p=history');
    }
    /* hit or miss the param is consumed — a dead id lingering in the hash
       re-fires on every keep-alive remount */
    stripPlaceQuery('assessment');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, navigate]);

  // Inbound suite link: ?scanId=<id> on the app root (docs/WIRING.md
  // contract) → resolve the scan's test and forward to /scan?testId=&scanId=,
  // where the review modal opens and the param is consumed. Unknown ids
  // strip and stay — same ghost contract as ?assessment.
  useEffect(() => {
    const scanId = new URLSearchParams(query).get('scanId');
    if (!scanId) return;
    const scan = useStore.getState().scans.find((s) => s.id === scanId);
    stripPlaceQuery('scanId');
    if (scan) {
      navigate(`/scan?testId=${encodeURIComponent(scan.testId)}&scanId=${encodeURIComponent(scan.id)}`);
    } else {
      deadLink('That scan no longer exists', '#/p/gradestack?p=history');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, navigate]);

  /* ?p=<route> re-navigation — initialEntries only seeds the FIRST mount,
     but places stay alive; a p= link arriving later (terrain settings
     surface, open()-shim) must still navigate. ?settings is the terrain's
     central-surface deep link — same landing, minus the p. */
  useEffect(() => {
    const q = new URLSearchParams(query);
    const p = q.get('p');
    if (p && GRADESTACK_ROUTES.has(p)) {
      stripPlaceQuery('p');
      q.delete('p');
      const rest = q.toString();
      navigate(`/${p}${rest ? `?${rest}` : ''}`);
    } else if (q.has('settings')) {
      stripPlaceQuery('settings');
      navigate('/settings');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, navigate]);

  useEffect(() => {
    // Integrated: the terrain owns light/dark — follow its single toggle.
    if ((window as any).__iterraIntegrated) {
      return onTerrainTheme((t) =>
        rootRef.current?.classList.toggle('dark', t === 'graphite'),
      );
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && media.matches);
      // dark mode scopes to the place root — the terrain and sibling places
      // keep their own theme.
      rootRef.current?.classList.toggle('dark', isDark);
    };
    apply();
    // 'system' must track the OS while the app is open, not once.
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/': return 'Dashboard';
      case '/builder': return 'Sheet Builder';
      case '/scan': return 'Scan Sheets';
      case '/analytics': return 'Score Analytics';
      case '/history': return 'Test History';
      case '/settings': return 'Settings';
      default: return 'GradeStack';
    }
  };

  return (
    <div ref={rootRef} className="it-place-gradestack flex h-full w-full bg-paper overflow-hidden relative">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col w-full h-full overflow-hidden">
        {location.pathname !== '/scan' && <MobileHeader title={getPageTitle()} onMenuClick={() => setSidebarOpen(true)} />}
        <main className={`flex-1 overflow-y-auto w-full relative ${location.pathname === '/scan' ? 'bg-ink' : ''}`}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/builder" element={<SheetBuilder />} />
            <Route path="/scan" element={<ScanSheets />} />
            <Route path="/analytics" element={<ScoreAnalytics />} />
            <Route path="/history" element={<TestHistory />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

/* Routes the place's own router owns — a legacy/entity link like
   /apps/gradestack/scan?testId=x arrives as ?p=scan&testId=x on the place
   query; p seeds the MemoryRouter's initial entry so it lands on the
   right page instead of the dashboard. Remaining params carry into the
   entry's search so in-page effects (?scanId review open) still fire. */
const GRADESTACK_ROUTES = new Set(['builder', 'scan', 'analytics', 'history', 'settings']);

export default function App({ query = '' }: { query?: string }) {
  const [initialEntry] = useState<InitialEntry>(() => {
    const q = new URLSearchParams(query);
    const p = q.get('p');
    if (!p || !GRADESTACK_ROUTES.has(p)) return '/';
    q.delete('p');
    const rest = q.toString();
    return { pathname: `/${p}`, search: rest ? `?${rest}` : '' };
  });
  return (
    <Router initialEntries={[initialEntry]}>
      <FirebaseProvider>
        <AppLayout query={query} />
      </FirebaseProvider>
    </Router>
  );
}
