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
import { parseRef } from './identity';
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

  useEffect(() => {
    const on = (ev: Event) => {
      const detail = normalize((ev as CustomEvent).detail);
      if (detail) {
        resultSent.current = false;
        setReq(detail);
      }
    };
    window.addEventListener(MODAL_EVENT, on);
    return () => window.removeEventListener(MODAL_EVENT, on);
  }, []);

  if (!req) return null;
  const close = () => {
    const r = req;
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
          onCreated={(res) => { resultSent.current = true; done('create-deck', res?.url); close(); }}
        />
      );
    default:
      return null;
  }
}
