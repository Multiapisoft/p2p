#!/bin/bash
set -e
cd /opt/apps/mix/p2p
bash backend/scripts/deploy.sh

# Wait a bit then backfill any listed WDs missing admin credit
sleep 3
docker cp backend/scripts/backfill-list-fee-to-admin.mjs p2p-backend:/app/scripts/backfill-list-fee-to-admin.mjs
echo '=== backfill ==='
docker exec p2p-backend node scripts/backfill-list-fee-to-admin.mjs

echo '=== public ==='
curl -sS -o /dev/null -w 'public:%{http_code}\n' https://dev.payment.fairplayoffical.com/api/v1/health
