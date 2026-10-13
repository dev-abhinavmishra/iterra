import React from 'react';
import { Icon } from '../ui/primitives';
import { sanitizeHtml } from '../../services/sanitize';

interface ComparisonWidgetProps {
    data: any;
}

const Points: React.FC<{ points?: string[] }> = ({ points }) => (
    <ul className="space-y-2.5">
        {(points || []).map((p, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] text-ink-2 leading-relaxed">
                <span className="w-1 h-1 rounded-[1px] bg-[var(--ink-3)] mt-[7px] shrink-0" />
                <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(p) }} />
            </li>
        ))}
    </ul>
);

/* Side-by-side comparison as one index card split by a hairline. */
const ComparisonWidget: React.FC<ComparisonWidgetProps> = ({ data }) => (
    <div className="bg-card border border-line rounded-[var(--r-lg)] shadow-card max-w-2xl mx-auto overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
            <h4 className="font-serif text-base text-ink truncate">{data.title || 'Side by side'}</h4>
            <Icon name="compare_arrows" size={18} className="text-ink-3" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--line)]">
            <div className="p-5">
                <h5 className="text-[13px] font-semibold text-mark mb-3">{data.left?.name || 'A'}</h5>
                <Points points={data.left?.points} />
            </div>
            <div className="p-5">
                <h5 className="text-[13px] font-semibold text-ink mb-3">{data.right?.name || 'B'}</h5>
                <Points points={data.right?.points} />
            </div>
        </div>
    </div>
);

export default ComparisonWidget;
