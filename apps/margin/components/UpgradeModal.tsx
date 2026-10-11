import React from 'react';
import { useUsage } from '../services/usageService';
import { Btn, Icon, Modal } from './ui/primitives';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Shown when the free daily AI budget runs out. Billing isn't wired up, so this
// is an informational notice — the quota resets the next day.
const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose }) => {
    const usage = useUsage();

    return (
        <Modal open={isOpen} onClose={onClose}>
            <div className="p-6">
                <div className="w-10 h-10 rounded-[var(--r-lg)] border border-line bg-card-2 flex items-center justify-center mb-4">
                    <Icon name="schedule" size={20} className="text-warn" />
                </div>

                <h2 className="font-serif text-xl text-ink">
                    {usage.remaining > 0 ? 'Free daily uses' : 'Daily limit reached'}
                </h2>
                <p className="text-sm text-ink-2 mt-2 leading-relaxed">
                    {usage.remaining > 0
                        ? `You have ${usage.remaining} of ${usage.limit} free AI actions left today — recording, notes, Ask and Study all draw from the same pool. It resets automatically tomorrow.`
                        : `You've used your ${usage.limit} free AI actions for today — recording, notes, Ask and Study all draw from the same pool. It resets automatically tomorrow.`}
                </p>

                <div className="mt-4 flex items-center justify-between rounded-[var(--r)] border border-line bg-card-2 px-3 py-2.5">
                    <span className="font-mono text-[10px] text-ink-3">used today</span>
                    <span className="font-mono text-xs text-ink">{usage.used} / {usage.limit}</span>
                </div>

                <div className="mt-5 flex justify-end">
                    <Btn variant="primary" onClick={onClose}>Got it</Btn>
                </div>
            </div>
        </Modal>
    );
};

export default UpgradeModal;
