import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFolio, selectActiveTerm, selectTermCourses } from './store';
import { Spine } from './components/Spine';
import { TopTabs, type ViewKey } from './components/TopTabs';
import { TodayView } from './views/TodayView';
import { SemesterView } from './views/SemesterView';
import { CalendarView } from './views/CalendarView';
import { CourseView } from './views/CourseView';
import { ReviewView } from './views/ReviewView';
import { SettingsView } from './views/SettingsView';
import { CommitmentDrawer } from './components/CommitmentDrawer';
import { ImportSheet } from './components/ImportSheet';
import { parseImportPayload, type ImportPayload } from './lib/import';
import { Onboarding } from './views/Onboarding';
import { HelpOverlay } from './components/HelpOverlay';
import { todayISO, stampDate, dowName } from './lib/utils';

export interface RouteState {
  view: ViewKey;
  courseId?: string;
  inspectId?: string;
  date?: string;
}

export function App() {
  const booted = useFolio((s) => s.booted);
  const settings = useFolio((s) => s.settings);
  const term = useFolio(selectActiveTerm);
  const courses = useFolio(useShallow(selectTermCourses));
  const courseCount = courses.length;

  const [route, setRoute] = useState<RouteState>({ view: 'today' });
  const [helpOpen, setHelpOpen] = useState(false);
  const [importPayload, setImportPayload] = useState<ImportPayload | null>(null);

  // Inbound Modular AI staging payload: ?import=<base64url JSON> — staged for
  // review, never committed without the confirmation table.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const raw = q.get('import');
    if (!raw) return;
    const res = parseImportPayload(raw);
    if (res.ok && res.payload) setImportPayload(res.payload);
    const url = new URL(window.location.href);
    url.searchParams.delete('import');
    window.history.replaceState({}, '', url.toString());
  }, []);

  const nav = (patch: Partial<RouteState>) => setRoute((r) => ({ ...r, ...patch }));
  const goView = (view: ViewKey) => setRoute({ view });
  const openCourse = (courseId: string) => setRoute({ view: 'course', courseId });
  const inspect = (inspectId?: string) => nav({ inspectId });

  // apply the user's motion preference once at the document level
  useEffect(() => {
    document.documentElement.dataset.motion = settings.motion;
  }, [settings.motion]);

  // document title carries the registrar wordmark
  useEffect(() => {
    document.title = term ? `${term.name} — Syllabus` : 'Syllabus — Registrar’s Planning Folio';
  }, [term]);

  // ── Global keyboard map (inactive while typing or while a sheet is open) ──
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
      if (route.inspectId) return; // drawer owns its keys
      switch (e.key) {
        case 't':
          goView('today');
          break;
        case 'e':
          goView('semester');
          break;
        case 'c':
          goView('calendar');
          break;
        case 'w':
          goView('review');
          break;
        case ',':
          goView('settings');
          break;
        case 'Escape':
          setHelpOpen(false);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route.inspectId]);

  const today = useMemo(() => todayISO(), []);
  const inspected = useFolio((s) => (route.inspectId ? s.commitments[route.inspectId!] : undefined));

  if (!booted) return null;

  // first run: seat the student at the registrar's desk
  if (courseCount === 0 && route.view !== 'settings') {
    return <Onboarding onDone={() => goView('semester')} />;
  }

  return (
    <div className="h-full flex" data-app="syllabus">
      {/* vertical semester spine — course tabs are the only large color surfaces */}
      <Spine
        term={term}
        courses={courses}
        activeCourseId={route.view === 'course' ? route.courseId : undefined}
        onOpenCourse={openCourse}
        onOpenSemester={() => goView('semester')}
      />

      {/* folio page */}
      <div className="flex-1 min-w-0 flex flex-col px-3 py-3 sm:px-5">
        <div className="sheet flex-1 min-h-0 flex flex-col animate-[sheet-in_0.34s_cubic-bezier(0.2,0.8,0.3,1)_both]">
          {/* folio header: divider tabs + the day's date stamp */}
          <header className="no-print flex items-end justify-between gap-3 px-4 pt-2.5 border-b border-[color:var(--color-rule)]">
            <TopTabs view={route.view === 'course' ? 'semester' : route.view} onNav={goView} />
            <div className="hidden sm:flex items-center gap-3 pb-1.5">
              {term && (
                <span className="kicker" title="Active term">
                  {term.name}
                </span>
              )}
              <span
                className="mono text-[11px] font-semibold tracking-[0.1em] text-[color:var(--color-ink-soft)] border border-[color:var(--color-rule-dark)] rounded-[3px] px-2 py-0.5"
                title="Today's date"
              >
                {dowName(today)} · {stampDate(today)}
              </span>
            </div>
          </header>

          <main className="flex-1 min-h-0 overflow-y-auto">
            {route.view === 'today' && <TodayView onInspect={inspect} today={today} />}
            {route.view === 'semester' && <SemesterView onOpenCourse={openCourse} onInspect={inspect} />}
            {route.view === 'calendar' && <CalendarView onInspect={inspect} today={today} />}
            {route.view === 'review' && <ReviewView today={today} />}
            {route.view === 'settings' && <SettingsView />}
            {route.view === 'course' && route.courseId && (
              <CourseView courseId={route.courseId} onInspect={inspect} />
            )}
          </main>
        </div>
      </div>

      {inspected && (
        <CommitmentDrawer commitment={inspected} onClose={() => inspect(undefined)} />
      )}
      {importPayload && <ImportSheet initial={importPayload} onClose={() => setImportPayload(null)} />}
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
