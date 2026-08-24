#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> git pull"
git pull --ff-only origin master

cd "$ROOT/backend"

if [[ ! -f .env.production ]]; then
  echo "Missing backend/.env.production on server — aborting."
  exit 1
fi

echo "==> docker compose up --build"
docker compose up -d --build

echo "==> status"
docker compose ps
