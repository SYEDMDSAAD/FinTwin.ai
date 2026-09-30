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
# While this runs the machine is kept from sleeping, lid closed included. It
# checks itself every minute: after an internet drop it opens a new tunnel and
# points the backend at it (about 2–3 minutes, the site briefly unreachable
# while the backend restarts). When it stops, the app shows the copilot as
# offline and the other AI features fall back to calculated figures.
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
OLLAMA_PID="" AI_PID="" TUN_PID="" URL="" HOST=""
log() { echo "[$(date '+%H:%M:%S')] $*"; }

cleanup() {
    echo; log "stopping (the site's AI features fall back until this runs again)"
    for p in $TUN_PID $AI_PID $OLLAMA_PID; do kill "$p" 2>/dev/null || true; done
    wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' INT TERM

# Ollama usually runs as a system service already; start it only if it doesn't
if ! curl -s -o /dev/null --max-time 2 http://localhost:11434/api/tags; then
    log "starting ollama"
    ollama serve >"$LOGS/ollama.log" 2>&1 &
    OLLAMA_PID=$!
    for _ in $(seq 1 30); do
        curl -s -o /dev/null --max-time 2 http://localhost:11434/api/tags && break
        sleep 1
    done
fi
ollama list | grep -q "^${MODEL} " || { log "downloading $MODEL"; ollama pull "$MODEL"; }

ai_ok() { curl -s -o /dev/null --max-time 5 "http://localhost:$PORT/health"; }

start_ai() {
    [ -n "$AI_PID" ] && { kill "$AI_PID" 2>/dev/null || true; wait "$AI_PID" 2>/dev/null || true; }
    log "AI service on :$PORT"
    # The copilot's tools read the user's data back from the Azure backend
    (
        cd "$ROOT/ai-service"
        # shellcheck disable=SC1091
        . venv/bin/activate
        BACKEND_URL="https://${APP_API}.azurewebsites.net" LLM_PROVIDER=ollama \
        OLLAMA_MODEL="$MODEL" OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-30m}" \
            exec uvicorn app:app --host 127.0.0.1 --port "$PORT" --workers 1
    ) >>"$LOGS/ai-service.log" 2>&1 &
    AI_PID=$!
    for _ in $(seq 1 30); do ai_ok && return 0; sleep 1; done
    return 1
}

# Checked through public DNS: a lookup that races the new name gets cached as
# "doesn't exist" by the local resolver for a while, though the tunnel is fine
tunnel_ok() {
    [ -n "$HOST" ] || return 1
    local ip resolve=()
    ip=$(dig +short "$HOST" @1.1.1.1 2>/dev/null | grep -E '^[0-9.]+$' | head -1 || true)
    [ -n "$ip" ] && resolve=(--resolve "$HOST:443:$ip")
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${resolve[@]}" "$URL/health")" = 200 ]
}

# A quick tunnel's URL can't be kept: a new tunnel is a new URL
start_tunnel() {
    [ -n "$TUN_PID" ] && { kill "$TUN_PID" 2>/dev/null || true; wait "$TUN_PID" 2>/dev/null || true; }
    log "opening a cloudflare tunnel"
    # IPv4 to Cloudflare: over IPv6 the tunnel registered and then dropped within
    # seconds, with QUIC and HTTP/2 alike, after the home network reconnected
    cloudflared tunnel --no-autoupdate --edge-ip-version "${TUNNEL_IP_VERSION:-4}" \
        --url "http://localhost:$PORT" >"$LOGS/ai-tunnel.log" 2>&1 &
    TUN_PID=$!
    URL="" HOST=""
    for _ in $(seq 1 30); do
        URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGS/ai-tunnel.log" | head -1 || true)
        [ -n "$URL" ] && break
        sleep 1
    done
    [ -n "$URL" ] || return 1
    HOST="${URL#https://}"
    for _ in $(seq 1 30); do tunnel_ok && { log "  $URL"; return 0; }; sleep 2; done
    return 1
}

# Changing the setting restarts the backend; the site is briefly unreachable
point_backend() {
    log "pointing $APP_API at the tunnel (this restarts it)"
    az webapp config appsettings set -g "$RG" -n "$APP_API" \
        --settings AI_SERVICE_URL="$URL" --output none 2>/dev/null || return 1
    local api="https://${APP_API}.azurewebsites.net/actuator/health/liveness"
    sleep 20                                # let the restart begin first
    for _ in $(seq 1 60); do
        [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$api")" = 200 ] \
            && { log "  ✓ backend is up and using this machine's AI"; return 0; }
        sleep 5
    done
    log "  ! backend isn't answering yet — check: az webapp log tail -g $RG -n $APP_API"
    return 0                                # the setting is in; the backend will come
}

start_ai || { echo "AI service didn't start — see $LOGS/ai-service.log"; exit 1; }

# Load the model now, so the first real question doesn't pay for it
curl -s -o /dev/null --max-time 120 http://localhost:11434/api/generate \
    -d "{\"model\":\"$MODEL\",\"prompt\":\"hi\",\"stream\":false,\"keep_alive\":\"${OLLAMA_KEEP_ALIVE:-30m}\"}" || true

until start_tunnel; do log "the tunnel didn't come up (no internet?) — retrying in 30 s"; sleep 30; done
POINTED=""
point_backend && POINTED="$URL"

cat <<READY

AI is live on the site. Keep this running; Ctrl+C stops it.
It checks itself every minute and reopens the tunnel after an internet drop.
Logs: $LOGS/ai-service.log, $LOGS/ai-tunnel.log
READY

# Supervise. cloudflared rides out short blips on its own, keeping its URL, so
# a tunnel gets two failed checks before it is replaced.
FAILS=0
while true; do
    sleep "${CHECK_EVERY:-60}"
    if ! ai_ok; then
        log "the AI service stopped answering — restarting it"
        start_ai || { log "  it didn't come back — see $LOGS/ai-service.log"; continue; }
    fi
    if kill -0 "$TUN_PID" 2>/dev/null && tunnel_ok; then
        FAILS=0
    else
        FAILS=$((FAILS + 1))
        if [ "$FAILS" -ge 2 ]; then
            log "the tunnel is down — opening a new one"
            if start_tunnel; then FAILS=0; else log "  no tunnel yet (no internet?) — trying again next check"; fi
        else
            log "the tunnel didn't answer — checking again in a minute"
        fi
    fi
    # Also retries a pointing that failed while the internet was out
    if [ "$FAILS" = 0 ] && [ "$POINTED" != "$URL" ]; then
        point_backend && POINTED="$URL"
    fi
done
