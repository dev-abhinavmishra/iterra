#!/usr/bin/env bash
# Copy the canonical hub into each app's public dir (+ flashcards' flat dir).
# One file, one truth — run after editing packages/hub/iterra-hub.js.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=packages/hub/iterra-hub.js
for app in rhythm proof syllabus gradestack timer ink margin; do
  mkdir -p "apps/$app/public"
  cp "$SRC" "apps/$app/public/iterra-hub.js"
done
cp "$SRC" "apps/flashcards/iterra-hub.js"
# the shell serves /iterra-hub.js in dev from its own public dir (prod gets
# it from build.sh's dist-root copy) — same one-file-one-truth rule
mkdir -p shell/public
cp "$SRC" shell/public/iterra-hub.js
echo "hub synced to 9 places"
