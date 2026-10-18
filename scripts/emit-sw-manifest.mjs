/* Emit dist/sw-manifest.json — the list of content-hashed assets the
   service worker precaches at install. Without it, an offline reload
   right after a deploy serves the fresh index.html but none of its new
   chunks, and the app boots to a blank page.

   Runs after the vite build has copied into dist/. */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const assets = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|woff2?|svg|png|webp)$/.test(name)) {
      assets.push('/' + p.slice(dist.length).replace(/\\/g, '/').replace(/^\/+/, ''));
    }
  }
}

walk(join(dist, 'assets'));
assets.sort();
writeFileSync(join(dist, 'sw-manifest.json'), JSON.stringify(assets));
console.log(`sw-manifest: ${assets.length} assets`);
