export enum View {
  LIBRARY = 'LIBRARY',
  RECORDER = 'RECORDER',
  EDITOR = 'EDITOR',
  ANALYSIS = 'ANALYSIS',
  STUDY = 'STUDY',
  BOOKMARKS = 'BOOKMARKS',
  HISTORY = 'HISTORY',
  SETTINGS = 'SETTINGS'
}

export interface AppSettings {
  darkMode: boolean;
  compactMode: boolean;
  defaultNoteFormat: 'Structured' | 'Summary' | 'Transcript';
  autoGenerateTitles: boolean;
  themeColor: string; // kept for back-compat; accent is fixed to --mark
  editorFontSize?: 'small' | 'medium' | 'large';
  editorWidth?: 'narrow' | 'wide';
  spellcheck?: boolean;
  micDeviceId?: string;
}

export interface Attachment {
  type: 'image' | 'text' | 'pdf';
  content: string; // Base64 or text content
  name: string;
}

export interface PinnedMoment {
  time: string;   // display format HH:MM:SS
  seconds: number; // offset into the audio in seconds
}

export interface Note {
  id: string;
  title: string;
  date: string;
  duration?: string;
  content: string; // The refined note content (Markdown/HTML)
  transcript: string; // The raw or processed transcript/source text
  type: 'AUDIO' | 'PDF' | 'VIDEO' | 'TEXT' | 'IMAGE';
  tags: string[];
  attachments?: Attachment[];
  isProcessing?: boolean;
  isBookmarked?: boolean;
  lastAccessed?: string; // ISO Date string
  pinnedMoments?: PinnedMoment[];
  sourceData?: {
      mimeType: string;
      data: string; // Base64 data for re-feeding to context if needed
  };
}

export interface NoteVersion {
  id: string;          // `${noteId}:${timestamp}`
  noteId: string;
  title: string;
  content: string;
  savedAt: string;     // ISO date
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  provider?: string; // which AI provider answered (e.g. "Groq")
  relatedSlide?: number;
  relatedTimestamp?: string;
}

export interface LiveTranscriptChunk {
  text: string;
  isUser: boolean;
  timestamp: number;
}

/* ---------- Study domain ---------- */

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  // SM-2 scheduling fields
  ease: number;        // ease factor, starts 2.5
  interval: number;    // days
  due: string;         // ISO date of next review
  reps: number;        // successful reviews
  lapses: number;      // failed reviews
}

export interface Deck {
  id: string;
  title: string;
  sourceNoteId?: string;
  createdAt: string;
  cards: Flashcard[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: string;      // the correct option text (matches widget format)
}

export interface Quiz {
  id: string;
  title: string;
  sourceNoteId?: string;
  createdAt: string;
  questions: QuizQuestion[];
  attempts: { at: string; score: number; total: number }[];
}
