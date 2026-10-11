import React, { useState, useEffect } from 'react';
import { Analytics } from "@vercel/analytics/react";
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './components/Sidebar';
import LibraryView from './views/LibraryView';
import RecorderView from './views/RecorderView';
import EditorView from './views/EditorView';
import AnalysisView from './views/AnalysisView';
import StudyView from './views/StudyView';
import SettingsView from './views/SettingsView';
import StorageQuotaModal from './components/StorageQuotaModal';
import UpgradeModal from './components/UpgradeModal';
import BootSplash from './components/BootSplash';
import CommandPalette from './components/CommandPalette';
import SelectionPopover from './components/SelectionPopover';
import { View, Note, AppSettings } from './types';
import { initDB, getAllNotes, saveNote, deleteNote, getSettings, saveSettings, migrateFromLocalStorage, deleteNotesBefore, clearAllNotes, saveNoteVersion } from './services/storageService';
import { refreshUsage, initAuth } from './services/usageService';

const WELCOME_NOTE = (): Note => ({
    id: 'welcome',
    title: 'Getting started',
    date: new Date().toLocaleDateString(),
    content: `<h1>Getting started</h1><p>This is your notebook. Everything you record or import lands here as a card — edit it, pin it, or turn it into study material.</p><h2>The pieces</h2><ul><li><b>Record</b> captures a lecture or voice memo, transcribes it, and structures it into a guide.</li><li><b>Notes</b> is the card index — every source lives here, searchable and sorted.</li><li><b>Ask</b> chats with your whole library at once and can draft quizzes and flashcards.</li><li><b>Study</b> holds your decks and quizzes — review cards on a spaced schedule.</li></ul><h2>Useful moves</h2><ul><li>Press <b>⌘K</b> to jump anywhere, search, or start something new.</li><li>Select any text to ask about it, summarize it, or make flashcards from it.</li><li>Drop a PDF, Word doc, image, or audio file onto <b>Notes</b> to import it.</li></ul>`,
    transcript: '',
    type: 'TEXT',
    tags: ['Guide'],
    lastAccessed: new Date().toISOString()
});

const viewKey = (v: View, activeNote: Note | null) =>
    v === View.EDITOR ? `editor-${activeNote?.id}` : v;

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<View>(View.LIBRARY);
    const [activeNote, setActiveNote] = useState<Note | null>(null);
    const [showQuotaModal, setShowQuotaModal] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);

    const [settings, setSettingsState] = useState<AppSettings>({
        darkMode: true,
        compactMode: false,
        defaultNoteFormat: 'Structured',
        autoGenerateTitles: true,
        themeColor: '#C2420C',
        editorFontSize: 'medium',
        editorWidth: 'narrow',
        spellcheck: true,
    });

    const [notes, setNotesState] = useState<Note[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    const [contextualAttachments, setContextualAttachments] = useState<string[]>([]);

    // Usage limit: sign in (anonymous), load current status, open modal when hit.
    useEffect(() => {
        initAuth().finally(() => refreshUsage());
        const onLimit = () => setShowUpgradeModal(true);
        window.addEventListener('usage-limit-reached', onLimit);
        return () => window.removeEventListener('usage-limit-reached', onLimit);
    }, []);

    // Global ⌘K / Ctrl+K command palette
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setPaletteOpen(o => !o);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const refreshNotes = async () => {
        const storedNotes = await getAllNotes();
        setNotesState(storedNotes);
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                await initDB();
                await migrateFromLocalStorage();

                const storedSettings = await getSettings();
                if (storedSettings) {
                    setSettingsState(prev => ({ ...prev, ...storedSettings }));
                }

                const storedNotes = await getAllNotes();
                if (storedNotes.length > 0) {
                    setNotesState(storedNotes);
                } else {
                    const welcomeNote = WELCOME_NOTE();
                    await saveNote(welcomeNote);
                    setNotesState([welcomeNote]);
                }
                setIsLoaded(true);
            } catch (error) {
                console.error("Failed to initialize app data:", error);
                setIsLoaded(true);
            }
        };
        loadData();
    }, []);

    const setSettings = (newSettings: AppSettings | ((prev: AppSettings) => AppSettings)) => {
        setSettingsState(prev => {
            const updated = typeof newSettings === 'function' ? newSettings(prev) : newSettings;
            saveSettings(updated).catch(err => console.error("Failed to save settings:", err));
            return updated;
        });
    };

    useEffect(() => {
        document.documentElement.classList.toggle('dark', settings.darkMode);
    }, [settings.darkMode]);

    const handleOpenNote = (note: Note) => {
        const updatedNote = { ...note, lastAccessed: new Date().toISOString() };
        handleSaveNote(updatedNote, false);
        setActiveNote(updatedNote);
        setCurrentView(View.EDITOR);
    };

    const handleSaveNote = (updatedNote: Note, snapshot = true) => {
        setNotesState(prev => {
            const exists = prev.find(n => n.id === updatedNote.id);
            if (snapshot && exists && exists.content !== updatedNote.content) {
                saveNoteVersion(exists).catch(err => console.error("Version snapshot failed:", err));
            }
            return exists
                ? prev.map(n => n.id === updatedNote.id ? updatedNote : n)
                : [updatedNote, ...prev];
        });

        saveNote(updatedNote).catch(err => {
            console.error("Failed to save note:", err);
            if (err && (err.name === 'QuotaExceededError' || err.code === 22 || err.message?.includes('quota'))) {
                setShowQuotaModal(true);
            }
        });

        // Functional update: a stale closure (e.g. the editor's unmount flush
        // firing after another note was opened) must not resurrect the old
        // note as active — only replace it when it still is the active one.
        setActiveNote(prev => (prev?.id === updatedNote.id ? updatedNote : prev));
    };

    const handleToggleBookmark = (note: Note) => {
        handleSaveNote({ ...note, isBookmarked: !note.isBookmarked });
    };

    const handleDeleteNote = (noteId: string) => {
        setNotesState(prev => prev.filter(n => n.id !== noteId));
        deleteNote(noteId).catch(err => console.error("Failed to delete note:", err));

        if (activeNote?.id === noteId) {
            setActiveNote(null);
            setCurrentView(View.LIBRARY);
        }
    };

    const handleNewNote = () => {
        const note: Note = {
            id: Date.now().toString(),
            title: '',
            date: new Date().toLocaleDateString(),
            content: '',
            transcript: '',
            type: 'TEXT',
            tags: [],
            lastAccessed: new Date().toISOString(),
        };
        // Not persisted until the first real edit — backing out of an
        // untouched note leaves nothing behind in the library.
        setActiveNote(note);
        setCurrentView(View.EDITOR);
    };

    const handleClearData = async () => {
        await clearAllNotes();
        setNotesState([]);
        setActiveNote(null);
    };

    const handleClearOldNotes = async () => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        try {
            await deleteNotesBefore(thirtyDaysAgo);
            await refreshNotes();
            setShowQuotaModal(false);
        } catch (e) {
            console.error("Failed to clear old notes:", e);
        }
    };

    const libraryProps = {
        notes,
        onOpenNote: handleOpenNote,
        onNavigate: setCurrentView,
        onNewNote: handleNewNote,
        onDeleteNote: handleDeleteNote,
        onUpdateNote: (n: Note) => handleSaveNote(n, false),
        compactMode: settings.compactMode,
    };

    const renderView = () => {
        switch (currentView) {
            case View.LIBRARY:
                return <LibraryView {...libraryProps} onImport={(note) => { handleSaveNote(note); handleOpenNote(note); }} />;
            case View.BOOKMARKS:
                return <LibraryView {...libraryProps} onImport={() => {}} filterView={View.BOOKMARKS} />;
            case View.HISTORY:
                return <LibraryView {...libraryProps} onImport={() => {}} filterView={View.HISTORY} />;
            case View.STUDY:
                return <StudyView notes={notes} onOpenNote={handleOpenNote} />;
            case View.ANALYSIS:
                return <AnalysisView notes={notes} contextualAttachments={contextualAttachments} setContextualAttachments={setContextualAttachments} />;
            case View.RECORDER:
                return (
                    <RecorderView
                        onSaveSession={(note) => { handleSaveNote(note); handleOpenNote(note); }}
                        onCancel={() => setCurrentView(View.LIBRARY)}
                        autoGenerateTitles={settings.autoGenerateTitles}
                        micDeviceId={settings.micDeviceId}
                        onSelectMic={(id) => setSettings(s => ({ ...s, micDeviceId: id }))}
                    />
                );
            case View.EDITOR:
                return activeNote ? (
                    <EditorView
                        note={activeNote}
                        notes={notes}
                        onBack={() => setCurrentView(View.LIBRARY)}
                        onUpdate={handleSaveNote}
                        onToggleBookmark={handleToggleBookmark}
                        onOpenNote={handleOpenNote}
                        contextualAttachments={contextualAttachments}
                        setContextualAttachments={setContextualAttachments}
                        settings={settings}
                    />
                ) : <LibraryView {...libraryProps} onImport={() => {}} />;
            case View.SETTINGS:
                return <SettingsView settings={settings} onUpdateSettings={setSettings} onClearData={handleClearData} onNotesChanged={refreshNotes} />;
            default:
                return <LibraryView {...libraryProps} onImport={() => {}} />;
        }
    };

    return (
        <div className="relative bg-paper text-ink font-sans overflow-hidden h-screen flex">
            <AnimatePresence>
                {!isLoaded && <BootSplash />}
            </AnimatePresence>

            <Sidebar
                currentView={currentView}
                onChangeView={setCurrentView}
                onUpgrade={() => setShowUpgradeModal(true)}
                onOpenPalette={() => setPaletteOpen(true)}
            />

            <AnimatePresence mode="wait">
                <motion.div
                    key={viewKey(currentView, activeNote)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="flex-1 flex flex-col min-w-0"
                >
                    {renderView()}
                </motion.div>
            </AnimatePresence>

            <CommandPalette
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                notes={notes}
                onOpenNote={handleOpenNote}
                onNavigate={setCurrentView}
                onNewNote={handleNewNote}
            />

            {(currentView === View.EDITOR || currentView === View.ANALYSIS) && (
                <SelectionPopover
                    onAddToChat={(text) => setContextualAttachments(prev => [...prev, text])}
                />
            )}

            <UpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />

            <StorageQuotaModal
                isOpen={showQuotaModal}
                onClose={() => setShowQuotaModal(false)}
                onClearOldNotes={handleClearOldNotes}
                onClearAllNotes={async () => {
                    await handleClearData();
                    setShowQuotaModal(false);
                }}
            />

            <Analytics />
        </div>
    );
};

export default App;
