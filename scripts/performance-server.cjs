/* Instrumented, compressed local server for performance experiments.
   Usage: node scripts/performance-server.cjs [dist-directory] [port]
   JSON lines on stdout include all HTTP requests, including service-worker
   prefetches. Keep server logs alongside each experiment's trace. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(process.argv[2] || 'dist');
const port = Number(process.argv[3] || 8090);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' };
const assets = new Map();
function prepare(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) prepare(file);
    else if (entry.isFile()) {
      const source = fs.readFileSync(file);
      const type = types[path.extname(file)] || 'application/octet-stream';
      assets.set(file, { source, type, gzip: /^(text\/|application\/json|image\/svg)/.test(type) ? zlib.gzipSync(source) : null });
    }
  }
}
prepare(root); // Immutable candidate; do all compression before listening.
http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  const requested = path.resolve(root, '.' + pathname);
  if (requested !== root && !requested.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  let file = requested;
  if (!assets.has(file) && !path.extname(pathname)) file = path.join(root, 'index.html');
  const asset = assets.get(file);
  if (!asset) { res.writeHead(404).end(); return; }
  const { source, type } = asset;
  const compress = !!asset.gzip && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const body = compress ? asset.gzip : source;
  const headers = { 'content-type': type, 'content-length': body.length, 'cache-control': 'no-cache', vary: 'Accept-Encoding' };
  if (compress) headers['content-encoding'] = 'gzip';
  const token = /(?:^|;\s*)iterra_perf_run=([^;]+)/.exec(req.headers.cookie || '')?.[1] || null;
  res.writeHead(200, headers);
  res.end(body);
  // This records the exact compressed response body size passed to res.end.
  // It is server-side write/enqueue evidence, never proof of browser receipt.
  console.log(JSON.stringify({ serverWriteEnqueuedAt: new Date().toISOString(), stage: 'server-write-enqueued', run: token, method: req.method, path: pathname, destination: req.headers['sec-fetch-dest'] || null,
    referer: req.headers.referer || null, serviceWorker: req.headers['service-worker'] || null, encodedBodyBytes: body.length, encoding: compress ? 'gzip' : null }));
}).listen(port, '127.0.0.1', () => console.log(JSON.stringify({ serving: root, port, compression: 'gzip' })));
