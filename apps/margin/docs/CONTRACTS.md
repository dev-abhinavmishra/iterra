# Builder contracts — rehaul slices

Read `docs/DESIGN.md` first: it defines the visual language (tokens, primitives,
type, copy voice). This file defines **which files each slice owns** and the
**props/services contracts** that must not change, because other slices and
`App.tsx` already build against them.

## Non-negotiable rules

- Work on the `devin/rehaul-foundation` branch. Create your own branch
  `devin/rehaul-<slice>` off it. Touch ONLY files listed under your slice.
- Never edit: `App.tsx`, `types.ts`, `index.css`, `index.html`,
  `services/*.ts`, `api/*`, `components/ui/primitives.tsx`, `docs/*`, or
  another slice's files.
- Use the primitives in `components/ui/primitives.tsx` (`Btn`, `IconBtn`,
  `Card`, `Chip`, `Modal`, `Field`, `TextInput`, `Select`, `Toggle`,
  `Segmented`, `EmptyState`, `Tag`, `Kbd`, `Divider`, `Spinner`,
  `ProgressBar`, `Stat`, `Icon`) and the token utility classes
  (`bg-paper`, `bg-card`, `text-ink`, `border-line`, `shadow-card`, …).
  No raw hex, no `dark:` variants needed (tokens flip via `.dark`), no
  `backdrop-blur`, no rounded >10px, no colored/glow shadows.
- Icons: `Icon` component or `material-symbols-outlined` (thin, ≤20px).
- Copy: sentence case, plain words, active verbs. See DESIGN.md "Copy voice".
- Motion: framer-motion where DESIGN.md says; hover lift on cards; nothing
  that loops constantly (except the recorder visualizer).
- Verify: `npm run lint` (tsc) must pass for your files; `npm run build` must
  succeed. `npm run dev` serves the app at :5173 with /api stubs.
- Commit your work and push branch `devin/rehaul-<slice>`.

## Slice: shell

**Owns:** `components/Sidebar.tsx`, `components/CommandPalette.tsx`,
`components/SelectionPopover.tsx`, `components/BootSplash.tsx`,
`components/UpgradeModal.tsx`, `components/StorageQuotaModal.tsx`,
`components/ThinkingOrbs.tsx`, `components/Skeleton.tsx`,
`components/ErrorBoundary.tsx`, `components/AmbientAurora.tsx` (delete it),
`public/favicon*`.

- `Sidebar` props (already in App.tsx): `{ currentView, onChangeView, onUpgrade, onOpenPalette }`.
  Nav = Notes(LIBRARY) · Record(RECORDER) · Ask(ANALYSIS) · Study(STUDY);
  plus a Search/⌘K button calling `onOpenPalette`. Bottom: usage meter
  (`useUsage` from services/usageService) + Settings. 240px on lg, icon
  rail below. Active state = mark tint + mark text, hairline borders.
- `CommandPalette` props: `{ open, onClose, notes, onOpenNote, onNavigate, onNewNote }`.
  ⌘K-style fuzzy list: actions (New note, Record, go to Notes/Ask/Study/
  Settings, toggle theme via localStorage-free — skip theme), then note
  results via `services/searchService.searchNotes`. Arrow keys + Enter +
  Esc. Modal overlay, card pop surface.
- `SelectionPopover` props: `{ onAddToChat(text) }`. Listens to
  `selectionchange`; when a non-collapsed selection exists, shows a small
  floating bar near the selection with: "Ask" (calls onAddToChat, clears
  selection), "Cards" (calls `runAction('flashcards', text)` → `parseJsonArray`
  → `studyService.createDeck('From selection', cards)` → tiny "Deck saved"
  confirmation), "Copy". Hide on scroll/blur/empty selection. Must not appear
  inside `<input>/<textarea>`.
- `BootSplash`: short orchestrated reveal for the new identity — a card that
  stamps/deals in ("Margin" serif wordmark, hairline frame, one mark
  rule) then slides away ~700ms. Exit via AnimatePresence (App wraps it).
- `UpgradeModal`/`StorageQuotaModal`: restyle to Modal primitive, plain copy.
- `ThinkingOrbs`/`Skeleton`: restyle to tokens (paper/mono shimmer, no orbs/
  neon — e.g. three small squares "dealing" or a mono "thinking" ellipsis).
- `ErrorBoundary`: restyle, "Something broke" copy + reload button.
- Favicon: write a small SVG favicon (index card + vermilion mark) to
  `public/favicon.svg` and update `index.html`? — index.html is shared;
  instead put `favicon.svg` in public and DO NOT touch index.html.

## Slice: library

**Owns:** `views/LibraryView.tsx`, `components/library/*` (create files:
`NoteCard.tsx`, `LibraryToolbar.tsx`, `BulkBar.tsx`, `ImportOverlay.tsx`).

`LibraryView` props (unchanged): `{ notes, onOpenNote, onNavigate, onImport,
onDeleteNote, filterView?, compactMode? }`.

Build the card index:
- Header: serif title ("Notes" / "Pinned" / "Recently viewed"), count in mono.
- Toolbar: search input (live, `searchService.searchNotes`), filter Chips by
  type (All/Audio/PDF/Image/Text) + tag dropdown, sort menu (Recent ·
  Title · Oldest), grid/list segmented, "New note" + "Record" actions.
- Cards: index-card look — `Card interactive paper-card`, ruled bottom strip,
  serif title (2-line clamp), meta row (mono: date · type · duration),
  tags as `Tag`, pin icon toggle (isBookmarked), hover actions
  (open/pin/delete). List variant = ruled rows.
- Multi-select: checkbox on hover/selected, BulkBar (Delete, Pin, Export
  markdown via `exportService.exportNoteMarkdown`, Clear selection).
- Drag & drop: whole view accepts file drop → `ImportOverlay` shows progress
  (reuse the existing import pipeline: PDF/DOCX/image/audio/text import
  stays — keep `handleFileSelect` logic, move to overlay; also a visible
  "Import" button + hidden input).
- Empty states per filter (EmptyState with action buttons).
- Type bug: images must save `type: 'IMAGE'` (not 'PDF').
- Delete: confirm via `Modal`, not a custom dialog.
- Pinned section: pinned notes render first under a hairline "Pinned" label.

## Slice: editor

**Owns:** `views/EditorView.tsx`, `components/editor/*` (create:
`FormatToolbar.tsx`, `FloatingToolbar.tsx`, `OutlinePanel.tsx`,
`FindReplace.tsx`, `VersionHistory.tsx`, `AudioPlayer.tsx`,
`RelatedNotes.tsx`, `NoteMetaBar.tsx`).

`EditorView` props (see file — now includes `notes`, `onOpenNote`,
`settings`): keep signature, use the new props.

- Paper sheet: `bg-card` centered, hairline border, ruled left margin line,
  `note-body` typography on the contentEditable. Serif title input.
- `FormatToolbar`: the fixed top bar — undo/redo, bold/italic/underline/
  strikethrough/highlight(mark), H1/H2/H3/P, lists, quote, code block,
  table (insert 3x3), link, hr, clear formatting. Uses execCommand like now
  but restyled; add the missing commands (insertHTML for mark/code/table,
  createLink).
- Markdown typing: on space/enter convert `## ` `- ` `1. ` `> ` ``` `` and
  `==text==`→mark in the current block (input handler on the editable div).
- `FloatingToolbar`: appears over selected text inside the editor — B/I/U,
  highlight, plus AI row: Summarize · Expand · Simplify (calls
  `runAction(action, selectedText, note.transcript)`; result replaces the
  selection via execCommand insertHTML). Loading state on the bar.
- `NoteMetaBar`: under title — date · duration · word count · reading time
  · save state (Saved/Saving…). Word count updates live.
- `OutlinePanel`: right-side collapsible TOC from H1–H3 in content, click to
  scroll. Toggle in toolbar.
- `FindReplace`: ⌘F inside the view — find next/prev, replace, replace all
  (TreeWalker over the editable). Highlight current match with `--tape`.
- `VersionHistory`: panel listing `getNoteVersions(note.id)` (mono
  timestamps), preview + Restore button (restores content; confirm first).
  Snapshots are already written on each save by App.tsx.
- `AudioPlayer`: when `note.sourceData?.mimeType` starts with `audio/`,
  render a player above the sheet: play/pause, seek bar, mono timecode,
  speed (1x/1.25/1.5/2x), and `note.pinnedMoments` as clickable markers on
  the seek bar that jump to `seconds`. Build blob URL from base64.
- `RelatedNotes`: bottom-right rail section — `searchService.relatedNotes`
  cards (title + mono type); click → `onOpenNote`.
- "View Source" PDF viewer stays (restyle to Modal/tokens).
- Export menu: PDF (keep print approach, restyle), Markdown and HTML via
  `exportService`.
- Focus mode: toolbar button hides header/meta and widens the sheet
  (max-w-none → ~820px centered), Esc exits.
- `settings?.editorFontSize` scales `note-body` (sm 15px/md 17px/lg 19px),
  `settings?.spellcheck` toggles spellcheck attr.
- Keep: autosave debounce, resizable assistant panel, ChatInterface slot
  (media slice restyles it — just render it).
- Title autosaves on input debounce too (not only blur).

## Slice: study

**Owns:** `views/StudyView.tsx`, `components/study/*` (create: `DeckGrid.tsx`,
`ReviewSession.tsx`, `QuizRunner.tsx`, `DeckEditor.tsx`).

`StudyView` props: `{ notes, onOpenNote? }`.

- Header: serif "Study", due-count mono badge (`studyService.totalDue`).
- Two tabs (Segmented): **Decks** · **Quizzes**.
- Decks: `DeckGrid` of `Card`s — serif title, mono "{n} cards · {d} due",
  paper-card hover; click → review if due>0 else DeckEditor. "New deck" card
  (dashed hairline) + "From note" button (pick a note →
  `runAction('flashcards', note.transcript||note.content)` → parseJsonArray
  → `createDeck(title, cards, note.id)`).
- `ReviewSession`: full-view takeover — one card centered (3D flip on
  click/space), front serif; reveal → grade buttons Again·Hard·Good·Easy
  (keys 1-4, `reviewCard`), progress mono "3/12", end screen (mono stats,
  "Done — next review tomorrow"). Persists each grade via studyService.
- `DeckEditor`: card list table (front/back), add/delete card, rename,
  delete deck (Modal confirm), back.
- Quizzes: list of `Quiz` — title, {n} questions, last score mono. "From
  note" creates via `runAction('quiz',…)` → `createQuiz`. `QuizRunner` =
  one-question-at-a-time runner with options as paper buttons, select →
  reveal correct/incorrect (ok/bad), progress bar; end screen score +
  retry; record via `recordQuizAttempt`.
- Empty states per tab.
- All data via `storageService`/`studyService` — no new stores, no mock data.

## Slice: media (recorder · ask · chat · settings)

**Owns:** `views/RecorderView.tsx`, `views/AnalysisView.tsx`,
`views/SettingsView.tsx`, `components/ChatInterface.tsx`,
`components/AudioVisualizer.tsx`, `components/widgets/*` (create —
extract the AnalysisView widgets: `QuizSetWidget.tsx`, `FlashcardWidget.tsx`,
`TimelineWidget.tsx`, `ComparisonWidget.tsx`, `TakeawayWidget.tsx`).

- `RecorderView` props: `{ onSaveSession, onCancel, autoGenerateTitles, micDeviceId? }`.
  Instrument look: desk-grid faint backdrop, big mono timecode, round mark
  record button (mark ring pulses while recording). Add **pause/resume**
  (MediaRecorder.pause/resume + elapsed excludes paused time), mic picker
  (`navigator.mediaDevices.enumerateDevices` audioinput → Select; honor
  `micDeviceId`), pinned moments stay and get `{time, seconds}` objects
  (store real seconds — used by the editor audio player; keep `pinnedItems`
  → `note.pinnedMoments`). Processing overlay: staged mono status
  (transcribing → structuring), no spinner orbs.
- `AudioVisualizer`: bars as thin ink/mono ticks (oscilloscope strip), mark
  color on active — not a neon blob.
- `AnalysisView` ("Ask"): keep session sidebar + chat + widget parsing as-is
  functionally; restyle everything to tokens and rename copy to "Ask".
  Chat messages: model = card surface left-aligned, user = `mark-soft`
  right-aligned (no bubbles-with-tails). Provider tag in mono.
  **Save to Study**: under each rendered QUIZ/FLASHCARD widget add a quiet
  "Save to Study" `Btn size sm` → `createQuiz`/`createDeck` →
  "Saved" state. Extract the widgets into `components/widgets/*` and restyle
  them as index cards (quiz options = paper buttons with letter keys,
  flashcard = real 3D flip `.flip-inner`, timeline = hairline spine).
- `ChatInterface`: restyle (same layout, tokens, mono provider tag, Enter to
  send, Shift+Enter newline → use textarea auto-grow).
- `SettingsView` props: `{ settings, onUpdateSettings, onClearData, onNotesChanged? }`.
  Sections (hairline-separated, Field/Select/Toggle/Segmented):
  **Appearance** — light/dark Segmented, compact density Toggle.
  **Editor** — font size Segmented (small/medium/large), width
  (narrow/wide), spellcheck Toggle.
  **Notes** — default format Select, auto-generate titles Toggle.
  **Data** — storage meter (`storageEstimate` → ProgressBar + mono bytes),
  Export backup (`exportBackup`), Import backup (`importBackup` → then
  `onNotesChanged?.()`), Clear all notes (danger, Modal confirm).
  **Shortcuts** — static list (⌘K palette, ⌘F find, 1-4 review grading,
  space flip). **About** — "Margin" + version mono.
  Remove the accent-color picker (accent is fixed vermilion) — keep
  `settings.themeColor` untouched in state.

## Shared gotchas

- `view transitions`: handled in App.tsx — don't add your own page-load
  animation wrappers.
- `theme-color` CSS var is gone; use `--mark`.
- `font-display`/`font-body` classes are gone; use `font-serif`/`font-sans`/
  `font-mono`.
- Old class `neon-grid` is gone — use `.desk-grid` (+`.desk-grid-faint`).
- `useUsage` lives in services/usageService.ts.
