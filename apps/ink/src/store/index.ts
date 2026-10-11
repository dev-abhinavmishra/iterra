import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { format } from 'date-fns';
import { todayKey, sanitizeDoc } from '../lib/notes';
import { PENS } from '../lib/pens';
import type { PenId } from '../lib/pens';

export type Note = {
  id: string;
  title: string;
  content: string; // TipTap JSON stringified
  tags: string[];
  lastModified: number;
  createdAt: number;
  isPinned: boolean;
  folder: string;
  /** which pen the page is written with — absent = iron-gall */
  ink?: PenId;
  wordCount: number;
  trashedAt: number | null;
  dailyKey: string | null;
};

export type Folder = {
  id: string;
  name: string;
};

export type SortOrder = 'modified' | 'created' | 'title' | 'words';

export type Prefs = {
  editorTextSize: 'sm' | 'md' | 'lg';
  wetInk: boolean;
  typewriter: boolean;
};

export type Notice = {
  id: number;
  message: string;
  noteId?: string;
};

/** An earlier draft — what the page said before it was rewritten.
 *  Kept sparse (one per ~half hour of editing) so a session doesn't
 *  fill with near-identical pages. */
export type Draft = {
  title: string;
  content: string;
  wordCount: number;
  savedAt: number; // when that version was last touched
};

const DRAFT_GAP = 30 * 60 * 1000;
const DRAFT_LIMIT = 12;

/* localStorage fills up quietly — browsers give ~5MB and a heavy
 * library can reach it. When a write fails, surface it once instead
 * of silently losing keystrokes. */
let lastStorageWarning = 0;
const guardedStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      const now = Date.now();
      if (now - lastStorageWarning > 30_000) {
        lastStorageWarning = now;
        window.dispatchEvent(new CustomEvent('ink:storage-full'));
      }
    }
  },
  removeItem: (key: string) => localStorage.removeItem(key),
};

type AppState = {
  notes: Note[];
  folders: Folder[];
  drafts: Record<string, Draft[]>;
  activeNoteId: string | null;
  activeFolder: string;
  searchQuery: string;
  sortOrder: SortOrder;
  prefs: Prefs;
  notice: Notice | null;
  /** Monotonic write counter — the well pulses on it. Session-only (not
   * persisted): timestamps can lie (imports, future dates), a counter can't. */
  writeSeq: number;
  // Actions
  addNote: (note?: Partial<Omit<Note, 'id' | 'lastModified' | 'createdAt'>>) => string;
  updateNote: (id: string, updates: Partial<Note>) => void;
  trashNote: (id: string) => void;
  restoreNote: (id: string) => void;
  deleteForever: (id: string) => void;
  emptyTrash: () => void;
  duplicateNote: (id: string) => void;
  ensureDailyNote: () => string;
  togglePin: (id: string) => void;
  setActiveNote: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setActiveFolder: (folder: string) => void;
  setSortOrder: (order: SortOrder) => void;
  setPrefs: (prefs: Partial<Prefs>) => void;
  setNotice: (notice: Omit<Notice, 'id'> | null) => void;
  addFolder: (name: string) => void;
  renameFolder: (oldName: string, newName: string) => void;
  deleteFolder: (name: string) => void;
  renameTag: (oldName: string, newName: string) => void;
  removeTag: (tag: string) => void;
  removeNoteTag: (id: string, tag: string) => void;
  updateNoteFolder: (id: string, folder: string) => void;
  setNoteTags: (id: string, tags: string[]) => void;
  restoreDraft: (id: string, index: number) => void;
  importNotes: (raw: unknown) => number;
};

const doc = (content: unknown[]) =>
  JSON.stringify({ type: 'doc', content });

const para = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

const initialNotes: Note[] = [
  {
    id: 'seed-1',
    title: 'Notes toward a second draft',
    content: doc([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What the essay is actually about' }] },
      para('It keeps pretending to be about the house. It is not about the house. It is about the way my grandmother measured every room with her eyes before she would sit down in it.'),
      para('Cut the second paragraph. Move the kitchen scene up. Let the reader smell the onions before they know whose kitchen it is.'),
      { type: 'blockquote', content: [para('“Write it like a letter to someone who already forgives you.” — note to self, margin of draft three')] },
    ]),
    tags: ['ESSAY', 'DRAFTS'],
    lastModified: Date.now() - 42 * 60 * 1000,
    createdAt: Date.now() - 6 * 24 * 3600 * 1000,
    isPinned: true,
    folder: 'Work',
    wordCount: 78,
    trashedAt: null,
    dailyKey: null,
  },
  {
    id: 'seed-2',
    title: 'Reading: The Rings of Saturn',
    content: doc([
      para('Sebald walks the Suffolk coast and somehow ends up inside the entire history of European melancholy. The silkworm chapter should not work and it does.'),
      { type: 'bulletList', content: [
        { type: 'listItem', content: [para('Photographs interrupt the text with no caption — trust the reader')] },
        { type: 'listItem', content: [para('A digression is just a path the author refuses to apologise for')] },
      ]},
      para('Related: [[Notes toward a second draft]] — the digression problem again.'),
    ]),
    tags: ['READING'],
    lastModified: Date.now() - 5 * 3600 * 1000,
    createdAt: Date.now() - 3 * 24 * 3600 * 1000,
    isPinned: false,
    folder: 'Personal',
    wordCount: 74,
    trashedAt: null,
    dailyKey: null,
  },
  {
    id: 'seed-3',
    title: 'Café on Rue de la Roquette',
    content: doc([
      para('Good light in the morning, terrible after two. The owner plays Coltrane at a volume that suggests he is alone in the room, which, before ten, he mostly is.'),
      para('Table by the window wobbles. Bring the folded-paper trick.'),
    ]),
    tags: ['PARIS'],
    lastModified: Date.now() - 2 * 24 * 3600 * 1000,
    createdAt: Date.now() - 15 * 24 * 3600 * 1000,
    isPinned: false,
    folder: 'Personal',
    wordCount: 45,
    trashedAt: null,
    dailyKey: null,
  },
];

const initialFolders: Folder[] = [
  { id: 'work', name: 'Work' },
  { id: 'personal', name: 'Personal' },
  { id: 'journal', name: 'Journal' },
];

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      notes: initialNotes,
      folders: initialFolders,
      drafts: {},
      writeSeq: 0,
      activeNoteId: 'seed-1',
      activeFolder: 'All Notes',
      searchQuery: '',
      sortOrder: 'modified',
      prefs: { editorTextSize: 'md', wetInk: true, typewriter: false },
      notice: null,

      addNote: (partial = {}) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set(state => {
          const newNote: Note = {
            id,
            title: partial.title || 'Untitled Note',
            content: partial.content || JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
            tags: partial.tags || [],
            lastModified: Date.now(),
            createdAt: Date.now(),
            isPinned: partial.isPinned ?? false,
            // 'All Notes'/'Untagged' are live queries, not drawers — filing a
            // page under them would create a phantom folder. 'Unfiled' doubles
            // as a real folder value, so it is safe to inherit.
            folder: partial.folder || (
              state.folders.some(f => f.name === state.activeFolder) || state.activeFolder === 'Unfiled'
                ? state.activeFolder
                : (state.folders[0]?.name ?? 'Unfiled')
            ),
            wordCount: partial.wordCount ?? 0,
            trashedAt: null,
            dailyKey: partial.dailyKey ?? null,
            ink: partial.ink,
          };
          return { notes: [newNote, ...state.notes], activeNoteId: newNote.id };
        });
        return id;
      },

      // Only actual writing touches lastModified — housekeeping (pins, tags,
      // folders) shouldn't move a page up the "edited" lists or wet the ink.
      updateNote: (id, updates) => set(state => {
        const written = 'content' in updates || 'title' in updates || 'wordCount' in updates;
        // The blotter keeps an impression: when the body of a page changes,
        // file the outgoing version as a draft — at most one per half hour
        // of writing so drafts stay *checkpoints*, not keystrokes.
        let drafts = state.drafts;
        if (written && 'content' in updates) {
          const note = state.notes.find(n => n.id === id);
          if (note && note.content !== updates.content) {
            const existing = drafts[id] ?? [];
            const last = existing[existing.length - 1];
            if (!last || Date.now() - last.savedAt > DRAFT_GAP) {
              drafts = {
                ...drafts,
                [id]: [...existing.slice(-(DRAFT_LIMIT - 1)), {
                  title: note.title,
                  content: note.content,
                  wordCount: note.wordCount,
                  savedAt: Date.now(),
                }],
              };
            }
          }
        }
        return {
          notes: state.notes.map(note =>
            note.id === id ? { ...note, ...updates, ...(written ? { lastModified: Date.now() } : {}) } : note
          ),
          drafts,
          writeSeq: written ? state.writeSeq + 1 : state.writeSeq,
        };
      }),

      // Press an earlier draft back onto the page. The version being
      // replaced is itself filed first — restoring is never a loss.
      restoreDraft: (id, index) => set(state => {
        const note = state.notes.find(n => n.id === id);
        const draft = state.drafts[id]?.[index];
        if (!note || !draft) return {};
        const list = state.drafts[id];
        const rest = list.filter((_, i) => i !== index);
        const currentIsNew = !list.some(d => d.content === note.content && d.title === note.title);
        const keep = currentIsNew
          ? [...rest, { title: note.title, content: note.content, wordCount: note.wordCount, savedAt: Date.now() }].slice(-DRAFT_LIMIT)
          : rest;
        return {
          notes: state.notes.map(n => n.id === id
            ? { ...n, title: draft.title, content: draft.content, wordCount: draft.wordCount, lastModified: Date.now() }
            : n
          ),
          drafts: { ...state.drafts, [id]: keep },
          notice: { id: Date.now(), message: 'Pressed back onto the page' },
        };
      }),

      trashNote: (id) => set(state => {
        const notes = state.notes.map(note =>
          note.id === id ? { ...note, isPinned: false, trashedAt: Date.now() } : note
        );
        const remaining = notes.filter(n => !n.trashedAt);
        const newActive = state.activeNoteId === id ? (remaining[0]?.id ?? null) : state.activeNoteId;
        return {
          notes,
          activeNoteId: newActive,
          notice: { id: Date.now(), message: 'Tossed in the wastebasket', noteId: id },
        };
      }),

      restoreNote: (id) => set(state => ({
        notes: state.notes.map(note =>
          note.id === id ? { ...note, trashedAt: null } : note
        ),
        activeNoteId: id,
        notice: null,
      })),

      deleteForever: (id) => set(state => {
        const remaining = state.notes.filter(n => n.id !== id);
        const newActive = state.activeNoteId === id ? (remaining.find(n => !n.trashedAt)?.id ?? null) : state.activeNoteId;
        const drafts = { ...state.drafts };
        delete drafts[id];
        return { notes: remaining, activeNoteId: newActive, drafts };
      }),

      emptyTrash: () => set(state => {
        const drafts = { ...state.drafts };
        for (const note of state.notes) if (note.trashedAt) delete drafts[note.id];
        return {
          notes: state.notes.filter(n => !n.trashedAt),
          drafts,
          notice: { id: Date.now(), message: 'Wastebasket emptied' },
        };
      }),

      duplicateNote: (id) => set(state => {
        const source = state.notes.find(n => n.id === id);
        if (!source) return {};
        const copy: Note = {
          ...source,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: source.title ? `${source.title} (carbon copy)` : 'Untitled (carbon copy)',
          createdAt: Date.now(),
          lastModified: Date.now(),
          isPinned: false,
          trashedAt: null,
          dailyKey: null,
        };
        const index = state.notes.findIndex(n => n.id === id);
        const notes = [...state.notes];
        notes.splice(index + 1, 0, copy);
        return { notes, activeNoteId: copy.id };
      }),

      ensureDailyNote: () => {
        const key = todayKey();
        const existing = get().notes.find(n => n.dailyKey === key && !n.trashedAt);
        if (existing) {
          set({ activeNoteId: existing.id });
          return existing.id;
        }
        if (!get().folders.some(f => f.name === 'Journal')) {
          set(state => ({ folders: [...state.folders, { id: 'journal', name: 'Journal' }] }));
        }
        // Journals are written in fountain blue — the same ink the web
        // already draws them in.
        return get().addNote({
          title: format(new Date(), 'EEEE, MMMM d'),
          folder: 'Journal',
          tags: ['JOURNAL'],
          dailyKey: key,
          ink: 'fountain',
          content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
        });
      },

      togglePin: (id) => set(state => ({
        notes: state.notes.map(note =>
          note.id === id ? { ...note, isPinned: !note.isPinned } : note
        ),
      })),

      setActiveNote: (id) => set({ activeNoteId: id }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setActiveFolder: (folder) => set({ activeFolder: folder }),
      setSortOrder: (order) => set({ sortOrder: order }),
      setPrefs: (prefs) => set(state => ({ prefs: { ...state.prefs, ...prefs } })),
      setNotice: (notice) => set({ notice: notice ? { ...notice, id: Date.now() } : null }),

      addFolder: (name) => set(state => {
        const trimmed = name.trim();
        if (!trimmed || state.folders.some(f => f.name.toLowerCase() === trimmed.toLowerCase())) return {};
        return { folders: [...state.folders, { id: Date.now().toString(), name: trimmed }] };
      }),

      renameFolder: (oldName, newName) => set(state => {
        const name = newName.trim();
        // No-op on empty names or collisions — folders are keyed by name, so a
        // duplicate would make both rows indistinguishable (and rename/delete
        // would hit both at once). The folder itself is excluded so a
        // case-only rename still goes through.
        if (!name || state.folders.some(f => f.name !== oldName && f.name.toLowerCase() === name.toLowerCase())) return {};
        return {
          folders: state.folders.map(f => f.name === oldName ? { ...f, name } : f),
          notes: state.notes.map(note =>
            note.folder === oldName ? { ...note, folder: name } : note
          ),
          activeFolder: state.activeFolder === oldName ? name : state.activeFolder,
        };
      }),

      deleteFolder: (name) => set(state => ({
        folders: state.folders.filter(f => f.name !== name),
        notes: state.notes.map(note =>
          note.folder === name ? { ...note, folder: 'Unfiled' } : note
        ),
        activeFolder: state.activeFolder === name ? 'All Notes' : state.activeFolder,
      })),

      renameTag: (oldName, newName) => set(state => ({
        notes: state.notes.map(note => note.tags.includes(oldName)
          // Dedupe — renaming onto a tag the note already carries must not
          // leave the same tag twice (two chips, duplicate React keys).
          ? { ...note, tags: Array.from(new Set(note.tags.map(tag => tag === oldName ? newName : tag))) }
          : note
        ),
      })),

      removeTag: (tag) => set(state => ({
        notes: state.notes.map(note => note.tags.includes(tag)
          ? { ...note, tags: note.tags.filter(value => value !== tag) }
          : note
        ),
      })),

      removeNoteTag: (id, tag) => set(state => ({
        notes: state.notes.map(note => note.id === id
          ? { ...note, tags: note.tags.filter(value => value !== tag) }
          : note
        ),
      })),

      updateNoteFolder: (id, folder) => set(state => ({
        notes: state.notes.map(note => note.id === id ? { ...note, folder } : note),
      })),

      setNoteTags: (id, tags) => set(state => ({
        notes: state.notes.map(note => note.id === id ? { ...note, tags: Array.from(new Set(tags.map(tag => tag.trim().replace(/^#/, '').toUpperCase()).filter(Boolean))) } : note),
      })),

      importNotes: (raw) => {
        const candidates = Array.isArray(raw) ? raw : (raw as { notes?: unknown[] })?.notes;
        if (!Array.isArray(candidates)) return 0;
        const existingIds = new Set(get().notes.map(n => n.id));
        // Canonical folder casing: an existing drawer wins; otherwise the
        // first-seen spelling does — "Drafts" and "drafts" must not become
        // two indistinguishable shelves with split collections.
        const canon = new Map<string, string>();
        for (const f of get().folders) canon.set(f.name.toLowerCase(), f.name);
        const canonFolder = (raw: unknown): string => {
          const name = typeof raw === 'string' && raw ? raw : 'Work';
          const lower = name.toLowerCase();
          if (!canon.has(lower)) canon.set(lower, name);
          return canon.get(lower)!;
        };
        const imported: Note[] = [];
        for (const item of candidates) {
          const note = item as Partial<Note>;
          if (typeof note?.title !== 'string' || typeof note?.content !== 'string') continue;
          let id = typeof note.id === 'string' && note.id ? note.id : `${Date.now()}-${imported.length}`;
          if (existingIds.has(id)) id = `${id}-imported-${imported.length}`;
          existingIds.add(id);
          imported.push({
            id,
            title: note.title,
            ink: note.ink && note.ink in PENS ? note.ink : undefined,
            content: JSON.stringify(sanitizeDoc(note.content)),
            tags: Array.isArray(note.tags) ? note.tags.filter((t): t is string => typeof t === 'string') : [],
            lastModified: typeof note.lastModified === 'number' ? note.lastModified : Date.now(),
            createdAt: typeof note.createdAt === 'number' ? note.createdAt : Date.now(),
            isPinned: Boolean(note.isPinned),
            folder: canonFolder(note.folder),
            wordCount: typeof note.wordCount === 'number' ? note.wordCount : 0,
            trashedAt: null,
            dailyKey: null,
          });
        }
        if (imported.length) set(state => {
          // A note filed under a folder this desk doesn't have would be
          // unreachable from the shelf — shelve any missing folders first.
          const have = new Set(state.folders.map(f => f.name.toLowerCase()));
          const missing = [...new Set(imported.map(n => n.folder))].filter(name => !have.has(name.toLowerCase()));
          const folders = missing.length
            ? [...state.folders, ...missing.map(name => ({ id: `${Date.now()}-${name}`, name }))]
            : state.folders;
          return { notes: [...imported, ...state.notes], folders };
        });
        return imported.length;
      },
    }),
    {
      name: 'ink-notes-storage',
      version: 4,
      storage: createJSONStorage(() => guardedStorage),
      migrate: (persisted, version) => {
        const state = persisted as {
          notes?: Note[]; folders?: Folder[]; activeNoteId?: string | null;
          activeFolder?: string; sortOrder?: SortOrder;
          prefs?: Partial<Prefs> & { ruledPaper?: boolean };
        };
        const base = {
          notes: state.notes ?? [],
          folders: state.folders ?? [],
          drafts: (state as { drafts?: Record<string, Draft[]> }).drafts ?? {},
          activeNoteId: state.activeNoteId ?? null,
          activeFolder: state.activeFolder ?? 'All Notes',
          sortOrder: state.sortOrder ?? 'modified',
          prefs: {
            editorTextSize: state.prefs?.editorTextSize ?? ('md' as const),
            wetInk: state.prefs?.wetInk ?? true,
            typewriter: state.prefs?.typewriter ?? false,
          },
        };
        if (version < 2) {
          return {
            ...base,
            notes: base.notes.map(note => ({
              ...note,
              trashedAt: note.trashedAt ?? null,
              dailyKey: note.dailyKey ?? null,
            })),
          };
        }
        return base;
      },
      partialize: (state) => ({
        notes: state.notes,
        folders: state.folders,
        drafts: state.drafts,
        activeNoteId: state.activeNoteId,
        activeFolder: state.activeFolder,
        sortOrder: state.sortOrder,
        prefs: state.prefs,
      }),
    }
  )
);
