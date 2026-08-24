#!/bin/bash
# Installs what Foundery needs so tests, typecheck and the dev server work the
# moment a Claude Code on the web session opens.
set -euo pipefail

# Local sessions already have a working checkout; this is for the web only.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# npm install rather than npm ci: the container caches after the hook runs, so
# a warm node_modules is reused instead of being rebuilt from scratch.
npm install --no-audit --no-fund

# better-sqlite3 ships a prebuilt binary, but a Node version the prebuild
# doesn't cover leaves it unloadable. Rebuild only when it actually fails.
if ! node -e "require('better-sqlite3')" 2>/dev/null; then
  echo "better-sqlite3 binding unusable for $(node -v) — rebuilding"
  npm rebuild better-sqlite3
fi

# The app reads its passcodes and DB path from .env. Without one, every page
# redirects to a login nobody can get through.
if [ ! -f .env ]; then
  echo "no .env — writing development defaults"
  cp .env.example .env
fi

# Seed only when the database is empty, so an existing one is never clobbered.
npm run seed
