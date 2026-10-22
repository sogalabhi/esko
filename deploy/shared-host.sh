#!/usr/bin/env bash
# Run BriefForge on a shared Linux host without sudo. The backend and the built frontend (which forwards /api to the
# backend) listen on local ports only; a Cloudflare quick tunnel gives the frontend a public https URL.
#
#   bash deploy/shared-host.sh start    # install what is missing, build, start everything, print the URL
#   bash deploy/shared-host.sh update   # git pull, rebuild, restart backend + frontend (the tunnel and URL stay)
#   bash deploy/shared-host.sh stop     # stop everything (the next start gets a new URL)
#   bash deploy/shared-host.sh status   # what is running, and the URL
#
# Ports: API_PORT (default 8765) and WEB_PORT (default 4765). Logs and pid files: ~/.briefforge/
set -euo pipefail

REPO_DIR=$(cd "$(dirname "$0")/.." && pwd)
STATE=${BRIEFFORGE_STATE:-$HOME/.briefforge}
API_PORT=${API_PORT:-8765}
WEB_PORT=${WEB_PORT:-4765}
BIN=$HOME/.local/bin
NODE_DIR=$HOME/.local/opt/node  # private Node, used when the system one is too old for Vite
export PATH="$NODE_DIR/bin:$BIN:$PATH" API_PORT
mkdir -p "$STATE" "$BIN"

running() { [[ -f "$STATE/$1.pid" ]] && kill -0 "$(cat "$STATE/$1.pid")" 2>/dev/null; }

stop_one() {
  if running "$1"; then
    kill "$(cat "$STATE/$1.pid")" && echo "stopped $1"
    for _ in $(seq 1 20); do running "$1" || break; sleep 0.5; done
  fi
  rm -f "$STATE/$1.pid"
}

# Detached from the ssh session, all output to ~/.briefforge/<name>.log
launch() {
  local name=$1; shift
  setsid nohup "$@" </dev/null >"$STATE/$name.log" 2>&1 &
  echo $! >"$STATE/$name.pid"
}

port_free() { ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

wait_http() {
  for _ in $(seq 1 60); do curl -fsS -o /dev/null "$1" && return 0; sleep 1; done
  return 1
}

install_tools() {
  if ! command -v uv >/dev/null; then
    echo "== installing uv into $BIN"
    curl -LsSf https://astral.sh/uv/install.sh | env UV_NO_MODIFY_PATH=1 sh
  fi
  if ! command -v cloudflared >/dev/null; then
    echo "== installing cloudflared into $BIN"
    local arch
    case "$(uname -m)" in x86_64) arch=amd64 ;; aarch64 | arm64) arch=arm64 ;; *) echo "unsupported arch" >&2; exit 1 ;; esac
    curl -fsSL -o "$BIN/cloudflared" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$arch"
    chmod +x "$BIN/cloudflared"
  fi
  if ! node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)' 2>/dev/null; then
    echo "== installing Node 22 into $NODE_DIR"
    local arch file
    case "$(uname -m)" in x86_64) arch=x64 ;; aarch64 | arm64) arch=arm64 ;; *) echo "unsupported arch" >&2; exit 1 ;; esac
    file=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -oE "node-v[0-9.]+-linux-$arch\.tar\.xz" | head -1)
    rm -rf "$NODE_DIR" && mkdir -p "$NODE_DIR"
    curl -fsSL "https://nodejs.org/dist/latest-v22.x/$file" | tar -xJ --strip-components=1 -C "$NODE_DIR"
  fi
}

build() {
  [[ -f "$REPO_DIR/backend/.env" ]] || { echo "Create backend/.env first (LLM_API_KEY=...)" >&2; exit 1; }
  echo "== backend dependencies"
  (cd "$REPO_DIR/backend" && uv sync --frozen)
  echo "== frontend build"
  (cd "$REPO_DIR/frontend" && npm ci --no-audit --no-fund && npm run build)
}

start_app() {
  for p in "$API_PORT" "$WEB_PORT"; do
    port_free "$p" || { echo "port $p is in use; pick another with API_PORT=/WEB_PORT=" >&2; exit 1; }
  done
  echo "== backend on 127.0.0.1:$API_PORT"
  # One worker: the project state lives in files under backend/data, so a second worker could race on it.
  (cd "$REPO_DIR/backend" && launch api .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT" --workers 1)
  wait_http "http://127.0.0.1:$API_PORT/api/health" || { echo "backend did not start, see $STATE/api.log" >&2; exit 1; }
  echo "== frontend on 127.0.0.1:$WEB_PORT"
  (cd "$REPO_DIR/frontend" && launch web node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port "$WEB_PORT" --strictPort)
  wait_http "http://127.0.0.1:$WEB_PORT/" || { echo "frontend did not start, see $STATE/web.log" >&2; exit 1; }
  curl -fsS -o /dev/null "http://127.0.0.1:$WEB_PORT/api/health" || { echo "frontend cannot reach the backend" >&2; exit 1; }
}

url() { grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$STATE/tunnel.log" 2>/dev/null | head -1; }

start_tunnel() {
  if running tunnel; then return; fi
  echo "== cloudflare tunnel"
  launch tunnel cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$WEB_PORT"
  for _ in $(seq 1 30); do [[ -n "$(url)" ]] && break; sleep 1; done
  [[ -n "$(url)" ]] || { echo "no tunnel URL, see $STATE/tunnel.log" >&2; exit 1; }
}

status() {
  for n in api web tunnel; do
    if running "$n"; then echo "$n: running (pid $(cat "$STATE/$n.pid"))"; else echo "$n: stopped"; fi
  done
  running tunnel && echo "URL: $(url)"
  return 0
}

case "${1:-}" in
  start)
    install_tools
    build
    stop_one web; stop_one api
    start_app
    start_tunnel
    status
    ;;
  update)
    (cd "$REPO_DIR" && git pull --ff-only)
    build
    stop_one web; stop_one api
    start_app
    start_tunnel
    status
    ;;
  stop)
    stop_one tunnel; stop_one web; stop_one api
    ;;
  status)
    status
    ;;
  *)
    sed -n 2,11p "$0"
    exit 1
    ;;
esac
