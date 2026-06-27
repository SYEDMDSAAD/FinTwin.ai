#!/bin/bash
# Starts all FinTwin.ai dev services in a single tmux session.
# Falls back to background processes with log files if tmux is not installed.
#
# Usage: ./dev.sh [--no-tunnels]
#   --no-tunnels  Skip ngrok and cloudflared (useful when tunnels aren't needed)

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
TUNNELS=true

for arg in "$@"; do
  [[ "$arg" == "--no-tunnels" ]] && TUNNELS=false
done

# ── tmux path ────────────────────────────────────────────────────────────────
if command -v tmux &>/dev/null; then
  SESSION="fintwin-dev"

  # Kill any stale session
  tmux kill-session -t "$SESSION" 2>/dev/null || true

  tmux new-session -d -s "$SESSION" -n "identity"   -x 220 -y 50

  # identity-service
  tmux send-keys -t "$SESSION:identity" \
    "cd '$ROOT/identity-service' && set -a && source '$ROOT/backend/.env' && set +a && mvn spring-boot:run" Enter

  # backend
  tmux new-window -t "$SESSION" -n "backend"
  tmux send-keys -t "$SESSION:backend" \
    "cd '$ROOT/backend' && ./run.sh" Enter

  # ai-service
  tmux new-window -t "$SESSION" -n "ai"
  tmux send-keys -t "$SESSION:ai" \
    "cd '$ROOT/ai-service' && source venv/bin/activate && uvicorn app:app --reload" Enter

  # frontend
  tmux new-window -t "$SESSION" -n "frontend"
  tmux send-keys -t "$SESSION:frontend" \
    "cd '$ROOT/frontend' && npm run dev" Enter

  if $TUNNELS; then
    # ngrok (frontend tunnel)
    tmux new-window -t "$SESSION" -n "ngrok"
    tmux send-keys -t "$SESSION:ngrok" \
      "ngrok http 5173 --domain=shout-strongly-naturist.ngrok-free.dev" Enter

    # cloudflared (backend tunnel)
    tmux new-window -t "$SESSION" -n "cloudflared"
    tmux send-keys -t "$SESSION:cloudflared" \
      "cloudflared tunnel --url http://localhost:8080" Enter
  fi

  # Focus the backend window on attach
  tmux select-window -t "$SESSION:backend"
  tmux attach-session -t "$SESSION"

# ── fallback: background processes with log files ────────────────────────────
else
  echo "tmux not found — running services in background. Logs in $ROOT/logs/"
  mkdir -p "$ROOT/logs"

  (cd "$ROOT/identity-service" && set -a && source "$ROOT/backend/.env" && set +a \
    && mvn spring-boot:run) >"$ROOT/logs/identity.log" 2>&1 &

  (cd "$ROOT/backend" && ./run.sh) >"$ROOT/logs/backend.log" 2>&1 &

  (cd "$ROOT/ai-service" && source venv/bin/activate \
    && uvicorn app:app --reload) >"$ROOT/logs/ai.log" 2>&1 &

  (cd "$ROOT/frontend" && npm run dev) >"$ROOT/logs/frontend.log" 2>&1 &

  if $TUNNELS; then
    ngrok http 5173 --domain=shout-strongly-naturist.ngrok-free.dev \
      >"$ROOT/logs/ngrok.log" 2>&1 &
    cloudflared tunnel --url http://localhost:8080 \
      >"$ROOT/logs/cloudflared.log" 2>&1 &
  fi

  echo "All services started. PIDs:"
  jobs -l

  echo ""
  echo "Tail all logs:  tail -f $ROOT/logs/*.log"
  echo "Stop all:       kill \$(jobs -p)"

  # Keep the script alive so Ctrl-C kills all background children
  trap 'echo "Stopping all services..."; kill $(jobs -p) 2>/dev/null; exit 0' INT TERM
  wait
fi
