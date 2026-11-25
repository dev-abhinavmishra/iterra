/* prerender.mjs — post-build SEO pass over dist/.

   1. Emits the static marketing pages + sitemap (pure Node, always runs).
   2. Snapshots the rendered landing page into dist/index.html using a
      headless Chromium, so crawlers see real content instead of an empty
      #root. If no browser is available (e.g. a bare CI image) the SPA
      shell stays as-is — the page still carries full meta/OG/JSON-LD.

   Usage: node scripts/prerender.mjs [distDir]   (default: ./dist) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeSeoPages } from './seo-pages.mjs';

const DIST = path.resolve(process.argv[2] || 'dist');
const SITE = 'https://iterrapp.vercel.app';
const PORT = 8901 + (process.pid % 500);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

function serve(root) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      try {
        const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let file = path.join(root, url);
        if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
        if (!fs.existsSync(file)) {
          // SPA fallback, mirroring vercel.json
          file = path.join(root, 'index.html');
        }
        const ext = path.extname(file).toLowerCase();
        res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
      } catch (e) {
        res.writeHead(500); res.end(String(e));
      }
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Users/pmsma/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;
  // newest playwright chromium in the cache, any platform
  const cache = path.join(process.env.HOME || process.env.USERPROFILE || '', '.cache/ms-playwright');
  const winCache = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  for (const dir of [winCache, cache]) {
    try {
      const hits = fs.readdirSync(dir).filter((d) => d.startsWith('chromium-')).sort().reverse();
      for (const h of hits) {
        for (const rel of ['chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
          const p = path.join(dir, h, rel);
          if (fs.existsSync(p)) return p;
        }
      }
    } catch { /* no cache dir */ }
  }
  return null;
}

async function snapshotLanding(base) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.log('prerender: playwright-core not installed — skipping landing snapshot');
    return;
  }
  const exe = findBrowser();
  // executablePath when we found a binary; otherwise let playwright try a
  // system Chrome/Edge channel (CI images often ship one off-PATH).
  const attempts = exe
    ? [{ executablePath: exe }]
    : [{ channel: 'chrome' }, { channel: 'msedge' }, {}];
  const tryLaunch = async () => {
    for (const opts of attempts) {
      try {
        return await chromium.launch({ headless: true, ...opts });
      } catch { /* try the next */ }
    }
    return null;
  };
  let browser = await tryLaunch();
  if (!browser) {
    // CI images usually lack a browser — install playwright's chromium once
    // and retry. Failure is non-fatal: the SPA shell still ships full meta.
    const require = createRequire(import.meta.url);
    let cli = null;
    try {
      // package.json is exported even when ./cli.js is not
      cli = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'cli.js');
    } catch {
      try { cli = require.resolve('playwright-core/cli.js'); } catch { /* give up below */ }
    }
    if (!cli || !fs.existsSync(cli)) {
      console.log('prerender: playwright cli not resolvable — skipping landing snapshot');
      return;
    }
    try {
      console.log('prerender: installing playwright chromium…');
      execFileSync(process.execPath, [cli, 'install', 'chromium'], {
        stdio: 'inherit',
        timeout: 300000,
      });
      browser = await tryLaunch();
      if (!browser) {
        // Browser downloaded but system libs may be missing — try deps once.
        console.log('prerender: chromium present but will not launch — installing deps…');
        execFileSync(process.execPath, [cli, 'install-deps', 'chromium'], {
          stdio: 'inherit',
          timeout: 300000,
        });
        browser = await tryLaunch();
      }
    } catch (e) {
      console.log(`prerender: browser install failed (${String(e).split('\n')[0]})`);
    }
  }
  if (!browser) {
    console.log('prerender: no usable browser — skipping landing snapshot');
    return;
  }
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    await page.goto(`${base}/`, { waitUntil: 'load', timeout: 60000 });
    // wait for the landing hero, then settle fonts/lazy chunks/animations
    await page.waitForSelector('.atlas-hero, main, #root > *', { timeout: 30000 });
    await page.waitForTimeout(4500);
    let html = await page.content();

    // The SPA will hydrate over this snapshot on load. Keep the
    // iterra-build-id meta — the service worker validates it before
    // caching navigations for offline use.
    html = html.replace(/ data-moving="(?:true|false)"/, '');

    // Make sure crawlers get absolute social URLs even if the source
    // index.html drifts — idempotent: only inject what's missing.
    const head = [];
    if (!html.includes('rel="canonical"')) head.push(`<link rel="canonical" href="${SITE}/" />`);
    if (!html.includes('application/ld+json')) {
      head.push(`<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Iterra","url":"${SITE}/"}</script>`);
    }
    if (head.length) html = html.replace('</head>', `${head.join('\n')}\n</head>`);

    fs.writeFileSync(path.join(DIST, 'index.html'), html);
    console.log('prerender: landing snapshot written → dist/index.html');
  } finally {
    await browser.close();
  }
}

(async () => {
  if (!fs.existsSync(DIST)) {
    console.log('prerender: dist/ not found — run npm run build first');
    process.exit(1);
  }
  writeSeoPages(DIST);

  const srv = await serve(DIST);
  try {
    await snapshotLanding(`http://127.0.0.1:${PORT}`);
  } finally {
    srv.close();
  }
  console.log('prerender: done');
})();
