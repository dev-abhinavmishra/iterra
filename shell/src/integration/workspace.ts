/* ── Course Workspace Chain Resolver (§4.E, §5, §6) ────────────────────────
   Reconstructs connected cross-module workflow chains for any course/topic
   (or across the whole workspace):
     1. Primary Vertical Slice:
        Ink/Margin Note → Flashcards Deck → Syllabus Review Block →
        Timer Focus Session → Recorded Session Outcome
     2. Proof Follow-up Chain:
        Proof Problem → Attempt / Error Record → Follow-up Task →
        Syllabus Retry Block (→ Timer Session)
     3. GradeStack Targeted Review Chain:
        Course → GradeStack Assessment → Follow-up Topics →
        Syllabus Review Block / Flashcards Deck
   Every node resolves against authoritative storage so connections survive
   reloads and every displayed object opens directly. */

import { useEffect, useState } from 'react';
import type {
  RelationshipRecord,
  WorkspaceChain,
  WorkspaceChainStep,
} from './types';
import {
  defaultUrlForRef,
  resolveCanonicalCourse,
  resolveObject,
} from './identity';
import {
  checkSourceFreshness,
  listAllRelationships,
} from './relationships';

function matchesCourseKey(
  item: { courseId?: string; course?: string; topic?: string },
  wantKeyLower: string,
  canonicalCourseId?: string,
  canonicalCodeLower?: string,
): boolean {
  if (!wantKeyLower) return true;
  if (wantKeyLower === 'unfiled') {
    return !item.courseId && !item.course && !item.topic;
  }
  if (canonicalCourseId && item.courseId === canonicalCourseId) return true;
  if (item.courseId && item.courseId.toLowerCase() === wantKeyLower) return true;
  if (item.course && item.course.toLowerCase() === wantKeyLower) return true;
  if (canonicalCodeLower && item.course && item.course.toLowerCase() === canonicalCodeLower) return true;
  if (item.topic && item.topic.toLowerCase() === wantKeyLower) return true;
  return false;
}

export async function buildCourseWorkspaceChains(courseKey?: string): Promise<WorkspaceChain[]> {
  const keyLower = (courseKey || '').trim().toLowerCase();
  const courseInfo = keyLower && keyLower !== 'unfiled' ? await resolveCanonicalCourse(courseKey) : null;
  const canonicalCourseId = courseInfo?.courseId;
  const canonicalCodeLower = courseInfo?.code?.toLowerCase();

  const allRels = await listAllRelationships();

  // Index relationships by canonical kind
  const derivedRels = allRels.filter((r) => r.canonicalKind === 'derivedFrom');
  const scheduledRels = allRels.filter((r) => r.canonicalKind === 'scheduledFor');
  const practicedRels = allRels.filter((r) => r.canonicalKind === 'practicedIn');
  const followUpRels = allRels.filter((r) => r.canonicalKind === 'followUpFor');
  const assessedRels = allRels.filter((r) => r.canonicalKind === 'assessedBy');

  const chains: WorkspaceChain[] = [];
  const usedBlockKeys = new Set<string>();
  const usedDeckKeys = new Set<string>();

  const toStep = async (
    refKey: string,
    role: WorkspaceChainStep['role'],
    rel?: RelationshipRecord,
  ): Promise<WorkspaceChainStep | null> => {
    const fallbackTitle =
      rel?.from === refKey ? rel.meta?.fromTitle : rel?.to === refKey ? rel.meta?.toTitle : undefined;
    const fallbackUrl =
      rel?.from === refKey ? rel.meta?.fromUrl : rel?.to === refKey ? rel.meta?.toUrl : undefined;
    const obj = await resolveObject(refKey, {
      title: fallbackTitle,
      url: fallbackUrl,
      courseId: rel?.courseId,
      course: rel?.course,
      topic: rel?.topic,
    });
    if (!obj) return null;
    return {
      role,
      ref: obj.key,
      app: obj.app,
      type: obj.type,
      id: obj.id,
      title: obj.title,
      sub: obj.sub,
      url: obj.url || defaultUrlForRef(obj.key),
      status: obj.status,
      courseId: obj.courseId || rel?.courseId,
      course: obj.course || rel?.course,
      topic: obj.topic || rel?.topic,
      relationshipKind: rel?.canonicalKind,
      meta: rel?.meta,
      outcome: rel?.meta?.outcome,
      elapsedMinutes: rel?.meta?.elapsedMinutes,
    };
  };

  // 1. Primary Vertical Slice & Deck Study Chains:
  //    (Source Note) -> Flashcards Deck -> (Syllabus Review Block) -> (Timer Session) -> (Session Outcome)
  const deckDerivedMap = new Map<string, RelationshipRecord>();
  for (const r of derivedRels) {
    if (r.from.startsWith('flashcards:deck:')) {
      deckDerivedMap.set(r.from, r);
    } else if (r.to.startsWith('flashcards:deck:')) {
      deckDerivedMap.set(r.to, r);
    }
  }

  // Also collect all decks referenced in scheduledFor relationships
  const allDeckKeys = new Set<string>([...deckDerivedMap.keys()]);
  for (const r of scheduledRels) {
    if (r.to.startsWith('flashcards:deck:')) allDeckKeys.add(r.to);
    if (r.from.startsWith('flashcards:deck:')) allDeckKeys.add(r.from);
  }

  for (const deckKey of allDeckKeys) {
    const derivRel = deckDerivedMap.get(deckKey);
    const sourceKey = derivRel
      ? derivRel.from === deckKey
        ? derivRel.meta?.sourceKey || derivRel.to
        : derivRel.from
      : null;

    const schedForDeck = scheduledRels.filter(
      (r) =>
        (r.to === deckKey && r.from.startsWith('syllabus:block:')) ||
        (r.from === deckKey && r.to.startsWith('syllabus:block:')),
    );

    const deckStep = await toStep(deckKey, 'deck', derivRel || schedForDeck[0]);
    if (!deckStep) continue;

    // Check source freshness on the deck
    const freshness = await checkSourceFreshness(deckKey);
    if (freshness.some((f) => f.status === 'sourceChanged')) {
      deckStep.sourceChanged = true;
      deckStep.sub = `${deckStep.sub ? `${deckStep.sub} · ` : ''}source updated`;
    }

    const sourceStep = sourceKey ? await toStep(sourceKey, 'source', derivRel) : null;

    // Find blocks scheduled for this deck
    const blockRels = schedForDeck.length > 0 ? schedForDeck : [undefined];
    for (const bRel of blockRels) {
      const blockKey = bRel
        ? bRel.from.startsWith('syllabus:block:')
          ? bRel.from
          : bRel.to
        : null;
      if (blockKey) usedBlockKeys.add(blockKey);
      const blockStep = blockKey ? await toStep(blockKey, 'block', bRel) : null;

      // Find sessions practiced against this block or this deck
      const sessionRels = practicedRels.filter(
        (r) =>
          (blockKey && (r.to === blockKey || r.from === blockKey)) ||
          r.to === deckKey ||
          r.from === deckKey,
      );

      const steps: WorkspaceChainStep[] = [];
      if (sourceStep) steps.push(sourceStep);
      steps.push(deckStep);
      if (blockStep) steps.push(blockStep);

      let hasSessionOutcome = false;
      for (const sRel of sessionRels) {
        const sessKey = sRel.from.startsWith('timer:session:') ? sRel.from : sRel.to;
        const sessStep = await toStep(sessKey, 'session', sRel);
        if (sessStep) {
          steps.push(sessStep);
          const outcome = sRel.meta?.outcome || (sessStep. sub?.includes('completed') ? 'completed' : undefined);
          const mins = sRel.meta?.elapsedMinutes ?? ((sessStep.meta as any)?.minutes) ?? 0;
          if (outcome) {
            hasSessionOutcome = true;
            steps.push({
              role: 'outcome',
              ref: `${sessKey}:outcome`,
              app: 'timer',
              type: 'outcome',
              id: `${sessStep.id}-outcome`,
              title: `Outcome: ${outcome} (${mins}m)`,
              sub: sRel.meta?.confirmedByUser ? 'user-confirmed' : 'recorded',
              url: blockStep ? blockStep.url : sessStep.url,
              status: 'ok',
              courseId: sessStep.courseId || deckStep.courseId,
              course: sessStep.course || deckStep.course,
              topic: sessStep.topic || deckStep.topic,
              relationshipKind: 'practicedIn',
              meta: sRel.meta,
              outcome,
              elapsedMinutes: mins,
            });
          }
        }
      }

      const chainCourseId =
        blockStep?.courseId || deckStep.courseId || sourceStep?.courseId;
      const chainCourse =
        blockStep?.course || deckStep.course || sourceStep?.course;
      const chainTopic =
        blockStep?.topic || deckStep.topic || sourceStep?.topic;

      if (
        !matchesCourseKey(
          { courseId: chainCourseId, course: chainCourse, topic: chainTopic },
          keyLower,
          canonicalCourseId,
          canonicalCodeLower,
        )
      ) {
        continue;
      }

      usedDeckKeys.add(deckKey);
      const updatedAt = Math.max(
        derivRel?.updatedAt || derivRel?.at || 0,
        bRel?.updatedAt || bRel?.at || 0,
        ...sessionRels.map((r) => r.updatedAt || r.at || 0),
        Date.now(),
      );

      chains.push({
        id: `chain-${deckKey}-${blockKey || 'noblock'}`,
        kind: 'note-deck-block-session',
        title: `${sourceStep ? `${sourceStep.title} → ` : ''}${deckStep.title}`,
        courseId: chainCourseId,
        course: chainCourse,
        topic: chainTopic,
        steps,
        updatedAt,
        complete: Boolean(sourceStep && deckStep && blockStep && hasSessionOutcome),
      });
    }
  }

  // 2. Proof Follow-Up & Retry Chains:
  //    Proof Problem -> Attempt -> Syllabus Retry Block (-> Timer Session)
  for (const bRel of scheduledRels) {
    const blockKey = bRel.from.startsWith('syllabus:block:') ? bRel.from : null;
    const probKey = bRel.to.startsWith('proof:problem:') ? bRel.to : null;
    if (!blockKey || !probKey || usedBlockKeys.has(blockKey)) continue;

    const probStep = await toStep(probKey, 'problem', bRel);
    const blockStep = await toStep(blockKey, 'block', bRel);
    if (!probStep || !blockStep) continue;

    const chainCourseId = blockStep.courseId || probStep.courseId;
    const chainCourse = blockStep.course || probStep.course;
    const chainTopic = blockStep.topic || probStep.topic;

    if (
      !matchesCourseKey(
        { courseId: chainCourseId, course: chainCourse, topic: chainTopic },
        keyLower,
        canonicalCourseId,
        canonicalCodeLower,
      )
    ) {
      continue;
    }

    usedBlockKeys.add(blockKey);
    const fuRel = followUpRels.find(
      (r) => r.from === blockKey && r.to.startsWith('proof:attempt:'),
    );
    const attStep = fuRel ? await toStep(fuRel.to, 'attempt', fuRel) : null;

    const steps: WorkspaceChainStep[] = [probStep];
    if (attStep) steps.push(attStep);
    steps.push(blockStep);

    const sessRels = practicedRels.filter((r) => r.to === blockKey || r.from === blockKey);
    for (const sRel of sessRels) {
      const sessKey = sRel.from.startsWith('timer:session:') ? sRel.from : sRel.to;
      const sessStep = await toStep(sessKey, 'session', sRel);
      if (sessStep) steps.push(sessStep);
    }

    chains.push({
      id: `chain-proof-${probKey}-${blockKey}`,
      kind: 'proof-retry-block',
      title: `Problem Retry: ${probStep.title}`,
      courseId: chainCourseId,
      course: chainCourse,
      topic: chainTopic,
      steps,
      updatedAt: bRel.updatedAt || bRel.at || Date.now(),
      complete: steps.length >= 3,
    });
  }

  // 3. GradeStack Assessment -> Targeted Review Chains
  for (const aRel of assessedRels) {
    const assessKey = aRel.to.startsWith('gradestack:assessment:') ? aRel.to : aRel.from;
    if (!assessKey.startsWith('gradestack:assessment:')) continue;
    const assessStep = await toStep(assessKey, 'assessment', aRel);
    if (!assessStep) continue;

    const chainCourseId = aRel.courseId || assessStep.courseId;
    const chainCourse = aRel.course || assessStep.course;
    const chainTopic = aRel.topic || assessStep.topic;

    if (
      !matchesCourseKey(
        { courseId: chainCourseId, course: chainCourse, topic: chainTopic },
        keyLower,
        canonicalCourseId,
        canonicalCodeLower,
      )
    ) {
      continue;
    }

    const followUpsForAssess = followUpRels.filter((r) => r.to === assessKey);
    const steps: WorkspaceChainStep[] = [assessStep];
    for (const fu of followUpsForAssess) {
      const role: WorkspaceChainStep['role'] = fu.from.startsWith('syllabus:block:')
        ? 'block'
        : fu.from.startsWith('flashcards:deck:')
          ? 'deck'
          : 'followup';
      const stp = await toStep(fu.from, role, fu);
      if (stp) steps.push(stp);
    }

    if (steps.length > 1) {
      chains.push({
        id: `chain-assess-${assessKey}`,
        kind: 'assessment-review',
        title: `Targeted Review: ${assessStep.title}`,
        courseId: chainCourseId,
        course: chainCourse,
        topic: chainTopic,
        steps,
        updatedAt: aRel.updatedAt || aRel.at || Date.now(),
        complete: steps.some((s) => s.role === 'block' || s.role === 'deck'),
      });
    }
  }

  // 4. Margin Source -> Ink Note derivations not already in a deck chain
  for (const dRel of derivedRels) {
    if (!dRel.from.startsWith('ink:note:')) continue;
    const noteStep = await toStep(dRel.from, 'material', dRel);
    const srcStep = await toStep(dRel.to, 'source', dRel);
    if (!noteStep || !srcStep) continue;
    const chainCourseId = noteStep.courseId || srcStep.courseId || dRel.courseId;
    const chainCourse = noteStep.course || srcStep.course || dRel.course;
    const chainTopic = noteStep.topic || srcStep.topic || dRel.topic;

    if (
      !matchesCourseKey(
        { courseId: chainCourseId, course: chainCourse, topic: chainTopic },
        keyLower,
        canonicalCourseId,
        canonicalCodeLower,
      )
    ) {
      continue;
    }

    chains.push({
      id: `chain-note-${dRel.from}-${dRel.to}`,
      kind: 'material-study',
      title: `${srcStep.title} → ${noteStep.title}`,
      courseId: chainCourseId,
      course: chainCourse,
      topic: chainTopic,
      steps: [srcStep, noteStep],
      updatedAt: dRel.updatedAt || dRel.at || Date.now(),
      complete: true,
    });
  }

  chains.sort((a, b) => (b.complete ? 1 : 0) - (a.complete ? 1 : 0) || b.updatedAt - a.updatedAt);
  return chains;
}

export function useCourseWorkspaceChains(courseKey?: string): {
  chains: WorkspaceChain[];
  loading: boolean;
  refresh: () => void;
} {
  const [chains, setChains] = useState<WorkspaceChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    buildCourseWorkspaceChains(courseKey)
      .then((res) => {
        if (alive) {
          setChains(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [courseKey, tick]);

  useEffect(() => {
    const it = (window as any).iterra;
    const bump = () => setTick((t) => t + 1);
    const unsubs: (() => void)[] = [];
    if (it?.store?.subscribe) {
      try {
        unsubs.push(it.store.subscribe(bump));
      } catch {
        /* ignore */
      }
    }
    if (it?.links?.subscribe) {
      try {
        unsubs.push(it.links.subscribe(bump));
      } catch {
        /* ignore */
      }
    }
    const onAuthWrite = () => bump();
    window.addEventListener('iterra:authoritative-write', onAuthWrite);
    window.addEventListener('storage', onAuthWrite);
    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          /* ignore */
        }
      });
      window.removeEventListener('iterra:authoritative-write', onAuthWrite);
      window.removeEventListener('storage', onAuthWrite);
    };
  }, []);

  return {
    chains,
    loading,
    refresh: () => setTick((t) => t + 1),
  };
}
