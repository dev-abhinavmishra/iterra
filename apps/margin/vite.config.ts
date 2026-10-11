import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only plugin: serve the Vercel-style serverless functions in /api during
// `vite dev`, so the whole app runs locally with a single `npm run dev`.
function devApiPlugin(): Plugin {
    return {
        name: 'dev-api-routes',
        apply: 'serve',
        configureServer(server: ViteDevServer) {
            server.middlewares.use(async (req, res, next) => {
                const url = req.url || '';
                if (!url.startsWith('/api/')) return next();

                const route = url.split('?')[0].replace(/\/$/, '');
                const fileBase = path.join(process.cwd(), route);
                const candidate = ['.ts', '.js', '.mjs'].map(ext => fileBase + ext).find(f => fs.existsSync(f));
                if (!candidate) return next();

                // Collect the request body and parse JSON.
                const chunks: Buffer[] = [];
                req.on('data', (c: Buffer) => chunks.push(c));
                req.on('end', async () => {
                    let body: any = undefined;
                    if (chunks.length) {
                        const raw = Buffer.concat(chunks).toString('utf8');
                        try { body = JSON.parse(raw); } catch { body = raw; }
                    }

                    // Minimal Vercel-style res shim over the Node response.
                    const resShim: any = {
                        statusCode: 200,
                        status(code: number) { this.statusCode = code; return this; },
                        setHeader(k: string, v: string) { res.setHeader(k, v); return this; },
                        json(obj: any) {
                            res.statusCode = this.statusCode;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify(obj));
                        },
                        send(data: any) { res.statusCode = this.statusCode; res.end(data); },
                        end(data?: any) { res.statusCode = this.statusCode; res.end(data); },
                    };
                    const reqShim: any = {
                        method: req.method,
                        headers: req.headers,
                        body,
                        query: Object.fromEntries(new URL(url, 'http://localhost').searchParams),
                    };

                    try {
                        const mod = await server.ssrLoadModule(candidate);
                        await mod.default(reqShim, resShim);
                    } catch (err: any) {
                        console.error(`[dev-api] ${route} error:`, err);
                        res.statusCode = 500;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: err?.message || 'Internal Server Error' }));
                    }
                });
            });
        },
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // Expose provider/Supabase keys to the dev API handlers via process.env.
    for (const key of [
        'GROQ_API_KEY', 'GROQ_MODEL', 'GROQ_VISION_MODEL', 'GROQ_WHISPER_MODEL',
        'NVIDIA_API_KEY', 'NVIDIA_MODEL', 'NVIDIA_VISION_MODEL',
        'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENROUTER_VISION_MODEL',
        'GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_VISION_MODEL',
        'SUPABASE_URL', 'SUPABASE_KEY', 'DAILY_FREE_LIMIT',
    ]) {
        if (env[key]) process.env[key] = env[key];
    }

    return {
        server: {
            port: 3000,
            host: '0.0.0.0',
        },
        plugins: [react(), devApiPlugin()],
        define: {
            // Gemini Live (client-side WebSocket) still reads this if a working key is set.
            'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
            // Browser Supabase client (anonymous auth). Publishable key only — safe to expose.
            'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL),
            'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY),
            // hCaptcha site key (public).
            'process.env.HCAPTCHA_SITE_KEY': JSON.stringify(env.HCAPTCHA_SITE_KEY),
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            },
        },
    };
});
