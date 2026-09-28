#!/usr/bin/env bash
# Creates the Azure App Service setup for FinTwin.ai — one plan, four web apps.
# Run once; deploys after that are handled by .github/workflows/cd-deploy.yml.
#
#   az login
#   FINTWIN_ENV_FILE=.env.prod scripts/azure-app-service-setup.sh
#
# Reads your secrets from .env.prod (same file the VM uses) and sets them as app
# settings. Nothing is printed: `az webapp config appsettings set` echoes every
# value it stores, so its output is sent to /dev/null throughout.
set -euo pipefail

RG="${RG:-fintwin}"
LOCATION="${LOCATION:-centralindia}"
PLAN="${PLAN:-fintwin-plan}"
# B3: 4 vCPU / 7 GB, ~$53/month in Central India (Sept 2026 retail price).
# The smallest plan that fits: qwen2.5:3b in RAM (~2.8 GB) + two capped JVMs +
# the AI service is ~5.5 GB. It also has twice P1v3's CPUs for less than half
# the price; Basic lacks deployment slots and autoscale, which this doesn't use.
# SKU=P1V3 for production-grade slots. With LLM_PROVIDER=bedrock (no local
# model) SKU=B2 (3.5 GB, ~$26) can be enough.
SKU="${SKU:-B3}"
ENV_FILE="${FINTWIN_ENV_FILE:-.env.prod}"

# Web app names are part of *.azurewebsites.net, so they must be globally
# unique — override with PREFIX if these are taken.
PREFIX="${PREFIX:-fintwin}"
APP_WEB="${PREFIX}-web"
APP_API="${PREFIX}-api"
APP_AUTH="${PREFIX}-auth"
APP_AI="${PREFIX}-ai"

REGISTRY="${REGISTRY:-ghcr.io/$(git config --get remote.origin.url | sed -E 's#.*[:/]([^/]+)/[^/]+(\.git)?$#\1#' | tr '[:upper:]' '[:lower:]')}"
TAG="${TAG:-latest}"

[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE — copy the values from docs/azure-app-service-deployment.md"; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

need() { [ -n "${!1:-}" ] || { echo "$1 is missing from $ENV_FILE"; exit 1; }; }
# Claude on Bedrock (LLM_PROVIDER=bedrock) needs its region and AWS credentials
if [ "${LLM_PROVIDER:-ollama}" = "bedrock" ]; then
    for v in AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do need "$v"; done
fi
# MAIL_* is required, not optional: without a mail provider the signup OTP and
# the password-reset link come back in the API response, and both services now
# refuse to start in production rather than do that.
# METRICS_TOKEN guards /actuator/prometheus and /metrics: every app here has a
# public URL, and Grafana Cloud scrapes them with this token (openssl rand -hex 32)
for v in DB_URL DB_USERNAME DB_PASSWORD JWT_SECRET FINTWIN_ENCRYPTION_KEY AI_INTERNAL_KEY \
         ADMIN_KEY MAIL_USERNAME MAIL_PASSWORD METRICS_TOKEN; do need "$v"; done

echo "→ resource group $RG ($LOCATION)"
az group create --name "$RG" --location "$LOCATION" --output none

echo "→ plan $PLAN ($SKU, Linux)"
az appservice plan create --name "$PLAN" --resource-group "$RG" \
    --sku "$SKU" --is-linux --output none

create_app() {                      # name, image, port
    local name=$1 image=$2 port=$3
    echo "→ web app $name ($image)"
    az webapp create --name "$name" --resource-group "$RG" --plan "$PLAN" \
        --container-image-name "$REGISTRY/$image:$TAG" --output none
    az webapp config appsettings set --name "$name" --resource-group "$RG" --settings \
        WEBSITES_PORT="$port" \
        WEBSITES_ENABLE_APP_SERVICE_STORAGE=false \
        DOCKER_REGISTRY_SERVER_URL=https://ghcr.io \
        > /dev/null
    # Always On keeps the container running; without it App Service unloads an
    # idle app and the next request waits for a JVM to start
    az webapp config set --name "$name" --resource-group "$RG" \
        --always-on true --http20-enabled true --min-tls-version 1.2 --output none
}

FRONT_HOSTS="BACKEND_HOST=${APP_API}.azurewebsites.net IDENTITY_HOST=${APP_AUTH}.azurewebsites.net"

create_app "$APP_API"  fintwin-backend          8080
create_app "$APP_AUTH" fintwin-identity-service 8090
create_app "$APP_AI"   fintwin-ai-ollama        8000
create_app "$APP_WEB"  fintwin-frontend-as      8080

# Heap caps (JAVA_TOOL_OPTIONS, below). The images start the JVM with
# MaxRAMPercentage=75, which on the VM means 75% of a 1 GB container. App
# Service has no per-app memory limit, so each JVM would see the whole plan and
# could grow to ~5 GB — two of them plus the model don't fit, and the apps get
# killed. The caps match what the VM gives them (backend 768 MB of heap).
echo "→ settings: backend"
az webapp config appsettings set --name "$APP_API" --resource-group "$RG" --settings \
    SERVER_PORT=8080 \
    JAVA_TOOL_OPTIONS="${BACKEND_JAVA_OPTS:--Xmx768m}" \
    DB_URL="$DB_URL" DB_USERNAME="$DB_USERNAME" DB_PASSWORD="$DB_PASSWORD" \
    DDL_AUTO=validate SHOW_SQL=false APP_REQUIRE_SECURE_CONFIG=true \
    FLYWAY_ENABLED="${FLYWAY_ENABLED:-true}" FLYWAY_BASELINE="${FLYWAY_BASELINE:-true}" \
    DB_POOL_MAX="${DB_POOL_MAX:-20}" \
    JWT_SECRET="$JWT_SECRET" FINTWIN_ENCRYPTION_KEY="$FINTWIN_ENCRYPTION_KEY" \
    AI_INTERNAL_KEY="$AI_INTERNAL_KEY" \
    AI_SERVICE_URL="https://${APP_AI}.azurewebsites.net" \
    METRICS_TOKEN="$METRICS_TOKEN" GRAFANA_URL="${GRAFANA_URL:-}" \
    AI_DAILY_TOKEN_LIMIT="${AI_DAILY_TOKEN_LIMIT:-200000}" \
    REDIS_URL="${REDIS_URL:-}" \
    CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-https://${APP_WEB}.azurewebsites.net}" \
    GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}" \
    SETU_BASE_URL="${SETU_BASE_URL:-https://fiu-uat.setu.co}" \
    SETU_CLIENT_ID="${SETU_CLIENT_ID:-}" SETU_CLIENT_SECRET="${SETU_CLIENT_SECRET:-}" \
    SETU_REDIRECT_URL="${SETU_REDIRECT_URL:-}" SETU_PRODUCT_INSTANCE_ID="${SETU_PRODUCT_INSTANCE_ID:-}" \
    SETU_WEBHOOK_SECRET="${SETU_WEBHOOK_SECRET:-}" \
    INBOUND_EMAIL_DOMAIN="${INBOUND_EMAIL_DOMAIN:-}" INBOUND_EMAIL_SECRET="${INBOUND_EMAIL_SECRET:-}" \
    ADMIN_KEY="$ADMIN_KEY" \
    MAIL_ENABLED="${MAIL_ENABLED:-true}" MAIL_HOST="${MAIL_HOST:-smtp.gmail.com}" MAIL_PORT="${MAIL_PORT:-587}" \
    MAIL_USERNAME="$MAIL_USERNAME" MAIL_PASSWORD="$MAIL_PASSWORD" \
    > /dev/null
# Liveness, not /actuator/health: the full health also checks mail and the
# database, and a mail hiccup must not get the backend restarted
az webapp config set --name "$APP_API" --resource-group "$RG" \
    --health-check-path /actuator/health/liveness --output none

echo "→ settings: identity"
az webapp config appsettings set --name "$APP_AUTH" --resource-group "$RG" --settings \
    IDENTITY_PORT=8090 APP_REQUIRE_SECURE_CONFIG=true \
    JAVA_TOOL_OPTIONS="${IDENTITY_JAVA_OPTS:--Xmx512m}" \
    DB_URL="$DB_URL" DB_USERNAME="$DB_USERNAME" DB_PASSWORD="$DB_PASSWORD" \
    JWT_SECRET="$JWT_SECRET" FINTWIN_ENCRYPTION_KEY="$FINTWIN_ENCRYPTION_KEY" \
    REDIS_URL="${REDIS_URL:-}" \
    CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-https://${APP_WEB}.azurewebsites.net}" \
    APP_BASE_URL="${APP_BASE_URL:-https://${APP_WEB}.azurewebsites.net}" \
    GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}" ADMIN_KEY="$ADMIN_KEY" INTERNAL_KEY="${INTERNAL_KEY:-}" \
    MAIL_ENABLED="${MAIL_ENABLED:-true}" MAIL_HOST="${MAIL_HOST:-smtp.gmail.com}" MAIL_PORT="${MAIL_PORT:-587}" \
    MAIL_USERNAME="$MAIL_USERNAME" MAIL_PASSWORD="$MAIL_PASSWORD" \
    > /dev/null
az webapp config set --name "$APP_AUTH" --resource-group "$RG" \
    --health-check-path /actuator/health/liveness --output none

echo "→ settings: ai + ollama"
# /home is the only storage App Service keeps across restarts — the 2 GB model
# lives there so a restart doesn't re-download it. The start limit is raised
# because a cold instance downloads the model while booting.
az webapp config appsettings set --name "$APP_AI" --resource-group "$RG" --settings \
    PORT=8000 \
    WEBSITES_ENABLE_APP_SERVICE_STORAGE=true \
    WEBSITES_CONTAINER_START_TIME_LIMIT=1800 \
    OLLAMA_MODELS=/home/ollama \
    OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:3b}" \
    OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-30m}" \
    AI_INTERNAL_KEY="$AI_INTERNAL_KEY" METRICS_TOKEN="$METRICS_TOKEN" \
    BACKEND_URL="https://${APP_API}.azurewebsites.net" \
    LLM_PROVIDER="${LLM_PROVIDER:-ollama}" \
    AWS_REGION="${AWS_REGION:-}" BEDROCK_MODEL="${BEDROCK_MODEL:-}" BEDROCK_EFFORT="${BEDROCK_EFFORT:-}" \
    AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}" AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}" \
    REDIS_URL="${REDIS_URL:-}" \
    UVICORN_WORKERS="${UVICORN_WORKERS:-2}" \
    > /dev/null
az webapp config set --name "$APP_AI" --resource-group "$RG" \
    --health-check-path /health --output none

echo "→ settings: front door"
# shellcheck disable=SC2086
az webapp config appsettings set --name "$APP_WEB" --resource-group "$RG" --settings \
    PORT=8080 $FRONT_HOSTS > /dev/null
az webapp config set --name "$APP_WEB" --resource-group "$RG" \
    --health-check-path /healthz --output none

cat <<DONE

Created. Next:

  1. The images must exist in $REGISTRY before the apps can start.
     Push to main, or build them by hand (see the runbook).

  2. GHCR is private by default. Either make the packages public, or give
     App Service a read token:

       az webapp config appsettings set -g $RG -n <app> --settings \\
         DOCKER_REGISTRY_SERVER_USERNAME=<github-user> \\
         DOCKER_REGISTRY_SERVER_PASSWORD=<classic PAT with read:packages>

  3. Your app: https://${APP_WEB}.azurewebsites.net
     The first AI answer waits for a ~2 GB model download — watch it with
       az webapp log tail -g $RG -n $APP_AI

  4. Monitoring: point Grafana Cloud at the two metrics endpoints with
     METRICS_TOKEN — docs/azure-app-service-deployment.md, "Monitoring".

  5. Cost: the plan bills every hour it exists, stopped or not (B3 ~\$53/month).
     When you're done with it, delete everything:
       az group delete -n $RG

  6. A custom domain and its free managed certificate:
       az webapp config hostname add -g $RG --webapp-name $APP_WEB --hostname your-domain
       az webapp config ssl create   -g $RG --name $APP_WEB --hostname your-domain
     Then set CORS_ALLOWED_ORIGINS and APP_BASE_URL to that domain.
DONE
