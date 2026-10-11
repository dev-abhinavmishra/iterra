import React from 'react';
import { Btn, Icon, Modal } from './ui/primitives';

interface StorageQuotaModalProps {
    isOpen: boolean;
    onClose: () => void;
    onClearOldNotes: () => void;
    onClearAllNotes: () => void;
}

const StorageQuotaModal: React.FC<StorageQuotaModalProps> = ({ isOpen, onClose, onClearOldNotes, onClearAllNotes }) => {
    const row = `w-full flex items-center justify-between gap-3 p-3 rounded-[var(--r)] border text-left transition-colors duration-150`;

    return (
        <Modal open={isOpen} onClose={onClose}>
            <div className="p-6">
                <div className="w-10 h-10 rounded-[var(--r-lg)] border border-line bg-card-2 flex items-center justify-center mb-4">
                    <Icon name="database" size={20} className="text-bad" />
                </div>

                <h2 className="font-serif text-xl text-ink">Storage is full</h2>
                <p className="text-sm text-ink-2 mt-2 leading-relaxed">
                    The browser's storage for this app is full. Free up space to keep
                    saving notes and recordings.
                </p>

                <div className="mt-5 space-y-2">
                    <button
                        onClick={onClearOldNotes}
                        className={`${row} border-line-2 bg-card-2 hover:border-[var(--ink-3)]`}
                    >
                        <span>
                            <span className="block text-sm font-sans font-medium text-ink">Delete old notes</span>
                            <span className="block text-xs text-ink-3 mt-0.5">Removes anything not opened in 30 days</span>
                        </span>
                        <Icon name="auto_delete" size={18} className="text-ink-3" />
                    </button>

                    <button
                        onClick={onClearAllNotes}
                        className={`${row} border-[var(--bad)]/40 hover:bg-[var(--bad)]/10`}
                    >
                        <span>
                            <span className="block text-sm font-sans font-medium text-bad">Delete everything</span>
                            <span className="block text-xs text-bad opacity-70 mt-0.5">All notes, decks and quizzes removed</span>
                        </span>
                        <Icon name="delete_forever" size={18} className="text-bad" />
                    </button>
                </div>

                <div className="mt-5 flex justify-end">
                    <Btn variant="ghost" onClick={onClose}>Close</Btn>
                </div>
            </div>
        </Modal>
    );
};

export default StorageQuotaModal;
