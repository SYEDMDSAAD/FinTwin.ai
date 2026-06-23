#!/usr/bin/env bash
# FinTwin AI — OWASP ZAP baseline scan (PCI-DSS Req 11)
# Run against staging before each release.
# Usage: bash ops/zap-scan.sh https://staging.fintwin.ai
#
# Requires: Docker
# Output:   ops/zap-reports/zap-report-YYYYMMDD.html

set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <target-url>"
  echo "  Example: $0 https://staging.fintwin.ai"
  exit 1
fi

REPORT_DIR="$(dirname "$0")/zap-reports"
REPORT_FILE="zap-report-$(date +%Y%m%d-%H%M%S).html"

mkdir -p "$REPORT_DIR"

echo "==> Starting OWASP ZAP baseline scan against: $TARGET"
echo "==> Report will be saved to: $REPORT_DIR/$REPORT_FILE"
echo ""

docker run --rm \
  -v "$(realpath "$REPORT_DIR"):/zap/wrk:rw" \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py \
    -t "$TARGET" \
    -r "$REPORT_FILE" \
    -I \
    -j

echo ""
echo "Scan complete. Open $REPORT_DIR/$REPORT_FILE in a browser to review findings."
echo "File this report in your secure document store as evidence of Req 11 compliance."
