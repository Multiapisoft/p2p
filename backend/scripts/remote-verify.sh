#!/bin/bash
set -e
docker cp /tmp/verify-wd-fee-ledger.mjs p2p-backend:/app/scripts/verify-wd-fee-ledger.mjs
docker exec p2p-backend node scripts/verify-wd-fee-ledger.mjs WDR-1790249160632-DEDA98EF
echo '---STATUS---'
docker inspect --format '{{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' p2p-backend
echo '---NETS---'
docker inspect --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' p2p-backend
