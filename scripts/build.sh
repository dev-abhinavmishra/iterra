#!/usr/bin/env bash
# Build the integrated terrain: one SPA (shell/) plus the hub script and
# serverless api/ the deployment mounts. Output: dist/ served as a single
# app — /apps/<place>/… paths boot-redirect into hash routes.
set -euo pipefail
cd "$(dirname "$0")/.."

# Fail before touching the existing candidate when prerequisites are absent.
if [[ ! -f shell/node_modules/typescript/bin/tsc || ! -f shell/node_modules/vite/bin/vite.js ]]; then
  echo "Shell dependencies are missing. Run: npm ci --prefix shell --no-audit --no-fund" >&2
  exit 1
fi

echo "── service-worker graph policy tests"
node --test scripts/emit-sw-manifest.test.mjs scripts/sw-runtime.test.cjs

# rm -rf the dir outright; if a Windows process has a handle on it (Explorer,
# indexer, a stale watcher), empty it in place instead — same result.
rm -rf dist 2>/dev/null || { mkdir -p dist && rm -rf dist/* dist/.[!.]* 2>/dev/null || true; }
mkdir -p dist

echo "── contract checks"
node scripts/check-adapters.mjs
node scripts/check-api-parity.mjs

# vite's esbuild strips types without checking them — a broken import can
# ship inside a "successful" build. typecheck gates that class of error.
echo "── typecheck"
(cd shell && npx tsc --noEmit -p .)

echo "── building shell"
(cd shell && npm run build)
cp -r shell/dist/. dist/

# the hub must exist at the root — index.html loads '/iterra-hub.js'
cp packages/hub/iterra-hub.js dist/iterra-hub.js

# full hashed-asset inventory plus a separate source-keyed core/tool/feature
# graph policy consumed by the selective service worker
node scripts/emit-sw-manifest.mjs

# SEO pass: static marketing pages + sitemap always; landing prerender
# snapshot when a Chromium is available (skips gracefully on bare CI).
echo "── seo prerender"
node scripts/prerender.mjs || echo "seo prerender failed — dist still valid"

echo "── terrain built → dist/"
