#!/usr/bin/env bash
# Serves the AI service from this machine to the Azure deployment.
#
#   az login
#   scripts/ai-local-tunnel.sh        # runs until Ctrl+C
#
# Starts qwen (Ollama) and the AI service here, opens a Cloudflare quick tunnel
# to it, and points the Azure backend at the tunnel. A quick tunnel gets a new
# random URL every time, so that last step runs on every start; changing the
# setting restarts the backend, which takes a minute or two.
#
# Why here and not on Azure: qwen2.5:3b on App Service CPUs made ~0.4 tokens/s,
# so every AI call timed out. A laptop GPU makes ~70.
#
# While this runs the machine is kept from sleeping, lid closed included. When
# it stops, the backend's circuit breaker notices within a few calls and the AI
# features fall back to their rule-based answers — the rest of the site is
# unaffected.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RG="${RG:-fintwin}"
PREFIX="${PREFIX:-fintwin}"
APP_API="${PREFIX}-api"
PORT="${AI_PORT:-8000}"
ENV_FILE="${FINTWIN_ENV_FILE:-$ROOT/.env.prod}"
LOGS="$ROOT/logs"

# Hold off sleep for as long as this runs — a sleeping laptop is a dead AI
if [ -z "${FINTWIN_INHIBITED:-}" ] && command -v systemd-inhibit >/dev/null; then
    export FINTWIN_INHIBITED=1
    exec systemd-inhibit --what=sleep:idle:handle-lid-switch \
        --who="FinTwin AI" --why="Serving the AI service to Azure" "$0" "$@"
fi

[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE"; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
for v in AI_INTERNAL_KEY METRICS_TOKEN; do
    [ -n "${!v:-}" ] || { echo "$v is missing from $ENV_FILE"; exit 1; }
done
MODEL="${OLLAMA_MODEL:-qwen2.5:3b}"

command -v cloudflared >/dev/null || { echo "cloudflared is not installed"; exit 1; }
command -v ollama      >/dev/null || { echo "ollama is not installed"; exit 1; }
az account show --output none 2>/dev/null || { echo "Not logged in to Azure — run: az login"; exit 1; }
az webapp show -g "$RG" -n "$APP_API" --output none 2>/dev/null \
    || { echo "$APP_API not found in $RG — run scripts/azure-app-service-setup.sh first"; exit 1; }
if curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/health"; then
    echo "Port $PORT is already in use (dev.sh's AI service?) — stop it or set AI_PORT"; exit 1
fi

mkdir -p "$LOGS"
PIDS=()
cleanup() {
    echo; echo "→ stopping (the site's AI features fall back until this runs again)"
    for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done
    wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' INT TERM

# Ollama usually runs as a system service already; start it only if it doesn't
if ! curl -s -o /dev/null --max-time 2 http://localhost:11434/api/tags; then
    echo "→ starting ollama"
    ollama serve >"$LOGS/ollama.log" 2>&1 &
    PIDS+=($!)
    for _ in $(seq 1 30); do
        curl -s -o /dev/null --max-time 2 http://localhost:11434/api/tags && break
        sleep 1
    done
fi
ollama list | grep -q "^${MODEL} " || { echo "→ downloading $MODEL"; ollama pull "$MODEL"; }

echo "→ AI service on :$PORT"
# The copilot's tools read the user's data back from the Azure backend
(
    cd "$ROOT/ai-service"
    # shellcheck disable=SC1091
    . venv/bin/activate
    BACKEND_URL="https://${APP_API}.azurewebsites.net" LLM_PROVIDER=ollama \
    OLLAMA_MODEL="$MODEL" OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-30m}" \
        exec uvicorn app:app --host 127.0.0.1 --port "$PORT" --workers 1
) >"$LOGS/ai-service.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 30); do
    curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/health" && break
    sleep 1
done
curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/health" \
    || { echo "AI service didn't start — see $LOGS/ai-service.log"; exit 1; }

# Load the model now, so the first real question doesn't pay for it
curl -s -o /dev/null --max-time 120 http://localhost:11434/api/generate \
    -d "{\"model\":\"$MODEL\",\"prompt\":\"hi\",\"stream\":false,\"keep_alive\":\"${OLLAMA_KEEP_ALIVE:-30m}\"}" || true

echo "→ cloudflare tunnel"
: >"$LOGS/ai-tunnel.log"
cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" >"$LOGS/ai-tunnel.log" 2>&1 &
PIDS+=($!)
URL=""
for _ in $(seq 1 30); do
    URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGS/ai-tunnel.log" | head -1 || true)
    [ -n "$URL" ] && break
    sleep 1
done
[ -n "$URL" ] || { echo "No tunnel URL — see $LOGS/ai-tunnel.log"; exit 1; }

# Checked through public DNS: a lookup that races the new name gets cached as
# "doesn't exist" by the local resolver for a while, though the tunnel is fine
HOST="${URL#https://}"
tunnel_ok() {
    local ip resolve=()
    ip=$(dig +short "$HOST" @1.1.1.1 2>/dev/null | grep -E '^[0-9.]+$' | head -1 || true)
    [ -n "$ip" ] && resolve=(--resolve "$HOST:443:$ip")
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${resolve[@]}" "$URL/health")" = 200 ]
}
for _ in $(seq 1 30); do tunnel_ok && break; sleep 2; done
tunnel_ok || { echo "The tunnel at $URL doesn't answer — see $LOGS/ai-tunnel.log"; exit 1; }
echo "  $URL"

echo "→ pointing $APP_API at the tunnel (this restarts it)"
az webapp config appsettings set -g "$RG" -n "$APP_API" \
    --settings AI_SERVICE_URL="$URL" --output none

echo "→ waiting for $APP_API to come back"
API="https://${APP_API}.azurewebsites.net/actuator/health/liveness"
sleep 20                                    # let the restart begin first
for _ in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$API")" = 200 ] && break
    sleep 5
done
if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$API")" = 200 ]; then
    echo "  ✓ backend is up and using this machine's AI"
else
    echo "  ! backend isn't answering yet — check: az webapp log tail -g $RG -n $APP_API"
fi

cat <<READY

AI is live on the site. Keep this running; Ctrl+C stops it.
Logs: $LOGS/ai-service.log, $LOGS/ai-tunnel.log
READY

# If any piece dies, stop the rest rather than leave a half-working tunnel
wait -n "${PIDS[@]}"
echo "A process exited — see the logs above."
exit 1
