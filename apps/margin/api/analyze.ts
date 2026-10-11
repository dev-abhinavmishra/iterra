import { chatCompletion, ChatMessage } from './_providers';
import { reserveLimit } from './_usage';
import { readJsonBody } from './_http';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const ticket = await reserveLimit(req, res);
    if (!ticket) return; // 429 already sent

    try {
        const { notes, query, history } = readJsonBody(req);

        const corpusContext = (notes || []).map((n: any) => `
        <DOCUMENT>
            <ID>${n.id}</ID>
            <TITLE>${n.title}</TITLE>
            <CONTENT>${n.transcript || n.content}</CONTENT>
        </DOCUMENT>
        `).join('\n\n');

        const systemInstruction = `You are a dynamic knowledge synthesis engine. You have access to the user's library of notes.
        Your goal is to satisfy the user's query by synthesizing information STRICTLY from these notes.

        STYLE RULES:
        1. **Markdown Structure**: Use headers (###), bullet points, and bold/italics to structure your answer.
        2. **Theme Highlights**: Wrap ALL key concepts, names, and important technical terms in <b class="theme-highlight"> bold tags. Be generous with this to create a premium, interactive look.
        3. **Tone**: Be professional, insightful, and helpful.
        4. **Source Consistency**: If information is missing from the notes, acknowledge it. Do not hallucinate.

        USER'S NOTES CORPUS:
        ${corpusContext}

        WIDGET SYSTEM (CRITICAL - Use these EXACT delimiters):
        When you want to show an interactive element, wrap the JSON data exactly like this:
        ---WIDGET_START:TYPE---
        { JSON_DATA }
        ---WIDGET_END---

        WIDGET TYPES:
        1. **FLASHCARD**: {"front": "...", "back": "..."}
        2. **QUIZ_SET**: {"title": "...", "questions": [{"question": "...", "options": ["A", "B"], "answer": "B"}]}
        3. **TIMELINE**: {"date": "...", "description": "..."}
        4. **ACTION_ITEM**: {"task": "...", "assignee": "..."}
        5. **TAKEAWAY**: {"title": "...", "description": "..."}
        6. **COMPARISON**: {"title": "...", "left": {"name": "...", "points": ["..."]}, "right": {"name": "...", "points": ["..."]}}
        7. **STAT**: {"value": "...", "label": "...", "detail": "..."}

        PERFECT EXAMPLE:
        ---WIDGET_START:QUIZ_SET---
        {"title": "Neuroscience", "questions": [{"question": "...", "options": ["A", "B"], "answer": "A"}]}
        ---WIDGET_END---

        CRITICAL RULES:
        - NEVER use Markdown lists for quizzes or timelines.
        - ALWAYS start with ---WIDGET_START:TYPE--- and end with ---WIDGET_END---.
        - NEVER return malformed JSON.
        - Use <b class="theme-highlight"> highlighting in standard chat sections.`;

        const messages: ChatMessage[] = [
            { role: 'system', content: systemInstruction },
            ...(history || []).map((h: any) => ({
                role: h.role === 'model' ? 'assistant' : 'user',
                content: h.text,
            })),
            { role: 'user', content: query },
        ];

        const { content, provider } = await chatCompletion(messages, {
            maxTokens: 2048,
            temperature: 0.7,
        });

        res.setHeader('x-ai-provider', provider);
        return res.status(200).json({ content: content || 'Unable to synthesize response.', provider });
    } catch (error: any) {
        console.error('Analysis API Error:', error);
        await ticket.refund();
        return res.status(503).json({ error: error.message || 'All AI providers are currently unavailable.' });
    }
}
