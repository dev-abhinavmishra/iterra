/* ── Persistence, Versioned Migrations, Cross-Tab Sync & Export/Import (§7) ─
   - Idempotent, versioned schema migrations preserving existing user data
   - Bootstrap mirroring of persisted local app stores into the canonical store
     so unvisited modules' objects are immediately resolvable in search/dossiers
   - Cross-tab storage event & BroadcastChannel synchronization
   - Workspace export/import covering shared entities, relationships, follow-up
     tasks, and workflow context with strict validation */

import type {
  FollowUpTask,
  RelationshipRecord,
  WorkspaceExportBundle,
} from './types';
import {
  formatRefKey,
  parseRef,
  readFollowUpTasks,
  resolveCanonicalCourse,
  writeFollowUpTasks,
} from './identity';
import {
  addRelationship,
  listAllRelationships,
  normalizeRelationshipKind,
} from './relationships';
import {
  getWorkflowContext,
  updateWorkflowContext,
} from './context';

export const INTEGRATION_SCHEMA_VERSION = 2;
const SCHEMA_VERSION_KEY = 'iterra.v1.integrationSchemaVersion';

function readZustandState(key: string): Record<string, any> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && 'state' in parsed ? parsed.state : parsed) || null;
  } catch {
    return null;
  }
}

/** Run versioned, idempotent migrations across local stores and the canonical
    entity/relationship graph. Safe to call multiple times. */
export async function runIntegrationMigrations(): Promise<{
  migrated: boolean;
  fromVersion: number;
  toVersion: number;
  entitiesBackfilled: number;
  relationshipsUpgraded: number;
}> {
  let fromVersion = 0;
  try {
    fromVersion = Number(localStorage.getItem(SCHEMA_VERSION_KEY) || '0') || 0;
  } catch {
    fromVersion = 0;
  }

  let entitiesBackfilled = 0;
  let relationshipsUpgraded = 0;
  const it = (window as any).iterra;

  // 1. Upgrade legacy link records (`derived` -> `derivedFrom`, `retest` -> `followUpFor`)
  try {
    const rels = await listAllRelationships();
    for (const r of rels) {
      const canonical = normalizeRelationshipKind(r.canonicalKind || r.kind);
      if (r.canonicalKind !== canonical || (r.kind === 'derived' || r.kind === 'retest')) {
        await addRelationship({
          from: r.from,
          to: r.to,
          kind: r.kind,
          courseId: r.courseId,
          course: r.course,
          topic: r.topic,
          workflowId: r.workflowId,
          meta: r.meta,
        });
        relationshipsUpgraded++;
      }
    }
  } catch {
    /* ignore */
  }

  // 2. Backfill canonical store from persisted module stores even if those modules haven't mounted yet
  if (it?.store?.put) {
    // 2a. Syllabus courses, commitments, blocks, and ResourceLinks
    const folio = readZustandState('syllabus.folio.v1');
    if (folio) {
      const courses = folio.courses || {};
      const commitments = folio.commitments || {};
      const blocks = folio.blocks || {};
      const links = folio.links || {};

      for (const c of Object.values(courses) as any[]) {
        if (!c || !c.id) continue;
        await it.store.put({
          app: 'syllabus',
          type: 'course',
          id: c.id,
          title: c.name || c.code,
          course: c.code,
          url: '/apps/syllabus/',
          data: { code: c.code, termId: c.termId, color: c.color, archived: c.archived || undefined },
        }).catch(() => {});
        entitiesBackfilled++;
      }

      for (const k of Object.values(commitments) as any[]) {
        if (!k || !k.id) continue;
        const course = courses[k.courseId];
        await it.store.put({
          app: 'syllabus',
          type: 'commitment',
          id: k.id,
          courseId: k.courseId ? `syllabus:course:${k.courseId}` : undefined,
          course: course?.code,
          title: k.title,
          sub: k.type,
          url: `/apps/syllabus/?commitment=${encodeURIComponent(k.id)}`,
          data: {
            type: k.type,
            dueAt: k.dueAt,
            weight: k.weight,
            status: k.status,
            estimatedMinutes: k.estimatedMinutes,
            loggedMinutes: k.loggedMinutes,
          },
        }).catch(() => {});
        entitiesBackfilled++;
      }

      for (const b of Object.values(blocks) as any[]) {
        if (!b || !b.id) continue;
        const k = commitments[b.commitmentId];
        const course = k ? courses[k.courseId] : undefined;
        await it.store.put({
          app: 'syllabus',
          type: 'block',
          id: b.id,
          courseId: k?.courseId ? `syllabus:course:${k.courseId}` : undefined,
          course: course?.code,
          topic: b.topic,
          title: b.label || k?.title || 'Planned Block',
          url: `/apps/syllabus/?block=${encodeURIComponent(b.id)}`,
          data: {
            commitmentId: b.commitmentId,
            plannedDate: b.plannedDate,
            plannedStart: b.plannedStart,
            plannedMinutes: b.plannedMinutes,
            actualMinutes: b.actualMinutes,
            state: b.state,
            phase: b.phase,
            score: b.score,
            materialRef: b.materialRef,
          },
        }).catch(() => {});
        entitiesBackfilled++;
      }

      // Migrate Syllabus ResourceLinks into `scheduledFor` relationships
      for (const l of Object.values(links) as any[]) {
        if (!l || !l.resourceId || !l.app || l.app === 'other') continue;
        const targetApp = l.app === 'modular' ? 'margin' : l.app;
        const targetType = l.resourceType || (targetApp === 'flashcards' ? 'deck' : targetApp === 'ink' ? 'note' : 'assessment');
        const targetKey = `${targetApp}:${targetType}:${l.resourceId}`;
        if (l.commitmentId) {
          const matchingBlocks = Object.values(blocks).filter((b: any) => b && b.commitmentId === l.commitmentId) as any[];
          for (const b of matchingBlocks) {
            await addRelationship({
              from: `syllabus:block:${b.id}`,
              to: targetKey,
              kind: 'scheduledFor',
              courseId: l.courseId ? `syllabus:course:${l.courseId}` : undefined,
              course: l.courseId ? courses[l.courseId]?.code : undefined,
              meta: {
                fromTitle: b.label || commitments[l.commitmentId]?.title,
                fromUrl: `/apps/syllabus/?block=${encodeURIComponent(b.id)}`,
                toTitle: l.label,
                toUrl: l.deepLink,
              },
            });
            relationshipsUpgraded++;
          }
        }
      }
    }

    // 2b. Ink notes (`ink-notes-storage`)
    const inkState = readZustandState('ink-notes-storage');
    if (Array.isArray(inkState?.notes)) {
      for (const n of inkState.notes) {
        if (!n || !n.id || n.trashedAt) continue;
        let course: string | undefined = n.course;
        let courseId: string | undefined = n.courseId;
        if (!courseId && Array.isArray(n.tags)) {
          for (const tag of n.tags) {
            const c = await resolveCanonicalCourse(tag);
            if (c) {
              course = c.code;
              courseId = c.courseId;
              break;
            }
          }
        }
        await it.store.put({
          app: 'ink',
          type: 'note',
          id: n.id,
          courseId,
          course,
          topic: n.topic,
          title: n.title || 'Untitled Note',
          sub: n.folder,
          url: `/apps/ink/?note=${encodeURIComponent(n.id)}`,
          data: { updated: n.lastModified, folder: n.folder, tags: n.tags, words: n.wordCount },
        }).catch(() => {});
        entitiesBackfilled++;
      }
    }

    // 2c. Flashcards decks (`cardfile.decks.v1`)
    try {
      const decksRaw = localStorage.getItem('cardfile.decks.v1');
      const decks: Record<string, any> = decksRaw ? JSON.parse(decksRaw) : {};
      for (const d of Object.values(decks)) {
        if (!d || !d.id || !Array.isArray(d.cards)) continue;
        const cInfo = d.courseId || d.course ? await resolveCanonicalCourse(d.courseId || d.course) : null;
        const courseId = cInfo?.courseId || d.courseId;
        const course = cInfo?.code || d.course;
        const due = d.cards.filter((c: any) => c && c.status !== 'mastered').length;
        await it.store.put({
          app: 'flashcards',
          type: 'deck',
          id: d.id,
          courseId,
          course,
          topic: d.topic,
          title: d.title || 'Untitled deck',
          sub: `${due} due`,
          url: `/apps/flashcards/?deck=${encodeURIComponent(d.id)}`,
          createdAt: d.createdAt,
          data: { count: d.cards.length, due, sourceRef: d.sourceRef },
        }).catch(() => {});
        entitiesBackfilled++;
      }
    } catch {
      /* ignore */
    }

    // 2d. Timer sessions (`timer.sessions.v1`)
    try {
      const sessionsRaw = localStorage.getItem('timer.sessions.v1');
      const sessions: any[] = sessionsRaw ? JSON.parse(sessionsRaw) : [];
      for (const s of sessions.slice(-100)) {
        if (!s || !s.id || s.type !== 'focus') continue;
        const mins = Math.round((s.duration || 0) / 60);
        const label = s.label || s.preset || 'Focus';
        await it.store.put({
          app: 'timer',
          type: 'session',
          id: s.id,
          courseId: s.courseId,
          course: s.course,
          topic: s.topic,
          title: label,
          sub: `${mins}m${s.outcome ? ` · ${s.outcome}` : ''}`,
          url: '/apps/timer/',
          createdAt: s.timestamp,
          data: {
            minutes: mins,
            label,
            commitmentId: s.commitmentId,
            blockId: s.blockId,
            materialRef: s.materialRef,
            outcome: s.outcome || 'completed',
            startedAt: s.timestamp - Math.round((s.duration || 0) * 1000),
            endedAt: s.timestamp,
          },
        }).catch(() => {});
        entitiesBackfilled++;
      }
    } catch {
      /* ignore */
    }
  }

  try {
    localStorage.setItem(SCHEMA_VERSION_KEY, String(INTEGRATION_SCHEMA_VERSION));
  } catch {
    /* ignore */
  }

  return {
    migrated: fromVersion < INTEGRATION_SCHEMA_VERSION,
    fromVersion,
    toVersion: INTEGRATION_SCHEMA_VERSION,
    entitiesBackfilled,
    relationshipsUpgraded,
  };
}

/* ── Cross-Tab Synchronization (§7) ────────────────────────────────────── */

const WATCHED_STORAGE_KEYS = new Set([
  'syllabus.folio.v1',
  'ink-notes-storage',
  'cardfile.decks.v1',
  'proof.workbench.v1',
  'gradestack-storage',
  'rhythm.register.v1',
  'timer.sessions.v1',
  'timer.session.live.v1',
  'iterra.v1.context',
  'iterra.v1.followups',
  'iterra.v1.store.entities',
  'iterra.v1.store.links',
  'iterra.v1.store.commands',
]);

let crossTabInstalled = false;

export function installCrossTabSync(onExternalUpdate?: (key: string) => void): () => void {
  const handleStorage = (ev: StorageEvent) => {
    const key = ev.key || '';
    if (!WATCHED_STORAGE_KEYS.has(key) && !key.startsWith('iterra.v1.')) return;

    // Rehydrate active Zustand stores when another tab updates their localStorage key
    try {
      if (key === 'syllabus.folio.v1') {
        const s = (window as any).__syllabusFolioStore;
        if (s?.persist?.rehydrate) s.persist.rehydrate();
      } else if (key === 'ink-notes-storage') {
        const s = (window as any).__inkStore;
        if (s?.persist?.rehydrate) s.persist.rehydrate();
      } else if (key === 'proof.workbench.v1') {
        const s = (window as any).__proofWorkbenchStore;
        if (s?.persist?.rehydrate) s.persist.rehydrate();
      } else if (key === 'gradestack-storage') {
        const s = (window as any).__gradestackStore;
        if (s?.persist?.rehydrate) s.persist.rehydrate();
      } else if (key === 'rhythm.register.v1') {
        const s = (window as any).__rhythmRegisterStore;
        if (s?.persist?.rehydrate) s.persist.rehydrate();
      } else if (key === 'cardfile.decks.v1') {
        const fc = (window as any).__fcApp;
        if (fc?.state && ev.newValue) {
          fc.state.decks = JSON.parse(ev.newValue) || {};
          /* the cardfile renders imperatively — mutating state alone leaves
             the mounted view showing the pre-merge decks */
          if (typeof fc.renderAll === 'function') fc.renderAll();
        }
      }
    } catch {
      /* ignore */
    }

    try {
      window.dispatchEvent(new CustomEvent('iterra:cross-tab-sync', { detail: { key, at: Date.now() } }));
    } catch {
      /* ignore */
    }
    onExternalUpdate?.(key);
  };

  window.addEventListener('storage', handleStorage);
  crossTabInstalled = true;
  return () => {
    window.removeEventListener('storage', handleStorage);
    crossTabInstalled = false;
  };
}

export function isCrossTabSyncInstalled(): boolean {
  return crossTabInstalled;
}

/* ── Workspace Metadata Export & Import (§7) ───────────────────────────── */

export async function exportWorkspaceBundle(): Promise<WorkspaceExportBundle> {
  const it = (window as any).iterra;
  let entities: Record<string, unknown>[] = [];
  if (it?.store?.list) {
    try {
      entities = (await it.store.list({})) || [];
    } catch {
      entities = [];
    }
  } else {
    try {
      const map = JSON.parse(localStorage.getItem('iterra.v1.store.entities') || '{}') || {};
      entities = Object.values(map);
    } catch {
      entities = [];
    }
  }

  const relationships = await listAllRelationships();
  const followUps = Object.values(readFollowUpTasks());
  const context = getWorkflowContext();

  return {
    format: 'iterra-workspace-bundle',
    version: 1,
    exportedAt: new Date().toISOString(),
    schemaVersion: INTEGRATION_SCHEMA_VERSION,
    entities,
    relationships,
    followUps,
    context,
  };
}

export async function importWorkspaceBundle(
  rawInput: unknown,
): Promise<{
  ok: boolean;
  importedEntities: number;
  importedRelationships: number;
  importedFollowUps: number;
  rejectedCount: number;
  error?: string;
}> {
  let parsed: any = rawInput;
  if (typeof rawInput === 'string') {
    try {
      parsed = JSON.parse(rawInput);
    } catch {
      return {
        ok: false,
        importedEntities: 0,
        importedRelationships: 0,
        importedFollowUps: 0,
        rejectedCount: 0,
        error: 'Invalid JSON in workspace import payload.',
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      importedEntities: 0,
      importedRelationships: 0,
      importedFollowUps: 0,
      rejectedCount: 0,
      error: 'Workspace import payload must be a JSON object.',
    };
  }

  if (parsed.format !== 'iterra-workspace-bundle' || typeof parsed.version !== 'number') {
    return {
      ok: false,
      importedEntities: 0,
      importedRelationships: 0,
      importedFollowUps: 0,
      rejectedCount: 0,
      error: 'Unrecognized workspace bundle format or missing version.',
    };
  }

  if (
    (parsed.entities !== undefined && !Array.isArray(parsed.entities)) ||
    (parsed.relationships !== undefined && !Array.isArray(parsed.relationships)) ||
    (parsed.followUps !== undefined && !Array.isArray(parsed.followUps))
  ) {
    return {
      ok: false,
      importedEntities: 0,
      importedRelationships: 0,
      importedFollowUps: 0,
      rejectedCount: 0,
      error: 'Workspace bundle fields (entities, relationships, followUps) must be arrays.',
    };
  }

  const it = (window as any).iterra;
  let importedEntities = 0;
  let importedRelationships = 0;
  let importedFollowUps = 0;
  let rejectedCount = 0;

  for (const ent of (parsed.entities || []) as any[]) {
    if (!ent || typeof ent !== 'object' || typeof ent.app !== 'string' || typeof ent.type !== 'string' || typeof ent.id !== 'string') {
      rejectedCount++;
      continue;
    }
    if (it?.store?.put) {
      const res = await it.store.put(ent).catch(() => ({ ok: false }));
      if (res && res.ok !== false) importedEntities++;
      else rejectedCount++;
    } else {
      const map = JSON.parse(localStorage.getItem('iterra.v1.store.entities') || '{}') || {};
      const key = `${ent.app}:${ent.type}:${ent.id}`;
      map[key] = { ...ent, key };
      localStorage.setItem('iterra.v1.store.entities', JSON.stringify(map));
      importedEntities++;
    }
  }

  for (const rel of (parsed.relationships || []) as Partial<RelationshipRecord>[]) {
    if (!rel || typeof rel !== 'object') {
      rejectedCount++;
      continue;
    }
    const from = formatRefKey(rel.from);
    const to = formatRefKey(rel.to);
    if (!from || !to) {
      rejectedCount++;
      continue;
    }
    const r = await addRelationship({
      from,
      to,
      kind: rel.canonicalKind || rel.kind || 'related',
      courseId: rel.courseId,
      course: rel.course,
      topic: rel.topic,
      workflowId: rel.workflowId,
      meta: rel.meta,
    });
    if (r.ok) importedRelationships++;
    else rejectedCount++;
  }

  const fuMap = readFollowUpTasks();
  for (const fu of (parsed.followUps || []) as FollowUpTask[]) {
    if (!fu || typeof fu !== 'object' || !fu.id || !fu.title || !parseRef(fu.sourceRef)) {
      rejectedCount++;
      continue;
    }
    const key = fu.key || `${fu.app || 'syllabus'}:followup:${fu.id}`;
    fuMap[key] = { ...fu, key };
    importedFollowUps++;
  }
  writeFollowUpTasks(fuMap);

  if (parsed.context && typeof parsed.context === 'object' && !Array.isArray(parsed.context)) {
    updateWorkflowContext(parsed.context);
  }

  return {
    ok: true,
    importedEntities,
    importedRelationships,
    importedFollowUps,
    rejectedCount,
  };
}
