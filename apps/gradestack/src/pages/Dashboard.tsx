import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { generatePDF } from '../lib/pdfGenerator';
import { Icon, BubbleMark } from '../components/ui';

const steps = [
  { icon: 'edit_note', title: 'Design a sheet', body: 'Set the question count and formats, then download a fillable PDF to print or share.' },
  { icon: 'fact_check', title: 'Mark the key', body: 'Tap the right answers on the sheet itself — that becomes your answer key.' },
  { icon: 'document_scanner', title: 'Scan and grade', body: 'Upload sheet photos or filled PDFs. GradeStack reads the bubbles and does the math.' },
];

export function Dashboard() {
  const tests = useStore(state => state.tests);
  const scans = useStore(state => state.scans);
  const navigate = useNavigate();

  const pendingReview = scans.filter(s => s.needsReview);
  const gradedScans = scans.length - pendingReview.length;

  // Class-average trend across recent assessments
  const recentTestsWithScans = tests
    .map(test => {
      const testScans = scans.filter(s => s.testId === test.id);
      const avg = testScans.length > 0 ? testScans.reduce((acc, s) => acc + s.percentage, 0) / testScans.length : null;
      return { ...test, avg, scanned: testScans.length };
    })
    .filter(t => t.avg !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-6);

  const mostRecent = tests[0];

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto w-full flex-1">
      {/* Register header */}
      <div className="mb-8 border-b border-hairline pb-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-sm text-pencil mb-1">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <h2 className="text-display">Mark Book</h2>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex flex-col items-end">
              <span className="font-mono text-2xl font-semibold text-ink leading-none">{tests.length}</span>
              <span className="ledger-label mt-1">assessment{tests.length === 1 ? '' : 's'}</span>
            </div>
            <div className="w-px h-8 bg-hairline" />
            <div className="flex flex-col items-end">
              <span className="font-mono text-2xl font-semibold text-ink leading-none">{scans.length}</span>
              <span className="ledger-label mt-1">sheet{scans.length === 1 ? '' : 's'} graded</span>
            </div>
            {pendingReview.length > 0 && (
              <>
                <div className="w-px h-8 bg-hairline" />
                <Link to="/scan" className="flex flex-col items-end group">
                  <span className="font-mono text-2xl font-semibold text-red leading-none group-hover:underline">{pendingReview.length}</span>
                  <span className="ledger-label mt-1 text-red">to review</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {tests.length === 0 ? (
        /* First-run — the workflow, honestly described */
        <div className="doc overflow-hidden">
          <div className="px-8 pt-10 pb-8 border-b border-hairline">
            <BubbleMark size={9} className="text-mark mb-6" />
            <h3 className="text-headline-md max-w-md">The sheet is the product — everything else is paperwork.</h3>
            <p className="text-pencil mt-2 max-w-lg">
              GradeStack designs printable answer sheets, reads completed ones back in, and keeps the gradebook. Start with a blank sheet or restore one you exported before.
            </p>
            <div className="flex flex-wrap gap-3 mt-7">
              <Link to="/builder" className="inline-flex items-center gap-2 bg-mark text-on-mark font-semibold text-sm px-5 py-2.5 rounded-md hover:bg-mark-deep transition-colors">
                <Icon name="add" size={18} /> New assessment
              </Link>
              <button
                onClick={() => navigate('/builder', { state: { importPdf: true } })}
                className="inline-flex items-center gap-2 border border-hairline-strong text-ink font-semibold text-sm px-5 py-2.5 rounded-md hover:border-ink transition-colors"
              >
                <Icon name="upload_file" size={18} /> Restore from PDF
              </button>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-hairline">
            {steps.map((s, i) => (
              <div key={s.title} className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-mono text-xs font-semibold text-faint">{i + 1}.</span>
                  <Icon name={s.icon} size={20} className="text-mark" />
                  <h4 className="font-semibold text-ink text-sm">{s.title}</h4>
                </div>
                <p className="text-sm text-pencil leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Assessment ledger */}
          <div className="lg:col-span-2 doc overflow-hidden">
            <div className="px-6 py-4 border-b border-hairline flex justify-between items-center">
              <h3 className="text-headline-sm">Recent Assessments</h3>
              <Link to="/history" className="text-sm font-semibold text-mark hover:text-mark-deep flex items-center gap-1">
                All tests <Icon name="arrow_forward" size={16} />
              </Link>
            </div>
            <div className="overflow-x-auto table-scroll">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-hairline text-pencil">
                    <th className="ledger-label py-3 px-6 font-semibold">Assessment</th>
                    <th className="ledger-label py-3 px-4 font-semibold">Date</th>
                    <th className="ledger-label py-3 px-4 font-semibold">Items</th>
                    <th className="ledger-label py-3 px-4 font-semibold">Key</th>
                    <th className="ledger-label py-3 px-6 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {tests.slice(0, 6).map(test => {
                    const keyCount = Object.keys(test.answerKey || {}).length;
                    return (
                      <tr key={test.id} className="border-b last:border-0 border-hairline hover:bg-surface-container-low transition-colors group">
                        <td className="py-3.5 px-6">
                          <Link to={`/analytics?testId=${test.id}`} className="font-semibold text-ink hover:text-mark transition-colors">
                            {test.name}
                          </Link>
                          {test.courseName && <span className="block text-xs text-pencil mt-0.5">{test.courseName}</span>}
                        </td>
                        <td className="py-3.5 px-4 text-pencil whitespace-nowrap">
                          {new Date(test.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-xs text-pencil">{test.numQuestions}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          {keyCount > 0 ? (
                            <span className="font-mono text-xs text-mark-deep">{keyCount}/{test.numQuestions}</span>
                          ) : (
                            <span className="text-xs text-red font-medium">not set</span>
                          )}
                        </td>
                        <td className="py-3.5 px-6">
                          <div className="flex items-center justify-end gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link to={`/scan?testId=${test.id}`} className="p-1.5 text-pencil hover:text-mark hover:bg-mark-mist rounded-md transition-colors" title="Scan sheets">
                              <Icon name="document_scanner" size={17} />
                            </Link>
                            <Link to="/builder" state={{ editingTestId: test.id }} className="p-1.5 text-pencil hover:text-mark hover:bg-mark-mist rounded-md transition-colors" title="Edit">
                              <Icon name="edit" size={17} />
                            </Link>
                            <button onClick={() => generatePDF(test)} className="p-1.5 text-pencil hover:text-mark hover:bg-mark-mist rounded-md transition-colors" title="Download sheet PDF">
                              <Icon name="download" size={17} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {mostRecent && (
              <div className="px-6 py-3 border-t border-hairline bg-surface-container-low flex items-center justify-between">
                <span className="text-xs text-pencil">
                  Latest: <span className="font-semibold text-ink">{mostRecent.name}</span>
                </span>
                <Link to={`/scan?testId=${mostRecent.id}`} className="text-xs font-semibold text-mark hover:text-mark-deep">
                  Continue grading
                </Link>
              </div>
            )}
          </div>

          {/* Right rail — trend + review queue */}
          <div className="flex flex-col gap-6">
            <div className="doc p-6">
              <h3 className="font-display text-lg font-semibold mb-1">Class Average</h3>
              <p className="text-sm text-pencil mb-6">Across your last {recentTestsWithScans.length} assessment{recentTestsWithScans.length === 1 ? '' : 's'}</p>

              <div className="relative h-[180px] border-b border-l border-hairline-strong">
                <div className="absolute -left-7 top-0 h-full flex flex-col justify-between text-[10px] text-faint font-mono py-0.5">
                  <span>100</span><span>50</span><span>0</span>
                </div>
                {recentTestsWithScans.length < 2 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-center text-faint text-sm px-6">
                    Grade two assessments to see a trend.
                  </div>
                ) : (
                  <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <path
                      d={`M 0 100 ${recentTestsWithScans.map((t, i) => `L ${(i / (recentTestsWithScans.length - 1)) * 100} ${100 - (t.avg as number)}`).join(' ')} L 100 100 Z`}
                      fill="var(--color-mark)"
                      opacity="0.08"
                    />
                    <polyline
                      fill="none"
                      points={recentTestsWithScans.map((t, i) => `${(i / (recentTestsWithScans.length - 1)) * 100},${100 - (t.avg as number)}`).join(' ')}
                      stroke="var(--color-mark)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    {recentTestsWithScans.map((t, i) => (
                      <circle
                        key={t.id}
                        cx={(i / (recentTestsWithScans.length - 1)) * 100}
                        cy={100 - (t.avg as number)}
                        r="4"
                        className="fill-form stroke-mark cursor-pointer"
                        strokeWidth="2.5"
                      >
                        <title>{t.name}: {Math.round(t.avg as number)}% avg · {t.scanned} sheets</title>
                      </circle>
                    ))}
                  </svg>
                )}
              </div>
              <div className="flex justify-between text-[10px] text-faint font-mono mt-2 px-1">
                {recentTestsWithScans.length >= 2
                  ? recentTestsWithScans.map((t, i) => <span key={t.id} title={t.name}>T{i + 1}</span>)
                  : <span />}
              </div>
            </div>

            {/* Review queue — the sheets that still need a human */}
            <div className="doc overflow-hidden">
              <div className="px-5 py-3.5 border-b border-hairline flex justify-between items-center">
                <h3 className="font-display text-lg font-semibold">Awaiting Review</h3>
                {pendingReview.length > 0 && (
                  <span className="font-mono text-xs font-semibold text-red">{pendingReview.length}</span>
                )}
              </div>
              {pendingReview.length === 0 ? (
                <div className="px-5 py-6 text-sm text-pencil">
                  {gradedScans > 0 ? 'Everything scanned is graded. Nothing needs a second look.' : 'Sheets the reader can\u2019t make out land here for a manual check.'}
                </div>
              ) : (
                <ul className="divide-y divide-hairline max-h-64 overflow-y-auto">
                  {pendingReview.slice(0, 8).map(scan => (
                    <li key={scan.id}>
                      <Link
                        to={`/scan?testId=${scan.testId}&scanId=${scan.id}`}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-red-mist/40 transition-colors"
                      >
                        <Icon name="error" size={18} className="text-red shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-ink truncate">{scan.studentName}</p>
                          <p className="text-xs text-pencil">ID {scan.studentId}</p>
                        </div>
                        <span className="font-mono text-xs font-semibold text-red">{scan.percentage}%</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Link to="/scan" className="doc p-5 flex items-center justify-between group hover:border-mark transition-colors">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-md bg-mark-mist text-mark-deep flex items-center justify-center">
                  <Icon name="document_scanner" size={22} />
                </span>
                <div>
                  <p className="font-semibold text-ink text-sm">Scan sheets</p>
                  <p className="text-xs text-pencil">Camera, photo, or filled PDF</p>
                </div>
              </div>
              <Icon name="arrow_forward" size={18} className="text-faint group-hover:text-mark transition-colors" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
