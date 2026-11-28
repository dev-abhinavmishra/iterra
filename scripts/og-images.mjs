/* og-images.mjs — generates 1200×630 Open Graph share cards into
   shell/public/og/. Cards are screenshot-based and atlas-styled: deep-green
   sky, gold hairline frame, Newsreader display type, IBM Plex Mono labels,
   and the tool's real UI shot in a framed plate.

   Run: node scripts/og-images.mjs
   Requires playwright-core + a Chromium binary (same discovery as
   prerender.mjs). Output is committed to the repo so builds never depend
   on a browser. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLS } from './seo-pages.mjs';
import { GUIDES } from './seo-guides-data.mjs';
import { COMPARE_PAGES } from './seo-compare-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'shell', 'public');
const OUT_DIR = path.join(PUBLIC_DIR, 'og');
const PORT = 8977 + (process.pid % 300);

const MIME = {
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.woff2': 'font/woff2', '.html': 'text/html',
};

function serve(root) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      try {
        const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let file = path.join(root, url);
        if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
        if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
      } catch (e) { res.writeHead(500); res.end(String(e)); }
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
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;
  const caches = [
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.cache/ms-playwright'),
  ];
  for (const dir of caches) {
    try {
      const hits = fs.readdirSync(dir).filter((d) => d.startsWith('chromium-')).sort().reverse();
      for (const h of hits) {
        for (const rel of ['chrome-win64/chrome.exe', 'chrome-linux/chrome']) {
          const p = path.join(dir, h, rel);
          if (fs.existsSync(p)) return p;
        }
      }
    } catch { /* no cache */ }
  }
  return null;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripEm = (s) => s.replace(/<\/?em>/g, '');
const stripEmHtml = (s) => s.replace(/<em>(.*?)<\/em>/g, '<em class="acc">$1</em>');

function cardHtml({ kicker, title, dek, shot, shotAlt }, base) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{font-family:Newsreader,Georgia,serif;background:radial-gradient(ellipse at 72% 30%,#315c40 0%,#183e2c 34%,#102f24 62%,#0b231a 100%);color:#f6efda;position:relative;isolation:isolate}
body::before{content:"";position:absolute;inset:0;opacity:.3;background-image:linear-gradient(#89b0a01f 1px,transparent 1px),linear-gradient(90deg,#89b0a01f 1px,transparent 1px);background-size:56px 56px;mask-image:linear-gradient(120deg,transparent,#000 70%)}
body::after{content:"";position:absolute;inset:26px;border:1px solid #d7bf8442;background:linear-gradient(#ddc690,#ddc690) left top/25px 1px,linear-gradient(#ddc690,#ddc690) left top/1px 25px,linear-gradient(#ddc690,#ddc690) right bottom/25px 1px,linear-gradient(#ddc690,#ddc690) right bottom/1px 25px;background-repeat:no-repeat}
.wrap{position:relative;display:flex;height:100%;padding:64px 72px;gap:48px}
.left{flex:1;display:flex;flex-direction:column;min-width:0}
.brand{display:flex;align-items:center;gap:12px;font:500 30px/1 Georgia,serif;letter-spacing:-.03em;color:#f6efda}
.emblem{display:grid;grid-template:repeat(2,9px)/repeat(2,9px);gap:3px;transform:rotate(45deg)}
.emblem i{background:#a1d2a1;box-shadow:inset 1px 1px #d4eac1}
.emblem i:nth-child(2){background:#dfd6a0}.emblem i:nth-child(3){background:#65a582}
.kicker{margin-top:auto;font-family:'IBM Plex Mono',monospace;font-size:15px;letter-spacing:.2em;text-transform:uppercase;color:#e2b86e}
h1{font-weight:450;letter-spacing:-.045em;font-size:64px;line-height:1.06;margin:.55rem 0 1rem;max-width:16ch}
h1 em.acc{color:#c8e8a5;font-style:italic;font-weight:400}
.dek{color:#d2dfd3;font-size:21px;line-height:1.55;max-width:52ch}
.shot{width:430px;flex:none;display:flex;flex-direction:column;justify-content:center}
.frame{border:1px solid #d9c89780;border-radius:14px;overflow:hidden;background:#102f24;box-shadow:0 30px 60px -30px rgba(0,0,0,.6),0 1px 0 #fff8 inset}
.frame img{display:block;width:100%;height:auto}
.cap{display:flex;justify-content:space-between;gap:1rem;margin-top:14px;color:#cbbd95;font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.domain{margin-top:auto;padding-top:24px;font-family:'IBM Plex Mono',monospace;font-size:14px;letter-spacing:.14em;color:#9db3a4;text-transform:uppercase}
</style></head><body><div class="wrap">
<div class="left">
<div class="brand"><span class="emblem"><i></i><i></i><i></i><i></i></span>Iterra</div>
<div class="kicker">${esc(kicker)}</div>
<h1>${stripEmHtml(title)}</h1>
<p class="dek">${esc(dek)}</p>
<div class="domain">iterrapp.vercel.app</div>
</div>
<div class="shot">
<div class="frame"><img src="${base}${shot}" alt="${esc(shotAlt || '')}"></div>
<div class="cap"><span>Iterra · Local-first study terrain</span><span>Free · no account</span></div>
</div>
</div></body></html>`;
}

const CARDS = [
  {
    file: 'home.png',
    kicker: 'Iterra — All-in-One Study Workspace',
    title: 'Nine tools. <em>One study workspace.</em>',
    dek: 'Plan the week, review the cards, write the notes, run the timer, work the math — all local-first, all connected.',
    shot: '/shots/today.webp',
    alt: 'The Iterra Today workspace',
  },
  {
    file: 'tools.png',
    kicker: 'Iterra Study Tools',
    title: 'The terrain, <em>tool by tool</em>',
    dek: 'Planner, flashcards, linked notes, pomodoro timer, math workbench, attendance, grading, and study materials — one local-first workspace.',
    shot: '/shots/today.webp',
    alt: 'Iterra study tools',
  },
  {
    file: 'guides.png',
    kicker: 'Iterra Guides',
    title: 'Study better, <em>with evidence</em>',
    dek: 'Research-backed guides to studying better — planning, memory, focus, and the tools that make it stick.',
    shot: '/atlas/terrain-0.webp',
    alt: 'Iterra atlas terrain',
  },
  {
    file: 'compare.png',
    kicker: 'Iterra — Honest Comparisons',
    title: 'Iterra vs the field, <em>honestly</em>',
    dek: 'Head-to-head comparisons with the study tools students actually use — where each wins, and who should pick which.',
    shot: '/shots/today.webp',
    alt: 'Iterra comparison pages',
  },
  {
    file: 'alternatives.png',
    kicker: 'Iterra — Alternatives',
    title: 'Outgrew the <em>app?</em>',
    dek: 'Honest alternatives to Quizlet, Notion, Anki and StudySmarter — compared on price, privacy, and offline use.',
    shot: '/shots/today.webp',
    alt: 'Iterra alternatives guide',
  },
  ...TOOLS.map((t) => ({
    file: `tool-${t.id}.png`,
    kicker: `${t.kicker} · Iterra`,
    title: t.name,
    dek: t.lede.split('.')[0] + '.',
    shot: `/shots/${t.id}.webp`,
    alt: `${t.name} inside Iterra`,
  })),
  ...COMPARE_PAGES.map((p) => ({
    file: `${p.section}-${p.slug}.png`,
    kicker: `Iterra · ${p.kicker}`,
    title: stripEm(String(p.h1 || p.title || p.slug)),
    dek: (p.lede || p.description || '').split('.')[0] + '.',
    shot: '/shots/today.webp',
    alt: `${stripEm(String(p.h1 || p.slug))} — Iterra`,
  })),
  ...GUIDES.map((g) => ({
    file: `guide-${g.slug}.png`,
    kicker: `Iterra Guides · ${g.kicker}`,
    title: stripEm(g.title),
    dek: g.description.length > 150 ? g.description.slice(0, 147).replace(/\s\S*$/, '') + '…' : g.description,
    shot: `/shots/${(g.tools && g.tools[0]) || 'today'}.webp`,
    alt: `${stripEm(g.title)} — Iterra guide`,
  })),
];

(async () => {
  const { chromium } = await import('playwright-core');
  const exe = findBrowser();
  const attempts = exe ? [{ executablePath: exe }] : [{ channel: 'chrome' }, { channel: 'msedge' }, {}];
  let browser = null;
  for (const opts of attempts) {
    try { browser = await chromium.launch({ headless: true, ...opts }); break; } catch { /* next */ }
  }
  if (!browser) { console.error('og-images: no browser available'); process.exit(1); }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const srv = await serve(PUBLIC_DIR);
  const base = `http://127.0.0.1:${PORT}`;
  try {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
    for (const c of CARDS) {
      await page.setContent(cardHtml(c, base), { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      const out = path.join(OUT_DIR, c.file);
      await page.screenshot({ path: out, type: 'png' });
      console.log(`og: ${c.file} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
    }
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`og-images: wrote ${CARDS.length} cards → shell/public/og/`);
})();
