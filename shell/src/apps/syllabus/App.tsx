import { useEffect, useMemo, useRef, useState } from 'react';
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
import { todayISO, stampDate, dowName, modalOpen } from './lib/utils';
import { placeActive } from '../active';
import './index.css';

export interface RouteState {
  view: ViewKey;
  courseId?: string;
  inspectId?: string;
  date?: string;
}

export default function App({ query = '' }: { query?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const booted = useFolio((s) => s.booted);
  const settings = useFolio((s) => s.settings);
  const term = useFolio(selectActiveTerm);
  const courses = useFolio(useShallow(selectTermCourses));
  const courseCount = courses.length;

  const [route, setRoute] = useState<RouteState>({ view: 'today' });
  const [helpOpen, setHelpOpen] = useState(false);
  const [importPayload, setImportPayload] = useState<ImportPayload | null>(null);

  // inbound deep links ride the place query now — boot consumes the first
  // (completedBlock / block / commitment); this one stages the import sheet.
  useEffect(() => { useFolio.getState().boot(query); }, [query]);

  // Inbound Modular AI staging payload: ?import=<base64url JSON> — staged for
  // review, never committed without the confirmation table.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(query);
    const raw = q.get('import');
    if (!raw) return;
    const res = parseImportPayload(raw);
    if (res.ok && res.payload) {
      setImportPayload(res.payload);
    } else {
      /* a malformed/stale staging link used to vanish silently — say why
         instead of landing on an empty desk with no explanation */
      try {
        window.dispatchEvent(
          new CustomEvent('iterra:toast', {
            detail: { text: `Import couldn't be staged: ${res.error || 'unreadable payload'}` },
          }),
        );
      } catch { /* no window to notify */ }
    }
    const h = window.location.hash;
    if (h.includes('?')) window.location.hash = h.slice(0, h.indexOf('?'));
  }, [query]);

  /* ?p=<view> — 'week reviewed' stirs and the like land on the right tab
     instead of the folio default. Consumed params strip. */
  useEffect(() => {
    const p = new URLSearchParams(query).get('p');
    if (!p || !['today', 'semester', 'calendar', 'review'].includes(p)) return;
    setRoute({ view: p as ViewKey });
    const h = window.location.hash;
    if (h.includes('?')) {
      const q = new URLSearchParams(h.slice(h.indexOf('?') + 1));
      q.delete('p');
      const rest = q.toString();
      window.location.hash = h.slice(0, h.indexOf('?')) + (rest ? '?' + rest : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  /* ?settings — the terrain's central settings surface deep-links here;
     consumed params strip so the same link fires again later */
  useEffect(() => {
    if (!new URLSearchParams(query).has('settings')) return;
    setRoute({ view: 'settings' });
    const h = window.location.hash;
    if (h.includes('?')) {
      const q = new URLSearchParams(h.slice(h.indexOf('?') + 1));
      q.delete('settings');
      const rest = q.toString();
      window.location.hash = h.slice(0, h.indexOf('?')) + (rest ? '?' + rest : '');
    }
  }, [query]);

  const nav = (patch: Partial<RouteState>) => setRoute((r) => ({ ...r, ...patch }));
  const goView = (view: ViewKey) => setRoute({ view });
  const openCourse = (courseId: string) => setRoute({ view: 'course', courseId });
  const inspect = (inspectId?: string) => nav({ inspectId });

  // Index-entity deep link: boot() stashes ?commitment=<id>; open its drawer,
  // then clear so a stale id can't re-fire. Only lands on a real commitment.
  const intakeCommitmentId = useFolio((s) => s.intakeCommitmentId);
  useEffect(() => {
    if (!intakeCommitmentId) return;
    const s = useFolio.getState();
    if (s.commitments[intakeCommitmentId]) inspect(intakeCommitmentId);
    s.clearIntakeCommitment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intakeCommitmentId]);

  // apply the user's motion preference at the place root — scoping keeps the
  // terrain + sibling places on their own motion setting
  useEffect(() => {
    if (rootRef.current) rootRef.current.dataset.motion = settings.motion;
  }, [settings.motion]);

  // document title carries the registrar wordmark — standalone only;
  // inside the terrain the shell owns the title
  useEffect(() => {
    if ((window as any).__iterraIntegrated) return;
    document.title = term ? `${term.name} — Syllabus` : 'Syllabus — Registrar’s Planning Folio';
  }, [term]);

  // ── Global keyboard map (inactive while typing or while a sheet is open) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!placeActive('syllabus')) return;
      const t = e.target as HTMLElement;
      const typing =
        t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
      if (e.key === '?' && !typing) {
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (route.inspectId || modalOpen()) return; // a sheet/drawer owns its keys
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
    return (
      <div ref={rootRef} className="it-place-syllabus h-full" data-app="syllabus">
        <Onboarding onDone={() => goView('semester')} />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="it-place-syllabus h-full flex" data-app="syllabus">
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
