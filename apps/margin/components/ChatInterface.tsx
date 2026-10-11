import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { generateChatResponse } from '../services/aiService';
import { ChatMessage } from '../types';
import { Icon } from './ui/primitives';
import { sanitizeHtml } from '../services/sanitize';

interface ChatInterfaceProps {
    context: string;
    contextualAttachments?: string[];
    setContextualAttachments?: React.Dispatch<React.SetStateAction<string[]>>;
}

// Simple markdown parser for bold, italic, lists, code — token-styled.
const renderMarkdown = (text: string) => {
    let html = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-ink">$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
    html = html.replace(/`(.*?)`/g, '<code class="bg-[var(--card-2)] px-1 py-0.5 rounded font-mono text-[11px] border border-[var(--line)]">$1</code>');

    if (html.includes('\n- ') || html.includes('\n* ')) {
        const lines = html.split('\n');
        let inList = false;
        const newLines: string[] = [];

        for (const line of lines) {
            if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                if (!inList) {
                    newLines.push('<ul class="list-disc pl-4 space-y-1 my-2">');
                    inList = true;
                }
                newLines.push(`<li>${line.trim().substring(2)}</li>`);
            } else {
                if (inList) {
                    newLines.push('</ul>');
                    inList = false;
                }
                newLines.push(line);
            }
        }
        if (inList) newLines.push('</ul>');
        html = newLines.join('\n');
    }

    html = html.replace(/\n\n/g, '<br/><br/>');

    return { __html: sanitizeHtml(html) };
};

const ChatInterface: React.FC<ChatInterfaceProps> = ({ context, contextualAttachments = [], setContextualAttachments }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        setMessages([
            {
                id: 'init',
                role: 'model',
                text: "Ask about this note — I can clarify concepts, summarize sections, or find specific details.",
                timestamp: new Date()
            }
        ]);
    }, [context]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    // Auto-grow the textarea as the input wraps
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }, [input]);

    const handleSend = async () => {
        if (!input.trim() && contextualAttachments.length === 0) return;

        let finalInput = input;

        if (contextualAttachments.length > 0) {
            const attachmentsBlock = contextualAttachments.map(text => `> ${text}`).join('\n>\n');
            finalInput = `${attachmentsBlock}\n\n${input}`.trim();
        }

        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: finalInput, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInput("");

        if (setContextualAttachments) {
            setContextualAttachments([]);
        }

        setLoading(true);

        const result = await generateChatResponse(
            messages.map(m => ({ role: m.role, text: m.text })),
            context,
            finalInput
        );

        setLoading(false);
        setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'model',
            text: result.content,
            provider: result.provider,
            timestamp: new Date()
        }]);
    };

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard?.writeText(text).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 1500);
        }).catch(() => {});
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-paper">
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        {msg.role === 'model' ? (
                            <div className="w-6 h-6 rounded-[var(--r)] bg-card border border-line flex items-center justify-center shrink-0 mt-0.5">
                                <Icon name="chat" size={12} className="text-ink-3" />
                            </div>
                        ) : <div className="w-6 shrink-0" />}
                        <div className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[90%]`}>
                            <div
                                className={`px-3 py-2.5 rounded-[var(--r-lg)] text-xs leading-relaxed ${msg.role === 'model'
                                    ? 'bg-card border border-line text-ink shadow-card'
                                    : 'bg-[var(--mark-soft)] border border-[var(--mark)]/25 text-ink'}`}
                                dangerouslySetInnerHTML={msg.role === 'model' ? renderMarkdown(msg.text) : { __html: msg.text.replace(/</g, '&lt;').replace(/\n/g, '<br/>') }}
                            />
                            {msg.role === 'model' && msg.id !== 'init' && (
                                <div className="flex items-center gap-3 px-1">
                                    {msg.provider && (
                                        <span className="font-mono text-[10px] text-ink-3">via {msg.provider}</span>
                                    )}
                                    <button
                                        onClick={() => handleCopy(msg.text, msg.id)}
                                        className="font-mono text-[10px] text-ink-3 hover:text-mark flex items-center gap-1 transition-colors"
                                        title="Copy"
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
                    <div className="flex gap-2.5">
                        <div className="w-6 h-6 rounded-[var(--r)] bg-card border border-line flex items-center justify-center shrink-0 mt-0.5">
                            <Icon name="chat" size={12} className="text-ink-3" />
                        </div>
                        <div className="bg-card border border-line rounded-[var(--r-lg)] shadow-card px-3 flex items-center gap-2 py-2.5">
                            {[0, 1, 2].map(i => (
                                <motion.span
                                    key={i}
                                    className="w-1.5 h-1.5 rounded-[1px] bg-[var(--ink-3)]"
                                    animate={{ opacity: [0.25, 1, 0.25] }}
                                    transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-line flex flex-col gap-2">
                {contextualAttachments.length > 0 && (
                    <div className="flex flex-col gap-1.5 max-h-28 overflow-y-auto custom-scrollbar">
                        {contextualAttachments.map((text, idx) => (
                            <div key={idx} className="bg-[var(--tape)] border-l-2 border-[var(--mark)] rounded-r-[var(--r)] px-2.5 py-1.5 flex items-start gap-2 group/att">
                                <Icon name="format_quote" size={12} className="text-mark mt-0.5 shrink-0" />
                                <p className="text-[11px] text-ink-2 flex-1 line-clamp-2 leading-relaxed italic" title={text}>"{text}"</p>
                                <button
                                    onClick={() => setContextualAttachments && setContextualAttachments(prev => prev.filter((_, i) => i !== idx))}
                                    className="shrink-0 text-ink-3 hover:text-bad transition-colors"
                                    title="Remove"
                                >
                                    <Icon name="close" size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        rows={1}
                        className="flex-1 bg-card-2 border border-line-2 rounded-[var(--r)] px-3 py-2 text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:border-[var(--mark)] resize-none custom-scrollbar transition-colors"
                        placeholder="Ask about this note…"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading || (!input.trim() && contextualAttachments.length === 0)}
                        title="Send"
                        className="w-8 h-8 rounded-[var(--r)] bg-[var(--mark)] text-[var(--mark-ink)] flex items-center justify-center hover:brightness-110 active:scale-95 transition-all shadow-card disabled:opacity-45 disabled:pointer-events-none shrink-0"
                    >
                        <Icon name="arrow_upward" size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatInterface;
