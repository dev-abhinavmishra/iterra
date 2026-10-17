import React from 'react';

export interface OutlineItem {
    level: 1 | 2 | 3;
    text: string;
}

interface OutlinePanelProps {
    items: OutlineItem[];
    onJump: (index: number) => void;
}

const OutlinePanel: React.FC<OutlinePanelProps> = ({ items, onJump }) => {
    if (items.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center p-6">
                <p className="font-serif italic text-sm text-ink-3 text-center">
                    No headings yet — H1, H2 and H3 will outline this note here.
                </p>
            </div>
        );
    }
    return (
        <nav className="flex-1 overflow-y-auto custom-scrollbar py-2" aria-label="Note outline">
            {items.map((item, i) => (
                <button
                    key={i}
                    onClick={() => onJump(i)}
                    className={`w-full text-left px-4 py-1.5 font-serif text-[15px] leading-snug text-ink-2 hover:text-ink hover:bg-[var(--card-2)] transition-colors truncate
                        ${item.level === 2 ? 'pl-8' : item.level === 3 ? 'pl-12' : ''}
                        ${item.level === 1 ? 'font-semibold text-ink' : ''}`}
                >
                    {item.text}
                </button>
            ))}
        </nav>
    );
};

export default OutlinePanel;
