#!/bin/bash
# Installs what Cortex needs so tests, typecheck and the dev server work the
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

# The app reads its passcodes and database location from .env. Without one,
# every page redirects to a login nobody can get through.
if [ ! -f .env ]; then
  echo "no .env — writing development defaults"
  cp .env.example .env
fi

# With DATABASE_URL empty the app uses PGlite in ./.pglite, so there is no
# database server to start. Seeding only writes when the database is empty.
npm run seed
