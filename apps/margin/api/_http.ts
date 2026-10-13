// Shared helpers for the serverless handlers.
// Files prefixed with "_" are treated as private modules by Vercel (not routed
// as functions), so this is safe to import from the real endpoints.

/**
 * Read the JSON body defensively. Across runtimes (Vercel @vercel/node, our Vite
 * dev shim, etc.) req.body may arrive parsed, as a raw string, or undefined.
 * Never throws — returns {} when there's nothing usable.
 */
export const readJsonBody = (req: any): any => {
    const b = req?.body;
    if (b == null) return {};
    if (typeof b === 'string') {
        try {
            /* A body that parses to null/undefined ('null') still isn't an
               object — callers index it unconditionally, so collapse it to {}
               like every other unusable body. */
            return JSON.parse(b) ?? {};
        } catch {
            return {};
        }
    }
    return b;
};
