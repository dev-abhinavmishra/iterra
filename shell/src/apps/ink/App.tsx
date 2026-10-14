import { useEffect, useState } from 'react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
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

function App({ query = '' }: { query?: string }) {
  const [initialEntry] = useState<InitialEntry>(() => {
    const p = new URLSearchParams(query).get('p');
    return p && INK_ROUTES.has(p) ? `/${p}` : '/';
  });

  useEffect(() => {
    if (!wired) { wired = true; wireIterra(); }
  }, []);

  useEffect(() => { applyInboundLink(query); }, [query]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="it-place-ink h-full w-full">
        <MemoryRouter initialEntries={[initialEntry]}>
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
