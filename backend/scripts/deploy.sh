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

# edge-caddy routes dev.payment.fairplayoffical.com → p2p-backend:9091.
# Compose lists these external nets, but a manual recreate can drop them — enforce after up.
ensure_net() {
  local net="$1"
  docker network inspect "$net" >/dev/null 2>&1 || {
    echo "ERROR: docker network '$net' missing"
    exit 1
  }
  docker network connect "$net" p2p-backend 2>/dev/null || true
}

echo "==> ensure shared-db + edge networks"
ensure_net shared-db
ensure_net edge

echo "==> networks on p2p-backend"
docker inspect p2p-backend --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'

echo "==> smoke: edge → backend health"
docker exec edge-caddy wget -qO- --timeout=5 http://p2p-backend:9091/api/v1/health
echo

echo "==> status"
docker compose ps
