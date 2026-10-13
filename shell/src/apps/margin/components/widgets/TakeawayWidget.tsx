import React from 'react';
import { Icon } from '../ui/primitives';
import { sanitizeHtml } from '../../services/sanitize';

interface TakeawayWidgetProps {
    data: any;
}

/* Key takeaway — a margin note with the tape/mark selection edge. */
const TakeawayWidget: React.FC<TakeawayWidgetProps> = ({ data }) => (
    <div className="max-w-xl mx-auto rounded-r-[var(--r)] border border-line border-l-2 border-l-[var(--mark)] bg-[var(--tape)] px-5 py-4">
        <div className="flex items-center gap-2 mb-1.5">
            <Icon name="edit_note" size={16} className="text-mark" />
            <h4 className="text-[13px] font-semibold text-ink">{data.title || 'Takeaway'}</h4>
        </div>
        <p className="text-[13px] text-ink-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.description) }} />
    </div>
);

export default TakeawayWidget;
