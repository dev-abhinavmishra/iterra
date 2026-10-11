#!/usr/bin/env bash
# Build the whole terrain: each place keeps its own toolchain and dist,
# the shell caps it. Output: dist/ with /apps/<name>/ per place.
set -euo pipefail
cd "$(dirname "$0")/.."

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
   apps/flashcards/iterra-hub.js apps/flashcards/favicon.png dist/apps/flashcards/

echo "── building shell"
(cd shell && npm ci --no-audit --no-fund --silent && npm run build)
cp -r shell/dist/. dist/

echo "── terrain built → dist/"
