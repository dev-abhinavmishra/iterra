#!/usr/bin/env node
/* Margin's vite dev server (devApiPlugin in vite.config.ts) serves the
   serverless handlers from apps/margin/api/ — a hand-maintained copy of the
   root api/ tree that Vercel actually deploys. Any drift means dev and
   production run different quota/auth/validation logic. Fail the build when
   the copies diverge. Test files (*.test.ts) live only at the root. */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(root, 'api');
const COPY = join(root, 'apps', 'margin', 'api');

let fail = 0;
const files = readdirSync(API).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
for (const f of files) {
    const src = join(API, f);
    const dst = join(COPY, f);
    if (!existsSync(dst)) {
        console.error(`[check-api-parity] MISSING apps/margin/api/${f}`);
        fail++;
        continue;
    }
    if (readFileSync(src, 'utf8') !== readFileSync(dst, 'utf8')) {
        console.error(`[check-api-parity] DIFF api/${f} ≠ apps/margin/api/${f}`);
        fail++;
    }
}
for (const f of readdirSync(COPY).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
    if (!files.includes(f)) {
        console.error(`[check-api-parity] EXTRA apps/margin/api/${f} has no api/ counterpart`);
        fail++;
    }
}
if (fail) {
    console.error(`[check-api-parity] ${fail} problem(s) — copy api/*.ts into apps/margin/api/ (dev server serves the copy)`);
    process.exit(1);
}
console.log(`[check-api-parity] ${files.length} api files identical in both trees`);
