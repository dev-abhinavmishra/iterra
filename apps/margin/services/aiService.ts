import { Note } from '../types';
import { apiFetch, LimitReachedError } from './apiClient';

const LIMIT_MESSAGE = "You've reached your free limit. Your quota resets automatically — check back soon.";

// All AI requests go through the backend proxy (/api/), which handles
// multi-provider fallback and rate limiting.

export interface ChatResult {
    content: string;
    provider?: string;
    /* Set when the call failed — callers must not treat `content` as model output. */
    error?: string;
}

// 1. Chat with Context
export const generateChatResponse = async (
    history: { role: string; text: string }[],
    context: string,
    userMessage: string
): Promise<ChatResult> => {
    try {
        const res = await apiFetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history, context, userMessage })
        });

        if (!res.ok) throw new Error("Backend chat failure");
        const data = await res.json();
        return { content: data.content, provider: data.provider };
    } catch (error) {
        if (error instanceof LimitReachedError) return { content: LIMIT_MESSAGE };
        console.error("Chat Error:", error);
        return { content: "Sorry, I encountered an error connecting to the AI." };
    }
};

// 2. Process Document (PDF/Image) to create Note
export const processDocument = async (base64Data: string, mimeType: string, fileName: string): Promise<{ title: string, content: string, transcript: string }> => {
    try {
        const res = await apiFetch('/api/document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64Data, mimeType, fileName })
        });

        if (!res.ok) throw new Error("Backend document processing failure");
        return await res.json();
    } catch (error) {
        if (error instanceof LimitReachedError) throw error;
        console.error("Document Processing Error:", error);
        // Throw so callers can mark the import failed — a saved "error note"
        // would silently destroy the file's contents.
        throw new Error('The AI could not read this file. Try again.');
    }
};

// 3. Generate Structured Notes from Transcript (Text-only fallback)
export const generateNoteFromTranscript = async (transcript: string, title?: string): Promise<string> => {
    try {
        const res = await apiFetch('/api/note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'note', transcript })
        });

        if (!res.ok) throw new Error("Backend note failure");
        const data = await res.json();
        return data.content;
    } catch (error) {
        if (error instanceof LimitReachedError) throw error;
        console.error("Note Generation Error:", error);
        // Throw so callers can fall back to the raw text — returning canned
        // "Error Generating Notes" markup was persisted as the note body.
        throw new Error('The AI could not structure this text. Try again.');
    }
}

// 3.5 Generate Title Only
export const generateTitle = async (transcript: string): Promise<string> => {
    try {
        const res = await apiFetch('/api/note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'title', transcript })
        });

        if (!res.ok) throw new Error("Backend title failure");
        const data = await res.json();
        return data.content;
    } catch {
        return "New Session";
    }
};

// 4. Global Corpus Analysis (Multi-Format Support)
export const generateGlobalAnalysis = async (notes: Note[], query: string, history: { role: string; text: string }[]): Promise<ChatResult> => {
    try {
        // Optimization: Strip large binary data (sourceData) and keep only essential context
        // This prevents 413 (Payload Too Large) errors on Vercel's 4.5MB limit
        const optimizedNotes = notes.map(n => ({
            id: n.id,
            title: n.title,
            content: n.content,
            transcript: n.transcript
        }));

        // Safety truncation: If total characters exceed ~4M (approx 4MB), 
        // we truncate individual note contents proportionally to stay under the limit.
        let totalLen = JSON.stringify(optimizedNotes).length + JSON.stringify(history).length + query.length;
        const LIMIT = 4000000; // 4M characters

        let finalNotes = optimizedNotes;
        if (totalLen > LIMIT) {
            console.warn(`Payload size (${totalLen}) exceeds safety limit. Truncating context.`);
            // Sort by title/id to keep it stable, then truncate content/transcript if needed
            finalNotes = optimizedNotes.map(n => ({
                ...n,
                content: n.content.slice(0, 50000), // Cap individual notes at 50k chars
                transcript: n.transcript.slice(0, 50000)
            }));
        }

        const res = await apiFetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: finalNotes, query, history })
        });

        if (res.status === 413) {
            throw new Error("The combined size of your notes is too large for the analyzer. Try deleting some unused recordings or long files.");
        }

        if (!res.ok) throw new Error("Backend analysis failure");
        const data = await res.json();
        return { content: data.content };
    } catch (error: any) {
        if (error instanceof LimitReachedError) return { content: '', error: LIMIT_MESSAGE };
        console.error("Analysis Error:", error);
        const tooLarge = typeof error?.message === 'string' && error.message.startsWith('The combined size');
        return { content: '', error: tooLarge ? error.message : 'I could not reach the AI service just now — your notes are fine. Try again in a moment.' };
    }
};

// 4.1 Inline AI actions (editor selection toolbar, study-material generation)
export type AIAction = 'summarize' | 'expand' | 'simplify' | 'keypoints' | 'flashcards' | 'quiz';

export const runAction = async (action: AIAction, text: string, context?: string): Promise<ChatResult> => {
    try {
        const res = await apiFetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, text, context })
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'AI action failed');
        }
        const data = await res.json();
        return { content: data.content, provider: data.provider };
    } catch (error: any) {
        if (error instanceof LimitReachedError) return { content: '', error: LIMIT_MESSAGE };
        return { content: '', error: error.message || 'The AI action failed. Try again.' };
    }
};

/** Parse a JSON array the model returned (it sometimes wraps it in fences/prose). */
export const parseJsonArray = <T = any>(raw: string): T[] => {
    const cleaned = raw.replace(/```(?:json)?/g, '').trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try { return JSON.parse(match[0]) as T[]; } catch { return []; }
};

// 4.2 Audio Transcription (Groq Whisper)
export const transcribeAudio = async (base64Data: string, mimeType: string, fileName: string): Promise<string> => {
    const res = await apiFetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, mimeType, fileName })
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Transcription failed');
    }
    const data = await res.json();
    return data.transcript || '';
};

// Helper: convert a Blob to a base64 string (without the data: prefix).
export const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1] || '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// 4.5 Analysis Session Management
export const getAnalysisSessions = async (): Promise<any[]> => {
    const res = await fetch('/api/sessions');
    if (!res.ok) throw new Error("Failed to load sessions");
    return await res.json();
};

export const loadAnalysisSession = async (id: string): Promise<any> => {
    const res = await fetch('/api/sessions', {
        method: 'PUT', // Using PUT for fetching by ID in this implementation
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    if (!res.ok) throw new Error("Failed to load session content");
    return await res.json();
};

export const saveAnalysisSession = async (session: { id?: string, title: string, messages: any[] }): Promise<any> => {
    const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session)
    });
    if (!res.ok) throw new Error("Failed to save session");
    return await res.json();
};

export const deleteAnalysisSession = async (id: string): Promise<void> => {
    const res = await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    if (!res.ok) throw new Error("Failed to delete session");
};
