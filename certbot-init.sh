#!/usr/bin/env bash
# Run this ONCE on a new server to issue the first Let's Encrypt certificate.
#
# Usage:
#   chmod +x certbot-init.sh
#   ./certbot-init.sh yourdomain.com admin@yourdomain.com
#
# Prerequisites:
#   - Docker + Docker Compose installed
#   - Port 80 open and pointing to this server (Certbot needs HTTP for the challenge)
#   - Your domain's A record already points to this server's IP
#   - nginx must NOT be running yet (or at least not blocking port 80 on the challenge path)
#
# What it does:
#   1. Starts nginx in HTTP-only mode (no HTTPS block yet) to serve the ACME challenge
#   2. Runs certbot standalone to issue the cert
#   3. Copies fullchain.pem + privkey.pem to ./nginx/certs/ so nginx can find them
#   4. Prompts you to start the full stack

set -euo pipefail

DOMAIN="${1:?Usage: $0 <domain> <email>}"
EMAIL="${2:?Usage: $0 <domain> <email>}"

echo "==> Issuing Let's Encrypt certificate for: $DOMAIN"
echo "    Contact email: $EMAIL"
echo ""

# Create webroot and cert directories if they don't exist
mkdir -p nginx/certs

# Issue the cert using webroot method
# nginx must be running and serving /.well-known/acme-challenge/ from /var/www/certbot
docker compose up -d nginx

echo "==> Requesting certificate (webroot challenge)..."
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --domain "$DOMAIN"

echo "==> Copying certificates to ./nginx/certs/ ..."
# certbot writes to /etc/letsencrypt inside the container (mapped to letsencrypt volume)
# We copy out via the volume mount
docker compose run --rm --entrypoint "" certbot \
  sh -c "cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /etc/letsencrypt/live/$DOMAIN/privkey.pem /etc/nginx/certs/"

echo ""
echo "==> Done. Update nginx/nginx.conf: set server_name to '$DOMAIN'"
echo "    Then start the full stack:"
echo "      docker compose --profile production up -d"
echo ""
echo "    Certificates will auto-renew every 12 hours via the certbot service."

# Generate DH params while we wait (takes ~30s for 2048-bit)
echo "==> Generating DH parameters (2048-bit) for nginx..."
openssl dhparam -out nginx/certs/dhparam.pem 2048
echo "    Uncomment ssl_dhparam in nginx/nginx.conf to activate."
