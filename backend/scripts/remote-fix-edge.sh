#!/bin/bash
set -e
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  h=$(docker inspect p2p-backend --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')
  echo "health=$h"
  [ "$h" = "healthy" ] && break
  sleep 4
done
docker network connect shared-db p2p-backend 2>/dev/null || true
docker network connect edge p2p-backend 2>/dev/null || true
docker exec edge-caddy wget -qO- --timeout=5 http://p2p-backend:9091/api/v1/health
echo
curl -sS -o /dev/null -w 'public:%{http_code}\n' https://dev.payment.fairplayoffical.com/api/v1/health
