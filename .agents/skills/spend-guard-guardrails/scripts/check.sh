#!/usr/bin/env bash
# Spend Guard's guardrail checks: the tests that prove each rule, a scan for
# secrets, and a check that the browser never talks to guard-service directly.
#
#   check.sh            guard-service tests, Spend Guard frontend tests, scans
#   check.sh --backend  also the backend guard and role tests (needs Docker)
#
# Exits non-zero if anything fails. The scans print file:line only, never the
# matched text, so a leaked secret isn't copied into logs.
set -o pipefail

case "${1:-}" in
  "" | --backend) ;;
  *) echo "usage: $0 [--backend]" >&2; exit 2 ;;
esac

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null)" \
  || { echo "Run this from inside the FinTwin repo." >&2; exit 2; }
cd "$root" || exit 2

failed=()
step() { printf '\n== %s\n' "$1"; }

# Spend Guard's own files: the scope of the scans
guard_paths=(
  guard-service
  frontend/src/components/guard
  'frontend/src/pages/SpendGuardPage*'
  'frontend/src/services/guard*'
  frontend/src/hooks/useSpendGuard.js
  backend/src/main/java/com/fintwin/controller/GuardController.java
  'backend/src/test/java/com/fintwin/controller/Guard*'
  .agents/skills/spend-guard-guardrails
  ':(exclude).agents/skills/spend-guard-guardrails/scripts'
)

# scan NAME PATTERN PATHS...: fails NAME if the pattern matches any file
scan() {
  local name="$1" pattern="$2" hits rc
  shift 2
  hits="$(git grep -nIE --untracked -e "$pattern" -- "$@")"
  rc=$?
  if [ "$rc" -eq 1 ]; then
    echo "ok"
  elif [ "$rc" -eq 0 ]; then
    printf '%s\n' "$hits" | cut -d: -f1,2 | sed 's/^/  found at /'
    failed+=("$name")
  else
    echo "the scan itself failed (git grep exit $rc)"
    failed+=("$name")
  fi
}

step "guard-service: rules, grounding and API tests"
py="$root/guard-service/venv/bin/python"
[ -x "$py" ] || py="$(command -v python3)"
if ! (cd guard-service && "$py" -m pytest -q); then
  echo "Set up once with: cd guard-service && python3 -m venv venv && venv/bin/pip install -r requirements-dev.txt"
  failed+=("guard-service tests")
fi

step "frontend: Spend Guard tests"
if [ -d frontend/node_modules ]; then
  (cd frontend && npx vitest run src/pages/SpendGuardPage.test.jsx) || failed+=("Spend Guard frontend tests")
else
  echo "frontend/node_modules is missing: run 'npm ci' in frontend/ first."
  failed+=("Spend Guard frontend tests (not run)")
fi

if [ "${1:-}" = "--backend" ]; then
  step "backend: guard access and role tests"
  (cd backend && mvn -q test -Dtest='GuardControllerTest,GuardAccessIntegrationTest,RbacIntegrationTest') \
    || failed+=("backend guard tests")
fi

step "scan: no secrets in Spend Guard files"
scan "secret scan" \
  'AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----|"private_key"[[:space:]]*:|(AI_INTERNAL_KEY|GOOGLE_API_KEY|GEMINI_API_KEY|JWT_SECRET|METRICS_TOKEN)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9+/=_-]{20,}' \
  "${guard_paths[@]}"

step "scan: the browser only talks to the backend"
scan "frontend reaches guard-service directly" '8091|X-Internal-Key|AI_INTERNAL_KEY|GUARD_SERVICE_URL' frontend/src

echo
if [ "${#failed[@]}" -eq 0 ]; then
  echo "All Spend Guard guardrail checks passed."
  exit 0
fi
echo "Failed:"
printf '  - %s\n' "${failed[@]}"
exit 1
