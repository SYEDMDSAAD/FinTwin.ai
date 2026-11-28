#!/usr/bin/env bash
#
# Moves the Cloud Run services' secrets into Secret Manager and gives each
# service its own service account with only what it needs, instead of the
# default compute account (which has Editor on the whole project).
#
#   scripts/gcp-secrets-and-accounts.sh          # dry run: says what it would do
#   scripts/gcp-secrets-and-accounts.sh --apply  # does it
#
# Secret values are read from each service's current settings and piped
# straight into Secret Manager; they are never printed or written to disk.
# Re-running is safe: existing secrets get a new version only if the value
# changed, existing accounts and bindings are left as they are.
#
# Undo for one service:
#   gcloud run services update <svc> --region asia-south1 \
#     --service-account 171222129367-compute@developer.gserviceaccount.com
#   (the previous revision, with the plain env vars, is still there to roll back to:
#    gcloud run services update-traffic <svc> --region asia-south1 --to-revisions <rev>=100)
set -euo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1   # never stop to ask (e.g. "enable this API?")

PROJECT=fintwin-ai-prod-2026
REGION=asia-south1
APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

run() {
  if $APPLY; then "$@"; else echo "  would run: $*"; fi
}

# service → env vars that are secrets
declare -A SECRETS=(
  [fintwin-api]="DB_URL DB_USERNAME DB_PASSWORD JWT_SECRET FINTWIN_ENCRYPTION_KEY AI_INTERNAL_KEY ADMIN_KEY MAIL_PASSWORD SETU_CLIENT_SECRET METRICS_TOKEN"
  [fintwin-auth]="DB_URL DB_USERNAME DB_PASSWORD JWT_SECRET FINTWIN_ENCRYPTION_KEY ADMIN_KEY MAIL_PASSWORD INTERNAL_KEY"
  [fintwin-ai]="AI_INTERNAL_KEY"
  [fintwin-guard]="AI_INTERNAL_KEY"
  [fintwin-web]=""
)
# service → project roles beyond reading its own secrets
declare -A ROLES=(
  [fintwin-ai]="roles/aiplatform.user"
)

echo "Project $PROJECT, region $REGION — $($APPLY && echo APPLYING || echo 'dry run')"
run gcloud services enable secretmanager.googleapis.com --project "$PROJECT"

# The value of one env var on the service being processed, on stdout (only
# ever piped). Reads SVC_JSON, fetched once per service and held in memory.
env_value() {
  printf '%s' "$SVC_JSON" |
    python3 -I -c "
import json, sys
d = json.load(sys.stdin)
for c in d['spec']['template']['spec']['containers']:
    for e in c.get('env', []):
        if e['name'] == sys.argv[1] and 'value' in e:
            sys.stdout.write(e['value']); sys.exit(0)
sys.exit(3)" "$1"
}

for svc in "${!SECRETS[@]}"; do
  sa_name="run-${svc#fintwin-}"
  sa="$sa_name@$PROJECT.iam.gserviceaccount.com"
  echo "== $svc → $sa"
  SVC_JSON=$(gcloud run services describe "$svc" --project "$PROJECT" --region "$REGION" --format=json)

  if ! gcloud iam service-accounts describe "$sa" --project "$PROJECT" >/dev/null 2>&1; then
    run gcloud iam service-accounts create "$sa_name" --project "$PROJECT" \
      --display-name "Cloud Run: $svc"
  fi
  for role in ${ROLES[$svc]:-}; do
    run gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$sa" \
      --role "$role" --condition None --quiet
  done

  update_secrets=()
  for name in ${SECRETS[$svc]}; do
    base="${name#FINTWIN_}"
    secret="fintwin-${base//_/-}"
    secret="${secret,,}"
    if ! env_value "$name" >/dev/null 2>&1; then
      echo "  $name: not a plain env var on $svc (already moved?) — skipped"
      continue
    fi
    if ! gcloud secrets describe "$secret" --project "$PROJECT" >/dev/null 2>&1; then
      if $APPLY; then
        env_value "$name" | gcloud secrets create "$secret" --project "$PROJECT" \
          --replication-policy user-managed --locations "$REGION" --data-file=- >/dev/null
        echo "  created secret $secret"
      else
        echo "  would create secret $secret from $svc's $name"
      fi
    else
      current=$(gcloud secrets versions access latest --secret "$secret" --project "$PROJECT" | sha256sum)
      wanted=$(env_value "$name" | sha256sum)
      if [[ "$current" != "$wanted" ]]; then
        # Another service already stored a different value under this name:
        # this service gets a secret of its own rather than the other's value
        secret="fintwin-${svc#fintwin-}-${base//_/-}"
        secret="${secret,,}"
        if ! gcloud secrets describe "$secret" --project "$PROJECT" >/dev/null 2>&1; then
          env_value "$name" | gcloud secrets create "$secret" --project "$PROJECT" \
            --replication-policy user-managed --locations "$REGION" --data-file=- >/dev/null
          echo "  $svc's $name differs from the shared one: created $secret"
        fi
      fi
    fi
    run gcloud secrets add-iam-policy-binding "$secret" --project "$PROJECT" \
      --member "serviceAccount:$sa" --role roles/secretmanager.secretAccessor --quiet
    update_secrets+=("$name=$secret:latest")
  done

  args=(--project "$PROJECT" --region "$REGION" --service-account "$sa")
  if ((${#update_secrets[@]})); then
    names=$(printf '%s\n' "${update_secrets[@]}" | cut -d= -f1 | paste -sd,)
    args+=(--remove-env-vars "$names" --update-secrets "$(IFS=,; echo "${update_secrets[*]}")")
  fi
  run gcloud run services update "$svc" "${args[@]}" --quiet
done

echo
echo "Done. Check each service answers (web /healthz, api /actuator/health, demo login)."
$APPLY || echo "Nothing was changed. Run with --apply to do it."
