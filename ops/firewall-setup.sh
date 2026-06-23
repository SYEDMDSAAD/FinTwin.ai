#!/usr/bin/env bash
# FinTwin AI — UFW firewall setup
# Run once on the VPS as root: sudo bash ops/firewall-setup.sh
#
# After this script:
#   - Only ports 22 (SSH), 80 (HTTP→redirect), 443 (HTTPS) are open
#   - All internal services (8080, 5432, 8000) are NOT reachable from internet
#   - Docker containers talk to each other on the internal bridge network only

set -euo pipefail

echo "==> Resetting UFW to defaults..."
ufw --force reset

echo "==> Setting default policies..."
ufw default deny incoming
ufw default allow outgoing

echo "==> Allowing SSH (port 22)..."
ufw allow 22/tcp comment "SSH"

echo "==> Allowing HTTP (port 80) for ACME challenge redirect..."
ufw allow 80/tcp comment "HTTP (certbot ACME / redirect to HTTPS)"

echo "==> Allowing HTTPS (port 443)..."
ufw allow 443/tcp comment "HTTPS"

# Explicitly deny internal service ports in case Docker ever maps them
echo "==> Blocking direct access to internal service ports..."
ufw deny 8080/tcp comment "Spring Boot — internal only"
ufw deny 5432/tcp comment "PostgreSQL — internal only"
ufw deny 8000/tcp comment "AI service — internal only"

echo "==> Enabling UFW..."
ufw --force enable

echo ""
ufw status verbose

echo ""
echo "Done. Only ports 22, 80, and 443 are open to the internet."
echo "Backend (8080), DB (5432), and AI service (8000) are blocked."
