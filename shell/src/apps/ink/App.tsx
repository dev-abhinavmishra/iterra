import { useEffect, useState } from 'react';
import { MemoryRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import type { InitialEntry } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { MainLayout } from './components/layout/MainLayout';
import { NoteList } from './components/dashboard/NoteList';
import { Editor } from './components/dashboard/Editor';
import { TrashView } from './components/dashboard/TrashView';
import { InkWeb } from './components/graph/InkWeb';
import { TagsView } from './components/organization/TagsView';
import { FocusView } from './components/editor/FocusView';
import { OrganizationInsights } from './components/organization/OrganizationInsights';
import { wireIterra, applyInboundLink } from './lib/iterra';
import './index.css';

let wired = false;

/* The desk keeps its own route table — the terrain owns the address bar,
   so it lives in memory. ?note= deep links arrive via the place query and
   are honored the same as before. A p= param (from /apps/ink/<sub> links,
   legacy or open()-shimmed) seeds the initial entry so path links land on
   the right view. */
const INK_ROUTES = new Set(['favorites', 'recent', 'tags', 'focus', 'insights', 'web', 'trash']);

/* Re-navigates on ?p=<route> while the desk stays mounted — same contract
   as initialEntries, for keep-alive re-delivery. The param is consumed so
   the same link can fire again later. */
function QueryBridge({ query }: { query: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    const p = new URLSearchParams(query).get('p');
    if (!p || !INK_ROUTES.has(p)) return;
    const h = window.location.hash;
    const qi = h.indexOf('?');
    if (qi !== -1) {
      const q = new URLSearchParams(h.slice(qi + 1));
      q.delete('p');
      const rest = q.toString();
      window.location.hash = h.slice(0, qi) + (rest ? '?' + rest : '');
    }
    navigate(`/${p}`);
  }, [query, navigate]);
  return null;
}

function App({ query = '' }: { query?: string }) {
  const [initialEntry] = useState<InitialEntry>(() => {
    const p = new URLSearchParams(query).get('p');
    return p && INK_ROUTES.has(p) ? `/${p}` : '/';
  });

  useEffect(() => {
    if (!wired) { wired = true; wireIterra(); }
  }, []);

  useEffect(() => { applyInboundLink(query); }, [query]);

  /* ?settings — the terrain's central settings surface deep-links into the
     desk's own settings sheet (opened by SideNavBar's listener). The param
     strips so the same link fires again later. */
  useEffect(() => {
    if (!new URLSearchParams(query).has('settings')) return;
    const h = window.location.hash;
    const qi = h.indexOf('?');
    if (qi !== -1) {
      const q = new URLSearchParams(h.slice(qi + 1));
      q.delete('settings');
      const rest = q.toString();
      window.location.hash = h.slice(0, qi) + (rest ? '?' + rest : '');
    }
    window.dispatchEvent(new CustomEvent('ink:open-settings'));
  }, [query]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="it-place-ink h-full w-full">
        <MemoryRouter initialEntries={[initialEntry]}>
          {/* p= links arriving while mounted (the place stays alive) still
              navigate — initialEntries only seeds the first mount */}
          <QueryBridge query={query} />
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/" element={
                <>
                  <NoteList filter="all" />
                  <Editor />
                </>
              } />

              <Route path="/favorites" element={
                <>
                  <NoteList filter="pinned" title="Favorites" />
                  <Editor />
                </>
              } />

              <Route path="/recent" element={
                <>
                  <NoteList filter="recent" title="Recent" />
                  <Editor />
                </>
              } />

              <Route path="/tags" element={<TagsView />} />
              <Route path="/focus" element={<FocusView />} />
              <Route path="/insights" element={<OrganizationInsights />} />
              <Route path="/web" element={<InkWeb />} />
              <Route path="/trash" element={<TrashView />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MemoryRouter>
      </div>
    </MotionConfig>
  );
}

export default App;
