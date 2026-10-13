import { chatCompletion, ChatMessage } from './_providers';
import { reserveLimit } from './_usage';
import { readJsonBody } from './_http';

/* Chat sends the whole note as `context` — a long transcript plus history
   can pass the default 1mb parser limit. 4.5mb is the Vercel platform cap,
   so that's the effective ceiling anyway. */
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4.5mb',
        },
    },
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    /* Validate before reserving quota — a malformed request should never
       consume then refund a use. */
    const { history, context, userMessage } = readJsonBody(req);
    if (typeof userMessage !== 'string' || !userMessage.trim()) {
        return res.status(400).json({ error: 'userMessage is required.' });
    }
    if (history !== undefined && !Array.isArray(history)) {
        return res.status(400).json({ error: 'history must be an array.' });
    }

    // Reserve one use atomically; a failed reply refunds it.
    const ticket = await reserveLimit(req, res);
    if (!ticket) return; // 429 already sent

    try {
        const systemInstruction = `You are a helpful teaching assistant and research aide.
You have access to the following source material (transcript or document):
---
${typeof context === 'string' ? context.slice(0, 50000) : ''} ... (truncated if too long)
---
Answer the user's questions based strictly on this context. Be concise, academic, and helpful.`;

        const messages: ChatMessage[] = [
            { role: 'system', content: systemInstruction },
            ...(history || []).slice(0, 40).map((h: any) => ({
                role: h && h.role === 'model' ? 'assistant' : 'user',
                content: String(h?.text ?? '').slice(0, 20000),
            })),
            { role: 'user', content: userMessage.slice(0, 20000) },
        ];

        const { content, provider } = await chatCompletion(messages, {
            maxTokens: 2048,
            temperature: 0.6,
        });

        res.setHeader('x-ai-provider', provider);
        return res.status(200).json({ content: content || "I couldn't generate a response.", provider });
    } catch (error: any) {
        console.error('Chat API Error:', error);
        await ticket.refund();
        return res.status(503).json({ error: error.message || 'All AI providers are currently unavailable.' });
    }
}
