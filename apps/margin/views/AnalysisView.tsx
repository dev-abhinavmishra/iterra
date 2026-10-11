import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { generateGlobalAnalysis, getAnalysisSessions, loadAnalysisSession, saveAnalysisSession, deleteAnalysisSession, generateTitle } from '../services/aiService';
import { Note, ChatMessage } from '../types';
import { sanitizeHtml } from '../services/sanitize';
import { Btn, Icon, IconBtn, Modal } from '../components/ui/primitives';
import QuizSetWidget from '../components/widgets/QuizSetWidget';
import FlashcardWidget from '../components/widgets/FlashcardWidget';
import TimelineWidget from '../components/widgets/TimelineWidget';
import ComparisonWidget from '../components/widgets/ComparisonWidget';
import TakeawayWidget from '../components/widgets/TakeawayWidget';

interface AnalysisViewProps {
    notes: Note[];
    contextualAttachments?: string[];
    setContextualAttachments?: React.Dispatch<React.SetStateAction<string[]>>;
}

/* Small ink squares "dealing" — the thinking indicator. */
const ThinkingRow: React.FC<{ label?: string }> = ({ label }) => (
    <div className="flex items-center gap-2 px-1 py-2">
        {[0, 1, 2].map(i => (
            <motion.span
                key={i}
                className="w-1.5 h-1.5 rounded-[1px] bg-[var(--ink-3)]"
                animate={{ opacity: [0.25, 1, 0.25] }}
                transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
            />
        ))}
        {label && <span className="font-mono text-[10px] text-ink-3 ml-1">{label}</span>}
    </div>
);

const StatWidget: React.FC<{ data: any }> = ({ data }) => (
    <div className="inline-flex flex-col bg-card border border-line rounded-[var(--r-lg)] shadow-card px-5 py-4 min-w-[150px]">
        <span className="font-mono text-[10px] text-ink-3">{data.label}</span>
        <span className="font-serif text-3xl text-ink mt-1 leading-none">{data.value}</span>
        {data.detail && <span className="font-mono text-[10px] text-ink-3 mt-2">{data.detail}</span>}
    </div>
);

const ActionItemWidget: React.FC<{ data: any }> = ({ data }) => {
    const [done, setDone] = useState(false);
    return (
        <div className="flex items-center gap-3.5 max-w-lg mx-auto bg-card border border-line rounded-[var(--r-lg)] shadow-card px-4 py-3.5">
            <button
                onClick={() => setDone(d => !d)}
                aria-pressed={done}
                className={`w-5 h-5 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors duration-150
                    ${done ? 'bg-[var(--ok)] border-transparent' : 'border-[var(--line-2)] hover:border-[var(--ink-3)]'}`}
            >
                {done && <Icon name="check" size={13} className="text-[var(--mark-ink)]" />}
            </button>
            <div className="flex-1 min-w-0">
                <p className={`text-[13px] leading-snug ${done ? 'text-ink-3 line-through' : 'text-ink'}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.task) }} />
                {data.assignee && <span className="font-mono text-[10px] text-ink-3 mt-1 block">{data.assignee}</span>}
            </div>
        </div>
    );
};

const renderWidget = (type: string, data: any) => {
    switch (type.toUpperCase()) {
        case 'QUIZ_SET':
        case 'QUIZ':
            return <QuizSetWidget data={data} />;
        case 'FLASHCARD':
            return <FlashcardWidget data={data} />;
        case 'TIMELINE':
            return <TimelineWidget data={data} />;
        case 'COMPARISON':
            return <ComparisonWidget data={data} />;
        case 'TAKEAWAY':
            return <TakeawayWidget data={data} />;
        case 'STAT':
            return <StatWidget data={data} />;
        case 'ACTION_ITEM':
            return <ActionItemWidget data={data} />;
        default:
            return null;
    }
};

const freshMessages = (): ChatMessage[] => [{
    id: 'init',
    role: 'model',
    text: "Ask about anything across your notes — I can quiz you, build timelines, compare ideas, or pull out takeaways.",
    timestamp: new Date()
}];

/* The live conversation lives at module scope so switching to another view
   and back doesn't wipe an in-progress session (the view unmounts on
   navigation — server persistence only runs after a successful reply). */
const liveAsk: { messages: ChatMessage[] | null; sessionId: string | null; transientError: string | null } = {
    messages: null,
    sessionId: null,
    transientError: null,
};

const AnalysisView: React.FC<AnalysisViewProps> = ({ notes, contextualAttachments = [], setContextualAttachments }) => {
    const [query, setQuery] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>(() => liveAsk.messages ?? freshMessages());
    const [transientError, setTransientError] = useState<string | null>(() => liveAsk.transientError);
    const [loading, setLoading] = useState(false);
    const [sessions, setSessions] = useState<any[]>([]);
    const [sessionsError, setSessionsError] = useState(false);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => liveAsk.sessionId);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        fetchSessions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Mirror the live conversation into the module-scope store.
    useEffect(() => {
        liveAsk.messages = messages;
        liveAsk.sessionId = currentSessionId;
        liveAsk.transientError = transientError;
    }, [messages, currentSessionId, transientError]);

    /* Write-through: handleSend keeps running after this view unmounts on
       navigation, so the reply must reach liveAsk even when setState is a
       no-op on the dead component. */
    const commitMessages = (msgs: ChatMessage[]) => {
        setMessages(msgs);
        liveAsk.messages = msgs;
    };
    const commitError = (text: string | null) => {
        setTransientError(text);
        liveAsk.transientError = text;
    };

    const fetchSessions = async () => {
        try {
            const data = await getAnalysisSessions();
            setSessions(data);
            setSessionsError(false);
        } catch (err) {
            console.error("Failed to fetch sessions", err);
            setSessionsError(true);
        }
    };

    const handleNewSession = () => {
        setCurrentSessionId(null);
        setQuery("");
        if (setContextualAttachments) setContextualAttachments([]);
        commitMessages(freshMessages());
        commitError(null);
    };

    const handleLoadSession = async (id: string) => {
        try {
            setLoading(true);
            const data = await loadAnalysisSession(id);
            setCurrentSessionId(data.id);
            setQuery("");
            if (setContextualAttachments) setContextualAttachments([]);
            commitError(null);
            commitMessages(data.messages.map((m: any) => ({
                ...m,
                timestamp: new Date(m.timestamp)
            })));
        } catch (err) {
            console.error("Failed to load session", err);
        } finally {
            setLoading(false);
        }
    };

    const confirmDeleteSession = async () => {
        const id = sessionToDelete;
        setSessionToDelete(null);
        if (!id) return;
        try {
            await deleteAnalysisSession(id);
            if (currentSessionId === id) handleNewSession();
            fetchSessions();
        } catch (err) {
            console.error("Delete failed", err);
        }
    };

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    // Auto-grow the input as the query wraps
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 140) + 'px';
    }, [query]);

    const handleSend = async (overrideQuery?: string) => {
        const baseQuery = typeof overrideQuery === 'string' ? overrideQuery : query;
        if (!baseQuery.trim() && contextualAttachments.length === 0) return;

        let finalQuery = baseQuery;
        const originalQuery = baseQuery;

        if (contextualAttachments.length > 0) {
            const attachmentsBlock = contextualAttachments.map(text => `> ${text}`).join('\n>\n');
            finalQuery = `${attachmentsBlock}\n\n${query}`.trim();
        }

        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: finalQuery, timestamp: new Date() };
        const newMessages = [...messages, userMsg];
        commitMessages(newMessages);
        commitError(null);
        setQuery("");

        if (setContextualAttachments) {
            setContextualAttachments([]);
        }

        setLoading(true);

        try {
            const result = await generateGlobalAnalysis(
                notes,
                finalQuery,
                messages.map(m => ({ role: m.role, text: m.text }))
            );

            if (result.error) {
                // Degraded reply: transient notice rendered under the thread —
                // never model output, never sent back as history, never saved.
                commitError(result.error);
                return;
            }

            const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: result.content, provider: result.provider, timestamp: new Date() };
            const finalMessages = [...newMessages, aiMsg];
            commitMessages(finalMessages);

            let title = currentSessionId ? sessions.find(s => s.id === currentSessionId)?.title : null;
            if (!title) {
                title = await generateTitle(originalQuery || "Ask session");
            }

            try {
                const saved = await saveAnalysisSession({
                    id: currentSessionId || undefined,
                    title,
                    messages: finalMessages
                });
                if (!currentSessionId) setCurrentSessionId(saved.id);
                fetchSessions();
            } catch (err) {
                // No backend persistence available — the live copy in the
                // module store keeps the conversation through navigation.
                console.error("Could not persist session", err);
            }
        } catch (err) {
            console.error("Analysis failed", err);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard?.writeText(text).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 1500);
        }).catch(() => {});
    };

    const renderMessageContent = (text: string) => {
        const widgets: React.ReactNode[] = [];
        let cleanText = text;

        // Stage 1: ---WIDGET_START:TYPE--- ... ---WIDGET_END---
        const delimiterRegex = /---WIDGET_START:(\w+)---([\s\S]*?)(?:---WIDGET_END---|$)/g;
        let delimiterMatch;
        while ((delimiterMatch = delimiterRegex.exec(text)) !== null) {
            processWidgetData(delimiterMatch[1], delimiterMatch[2].trim());
        }

        // Stage 2: legacy <<<TYPE:JSON>>> shape
        const legacyRegex = /<{1,3}(\w+):?\s*([\s\S]*?)>{1,3}/g;
        let legacyMatch;
        while ((legacyMatch = legacyRegex.exec(text)) !== null) {
            const type = legacyMatch[1];
            const content = legacyMatch[2].trim();
            if (!text.includes(`---WIDGET_START:${type}---`)) {
                processWidgetData(type, content);
            }
        }

        // Stage 3: bare JSON blocks
        if (widgets.length === 0) {
            const potentialJsonRegex = /(\[[\s\S]*\]|\{[\s\S]*\})/g;
            let jsonMatch;
            while ((jsonMatch = potentialJsonRegex.exec(text)) !== null) {
                const rawJson = jsonMatch[1].trim();
                if (rawJson.includes('"question":') || rawJson.includes('"front":') || rawJson.includes('"date":') || rawJson.includes('"left":')) {
                    const type = rawJson.includes('"question":') ? 'QUIZ_SET' :
                                 rawJson.includes('"front":') ? 'FLASHCARD' :
                                 rawJson.includes('"top":') ? 'TAKEAWAY' :
                                 rawJson.includes('"left":') ? 'COMPARISON' : 'UNKNOWN';
                    processWidgetData(type, rawJson);
                }
            }
        }

        function processWidgetData(type: string, rawContent: string) {
            try {
                let fixed = rawContent.trim();
                if (fixed.endsWith(',')) fixed = fixed.slice(0, -1);
                if (fixed.startsWith('<<')) fixed = fixed.replace(/^<<+/, '');
                if (fixed.endsWith('>>')) fixed = fixed.replace(/>>+$/, '');
                if (type === 'QUIZ_SET' && fixed.startsWith('[') && !fixed.includes('"questions":')) {
                    fixed = `{"questions": ${fixed}}`;
                }

                const data = JSON.parse(fixed);
                const widgetKey = `${type}-${widgets.length}`;

                const el = renderWidget(type, data);
                if (el) {
                    widgets.push(
                        <div key={widgetKey} className="my-5 rise">
                            {el}
                        </div>
                    );
                }

                cleanText = cleanText.replace(rawContent, "");
            } catch (e) {
                console.error("Widget parse failure:", type, e);
            }
        }

        cleanText = cleanText.replace(/---WIDGET_START:(\w+)---/g, "")
                            .replace(/---WIDGET_END---/g, "")
                            .replace(/<{1,3}(\w+):?/g, "")
                            .replace(/>{1,3}/g, "");

        const htmlContent = cleanText
            .replace(/\|(.+)\|/gim, (match) => {
                const cols = match.split('|').filter(c => c.trim().length > 0);
                if (cols.length === 0) return match;
                return `<div class="overflow-x-auto my-4"><table class="min-w-full border border-[var(--line)] rounded-[var(--r)] overflow-hidden text-[12px]">
                    <tr class="bg-[var(--card-2)]">
                        ${cols.map(c => `<th class="px-3 py-2 text-left font-semibold text-ink border-b border-[var(--line)]">${c.trim()}</th>`).join('')}
                    </tr>
                </table></div>`;
            })
            .replace(/^#{3} (.*$)/gim, '<h3 class="font-serif text-base font-semibold text-ink mt-5 mb-1.5">$1</h3>')
            .replace(/^#{2} (.*$)/gim, '<h2 class="font-serif text-lg font-semibold text-ink mt-6 mb-2 border-b border-[var(--line)] pb-1.5">$1</h2>')
            .replace(/^#{1} (.*$)/gim, '<h1 class="font-serif text-xl font-semibold text-ink mt-7 mb-3">$1</h1>')
            .replace(/\*\*(.*?)\*\*/g, '<b class="font-semibold text-ink">$1</b>')
            .replace(/\*(.*?)\*/g, '<i class="italic text-ink-2">$1</i>')
            .replace(/^> (.*$)/gim, '<blockquote class="border-l-2 border-[var(--mark)]/50 bg-[var(--card-2)] px-3 py-1.5 my-3 rounded-r-[var(--r)] italic text-ink-2">$1</blockquote>')
            .replace(/^\s*[-*] (.*$)/gim, '<li class="ml-4 list-disc text-ink-2 mb-1">$1</li>')
            .replace(/\n/g, '<br/>');

        return (
            <div className="space-y-2">
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlContent) }} />
                {widgets.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-line space-y-2">
                        {widgets}
                    </div>
                )}
            </div>
        );
    };

    const suggestions = [
        { label: 'Make a quiz', icon: 'quiz', query: 'Generate a comprehensive quiz set based on my notes.' },
        { label: 'Timeline', icon: 'event_repeat', query: 'Show a timeline of key events and dates mentioned in my library.' },
        { label: 'Compare concepts', icon: 'compare_arrows', query: 'Compare the primary concepts discussed in my recent notes.' },
        { label: 'Key takeaways', icon: 'edit_note', query: 'Summarize the most important takeaways from all my notes.' }
    ];

    return (
        <div className="flex h-full overflow-hidden bg-paper flex-1">
            {/* Sessions sidebar */}
            <div className={`border-r border-line bg-card transition-all duration-200 flex flex-col shrink-0 ${sidebarOpen ? 'w-60' : 'w-0 overflow-hidden'}`}>
                <div className="h-12 px-3 border-b border-line flex items-center justify-between shrink-0">
                    <h2 className="text-[13px] font-medium text-ink">Sessions</h2>
                    <IconBtn icon="add" title="New session" onClick={handleNewSession} />
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {sessions.length === 0 && (
                        <p className="text-xs text-ink-3 px-2 py-6">
                            {sessionsError
                                ? 'Could not load past sessions — the backend is unreachable.'
                                : 'Past conversations will list here.'}
                        </p>
                    )}
                    {sessions.map(s => (
                        <div
                            key={s.id}
                            onClick={() => handleLoadSession(s.id)}
                            className={`group px-3 py-2.5 rounded-[var(--r)] cursor-pointer border transition-colors duration-150 ${currentSessionId === s.id
                                ? 'bg-[var(--mark-soft)] border-[var(--mark)]/30'
                                : 'border-transparent hover:bg-[var(--card-2)]'}`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <h3 className={`text-[13px] font-medium truncate ${currentSessionId === s.id ? 'text-mark' : 'text-ink'}`}>{s.title}</h3>
                                    <p className="font-mono text-[10px] text-ink-3 mt-0.5">{new Date(s.updated_at).toLocaleDateString()}</p>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSessionToDelete(s.id); }}
                                    className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-bad transition-opacity shrink-0"
                                    title="Delete session"
                                >
                                    <Icon name="delete" size={15} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main column */}
            <div className="flex-1 flex flex-col min-w-0 h-full">
                <header className="h-14 border-b border-line flex items-center px-3 md:px-5 shrink-0 gap-2">
                    <IconBtn icon={sidebarOpen ? 'menu_open' : 'menu'} title="Toggle sessions" onClick={() => setSidebarOpen(o => !o)} />
                    <div className="h-4 w-px bg-[var(--line-2)] hidden md:block" />
                    <h1 className="font-serif text-xl text-ink ink-write ink-underline">Ask</h1>
                    <span className="font-mono text-[10px] text-ink-3 ml-1">{notes.length} notes in context</span>
                </header>

                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 lg:pl-[76px] py-6 custom-scrollbar page-lines">
                    {messages.length <= 1 && !loading ? (
                        <div className="h-full flex flex-col items-center justify-center text-center rise">
                            <div className="w-11 h-11 rounded-[var(--r-lg)] bg-card border border-line shadow-card flex items-center justify-center">
                                <Icon name="forum" size={20} className="text-mark" />
                            </div>
                            <h2 className="font-serif text-[26px] text-ink mt-5 ink-write ink-underline" style={{ '--ink-delay': '0.15s' } as React.CSSProperties}>Ask your notes</h2>
                            <p className="text-[13px] text-ink-2 mt-2.5 max-w-md leading-relaxed">
                                Quiz yourself, build timelines, compare ideas, or pull out takeaways — across your whole library.
                            </p>
                            <div className="flex flex-wrap justify-center gap-2 mt-7">
                                {suggestions.map((s, i) => (
                                    <Btn key={i} size="sm" icon={s.icon} onClick={() => handleSend(s.query)}>
                                        {s.label}
                                    </Btn>
                                ))}
                            </div>
                        </div>
                    ) : (
                    <div className="space-y-5">
                    {messages.map((msg, idx) => (
                        <div key={msg.id || idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            {msg.role === 'model' ? (
                                <div className="w-7 h-7 rounded-[var(--r)] bg-card border border-line flex items-center justify-center shrink-0 shadow-card mt-0.5">
                                    <Icon name="chat" size={14} className="text-ink-3" />
                                </div>
                            ) : <div className="w-7 shrink-0" />}
                            <div className={`flex flex-col gap-1 max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div
                                    className={`px-4 py-3 rounded-[var(--r-lg)] text-[13px] leading-relaxed ${msg.role === 'model'
                                        ? 'bg-card border border-line text-ink shadow-card'
                                        : 'bg-[var(--mark-soft)] border border-[var(--mark)]/25 text-ink'}`}
                                >
                                    {renderMessageContent(msg.text)}
                                </div>
                                {msg.role === 'model' && msg.id !== 'init' && (
                                    <div className="flex items-center gap-3 px-1">
                                        {msg.provider && (
                                            <span className="font-mono text-[10px] text-ink-3">via {msg.provider}</span>
                                        )}
                                        <button
                                            onClick={() => handleCopy(msg.text, msg.id)}
                                            className="font-mono text-[10px] text-ink-3 hover:text-mark flex items-center gap-1 transition-colors"
                                        >
                                            <Icon name={copiedId === msg.id ? 'check' : 'content_copy'} size={11} />
                                            {copiedId === msg.id ? 'copied' : 'copy'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {loading && (
                        <div className="flex gap-3">
                            <div className="w-7 h-7 rounded-[var(--r)] bg-card border border-line flex items-center justify-center shrink-0 shadow-card mt-0.5">
                                <Icon name="chat" size={14} className="text-ink-3" />
                            </div>
                            <div className="bg-card border border-line rounded-[var(--r-lg)] shadow-card px-4">
                                <ThinkingRow label="reading your notes" />
                            </div>
                        </div>
                    )}

                    {transientError && !loading && (
                        <div className="flex gap-3">
                            <div className="w-7 h-7 rounded-[var(--r)] bg-card border border-line flex items-center justify-center shrink-0 shadow-card mt-0.5">
                                <Icon name="chat" size={14} className="text-ink-3" />
                            </div>
                            <div className="px-4 py-3 rounded-[var(--r-lg)] text-[13px] leading-relaxed border border-dashed border-line text-ink-3 italic">
                                {transientError}
                            </div>
                        </div>
                    )}
                    </div>
                    )}
                </div>

                {/* Input */}
                <div className="border-t border-line px-4 md:px-8 py-4 shrink-0">
                    <div className="max-w-3xl mx-auto flex flex-col gap-3">
                        {contextualAttachments.length > 0 && (
                            <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                                {contextualAttachments.map((text, idx) => (
                                    <div key={idx} className="bg-[var(--tape)] border-l-2 border-[var(--mark)] rounded-r-[var(--r)] px-3 py-2 flex items-start gap-2.5 group/att">
                                        <Icon name="format_quote" size={14} className="text-mark mt-0.5 shrink-0" />
                                        <p className="text-xs text-ink-2 flex-1 line-clamp-2 leading-relaxed italic" title={text}>"{text}"</p>
                                        <button
                                            onClick={() => setContextualAttachments && setContextualAttachments(prev => prev.filter((_, i) => i !== idx))}
                                            className="shrink-0 text-ink-3 hover:text-bad transition-colors"
                                            title="Remove"
                                        >
                                            <Icon name="close" size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-end gap-2">
                            <textarea
                                ref={inputRef}
                                rows={1}
                                className="flex-1 bg-card-2 border border-line-2 rounded-[var(--r)] px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-[var(--mark)] resize-none custom-scrollbar transition-colors"
                                placeholder="Ask across your notes…"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                            />
                            <Btn variant="primary" onClick={() => handleSend()} disabled={loading || (!query.trim() && contextualAttachments.length === 0)} icon="arrow_upward">
                                Ask
                            </Btn>
                        </div>
                    </div>
                </div>
            </div>

            {/* Delete session confirm */}
            <Modal open={sessionToDelete !== null} onClose={() => setSessionToDelete(null)}>
                <div className="p-5">
                    <h3 className="font-serif text-lg text-ink">Delete this session?</h3>
                    <p className="text-sm text-ink-2 mt-2">The conversation will be removed permanently.</p>
                    <div className="flex justify-end gap-2 mt-5">
                        <Btn onClick={() => setSessionToDelete(null)}>Cancel</Btn>
                        <Btn variant="danger" onClick={confirmDeleteSession}>Delete</Btn>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default AnalysisView;
