import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useStore, Scan } from '../store';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import { GoogleGenAI, Type } from "@google/genai";
import ReactCrop, { type Crop, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Icon, Button, Input, Select, Chip, Modal, BubbleMark, Field } from '../components/ui';
import { gradeResponses, optionsFor, isMultiple, formatsForTest, normalizeAnswer, letterFor } from '../lib/grading';
import { shrinkImage } from '../store';

export function ScanSheets() {
  const tests = useStore(state => state.tests);
  const scans = useStore(state => state.scans);
  const addScan = useStore(state => state.addScan);
  const updateTest = useStore(state => state.updateTest);
  const updateScan = useStore(state => state.updateScan);
  const deleteScans = useStore(state => state.deleteScans);
  const gradingScale = useStore(state => state.gradingScale);
  const partialCredit = useStore(state => state.partialCredit);
  const geminiKey = useStore(state => state.geminiKey);

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialTestId = searchParams.get('testId');
  const initialScanId = searchParams.get('scanId');

  const [selectedTestId, setSelectedTestId] = useState<string>(initialTestId || '');
  const [isScanning, setIsScanning] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [reviewScanId, setReviewScanId] = useState<string | null>(initialScanId || null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [selectedScansForDelete, setSelectedScansForDelete] = useState<Set<string>>(new Set());

  // Once tests load (or the deep-linked one resolves), pick the first by default
  useEffect(() => {
    if (!selectedTestId && tests.length > 0) {
      setSelectedTestId(tests[0].id);
    }
  }, [tests, selectedTestId]);

  // Keep the deep-linked test honored when tests arrive after mount
  useEffect(() => {
    if (initialTestId) setSelectedTestId(initialTestId);
    if (initialScanId) setReviewScanId(initialScanId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTestId, initialScanId]);

  const toggleScanSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedScansForDelete);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedScansForDelete(next);
  };

  const handleDeleteSelected = async () => {
    if (selectedScansForDelete.size === 0) return;
    await deleteScans(Array.from(selectedScansForDelete));
    setSelectedScansForDelete(new Set());
  };

  const selectedTest = tests.find(t => t.id === selectedTestId);
  const currentScans = scans.filter(s => s.testId === selectedTestId);
  const scanToReview = scans.find(s => s.id === reviewScanId);
  const testFormats = selectedTest ? formatsForTest(selectedTest.sections, selectedTest.numQuestions, selectedTest.format) : [];

  const [batchName, setBatchName] = useState<string>('');

  // ── Review-modal edit state ────────────────────────────────
  const [editingScore, setEditingScore] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editId, setEditId] = useState('');
  const [editResponses, setEditResponses] = useState<Record<number, string>>({});
  const [editingQ, setEditingQ] = useState<number | null>(null);

  // Seed the review editor whenever a different scan is opened — depend
  // on the scan's id so a late-arriving record still seeds correctly.
  useEffect(() => {
    if (scanToReview) {
      setEditName(scanToReview.studentName || '');
      setEditId(scanToReview.studentId || '');
      setEditResponses(scanToReview.responses ? { ...scanToReview.responses } : {});
      setEditingScore(null);
      setEditingQ(null);
    }
  }, [scanToReview?.id]);

  // ── Image capture / crop state ─────────────────────────────
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isReviewingImage, setIsReviewingImage] = useState(false);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);

  // ── Camera ─────────────────────────────────────────────────
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser doesn't expose a camera — upload a photo instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch (e) {
      setError("Camera was blocked or isn't available — upload a photo instead.");
    }
  };

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOn]);

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const url = canvas.toDataURL('image/jpeg', 0.92);
    stopCamera();
    setCapturedImage(url);
    setIsReviewingImage(true);
  };

  // ── Answer key editor ──────────────────────────────────────
  const [localKey, setLocalKey] = useState<Record<number, string>>({});

  const handleOpenKeyEditor = () => {
    setLocalKey(selectedTest?.answerKey || {});
    setIsEditingKey(true);
  };

  useEffect(() => {
    setLocalKey(selectedTest?.answerKey || {});
  }, [selectedTestId]);

  const missingKeyCount = selectedTest
    ? Array.from({ length: selectedTest.numQuestions }).filter((_, i) => !localKey[i + 1] || localKey[i + 1] === '').length
    : 0;

  const handleSaveKey = () => {
    if (!selectedTest || missingKeyCount > 0) return;
    updateTest(selectedTest.id, { answerKey: localKey });
    setIsEditingKey(false);
  };

  const apiKey = geminiKey || (process.env.GEMINI_API_KEY as string | undefined);
  const canScan = Boolean(selectedTest && selectedTest.answerKey && Object.keys(selectedTest.answerKey).length > 0);

  // ── Grading ────────────────────────────────────────────────
  const gradeWithAI = async (base64Data: string, mimeType: string) => {
    if (!selectedTest) return;

    if (!apiKey || apiKey === 'undefined') {
      setError("No Gemini key — add one in Settings, or upload a digitally filled PDF instead.");
      return;
    }

    setIsScanning(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `You are an expert grading assistant.
      Analyze the provided ${mimeType === 'application/pdf' ? 'PDF document' : 'image'} of an answer sheet.
      The sheet belongs to an assessment with ${selectedTest.numQuestions} questions.
      Extract the student's selected answers for each question based on the bubble sheet markings or short handwritten answers.
      If it's a PDF, examine all pages.
      If a marking is unclear or handwriting is illegible, leave it blank or use "?".
      Look for student name and ID if visible.
      Return the results as a JSON object.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { data: base64Data.split(',')[1], mimeType } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              studentName: { type: Type.STRING },
              studentId: { type: Type.STRING },
              responses: {
                type: Type.OBJECT,
                additionalProperties: { type: Type.STRING },
                description: "Keys are question numbers (1 to N), values are the student's answer (e.g. 'A', 'B', 'T', 'F')"
              }
            },
            required: ["responses"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      const aiResponses: Record<number, string> = {};

      Object.entries(result.responses || {}).forEach(([k, v]) => {
        aiResponses[Number(k)] = String(v).toUpperCase();
      });

      const grade = gradeResponses(aiResponses, selectedTest.answerKey, selectedTest.numQuestions, gradingScale, partialCredit);
      const image = await shrinkImage(base64Data);

      await addScan({
        testId: selectedTest.id,
        studentId: result.studentId || String(Math.floor(10000 + Math.random() * 90000)),
        studentName: result.studentName || "Unnamed sheet",
        rawScore: grade.rawScore,
        maxScore: grade.maxScore,
        percentage: grade.percentage,
        grade: grade.grade,
        needsReview: grade.needsReview,
        responses: aiResponses,
        imageData: image,
        batchName: batchName || undefined
      });
    } catch (err) {
      console.error(err);
      setError("The reader couldn't grade that image. Try a sharper, brighter photo — or check the Gemini key in Settings.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      void gradePDFs([file]);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setCapturedImage(event.target?.result as string);
      setIsReviewingImage(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, 1 / 1.4, width, height),
      width,
      height
    );
    setCrop(initialCrop);
  };

  const getCroppedImg = async (image: HTMLImageElement, pixelCrop: PixelCrop): Promise<string> => {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2d context');
    ctx.drawImage(
      image,
      pixelCrop.x * scaleX, pixelCrop.y * scaleY,
      pixelCrop.width * scaleX, pixelCrop.height * scaleY,
      0, 0, pixelCrop.width, pixelCrop.height
    );
    return canvas.toDataURL('image/jpeg', 0.9);
  };

  const handleConfirmCrop = async () => {
    if (imgRef.current && completedCrop) {
      const croppedBase64 = await getCroppedImg(imgRef.current, completedCrop);
      setIsReviewingImage(false);
      gradeWithAI(croppedBase64, 'image/jpeg');
    } else if (capturedImage) {
      setIsReviewingImage(false);
      gradeWithAI(capturedImage, 'image/jpeg');
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setIsReviewingImage(false);
    fileInputRef.current?.click();
  };

  // ── Digitally-filled PDFs — graded locally, no AI ──────────
  const gradePDFs = async (files: File[]) => {
    if (!selectedTest) return;
    setIsScanning(true);
    setError(null);
    let errorCount = 0;

    for (const file of files) {
      if (file.type === 'application/pdf') {
        const success = await gradePDFProgrammatically(file);
        if (!success) errorCount++;
      } else {
        errorCount++;
      }
    }

    setIsScanning(false);
    if (errorCount > 0) {
      setError(`${errorCount} file${errorCount > 1 ? 's' : ''} couldn't be read. Only digitally filled PDFs exported from GradeStack work — photos go through "Upload photo".`);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (filesList && filesList.length > 0) await gradePDFs(Array.from(filesList));
    e.target.value = '';
  };

  const gradePDFProgrammatically = async (file: File): Promise<boolean> => {
    if (!selectedTest) return false;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      if (fields.length === 0) throw new Error("No fields found");

      const studentResponses: Record<number, string> = {};
      let studentName = "";
      let studentId = "";

      fields.forEach(field => {
        const name = field.getName();
        if (name === 'student_name') {
          try { studentName = (field as any).getText(); } catch (e) {}
        } else if (name === 'student_id') {
          try { studentId = (field as any).getText(); } catch (e) {}
        } else if (name.startsWith('q.')) {
          const parts = name.split('.');
          const qNum = parseInt(parts[1]);
          const option = parts[2];
          if (!isNaN(qNum)) {
            // Duck-type — bundled pdf-lib classes may carry a numeric suffix.
            const f = field as any;
            const isRadio = typeof f.getSelected === 'function';
            const isBox = typeof f.isChecked === 'function';
            const isText = !isRadio && !isBox && typeof f.getText === 'function';
            if (isRadio) {
              try {
                const selected = f.getSelected();
                if (typeof selected === 'string' && selected && selected !== 'Off') {
                  studentResponses[qNum] = selected;
                }
              } catch (e) {}
            } else if (isBox) {
              if (f.isChecked()) {
                if (studentResponses[qNum]) {
                  const existing = studentResponses[qNum].split(',');
                  if (!existing.includes(option)) {
                    studentResponses[qNum] = [...existing, option].sort().join(',');
                  }
                } else if (option) {
                  studentResponses[qNum] = option;
                }
              }
            } else if (isText) {
              try {
                const text = f.getText();
                if (text) studentResponses[qNum] = text;
              } catch (e) {}
            }
          }
        }
      });

      const grade = gradeResponses(studentResponses, selectedTest.answerKey, selectedTest.numQuestions, gradingScale, partialCredit);

      await addScan({
        testId: selectedTest.id,
        studentId: studentId || "PDF-" + Math.floor(1000 + Math.random() * 9000),
        studentName: studentName || file.name.replace(/\.pdf$/i, ''),
        rawScore: grade.rawScore,
        maxScore: grade.maxScore,
        percentage: grade.percentage,
        grade: grade.grade,
        needsReview: grade.needsReview,
        responses: studentResponses,
        batchName: batchName || undefined
      });
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  // ── Review-modal save — re-grade from corrected responses ──
  const handleSaveReview = () => {
    if (!scanToReview || !selectedTest) return;
    const merged = { ...(scanToReview.responses || {}), ...editResponses };
    const hasResponses = Object.keys(merged).length > 0;

    const updates: Partial<Scan> = {
      studentName: editName.trim() || scanToReview.studentName,
      studentId: editId.trim() || scanToReview.studentId,
      responses: merged,
      needsReview: false,
    };

    if (editingScore !== null && editingScore !== '') {
      // Manual override wins over computed score
      const capped = Math.min(scanToReview.maxScore, Math.max(0, parseFloat(editingScore) || 0));
      updates.rawScore = capped;
      updates.percentage = scanToReview.maxScore > 0 ? Math.round((capped / scanToReview.maxScore) * 100) : 0;
      updates.grade = letterFor(updates.percentage, gradingScale);
    } else if (hasResponses) {
      const g = gradeResponses(merged, selectedTest.answerKey, scanToReview.maxScore, gradingScale, partialCredit);
      updates.rawScore = g.rawScore;
      updates.percentage = g.percentage;
      updates.grade = g.grade;
      updates.needsReview = g.needsReview;
    }

    void updateScan(scanToReview.id, updates);
    setReviewScanId(null);
  };

  const markResponse = (qNum: number, opt: string, multi: boolean) => {
    setEditResponses(prev => {
      // Fall back to the stored response so an unseeded cell never
      // discards existing marks.
      const current = prev[qNum] !== undefined ? prev[qNum] : (scanToReview?.responses?.[qNum] ?? '');
      if (multi) {
        const cur = current ? current.split(',').filter(Boolean) : [];
        const next = cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt];
        next.sort();
        return { ...prev, [qNum]: next.join(',') };
      }
      return { ...prev, [qNum]: current === opt ? '' : opt };
    });
  };

  // ── Drag & drop ────────────────────────────────────────────
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!canScan || isScanning) return;
    const files = Array.from(e.dataTransfer.files);
    const images = files.filter(f => f.type.startsWith('image/'));
    const pdfs = files.filter(f => f.type === 'application/pdf');
    if (pdfs.length) await gradePDFs(pdfs);
    if (images.length) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCapturedImage(ev.target?.result as string);
        setIsReviewingImage(true);
      };
      reader.readAsDataURL(images[0]);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full relative text-ink w-full overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,.pdf" className="hidden" />
      <input type="file" multiple ref={pdfInputRef} onChange={handlePdfUpload} accept="application/pdf" className="hidden" />

      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-5 h-14 bg-form border-b border-hairline z-40 w-full shrink-0">
        <h1 className="font-display text-xl font-semibold text-ink">Scan Sheets</h1>
        <button onClick={() => setShowDrawer(!showDrawer)} className="p-2 rounded-md text-pencil hover:text-ink hover:bg-surface-container-low transition-colors flex items-center gap-1.5">
          <Icon name={showDrawer ? 'close' : 'list_alt'} size={20} />
          <span className="text-xs font-semibold">Queue</span>
        </button>
      </header>

      {/* ── Reading surface ─────────────────────────────────── */}
      <div
        className={`flex-1 relative overflow-hidden flex flex-col items-center justify-center bg-[#131A15] ${isDragging ? 'outline-dashed outline-2 outline-mark outline-offset-[-12px]' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {/* faint ruled texture — the only decoration, earned by the subject */}
        <div className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 27px, #fff 27px, #fff 28px)' }} />

        {/* Status strip */}
        <div className="absolute top-5 left-5 z-20 hidden md:flex items-center gap-3">
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 px-4 py-2.5 rounded-md flex items-center gap-3">
            <BubbleMark size={7} className="text-[#8FC7AC]" />
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-white/90 leading-tight">{selectedTest?.name || 'No assessment selected'}</span>
              <span className="text-[10px] text-white/50 leading-tight mt-0.5">
                {selectedTest
                  ? canScan
                    ? `${Object.keys(selectedTest!.answerKey!).length}/${selectedTest.numQuestions} key marked`
                    : 'Answer key not set'
                  : 'Pick an assessment to start'}
              </span>
            </div>
          </div>
        </div>

        {/* The mark frame — real guidance, not decoration */}
        <div className="relative w-[90%] max-w-[300px] md:max-w-sm aspect-[1/1.4] z-10 mb-40 md:mb-20">
          {cameraOn ? (
            <div className="absolute inset-4 overflow-hidden rounded-md border border-[#8FC7AC]/40 bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="absolute inset-4 rounded-md border border-dashed border-white/25" />
          )}

          {/* Corner marks */}
          <div className="absolute top-0 left-0 w-7 h-7 border-t-2 border-l-2 border-[#8FC7AC] rounded-tl-md"></div>
          <div className="absolute top-0 right-0 w-7 h-7 border-t-2 border-r-2 border-[#8FC7AC] rounded-tr-md"></div>
          <div className="absolute bottom-0 left-0 w-7 h-7 border-b-2 border-l-2 border-[#8FC7AC] rounded-bl-md"></div>
          <div className="absolute bottom-0 right-0 w-7 h-7 border-b-2 border-r-2 border-[#8FC7AC] rounded-br-md"></div>

          {isScanning && (
            <motion.div
              initial={{ top: '0%' }}
              animate={{ top: '100%' }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="absolute left-0 right-0 h-[2px] bg-[#8FC7AC] shadow-[0_0_15px_#8FC7AC] z-20"
            />
          )}

        </div>

        {error && (
          <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30 max-w-md bg-red text-white px-5 py-3 rounded-md shadow-2xl flex items-start gap-3">
            <Icon name="error" size={18} />
            <span className="text-sm font-medium leading-snug">{error}</span>
            <button onClick={() => setError(null)} className="ml-1 opacity-70 hover:opacity-100"><Icon name="close" size={16} /></button>
          </div>
        )}

        {/* Capture bar */}
        <div className="absolute bottom-0 inset-x-0 pb-6 md:pb-8 pt-14 bg-gradient-to-t from-black/70 to-transparent flex flex-col items-center gap-3.5 z-20">
          <p className="text-sm font-semibold text-white/85 px-4 text-center">
            {isScanning ? 'Reading the sheet…' : cameraOn ? 'Frame the sheet between the marks' : isDragging ? 'Drop to grade' : 'Center the sheet between the marks'}
          </p>
          <div className="flex items-center justify-center flex-wrap gap-2.5 md:gap-3 px-3">
            {cameraOn ? (
              <>
                <button
                  onClick={captureFrame}
                  disabled={!canScan || isScanning}
                  className="w-16 h-16 rounded-full bg-[#8FC7AC] text-[#10231B] flex items-center justify-center hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-lg"
                  title="Capture frame"
                >
                  <Icon name="photo_camera" size={26} />
                </button>
                <button
                  onClick={stopCamera}
                  className="w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
                  title="Turn camera off"
                >
                  <Icon name="close" size={18} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={startCamera}
                  disabled={!canScan || isScanning}
                  className="flex items-center gap-2 bg-[#8FC7AC] text-[#10231B] font-semibold text-sm px-4 md:px-6 h-11 md:h-12 rounded-md hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Icon name="photo_camera" size={20} />
                  Use camera
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!canScan || isScanning}
                  className="flex items-center gap-2 bg-white/10 border border-white/25 text-white font-semibold text-sm px-4 md:px-6 h-11 md:h-12 rounded-md hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Icon name="image" size={18} />
                  Upload photo
                </button>
                <button
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={!canScan || isScanning}
                  className="flex items-center gap-2 text-white/70 font-semibold text-sm px-3 md:px-4 h-11 md:h-12 rounded-md hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Digitally filled GradeStack PDFs"
                >
                  <Icon name="upload_file" size={18} />
                  Filled PDFs
                </button>
              </>
            )}
          </div>
          <p className="text-xs font-medium text-white/50">
            {selectedTestId
              ? canScan
                ? 'Or drop a photo or filled PDF anywhere on this surface'
                : 'Set the answer key first — it lives with the assessment'
              : 'Choose an assessment in the queue panel'}
          </p>
        </div>
      </div>

      {/* ── Queue panel ─────────────────────────────────────── */}
      <aside className={`absolute md:static inset-y-0 right-0 w-full sm:w-[380px] bg-form border-l border-hairline z-30 transform transition-transform ${showDrawer ? 'translate-x-0' : 'translate-x-full md:translate-x-0'} flex flex-col shadow-2xl md:shadow-none text-ink`}>
        <div className="p-5 border-b border-hairline space-y-4 mt-14 md:mt-0">
          <Field label="Assessment">
            <Select
              value={selectedTestId}
              onChange={(e) => setSelectedTestId(e.target.value)}
            >
              <option value="" disabled>Choose an assessment</option>
              {tests.map(t => <option key={t.id} value={t.id}>{t.name || 'Untitled'} — {new Date(t.date).toLocaleDateString()}</option>)}
            </Select>
          </Field>

          <Field label="Batch or class period" hint="Tagged on every sheet you grade this session">
            <Input
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g. Period 1"
            />
          </Field>

          {selectedTest && (
            <div className="flex gap-2">
              <Button variant="outline" icon="fact_check" onClick={handleOpenKeyEditor} className="flex-1 h-10 text-xs">
                Answer key
              </Button>
              <Button variant="mist" icon="upload_file" onClick={() => pdfInputRef.current?.click()} className="flex-1 h-10 text-xs" disabled={!canScan}>
                Filled PDFs
              </Button>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-b border-hairline flex justify-between items-center bg-surface-container-low shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-semibold">Queue</h2>
            <span className="font-mono text-xs font-semibold text-pencil">{currentScans.length}</span>
          </div>
          {selectedScansForDelete.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="text-xs font-semibold text-red hover:bg-red-mist px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1"
            >
              <Icon name="delete" size={14} />
              Delete {selectedScansForDelete.size}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-surface-container-low">
          {currentScans.map((scan) => (
            <div
              key={scan.id}
              onClick={() => setReviewScanId(scan.id)}
              className={`flex items-center gap-3 px-5 py-3.5 border-b border-hairline cursor-pointer transition-colors ${scan.needsReview ? 'bg-red-mist/40 hover:bg-red-mist/70' : 'hover:bg-mark-mist-2'} ${selectedScansForDelete.has(scan.id) ? 'bg-red-mist/70' : ''}`}
            >
              <button
                onClick={(e) => toggleScanSelection(scan.id, e)}
                data-filled={selectedScansForDelete.has(scan.id)}
                className="bubble shrink-0"
                style={{ width: 20, height: 20 }}
                title="Select for delete"
              >
                {selectedScansForDelete.has(scan.id) && <Icon name="check" size={12} />}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink truncate">{scan.studentName}</p>
                  <span className={`font-mono text-sm font-semibold ${scan.needsReview ? 'text-red' : 'text-mark-deep'}`}>
                    {scan.percentage}%
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-[11px] text-pencil">{scan.studentId}</span>
                  {scan.batchName && <Chip tone="neutral">{scan.batchName}</Chip>}
                  {scan.needsReview && <Chip tone="red">review</Chip>}
                </div>
              </div>
            </div>
          ))}
          {currentScans.length === 0 && (
            <div className="text-center py-16 px-6">
              <BubbleMark size={8} className="text-faint mx-auto mb-4" />
              <p className="text-sm font-semibold text-pencil">Nothing graded yet</p>
              <p className="text-xs text-faint mt-1">Graded sheets land in this queue as they finish.</p>
            </div>
          )}
        </div>
      </aside>

      {/* ── Sheet review modal ──────────────────────────────── */}
      <AnimatePresence>
        {scanToReview && (
          <Modal
            onClose={() => { setReviewScanId(null); setEditingScore(null); }}
            title="Sheet Review"
            subtitle={`${selectedTest?.name || ''}${scanToReview.batchName ? ` · ${scanToReview.batchName}` : ''}`}
            wide
            footer={
              <>
                <Button variant="ghost" onClick={() => { setReviewScanId(null); setEditingScore(null); }}>Close</Button>
                <Button variant="solid" icon="save" onClick={handleSaveReview} className="px-6 h-10">Save review</Button>
              </>
            }
          >
            <div className="flex flex-col lg:flex-row min-h-0">
              {/* The captured sheet */}
              <div className="flex-1 bg-[#131A15] p-4 flex items-center justify-center min-h-[280px]">
                {scanToReview.imageData && !scanToReview.imageData.startsWith('data:image/svg') ? (
                  <img src={scanToReview.imageData} alt="Captured answer sheet" className="max-w-full max-h-[60vh] object-contain rounded-sm" />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-white/40 py-16">
                    <div className="w-14 h-14 rounded-md border border-white/15 flex items-center justify-center">
                      <Icon name="description" size={28} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-semibold text-white/60">Digitally filled PDF</p>
                      <p className="text-[11px] text-white/35 mt-1 max-w-[220px]">No page photo — this sheet was graded straight from the form fields.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="w-full lg:w-[340px] border-l border-hairline p-6 flex flex-col gap-6 shrink-0">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Student">
                    <Input value={editName} onChange={e => setEditName(e.target.value)} />
                  </Field>
                  <Field label="ID">
                    <Input value={editId} onChange={e => setEditId(e.target.value)} className="font-mono" />
                  </Field>
                </div>

                <div className="doc p-4">
                  <div className="flex items-end justify-between mb-3">
                    <span className="ledger-label">Score</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={editingScore ?? String(scanToReview.rawScore)}
                        onChange={(e) => setEditingScore(e.target.value)}
                        className="!w-20 !h-9 text-center font-mono font-semibold"
                        step="any"
                      />
                      <span className="font-mono text-sm text-pencil">/ {scanToReview.maxScore}</span>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-hairline flex items-center justify-between">
                    <span className="ledger-label">Grade</span>
                    <span className="font-display text-2xl font-bold text-mark-deep">
                      {(() => {
                        const s = editingScore !== null && editingScore !== '' ? (parseFloat(editingScore) || 0) : scanToReview.rawScore;
                        const p = scanToReview.maxScore > 0 ? Math.round((s / scanToReview.maxScore) * 100) : 0;
                        return `${letterFor(p, gradingScale)} · ${p}%`;
                      })()}
                    </span>
                  </div>
                  <p className="text-[11px] text-faint mt-3 leading-snug">
                    Editing an answer below recalculates the score. Typing a score here overrides it.
                  </p>
                </div>

                {/* Per-question markings — tap to correct */}
                <div className="flex-1 min-h-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="ledger-label">Marked Answers</span>
                    <span className="text-[11px] text-faint">tap one to correct it</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 max-h-48 overflow-y-auto pr-1 table-scroll">
                    {Array.from({ length: scanToReview.maxScore }).map((_, i) => {
                      const qNum = i + 1;
                      const ans = (editResponses[qNum] ?? scanToReview.responses?.[qNum]) || '';
                      const correct = selectedTest?.answerKey?.[qNum] || '';
                      const ok = ans !== '' && normalizeAnswer(ans) === normalizeAnswer(correct);
                      const isOpen = editingQ === qNum;
                      return (
                        <button
                          key={qNum}
                          onClick={() => setEditingQ(isOpen ? null : qNum)}
                          className={`w-full flex flex-col items-center justify-center py-1.5 rounded-sm border text-[10px] font-mono font-semibold transition-colors ${
                            isOpen ? 'ring-2 ring-mark ring-offset-1 ring-offset-form-raised' : ''
                          } ${
                            !ans || ans === '?' ? 'bg-red-mist border-red/40 text-red'
                            : ok ? 'bg-mark-mist/60 border-mark/30 text-mark-deep'
                            : 'bg-red-mist/30 border-red/25 text-red'}`}
                          title={`Q${qNum} — marked ${ans || 'nothing'}, key ${correct || '—'}`}
                        >
                          <span className="opacity-50 leading-none">{qNum}</span>
                          <span className="truncate w-full text-center px-0.5 leading-tight">{ans || '—'}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Correction strip — inline so nothing can clip it */}
                  {editingQ !== null && (
                    <div className="mt-2 doc p-3 flex items-center gap-3">
                      <span className="font-mono text-xs font-semibold text-pencil shrink-0">Q{editingQ}</span>
                      {(testFormats[editingQ - 1] || 'A-D') === 'SA' ? (
                        <Input
                          value={editResponses[editingQ] ?? ''}
                          onChange={e => setEditResponses(p => ({ ...p, [editingQ]: e.target.value }))}
                          placeholder="Correct answer…"
                          className="!h-8 flex-1 font-mono text-xs"
                          autoFocus
                        />
                      ) : (
                        <div className="flex gap-1.5">
                          {optionsFor(testFormats[editingQ - 1] || 'A-D').map(opt => {
                            const ans = editResponses[editingQ] ?? scanToReview.responses?.[editingQ] ?? '';
                            const selected = ans.split(',').includes(opt);
                            return (
                              <button
                                key={opt}
                                onClick={() => markResponse(editingQ, opt, isMultiple(testFormats[editingQ - 1] || 'A-D'))}
                                data-filled={selected}
                                className="bubble font-mono font-semibold"
                                style={{ width: 28, height: 28, fontSize: 12 }}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex items-center gap-1 ml-auto shrink-0">
                        <button
                          onClick={() => setEditResponses(p => ({ ...p, [editingQ]: '' }))}
                          className="w-7 h-7 rounded-full text-faint hover:text-red hover:bg-red-mist flex items-center justify-center transition-colors"
                          title="Clear answer"
                        >
                          <Icon name="backspace" size={15} />
                        </button>
                        <button
                          onClick={() => setEditingQ(null)}
                          className="w-7 h-7 rounded-full text-mark-deep hover:bg-mark-mist flex items-center justify-center transition-colors"
                          title="Done"
                        >
                          <Icon name="check" size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  variant="ghost"
                  icon="delete"
                  className="text-red hover:bg-red-mist self-start"
                  onClick={async () => {
                    await deleteScans([scanToReview.id]);
                    setReviewScanId(null);
                  }}
                >
                  Delete this sheet
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ── Answer key modal ────────────────────────────────── */}
      {isEditingKey && selectedTest && (
        <Modal
          onClose={() => setIsEditingKey(false)}
          title="Answer Key"
          subtitle={selectedTest.name}
          wide
          footer={
            <>
              <span className="text-sm font-medium text-red mr-auto">
                {missingKeyCount > 0 ? `${missingKeyCount} question${missingKeyCount === 1 ? '' : 's'} still blank` : ''}
              </span>
              <Button variant="ghost" onClick={() => setIsEditingKey(false)}>Cancel</Button>
              <Button variant="solid" onClick={handleSaveKey} disabled={missingKeyCount > 0} className="px-6 h-10">
                Save key — regrades existing sheets
              </Button>
            </>
          }
        >
          <div className="p-6 bg-surface-container-low">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Array.from({ length: selectedTest.numQuestions }).map((_, i) => {
                const qNum = i + 1;
                const rowFormat = testFormats[qNum - 1] || selectedTest.format;
                const options = optionsFor(rowFormat);
                const multi = isMultiple(rowFormat);
                const isMissing = !localKey[qNum] || localKey[qNum] === '';

                return (
                  <div key={qNum} className={`flex flex-col items-center p-3 rounded-md border transition-colors ${isMissing ? 'bg-red-mist/40 border-red/30' : 'bg-form-raised border-hairline'}`}>
                    <span className={`text-[11px] font-semibold font-mono mb-2 ${isMissing ? 'text-red' : 'text-pencil'}`}>{qNum}</span>
                    {rowFormat === 'SA' ? (
                      <input
                        type="text"
                        value={localKey[qNum] || ''}
                        onChange={(e) => setLocalKey(prev => ({ ...prev, [qNum]: e.target.value }))}
                        placeholder="Answer"
                        className="w-full text-center h-8 text-xs font-semibold border border-hairline-strong rounded-sm px-2 focus:border-mark focus:outline-none focus:ring-1 focus:ring-mark text-ink bg-form-raised"
                      />
                    ) : (
                      <div className="flex gap-1.5 flex-wrap justify-center">
                        {options.map(opt => {
                          const currentSelected = localKey[qNum] ? localKey[qNum].split(',') : [];
                          const isSelected = currentSelected.includes(opt);
                          return (
                            <button
                              key={opt}
                              onClick={() => setLocalKey(prev => {
                                if (multi) {
                                  let next = [...currentSelected];
                                  if (isSelected) next = next.filter(o => o !== opt);
                                  else next.push(opt);
                                  next.sort();
                                  return { ...prev, [qNum]: next.join(',') };
                                }
                                return { ...prev, [qNum]: prev[qNum] === opt ? '' : opt };
                              })}
                              data-filled={isSelected}
                              className="bubble font-mono font-semibold"
                              style={{ width: 28, height: 28, fontSize: 12 }}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Crop / review before grading ────────────────────── */}
      <AnimatePresence>
        {isReviewingImage && capturedImage && (
          <div className="fixed inset-0 bg-black/90 z-[70] flex flex-col items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="bg-form w-full max-w-4xl max-h-full rounded-md overflow-hidden flex flex-col shadow-2xl relative text-ink border border-hairline"
            >
              <div className="px-6 py-5 border-b border-hairline flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-headline-sm">Frame the Sheet</h2>
                  <p className="text-sm text-pencil mt-0.5">Tighten the crop to the answer area, then grade.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" icon="replay" onClick={handleRetake} className="h-9 text-xs">Retake</Button>
                  <Button variant="ghost" onClick={() => setIsReviewingImage(false)}>Close</Button>
                </div>
              </div>

              <div className="flex-1 overflow-auto bg-[#131A15] flex items-center justify-center p-4">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={1 / 1.4}
                  className="max-h-full"
                >
                  <img
                    ref={imgRef}
                    src={capturedImage}
                    alt="Sheet to grade"
                    onLoad={onImageLoad}
                    className="max-w-full max-h-[55vh] object-contain"
                  />
                </ReactCrop>
              </div>

              <div className="px-6 py-4 bg-surface-container-low border-t border-hairline flex justify-between items-center">
                <div className="flex items-center gap-2 text-pencil">
                  <Icon name="info" size={16} />
                  <span className="text-xs font-medium">Keep every row of bubbles inside the frame.</span>
                </div>
                <Button variant="solid" icon="check" onClick={handleConfirmCrop} className="px-6 h-10">
                  Grade this sheet
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
