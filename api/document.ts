import { chatCompletion } from './_providers';
import { reserveLimit } from './_usage';
import { readJsonBody } from './_http';

export const config = {
    api: {
        bodyParser: {
            /* Vercel caps function request bodies at 4.5MB at the platform
               edge — a bigger parser limit here is unreachable in production
               (a raw 413 preempts the function). The parser only needs enough
               headroom for the real payload plus the platform's margin. */
            sizeLimit: '4.5mb',
        },
    },
};

/* The decoded-byte cap is derived from the DEPLOY ceiling: the request body
   is ~4/3× base64 plus a small JSON envelope inside Vercel's 4.5MB limit, so
   ~3MiB decoded is the true maximum. The check still bounds the dev server,
   which has no platform cap. */
const MAX_DOC_BYTES = 3 * 1024 * 1024;

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    /* Validate before reserving quota — a malformed request should never
       consume then refund a use. */
    const { base64Data, mimeType, fileName } = readJsonBody(req);
    if (typeof base64Data !== 'string' || !base64Data || typeof mimeType !== 'string' || !mimeType) {
        return res.status(400).json({ error: 'base64Data and mimeType are required.' });
    }
    /* The client only sends image/* here (PDFs/docx/audio have their own
       paths). Anything else produces a data URL the vision provider was
       never going to parse — reject it before spending the call. */
    const mime = mimeType.toLowerCase().split(';')[0].trim();
    if (!mime.startsWith('image/')) {
        return res.status(400).json({ error: 'Only image documents can be analyzed.' });
    }
    /* Strict base64: Buffer.from(...,'base64') silently skips invalid chars,
       so charset-check before trusting the decoded bytes or the data URL. */
    const clean64 = base64Data.replace(/\s/g, '');
    if (!clean64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean64)) {
        return res.status(400).json({ error: 'Invalid base64 document data.' });
    }
    if (clean64.length * 0.75 > MAX_DOC_BYTES) {
        return res.status(413).json({ error: 'Document too large (max ~3MB).' });
    }

    const ticket = await reserveLimit(req, res);
    if (!ticket) return; // 429 already sent

    try {
        const bytes = Buffer.from(clean64, 'base64');
        if (bytes.length === 0 || bytes.length > MAX_DOC_BYTES) {
            await ticket.refund();
            return res.status(bytes.length === 0 ? 400 : 413)
                .json({ error: bytes.length === 0 ? 'Empty document data.' : 'Document too large (max ~3MB).' });
        }

        const prompt = `
        Analyze the provided document/image and create a structured study guide.

        CRITICAL INSTRUCTIONS:
        1. **Title**: Generate a concise, descriptive title.
        2. **Content**: Create HTML following this EXACT template:

        <blockquote><b>Executive Summary</b>: [2-3 sentence overview]</blockquote>
        <h2>🔑 Key Concepts</h2>
        <ul><li><b>[Term]</b> — [Definition]</li></ul>
        <h2>📝 Detailed Notes</h2>
        [Paragraphs with <b class="theme-highlight">bold highlights</b> on key terms. Use <h3> for sub-topics.]
        <h2>✅ Action Items</h2>
        <ul><li>[ ] [Task]</li></ul>
        <h2>⚡ Quick Review</h2>
        <ul><li>[Takeaway bullet]</li></ul>

        3. Wrap ALL key terms in <b class="theme-highlight"> bold tags (they become theme-colored highlights).
        4. **Transcript**: Extract raw text for searchability.
        5. Use strictly HTML in content. No Markdown, no inline styles.

        Respond with ONLY a JSON object, no markdown fences, in exactly this shape:
        { "title": "Title Here", "content": "HTML Here", "transcript": "Raw Text Here" }
        `;

        // Multimodal message: the document/image is passed as an OpenAI-style image_url
        // data URL. chatCompletion routes this to the first available vision provider
        // and fails over on rate limits.
        const { content: raw, provider } = await chatCompletion(
            [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: `data:${mime};base64,${clean64}` } },
                ],
            }],
            { vision: true, maxTokens: 4000, temperature: 0.4 }
        );

        res.setHeader('x-ai-provider', provider);

        // Robust JSON extraction (models sometimes wrap JSON in prose or fences).
        let result: any;
        const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
        try {
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                result = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
            } else {
                result = JSON.parse(cleaned);
            }
        } catch {
            const titleMatch = cleaned.match(/"title"\s*:\s*"((?:\\"|[^"])*)(?:"|$)/);
            const contentMatch = cleaned.match(/"content"\s*:\s*"((?:\\"|[^"])*)(?:"|$)/);
            const transcriptMatch = cleaned.match(/"transcript"\s*:\s*"((?:\\"|[^"])*)(?:"|$)/);
            result = {
                title: titleMatch ? titleMatch[1] : fileName,
                // If we truly couldn't parse JSON, fall back to showing the raw model text.
                content: contentMatch ? contentMatch[1] : `<p>${cleaned.slice(0, 4000) || 'Could not summarize content.'}</p>`,
                transcript: transcriptMatch ? transcriptMatch[1] : cleaned.slice(0, 4000),
            };
        }

        return res.status(200).json({
            title: result.title || fileName,
            content: result.content || '<p>Could not summarize content.</p>',
            transcript: result.transcript || 'No transcript extracted.',
            provider,
        });
    } catch (error: any) {
        console.error('Document API Error:', error);
        await ticket.refund();
        return res.status(503).json({ error: error.message || 'All AI providers are currently unavailable.' });
    }
}
