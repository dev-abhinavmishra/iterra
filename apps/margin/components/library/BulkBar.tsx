import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Btn } from '../ui/primitives';

interface BulkBarProps {
    count: number;
    allPinned: boolean;
    onPin: () => void;
    onExport: () => void;
    onDelete: () => void;
    onClear: () => void;
}

const BulkBar: React.FC<BulkBarProps> = ({ count, allPinned, onPin, onExport, onDelete, onClear }) => (
    <AnimatePresence>
        {count > 0 && (
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40"
            >
                <div className="flex items-center gap-1 bg-card border border-line-2 rounded-[var(--r-lg)] shadow-pop pl-4 pr-2 py-2">
                    <span className="font-mono text-xs text-ink-2 pr-2">
                        {count} selected
                    </span>
                    <Btn size="sm" variant="quiet" icon="keep" onClick={onPin}>
                        {allPinned ? 'Unpin' : 'Pin'}
                    </Btn>
                    <Btn size="sm" variant="quiet" icon="download" onClick={onExport}>Export</Btn>
                    <Btn size="sm" variant="danger" icon="delete" onClick={onDelete}>Delete</Btn>
                    <div className="w-px h-5 bg-[var(--line-2)] mx-1" />
                    <Btn size="sm" variant="ghost" onClick={onClear}>Done</Btn>
                </div>
            </motion.div>
        )}
    </AnimatePresence>
);

export default BulkBar;
