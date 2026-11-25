// Unified multi-provider AI client with automatic fallback on rate limits.
//
// Every provider below exposes an OpenAI-compatible /chat/completions endpoint,
// so we can rotate across them with a single request shape. When one provider is
// rate-limited (HTTP 429) or has a transient server error, we transparently move
// on to the next configured provider.
//
// Order matters: Gemini (Google AI Studio) is PRIMARY — it has the most
// generous free-tier RPM/RPD of the configured providers (gemma-4-31b-it and
// the flash-lite tier run ~15 RPM / hundreds-to-thousands RPD vs ~20 RPD for
// the flash chat models). Groq/NVIDIA/OpenRouter remain as fallbacks.
//
// NOTE: gemini-2.5-flash is deprecated (Google routes it to gemini-3.6-flash
// and only grants ~20 RPD on the free tier) — do NOT use it as a default.

export type ChatMessage = { role: string; content: any };

interface ProviderDef {
    id: string;
    label: string;
    baseURL: string;
    apiKey?: string;
    model: string;
    visionModel?: string;
    /* Tried in order when the primary model fails — a saturated or retired
       model (e.g. gemma-4-31b-it's recurring 503s) shouldn't take the whole
       provider down while a sibling model on the same key is healthy. */
    modelFallbacks?: string[];
    visionFallbacks?: string[];
    extraHeaders?: Record<string, string>;
}

const PROVIDERS: ProviderDef[] = [
    {
        id: 'gemini',
        label: 'Gemini',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: process.env.GEMINI_API_KEY,
        /* gemma-4-31b-it: the user's requested high-throughput pick — Google
           serves it free-tier-only on AI Studio with the largest RPD allowance
           of the chat models (~15 RPM, up to ~1.5K RPD per project). Override
           with GEMINI_MODEL for a different Gemini/Gemma model. */
        model: process.env.GEMINI_MODEL || 'gemma-4-31b-it',
        /* gemini-3.5-flash-lite: highest free-tier RPM/RPD of the Gemini chat
           models (15 RPM / 500 RPD) and natively multimodal, so it stays fast
           even when the primary model's daily quota is spent. */
        visionModel: process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash-lite',
        /* gemma-4-31b-it is the throughput pick but Google frequently 503s it
           under load; the flash-lite tier answers the same key reliably. */
        modelFallbacks: [process.env.GEMINI_MODEL_FALLBACK || 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'],
        visionFallbacks: ['gemini-2.5-flash-lite'],
    },
    {
        id: 'groq',
        label: 'Groq',
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        // Groq vision (kept current with a free multimodal model)
        visionModel: process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
    },
    {
        id: 'nvidia',
        label: 'NVIDIA NIM',
        baseURL: 'https://integrate.api.nvidia.com/v1',
        apiKey: process.env.NVIDIA_API_KEY,
        model: process.env.NVIDIA_MODEL || 'meta/llama-3.3-70b-instruct',
        visionModel: process.env.NVIDIA_VISION_MODEL || 'meta/llama-3.2-90b-vision-instruct',
    },
    {
        id: 'openrouter',
        label: 'OpenRouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
        visionModel: process.env.OPENROUTER_VISION_MODEL || 'meta-llama/llama-3.2-11b-vision-instruct',
        extraHeaders: {
            'HTTP-Referer': 'https://modularaistack.vercel.app',
            'X-Title': 'Margin',
        },
    },
];

export interface CompletionResult {
    content: string;
    provider: string;
    model: string;
}

/* Thinking-tier Gemini/Gemma models inline their reasoning as
   <thought>…</thought> blocks in `content`. Left in, a title call returns
   the model's scratchpad as the note title and note generation gets
   prefixed with chain-of-thought. Strip full blocks; a response that is
   ALL thought counts as empty so the next model gets the request. */
const stripThoughts = (s: string): string =>
    s.replace(/<thought>[\s\S]*?(<\/thought>|$)/gi, '').replace(/<\/thought>/gi, '').trim();

const activeProviders = (vision: boolean) =>
    PROVIDERS.filter(p => p.apiKey && (!vision || p.visionModel));

/**
 * Run a chat completion, automatically failing over between providers when one
 * is rate-limited or errors. Throws only if every configured provider fails.
 */
export async function chatCompletion(
    messages: ChatMessage[],
    opts: { maxTokens?: number; temperature?: number; vision?: boolean } = {}
): Promise<CompletionResult> {
    const providers = activeProviders(!!opts.vision);
    if (providers.length === 0) {
        throw new Error(
            opts.vision
                ? 'No vision-capable AI provider is configured.'
                : 'No AI providers are configured. Set at least one of GEMINI_API_KEY, GROQ_API_KEY, NVIDIA_API_KEY or OPENROUTER_API_KEY.'
        );
    }

    const failures: string[] = [];

    for (const p of providers) {
        const primary = (opts.vision ? p.visionModel : p.model) as string;
        const fallbacks = opts.vision ? p.visionFallbacks : p.modelFallbacks;
        const models = [...new Set([primary, ...(fallbacks || [])])];

        for (const model of models) {
            try {
                const res = await fetch(`${p.baseURL}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${p.apiKey}`,
                        ...(p.extraHeaders || {}),
                    },
                    body: JSON.stringify({
                        model,
                        messages,
                        max_tokens: opts.maxTokens ?? 2048,
                        temperature: opts.temperature ?? 0.6,
                    }),
                });

                if (!res.ok) {
                    const detail = (await res.text()).slice(0, 200);
                    failures.push(`${p.id}:${model}(${res.status})`);
                    console.warn(`[providers] ${p.label}/${model} failed ${res.status}: ${detail}`);
                    // For rate-limits/server errors we fail over; for other 4xx (bad
                    // model, etc.) we also move on so a single misconfig can't break the app.
                    continue;
                }

                const data = await res.json();
                const raw: string | undefined = data?.choices?.[0]?.message?.content;
                const content = typeof raw === 'string' ? stripThoughts(raw) : '';
                if (!content) {
                    failures.push(`${p.id}:${model}(empty)`);
                    continue;
                }

                console.log(`[providers] served by ${p.label} (${model})`);
                return { content, provider: p.label, model };
            } catch (err: any) {
                failures.push(`${p.id}:${model}(${err?.message || 'network'})`);
                console.warn(`[providers] ${p.label}/${model} threw: ${err?.message}`);
                continue;
            }
        }
    }

    throw new Error(`All AI providers are unavailable or rate-limited [${failures.join(', ')}]`);
}
