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

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { action, transcript } = readJsonBody(req);

        // Title generation is lightweight and does NOT consume the user's daily quota.
        if (action === 'title') {
            try {
                const { content } = await chatCompletion(
                    [{
                        role: 'user',
                        content: `Based on this text, generate a short, descriptive title (max 6 words). Respond with ONLY the title, no quotes. Text: ${(transcript || '').slice(0, 1000)}`,
                    }],
                    { maxTokens: 30, temperature: 0.5 }
                );
                return res.status(200).json({ content: content.trim().replace(/^["']|["']$/g, '') || 'New Session' });
            } catch {
                return res.status(200).json({ content: 'New Session' });
            }
        }

        if (action === 'note') {
            // Full note generation reserves one use; failure refunds it.
            const ticket = await reserveLimit(req, res);
            if (!ticket) return; // 429 already sent

            const prompt = `
            You are an expert note-taker. Transform the following raw text/transcript into a high-quality, structured study guide.

            YOU MUST follow this EXACT HTML template structure. Do not deviate:

            <blockquote><b>Executive Summary</b>: [2-3 sentence overview of the entire content]</blockquote>

            <h2>Key concepts</h2>
            <ul>
            <li><b>[Term 1]</b> — [Brief definition or explanation]</li>
            <li><b>[Term 2]</b> — [Brief definition or explanation]</li>
            [... more as needed]
            </ul>

            <h2>Detailed notes</h2>
            [Structured paragraphs with <b>bold highlights</b> on important phrases. Use <h3> sub-headers if multiple topics exist. Be thorough but concise.]

            <h2>Action items</h2>
            <ul>
            <li>[Actionable task derived from the content]</li>
            [... more as needed, or write "No action items identified." if none]
            </ul>

            <h2>Quick review</h2>
            <ul>
            <li>[One-line bullet summary point 1]</li>
            <li>[One-line bullet summary point 2]</li>
            [... 3-6 key takeaways]
            </ul>

            RULES:
            - Do NOT just copy the raw text. Summarize and restructure it.
            - Wrap ALL key terms, names, definitions in <b> bold tags. Be generous.
            - Use strictly HTML. Do NOT use Markdown. Do NOT use inline styles.
            - Keep the section headers exactly as shown (plain text, no emoji).

            Raw Text:
            ${(transcript || '').slice(0, 100000)}
            `;

            try {
                const { content, provider } = await chatCompletion(
                    [{ role: 'user', content: prompt }],
                    { maxTokens: 4000, temperature: 0.5 }
                );
                res.setHeader('x-ai-provider', provider);
                return res.status(200).json({ content: content || 'Could not generate notes.', provider });
            } catch (error: any) {
                console.error('Note generation failed:', error);
                await ticket.refund();
                return res.status(503).json({ error: error.message || 'All AI providers are currently unavailable.' });
            }
        }

        return res.status(400).json({ error: 'Invalid action' });
    } catch (error: any) {
        console.error('Note API Error:', error);
        return res.status(500).json({ error: error?.message || 'Internal Server Error' });
    }
}
