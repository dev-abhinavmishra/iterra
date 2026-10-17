/* ── Shared Identity & Authoritative Object Resolution (§1, §2, §6) ──────────
   Defines stable references for Courses, Topics, Notes, Study materials,
   Decks, Problems, Planned blocks, Sessions, Assessments, and Follow-up tasks.
   Distinguishes authoritative module storage from derived indexes, UI
   summaries, and transient state. Never relies on the 50-item truncated
   entity index as the sole source of truth. */

import type {
  CandidateCard,
  FollowUpTask,
  ObjectRef,
  ResolvedObject,
  SourceBlockExcerpt,
} from './types';

const FOLLOWUPS_KEY = 'iterra.v1.followups';

/* ── Reference Helpers ─────────────────────────────────────────────────── */

export function parseRef(ref: unknown): ObjectRef | null {
  if (!ref) return null;
  if (typeof ref === 'string') {
    const trimmed = ref.trim();
    const parts = trimmed.split(':');
    if (parts.length < 3) return null;
    const app = parts[0].trim();
    const type = parts[1].trim();
    const id = parts.slice(2).join(':').trim();
    if (!app || !type || !id) return null;
    return { key: `${app}:${type}:${id}`, app, type, id };
  }
  if (typeof ref === 'object') {
    const o = ref as Record<string, unknown>;
    if (typeof o.key === 'string') {
      const parsed = parseRef(o.key);
      if (parsed) {
        return {
          ...parsed,
          courseId: typeof o.courseId === 'string' ? o.courseId : undefined,
          course: typeof o.course === 'string' ? o.course : undefined,
          topic: typeof o.topic === 'string' ? o.topic : undefined,
          title: typeof o.title === 'string' ? o.title : undefined,
          url: typeof o.url === 'string' ? o.url : undefined,
        };
      }
    }
    const app = typeof o.app === 'string' ? o.app.trim() : '';
    const type = typeof o.type === 'string' ? o.type.trim() : (typeof o.t === 'string' ? o.t.trim() : '');
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    if (!app || !type || !id) return null;
    return {
      key: `${app}:${type}:${id}`,
      app,
      type,
      id,
      courseId: typeof o.courseId === 'string' ? o.courseId : undefined,
      course: typeof o.course === 'string' ? o.course : undefined,
      topic: typeof o.topic === 'string' ? o.topic : undefined,
      title: typeof o.title === 'string' ? o.title : undefined,
      url: typeof o.url === 'string' ? o.url : undefined,
    };
  }
  return null;
}

export function formatRefKey(ref: unknown): string | null {
  return parseRef(ref)?.key ?? null;
}

export function makeRef(
  app: string,
  type: string,
  id: string,
  extra: Partial<Omit<ObjectRef, 'key' | 'app' | 'type' | 'id'>> = {},
): ObjectRef {
  return {
    key: `${app}:${type}:${id}`,
    app,
    type,
    id,
    ...extra,
  };
}

export function normalizeTopicSlug(topic?: string | null): string | undefined {
  if (!topic || typeof topic !== 'string') return undefined;
  const cleaned = topic.trim().replace(/\s+/g, ' ');
  return cleaned || undefined;
}

export function makeTopicRef(topic: string, courseCode?: string): ObjectRef {
  const slug = topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'general';
  const prefix = courseCode ? `${courseCode.trim().toLowerCase()}-` : '';
  return {
    key: `syllabus:topic:${prefix}${slug}`,
    app: 'syllabus',
    type: 'topic',
    id: `${prefix}${slug}`,
    course: courseCode?.trim() || undefined,
    topic: topic.trim(),
    title: topic.trim(),
    url: courseCode ? `#/c/${encodeURIComponent(courseCode.trim())}` : `#/c/${encodeURIComponent(topic.trim())}`,
  };
}

/* ── Deterministic Content Hashing & Parsing (No AI Required) ──────────── */

export function computeContentHash(text: string): string {
  const norm = String(text ?? '').replace(/\r\n/g, '\n').trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv1a:${(h >>> 0).toString(16).padStart(8, '0')}:${norm.length}`;
}

export function extractBlocksFromInkContent(rawContent: string | undefined): SourceBlockExcerpt[] {
  if (!rawContent) return [];
  const trimmed = rawContent.trim();
  if (!trimmed) return [];
  try {
    const doc = JSON.parse(trimmed);
    if (doc && typeof doc === 'object' && Array.isArray(doc.content)) {
      const blocks: SourceBlockExcerpt[] = [];
      let currentHeading: string | undefined;
      let idx = 0;

      const textOf = (node: any): string => {
        if (!node || typeof node !== 'object') return '';
        if (node.type === 'text') return String(node.text ?? '');
        if (node.type === 'hardBreak') return '\n';
        if (Array.isArray(node.content)) return node.content.map(textOf).join('');
        return '';
      };

      const walkBlock = (node: any) => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'heading') {
          const h = textOf(node).trim();
          if (h) {
            currentHeading = h;
            blocks.push({ index: idx++, heading: h, text: h, blockId: `b-${idx}` });
          }
          return;
        }
        if (node.type === 'bulletList' || node.type === 'orderedList') {
          for (const item of node.content ?? []) {
            const t = textOf(item).trim();
            if (t) {
              blocks.push({ index: idx++, heading: currentHeading, text: t, blockId: `b-${idx}` });
            }
          }
          return;
        }
        const text = textOf(node).trim();
        if (text) {
          blocks.push({ index: idx++, heading: currentHeading, text, blockId: `b-${idx}` });
        }
      };

      for (const top of doc.content) walkBlock(top);
      return blocks;
    }
  } catch {
    /* Plain text or markdown fallback */
  }
  return extractBlocksFromPlainText(trimmed);
}

export function extractPlainTextFromInkContent(rawContent: string | undefined): string {
  const blocks = extractBlocksFromInkContent(rawContent);
  return blocks.map((b) => b.text).join('\n\n');
}

export function extractBlocksFromPlainText(raw: string | undefined): SourceBlockExcerpt[] {
  if (!raw) return [];
  const text = raw
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  const lines = text.split(/\r?\n/);
  const blocks: SourceBlockExcerpt[] = [];
  let currentHeading: string | undefined;
  let idx = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      currentHeading = headingMatch[2].trim();
      blocks.push({ index: idx++, heading: currentHeading, text: currentHeading, blockId: `b-${idx}` });
      continue;
    }
    const cleanLine = line.replace(/^[-*•]\s+/, '').trim();
    if (cleanLine) {
      blocks.push({ index: idx++, heading: currentHeading, text: cleanLine, blockId: `b-${idx}` });
    }
  }
  return blocks;
}

export function extractPlainTextFromMarginNote(note: { content?: string; transcript?: string } | null | undefined): string {
  if (!note) return '';
  const blocks = extractBlocksFromPlainText(note.content || note.transcript || '');
  return blocks.map((b) => b.text).join('\n\n');
}

/** Deterministic card parser/extractor from selected text or note blocks.
    Supports `term : answer`, `term — answer`, `term - answer`, `Q: / A:`,
    heading + body blocks, or clean recall cards — zero AI dependency (§4.A). */
export function extractCandidateCardsFromText(
  text: string,
  fallbackTitle = 'Note',
  blocks?: SourceBlockExcerpt[],
): CandidateCard[] {
  const out: CandidateCard[] = [];
  const seen = new Set<string>();
  const add = (q: string, a: string, ex?: string, sourceBlockIndex?: number, sourceExcerpt?: string) => {
    const cq = q.trim();
    const ca = a.trim();
    if (!cq || !ca) return;
    const fp = `${cq.toLowerCase()}||${ca.toLowerCase()}`;
    if (seen.has(fp)) return;
    seen.add(fp);
    out.push({
      id: `cand-${out.length + 1}`,
      q: cq,
      a: ca,
      ex: ex?.trim() || undefined,
      sourceBlockIndex,
      sourceExcerpt: sourceExcerpt || `${cq}: ${ca}`.slice(0, 200),
    });
  };

  const rawLines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-*•]\s+/, ''))
    .filter(Boolean);

  // 1. Check for explicit Q:/A: pairs or delimiter-separated lines
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const qaMatch = line.match(/^(?:q|question|front|term)\s*[:.-]\s*(.+)$/i);
    if (qaMatch && i + 1 < rawLines.length) {
      const nextAns = rawLines[i + 1].match(/^(?:a|answer|back|def|definition)\s*[:.-]\s*(.+)$/i);
      if (nextAns) {
        add(qaMatch[1], nextAns[1], fallbackTitle, i, `${line}\n${rawLines[i + 1]}`);
        i++;
        continue;
      }
    }
    let matchedSep = false;
    let main = line;
    let notePart = '';
    const pipeIdx = line.indexOf('|');
    if (pipeIdx > 0) {
      main = line.slice(0, pipeIdx).trim();
      notePart = line.slice(pipeIdx + 1).trim();
    }
    for (const sep of ['\t', ' :: ', ' : ', ' — ', ' – ', ' = ', ': ', ' - ']) {
      const idx = main.indexOf(sep);
      if (idx > 0 && idx < 120) {
        const left = main.slice(0, idx).trim();
        const right = main.slice(idx + sep.length).trim();
        if (left && right && !/^https?$/i.test(left)) {
          add(left, right, notePart || undefined, i, line);
          matchedSep = true;
          break;
        }
      }
    }
    if (matchedSep) continue;
  }

  // 2. If structured blocks were provided and no delimiter lines matched, pair headings/prompts with content
  if (out.length === 0 && blocks && blocks.length > 0) {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.heading && b.text === b.heading) continue;
      for (const sep of [' : ', ' — ', ' – ', ': ', ' - ']) {
        const idx = b.text.indexOf(sep);
        if (idx > 0 && idx < 120) {
          add(b.text.slice(0, idx), b.text.slice(idx + sep.length), b.heading, b.index, b.text);
          break;
        }
      }
      if (out.length <= i && b.text.length >= 6) {
        const prompt = b.heading
          ? `${b.heading} — key concept`
          : `${fallbackTitle} (part ${out.length + 1})`;
        add(prompt, b.text, b.heading, b.index, b.text);
      }
    }
  }

  // 3. Fallback: turn non-empty paragraphs/lines into editable cards
  if (out.length === 0 && rawLines.length > 0) {
    if (rawLines.length === 1) {
      add(`${fallbackTitle} — key point`, rawLines[0], undefined, 0, rawLines[0]);
    } else {
      rawLines.forEach((line, idx) => {
        if (line.length < 3) return;
        add(`${fallbackTitle} — point ${idx + 1}`, line, undefined, idx, line);
      });
    }
  }

  return out;
}

/* ── Follow-up Task Persistence (`iterra.v1.followups`) ────────────────── */

export function readFollowUpTasks(): Record<string, FollowUpTask> {
  try {
    const raw = localStorage.getItem(FOLLOWUPS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function writeFollowUpTasks(map: Record<string, FollowUpTask>): void {
  try {
    localStorage.setItem(FOLLOWUPS_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota errors */
  }
}

export async function saveFollowUpTask(task: FollowUpTask): Promise<FollowUpTask> {
  const map = readFollowUpTasks();
  map[task.key] = task;
  writeFollowUpTasks(map);
  const it = (window as any).iterra;
  if (it?.store?.put) {
    await it.store.put({
      app: task.app,
      type: 'followup',
      id: task.id,
      courseId: task.courseId,
      course: task.course,
      topic: task.topic,
      title: task.title,
      sub: task.status,
      url: task.scheduledBlockRef
        ? `/apps/syllabus/?block=${encodeURIComponent(task.scheduledBlockRef.split(':').slice(2).join(':'))}`
        : task.targetRef
          ? defaultUrlForRef(task.targetRef)
          : defaultUrlForRef(task.sourceRef),
      data: {
        status: task.status,
        detail: task.detail,
        sourceRef: task.sourceRef,
        targetRef: task.targetRef,
        scheduledBlockRef: task.scheduledBlockRef,
        ...(task.meta || {}),
      },
    }).catch(() => {});
  }
  return task;
}

/* ── Authoritative Local Store Readers ─────────────────────────────────── */

function readZustandState<T = Record<string, any>>(storageKey: string): T | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'state' in parsed && parsed.state) {
      return parsed.state as T;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

function writeZustandState(storageKey: string, mutator: (state: any) => void): boolean {
  try {
    const raw = localStorage.getItem(storageKey);
    const wrapper = raw ? JSON.parse(raw) : { state: {}, version: 1 };
    const state = wrapper.state || (wrapper.state = {});
    mutator(state);
    localStorage.setItem(storageKey, JSON.stringify(wrapper));
    return true;
  } catch {
    return false;
  }
}

export interface CanonicalCourseInfo {
  courseId: string; // 'syllabus:course:<id>'
  localId: string;  // '<id>'
  code: string;
  name: string;
  termId?: string;
}

/** Resolve a course from Syllabus's authoritative folio or the canonical store.
    Never fabricates a course unless `createIfMissing` is explicitly true. */
export async function resolveCanonicalCourse(
  refOrCode?: string | { courseId?: string; course?: string; code?: string } | null,
  opts: { createIfMissing?: boolean; courseName?: string } = {},
): Promise<CanonicalCourseInfo | null> {
  if (!refOrCode) return null;
  let wantId = '';
  let wantCode = '';
  if (typeof refOrCode === 'string') {
    const trimmed = refOrCode.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('syllabus:course:')) {
      wantId = trimmed.slice('syllabus:course:'.length);
    } else {
      wantCode = trimmed;
    }
  } else if (typeof refOrCode === 'object') {
    if (refOrCode.courseId) {
      wantId = refOrCode.courseId.startsWith('syllabus:course:')
        ? refOrCode.courseId.slice('syllabus:course:'.length)
        : refOrCode.courseId;
    }
    wantCode = (refOrCode.code || refOrCode.course || '').trim();
  }

  // 1. Check Syllabus authoritative persisted state (`syllabus.folio.v1`)
  const folio = readZustandState<{ courses?: Record<string, any>; terms?: Record<string, any>; activeTermId?: string }>('syllabus.folio.v1');
  if (folio?.courses) {
    if (wantId && folio.courses[wantId]) {
      const c = folio.courses[wantId];
      return {
        courseId: `syllabus:course:${c.id}`,
        localId: c.id,
        code: c.code || c.name,
        name: c.name || c.code,
        termId: c.termId,
      };
    }
    if (wantCode) {
      const lower = wantCode.toLowerCase();
      const found = Object.values(folio.courses).find(
        (c: any) =>
          c &&
          (String(c.code || '').toLowerCase() === lower ||
            String(c.name || '').toLowerCase() === lower ||
            String(c.id || '').toLowerCase() === lower),
      );
      if (found) {
        return {
          courseId: `syllabus:course:${found.id}`,
          localId: found.id,
          code: found.code || found.name,
          name: found.name || found.code,
          termId: found.termId,
        };
      }
    }
  }

  // 2. Check canonical store (`iterra.store` / `iterra.courses`)
  const it = (window as any).iterra;
  if (it?.courses?.resolve) {
    try {
      const ent = await it.courses.resolve(wantId ? { courseId: `syllabus:course:${wantId}` } : wantCode);
      if (ent && ent.id) {
        const code = ent.data?.code || ent.course || ent.title || wantCode || ent.id;
        return {
          courseId: ent.key || `syllabus:course:${ent.id}`,
          localId: ent.id,
          code: String(code),
          name: String(ent.title || code),
          termId: ent.data?.termId,
        };
      }
    } catch {
      /* continue */
    }
  }

  // 3. Optionally create the course in Syllabus when explicitly requested by a user workflow
  if (opts.createIfMissing && (wantCode || wantId)) {
    const code = (wantCode || wantId).toUpperCase().slice(0, 16);
    const name = opts.courseName?.trim() || wantCode || code;
    const id = wantId || `c_${Date.now().toString(36)}`;
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);
    let termId = folio?.activeTermId || Object.keys(folio?.terms || {})[0];
    if (!termId) termId = 't_default';

    writeZustandState('syllabus.folio.v1', (st) => {
      st.terms = st.terms || {};
      if (!st.terms[termId!]) {
        st.terms[termId!] = {
          id: termId,
          name: 'Current Term',
          startDate: today,
          endDate: '2027-12-31',
          timezone: 'UTC',
          createdAt: nowIso,
        };
      }
      st.activeTermId = st.activeTermId || termId;
      st.courses = st.courses || {};
      st.courses[id] = {
        id,
        termId,
        code,
        name,
        color: 'teal',
        archived: false,
        createdAt: nowIso,
      };
    });

    if (it?.store?.put) {
      await it.store.put({
        app: 'syllabus',
        type: 'course',
        id,
        title: name,
        course: code,
        url: code ? `#/c/${encodeURIComponent(code)}` : '/apps/syllabus/',
        data: { code, termId, color: 'teal' },
      }).catch(() => {});
    }

    return {
      courseId: `syllabus:course:${id}`,
      localId: id,
      code,
      name,
      termId,
    };
  }

  return null;
}

/** List all available courses from Syllabus authoritative store + canonical store */
export async function listAvailableCourses(): Promise<CanonicalCourseInfo[]> {
  const seen = new Map<string, CanonicalCourseInfo>();
  const folio = readZustandState<{ courses?: Record<string, any> }>('syllabus.folio.v1');
  if (folio?.courses) {
    for (const c of Object.values(folio.courses)) {
      if (!c || !c.id || c.archived) continue;
      const key = `syllabus:course:${c.id}`;
      seen.set(key, {
        courseId: key,
        localId: c.id,
        code: c.code || c.name,
        name: c.name || c.code,
        termId: c.termId,
      });
    }
  }
  const it = (window as any).iterra;
  if (it?.courses?.list) {
    try {
      const rows = (await it.courses.list()) || [];
      for (const e of rows) {
        if (!e || !e.id) continue;
        const key = e.key || `syllabus:course:${e.id}`;
        if (!seen.has(key)) {
          const code = e.data?.code || e.course || e.title || e.id;
          seen.set(key, {
            courseId: key,
            localId: e.id,
            code: String(code),
            name: String(e.title || code),
            termId: e.data?.termId,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }
  return [...seen.values()];
}

export function defaultUrlForRef(ref: string | ObjectRef): string {
  const p = typeof ref === 'string' ? parseRef(ref) : ref;
  if (!p) return '#/';
  if (p.url) return p.url;
  const enc = encodeURIComponent(p.id);
  switch (p.app) {
    case 'ink':
      return `/apps/ink/?note=${enc}`;
    case 'flashcards':
      return p.type === 'deck' ? `/apps/flashcards/?deck=${enc}` : `/apps/flashcards/`;
    case 'syllabus':
      if (p.type === 'block') return `/apps/syllabus/?block=${enc}`;
      if (p.type === 'commitment') return `/apps/syllabus/?commitment=${enc}`;
      if (p.type === 'course') return p.course ? `#/c/${encodeURIComponent(p.course)}` : '/apps/syllabus/';
      return '/apps/syllabus/';
    case 'timer':
      return p.type === 'routine' ? `/apps/timer/?routine=${enc}` : '/apps/timer/';
    case 'proof':
      if (p.type === 'attempt') return `/apps/proof/?attempt=${enc}`;
      if (p.type === 'problem') return `/apps/proof/?problem=${enc}`;
      return '/apps/proof/';
    case 'margin':
      if (p.type === 'deck') return `/apps/margin/?deck=${enc}`;
      if (p.type === 'quiz') return `/apps/margin/?quiz=${enc}`;
      return `/apps/margin/?note=${enc}`;
    case 'gradestack':
      if (p.type === 'assessment') return `/apps/gradestack/?assessment=${enc}`;
      if (p.type === 'grade') return `/apps/gradestack/?scanId=${enc}`;
      return '/apps/gradestack/';
    case 'rhythm':
      if (p.type === 'experiment') return `/apps/rhythm/?experiment=${enc}`;
      if (p.type === 'routine') return `/apps/rhythm/?routine=${enc}`;
      return '/apps/rhythm/';
    default:
      return `/apps/${p.app}/`;
  }
}

/* ── Authoritative Object Resolution (§1, §2, §6) ──────────────────────── */

export async function resolveObject(
  refInput: string | Partial<ObjectRef> | null | undefined,
  fallbackMeta?: { title?: string; url?: string; course?: string; courseId?: string; topic?: string },
): Promise<ResolvedObject | null> {
  const ref = parseRef(refInput);
  if (!ref) return null;
  const { key, app, type, id } = ref;

  // 1. Check authoritative module stores in localStorage
  if (app === 'ink' && type === 'note') {
    const inkState = readZustandState<{ notes?: any[] }>('ink-notes-storage');
    const note = inkState?.notes?.find((n: any) => n && n.id === id);
    if (note) {
      const contentText = extractPlainTextFromInkContent(note.content);
      const hash = computeContentHash(contentText);
      const isTrashed = note.trashedAt != null;
      return {
        status: isTrashed ? 'trashed' : 'ok',
        tier: 'authoritative',
        key,
        app,
        type,
        id,
        title: note.title || 'Untitled Note',
        sub: note.folder || undefined,
        course: ref.course || note.course || note.tags?.[0],
        courseId: ref.courseId || note.courseId,
        topic: ref.topic || note.topic,
        url: `/apps/ink/?note=${encodeURIComponent(id)}`,
        revision: note.lastModified || note.createdAt || 0,
        contentHash: hash,
        contentText,
        raw: note,
        ...(isTrashed
          ? {
              recovery: {
                canRestore: true,
                label: 'Restore note from Ink wastebasket',
                reason: 'This Ink note was moved to the wastebasket.',
                fallbackUrl: '/apps/ink/',
                restore: () => {
                  return writeZustandState('ink-notes-storage', (st) => {
                    if (Array.isArray(st.notes)) {
                      st.notes = st.notes.map((n: any) => (n && n.id === id ? { ...n, trashedAt: null } : n));
                    }
                  });
                },
              },
            }
          : {}),
      };
    }
  }

  if (app === 'flashcards' && (type === 'deck' || type === 'card')) {
    try {
      const decksRaw = localStorage.getItem('cardfile.decks.v1');
      const decks: Record<string, any> = decksRaw ? JSON.parse(decksRaw) : {};
      if (type === 'deck' && decks[id]) {
        const d = decks[id];
        const dueCount = Array.isArray(d.cards) ? d.cards.filter((c: any) => c.status !== 'mastered').length : 0;
        const contentText = Array.isArray(d.cards)
          ? d.cards.map((c: any) => `${c.q} :: ${c.a}`).join('\n')
          : '';
        return {
          status: 'ok',
          tier: 'authoritative',
          key,
          app,
          type,
          id,
          title: d.title || 'Untitled deck',
          sub: `${ Array.isArray(d.cards) ? d.cards.length : 0 } cards · ${dueCount} due`,
          courseId: d.courseId || ref.courseId,
          course: d.course || ref.course,
          topic: d.topic || ref.topic,
          url: `/apps/flashcards/?deck=${encodeURIComponent(id)}`,
          revision: d.updatedAt || d.lastStudiedAt || d.createdAt || 0,
          contentHash: computeContentHash(contentText),
          contentText,
          raw: d,
        };
      }
      if (type === 'card') {
        for (const d of Object.values(decks)) {
          if (!d || !Array.isArray(d.cards)) continue;
          const card = d.cards.find((c: any) => c && c.id === id);
          if (card) {
            return {
              status: 'ok',
              tier: 'authoritative',
              key,
              app,
              type,
              id,
              title: card.q || 'Card',
              sub: card.a || '',
              courseId: d.courseId || ref.courseId,
              course: d.course || ref.course,
              topic: d.topic || ref.topic,
              url: `/apps/flashcards/?deck=${encodeURIComponent(d.id)}`,
              raw: { card, deckId: d.id, deckTitle: d.title },
            };
          }
        }
      }
    } catch {
      /* fall through */
    }
  }

  if (app === 'syllabus') {
    const folio = readZustandState<{
      terms?: Record<string, any>;
      courses?: Record<string, any>;
      commitments?: Record<string, any>;
      blocks?: Record<string, any>;
    }>('syllabus.folio.v1');
    if (folio) {
      if (type === 'course' && folio.courses?.[id]) {
        const c = folio.courses[id];
        return {
          status: c.archived ? 'archived' : 'ok',
          tier: 'authoritative',
          key,
          app,
          type,
          id,
          title: c.name || c.code,
          sub: c.code,
          courseId: key,
          course: c.code,
          url: c.code ? `#/c/${encodeURIComponent(c.code)}` : '/apps/syllabus/',
          raw: c,
        };
      }
      if (type === 'block' && folio.blocks?.[id]) {
        const b = folio.blocks[id];
        const comm = folio.commitments?.[b.commitmentId];
        const course = comm ? folio.courses?.[comm.courseId] : undefined;
        return {
          status: 'ok',
          tier: 'authoritative',
          key,
          app,
          type,
          id,
          title: b.label || comm?.title || 'Planned Block',
          sub: `${b.plannedDate} · ${b.plannedMinutes}m · ${b.state}`,
          courseId: course ? `syllabus:course:${course.id}` : ref.courseId,
          course: course?.code || ref.course,
          topic: b.topic || comm?.topic || ref.topic,
          url: `/apps/syllabus/?block=${encodeURIComponent(id)}`,
          raw: b,
        };
      }
      if (type === 'commitment' && folio.commitments?.[id]) {
        const comm = folio.commitments[id];
        const course = folio.courses?.[comm.courseId];
        return {
          status: comm.status === 'dropped' ? 'archived' : 'ok',
          tier: 'authoritative',
          key,
          app,
          type,
          id,
          title: comm.title || 'Commitment',
          sub: `${comm.type} · ${comm.status}`,
          courseId: course ? `syllabus:course:${course.id}` : ref.courseId,
          course: course?.code || ref.course,
          url: `/apps/syllabus/?commitment=${encodeURIComponent(id)}`,
          raw: comm,
        };
      }
    }
  }

  if (app === 'timer' && type === 'session') {
    try {
      const sessions: any[] = JSON.parse(localStorage.getItem('timer.sessions.v1') || '[]');
      const sess = sessions.find((s) => s && s.id === id);
      if (sess) {
        const mins = Math.max(0, Math.round((sess.duration || 0) / 60));
        return {
          status: 'ok',
          tier: 'authoritative',
          key,
          app,
          type,
          id,
          title: sess.label || sess.preset || 'Focus session',
          sub: `${mins}m${sess.outcome ? ` · ${sess.outcome}` : ''}`,
          courseId: sess.courseId || ref.courseId,
          course: sess.course || ref.course,
          topic: sess.topic || ref.topic,
          url: '/apps/timer/',
          raw: sess,
        };
      }
    } catch {
      /* fall through */
    }
  }

  if (app === 'proof') {
    const wb = readZustandState<{
      problems?: Record<string, any>;
      attempts?: Record<string, any>;
      courses?: Record<string, any>;
      errors?: Record<string, any>;
    }>('proof.workbench.v1');
    if (wb) {
      if (type === 'problem' && wb.problems?.[id]) {
        const p = wb.problems[id];
        const course = p.courseId ? wb.courses?.[p.courseId] : undefined;
        return {
          status: p.archived ? 'archived' : 'ok',
          tier: 'authoritative',
          key,
          app,
          type,
          id,
          title: p.promptDoc ? String(p.promptDoc).replace(/[#*$]/g, '').trim().slice(0, 80) : (p.topic || 'Problem'),
          sub: p.topic,
          courseId: p.courseId?.startsWith('syllabus:course:') ? p.courseId : ref.courseId,
          course: course?.code || p.course || ref.course,
          topic: p.topic || ref.topic,
          url: `/apps/proof/?problem=${encodeURIComponent(id)}`,
          contentText: p.promptDoc,
          raw: p,
          ...(p.archived
            ? {
                recovery: {
                  canRestore: true,
                  label: 'Unarchive problem in Proof',
                  reason: 'This problem is archived in Proof.',
                  fallbackUrl: '/apps/proof/',
                  restore: () =>
                    writeZustandState('proof.workbench.v1', (st) => {
                      if (st.problems?.[id]) st.problems[id].archived = false;
                    }),
                },
              }
            : {}),
        };
      }
      if (type === 'attempt' && wb.attempts?.[id]) {
        const a = wb.attempts[id];
        const p = wb.problems?.[a.problemId];
        const course = p?.courseId ? wb.courses?.[p.courseId] : undefined;
        return {
          status: 'ok',
          tier: 'authoritative',
          key,
          app,
          type,
          id,
          title: `Attempt — ${p?.topic || 'problem'}`,
          sub: a.result || (a.submittedAt ? 'submitted' : 'in progress'),
          courseId: p?.courseId?.startsWith('syllabus:course:') ? p.courseId : ref.courseId,
          course: course?.code || ref.course,
          topic: p?.topic || ref.topic,
          url: `/apps/proof/?attempt=${encodeURIComponent(id)}`,
          raw: a,
        };
      }
    }
  }

  if (app === 'gradestack') {
    const gs = readZustandState<{ tests?: any[]; scans?: any[] }>('gradestack-storage');
    if (gs) {
      if (type === 'assessment') {
        const t = gs.tests?.find((x: any) => x && x.id === id);
        if (t) {
          return {
            status: 'ok',
            tier: 'authoritative',
            key,
            app,
            type,
            id,
            title: t.name || 'Assessment',
            sub: `${t.numQuestions || 0} questions`,
            course: t.courseName || ref.course,
            courseId: t.courseId || ref.courseId,
            url: `/apps/gradestack/?assessment=${encodeURIComponent(id)}`,
            raw: t,
          };
        }
      }
      if (type === 'grade' || type === 'scan') {
        const sc = gs.scans?.find((x: any) => x && x.id === id);
        if (sc) {
          const t = gs.tests?.find((x: any) => x && x.id === sc.testId);
          return {
            status: 'ok',
            tier: 'authoritative',
            key,
            app,
            type,
            id,
            title: `${t?.name || 'Sheet'} — ${sc.studentName || 'Student'}`,
            sub: `${Math.round(sc.percentage || 0)}%`,
            course: t?.courseName || ref.course,
            url: `/apps/gradestack/?scanId=${encodeURIComponent(id)}`,
            raw: sc,
          };
        }
      }
    }
  }

  if (app === 'rhythm') {
    const reg = readZustandState<{
      routines?: Record<string, any>;
      entries?: Record<string, any>;
      courses?: Record<string, any>;
    }>('rhythm.register.v1');
    if (reg) {
      if (type === 'routine' && reg.routines?.[id]) {
        const r = reg.routines[id];
        const course = r.courseId ? reg.courses?.[r.courseId] : undefined;
        return {
          status: r.status === 'archived' ? 'archived' : 'ok',
          tier: 'authoritative',
          key,
          app,
          type,
          id,
          title: r.name || 'Routine',
          sub: `${r.target?.perWeek || 1}×/wk`,
          course: course?.code || course?.name || ref.course,
          url: `/apps/rhythm/?routine=${encodeURIComponent(r.name || id)}`,
          raw: r,
        };
      }
      if (type === 'entry' && reg.entries?.[id]) {
        const e = reg.entries[id];
        const r = reg.routines?.[e.routineId];
        return {
          status: 'ok',
          tier: 'authoritative',
          key,
          app,
          type,
          id,
          title: r?.name || 'Activity entry',
          sub: `${e.date} · ${e.value}`,
          url: '/apps/rhythm/',
          raw: e,
        };
      }
    }
  }

  if (type === 'followup' || type === 'task') {
    const tasks = readFollowUpTasks();
    const task = tasks[key] || Object.values(tasks).find((t) => t.id === id);
    if (task) {
      return {
        status: 'ok',
        tier: 'authoritative',
        key: task.key,
        app: task.app,
        type: 'followup',
        id: task.id,
        title: task.title,
        sub: task.status,
        courseId: task.courseId,
        course: task.course,
        topic: task.topic,
        url: task.scheduledBlockRef
          ? defaultUrlForRef(task.scheduledBlockRef)
          : task.targetRef
            ? defaultUrlForRef(task.targetRef)
            : defaultUrlForRef(task.sourceRef),
        raw: task,
      };
    }
  }

  // 2. Check canonical store (`iterra.store.get`) — also covers Margin IndexedDB entities
  const it = (window as any).iterra;
  if (it?.store?.get) {
    try {
      const ent = await it.store.get(key);
      if (ent) {
        const contentText =
          typeof ent.data?.content === 'string'
            ? ent.data.content
            : typeof ent.data?.excerpt === 'string'
              ? ent.data.excerpt
              : ent.sub || '';
        return {
          status: 'ok',
          tier: app === 'margin' ? 'authoritative' : 'derived_index',
          key,
          app: ent.app || app,
          type: ent.type || type,
          id: ent.id || id,
          title: ent.title || fallbackMeta?.title || id,
          sub: ent.sub,
          courseId: ent.courseId || fallbackMeta?.courseId,
          course: ent.course || fallbackMeta?.course,
          topic: ent.topic || fallbackMeta?.topic,
          url: ent.url || fallbackMeta?.url || defaultUrlForRef(ref),
          revision: ent.data?.updated || ent.updatedAt || ent.createdAt,
          contentHash: typeof ent.data?.contentHash === 'string' ? ent.data.contentHash : computeContentHash(contentText),
          contentText,
          entity: ent,
          raw: ent.data,
        };
      }
    } catch {
      /* continue */
    }
  }

  // 3. Target is missing or deleted — return graceful recovery object (§2, §6, §7)
  const fallbackTitle = fallbackMeta?.title || ref.title || `${type} (${id})`;
  const fallbackUrl = fallbackMeta?.url || ref.url || `/apps/${app}/`;
  return {
    status: 'missing',
    tier: 'derived_index',
    key,
    app,
    type,
    id,
    title: fallbackTitle,
    sub: 'unavailable or deleted',
    courseId: fallbackMeta?.courseId || ref.courseId,
    course: fallbackMeta?.course || ref.course,
    topic: fallbackMeta?.topic || ref.topic,
    url: fallbackUrl,
    recovery: {
      canRestore: false,
      label: `Open ${app}`,
      reason: `The referenced ${type} "${fallbackTitle}" was deleted or is no longer available in ${app}.`,
      fallbackUrl: `/apps/${app}/`,
    },
  };
}
