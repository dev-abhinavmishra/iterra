import React from 'react';
import { sanitizeHtml } from '../../services/sanitize';

interface TimelineWidgetProps {
    data: any;
}

const normalizeEvents = (data: any): { date: string; description: string }[] => {
    if (Array.isArray(data)) return data.filter(e => e && (e.date || e.description));
    if (Array.isArray(data?.events)) return data.events.filter((e: any) => e && (e.date || e.description));
    if (data && (data.date || data.description)) return [{ date: data.date, description: data.description }];
    return [];
};

/* Timeline as a hairline spine with mono date ticks — one entry per event. */
const TimelineWidget: React.FC<TimelineWidgetProps> = ({ data }) => {
    const events = normalizeEvents(data);

    return (
        <div className="max-w-xl mx-auto bg-card border border-line rounded-[var(--r-lg)] shadow-card px-5 py-4">
            {data?.title && (
                <h4 className="font-serif text-base text-ink border-b border-line pb-2.5 mb-3">{data.title}</h4>
            )}
            <div className="space-y-0">
                {events.map((ev, i) => (
                    <div key={i} className="flex gap-4">
                        {/* Spine */}
                        <div className="flex flex-col items-center w-3 shrink-0">
                            <span className="w-2 h-2 rounded-full border-2 border-[var(--mark)] bg-card mt-1.5 shrink-0" />
                            {i < events.length - 1 && <span className="w-px flex-1 bg-[var(--line-2)]" />}
                        </div>
                        <div className={`flex-1 min-w-0 ${i < events.length - 1 ? 'pb-4' : ''}`}>
                            <span className="font-mono text-[11px] text-mark">{ev.date}</span>
                            <p className="text-[13px] text-ink-2 leading-relaxed mt-1" dangerouslySetInnerHTML={{ __html: sanitizeHtml(ev.description) }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TimelineWidget;
