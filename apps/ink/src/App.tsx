import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { NoteList } from './components/dashboard/NoteList';
import { Editor } from './components/dashboard/Editor';
import { TrashView } from './components/dashboard/TrashView';
import { InkWeb } from './components/graph/InkWeb';
import { TagsView } from './components/organization/TagsView';
import { FocusView } from './components/editor/FocusView';
import { OrganizationInsights } from './components/organization/OrganizationInsights';

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
    </BrowserRouter>
  );
}

export default App;
