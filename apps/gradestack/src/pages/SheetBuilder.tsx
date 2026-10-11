import React, { useState, useEffect, useRef } from 'react';
import { useStore, QuestionFormat, TestSection } from '../store';
import { useNavigate, useLocation } from 'react-router-dom';
import { PDFDocument } from 'pdf-lib';
import { generatePDF } from '../lib/pdfGenerator';
import { Reorder, motion } from 'motion/react';
import { Icon, Button, Input, Field, Toggle, BubbleMark } from '../components/ui';
import { optionsFor, isMultiple, FORMAT_LABELS, formatsForTest } from '../lib/grading';

const layoutOf = (secs: TestSection[]) => {
  let start = 1;
  return secs.map(s => {
    const count = Math.max(0, parseInt(s.count as any) || 0);
    const l = { id: s.id, format: s.format, start, count };
    start += count;
    return l;
  });
};

/* Keep the marked key aligned with the sheet as sections change: an
   answer travels with its question (same section id, same offset) while
   the question still exists and still accepts that option — otherwise
   it is dropped rather than left to grade the wrong question. */
const remapAnswerKey = (
  prevSecs: TestSection[],
  nextSecs: TestSection[],
  key: Record<number, string>,
): Record<number, string> => {
  if (Object.keys(key).length === 0) return key;
  const prevLayout = layoutOf(prevSecs);
  const nextById = new Map(layoutOf(nextSecs).map(l => [l.id, l]));
  const next: Record<number, string> = {};
  for (const [qk, ans] of Object.entries(key)) {
    const q = parseInt(qk);
    if (!ans || isNaN(q)) continue;
    const prevSec = prevLayout.find(l => q >= l.start && q < l.start + l.count);
    if (!prevSec) continue;
    const nextSec = nextById.get(prevSec.id);
    if (!nextSec || nextSec.format !== prevSec.format) continue;
    const offset = q - prevSec.start;
    if (offset >= nextSec.count) continue;
    const opts = optionsFor(nextSec.format);
    if (ans.split(',').filter(Boolean).every(o => opts.includes(o))) {
      next[nextSec.start + offset] = ans;
    }
  }
  return next;
};

export function SheetBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const editingTestId =
    (location.state as { editingTestId?: string })?.editingTestId ||
    new URLSearchParams(location.search).get('testId') ||
    undefined;
  const initialImportPdf = (location.state as { importPdf?: boolean })?.importPdf;

  const tests = useStore(state => state.tests);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isImporting, setIsImporting] = useState(initialImportPdf || false);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [sections, setSections] = useState<TestSection[]>([
    { id: crypto.randomUUID(), count: 50, format: 'A-D' }
  ]);
  const [testName, setTestName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [instructorName, setInstructorName] = useState('');
  const [includeStudentId, setIncludeStudentId] = useState(true);

  // Answer key — marked right on the sheet preview
  const [keyMode, setKeyMode] = useState(false);
  const [answerKey, setAnswerKey] = useState<Record<number, string>>({});

  /* Section edits shift question numbers — re-map the marked key so each
     answer follows its question; stale entries drop instead of grading
     the wrong row. */
  const prevSectionsRef = useRef(sections);
  useEffect(() => {
    const prev = prevSectionsRef.current;
    prevSectionsRef.current = sections;
    if (prev !== sections) {
      setAnswerKey(k => remapAnswerKey(prev, sections, k));
    }
  }, [sections]);

  const addTest = useStore(state => state.addTest);
  const updateTest = useStore(state => state.updateTest);

  const handleImportPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingPdf(true);
    setImportError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const form = pdfDoc.getForm();
      const fields = form.getFields();

      const title = pdfDoc.getTitle();
      const subject = pdfDoc.getSubject();
      const author = pdfDoc.getAuthor();

      setTestName(title && title !== 'Assessment' ? title : file.name.replace('.pdf', ''));
      setCourseName(subject && subject !== 'Test Template' ? subject : '');
      setInstructorName(author && author !== 'GradeStack' ? author : '');

      const keywordsStr = pdfDoc.getKeywords() || '';
      let parsedMetadata: any = null;
      try {
        if (keywordsStr) {
          const kw = typeof keywordsStr === 'string' ? keywordsStr : keywordsStr[0];
          if (kw) parsedMetadata = JSON.parse(kw);
        }
      } catch (e) {}

      if (parsedMetadata && parsedMetadata.sections) {
        setSections(parsedMetadata.sections);
        if (parsedMetadata.hasOwnProperty('includeStudentId')) {
          setIncludeStudentId(parsedMetadata.includeStudentId);
        }
        setIsImporting(false);
        return;
      }

      // Group fields by question number
      const questionMap = new Map<number, { format: QuestionFormat; options: Set<string> }>();

      // Duck-type the fields — bundled pdf-lib classes may carry a
      // numeric suffix (PDFTextField2), so constructor.name is unreliable.
      const isTextField = (f: any) => typeof f.setText === 'function' && typeof f.getText === 'function';
      const isRadioGroup = (f: any) => typeof f.getOptions === 'function' && typeof f.select === 'function';

      fields.forEach(field => {
        const name = field.getName();
        const parts = name.split('.'); // q.1 or q.1.A
        if (parts[0] === 'q' && parts[1]) {
          const qNum = parseInt(parts[1]);
          if (!isNaN(qNum)) {
            if (!questionMap.has(qNum)) {
              let initialFormat: QuestionFormat = 'A-D';
              if (isTextField(field)) initialFormat = 'SA';
              questionMap.set(qNum, { format: initialFormat, options: new Set() });
            }
            const qData = questionMap.get(qNum)!;
            if (parts[2]) {
              qData.options.add(parts[2]);
            } else if (isRadioGroup(field)) {
              try {
                const options = (field as any).getOptions();
                if (options) options.forEach((opt: string) => qData.options.add(opt));
              } catch (e) {}
            }
          }
        }
      });

      const maxQ = Math.max(...Array.from(questionMap.keys()), 0);
      if (maxQ === 0) {
        throw new Error("No valid bubble sheet fields found.");
      }

      questionMap.forEach((qData) => {
        if (qData.format === 'SA') return;
        if (qData.options.has('T')) {
          qData.format = 'TF';
        } else if (qData.options.has('E')) {
          qData.format = 'A-E';
        } else if (qData.options.size === 4 && qData.options.has('D')) {
          qData.format = 'A-D';
        }
      });

      fields.forEach(field => {
        const name = field.getName();
        const parts = name.split('.');
        if (parts[0] === 'q' && parts[1] && parts[2]) {
          const qNum = parseInt(parts[1]);
          if (!isNaN(qNum) && questionMap.has(qNum)) {
            const format = questionMap.get(qNum)!.format;
            if (format === 'A-D') questionMap.get(qNum)!.format = 'A-D-M';
            if (format === 'A-E') questionMap.get(qNum)!.format = 'A-E-M';
          }
        }
      });

      const importedSections: TestSection[] = [];
      let currentSection: TestSection | null = null;

      for (let i = 1; i <= maxQ; i++) {
        const qFormat = questionMap.get(i)?.format || 'A-D';
        if (!currentSection || currentSection.format !== qFormat) {
          if (currentSection) importedSections.push(currentSection);
          currentSection = { id: crypto.randomUUID(), count: 1, format: qFormat };
        } else {
          currentSection.count = (currentSection.count as number) + 1;
        }
      }
      if (currentSection) importedSections.push(currentSection);
      setSections(importedSections);
      setIsImporting(false);
    } catch (err) {
      console.error(err);
      setImportError("That PDF doesn't look like a GradeStack sheet. Re-import only works on PDFs this app exported.");
    } finally {
      setIsProcessingPdf(false);
    }
  };

  // Load test data if editing
  useEffect(() => {
    if (editingTestId && tests.length > 0 && !hasLoaded) {
      const test = tests.find(t => t.id === editingTestId);
      if (test) {
        setTestName(test.name);
        setCourseName(test.courseName || '');
        setInstructorName(test.instructorName || '');
        setIncludeStudentId(test.includeStudentId !== false);
        if (test.sections && test.sections.length > 0) {
          setSections(test.sections);
          // Loading replaces the sheet wholesale — the loaded key is
          // already aligned, so this isn't a remap-worthy edit.
          prevSectionsRef.current = test.sections;
        }
        if (test.answerKey) setAnswerKey(test.answerKey);
        setHasLoaded(true);
      }
    }
  }, [editingTestId, tests, hasLoaded]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (manualZoom !== null) return;
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width < 840) {
          setScale(Math.max((width - 40) / 800, 0.2));
        } else {
          setScale(1);
        }
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [manualZoom]);

  const effectiveScale = manualZoom !== null ? manualZoom : scale;

  const numQuestions = sections.reduce((acc, s) => acc + (parseInt(s.count as any) || 0), 0);
  const questionFormats = formatsForTest(sections, numQuestions);
  const keyMarked = Object.values(answerKey).filter(v => v && v !== '').length;

  const markKey = (qNum: number, opt: string, multi: boolean) => {
    setAnswerKey(prev => {
      if (multi) {
        const cur = prev[qNum] ? prev[qNum].split(',') : [];
        const next = cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt];
        next.sort();
        return { ...prev, [qNum]: next.join(',') };
      }
      return { ...prev, [qNum]: prev[qNum] === opt ? '' : opt };
    });
  };

  const handlePrint = async () => {
    setIsGeneratingPdf(true);
    await generatePDF(
      { name: testName, courseName, instructorName, includeStudentId, sections, numQuestions },
      () => setIsGeneratingPdf(false),
      () => setIsGeneratingPdf(false)
    );
  };

  const handleSave = async () => {
    const cleanKey = Object.fromEntries(Object.entries(answerKey).filter(([, v]) => v && v !== ''));
    const testData = {
      name: testName || 'Untitled assessment',
      courseName,
      instructorName,
      numQuestions,
      format: sections.length > 0 ? sections[0].format : 'A-D' as QuestionFormat,
      sections,
      includeStudentId,
      answerKey: cleanKey,
    };

    if (editingTestId) {
      await updateTest(editingTestId, testData);
    } else {
      await addTest(testData);
    }
    navigate('/');
  };

  /* A question row on the sheet. In key mode the bubbles are live —
     marking one writes the answer into the key. */
  const renderBubbleRow = (num: number, index: number) => {
    const isFifth = (index + 1) % 5 === 0;
    const qFormat = questionFormats[num - 1] || 'A-D';
    const ops = optionsFor(qFormat);
    const multi = isMultiple(qFormat);

    if (qFormat === 'SA') {
      return (
        <div key={num} className={`flex items-start gap-[4px] mt-[2px] ${isFifth ? 'mb-[12px]' : 'mb-[2px]'}`}>
          <span className="font-mono text-[#333] w-7 text-right select-none font-semibold text-sm tracking-tighter pt-1">{num}.</span>
          <div className="flex-1 mt-[10px] mr-4 select-none">
            {keyMode ? (
              <input
                type="text"
                value={answerKey[num] || ''}
                onChange={(e) => setAnswerKey(prev => ({ ...prev, [num]: e.target.value }))}
                placeholder="key"
                className="w-full -mt-2 px-1 py-0.5 text-[11px] font-mono border border-[#14604A]/50 rounded-sm bg-[#14604A]/5 text-[#14604A] placeholder:text-[#14604A]/40 focus:outline-none focus:border-[#14604A]"
              />
            ) : (
              <>
                <div className="border-b-[1.5px] border-[#444] w-full"></div>
                <div className="text-[7px] text-gray-400 mt-0.5 font-semibold tracking-wider text-center">SHORT ANSWER</div>
              </>
            )}
          </div>
        </div>
      );
    }

    const marked = answerKey[num] ? answerKey[num].split(',') : [];

    return (
      <div key={num} className={`flex items-center gap-[4px] mt-[2px] ${isFifth ? 'mb-[12px]' : 'mb-[2px]'}`}>
        <span className="font-mono text-[#333] w-7 text-right select-none font-semibold text-sm tracking-tighter">{num}.</span>
        <div className="flex gap-[5px]">
          {ops.map(opt => {
            const isMarked = keyMode && marked.includes(opt);
            return (
              <label
                key={opt}
                className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center font-bold text-[9px] relative select-none transition-colors
                  ${keyMode
                    ? isMarked
                      ? 'bg-[#14604A] border-[#14604A] text-white cursor-pointer'
                      : 'border-[#14604A]/60 text-[#14604A] cursor-pointer hover:bg-[#14604A]/10'
                    : 'border-[#444] text-[#444] cursor-pointer hover:bg-black/5 hover:border-[#14604A] hover:text-[#14604A]'}`}
              >
                {keyMode ? (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); markKey(num, opt, multi); }}
                    className="absolute inset-0 w-full h-full rounded-full flex items-center justify-center"
                  >
                    {opt}
                  </button>
                ) : (
                  <>
                    <input
                      type={multi ? "checkbox" : "radio"}
                      name={`question-${num}`}
                      value={opt}
                      className="peer absolute opacity-0 w-full h-full cursor-pointer z-30"
                    />
                    <span className="pointer-events-none z-20 w-full h-full flex justify-center items-center rounded-full transition-all peer-checked:bg-[#444] peer-checked:text-white peer-checked:border-[#444]">
                      {opt}
                    </span>
                  </>
                )}
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  const maxQuestionsPerPage = 80;
  const numPages = Math.max(1, Math.ceil(numQuestions / maxQuestionsPerPage));

  const pages = [];
  for (let p = 0; p < numPages; p++) {
    const startQ = p * maxQuestionsPerPage + 1;
    const endQ = Math.min((p + 1) * maxQuestionsPerPage, numQuestions);

    const columnCount = 4;
    const rowsPerColumn = Math.ceil(maxQuestionsPerPage / columnCount);
    const columns = [];

    if (numQuestions > 0) {
      for (let c = 0; c < columnCount; c++) {
        const colStart = startQ + c * rowsPerColumn;
        const colEnd = Math.min(startQ + (c + 1) * rowsPerColumn - 1, endQ);
        if (colStart > endQ) break;

        const rows = [];
        for (let i = colStart; i <= colEnd; i++) {
          rows.push(renderBubbleRow(i, i - colStart));
        }
        columns.push(rows);
      }
    } else {
      columns.push([]);
    }

    pages.push(
      <div key={p} className="mb-8 print-page-wrapper text-left inline-block" style={{ width: 800 * effectiveScale, height: 1056 * effectiveScale, position: 'relative' }}>
        <div
          className="paper-sheet shrink-0 bg-white flex flex-col relative overflow-hidden card-shadow print-page"
          style={{ transform: `scale(${effectiveScale})`, transformOrigin: 'top left', width: 800, height: 1056, position: 'absolute', top: 0, left: 0, padding: 40 }}
        >
          <div className="w-full bg-[#14604A] text-white p-4 flex justify-between items-center rounded-sm">
            <h3 className="font-display font-bold text-2xl tracking-wide">{testName || 'Untitled assessment'}</h3>
            <span className="font-semibold text-sm">PAGE {p + 1} OF {numPages}</span>
          </div>

          <div className="flex justify-between items-start mt-6 w-full">
            <div className="flex-1 pr-6 flex flex-col gap-1">
              {(courseName || instructorName) && (
                <div className="mb-4">
                  {courseName && <p className="font-bold text-sm text-gray-800">COURSE: {courseName.toUpperCase()}</p>}
                  {instructorName && <p className="font-bold text-sm text-gray-800">INSTRUCTOR: {instructorName.toUpperCase()}</p>}
                </div>
              )}
              <p className="font-bold text-[13px] text-[#14604A] tracking-wide">INSTRUCTIONS: Use a No. 2 pencil. Fill circles completely.</p>
            </div>

            {includeStudentId && p === 0 && (
              <div className="border-2 border-[#14604A] rounded-sm w-[300px] h-[75px] p-3 flex flex-col justify-between shrink-0 relative">
                <div className="flex items-end gap-2">
                  <span className="font-bold text-[10px] text-[#14604A]">STUDENT NAME:</span>
                  <div className="flex-1 border-b border-gray-400"></div>
                </div>
                <div className="flex items-end gap-2">
                  <span className="font-bold text-[10px] text-[#14604A]">DATE:</span>
                  <div className="flex-1 border-b border-gray-400"></div>
                </div>
              </div>
            )}
          </div>

          <div className="w-full border-b-[3px] border-[#14604A] mt-3 mb-4"></div>

          <div className="flex-1 grid grid-cols-4 gap-x-8 gap-y-0 content-start min-h-0 relative">
            <div className="absolute top-2 bottom-0 left-1/4 border-l border-gray-200"></div>
            <div className="absolute top-2 bottom-0 left-2/4 border-l border-gray-200"></div>
            <div className="absolute top-2 bottom-0 left-3/4 border-l border-gray-200"></div>

            {columns.map((col, idx) => (
              <div key={idx} className="flex flex-col gap-0 justify-start pl-2 z-10 bg-white">
                {col}
              </div>
            ))}
            {numQuestions === 0 && (
              <div className="col-span-4 mt-20 text-center text-gray-400 italic">
                Questions appear here as you add sections
              </div>
            )}
          </div>

          <div className="mt-auto pt-2 flex justify-between items-center text-gray-400 font-semibold shrink-0">
            <span className="text-[10px]">FORM A</span>
            <span className="text-[10px]">GRADESTACK</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden w-full h-full relative bg-paper">
      {isImporting && (
        <div className="absolute inset-0 z-50 bg-ink/50 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-form rounded-md card-shadow max-w-xl w-full overflow-hidden flex flex-col border border-hairline"
          >
            <div className="p-8 text-center border-b border-hairline">
              <BubbleMark size={9} className="text-mark mx-auto mb-5" />
              <h2 className="text-headline-md">Restore a Sheet</h2>
              <p className="text-pencil mt-2">Upload a GradeStack PDF to recover its layout — sections, formats, and student-ID block.</p>
            </div>

            <div className="p-8">
              {isProcessingPdf ? (
                <div className="flex flex-col items-center py-10">
                  <div className="w-12 h-12 border-[3px] border-mark-mist border-t-mark rounded-full animate-spin mb-6"></div>
                  <p className="font-semibold text-ink">Reading document…</p>
                  <p className="text-sm text-pencil mt-1">Extracting form fields and metadata.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <label className="block border-2 border-dashed border-hairline-strong rounded-md p-10 text-center cursor-pointer hover:border-mark hover:bg-mark-mist-2 transition-colors group">
                    <input type="file" accept="application/pdf" onChange={handleImportPdf} className="hidden" />
                    <Icon name="cloud_upload" size={36} className="text-faint group-hover:text-mark transition-colors mb-2" />
                    <p className="font-semibold text-ink group-hover:text-mark-deep transition-colors">Choose a GradeStack PDF</p>
                    <p className="text-xs text-faint mt-1">Only PDFs this app exported can be restored</p>
                  </label>

                  {importError && (
                    <div className="p-4 bg-red-mist text-red rounded-md flex items-start gap-3 text-sm font-medium border border-red/30">
                      <Icon name="error" size={18} />
                      {importError}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!isProcessingPdf && (
              <div className="p-5 bg-surface-container-low border-t border-hairline flex justify-end">
                <Button variant="ghost" onClick={() => setIsImporting(false)}>Cancel</Button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Tool rail */}
      <section className="w-full md:w-80 lg:w-[360px] flex-shrink-0 bg-form border-r border-hairline overflow-y-auto p-6 flex flex-col gap-8 z-10 relative">
        <header className="flex justify-between items-start">
          <div>
            <h2 className="text-headline-md" id="sheet-designer-title">Sheet Builder</h2>
            <p className="text-sm text-pencil mt-0.5">Design the sheet your class will fill in.</p>
          </div>
          {!editingTestId && (
            <button
              onClick={() => setIsImporting(true)}
              className="mt-1 p-2 text-pencil hover:text-mark hover:bg-mark-mist rounded-md transition-all border border-hairline-strong flex flex-col items-center gap-0.5"
              title="Restore from a GradeStack PDF"
              id="restore-pdf-btn-sidebar"
            >
              <Icon name="upload_file" size={18} />
              <span className="text-[9px] font-semibold">IMPORT</span>
            </button>
          )}
        </header>

        <div className="space-y-4">
          <div className="ledger-label">Assessment Details</div>
          <div className="grid gap-4">
            <Field label="Test name">
              <Input
                id="test-name" type="text"
                value={testName}
                placeholder="e.g. Quarter 1 final"
                onChange={(e) => setTestName(e.target.value)}
              />
            </Field>
            <Field label="Course — optional">
              <Input
                id="course-name" type="text"
                value={courseName}
                placeholder="e.g. Advanced mathematics"
                onChange={(e) => setCourseName(e.target.value)}
              />
            </Field>
            <Field label="Instructor — optional">
              <Input
                id="instructor-name" type="text"
                value={instructorName}
                placeholder="e.g. Dr. Roberts"
                onChange={(e) => setInstructorName(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="space-y-4 pt-6 border-t border-hairline">
          <div className="flex items-center justify-between">
            <div className="ledger-label">Question Sections</div>
            <Button
              variant="outline"
              icon="add"
              className="!h-8 px-2.5 text-xs"
              onClick={() => setSections([...sections, { id: crypto.randomUUID(), count: 10, format: 'A-D' }])}
            >
              Section
            </Button>
          </div>

          <Reorder.Group
            axis="y"
            values={sections}
            onReorder={setSections}
            className="space-y-3"
          >
            {sections.map((sec, idx) => (
              <Reorder.Item
                key={sec.id}
                value={sec}
                className="doc p-3.5 flex flex-col gap-3 relative group cursor-grab active:cursor-grabbing"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Icon name="drag_indicator" size={16} className="text-faint" />
                    <span className="text-xs font-semibold text-pencil">Section {idx + 1} · {FORMAT_LABELS[sec.format]}</span>
                  </div>
                  {sections.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSections(sections.filter(s => s.id !== sec.id));
                      }}
                      className="text-faint hover:text-red hover:bg-red-mist p-1 rounded-md transition-all"
                      title="Remove section"
                    >
                      <Icon name="delete" size={16} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3" onPointerDown={e => e.stopPropagation()}>
                  <div>
                    <label className="ledger-label block mb-1">Questions</label>
                    <Input
                      type="number" min="1" max="500"
                      value={sec.count.toString()}
                      onChange={(e) => setSections(sections.map(s => s.id === sec.id ? { ...s, count: parseInt(e.target.value) || 0 } : s))}
                      className="!h-9"
                    />
                  </div>
                  <div>
                    <label className="ledger-label block mb-1">Format</label>
                    <select
                      value={sec.format}
                      onChange={(e) => setSections(sections.map(s => s.id === sec.id ? { ...s, format: e.target.value as QuestionFormat } : s))}
                      className="w-full h-9 px-2 border border-hairline-strong rounded-md text-sm font-medium bg-form-raised text-ink focus:border-mark focus:outline-none focus:ring-2 focus:ring-mark/15"
                    >
                      <option value="A-D">A, B, C, D</option>
                      <option value="A-E">A, B, C, D, E</option>
                      <option value="A-D-M">A–D · mark all that apply</option>
                      <option value="A-E-M">A–E · mark all that apply</option>
                      <option value="TF">True / False</option>
                      <option value="SA">Short answer</option>
                    </select>
                  </div>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
          <div className="flex justify-between items-center px-1 py-1">
            <span className="ledger-label">Total items</span>
            <span className="font-mono text-lg font-semibold text-ink">{numQuestions}</span>
          </div>
        </div>

        <div className="pt-6 border-t border-hairline space-y-5">
          <Toggle
            checked={includeStudentId}
            onChange={setIncludeStudentId}
            label="Student ID block"
            description="Name and date fields in the sheet header"
          />
          <Toggle
            checked={keyMode}
            onChange={setKeyMode}
            label="Mark the answer key"
            description={keyMode ? `${keyMarked} of ${numQuestions} answers marked — tap bubbles on the sheet` : 'Fill bubbles on the sheet preview to set the key'}
          />
          {keyMode && (
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-hairline rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-mark rounded-full transition-all duration-300" style={{ width: `${numQuestions ? (keyMarked / numQuestions) * 100 : 0}%` }} />
              </div>
              <span className="font-mono text-xs font-semibold text-mark-deep">{keyMarked}/{numQuestions}</span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-8 flex flex-col gap-3 pb-4">
          <Button
            variant="solid"
            icon={isGeneratingPdf ? 'sync' : 'description'}
            onClick={handlePrint}
            disabled={isGeneratingPdf}
            className="h-11"
          >
            {isGeneratingPdf ? 'Generating…' : 'Download PDF'}
          </Button>
          <Button variant="outline" icon="save" onClick={handleSave} className="h-11">
            {editingTestId ? 'Save changes' : 'Save assessment'}
          </Button>
        </div>
      </section>

      {/* Sheet preview */}
      <section className="flex-1 overflow-auto bg-surface-container-low preview-container relative flex flex-col items-center" id="printable-area" ref={containerRef}>
        <div className="flex flex-col items-center w-full py-10 px-6">
          <div className="sticky top-4 z-20 flex mx-auto bg-form/95 backdrop-blur-sm border border-hairline rounded-full card-shadow overflow-hidden mb-10 shrink-0 p-1">
            {keyMode && (
              <span className="px-4 font-mono text-xs font-semibold flex items-center text-mark-deep border-r border-hairline mr-1">
                KEY {keyMarked}/{numQuestions}
              </span>
            )}
            <button onClick={() => setManualZoom(Math.max(0.2, effectiveScale - 0.1))} className="w-9 h-9 rounded-full hover:bg-surface-container transition-colors flex items-center justify-center text-ink" title="Zoom out">
              <Icon name="remove" size={18} />
            </button>
            <span className="px-3 font-mono text-sm font-semibold flex items-center justify-center w-16 select-none text-ink">{Math.round(effectiveScale * 100)}%</span>
            <button onClick={() => setManualZoom(Math.min(2, effectiveScale + 0.1))} className="w-9 h-9 rounded-full hover:bg-surface-container transition-colors flex items-center justify-center text-ink" title="Zoom in">
              <Icon name="add" size={18} />
            </button>
            <div className="w-px h-5 bg-hairline my-auto mx-1"></div>
            <button onClick={() => setManualZoom(null)} className="w-9 h-9 rounded-full hover:bg-surface-container transition-colors flex items-center justify-center text-ink" title="Fit to screen">
              <Icon name="fit_screen" size={18} />
            </button>
          </div>

          <div className="flex flex-col items-center justify-center w-full perspective-[1000px]">
            {pages}
          </div>
        </div>
      </section>
    </div>
  );
}
