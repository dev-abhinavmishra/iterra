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

   `onScheduled`/`onCreated` results surface through a second event,
   'iterra:modal:done', carrying { kind, url } so vanilla callers can react
   (toast / navigate) without importing React. */

import { useEffect, useState } from 'react';
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
  | ({ kind: 'attach-ink' } & Omit<AttachToInkModalProps, 'open' | 'onClose'>)
  | ({ kind: 'create-deck' } & Omit<CreateDeckModalProps, 'open' | 'onClose' | 'onCreated'>);

export function openIntegrationModal(req: ModalRequest): void {
  window.dispatchEvent(new CustomEvent(MODAL_EVENT, { detail: req }));
}

function done(kind: string, url?: string) {
  window.dispatchEvent(new CustomEvent(MODAL_DONE_EVENT, { detail: { kind, url } }));
}

export default function IntegrationModals() {
  const [req, setReq] = useState<ModalRequest | null>(null);

  useEffect(() => {
    const on = (ev: Event) => {
      const detail = (ev as CustomEvent<ModalRequest>).detail;
      if (detail && typeof detail === 'object' && detail.kind) setReq(detail);
    };
    window.addEventListener(MODAL_EVENT, on);
    return () => window.removeEventListener(MODAL_EVENT, on);
  }, []);

  if (!req) return null;
  const close = () => setReq(null);

  switch (req.kind) {
    case 'schedule-review':
      return (
        <ScheduleReviewModal
          {...req}
          open
          onClose={close}
          onScheduled={(res) => { done('schedule-review', res?.url); close(); }}
        />
      );
    case 'attach-ink':
      return <AttachToInkModal {...req} open onClose={close} />;
    case 'create-deck':
      return (
        <CreateDeckModal
          {...req}
          open
          onClose={close}
          onCreated={(res) => { done('create-deck', res?.url); close(); }}
        />
      );
    default:
      return null;
  }
}
