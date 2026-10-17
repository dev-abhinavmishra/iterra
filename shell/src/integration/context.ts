/* ── Continuous Navigation & Workflow Context (§6) ─────────────────────────
   Carries:
     - Current object
     - Course / topic (explicitly bound to object or workflow handoff; NEVER
       silently attached merely because a course was visited recently)
     - Originating workflow
     - Related planned block
     - Active session when relevant
   Persists across navigation and reload, and broadcasts across tabs. */

import { useEffect, useState } from 'react';
import type {
  ActiveSessionContext,
  ObjectRef,
  WorkflowContext,
  WorkflowHandoff,
} from './types';
import { parseRef } from './identity';

const CONTEXT_KEY = 'iterra.v1.context';
const LIVE_SESSION_KEY = 'timer.session.live.v1';

export function getWorkflowContext(): WorkflowContext {
  const it = (window as any).iterra;
  if (it?.context?.get) {
    try {
      const ctx = it.context.get();
      if (ctx && typeof ctx === 'object') return syncActiveSessionIntoContext(ctx);
    } catch {
      /* fallback below */
    }
  }
  try {
    const raw = localStorage.getItem(CONTEXT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const base: WorkflowContext =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : { updatedAt: 0 };
    return syncActiveSessionIntoContext(base);
  } catch {
    return { updatedAt: 0 };
  }
}

/** Ensure an active Timer session (from `timer.session.live.v1` or `shared.focus`)
    remains accessible in `WorkflowContext.activeSession` across navigation and reload. */
function syncActiveSessionIntoContext(ctx: WorkflowContext): WorkflowContext {
  if (ctx.activeSession) {
    // Check if the session expired long ago (>2 hours past endsAt while running)
    const s = ctx.activeSession;
    if (s.running && s.endsAt && Date.now() - s.endsAt > 2 * 60 * 60 * 1000) {
      return { ...ctx, activeSession: null };
    }
    return ctx;
  }
  try {
    const liveRaw = localStorage.getItem(LIVE_SESSION_KEY);
    if (liveRaw) {
      const live = JSON.parse(liveRaw);
      if (live && (live.running || live.paused)) {
        const blockId = live.syllabus?.block || live.blockId || null;
        return {
          ...ctx,
          activeSession: {
            sessionId: live.sessionId || `live-${live.startedAt || Date.now()}`,
            blockRef: blockId ? `syllabus:block:${blockId}` : null,
            blockId,
            commitmentId: live.syllabus?.commitmentId || null,
            materialRef: live.syllabus?.materialRef || live.materialRef || null,
            materialTitle: live.syllabus?.materialTitle || live.materialTitle || null,
            materialUrl: live.syllabus?.materialUrl || live.materialUrl || null,
            courseId: live.syllabus?.courseId || live.courseId || null,
            course: live.syllabus?.course || live.course || null,
            topic: live.syllabus?.topic || live.topic || null,
            label: live.intent || live.label || 'Focus',
            startedAt: live.startedAt || Date.now(),
            plannedMinutes: live.totalMin || 25,
            running: !!live.running,
            paused: !!live.paused,
            endsAt: live.endsAt,
            remainingSec: live.remainingSec,
            from: live.syllabus?.from,
            returnUrl: live.syllabus?.returnUrl,
          },
        };
      }
    }
  } catch {
    /* ignore */
  }
  return ctx;
}

export function updateWorkflowContext(patch: Partial<WorkflowContext>): WorkflowContext {
  const it = (window as any).iterra;
  if (it?.context?.update) {
    try {
      return it.context.update(patch);
    } catch {
      /* fallback below */
    }
  }
  const cur = getWorkflowContext();
  const next: WorkflowContext = {
    ...cur,
    ...patch,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(CONTEXT_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('iterra:context', { detail: next }));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearWorkflowContext(keys?: (keyof WorkflowContext)[]): WorkflowContext {
  const it = (window as any).iterra;
  if (it?.context?.clear) {
    try {
      return it.context.clear(keys);
    } catch {
      /* fallback below */
    }
  }
  if (keys && keys.length > 0) {
    const cur = { ...getWorkflowContext() };
    for (const k of keys) delete cur[k];
    cur.updatedAt = Date.now();
    try {
      localStorage.setItem(CONTEXT_KEY, JSON.stringify(cur));
      window.dispatchEvent(new CustomEvent('iterra:context', { detail: cur }));
    } catch {
      /* ignore */
    }
    return cur;
  }
  const empty: WorkflowContext = { updatedAt: Date.now() };
  try {
    localStorage.setItem(CONTEXT_KEY, JSON.stringify(empty));
    window.dispatchEvent(new CustomEvent('iterra:context', { detail: empty }));
  } catch {
    /* ignore */
  }
  return empty;
}

/** Record an explicit workflow handoff when transitioning from one object/tool
    to another. Only carries course/topic if explicitly present on the source
    object or chosen by the user — never from a passive recent course visit. */
export function recordWorkflowHandoff(opts: {
  workflowName: string;
  workflowId?: string;
  fromApp: string;
  toApp: string;
  action: string;
  sourceRef?: string | Partial<ObjectRef> | null;
  targetRef?: string | Partial<ObjectRef> | null;
  plannedBlockRef?: string | Partial<ObjectRef> | null;
  courseId?: string | null;
  course?: string | null;
  topic?: string | null;
}): WorkflowContext {
  const cur = getWorkflowContext();
  const src = opts.sourceRef ? parseRef(opts.sourceRef) : null;
  const tgt = opts.targetRef ? parseRef(opts.targetRef) : null;
  const blk = opts.plannedBlockRef ? parseRef(opts.plannedBlockRef) : cur.plannedBlock ?? null;

  // Inherit course/topic ONLY from explicit parameters or the source/target object
  const explicitCourseId = opts.courseId ?? tgt?.courseId ?? src?.courseId ?? null;
  const explicitCourse = opts.course ?? tgt?.course ?? src?.course ?? null;
  const explicitTopic = opts.topic ?? tgt?.topic ?? src?.topic ?? null;

  const wfId =
    opts.workflowId ||
    cur.originatingWorkflow?.id ||
    `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const prevChain = cur.originatingWorkflow?.id === wfId ? cur.originatingWorkflow.chain : [];
  const nextChain = [...prevChain];
  if (src && !nextChain.some((x) => x.key === src.key)) nextChain.push(src);
  if (tgt && !nextChain.some((x) => x.key === tgt.key)) nextChain.push(tgt);
  if (blk && !nextChain.some((x) => x.key === blk.key)) nextChain.push(blk);

  const handoff: WorkflowHandoff = {
    id: `ho-${Date.now().toString(36)}`,
    workflowId: wfId,
    fromApp: opts.fromApp,
    toApp: opts.toApp,
    action: opts.action,
    sourceRef: src,
    targetRef: tgt,
    plannedBlockRef: blk,
    courseId: explicitCourseId,
    course: explicitCourse,
    topic: explicitTopic,
    createdAt: Date.now(),
  };

  return updateWorkflowContext({
    currentObject: tgt || src || cur.currentObject || null,
    courseId: explicitCourseId,
    course: explicitCourse,
    topic: explicitTopic,
    plannedBlock: blk,
    originatingWorkflow: {
      id: wfId,
      name: opts.workflowName,
      startedAt: cur.originatingWorkflow?.startedAt || Date.now(),
      rootRef: cur.originatingWorkflow?.rootRef || src || tgt || null,
      chain: nextChain,
    },
    lastHandoff: handoff,
  });
}

export function setActiveSessionInContext(session: ActiveSessionContext | null): WorkflowContext {
  return updateWorkflowContext({
    activeSession: session,
    ...(session?.blockRef
      ? { plannedBlock: parseRef(session.blockRef) }
      : {}),
  });
}

export function subscribeWorkflowContext(cb: (ctx: WorkflowContext) => void): () => void {
  const it = (window as any).iterra;
  if (it?.context?.subscribe) {
    return it.context.subscribe((c: WorkflowContext) => cb(syncActiveSessionIntoContext(c)));
  }
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === CONTEXT_KEY || ev.key === LIVE_SESSION_KEY) {
      cb(getWorkflowContext());
    }
  };
  const onCustom = () => {
    cb(getWorkflowContext());
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('iterra:context', onCustom);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('iterra:context', onCustom);
  };
}

export function useWorkflowContext(): [
  WorkflowContext,
  (patch: Partial<WorkflowContext>) => WorkflowContext,
  (keys?: (keyof WorkflowContext)[]) => WorkflowContext,
] {
  const [ctx, setCtx] = useState<WorkflowContext>(() => getWorkflowContext());
  useEffect(() => {
    setCtx(getWorkflowContext());
    return subscribeWorkflowContext(setCtx);
  }, []);
  return [ctx, updateWorkflowContext, clearWorkflowContext];
}
