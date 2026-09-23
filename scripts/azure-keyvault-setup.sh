#!/usr/bin/env bash
# Moves the secrets out of App Service settings and into Key Vault.
#
#   az login
#   FINTWIN_ENV_FILE=.env.prod scripts/azure-keyvault-setup.sh
#
# Run this AFTER scripts/azure-app-service-setup.sh. It creates the vault, puts
# each secret in it, gives every web app a managed identity that may read the
# vault, and replaces the secret app settings with Key Vault references. The
# non-secret settings (ports, URLs, the model name) stay exactly as they are —
# there is nothing to protect there and references would only add a failure
# point.
#
# Safe to re-run: each step is idempotent, and re-running after a secret changes
# is how you rotate one.
set -euo pipefail

RG="${RG:-fintwin}"
LOCATION="${LOCATION:-centralindia}"
VAULT="${VAULT:-fintwin-kv}"          # globally unique, like the web app names
PREFIX="${PREFIX:-fintwin}"
ENV_FILE="${FINTWIN_ENV_FILE:-.env.prod}"

APP_API="${PREFIX}-api"
APP_AUTH="${PREFIX}-auth"
APP_AI="${PREFIX}-ai"

[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE — see docs/azure-env-variables.md"; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

need() { [ -n "${!1:-}" ] || { echo "$1 is missing from $ENV_FILE"; exit 1; }; }
for v in DB_PASSWORD JWT_SECRET FINTWIN_ENCRYPTION_KEY AI_INTERNAL_KEY ADMIN_KEY \
         MAIL_PASSWORD; do need "$v"; done

# Vault secret names allow letters, digits and dashes only — no underscores,
# which is why these are not just the variable names lowercased.
#   <vault secret name>=<env var>
SECRETS=(
    jwt-secret=JWT_SECRET
    encryption-key=FINTWIN_ENCRYPTION_KEY
    db-password=DB_PASSWORD
    ai-internal-key=AI_INTERNAL_KEY
    admin-key=ADMIN_KEY
    mail-password=MAIL_PASSWORD
)
# Only stored if the env file actually has them — unused features stay out
OPTIONAL=(
    internal-key=INTERNAL_KEY
    setu-client-secret=SETU_CLIENT_SECRET
    setu-webhook-secret=SETU_WEBHOOK_SECRET
    inbound-email-secret=INBOUND_EMAIL_SECRET
    sms-api-key=SMS_API_KEY
)

echo "→ vault $VAULT ($LOCATION, RBAC)"
az keyvault create --name "$VAULT" --resource-group "$RG" --location "$LOCATION" \
    --enable-rbac-authorization true --output none 2>/dev/null \
    || echo "  (already exists)"

VAULT_ID=$(az keyvault show --name "$VAULT" --resource-group "$RG" --query id -o tsv)
VAULT_URI=$(az keyvault show --name "$VAULT" --resource-group "$RG" --query properties.vaultUri -o tsv)

echo "→ letting you write secrets"
ME=$(az ad signed-in-user show --query id -o tsv)
az role assignment create --role "Key Vault Secrets Officer" \
    --assignee-object-id "$ME" --assignee-principal-type User \
    --scope "$VAULT_ID" --output none 2>/dev/null || true

# Role assignments take a moment to propagate; without this the first secret
# write often fails with a 403 that means nothing more than "too soon"
sleep 20

store() {                                   # vault-name, env-var, required?
    local name=$1 var=$2 value="${!2:-}"
    if [ -z "$value" ]; then
        [ "${3:-}" = "required" ] && { echo "  $var is empty"; exit 1; }
        return 0
    fi
    echo "  · $name"
    az keyvault secret set --vault-name "$VAULT" --name "$name" --value "$value" --output none
}

echo "→ secrets"
for pair in "${SECRETS[@]}";  do store "${pair%%=*}" "${pair#*=}" required; done
for pair in "${OPTIONAL[@]}"; do store "${pair%%=*}" "${pair#*=}"; done

ref() { echo "@Microsoft.KeyVault(SecretUri=${VAULT_URI}secrets/$1/)"; }

grant() {                                   # app name
    local app=$1
    echo "→ $app: managed identity + read access"
    az webapp identity assign --name "$app" --resource-group "$RG" --output none
    local pid
    pid=$(az webapp identity show --name "$app" --resource-group "$RG" --query principalId -o tsv)
    az role assignment create --role "Key Vault Secrets User" \
        --assignee-object-id "$pid" --assignee-principal-type ServicePrincipal \
        --scope "$VAULT_ID" --output none 2>/dev/null || true
}

grant "$APP_API"
grant "$APP_AUTH"
grant "$APP_AI"
sleep 20                                    # same propagation wait, for the apps

echo "→ $APP_API: pointing settings at the vault"
az webapp config appsettings set --name "$APP_API" --resource-group "$RG" --settings \
    JWT_SECRET="$(ref jwt-secret)" \
    FINTWIN_ENCRYPTION_KEY="$(ref encryption-key)" \
    DB_PASSWORD="$(ref db-password)" \
    AI_INTERNAL_KEY="$(ref ai-internal-key)" \
    ADMIN_KEY="$(ref admin-key)" \
    MAIL_PASSWORD="$(ref mail-password)" \
    > /dev/null

echo "→ $APP_AUTH: pointing settings at the vault"
az webapp config appsettings set --name "$APP_AUTH" --resource-group "$RG" --settings \
    JWT_SECRET="$(ref jwt-secret)" \
    FINTWIN_ENCRYPTION_KEY="$(ref encryption-key)" \
    DB_PASSWORD="$(ref db-password)" \
    ADMIN_KEY="$(ref admin-key)" \
    MAIL_PASSWORD="$(ref mail-password)" \
    > /dev/null

echo "→ $APP_AI: pointing settings at the vault"
az webapp config appsettings set --name "$APP_AI" --resource-group "$RG" --settings \
    AI_INTERNAL_KEY="$(ref ai-internal-key)" \
    > /dev/null

cat <<DONE

Done. The three apps now read their secrets from $VAULT.

Check that every reference actually resolved — a typo shows up here as an empty
value or a "Key Vault Reference" error, and the app will not start:

  az webapp config appsettings list -g $RG -n $APP_API \\
     --query "[?contains(value,'KeyVault')].{name:name,value:value}" -o table

  az webapp log tail -g $RG -n $APP_API

To rotate a secret later: change it in $ENV_FILE, run this script again, then
restart the apps that use it. References resolve at startup, so a restart is
what picks up the new value:

  az webapp restart -g $RG -n $APP_API
DONE
