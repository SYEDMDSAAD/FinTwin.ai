# Running FinTwin.ai on one Azure VM

Everything runs on a single Linux VM with Docker Compose: nginx, the backend,
the identity service, the AI service, Ollama and Redis. Postgres stays on
Supabase. This replaces the Kubernetes manifests, which cost far more than a
beta with 20–25 users can justify — a managed cluster is about ₹6,000/month
before a single workload runs.

- **Compose file:** [`docker-compose.azure.yml`](../docker-compose.azure.yml)
- **Routing and TLS:** [`nginx/nginx.conf`](../nginx/nginx.conf)
- **Deploys:** `.github/workflows/cd-deploy.yml`, on every push to `main`

---

## What it costs

Central India, pay-as-you-go, September 2026. Check the
[pricing calculator](https://azure.microsoft.com/pricing/calculator/) before
committing — prices move.

| Item | Size | Monthly |
|---|---|---|
| VM | Standard_B2as_v2 — 2 vCPU, 8 GB | ~$35 |
| Managed disk | 64 GB standard SSD | ~$5 |
| Public IP | Static, standard | ~$4 |
| Bandwidth | First 100 GB out free | ~$0 |
| Supabase | Free tier (500 MB) or Pro | $0–25 |
| GitHub Container Registry | Public images | $0 |
| **Total** | | **~$44–69** |

A **B2as_v2 is the smallest that works**, and only because Ollama holds about
2 GB of model plus the JVMs. On a 4 GB VM the model and the two Java services
will fight for memory and the kernel will start killing processes.

Cheaper if you need it: a B2ats_v2 (2 vCPU, 1 GB) is far too small; dropping to
one Java service isn't possible; the real lever is turning Ollama off, which
costs you the Copilot.

---

## One-time setup

### 1. The VM

```bash
az group create --name fintwin --location centralindia

az vm create \
  --resource-group fintwin \
  --name fintwin-vm \
  --image Ubuntu2404 \
  --size Standard_B2as_v2 \
  --admin-username fintwin \
  --generate-ssh-keys \
  --public-ip-sku Standard \
  --os-disk-size-gb 64

az vm open-port --resource-group fintwin --name fintwin-vm --port 80  --priority 900
az vm open-port --resource-group fintwin --name fintwin-vm --port 443 --priority 910
```

SSH stays open on 22 from the create command. Lock it to your own address:

```bash
az network nsg rule update --resource-group fintwin \
  --nsg-name fintwin-vmNSG --name default-allow-ssh \
  --source-address-prefixes "$(curl -s ifconfig.me)/32"
```

Point your domain's A record at the VM's public IP
(`az vm show -d -g fintwin -n fintwin-vm --query publicIps -o tsv`) before
asking for a certificate.

### 2. Docker and the repo

```bash
ssh fintwin@<ip>

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && exit        # log back in for the group to apply

ssh fintwin@<ip>
git clone https://github.com/<you>/FinTwin.ai.git ~/fintwin
cd ~/fintwin
```

### 3. Secrets

`.env.prod` lives only on the VM. CI never sends it, and it must never be
committed.

```bash
cat > ~/fintwin/.env.prod <<'EOF'
REGISTRY=ghcr.io/<your-github-user-lowercase>
TAG=latest

# Supabase — the pooler host, not the direct one, unless the VM has IPv6
DB_URL=jdbc:postgresql://aws-1-<region>.pooler.supabase.com:5432/postgres?sslmode=require
DB_USERNAME=postgres.<project-ref>
DB_PASSWORD=<supabase password>

# 32+ characters each. Losing FINTWIN_ENCRYPTION_KEY makes every stored
# name, email, amount and category unreadable — there is no recovery.
JWT_SECRET=<openssl rand -base64 48>
FINTWIN_ENCRYPTION_KEY=<openssl rand -base64 32>
AI_INTERNAL_KEY=<openssl rand -base64 32>
INTERNAL_KEY=<openssl rand -base64 32>
ADMIN_KEY=<openssl rand -base64 32>

APP_BASE_URL=https://your-domain
CORS_ALLOWED_ORIGINS=https://your-domain

MAIL_ENABLED=true
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=<address>
MAIL_PASSWORD=<app password>

GOOGLE_CLIENT_ID=
EOF
chmod 600 ~/fintwin/.env.prod
```

Keep a copy of the two keys in a password manager. `JWT_SECRET` and
`FINTWIN_ENCRYPTION_KEY` must match what the data was written with.

Mail is **not optional in production.** With no provider configured, sign-up
returns the verification OTP — and "forgot password" returns the reset link —
in the API response itself, which is how local development works without a
mailbox. Anyone could then verify, or take over, an address they do not own, so
both Java services refuse to start in production with mail unset.

### 4. Your domain in nginx

`nginx/nginx.conf` ships with `server_name fintwin.local`. Change it to your
domain on the VM (it is read from the repo at start, so this survives
redeploys only if you commit it):

```bash
sed -i 's/fintwin.local/your-domain/' ~/fintwin/nginx/nginx.conf
```

### 5. The TLS certificate

nginx won't start without one, so issue it first with a throwaway container:

```bash
cd ~/fintwin
docker run --rm -p 80:80 \
  -v fintwin_letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d your-domain --email you@example.com --agree-tos --no-eff-email

# nginx expects them here
docker run --rm -v fintwin_letsencrypt:/c alpine sh -c \
  'cp /c/live/your-domain/fullchain.pem /c/fullchain.pem && \
   cp /c/live/your-domain/privkey.pem  /c/privkey.pem'
```

The `certbot` service in the compose file renews it every 12 hours from then on.

### 6. First start

```bash
cd ~/fintwin
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <your-github-user> --password-stdin
docker compose -f docker-compose.azure.yml --env-file .env.prod pull
docker compose -f docker-compose.azure.yml --env-file .env.prod up -d
```

The first start downloads the model (~2 GB), which takes a few minutes. Watch
it: `docker compose -f docker-compose.azure.yml logs -f ollama-pull`.

Then check:

```bash
curl -s localhost/actuator/health          # backend: {"status":"UP"}
curl -sI https://your-domain               # nginx + TLS
docker compose -f docker-compose.azure.yml ps
```

### 7. Deploys from CI

In the repo's GitHub settings add:

| Kind | Name | Value |
|---|---|---|
| Secret | `DEPLOY_HOST` | the VM's public IP |
| Secret | `DEPLOY_USER` | `fintwin` |
| Secret | `DEPLOY_SSH_KEY` | a private key whose public half is in the VM's `~/.ssh/authorized_keys` |
| Variable | `PROD_BASE_URL` | `https://your-domain` |

Every push to `main` then builds the four images, pushes them to GHCR, and
tells the VM to pull and restart. The VM keeps its own `.env.prod`, so secrets
never pass through GitHub.

---

## Running it

```bash
cd ~/fintwin
C="docker compose -f docker-compose.azure.yml --env-file .env.prod"

$C ps                     # what's up
$C logs -f backend        # follow one service
$C restart ai-service
$C down && $C up -d       # full restart
docker stats --no-stream  # who's using the memory
```

**Database migrations** run themselves: Flyway applies anything new when the
backend starts, so a deploy that adds a migration needs nothing extra.

**Backups** are Supabase's job — daily on the free tier, point-in-time on Pro.
The VM holds nothing you can't rebuild except `.env.prod` and the TLS
certificate, both of which take a minute to recreate.

---

## When something is wrong

| Symptom | Where to look |
|---|---|
| 502 from nginx | `$C logs backend` — it may have failed to start on a missing secret (`APP_REQUIRE_SECURE_CONFIG` refuses dev defaults) |
| Copilot says it's unavailable | `$C logs ollama`; `docker exec -it fintwin-ollama-1 ollama list` should show the model |
| Copilot answers are slow | Normal on 2 shared vCPUs: 10–25 s. Faster needs more CPU, not more RAM |
| Sign-up emails don't arrive | `$C logs identity-service`; Gmail needs an app password, not the account one |
| Out of memory / a service keeps restarting | `docker stats`. Ollama plus two JVMs is most of 8 GB; don't add services without resizing |
| Certificate expired | `$C logs certbot`; renew by hand with the command in step 5 |

**Resizing** is one command and about a minute of downtime:

```bash
az vm resize --resource-group fintwin --name fintwin-vm --size Standard_B4as_v2
```

---

## What this gives up, compared with Kubernetes

Worth knowing before a paying customer depends on it:

- **One machine.** If the VM reboots, the app is down for a minute or two while
  containers restart; if it dies, until you rebuild it. Automatic failover was
  what the cluster bought.
- **Deploys have a gap.** `up -d` stops the old container before the new one
  serves. Expect a few seconds of 502s per deploy. Rolling updates were the
  other thing the cluster bought.
- **Scaling is vertical.** A bigger VM, not more replicas. Fine to a few
  hundred users; past that, move the AI service (with Ollama) onto its own box
  first — it's the part that needs the CPU.
- **Monitoring is basic.** Prometheus and Grafana aren't in this file; they'd
  take another ~1 GB. `docker stats` and the logs are what you have. Azure
  Monitor's free tier covers CPU, memory and disk alerts on the VM itself.
