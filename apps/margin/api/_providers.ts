// Unified multi-provider AI client with automatic fallback on rate limits.
//
// Every provider below exposes an OpenAI-compatible /chat/completions endpoint,
// so we can rotate across them with a single request shape. When one provider is
// rate-limited (HTTP 429) or has a transient server error, we transparently move
// on to the next configured provider. Only FREE models are used.
//
// Order matters: the most reliable free provider is tried first.

export type ChatMessage = { role: string; content: any };

interface ProviderDef {
    id: string;
    label: string;
    baseURL: string;
    apiKey?: string;
    model: string;
    visionModel?: string;
    extraHeaders?: Record<string, string>;
}

const PROVIDERS: ProviderDef[] = [
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
        model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
        visionModel: process.env.OPENROUTER_VISION_MODEL || 'meta-llama/llama-3.2-11b-vision-instruct:free',
        extraHeaders: {
            'HTTP-Referer': 'https://modularaistack.vercel.app',
            'X-Title': 'Margin',
        },
    },
    {
        id: 'gemini',
        label: 'Gemini',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        visionModel: process.env.GEMINI_VISION_MODEL || 'gemini-2.0-flash',
    },
];

export interface CompletionResult {
    content: string;
    provider: string;
    model: string;
}

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
                : 'No AI providers are configured. Set at least one of GROQ_API_KEY, NVIDIA_API_KEY, OPENROUTER_API_KEY or GEMINI_API_KEY.'
        );
    }

    const failures: string[] = [];

    for (const p of providers) {
        const model = (opts.vision ? p.visionModel : p.model) as string;
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
                failures.push(`${p.id}(${res.status})`);
                console.warn(`[providers] ${p.label} failed ${res.status}: ${detail}`);
                // For rate-limits/server errors we fail over; for other 4xx (bad
                // model, etc.) we also move on so a single misconfig can't break the app.
                continue;
            }

            const data = await res.json();
            const content: string | undefined = data?.choices?.[0]?.message?.content;
            if (!content || !content.trim()) {
                failures.push(`${p.id}(empty)`);
                continue;
            }

            console.log(`[providers] served by ${p.label} (${model})`);
            return { content, provider: p.label, model };
        } catch (err: any) {
            failures.push(`${p.id}(${err?.message || 'network'})`);
            console.warn(`[providers] ${p.label} threw: ${err?.message}`);
            continue;
        }
    }

    throw new Error(`All AI providers are unavailable or rate-limited [${failures.join(', ')}]`);
}
