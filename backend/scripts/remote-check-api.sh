#!/bin/bash
echo '=== p2p-backend status ==='
docker inspect p2p-backend --format 'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}} nets={{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>&1

echo '=== edge → backend ==='
docker exec edge-caddy wget -qO- --timeout=5 http://p2p-backend:9091/api/v1/health 2>&1 || echo EDGE_FAIL

echo
echo '=== public health ==='
code=$(curl -sS -o /tmp/p2p-h.txt -w '%{http_code}' --connect-timeout 10 https://dev.payment.fairplayoffical.com/api/v1/health || echo fail)
echo "http=$code"
head -c 400 /tmp/p2p-h.txt 2>/dev/null
echo

echo '=== recent backend logs ==='
docker logs p2p-backend --tail 25 2>&1
