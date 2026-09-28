#!/bin/sh
# Starts Ollama and the AI service in one container (Azure App Service).
# With LLM_PROVIDER=bedrock, Claude on Bedrock answers and Ollama isn't started.
#
# Order matters: the model server has to be answering before uvicorn takes
# traffic, or the first copilot question fails. The model download runs in the
# background — it is ~2 GB on a cold instance, and App Service kills a
# container that hasn't opened its port in time, so the web server must not
# wait for it. Until the pull finishes the copilot falls back to its "AI is
# unavailable" reply, which is honest and short-lived.
set -eu

MODEL="${OLLAMA_MODEL:-qwen2.5:3b}"
PORT="${PORT:-8000}"

if [ "${LLM_PROVIDER:-ollama}" = "bedrock" ]; then
    # Claude on Bedrock answers instead: no local model to start or download,
    # which leaves the plan's memory to the other apps
    echo "[start] LLM_PROVIDER=bedrock — skipping Ollama"
else
    echo "[start] ollama serve (models in ${OLLAMA_MODELS:-/home/ollama})"
    ollama serve &
    OLLAMA_PID=$!

    # Stop both halves together: App Service sends SIGTERM on restart and redeploy
    trap 'kill -TERM "$OLLAMA_PID" 2>/dev/null || true; exit 0' TERM INT

    for i in $(seq 1 60); do
        if ollama list >/dev/null 2>&1; then
            echo "[start] ollama is up after ${i}s"
            break
        fi
        sleep 1
    done

    # Pull in the background — a fresh instance has no model, a restarted one does
    (
        if ollama list 2>/dev/null | grep -q "${MODEL%%:*}"; then
            echo "[start] ${MODEL} already downloaded"
        else
            echo "[start] downloading ${MODEL} — the copilot is unavailable until this finishes"
            ollama pull "$MODEL" && echo "[start] ${MODEL} ready"
        fi
    ) &
fi

# The uvicorn workers share metric values through this directory, so /metrics
# reports their sum. Emptied on start: leftovers would add to the new totals.
if [ -n "${PROMETHEUS_MULTIPROC_DIR:-}" ]; then
    rm -rf "$PROMETHEUS_MULTIPROC_DIR" && mkdir -p "$PROMETHEUS_MULTIPROC_DIR"
fi

echo "[start] uvicorn on :${PORT}"
exec uvicorn app:app --host 0.0.0.0 --port "$PORT" --workers "${UVICORN_WORKERS:-2}"
