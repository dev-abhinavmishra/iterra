/* ── Integration modal host — mounted once in the shell ─────────────────────
   Any place (React island or vanilla controller) opens a review modal by
   dispatching one CustomEvent:

     window.dispatchEvent(new CustomEvent('iterra:modal', { detail: {
       kind: 'schedule-review',
       materialRef: 'flashcards:deck:abc' | {app,type,id},
       materialTitle, inheritedCourse, inheritedCourseId, inheritedTopic,
       followUpForRef, defaultPhase,
     }}))

     kind 'attach-ink'  → { sourceRef, sourceTitle, initialText, sourceRevision,
                          initialCourse, initialTopic }
     kind 'create-deck' → { sourceRef, sourceTitle, selectedText, sourceFullText,
                          sourceRevision, initialCourse, initialCourseId, initialTopic }

   `onScheduled`/`onCreated`/`onSaved` results surface through a second
   event, 'iterra:modal:done', carrying { kind, url } so vanilla callers
   can react (toast / navigate) without importing React. Closing the
   dialog without a result emits { kind, canceled: true } — listeners
   always get a terminal signal to clean up. */

import { useEffect, useRef, useState } from 'react';
import { parseRef, resolveObject } from './identity';
import type { ObjectRef } from './types';
import {
  AttachToInkModal,
  CreateDeckModal,
  ScheduleReviewModal,
  type AttachToInkModalProps,
  type CreateDeckModalProps,
  type ScheduleReviewModalProps,
} from './components';

export const MODAL_EVENT = 'iterra:modal';
export const MODAL_DONE_EVENT = 'iterra:modal:done';

type ModalRequest =
  | ({ kind: 'schedule-review' } & Omit<ScheduleReviewModalProps, 'open' | 'onClose' | 'onScheduled'>)
  | ({ kind: 'attach-ink' } & Omit<AttachToInkModalProps, 'open' | 'onClose' | 'onSaved'>)
  | ({ kind: 'create-deck' } & Omit<CreateDeckModalProps, 'open' | 'onClose' | 'onCreated'>);

export function openIntegrationModal(req: ModalRequest): void {
  window.dispatchEvent(new CustomEvent(MODAL_EVENT, { detail: req }));
}

export function canDraftNoteDeck(source: Pick<ObjectRef, 'app' | 'type'>): boolean {
  return source.type === 'note' && (source.app === 'ink' || source.app === 'margin');
}

export async function openNoteDeckDraft(
  source: Pick<ObjectRef, 'app' | 'type' | 'id'> & Partial<ObjectRef>,
  onError: (message: string) => void,
  beforeOpen?: () => void,
): Promise<void> {
  const startingRoute = window.location.hash;
  let note;
  try {
    note = await resolveObject({ app: source.app, type: source.type, id: source.id });
  } catch { /* Report unreadable notes below. */ }
  if (window.location.hash !== startingRoute) return;
  if (!note || note.status !== 'ok' || note.tier !== 'authoritative' || !note.raw) {
    onError('This note is unavailable. Open the note and try again.');
    return;
  }
  if (!note.contentText?.trim()) {
    onError('Add some text to this note before creating flashcards.');
    return;
  }
  beforeOpen?.();
  openIntegrationModal({
    kind: 'create-deck',
    sourceRef: { app: note.app, type: note.type, id: note.id },
    sourceTitle: note.title,
    selectedText: note.contentText,
    sourceFullText: note.contentText,
    sourceRevision: note.revision,
    initialCourse: note.course || source.course,
    initialCourseId: note.courseId || source.courseId,
    initialTopic: note.topic || source.topic,
  });
}

function done(kind: string, url?: string, canceled = false) {
  window.dispatchEvent(new CustomEvent(MODAL_DONE_EVENT, { detail: { kind, url, canceled } }));
}

/* Vanilla callers bypass the typed contract — refs may arrive in the
   string form 'app:type:id'. Normalize at the boundary so a malformed
   request drops with a warning instead of opening a dialog that can only
   fail on submit. */
function normalize(detail: unknown): ModalRequest | null {
  if (!detail || typeof detail !== 'object' || !(detail as any).kind) return null;
  const d = { ...(detail as Record<string, unknown>) };
  const refKey = d.kind === 'schedule-review' ? 'materialRef' : 'sourceRef';
  const ref = parseRef(d[refKey]);
  if (!ref) {
    console.warn(`[iterra:modal] ${String(d.kind)}: unparseable ${refKey} — request dropped`, d[refKey]);
    return null;
  }
  d[refKey] = ref;
  return d as ModalRequest;
}

export default function IntegrationModals() {
  const [req, setReq] = useState<ModalRequest | null>(null);
  const resultSent = useRef(false);
  /* the listener's closure can't see current req state — keep a ref so a
     second request knows whether it's interrupting a live modal */
  const reqRef = useRef<ModalRequest | null>(null);

  useEffect(() => {
    const on = (ev: Event) => {
      const detail = normalize((ev as CustomEvent).detail);
      if (detail) {
        /* callers are promised a terminal signal — a modal displaced by a
           newer request still owes its listener a canceled result */
        const prev = reqRef.current;
        if (prev && !resultSent.current) done(prev.kind, undefined, true);
        resultSent.current = false;
        reqRef.current = detail;
        setReq(detail);
      }
    };
    window.addEventListener(MODAL_EVENT, on);
    return () => window.removeEventListener(MODAL_EVENT, on);
  }, []);

  if (!req) return null;
  const close = () => {
    const r = req;
    reqRef.current = null;
    setReq(null);
    if (!resultSent.current) done(r.kind, undefined, true);
    resultSent.current = false;
  };

  switch (req.kind) {
    case 'schedule-review':
      return (
        <ScheduleReviewModal
          {...req}
          open
          onClose={close}
          onScheduled={(res) => { resultSent.current = true; done('schedule-review', res?.url); close(); }}
        />
      );
    case 'attach-ink':
      return (
        <AttachToInkModal
          {...req}
          open
          onClose={close}
          onSaved={(res) => { resultSent.current = true; done('attach-ink', res?.url); }}
        />
      );
    case 'create-deck':
      return (
        <CreateDeckModal
          {...req}
          open
          onClose={close}
          onCreated={(res) => { resultSent.current = true; done('create-deck', res?.url); }}
        />
      );
    default:
      return null;
  }
}
