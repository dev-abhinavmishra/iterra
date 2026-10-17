#!/usr/bin/env bash
# Build the integrated terrain: one SPA (shell/) plus the hub script and
# serverless api/ the deployment mounts. Output: dist/ served as a single
# app — /apps/<place>/… paths boot-redirect into hash routes.
set -euo pipefail
cd "$(dirname "$0")/.."

# rm -rf the dir outright; if a Windows process has a handle on it (Explorer,
# indexer, a stale watcher), empty it in place instead — same result.
rm -rf dist 2>/dev/null || { mkdir -p dist && rm -rf dist/* dist/.[!.]* 2>/dev/null || true; }
mkdir -p dist

echo "── contract checks"
node scripts/check-adapters.mjs
node scripts/check-api-parity.mjs

echo "── building shell"
# npm ci is the hermetic path; on Windows a running dev server (or antivirus)
# can hold a .node/.exe handle and wedge ci mid-delete, leaving a broken
# node_modules. Fall back to npm install — same lockfile, heals in place.
(cd shell && { npm ci --no-audit --no-fund --silent || npm install --no-audit --no-fund; } && npm run build)
cp -r shell/dist/. dist/

# the hub must exist at the root — index.html loads '/iterra-hub.js'
cp packages/hub/iterra-hub.js dist/iterra-hub.js

echo "── terrain built → dist/"
