// Audio transcription via Groq Whisper (free, fast). Used by both the live
// recorder and audio-file uploads. Transcription itself does not consume the
// daily quota — the note generation that follows does.
import { readJsonBody } from './_http';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '25mb',
        },
    },
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'Transcription provider (Groq) is not configured.' });
    }

    try {
        const { base64Data, mimeType, fileName } = readJsonBody(req);
        if (!base64Data) return res.status(400).json({ error: 'No audio data provided.' });

        const bytes = Buffer.from(base64Data, 'base64');
        const blob = new Blob([bytes], { type: mimeType || 'audio/webm' });

        const form = new FormData();
        form.append('file', blob, fileName || 'audio.webm');
        form.append('model', process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo');
        form.append('response_format', 'json');
        form.append('temperature', '0');

        const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form,
        });

        if (!r.ok) {
            const detail = (await r.text()).slice(0, 300);
            console.error('Groq transcription failed:', detail);
            return res.status(503).json({ error: 'Transcription failed. Please try again.' });
        }

        const data = await r.json();
        return res.status(200).json({ transcript: data.text || '' });
    } catch (error: any) {
        console.error('Transcribe API Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
