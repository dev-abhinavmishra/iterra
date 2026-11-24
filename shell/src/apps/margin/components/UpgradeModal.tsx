import React from 'react';
import { Btn, Icon, Modal } from './ui/primitives';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Legacy free-usage notice. Quotas were removed — nothing triggers this modal
// anymore ('usage-limit-reached' is never dispatched and apiFetch never throws
// limit errors). Kept as a harmless informational fallback.
const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose }) => {
    return (
        <Modal open={isOpen} onClose={onClose}>
            <div className="p-6">
                <div className="w-10 h-10 rounded-[var(--r-lg)] border border-line bg-card-2 flex items-center justify-center mb-4">
                    <Icon name="schedule" size={20} className="text-warn" />
                </div>

                <h2 className="font-serif text-xl text-ink">All clear</h2>
                <p className="text-sm text-ink-2 mt-2 leading-relaxed">
                    There's no daily usage cap — notes, Ask, Study and recordings
                    are all unlimited. If an AI request ever fails, just try again.
                </p>

                <div className="mt-5 flex justify-end">
                    <Btn variant="primary" onClick={onClose}>Got it</Btn>
                </div>
            </div>
        </Modal>
    );
};

export default UpgradeModal;
