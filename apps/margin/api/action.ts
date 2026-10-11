import { chatCompletion } from './_providers';
import { reserveLimit } from './_usage';
import { readJsonBody } from './_http';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

/* Generic inline-AI actions used by the editor selection toolbar and
   "make study material" buttons. All consume the daily free limit. */

const PROMPTS: Record<string, (text: string) => string> = {
    summarize: (t) => `Summarize the following text in 2-4 sentences, plain prose, no preamble. Text: ${t}`,
    expand: (t) => `Expand the following passage into a fuller explanation (3-6 paragraphs of plain prose). Keep the same voice and level of detail; add clarifying context, examples, and nuance where helpful. Text: ${t}`,
    simplify: (t) => `Rewrite the following text in simpler language for a student. Keep every fact, shorten sentences, use plain words. Respond with only the rewritten text. Text: ${t}`,
    keypoints: (t) => `Extract the key points from the following text as a tight bulleted list (one line each, no numbering, no preamble). Text: ${t}`,
    flashcards: (t) => `Create study flashcards from the following text. Respond with ONLY a JSON array, no markdown fences: [{"front": "term or question", "back": "concise answer"}]. 5-12 cards, ordered most important first. Text: ${t}`,
    quiz: (t) => `Create a multiple-choice quiz from the following text. Respond with ONLY a JSON array, no markdown fences: [{"question": "...", "options": ["A","B","C","D"], "answer": "the correct option text, copied exactly"}]. 4-8 questions. Text: ${t}`,
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let ticket: Awaited<ReturnType<typeof reserveLimit>> = null;
    try {
        const { action, text, context } = readJsonBody(req) as { action?: string; text?: string; context?: string };

        const buildPrompt = action && PROMPTS[action];
        if (!buildPrompt) return res.status(400).json({ error: 'Unknown action' });
        if (!text || typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({ error: 'Missing text' });
        }

        ticket = await reserveLimit(req, res);
        if (!ticket) return; // 429 already sent

        const source = (context ? `Context:\n${context.slice(0, 30000)}\n\nSelection:\n${text.slice(0, 20000)}` : text.slice(0, 50000));
        const { content, provider } = await chatCompletion(
            [{ role: 'user', content: buildPrompt(source) }],
            { maxTokens: 2500, temperature: 0.4 }
        );

        res.setHeader('x-ai-provider', provider);
        return res.status(200).json({ content: content.trim(), provider });
    } catch (error: any) {
        console.error('Action API Error:', error);
        if (ticket) await ticket.refund();
        return res.status(500).json({ error: error?.message || 'Internal Server Error' });
    }
}
