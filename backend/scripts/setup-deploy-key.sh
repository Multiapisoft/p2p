#!/usr/bin/env bash
set -euo pipefail

mkdir -p ~/.ssh
chmod 700 ~/.ssh

if [[ ! -f ~/.ssh/github_deploy ]]; then
  ssh-keygen -t ed25519 -a 100 -C "deploy@vmi2711602-p2p" -f ~/.ssh/github_deploy -N ""
fi

cat > ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF

chmod 600 ~/.ssh/config ~/.ssh/github_deploy
chmod 644 ~/.ssh/github_deploy.pub
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null || true

echo "=== DEPLOY PUBLIC KEY ==="
cat ~/.ssh/github_deploy.pub
