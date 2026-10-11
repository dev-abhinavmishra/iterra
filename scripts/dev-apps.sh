#!/usr/bin/env bash
# Start every place on its dev port (the shell proxies /apps/<name> to these).
cd "$(dirname "$0")/.."
trap 'kill 0' EXIT

(cd apps/rhythm     && npm run dev -- --port 3001) &
(cd apps/proof      && npm run dev -- --port 3002) &
(cd apps/syllabus   && npm run dev -- --port 3003) &
(cd apps/gradestack && npm run dev -- --port 3004) &
(cd apps/timer      && npm run dev -- --port 3005) &
(cd apps/ink        && npm run dev -- --port 3006) &
(cd apps/flashcards && python3 -m http.server 3007) &
(cd apps/margin     && npm run dev -- --port 3008) &

wait
