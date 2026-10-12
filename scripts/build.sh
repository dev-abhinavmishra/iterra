#!/usr/bin/env bash
# Build the whole terrain: each place keeps its own toolchain and dist,
# the shell caps it. Output: dist/ with /apps/<name>/ per place.
set -euo pipefail
cd "$(dirname "$0")/.."

# every app must carry its one adapter file — docs/ADAPTER.md
node scripts/check-adapters.mjs

rm -rf dist
mkdir -p dist/apps

VITE_APPS=(rhythm proof syllabus gradestack timer ink margin)
for app in "${VITE_APPS[@]}"; do
  echo "── building $app"
  (cd "apps/$app" && npm ci --no-audit --no-fund --silent && npm run build)
  cp -r "apps/$app/dist" "dist/apps/$app"
done

# flashcards is build-free — flat static files
echo "── copying flashcards"
mkdir -p dist/apps/flashcards
cp apps/flashcards/index.html apps/flashcards/app.js apps/flashcards/styles.css \
   apps/flashcards/iterra-hub.js apps/flashcards/iterra-adapter.js apps/flashcards/favicon.png dist/apps/flashcards/

echo "── building shell"
(cd shell && npm ci --no-audit --no-fund --silent && npm run build)
cp -r shell/dist/. dist/

# the hub must also exist at the root — every app's index.html loads
# '/iterra-hub.js' absolute, which resolves outside its /apps/<name>/ dir
cp packages/hub/iterra-hub.js dist/iterra-hub.js

# ...and each app ALSO serves its own vendored copy (public/iterra-hub.js
# baked into its dist at build time). Refresh them all from the canonical
# file so a sync:hub run between builds can't leave stale hubs framed.
for d in dist/apps/*/; do
  [ -f "${d}iterra-hub.js" ] && cp packages/hub/iterra-hub.js "${d}iterra-hub.js"
done

echo "── terrain built → dist/"
