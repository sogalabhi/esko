#!/usr/bin/env bash
# First-time setup on a fresh Ubuntu 24.04 VM (Oracle A1, ARM64). Run once, from the repo checkout:
#   bash deploy/setup.sh <api-host> <email-for-letsencrypt>
# <api-host> is a name pointing at this VM, e.g. 152.67.1.2.sslip.io (no domain needed) or api.example.com.
set -euo pipefail

API_HOST=${1:?usage: setup.sh <api-host> <email>}
EMAIL=${2:?usage: setup.sh <api-host> <email>}
REPO_DIR=$(cd "$(dirname "$0")/.." && pwd)

if [[ "$REPO_DIR" != /home/ubuntu/esko ]]; then
  echo "Expected the repo at /home/ubuntu/esko (the systemd unit points there), found $REPO_DIR" >&2
  exit 1
fi
if [[ ! -f "$REPO_DIR/backend/.env" ]]; then
  echo "Create backend/.env first (LLM_API_KEY=...), see deploy/README.md" >&2
  exit 1
fi

echo "== packages"
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx netfilter-persistent iptables-persistent

echo "== uv"
if ! command -v uv >/dev/null && [[ ! -x "$HOME/.local/bin/uv" ]]; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
UV="$HOME/.local/bin/uv"

echo "== backend dependencies"
(cd "$REPO_DIR/backend" && "$UV" sync --frozen)

echo "== firewall"
# Oracle's Ubuntu images reject everything but SSH in iptables, on top of the VCN security list.
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 6 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
done
sudo netfilter-persistent save

echo "== service"
sudo cp "$REPO_DIR/deploy/briefforge-api.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now briefforge-api

echo "== nginx"
sed "s/API_HOST/$API_HOST/" "$REPO_DIR/deploy/nginx-briefforge.conf" | sudo tee /etc/nginx/sites-available/briefforge >/dev/null
sudo ln -sf /etc/nginx/sites-available/briefforge /etc/nginx/sites-enabled/briefforge
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "== https"
sudo certbot --nginx -d "$API_HOST" -m "$EMAIL" --agree-tos --non-interactive --redirect

echo "== check"
sleep 2
curl -fsS "https://$API_HOST/api/health" && echo
echo "Done. Point frontend/vercel.json at https://$API_HOST"
