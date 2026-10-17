#!/usr/bin/env node
/* Fails the build when an app is missing its iterra adapter or the adapter
   doesn't call iterra.adapter() with its own name. One adapter per app —
   see docs/ADAPTER.md. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* the live tree is shell/src/apps — the top-level apps/ copies are the
   retired standalone builds and no longer gate anything */
const APPS = [
  { name: 'syllabus', file: 'shell/src/apps/syllabus/lib/iterra-adapter.ts' },
  { name: 'proof', file: 'shell/src/apps/proof/lib/iterra-adapter.ts' },
  { name: 'rhythm', file: 'shell/src/apps/rhythm/lib/iterra-adapter.ts' },
  { name: 'gradestack', file: 'shell/src/apps/gradestack/lib/iterra-adapter.ts' },
  { name: 'timer', file: 'shell/src/apps/timer/lib/iterra-adapter.ts' },
  { name: 'ink', file: 'shell/src/apps/ink/lib/iterra-adapter.ts' },
  { name: 'margin', file: 'shell/src/apps/margin/iterra-adapter.ts' },
  { name: 'flashcards', file: 'shell/src/apps/flashcards/iterra-adapter.ts' },
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
  /* accept both `it.adapter({...})` and a destructured `adapter({...})` —
     the filename + per-app name check below still gate what counts */
  if (!/\badapter\s*\(\s*\{/.test(src) && !src.includes('iterra.adapter')) {
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
