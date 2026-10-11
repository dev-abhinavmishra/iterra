import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { MobileHeader } from './components/MobileHeader';
import { Dashboard } from './pages/Dashboard';
import { SheetBuilder } from './pages/SheetBuilder';
import { ScanSheets } from './pages/ScanSheets';
import { ScoreAnalytics } from './pages/ScoreAnalytics';
import { TestHistory } from './pages/TestHistory';
import { Settings } from './pages/Settings';
import { useStore } from './store';

function AppLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const theme = useStore(state => state.theme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', isDark);
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
    <div className="flex h-screen w-full bg-paper overflow-hidden relative">
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

export default function App() {
  return (
    <Router>
      <AppLayout />
    </Router>
  );
}
