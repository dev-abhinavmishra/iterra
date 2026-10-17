/* ── Functional Cross-Module Workflow Components (§4, §5, §6) ──────────────
   Exposes clean, self-contained functional UI components for:
     - CreateDeckModal (Ink / Margin → Flashcards with preview/edit & provenance)
     - AttachToInkModal (Margin → Ink with review before saving)
     - ScheduleReviewModal (Deck / Note / Problem → Syllabus block with inherited context)
     - SourceChangedBanner (Non-destructive source-change alert & diff review)
     - SessionOutcomeBar (Explicit completed / partial / interrupted / canceled confirmation)
     - WorkspaceChainView (Course workspace connected chain visualization) */

import React, { useEffect, useState } from 'react';
import type {
  CandidateCard,
  ObjectRef,
  SourceBlockExcerpt,
  SourceFreshnessReport,
  WorkspaceChain,
} from './types';
import {
  extractCandidateCardsFromText,
  listAvailableCourses,
  resolveObject,
  type CanonicalCourseInfo,
} from './identity';
import {
  acknowledgeSourceChange,
  applyReviewedDeckUpdate,
  checkSourceFreshness,
} from './relationships';
import {
  execCommand,
} from './commands';
import {
  useCourseWorkspaceChains,
} from './workspace';
import {
  useWorkflowContext,
} from './context';

function useEscapeClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

function navigateTo(url: string, onGo?: (u: string) => void) {
  if (onGo) {
    onGo(url);
    return;
  }
  const it = (window as any).iterra;
  if (it?.open) {
    it.open(url);
    return;
  }
  if (url.startsWith('#')) {
    window.location.hash = url.slice(1);
    return;
  }
  const m = url.match(/^\/apps\/([a-z]+)(?:\/[^?#]*)?(?:\?([^#]*))?/);
  if (m) {
    window.location.hash = `/p/${m[1]}${m[2] ? `?${m[2]}` : ''}`;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. CreateDeckModal — Preview & edit cards before saving (No AI required)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CreateDeckModalProps {
  open: boolean;
  onClose: () => void;
  sourceRef: Partial<ObjectRef> & { app: string; type: string; id: string };
  sourceTitle: string;
  selectedText: string;
  sourceFullText?: string;
  sourceRevision?: number | string;
  selectedBlocks?: SourceBlockExcerpt[];
  initialCourse?: string;
  initialCourseId?: string;
  initialTopic?: string;
  onCreated?: (res: { deckId: string; deckRef: string; url: string }) => void;
}

export const CreateDeckModal: React.FC<CreateDeckModalProps> = ({
  open,
  onClose,
  sourceRef,
  sourceTitle,
  selectedText,
  sourceFullText,
  sourceRevision,
  selectedBlocks,
  initialCourse,
  initialCourseId,
  initialTopic,
  onCreated,
}) => {
  const [deckTitle, setDeckTitle] = useState(sourceTitle || 'Study Deck');
  const [course, setCourse] = useState(initialCourse || '');
  const [courseId, setCourseId] = useState(initialCourseId || '');
  const [topic, setTopic] = useState(initialTopic || '');
  const [courses, setCourses] = useState<CanonicalCourseInfo[]>([]);
  const [cards, setCards] = useState<CandidateCard[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<{ deckId: string; deckRef: string; url: string; count: number } | null>(null);

  useEscapeClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    setDeckTitle(sourceTitle || 'Study Deck');
    setCourse(initialCourse || '');
    setCourseId(initialCourseId || '');
    setTopic(initialTopic || '');
    setError(null);
    setCreatedResult(null);
    const extracted = extractCandidateCardsFromText(
      selectedText || sourceFullText || '',
      sourceTitle || 'Note',
      selectedBlocks,
    );
    setCards(
      extracted.length > 0
        ? extracted
        : [{ id: 'cand-1', q: `${sourceTitle || 'Note'} — key concept`, a: (selectedText || '').trim(), ex: '' }],
    );
    void listAvailableCourses().then((list) => {
      setCourses(list);
      if (initialCourse && !initialCourseId) {
        const match = list.find((c) => c.code.toLowerCase() === initialCourse.toLowerCase());
        if (match) setCourseId(match.courseId);
      }
    });
  }, [open, sourceTitle, selectedText, sourceFullText, selectedBlocks, initialCourse, initialCourseId, initialTopic]);

  if (!open) return null;

  const updateCard = (idx: number, patch: Partial<CandidateCard>) => {
    setCards((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const removeCard = (idx: number) => {
    setCards((prev) => prev.filter((_, i) => i !== idx));
  };

  const addBlankCard = () => {
    setCards((prev) => [...prev, { id: `cand-${Date.now()}`, q: '', a: '', ex: '' }]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const valid = cards.filter((c) => c.q.trim() && c.a.trim());
    if (valid.length === 0) {
      setError('Add at least one card with both a front (question/term) and back (answer).');
      return;
    }
    setSaving(true);
    try {
      const cmdName = sourceRef.app === 'margin' ? 'attachSourceMaterial' : 'createDeckFromSelection';
      const payload =
        cmdName === 'attachSourceMaterial'
          ? {
              sourceRef: { ...sourceRef, title: sourceTitle },
              targetKind: 'flashcards-deck',
              title: deckTitle.trim() || sourceTitle || 'Study Deck',
              cards: valid,
              course: course.trim() || undefined,
              courseId: courseId || undefined,
              topic: topic.trim() || undefined,
              excerpt: selectedText,
              selectedBlocks,
              sourceSnapshot: sourceFullText || selectedText,
              sourceRevision,
              reviewedByUser: true,
            }
          : {
              sourceRef: { ...sourceRef, title: sourceTitle },
              deckTitle: deckTitle.trim() || sourceTitle || 'Study Deck',
              cards: valid,
              course: course.trim() || undefined,
              courseId: courseId || undefined,
              topic: topic.trim() || undefined,
              excerpt: selectedText,
              selectedBlocks,
              sourceSnapshot: sourceFullText || selectedText,
              sourceRevision,
            };

      const res = await execCommand<any>(cmdName, payload);
      if (!res.ok) {
        setError(res.error || 'Failed to create deck.');
        setSaving(false);
        return;
      }
      const deckRef = res.ref!;
      const deckId = deckRef.split(':').slice(2).join(':');
      const url = res.url || `/apps/flashcards/?deck=${encodeURIComponent(deckId)}`;
      setCreatedResult({ deckId, deckRef, url, count: valid.length });
      onCreated?.({ deckId, deckRef, url });
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Create flashcards deck from selection"
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-lg border border-[var(--color-line-2)] bg-[var(--color-sheet)] p-5 text-[var(--color-ink)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-line)] pb-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-faint)]">
              {sourceRef.app} → flashcards · provenance preserved
            </div>
            <h3 className="text-lg font-semibold">Create &amp; Review Deck from Note</h3>
            <p className="text-xs text-[var(--color-mute)] mt-0.5">
              Source: <span className="font-medium">{sourceTitle || sourceRef.id}</span> — preview and edit cards before saving.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-[var(--color-faint)] hover:bg-[var(--color-sheet-2)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {createdResult ? (
          <div className="py-6 space-y-4">
            <div className="rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-4 text-sm text-[var(--color-ink)]">
              <div className="font-semibold">
                ✓ Saved “{deckTitle}” ({createdResult.count} card{createdResult.count === 1 ? '' : 's'})
              </div>
              <div className="mt-1 text-xs text-[var(--color-accent)]">
                Linked to source <span className="font-mono">{sourceRef.app}:{sourceRef.type}:{sourceRef.id}</span>
                {course ? ` · Course: ${course}` : ''}
                {topic ? ` · Topic: ${topic}` : ''}.
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-[var(--color-line)] px-3 py-1.5 text-xs font-medium text-[var(--color-mute)] hover:bg-[var(--color-sheet-hover)]"
              >
                Stay here
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigateTo(createdResult.url);
                }}
                className="rounded bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-2)]"
              >
                Open deck in Flashcards →
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block sm:col-span-1">
                <span className="block text-[11px] font-medium text-[var(--color-mute)] mb-1">Deck title</span>
                <input
                  type="text"
                  value={deckTitle}
                  onChange={(e) => setDeckTitle(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1.5 text-xs"
                  required
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-[var(--color-mute)] mb-1">
                  Course (inherited / editable)
                </span>
                <div className="flex gap-1">
                  {courses.length > 0 && (
                    <select
                      value={course}
                      onChange={(e) => {
                        const code = e.target.value;
                        setCourse(code);
                        const hit = courses.find((c) => c.code === code);
                        setCourseId(hit?.courseId || '');
                      }}
                      className="rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2 py-1.5 text-xs"
                      aria-label="Select course"
                    >
                      <option value="">None / Custom</option>
                      {courses.map((c) => (
                        <option key={c.courseId} value={c.code}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    value={course}
                    onChange={(e) => {
                      setCourse(e.target.value);
                      const hit = courses.find((c) => c.code.toLowerCase() === e.target.value.trim().toLowerCase());
                      setCourseId(hit?.courseId || '');
                    }}
                    placeholder="e.g. MTH"
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1.5 text-xs"
                  />
                </div>
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-[var(--color-mute)] mb-1">Topic</span>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Integration by parts"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1.5 text-xs"
                />
              </label>
            </div>

            {selectedText && (
              <div className="rounded border border-[var(--color-line)] bg-[var(--color-sheet-2)] px-3 py-2 text-[11px] text-[var(--color-mute)]">
                <span className="font-mono uppercase text-[10px] text-[var(--color-faint)] block mb-0.5">
                  Source Excerpt Snapshot
                </span>
                <div className="line-clamp-2 italic">{selectedText}</div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[var(--color-ink)]">
                  Cards ({cards.length}) — edit or add manually
                </span>
                <button
                  type="button"
                  onClick={addBlankCard}
                  className="rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1 text-xs font-medium text-[var(--color-mute)] hover:bg-[var(--color-sheet-hover)]"
                >
                  + Add card
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {cards.map((c, idx) => (
                  <div
                    key={c.id || idx}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start rounded border border-[var(--color-line)] bg-[var(--color-sheet)] p-2.5"
                  >
                    <div className="sm:col-span-5">
                      <input
                        type="text"
                        value={c.q}
                        onChange={(e) => updateCard(idx, { q: e.target.value })}
                        placeholder="Front (question / term)"
                        aria-label={`Card ${idx + 1} front`}
                        className="w-full rounded border border-[var(--color-line)] px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-5">
                      <input
                        type="text"
                        value={c.a}
                        onChange={(e) => updateCard(idx, { a: e.target.value })}
                        placeholder="Back (answer / definition)"
                        aria-label={`Card ${idx + 1} back`}
                        className="w-full rounded border border-[var(--color-line)] px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => removeCard(idx)}
                        className="rounded px-2 py-1 text-xs text-[var(--color-bad)] hover:bg-[var(--color-bad-soft)]"
                        title="Remove card"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded border border-[var(--color-bad)]/40 bg-[var(--color-bad-soft)] px-3 py-2 text-xs text-[var(--color-bad)]" role="alert">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-line)] pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-[var(--color-line)] px-3 py-1.5 text-xs font-medium text-[var(--color-mute)] hover:bg-[var(--color-sheet-hover)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-2)] disabled:opacity-50"
              >
                {saving ? 'Saving deck…' : `Save Deck (${cards.filter((c) => c.q.trim() && c.a.trim()).length} cards)`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   2. AttachToInkModal — Margin → Ink Note with Review & Provenance (§5)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AttachToInkModalProps {
  open: boolean;
  onClose: () => void;
  sourceRef: Partial<ObjectRef> & { app: string; type: string; id: string };
  sourceTitle: string;
  initialText: string;
  sourceRevision?: number | string;
  initialCourse?: string;
  initialTopic?: string;
  onSaved?: (res: { url: string }) => void;
}

export const AttachToInkModal: React.FC<AttachToInkModalProps> = ({
  open,
  onClose,
  sourceRef,
  sourceTitle,
  initialText,
  sourceRevision,
  initialCourse,
  initialTopic,
  onSaved,
}) => {
  const [title, setTitle] = useState(sourceTitle || 'Margin Note');
  const [content, setContent] = useState(initialText || '');
  const [course, setCourse] = useState(initialCourse || '');
  const [topic, setTopic] = useState(initialTopic || '');
  const [courses, setCourses] = useState<CanonicalCourseInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);

  useEscapeClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    setTitle(sourceTitle || 'Margin Note');
    setContent(initialText || '');
    setCourse(initialCourse || '');
    setTopic(initialTopic || '');
    setError(null);
    setSavedUrl(null);
    void listAvailableCourses().then(setCourses);
  }, [open, sourceTitle, initialText, initialCourse, initialTopic]);

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!content.trim()) {
      setError('Note content cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      const res = await execCommand<{ targetRef: string; targetUrl: string }>('attachSourceMaterial', {
        sourceRef: { ...sourceRef, title: sourceTitle },
        targetKind: 'ink-note',
        title: title.trim() || sourceTitle || 'Margin Note',
        content: content.trim(),
        course: course.trim() || undefined,
        topic: topic.trim() || undefined,
        excerpt: content.trim().slice(0, 800),
        sourceSnapshot: initialText,
        sourceRevision,
        reviewedByUser: true,
      });
      if (!res.ok) {
        setError(res.error || 'Could not save Ink note.');
        setSaving(false);
        return;
      }
      const url = res.url || '/apps/ink/';
      setSavedUrl(url);
      onSaved?.({ url });
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Review and attach to Ink note"
    >
      <div
        className="w-full max-w-xl rounded-lg border border-[var(--color-line-2)] bg-[var(--color-sheet)] p-5 text-[var(--color-ink)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[var(--color-line)] pb-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-faint)]">
              margin → ink · review before saving
            </div>
            <h3 className="text-lg font-semibold">Attach Source Material to Ink</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-[var(--color-faint)] hover:bg-[var(--color-sheet-2)]">
            ✕
          </button>
        </div>

        {savedUrl ? (
          <div className="py-5 space-y-4">
            <div className="rounded border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-3.5 text-xs text-[var(--color-ink)]">
              ✓ Saved to Ink with source provenance linked to <span className="font-mono">{sourceTitle}</span>.
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded border border-[var(--color-line)] px-3 py-1.5 text-xs">
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigateTo(savedUrl);
                }}
                className="rounded bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-accent-fg)]"
              >
                Open in Ink →
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <label className="block">
                <span className="block text-[11px] font-medium text-[var(--color-mute)] mb-1">Ink Page Title</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1.5 text-xs"
                  required
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-[var(--color-mute)] mb-1">Course</span>
                <input
                  type="text"
                  list="margin-ink-courses"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  placeholder="e.g. MTH"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1.5 text-xs"
                />
                <datalist id="margin-ink-courses">
                  {courses.map((c) => (
                    <option key={c.courseId} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </datalist>
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-[var(--color-mute)] mb-1">Topic</span>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Optional topic"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1.5 text-xs"
                />
              </label>
            </div>

            <label className="block">
              <span className="block text-[11px] font-medium text-[var(--color-mute)] mb-1">
                Review &amp; edit content before saving to Ink
              </span>
              <textarea
                rows={7}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-sheet)] p-2.5 text-xs font-[var(--font-place)]"
                required
              />
            </label>

            {error && (
              <div className="rounded border border-[var(--color-bad)]/40 bg-[var(--color-bad-soft)] px-3 py-2 text-xs text-[var(--color-bad)]">{error}</div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded border border-[var(--color-line)] px-3 py-1.5 text-xs">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Confirm & Save to Ink'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   3. ScheduleReviewModal — Schedule a Syllabus Block for a Deck / Problem / Note
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ScheduleReviewModalProps {
  open: boolean;
  onClose: () => void;
  materialRef: Partial<ObjectRef> & { app: string; type: string; id: string };
  materialTitle: string;
  inheritedCourse?: string;
  inheritedCourseId?: string;
  inheritedTopic?: string;
  followUpForRef?: string | Partial<ObjectRef>;
  defaultPhase?: 'review' | 'practice' | 'work';
  onScheduled?: (res: { blockId: string; blockRef: string; url: string }) => void;
}

export const ScheduleReviewModal: React.FC<ScheduleReviewModalProps> = ({
  open,
  onClose,
  materialRef,
  materialTitle,
  inheritedCourse,
  inheritedCourseId,
  inheritedTopic,
  followUpForRef,
  defaultPhase = 'review',
  onScheduled,
}) => {
  const [wfCtx] = useWorkflowContext();
  const today = new Date().toISOString().slice(0, 10);

  const [title, setTitle] = useState(`Review: ${materialTitle}`);
  const [course, setCourse] = useState(inheritedCourse || wfCtx.course || '');
  const [courseId, setCourseId] = useState(inheritedCourseId || wfCtx.courseId || '');
  const [topic, setTopic] = useState(inheritedTopic || wfCtx.topic || '');
  const [plannedDate, setPlannedDate] = useState(today);
  const [plannedStart, setPlannedStart] = useState('16:00');
  const [plannedMinutes, setPlannedMinutes] = useState(25);
  const [courses, setCourses] = useState<CanonicalCourseInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<{ blockId: string; blockRef: string; url: string; course: string } | null>(null);

  useEscapeClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    const c = inheritedCourse || wfCtx.course || '';
    const cid = inheritedCourseId || wfCtx.courseId || '';
    const t = inheritedTopic || wfCtx.topic || '';
    setTitle(
      materialRef.type === 'problem'
        ? `Retry problem: ${materialTitle}`
        : `Review deck: ${materialTitle}`,
    );
    setCourse(c);
    setCourseId(cid);
    setTopic(t);
    setError(null);
    setScheduled(null);
    void listAvailableCourses().then((list) => {
      setCourses(list);
      if (c && !cid) {
        const match = list.find((x) => x.code.toLowerCase() === c.toLowerCase());
        if (match) setCourseId(match.courseId);
      }
    });
  }, [open, materialRef.type, materialTitle, inheritedCourse, inheritedCourseId, inheritedTopic, wfCtx.course, wfCtx.courseId, wfCtx.topic]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const isProblemRetry = materialRef.type === 'problem';
      const res = isProblemRetry
        ? await execCommand<any>('scheduleProblemRetry', {
            problemRef: { ...materialRef, title: materialTitle },
            attemptRef: followUpForRef,
            course: course.trim() || undefined,
            courseId: courseId || undefined,
            topic: topic.trim() || undefined,
            plannedDate,
            plannedStart,
            plannedMinutes,
          })
        : await execCommand<any>('scheduleReviewBlock', {
            materialRef: { ...materialRef, title: materialTitle },
            title: title.trim() || `Review: ${materialTitle}`,
            label: title.trim() || `Review: ${materialTitle}`,
            plannedDate,
            plannedStart,
            plannedMinutes,
            phase: defaultPhase,
            course: course.trim() || undefined,
            courseId: courseId || undefined,
            topic: topic.trim() || undefined,
            followUpForRef,
          });

      if (!res.ok || !res.data) {
        setError(res.error || 'Could not schedule review block.');
        setSaving(false);
        return;
      }

      const out = {
        blockId: res.data.blockId,
        blockRef: res.data.blockRef,
        url: res.url || `/apps/syllabus/?block=${encodeURIComponent(res.data.blockId)}`,
        course: res.data.course || course || 'GEN',
      };
      setScheduled(out);
      onScheduled?.(out);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Schedule review block in Syllabus"
    >
      <div
        className="w-full max-w-lg rounded-lg border border-[var(--color-line-2)] bg-[var(--color-sheet)] p-5 text-[var(--color-ink)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[var(--color-line)] pb-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-faint)]">
              {materialRef.app} → syllabus · scheduledFor relationship
            </div>
            <h3 className="text-lg font-semibold">Schedule Review Block</h3>
            <p className="text-xs text-[var(--color-mute)] mt-0.5">
              Material: <span className="font-medium">{materialTitle}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-[var(--color-faint)] hover:bg-[var(--color-sheet-2)]">
            ✕
          </button>
        </div>

        {scheduled ? (
          <div className="py-5 space-y-4">
            <div className="rounded border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-3.5 text-xs text-[var(--color-ink)]">
              <div className="font-semibold">✓ Review block scheduled on Syllabus ({plannedDate} at {plannedStart})</div>
              <div className="mt-1">
                Attached to <span className="font-mono">{materialRef.app}:{materialRef.type}:{materialRef.id}</span> under course{' '}
                <span className="font-semibold">{scheduled.course}</span>.
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded border border-[var(--color-line)] px-3 py-1.5 text-xs">
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigateTo(scheduled.url);
                }}
                className="rounded bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-accent-fg)]"
              >
                Open block in Syllabus →
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <label className="block">
              <span className="block text-[11px] font-medium text-[var(--color-mute)] mb-1">Block label</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1.5 text-xs"
                required
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[11px] font-medium text-[var(--color-mute)] mb-1">
                  Course {inheritedCourse ? '(inherited — editable)' : '(editable)'}
                </span>
                <div className="flex gap-1">
                  {courses.length > 0 && (
                    <select
                      value={course}
                      onChange={(e) => {
                        const code = e.target.value;
                        setCourse(code);
                        const hit = courses.find((c) => c.code === code);
                        setCourseId(hit?.courseId || '');
                      }}
                      className="rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2 py-1.5 text-xs"
                    >
                      <option value="">Custom / General</option>
                      {courses.map((c) => (
                        <option key={c.courseId} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    value={course}
                    onChange={(e) => {
                      setCourse(e.target.value);
                      const hit = courses.find((c) => c.code.toLowerCase() === e.target.value.trim().toLowerCase());
                      setCourseId(hit?.courseId || '');
                    }}
                    placeholder="e.g. MTH"
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1.5 text-xs"
                  />
                </div>
              </label>

              <label className="block">
                <span className="block text-[11px] font-medium text-[var(--color-mute)] mb-1">Topic</span>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Optional topic"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1.5 text-xs"
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <label className="block">
                <span className="block text-[11px] font-medium text-[var(--color-mute)] mb-1">Date</span>
                <input
                  type="date"
                  value={plannedDate}
                  onChange={(e) => setPlannedDate(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2 py-1.5 text-xs font-mono"
                  required
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-[var(--color-mute)] mb-1">Start time</span>
                <input
                  type="time"
                  value={plannedStart}
                  onChange={(e) => setPlannedStart(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2 py-1.5 text-xs font-mono"
                  required
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-[var(--color-mute)] mb-1">Duration (min)</span>
                <input
                  type="number"
                  min={5}
                  max={240}
                  step={5}
                  value={plannedMinutes}
                  onChange={(e) => setPlannedMinutes(Number(e.target.value) || 25)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-2 py-1.5 text-xs font-mono"
                  required
                />
              </label>
            </div>

            {error && (
              <div className="rounded border border-[var(--color-bad)]/40 bg-[var(--color-bad-soft)] px-3 py-2 text-xs text-[var(--color-bad)]">{error}</div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded border border-[var(--color-line)] px-3 py-1.5 text-xs">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
              >
                {saving ? 'Scheduling…' : 'Schedule Block'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   4. SourceChangedBanner — Non-Destructive Source Update Review (§2)
   ═══════════════════════════════════════════════════════════════════════════ */

export const SourceChangedBanner: React.FC<{
  deckId: string;
  onDeckUpdated?: () => void;
}> = ({ deckId, onDeckUpdated }) => {
  const [reports, setReports] = useState<SourceFreshnessReport[]>([]);
  const [reviewing, setReviewing] = useState<SourceFreshnessReport | null>(null);
  const [selectedCards, setSelectedCards] = useState<CandidateCard[]>([]);
  const [busy, setBusy] = useState(false);

  useEscapeClose(reviewing !== null, () => setReviewing(null));

  const refresh = () => {
    if (!deckId) {
      setReports([]);
      return;
    }
    void checkSourceFreshness(`flashcards:deck:${deckId}`).then(setReports);
  };

  useEffect(() => {
    refresh();
  }, [deckId]);

  if (!reports.length) return null;

  const changed = reports.filter((r) => r.status === 'sourceChanged');
  const missing = reports.filter((r) => r.status === 'sourceMissing' || r.status === 'sourceTrashed');
  const fresh = reports.filter((r) => r.status === 'fresh');

  return (
    <div className="my-2 space-y-1.5">
      {fresh.map((r) => (
        <div
          key={r.relationshipKey}
          className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--color-line)] bg-[var(--color-sheet-2)] px-3 py-1.5 text-xs text-[var(--color-mute)]"
        >
          <span>
            Derived from <span className="font-semibold">{r.sourceTitle}</span>
          </span>
          <button
            type="button"
            onClick={() => navigateTo(r.sourceUrl)}
            className="font-mono text-[11px] underline hover:text-[var(--color-ink)]"
          >
            Open source →
          </button>
        </div>
      ))}

      {missing.map((r) => (
        <div
          key={r.relationshipKey}
          className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)] px-3 py-1.5 text-xs text-[var(--color-warn)]"
        >
          <span>
            Source note <span className="font-semibold">“{r.sourceTitle}”</span> is{' '}
            {r.status === 'sourceTrashed' ? 'in the wastebasket' : 'no longer available'}. Your deck and creation snapshot remain intact.
          </span>
          {r.status === 'sourceTrashed' && (
            <button
              type="button"
              onClick={async () => {
                const obj = await resolveObject(r.sourceKey);
                if (obj?.recovery?.restore) {
                  await obj.recovery.restore();
                  refresh();
                }
              }}
              className="rounded border border-[var(--color-warn)]/60 bg-[var(--color-sheet)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-warn)]"
            >
              Restore source note
            </button>
          )}
        </div>
      ))}

      {changed.map((r) => (
        <div
          key={r.relationshipKey}
          className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--color-warn)]/60 bg-[var(--color-warn-soft)] px-3 py-2 text-xs text-[var(--color-ink)]"
          role="status"
        >
          <div>
            <span className="font-semibold">Source note updated:</span> “{r.sourceTitle}” has changed since this deck was derived.
            {r.userEditedCardCount > 0 && (
              <span className="ml-1 text-[var(--color-warn)]">
                ({r.userEditedCardCount} user-edited card{r.userEditedCardCount === 1 ? '' : 's'} protected from overwrite)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setReviewing(r);
                setSelectedCards(r.proposedNewCards);
              }}
              className="rounded bg-[var(--color-warn)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-accent-fg)] hover:opacity-90"
            >
              Review update ({r.proposedNewCards.length} new)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await acknowledgeSourceChange(r.targetKey, r.sourceKey);
                setBusy(false);
                refresh();
              }}
              className="rounded border border-[var(--color-warn)]/60 bg-[var(--color-sheet)] px-2.5 py-1 text-[11px] text-[var(--color-warn)] hover:bg-[var(--color-warn-soft)]"
            >
              Keep deck as-is
            </button>
          </div>
        </div>
      ))}

      {reviewing && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setReviewing(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Review source note changes"
        >
          <div
            className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-lg border border-[var(--color-line-2)] bg-[var(--color-sheet)] p-5 text-[var(--color-ink)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-base font-semibold">Review Changes from “{reviewing.sourceTitle}”</h4>
            <p className="mt-1 text-xs text-[var(--color-mute)]">
              Your existing {reviewing.totalCardCount} card(s) (including {reviewing.userEditedCardCount} user-edited card(s)) will NOT be overwritten.
            </p>

            {reviewing.addedExcerpts.length > 0 && (
              <div className="mt-3 rounded border border-[var(--color-line)] bg-[var(--color-sheet-2)] p-2.5 text-xs">
                <div className="font-mono text-[10px] uppercase text-[var(--color-accent)] mb-1">Added in source note</div>
                <ul className="list-disc pl-4 space-y-0.5 text-[var(--color-mute)]">
                  {reviewing.addedExcerpts.slice(0, 6).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3">
              <div className="text-xs font-semibold mb-1.5">
                Candidate cards from new source content ({selectedCards.length})
              </div>
              {selectedCards.length === 0 ? (
                <p className="text-xs text-[var(--color-faint)] italic">No additional cards proposed.</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {selectedCards.map((c, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 rounded border border-[var(--color-line)] bg-[var(--color-sheet)] p-2">
                      <input
                        type="text"
                        value={c.q}
                        onChange={(e) =>
                          setSelectedCards((prev) =>
                            prev.map((x, idx) => (idx === i ? { ...x, q: e.target.value } : x)),
                          )
                        }
                        className="col-span-5 rounded border border-[var(--color-line)] px-2 py-1 text-xs"
                      />
                      <input
                        type="text"
                        value={c.a}
                        onChange={(e) =>
                          setSelectedCards((prev) =>
                            prev.map((x, idx) => (idx === i ? { ...x, a: e.target.value } : x)),
                          )
                        }
                        className="col-span-5 rounded border border-[var(--color-line)] px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedCards((prev) => prev.filter((_, idx) => idx !== i))}
                        className="col-span-2 text-xs text-[var(--color-bad)] hover:underline"
                      >
                        Drop
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-[var(--color-line)] pt-3">
              <button
                type="button"
                onClick={() => setReviewing(null)}
                className="rounded border border-[var(--color-line)] px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await acknowledgeSourceChange(reviewing.targetKey, reviewing.sourceKey);
                  setBusy(false);
                  setReviewing(null);
                  refresh();
                }}
                className="rounded border border-[var(--color-line)] bg-[var(--color-sheet)] px-3 py-1.5 text-xs"
              >
                Acknowledge without adding cards
              </button>
              {selectedCards.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await applyReviewedDeckUpdate(deckId, reviewing.sourceKey, selectedCards);
                    setBusy(false);
                    setReviewing(null);
                    refresh();
                    onDeckUpdated?.();
                  }}
                  className="rounded bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-accent-fg)]"
                >
                  Append {selectedCards.length} card{selectedCards.length === 1 ? '' : 's'} to deck
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   5. WorkspaceChainView — Connected Workflow Chains for Course Workspace (§4.E)
   ═══════════════════════════════════════════════════════════════════════════ */

const ROLE_LABELS: Record<string, string> = {
  source: 'Note / Source',
  material: 'Ink Note',
  deck: 'Flashcards Deck',
  problem: 'Proof Problem',
  attempt: 'Attempt',
  assessment: 'Assessment',
  followup: 'Follow-up',
  block: 'Syllabus Block',
  session: 'Timer Session',
  outcome: 'Outcome',
};

export const WorkspaceChainView: React.FC<{
  courseKey?: string;
  onGo?: (url: string) => void;
}> = ({ courseKey, onGo }) => {
  const { chains, loading, refresh } = useCourseWorkspaceChains(courseKey);

  if (loading && chains.length === 0) return null;
  if (chains.length === 0) return null;

  return (
    <section className="mb-8" aria-label="Connected study workflows">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-moss-700">
          connected workflows ({chains.length})
        </div>
        <button
          type="button"
          onClick={refresh}
          className="text-[11px] text-atlas-500 hover:text-moss-700"
          title="Refresh connected chains"
        >
          ↻
        </button>
      </div>

      <div className="space-y-3">
        {chains.map((chain: WorkspaceChain) => (
          <div
            key={chain.id}
            data-chain-id={chain.id}
            className="rounded-lg border border-atlas-300 bg-atlas-50 p-3.5"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-semibold text-field-ink">{chain.title}</span>
                {chain.course && (
                  <span className="rounded bg-moss-100 px-1.5 py-0.5 text-[10px] font-semibold text-moss-700">
                    {chain.course}
                  </span>
                )}
                {chain.topic && (
                  <span className="rounded bg-atlas-100 px-1.5 py-0.5 text-[10px] text-atlas-600">
                    {chain.topic}
                  </span>
                )}
              </div>
              <span className="text-[10.5px] font-mono text-atlas-500">
                {chain.complete ? '✓ complete chain' : `${chain.steps.length} linked steps`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {chain.steps.map((step, idx) => (
                <React.Fragment key={`${step.ref}-${idx}`}>
                  {idx > 0 && (
                    <span className="text-xs text-atlas-400" aria-hidden>
                      →
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => navigateTo(step.url, onGo)}
                    className={`group flex flex-col rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                      step.status === 'missing' || step.status === 'deleted'
                        ? 'border-[var(--color-bad)]/40 bg-[var(--color-bad-soft)] text-[var(--color-bad)]'
                        : step.status === 'trashed' || step.sourceChanged
                          ? 'border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)] text-[var(--color-warn)]'
                          : 'border-atlas-300 bg-[var(--color-sheet)] hover:border-moss-500'
                    }`}
                    title={`Open ${step.title} in ${step.app}`}
                  >
                    <span className="text-[9.5px] font-semibold uppercase tracking-wider text-moss-700">
                      {ROLE_LABELS[step.role] || step.type} · {step.app}
                    </span>
                    <span className="text-[12px] font-medium text-field-ink group-hover:underline">
                      {step.title}
                    </span>
                    {step.sub && (
                      <span className="text-[10px] text-atlas-500">
                        {step.sub}
                      </span>
                    )}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
