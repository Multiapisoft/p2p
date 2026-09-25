#!/bin/bash
set -e
cd /opt/apps/mix/p2p
git pull --ff-only origin master || true
# keep broken orphan from coming back
docker rm -f p2p-caddy 2>/dev/null || true
docker network connect shared-db p2p-backend 2>/dev/null || true
docker network connect edge p2p-backend 2>/dev/null || true
echo -n 'nets='
docker inspect p2p-backend --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
echo
docker exec edge-caddy wget -qO- --timeout=5 http://p2p-backend:9091/api/v1/health >/dev/null
curl -sS -o /dev/null -w 'public:%{http_code}\n' --connect-timeout 10 https://dev.payment.fairplayoffical.com/api/v1/health
