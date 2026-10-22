#!/usr/bin/env bash
# Update the running backend to the latest main. Run on the VM: bash deploy/deploy.sh
# Uploaded files and the AI cache (backend/data, backend/.cache) are gitignored and survive this.
set -euo pipefail

REPO_DIR=$(cd "$(dirname "$0")/.." && pwd)
UV="$HOME/.local/bin/uv"

cd "$REPO_DIR"
git pull --ff-only
(cd backend && "$UV" sync --frozen)
sudo systemctl restart briefforge-api

for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8000/api/health >/dev/null; then
    echo "Backend is up at $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 1
done
echo "Backend did not come up; see: journalctl -u briefforge-api -n 50" >&2
exit 1
