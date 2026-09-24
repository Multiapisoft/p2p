#!/bin/bash
set -e
cd /opt/apps/mix/p2p

git pull --ff-only origin master || true

# Ensure API reachable
docker network connect shared-db p2p-backend 2>/dev/null || true
docker network connect edge p2p-backend 2>/dev/null || true

# Copy cleanup + verify scripts
cp /tmp/cleanup-relink-ledger.mjs backend/scripts/cleanup-relink-ledger.mjs
cp /tmp/verify-wd-fee-ledger.mjs backend/scripts/verify-wd-fee-ledger.mjs

# Rebuild backend so hide filter is live
cd backend
docker compose up -d --build
docker network connect shared-db p2p-backend 2>/dev/null || true
docker network connect edge p2p-backend 2>/dev/null || true

# Wait healthy
for i in 1 2 3 4 5 6 7 8 9 10; do
  h=$(docker inspect p2p-backend --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')
  echo "health=$h"
  [[ "$h" == "healthy" ]] && break
  sleep 5
done

docker cp backend/scripts/cleanup-relink-ledger.mjs p2p-backend:/app/scripts/cleanup-relink-ledger.mjs
docker cp backend/scripts/verify-wd-fee-ledger.mjs p2p-backend:/app/scripts/verify-wd-fee-ledger.mjs

echo '=== cleanup ==='
docker exec p2p-backend node scripts/cleanup-relink-ledger.mjs

echo '=== verify ==='
docker exec p2p-backend node scripts/verify-wd-fee-ledger.mjs WDR-1790249160632-DEDA98EF

echo '=== public ==='
curl -sS -o /dev/null -w 'public:%{http_code}\n' https://dev.payment.fairplayoffical.com/api/v1/health
