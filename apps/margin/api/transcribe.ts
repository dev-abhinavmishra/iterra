// Audio transcription via Groq Whisper (free, fast). Used by both the live
// recorder and audio-file uploads. Transcription keeps its own daily bucket
// ('transcribe', default 30/day — TRANSCRIBE_DAILY_LIMIT) so recordings don't
// eat the main AI quota and anonymous callers can't use the endpoint as an
// unbounded proxy for the deployment's provider key.
import { readJsonBody } from './_http';
import { envInt, reserveLimit } from './_usage';

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

const TRANSCRIBE_LIMIT = envInt('TRANSCRIBE_DAILY_LIMIT', 30);
/* The decoded-byte cap is derived from the DEPLOY ceiling: the request body
   is ~4/3× base64 plus a small JSON envelope inside Vercel's 4.5MB limit, so
   ~3MiB decoded is the true maximum. The check still bounds the dev server,
   which has no platform cap. */
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

// Groq's accepted containers — anything else is rejected before the upstream
// call so a bogus content-type can't burn a transcription request.
const ALLOWED_MIME = new Set([
    'audio/webm', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg',
    'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac',
    'audio/ogg', 'audio/opus', 'audio/flac', 'audio/mpeg4',
    'video/mp4', 'video/webm', 'video/mpeg', 'video/quicktime',
]);

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'Transcription provider (Groq) is not configured.' });
    }

    /* Validate before reserving quota — a malformed request should never
       consume then refund a use. */
    const { base64Data, mimeType, fileName } = readJsonBody(req);
    if (!base64Data || typeof base64Data !== 'string') {
        return res.status(400).json({ error: 'No audio data provided.' });
    }
    /* Browsers report container+codec together ('audio/webm;codecs=opus'
       is MediaRecorder's preferred output) — compare on the bare type or
       the live recorder's own output is rejected. The type is REQUIRED:
       an absent mime must not slip a mystery blob past the allowlist. */
    const mime = String(mimeType || '').toLowerCase().split(';')[0].trim();
    if (!mime || !ALLOWED_MIME.has(mime)) {
        return res.status(400).json({ error: 'Unsupported audio type.' });
    }

    /* Strict base64: Buffer.from(...,'base64') silently skips invalid chars,
       so charset-check the payload before trusting the decoded bytes. */
    const clean64 = base64Data.replace(/\s/g, '');
    if (!clean64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean64)) {
        return res.status(400).json({ error: 'Invalid base64 audio data.' });
    }
    if (clean64.length * 0.75 > MAX_AUDIO_BYTES) {
        return res.status(413).json({ error: 'Audio file too large (max ~3MB).' });
    }

    const ticket = await reserveLimit(req, res, { bucket: 'transcribe', limit: TRANSCRIBE_LIMIT });
    if (!ticket) return; // 429 already sent

    try {
        const bytes = Buffer.from(clean64, 'base64');
        if (bytes.length === 0 || bytes.length > MAX_AUDIO_BYTES) {
            await ticket.refund();
            return res.status(bytes.length === 0 ? 400 : 413)
                .json({ error: bytes.length === 0 ? 'Empty audio data.' : 'Audio file too large (max ~3MB).' });
        }
        const blob = new Blob([bytes], { type: mime });

        const form = new FormData();
        /* The filename rides inside the multipart body — keep it a plain
           basename so a crafted name can't smuggle quotes/CRLF upstream. */
        const safeName = String(fileName || 'audio.webm').replace(/[^\w.\-]/g, '_').slice(0, 120);
        form.append('file', blob, safeName);
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
            await ticket.refund();
            return res.status(503).json({ error: 'Transcription failed. Please try again.' });
        }

        const data = await r.json();
        return res.status(200).json({ transcript: data.text || '' });
    } catch (error: any) {
        console.error('Transcribe API Error:', error);
        await ticket.refund();
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
