#!/usr/bin/env bash
set -euo pipefail

# backend/scripts/deploy.sh → repo root is ../..
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND_ROOT="$REPO_ROOT/backend"

cd "$REPO_ROOT"

echo "==> git pull"
git pull --ff-only origin master

cd "$BACKEND_ROOT"

if [[ ! -f .env.production ]]; then
  echo "Missing backend/.env.production on server — aborting."
  exit 1
fi

echo "==> docker compose up --build"
docker compose up -d --build

echo "==> status"
docker compose ps
