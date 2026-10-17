#!/bin/bash
# Build with the GitHub Pages base and publish to the gh-pages branch (a build-artifact branch, replaced on every deploy).
# Local dist/ (used by the preview server and tests) is left untouched.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=/tmp/dist-pages
npx tsc -b
PAGES_BASE=/world-listens/ npx vite build --outDir "$OUT" --emptyOutDir
touch "$OUT/.nojekyll"
SHA=$(git rev-parse --short HEAD)
cd "$OUT"
rm -rf .git && git init -q -b gh-pages
git add -A && git -c user.name=grokbot -c user.email=bot@local commit -qm "Deploy $SHA"
git push -f https://github.com/linekingM/world-listens.git gh-pages 2>&1 | tail -2
