import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Icon, Button, Chip, EmptyState, PageHeader } from '../components/ui';
import { normalizeAnswer, optionsFor, formatsForTest, csvEscape, downloadFile } from '../lib/grading';

export function ScoreAnalytics() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const testId = searchParams.get('testId');
  const tests = useStore(state => state.tests);
  const scans = useStore(state => state.scans);

  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'recent'>('recent');

  const test = tests.find(t => t.id === testId) || tests[0];
  const allTestScans = test ? scans.filter(s => s.testId === test.id) : [];
  const batches = Array.from(new Set(allTestScans.map(s => s.batchName).filter(Boolean))) as string[];
  const testScans = selectedBatch ? allTestScans.filter(s => s.batchName === selectedBatch) : allTestScans;

  const questionStats = useMemo(() => {
    if (!test) return [];
    const formats = formatsForTest(test.sections, test.numQuestions, test.format);
    const sectionOf: string[] = [];
    if (test.sections) {
      test.sections.forEach((sec, si) => {
        for (let i = 0; i < (parseInt(sec.count as any) || 0); i++) sectionOf.push(`S${si + 1}`);
      });
    }
    return Array.from({ length: test.numQuestions }).map((_, i) => {
      const qNum = i + 1;
      const correct = test.answerKey?.[qNum] || '';
      const answered = testScans.filter(s => s.responses && s.responses[qNum] && s.responses[qNum] !== '?');
      const right = answered.filter(s => normalizeAnswer(s.responses![qNum]) === normalizeAnswer(correct));
      return {
        q: qNum,
        label: `Q${qNum}`,
        section: sectionOf[qNum - 1],
        format: formats[qNum - 1],
        answered: answered.length,
        correct: answered.length > 0 ? Math.round((right.length / answered.length) * 100) : 0,
      };
    }).sort((a, b) => a.correct - b.correct);
  }, [test, testScans]);

  if (!test) {
    const isNoTests = tests.length === 0;
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 max-w-2xl mx-auto text-center">
        <EmptyState
          icon={isNoTests ? 'library_books' : 'search_off'}
          title={isNoTests ? 'No Assessments Yet' : 'Assessment Not Found'}
          body={isNoTests
            ? 'Create your first assessment to start tracking scores.'
            : "That assessment isn't in the register — it may have been deleted."}
        >
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {!isNoTests && (
              <Link to="/history" className="px-6 py-2.5 border border-hairline-strong text-ink rounded-md font-semibold text-sm hover:border-ink transition-colors">
                Back to history
              </Link>
            )}
            <Link to="/builder" className="px-6 py-2.5 bg-mark text-on-mark rounded-md font-semibold text-sm hover:bg-mark-deep transition-colors">
              New assessment
            </Link>
          </div>
        </EmptyState>
      </div>
    );
  }

  const numScanned = testScans.length;
  const avgPct = numScanned > 0 ? (testScans.reduce((acc, s) => acc + s.percentage, 0) / numScanned) : 0;
  const highScore = numScanned > 0 ? Math.max(...testScans.map(s => s.percentage)) : 0;
  const lowScore = numScanned > 0 ? Math.min(...testScans.map(s => s.percentage)) : 0;
  const reviewCount = testScans.filter(s => s.needsReview).length;

  const dist = {
    '<50': testScans.filter(s => s.percentage < 50).length,
    '50–59': testScans.filter(s => s.percentage >= 50 && s.percentage < 60).length,
    '60–69': testScans.filter(s => s.percentage >= 60 && s.percentage < 70).length,
    '70–79': testScans.filter(s => s.percentage >= 70 && s.percentage < 80).length,
    '80–89': testScans.filter(s => s.percentage >= 80 && s.percentage < 90).length,
    '90–100': testScans.filter(s => s.percentage >= 90).length,
  };
  const maxInDist = Math.max(...Object.values(dist), 1);

  const filteredScans = testScans
    .filter(s => {
      if (!studentSearch) return true;
      const q = studentSearch.toLowerCase();
      return s.studentName.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q) || (s.batchName && s.batchName.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.studentName.localeCompare(b.studentName);
      if (sortBy === 'score') return b.percentage - a.percentage;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  // Gradebook CSV — one row per student, one column per question
  const exportCSV = () => {
    const qCols = Array.from({ length: test.numQuestions }, (_, i) => `Q${i + 1}`);
    const header = ['Student', 'ID', 'Batch', 'Raw score', 'Out of', 'Percent', 'Grade', 'Needs review', ...qCols.map(q => `${q} marked`), ...qCols.map(q => `${q} key`)];
    const rows = testScans.map(s => [
      s.studentName,
      s.studentId,
      s.batchName || '',
      String(s.rawScore),
      String(s.maxScore),
      `${s.percentage}%`,
      s.grade,
      s.needsReview ? 'yes' : 'no',
      ...qCols.map((_, i) => s.responses?.[i + 1] || ''),
      ...qCols.map((_, i) => test.answerKey?.[i + 1] || ''),
    ]);
    const csv = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
    downloadFile(`${test.name.replace(/[^\w\-]+/g, '_')}_gradebook.csv`, csv);
  };

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto w-full flex-1">
      <PageHeader
        title={test.name}
        description={`${test.courseName ? `${test.courseName} · ` : ''}${new Date(test.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} · ${test.numQuestions} questions`}
      >
        {batches.length > 0 && (
          <select
            value={selectedBatch || ''}
            onChange={(e) => setSelectedBatch(e.target.value || null)}
            className="h-10 px-3 pr-9 border border-hairline-strong rounded-md bg-form-raised text-sm font-semibold text-ink focus:border-mark focus:outline-none cursor-pointer appearance-none"
            style={{ backgroundImage: 'none' }}
          >
            <option value="">All batches</option>
            {batches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        <Button variant="outline" icon="download" onClick={exportCSV} disabled={numScanned === 0} className="h-10 text-sm">
          Gradebook CSV
        </Button>
        <Link to={`/scan?testId=${test.id}`} className="inline-flex items-center gap-2 bg-mark text-on-mark font-semibold text-sm px-5 h-10 rounded-md hover:bg-mark-deep transition-colors">
          <Icon name="document_scanner" size={18} />
          Scan sheets
        </Link>
      </PageHeader>

      {/* The numbers that matter, as ledger lines */}
      <div className="doc mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-hairline">
          <div className="px-6 py-5">
            <span className="ledger-label">Class average</span>
            <p className="font-display text-4xl font-bold text-ink mt-1">{numScanned > 0 ? `${avgPct.toFixed(1)}%` : '—'}</p>
            <div className="mt-3"><div className="w-full bg-hairline rounded-full h-1"><div className="h-full bg-mark rounded-full transition-all duration-700" style={{ width: `${avgPct}%` }} /></div></div>
          </div>
          <div className="px-6 py-5">
            <span className="ledger-label">Spread</span>
            <p className="font-display text-4xl font-bold text-ink mt-1">{numScanned > 0 ? `${lowScore}–${highScore}%` : '—'}</p>
            <p className="text-xs text-pencil mt-3">lowest to highest mark</p>
          </div>
          <div className="px-6 py-5">
            <span className="ledger-label">Sheets graded</span>
            <p className="font-display text-4xl font-bold text-ink mt-1">{numScanned}</p>
            <p className="text-xs text-pencil mt-3">{selectedBatch ? `in ${selectedBatch}` : 'across all batches'}</p>
          </div>
          <div className="px-6 py-5">
            <span className="ledger-label">Needs a look</span>
            <p className={`font-display text-4xl font-bold mt-1 ${reviewCount > 0 ? 'text-red' : 'text-ink'}`}>{reviewCount}</p>
            <p className="text-xs text-pencil mt-3">{reviewCount > 0 ? 'flagged for manual review' : 'everything read clean'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Distribution */}
        <div className="col-span-1 lg:col-span-7 doc p-6">
          <div className="flex justify-between items-baseline mb-8">
            <h3 className="font-display text-lg font-semibold">Score Distribution</h3>
            <span className="ledger-label">{numScanned} sheet{numScanned === 1 ? '' : 's'}</span>
          </div>
          <div className="h-[220px] flex items-end relative border-b border-l border-hairline-strong">
            <div className="absolute -left-6 top-0 bottom-6 flex flex-col justify-between text-[10px] text-faint font-mono">
              <span>{maxInDist}</span><span>0</span>
            </div>
            <div className="flex-1 flex items-end justify-around h-full pb-6 relative px-2">
              <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-hairline-strong/60"></div>
              {Object.entries(dist).map(([range, count], i) => (
                <div key={range} className="flex flex-col items-center justify-end h-full flex-1 max-w-[64px] group">
                  <div
                    className={`w-full max-w-[44px] rounded-t-sm transition-all ${i === 5 ? 'bg-mark' : i >= 3 ? 'bg-mark/55' : i >= 1 ? 'bg-hairline-strong' : 'bg-red/50'} group-hover:opacity-80`}
                    style={{ height: `${Math.max((count / maxInDist) * 82, count > 0 ? 3 : 0)}%` }}
                    title={`${count} student${count === 1 ? '' : 's'}`}
                  />
                  <span className="absolute -bottom-0 text-[10px] font-mono font-semibold text-pencil whitespace-nowrap">{range}</span>
                  {count > 0 && (
                    <span className="absolute top-0 opacity-0 group-hover:opacity-100 font-mono text-[10px] font-semibold text-mark-deep transition-opacity">{count}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Item accuracy — which questions missed */}
        <div className="col-span-1 lg:col-span-5 doc flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-hairline flex justify-between items-center bg-surface-container-low">
            <h3 className="font-display text-lg font-semibold">Hardest Items</h3>
            <span className="ledger-label">by % correct</span>
          </div>
          <div className="flex-1 overflow-y-auto table-scroll" style={{ maxHeight: '290px' }}>
            {questionStats.length === 0 || numScanned === 0 ? (
              <div className="px-6 py-10 text-sm text-pencil text-center">Grade some sheets and the item analysis appears here.</div>
            ) : (
              <ul className="divide-y divide-hairline">
                {questionStats.slice(0, 12).map((item) => (
                  <li key={item.q} className="flex items-center justify-between px-5 py-3 hover:bg-surface-container-low transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-xs font-semibold w-8 h-8 rounded-full border flex items-center justify-center ${item.correct < 50 ? 'border-red/40 text-red bg-red-mist/50' : 'border-hairline-strong text-pencil'}`}>
                        {item.q}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-ink">{item.label}</span>
                        <span className="text-[11px] text-faint">
                          {item.section ? `Section ${item.section.slice(1)} · ` : ''}{optionsFor(item.format || 'A-D').join('·') || 'short answer'} · key {test.answerKey?.[item.q] || '—'}
                        </span>
                      </div>
                    </div>
                    <span className={`font-mono text-sm font-semibold ${item.correct < 50 ? 'text-red' : 'text-mark-deep'}`}>{item.correct}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Roster */}
      <div className="doc overflow-hidden">
        <div className="px-6 py-4 border-b border-hairline bg-surface-container-low flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="font-display text-lg font-semibold">Roster</h3>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Icon name="search" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                className="w-full h-9 pl-9 pr-3 rounded-md border border-hairline-strong bg-form-raised text-sm font-medium text-ink focus:border-mark focus:ring-2 focus:ring-mark/15 outline-none transition-all placeholder:text-faint"
                placeholder="Search name, ID, or batch…"
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-9 px-2 border border-hairline-strong rounded-md bg-form-raised text-xs font-semibold text-pencil focus:border-mark focus:outline-none cursor-pointer"
            >
              <option value="recent">Latest first</option>
              <option value="name">By name</option>
              <option value="score">By score</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto w-full table-scroll">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="border-b border-hairline text-pencil">
                <th className="ledger-label py-3 px-6 font-semibold">ID</th>
                <th className="ledger-label py-3 px-6 font-semibold">Student</th>
                <th className="ledger-label py-3 px-4 font-semibold">Raw</th>
                <th className="ledger-label py-3 px-4 font-semibold">Percent</th>
                <th className="ledger-label py-3 px-4 font-semibold">Grade</th>
                <th className="ledger-label py-3 px-6 font-semibold text-right">Review</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredScans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <p className="text-sm font-semibold text-faint">No sheets match</p>
                  </td>
                </tr>
              ) : filteredScans.map((student) => (
                <tr key={student.id} className="border-b last:border-0 border-hairline hover:bg-surface-container-low transition-colors group">
                  <td className="py-3.5 px-6">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-xs text-pencil">{student.studentId}</span>
                      {student.batchName && <span className="text-[10px] text-faint font-medium">{student.batchName}</span>}
                    </div>
                  </td>
                  <td className="py-3.5 px-6">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{student.studentName}</span>
                      {student.needsReview && <Chip tone="red">review</Chip>}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-mono text-xs text-pencil">{student.rawScore} / {student.maxScore}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-sm font-semibold w-11 ${student.needsReview ? 'text-red' : 'text-ink'}`}>{student.percentage}%</span>
                      <div className="w-20 bg-hairline h-1 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-700 ${student.needsReview ? 'bg-red' : 'bg-mark'}`} style={{ width: `${student.percentage}%` }}></div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`font-display text-base font-bold ${student.needsReview ? 'text-red' : 'text-mark-deep'}`}>{student.grade}</span>
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <button
                      onClick={() => navigate(`/scan?testId=${test.id}&scanId=${student.id}`)}
                      className="text-faint hover:text-mark p-2 rounded-md transition-colors sm:opacity-0 group-hover:opacity-100"
                      title="Open sheet review"
                    >
                      <Icon name="visibility" size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
