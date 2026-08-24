#!/usr/bin/env bash
set -euo pipefail

ENV_SRC="$HOME/apps/p2p-backend/.env.production"
APP_DIR="$HOME/apps/p2p"
REPO_URL="https://github.com/Multiapisoft/p2p.git"

mkdir -p "$HOME/apps"

# stop old copy-based stack if running
if [[ -f "$HOME/apps/p2p-backend/docker-compose.yml" ]]; then
  echo "==> stopping old copy-based stack"
  (cd "$HOME/apps/p2p-backend" && docker compose down) || true
fi

# preserve env
if [[ -f "$ENV_SRC" ]]; then
  cp "$ENV_SRC" /tmp/p2p.env.production.bak
  echo "==> saved .env.production"
fi

# replace with git clone
if [[ -d "$APP_DIR/.git" ]]; then
  echo "==> repo exists, pulling"
  cd "$APP_DIR"
  git fetch origin
  git checkout master
  git pull --ff-only origin master
else
  echo "==> removing old copy folder(s)"
  rm -rf "$HOME/apps/p2p-backend"
  rm -rf "$APP_DIR"
  echo "==> cloning from GitHub"
  git clone "$REPO_URL" "$APP_DIR"
fi

# restore env (never from git)
if [[ -f /tmp/p2p.env.production.bak ]]; then
  cp /tmp/p2p.env.production.bak "$APP_DIR/backend/.env.production"
  chmod 600 "$APP_DIR/backend/.env.production"
  rm -f /tmp/p2p.env.production.bak
  echo "==> restored .env.production"
fi

if [[ ! -f "$APP_DIR/backend/.env.production" ]]; then
  echo "ERROR: backend/.env.production missing"
  exit 1
fi

chmod +x "$APP_DIR/backend/scripts/deploy.sh" || true

cd "$APP_DIR/backend"
echo "==> docker compose up --build"
docker compose up -d --build
docker compose ps

echo "==> DONE — app at $APP_DIR (git-based)"
git -C "$APP_DIR" rev-parse --short HEAD
git -C "$APP_DIR" remote -v
