#!/usr/bin/env bash
# FinTwin AI — ClamAV setup (PCI-DSS Req 5)
# Run once on the VPS as root: sudo bash ops/clamav-setup.sh
#
# After this script:
#   - ClamAV daemon and freshclam updater are installed and running
#   - Virus definitions update daily via freshclam
#   - Weekly full scan of the FinTwin project directory (Sunday 03:00)
#   - Scan results logged to /var/log/clamav/weekly-scan.log

set -euo pipefail

SCAN_DIR="${1:-/home/syed-mohammad-saad/Desktop/FinTwin.ai}"
LOG_DIR="/var/log/clamav"
CRON_FILE="/etc/cron.d/fintwin-clamav"

echo "==> Installing ClamAV..."
apt-get update -qq
apt-get install -y clamav clamav-daemon

echo "==> Stopping freshclam to allow initial update..."
systemctl stop clamav-freshclam 2>/dev/null || true

echo "==> Updating virus definitions..."
freshclam

echo "==> Starting ClamAV services..."
systemctl enable --now clamav-freshclam
systemctl enable --now clamav-daemon

echo "==> Creating log directory..."
mkdir -p "$LOG_DIR"
chown clamav:clamav "$LOG_DIR"

echo "==> Installing weekly scan cron job (Sundays at 03:00)..."
cat > "$CRON_FILE" <<EOF
# FinTwin AI — Weekly ClamAV scan (PCI-DSS Req 5)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Weekly full scan — runs Sunday at 03:00
0 3 * * 0 root clamscan -r --infected --remove=no \
    --log=${LOG_DIR}/weekly-scan-\$(date +\%Y\%m\%d).log \
    ${SCAN_DIR} 2>&1 \
  && echo "ClamAV scan completed: \$(date)" >> ${LOG_DIR}/scan-history.log \
  || echo "ClamAV ALERT — threats found: \$(date)" >> ${LOG_DIR}/scan-history.log

# Rotate logs older than 90 days
0 4 * * 0 root find ${LOG_DIR} -name "weekly-scan-*.log" -mtime +90 -delete
EOF

chmod 644 "$CRON_FILE"

echo ""
echo "Done. ClamAV is active."
echo "  Definitions: updated daily by freshclam"
echo "  Weekly scan: Sundays 03:00 → $LOG_DIR/weekly-scan-YYYYMMDD.log"
echo "  Scan history: $LOG_DIR/scan-history.log"
echo ""
echo "To run a manual scan now:"
echo "  clamscan -r --infected $SCAN_DIR"
