#!/usr/bin/env node
/* Fails the build when an app is missing its iterra adapter or the adapter
   doesn't call iterra.adapter() with its own name. One adapter per app —
   see docs/ADAPTER.md. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPS = [
  { name: 'syllabus', file: 'apps/syllabus/src/lib/iterra-adapter.ts' },
  { name: 'proof', file: 'apps/proof/src/lib/iterra-adapter.ts' },
  { name: 'rhythm', file: 'apps/rhythm/src/lib/iterra-adapter.ts' },
  { name: 'gradestack', file: 'apps/gradestack/src/lib/iterra-adapter.ts' },
  { name: 'timer', file: 'apps/timer/src/lib/iterra-adapter.ts' },
  { name: 'ink', file: 'apps/ink/src/lib/iterra-adapter.ts' },
  { name: 'margin', file: 'apps/margin/iterra-adapter.ts' },
  { name: 'flashcards', file: 'apps/flashcards/iterra-adapter.js' },
];

let fail = 0;
for (const a of APPS) {
  const p = join(root, a.file);
  if (!existsSync(p)) {
    console.error(`[check-adapters] MISSING ${a.file}`);
    fail++;
    continue;
  }
  const src = readFileSync(p, 'utf8');
  if (!/\.adapter\s*\(\s*\{/.test(src) && !src.includes('iterra.adapter')) {
    console.error(`[check-adapters] ${a.file} never calls iterra.adapter({...})`);
    fail++;
    continue;
  }
  if (!src.includes(`'${a.name}'`) && !src.includes(`"${a.name}"`)) {
    console.error(`[check-adapters] ${a.file} doesn't register name '${a.name}'`);
    fail++;
  }
}
if (fail) {
  console.error(`[check-adapters] ${fail} problem(s) — every app needs one adapter file per docs/ADAPTER.md`);
  process.exit(1);
}
console.log(`[check-adapters] ${APPS.length} adapters present`);
