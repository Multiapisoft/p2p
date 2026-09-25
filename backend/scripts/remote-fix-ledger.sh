#!/bin/bash
set -e
cd /opt/apps/mix/p2p

docker network connect shared-db p2p-backend 2>/dev/null || true
docker network connect edge p2p-backend 2>/dev/null || true

docker cp /tmp/cleanup-relink-ledger.mjs p2p-backend:/app/scripts/cleanup-relink-ledger.mjs
docker cp /tmp/verify-wd-fee-ledger.mjs p2p-backend:/app/scripts/verify-wd-fee-ledger.mjs

echo '=== cleanup ==='
docker exec p2p-backend node scripts/cleanup-relink-ledger.mjs

echo '=== verify ==='
docker exec p2p-backend node scripts/verify-wd-fee-ledger.mjs WDR-1790249160632-DEDA98EF

echo '=== public ==='
curl -sS -o /dev/null -w 'public:%{http_code}\n' https://dev.payment.fairplayoffical.com/api/v1/health
