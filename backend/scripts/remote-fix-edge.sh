#!/bin/bash
set -e
cd /opt/apps/mix/p2p/backend

# Sync deploy.sh if provided
[[ -f /tmp/deploy.sh ]] && cp /tmp/deploy.sh /opt/apps/mix/p2p/backend/scripts/deploy.sh && chmod +x /opt/apps/mix/p2p/backend/scripts/deploy.sh
[[ -f /tmp/docker-compose.yml ]] && cp /tmp/docker-compose.yml /opt/apps/mix/p2p/backend/docker-compose.yml

# Recreate with compose so declared nets stick
docker compose up -d --force-recreate --no-build

# Hard-ensure (covers any compose quirk)
docker network connect shared-db p2p-backend 2>/dev/null || true
docker network connect edge p2p-backend 2>/dev/null || true

echo '=== nets ==='
docker inspect p2p-backend --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'

echo '=== compose networks for backend ==='
docker compose config | sed -n '/^  backend:/,/^  [a-z]/p' | head -40

echo '=== edge → backend ==='
docker exec edge-caddy wget -qO- --timeout=5 http://p2p-backend:9091/api/v1/health
echo

code=$(curl -sS -o /tmp/p2p-h.txt -w '%{http_code}' --connect-timeout 10 https://dev.payment.fairplayoffical.com/api/v1/health)
echo "public_http=$code"
cat /tmp/p2p-h.txt
echo
