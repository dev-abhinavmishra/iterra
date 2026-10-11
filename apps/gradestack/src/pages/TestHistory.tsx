import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Icon, Button, Chip, EmptyState, Modal, PageHeader } from '../components/ui';
import { FORMAT_LABELS } from '../lib/grading';
import { AnimatePresence } from 'motion/react';

export function TestHistory() {
  const tests = useStore(state => state.tests);
  const scans = useStore(state => state.scans);
  const deleteTest = useStore(state => state.deleteTest);
  const duplicateTest = useStore(state => state.duplicateTest);
  const navigate = useNavigate();

  const [testToDelete, setTestToDelete] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'name'>('recent');

  const sortedTests = [...tests].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const handleDelete = async (id: string) => {
    await deleteTest(id); // cascades to the test's scans in the store + Firestore
    setTestToDelete(null);
  };

  const scanCountFor = (testId: string) => scans.filter(s => s.testId === testId).length;
  const deletingTest = tests.find(t => t.id === testToDelete);
  const deletingCount = testToDelete ? scanCountFor(testToDelete) : 0;

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto w-full flex-1">
      <PageHeader
        title="Assessment Register"
        description={`${tests.length} assessment${tests.length === 1 ? '' : 's'} on file`}
      >
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'recent' | 'name')}
          className="h-10 px-3 border border-hairline-strong rounded-md bg-form-raised text-sm font-semibold text-pencil focus:border-mark focus:outline-none cursor-pointer"
        >
          <option value="recent">Latest first</option>
          <option value="name">By name</option>
        </select>
        <Link to="/builder" className="inline-flex items-center gap-2 bg-mark text-on-mark font-semibold text-sm px-5 h-10 rounded-md hover:bg-mark-deep transition-colors">
          <Icon name="add" size={18} />
          New assessment
        </Link>
      </PageHeader>

      <div className="doc overflow-hidden">
        <div className="overflow-x-auto w-full table-scroll">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b border-hairline text-pencil bg-surface-container-low">
                <th className="ledger-label py-3 px-6 font-semibold">Assessment</th>
                <th className="ledger-label py-3 px-4 font-semibold">Format</th>
                <th className="ledger-label py-3 px-4 font-semibold">Sheets</th>
                <th className="ledger-label py-3 px-4 font-semibold">Created</th>
                <th className="ledger-label py-3 px-6 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {sortedTests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20">
                    <EmptyState
                      icon="library_books"
                      title="The Register Is Empty"
                      body="Create an assessment in the builder — then print, scan, and grade it here."
                    >
                      <Link to="/builder" className="inline-flex items-center gap-2 px-6 py-2.5 bg-mark text-on-mark rounded-md font-semibold text-sm hover:bg-mark-deep transition-colors">
                        <Icon name="add" size={18} />
                        Open the builder
                      </Link>
                    </EmptyState>
                  </td>
                </tr>
              ) : sortedTests.map((t) => {
                const count = scanCountFor(t.id);
                return (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/analytics?testId=${t.id}`)}
                    className="border-b last:border-0 border-hairline hover:bg-surface-container-low transition-colors cursor-pointer group"
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-sm bg-mark-mist flex items-center justify-center text-mark-deep shrink-0 border border-mark/15">
                          <Icon name="description" size={18} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-ink group-hover:text-mark-deep transition-colors truncate max-w-[240px]">{t.name || 'Untitled'}</h4>
                          {t.courseName && <p className="text-[11px] text-faint truncate">{t.courseName}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <Chip tone="neutral">{FORMAT_LABELS[t.format] || t.format}</Chip>
                        <span className="font-mono text-[11px] text-faint">{t.numQuestions}q</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`font-mono text-sm font-semibold ${count > 0 ? 'text-ink' : 'text-faint'}`}>{count}</span>
                    </td>
                    <td className="py-4 px-4 text-pencil text-xs font-medium whitespace-nowrap">
                      {new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/builder?testId=${t.id}`); }}
                          className="text-faint hover:text-ink p-2 rounded-md transition-colors sm:opacity-0 group-hover:opacity-100"
                          title="Edit"
                        >
                          <Icon name="edit" size={17} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); void duplicateTest(t.id); }}
                          className="text-faint hover:text-ink p-2 rounded-md transition-colors sm:opacity-0 group-hover:opacity-100"
                          title="Duplicate"
                        >
                          <Icon name="content_copy" size={17} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setTestToDelete(t.id); }}
                          className="text-faint hover:text-red p-2 rounded-md transition-colors sm:opacity-0 group-hover:opacity-100"
                          title="Delete"
                        >
                          <Icon name="delete" size={17} />
                        </button>
                        <span className="text-hairline-strong group-hover:text-mark ml-1 transition-colors">
                          <Icon name="chevron_right" size={18} />
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirmation — names the real consequence */}
      <AnimatePresence>
        {testToDelete && (
          <Modal
            onClose={() => setTestToDelete(null)}
            title="Delete Assessment?"
            footer={
              <>
                <Button variant="ghost" onClick={() => setTestToDelete(null)}>Keep it</Button>
                <Button variant="danger" icon="delete" onClick={() => void handleDelete(testToDelete)} className="px-6 h-10">
                  Delete{deletingCount > 0 ? ` + ${deletingCount} sheet${deletingCount === 1 ? '' : 's'}` : ''}
                </Button>
              </>
            }
          >
            <div className="p-6">
              <p className="text-sm text-ink leading-relaxed">
                <span className="font-semibold">{deletingTest?.name || 'This assessment'}</span> will be removed
                {deletingCount > 0 && (
                  <> along with its <span className="font-semibold text-red">{deletingCount} graded sheet{deletingCount === 1 ? '' : 's'}</span></>
                )}.
                {' '}This can't be undone.
              </p>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
