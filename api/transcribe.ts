// Audio transcription. PRIMARY provider is Google AI Studio Gemini via the
// native generateContent endpoint (inline_data audio — gemini-3.5-transcribe,
// the dedicated speech-to-text model, by default; override with
// GEMINI_TRANSCRIBE_MODEL). When Gemini is unconfigured or its call fails,
// audio falls back to Groq Whisper (whisper-large-v3-turbo) — only when
// GROQ_API_KEY exists.
//
// Used by both the live recorder and audio-file uploads. Transcription keeps
// its own daily bucket ('transcribe') so recordings can't drain the main AI
// pool — note quotas are effectively unlimited unless USAGE_LIMITS_ENABLED=1
// (see api/_usage.ts).
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

/* Gemini's inline_data is pickier about container names than Groq's upload —
   normalize the allowlisted aliases to canonical audio/* types. */
const GEMINI_MIME: Record<string, string> = {
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/x-m4a': 'audio/mp4',
    'audio/mpeg4': 'audio/mp4',
    'audio/opus': 'audio/ogg',
    'video/webm': 'audio/webm',
    'video/mp4': 'audio/mp4',
    'video/mpeg': 'audio/mpeg',
    'video/quicktime': 'audio/mp4',
};

/** Groq Whisper transcription. Throws on any failure so the caller can fall
    through to the Gemini fallback. */
const transcribeGroq = async (apiKey: string, mime: string, clean64: string, fileName: string): Promise<string> => {
    const bytes = Buffer.from(clean64, 'base64');
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
        throw new Error(`Groq transcription failed ${r.status}: ${detail}`);
    }

    const data = await r.json();
    const text = (data?.text || '').trim();
    if (!text) throw new Error('Groq returned an empty transcript');
    return text;
};

/** Gemini audio-understanding transcription via the native generateContent
    endpoint (the OpenAI-compat chat shim is not used — the dedicated
    transcribe model isn't a chat model). inline_data carries the raw base64
    audio; the prompt asks for a verbatim transcript only. */
const transcribeGemini = async (apiKey: string, mime: string, clean64: string): Promise<string> => {
    const model = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-3.5-transcribe';
    const geminiMime = GEMINI_MIME[mime] || mime;

    const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [
                        { inline_data: { mime_type: geminiMime, data: clean64 } },
                        { text: 'Transcribe this audio verbatim. Output ONLY the transcript text — no timestamps, no speaker labels, no commentary.' },
                    ],
                }],
                generationConfig: { temperature: 0 },
            }),
        }
    );

    if (!r.ok) {
        const detail = (await r.text()).slice(0, 300);
        throw new Error(`Gemini transcription failed ${r.status}: ${detail}`);
    }

    const data = await r.json();
    const text = (data?.candidates?.[0]?.content?.parts || [])
        .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim();
    if (!text) throw new Error('Gemini returned an empty transcript');
    return text;
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!groqKey && !geminiKey) {
        return res.status(503).json({ error: 'No transcription provider is configured (set GROQ_API_KEY or GEMINI_API_KEY).' });
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

    const bytes = Buffer.from(clean64, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_AUDIO_BYTES) {
        await ticket.refund();
        return res.status(bytes.length === 0 ? 400 : 413)
            .json({ error: bytes.length === 0 ? 'Empty audio data.' : 'Audio file too large (max ~3MB).' });
    }

    /* Gemini first (the configured primary provider); Groq Whisper is the
       fallback — only tried when GEMINI_API_KEY is unset/fails AND
       GROQ_API_KEY exists. */
    const failures: string[] = [];
    if (geminiKey) {
        try {
            const transcript = await transcribeGemini(geminiKey, mime, clean64);
            return res.status(200).json({ transcript });
        } catch (error: any) {
            console.error('Gemini transcription failed, trying Groq fallback:', error?.message || error);
            failures.push(`gemini: ${error?.message || error}`);
        }
    }
    if (groqKey) {
        try {
            const transcript = await transcribeGroq(groqKey, mime, clean64, fileName);
            return res.status(200).json({ transcript });
        } catch (error: any) {
            console.error('Groq transcription failed:', error?.message || error);
            failures.push(`groq: ${error?.message || error}`);
        }
    }

    await ticket.refund();
    return res.status(503).json({
        error: 'Transcription failed. Please try again.',
        detail: failures.join(' | ').slice(0, 300),
    });
}
