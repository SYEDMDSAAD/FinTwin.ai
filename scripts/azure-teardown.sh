#!/usr/bin/env bash
# Removes every trace of FinTwin from Azure. Irreversible.
#
#   az login
#   scripts/azure-teardown.sh          # asks before deleting
#   scripts/azure-teardown.sh --yes    # no prompt
#
# What goes:
#   - the resource group, and with it the App Service plan, the four web apps,
#     their managed identities and any role assignments scoped inside it
#   - the Key Vault, purged — a deleted vault is only soft-deleted and keeps
#     its name and secrets for 90 days otherwise
#   - service principals / app registrations named after the project (the CD
#     pipeline's login, if one was ever created)
#
# Billing stops once the resource group is gone. Nothing outside Azure is
# touched: Supabase, Grafana Cloud, GHCR images and GitHub secrets stay.
set -euo pipefail

RG="${RG:-fintwin}"
VAULT="${VAULT:-fintwin-kv}"
PREFIX="${PREFIX:-fintwin}"

az account show --output none 2>/dev/null || { echo "Not logged in — run: az login"; exit 1; }
SUB=$(az account show --query name -o tsv)

echo "Subscription: $SUB"
echo "Resource group '$RG':"
if az group exists -n "$RG" | grep -q true; then
    az resource list -g "$RG" --query "[].[name, type]" -o tsv | sed 's/^/  · /'
else
    echo "  (does not exist)"
fi

if [ "${1:-}" != "--yes" ]; then
    read -r -p "Delete all of this permanently? Type the resource group name to confirm: " answer
    [ "$answer" = "$RG" ] || { echo "Aborted."; exit 1; }
fi

if az group exists -n "$RG" | grep -q true; then
    echo "→ deleting resource group $RG (takes a few minutes)"
    az group delete -n "$RG" --yes
else
    echo "→ resource group $RG already gone"
fi

# A vault deleted with its group lingers in soft-deleted state; purge frees
# the name and destroys the secrets for good
if az keyvault list-deleted --query "[?name=='$VAULT'].name" -o tsv | grep -q .; then
    echo "→ purging soft-deleted Key Vault $VAULT"
    az keyvault purge --name "$VAULT"
fi

for app in $(az ad app list --display-name "$PREFIX" --query "[?starts_with(displayName, '$PREFIX')].appId" -o tsv); do
    echo "→ deleting app registration $app"
    az ad app delete --id "$app"
done
for sp in $(az ad sp list --display-name "$PREFIX" --query "[?starts_with(displayName, '$PREFIX')].id" -o tsv); do
    echo "→ deleting service principal $sp"
    az ad sp delete --id "$sp"
done

echo
echo "→ checking nothing is left"
left=0
az group exists -n "$RG" | grep -q true && { echo "  ✗ resource group $RG still exists"; left=1; }
res=$(az resource list --query "[?starts_with(name, '$PREFIX')].name" -o tsv)
[ -n "$res" ] && { echo "  ✗ resources still exist:"; echo "$res" | sed 's/^/      /'; left=1; }
az keyvault list-deleted --query "[?name=='$VAULT'].name" -o tsv | grep -q . \
    && { echo "  ✗ Key Vault $VAULT still soft-deleted"; left=1; }

if [ "$left" = 0 ]; then
    echo "  ✓ no FinTwin resources remain in '$SUB'"
else
    exit 1
fi
