#!/bin/bash
for u in \
  https://dev.dashboard.fairplayoffical.com \
  https://dev.app.fairplayoffical.com \
  https://dev.paysecure247.com \
  https://dev.invespro.xyz \
  https://p2p-admin-dev.vercel.app \
  https://p2p-user-dev.vercel.app \
  https://p2p-business-dev.vercel.app \
  https://p2p-investor-dev.vercel.app
do
  code=$(curl -sS -o /dev/null -w '%{http_code}' -L --max-time 25 "$u" || echo ERR)
  echo "$code  $u"
done
