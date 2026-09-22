#!/usr/bin/env bash
# Download the anonymised training datasets (JSON lines) from a running backend.
#
#   FINTWIN_ADMIN_TOKEN=<admin JWT> scripts/export-training-data.sh [backend-url] [out-dir]
#
# Only users who turned on "Help improve FinTwin's AI" are included; names,
# phone numbers, UPI IDs, emails and account numbers are removed server-side
# (TrainingExportService). Each export is written to the audit log.
set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
OUT_DIR="${2:-training-export-$(date +%Y-%m-%d)}"
TOKEN="${FINTWIN_ADMIN_TOKEN:?Set FINTWIN_ADMIN_TOKEN to an admin access token}"

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"          # still personal data in aggregate: keep it private

echo "Row counts:"
curl -fsS -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/v1/admin/training-export"
echo

for dataset in categories copilot anomalies imports; do
    curl -fsS -H "Authorization: Bearer $TOKEN" \
        -o "$OUT_DIR/$dataset.jsonl" \
        "$BASE_URL/api/v1/admin/training-export/$dataset"
    echo "  $dataset: $(wc -l < "$OUT_DIR/$dataset.jsonl") rows → $OUT_DIR/$dataset.jsonl"
done
