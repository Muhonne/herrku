#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export DATA_DIR="${DATA_DIR:-$PWD/.e2e-data}"
export NODE_ENV=development
export PORT="${PORT:-3111}"
export PUBLIC_URL="http://localhost:${PORT}"
export ALLOWED_ORIGINS="http://localhost:${PORT}"
export COOKIE_SECURE=false
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=admin-password-123
export LOG_LEVEL=warn

rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"

node --import tsx scripts/seed.ts --e2e
exec node server/dist/index.js
