# Running FinTwin.ai on Azure App Service

Four web apps on one Linux plan. Azure handles TLS, certificates and OS
patching, and deployment slots give you swaps instead of downtime. It costs
roughly 2.5× the single VM — see [azure-vm-deployment.md](azure-vm-deployment.md)
for that option, which is still in the repo and still works.

```
App Service plan (P1v3 — 2 vCPU / 8 GB)
├── fintwin-web    nginx + the React app   → the only app with your domain on it
│                  proxies /api/auth|2fa|token|admin → fintwin-auth
│                           everything else under /api → fintwin-api
├── fintwin-api    Spring Boot backend     :8080
├── fintwin-auth   identity service        :8090
└── fintwin-ai     FastAPI + Ollama        :8000   (~4 GB of the plan)

Supabase → Postgres
```

**No application code changed for this.** Both Java services already take their
port from an environment variable, and the frontend calls `/api/...` relatively,
which is why the front door proxies rather than the browser calling three
hostnames — one origin means CORS and cookies keep working as they do today.

---

## What it costs

Central India, pay-as-you-go, September 2026. Check the
[pricing calculator](https://azure.microsoft.com/pricing/calculator/) — prices move.

| Item | Monthly |
|---|---|
| App Service plan, P1v3 (2 vCPU / 8 GB) | ~$113 |
| Supabase | $0–25 |
| GHCR, managed certificates, custom domain | $0 |
| **Total** | **~$113–138** |

**P1v3 is the smallest that fits.** The four apps share the plan's memory:
Ollama ~4 GB, backend ~1 GB, identity ~0.75 GB, front door ~0.1 GB. A B3
(4 vCPU / 7 GB, ~$97) technically fits and gives more CPU — which is what makes
Copilot answers faster — but leaves no headroom, and Basic has no deployment
slots, which is half the reason to be on App Service at all.

---

## Setting it up

### 1. Secrets

Same `.env.prod` as the VM setup (see the VM runbook for how to generate the
keys). It is read by the script below and never committed.
[azure-env-variables.md](azure-env-variables.md) lists every variable each of
the four apps needs, with the exact value to paste.

Mail is **not optional in production.** With no provider configured, sign-up
returns the verification OTP — and "forgot password" returns the reset link —
in the API response itself, which is how local development works without a
mailbox. Anyone could then verify, or take over, an address they do not own, so
both Java services refuse to start in production with mail unset.

### 2. Create everything

```bash
az login
FINTWIN_ENV_FILE=.env.prod scripts/azure-app-service-setup.sh
```

This creates the resource group, the plan and the four web apps, sets every
app setting from `.env.prod`, turns on Always On, and sets health-check paths.
Override `PREFIX=` if `fintwin-*.azurewebsites.net` names are taken — they are
global.

### 3. Let App Service pull your images

GHCR packages are private by default. Either make the four packages public in
GitHub, or give each app a read token:

```bash
for app in fintwin-web fintwin-api fintwin-auth fintwin-ai; do
  az webapp config appsettings set -g fintwin -n $app --settings \
    DOCKER_REGISTRY_SERVER_URL=https://ghcr.io \
    DOCKER_REGISTRY_SERVER_USERNAME=<github-user> \
    DOCKER_REGISTRY_SERVER_PASSWORD=<classic PAT, read:packages> > /dev/null
done
```

### 4. Deploys from CI

```bash
az ad sp create-for-rbac --name fintwin-deploy --role contributor \
  --scopes /subscriptions/<sub-id>/resourceGroups/fintwin --sdk-auth
```

In the repo's GitHub settings:

| Kind | Name | Value |
|---|---|---|
| Secret | `AZURE_CREDENTIALS` | the JSON that command printed |
| Variable | `DEPLOY_TARGET` | `appservice` — this switches CI from the VM job to the App Service job |
| Variable | `AZURE_RESOURCE_GROUP` | `fintwin` |
| Variable | `AZURE_APP_PREFIX` | `fintwin` |
| Variable | `PROD_BASE_URL` | `https://fintwin-web.azurewebsites.net` or your domain |

Every push to `main` then builds six images, points each web app at this
commit's image and restarts them — AI first, front door last, so the proxy
comes back once what it proxies to is up.

### 5. Your domain

```bash
az webapp config hostname add -g fintwin --webapp-name fintwin-web --hostname your-domain
az webapp config ssl create   -g fintwin --name fintwin-web --hostname your-domain
```

Then point `CORS_ALLOWED_ORIGINS` and `APP_BASE_URL` at it and restart the two
Java apps. The certificate is free and renews itself — no certbot.

---

## The model

The ~2 GB model is **not** in the image; it downloads on first start into
`/home/ollama`, which App Service keeps across restarts and redeploys.

- **First start takes 5–15 minutes.** The AI service answers immediately; the
  Copilot replies "temporarily unavailable" until the download finishes.
  Watch it: `az webapp log tail -g fintwin -n fintwin-ai`.
- **`WEBSITES_ENABLE_APP_SERVICE_STORAGE=true` must stay on** for the AI app.
  Turn it off and every restart re-downloads 2 GB.
- `/home` is network-backed storage, so the model loads more slowly than from a
  local disk on the VM. Expect the first answer after an idle period to be
  slower than the rest.

---

## Monitoring

Production monitoring is **Grafana Cloud's free tier, scraping the apps over
HTTPS.** Nothing extra runs on the plan, so Ollama keeps its memory. You get
the same dashboards as the local Prometheus and Grafana, 14 days of history,
and email alerts.

```
fintwin-api  /actuator/prometheus ─┐   Bearer METRICS_TOKEN
fintwin-ai   /metrics             ─┴──────────────────────── Grafana Cloud: dashboards + alerts
```

Prometheus itself can't run well here. Its database needs a local disk, App
Service only keeps `/home`, and that is slow network storage.

### What you see without Grafana

The admin page works on its own, from the backend and the database:

| Admin tab | Shows | History |
|---|---|---|
| **AI Usage** | Tokens per user and per AI feature, input and output, calls, tokens per day | Kept in the database (`ai_token_usage`), no limit |
| **Monitoring** | Live backend numbers: logins, HTTP rate and errors, JVM heap, DB pool, AI circuit breaker | Only while the tab is open; resets on restart |

Grafana adds the rest: history for everything, the AI service's own metrics
(generation speed, context-window fill, guardrail fallbacks), and alerts.

### The metrics endpoints are closed by default

Every app here has a public URL, so `/actuator/prometheus` (backend) and
`/metrics` (AI service) need `Authorization: Bearer <METRICS_TOKEN>`. Without
`METRICS_TOKEN` set they answer 404. The setup script requires it; generate it
with `openssl rand -hex 32`. The identity service exposes health only, no
metrics.

### Setting up Grafana Cloud (about 15 minutes, once)

1. **Sign up** at grafana.com (free, no card) and create a stack in the region
   nearest Central India.
2. **Add two scrape jobs:** Connections → Add new connection → **Metrics
   Endpoint**. Use exactly these job names, because the alert rules match
   `job=~"fintwin-.*"`:

   | Job name | Scrape URL | Auth |
   |---|---|---|
   | `fintwin-backend` | `https://fintwin-api.azurewebsites.net/actuator/prometheus` | Bearer, token = `METRICS_TOKEN` (without the word "Bearer") |
   | `fintwin-ai-service` | `https://fintwin-ai.azurewebsites.net/metrics` | Bearer, same token |

   Leave the scrape interval at 60 s, which the free tier is sized for. Use
   **Test connection** on each: a 401 means the token doesn't match the app
   setting.
3. **Import the dashboards:** Dashboards → New → Import, then upload
   `ops/grafana/dashboard-json/ai-tokens.json` and
   `ops/grafana/dashboard-json/fintwin.json`. Pick the stack's Prometheus data
   source (`grafanacloud-<stack>-prom`) when asked.
4. **Load the alert rules** from `ops/prometheus-alerts.yml`, the same 8 rules
   local Prometheus runs. With `mimirtool`, using the Prometheus URL, instance
   ID and an access-policy token (`rules:write`) from the stack's Prometheus
   details page:

   ```bash
   mimirtool rules load ops/prometheus-alerts.yml \
     --address=https://<prometheus-host>.grafana.net/api/prom \
     --id=<instance-id> --key=<access-policy-token>
   ```

   Without `mimirtool`, create each rule under Alerting → Alert rules → New
   alert rule, copying its expression, `for` duration and summary.
5. **Send alerts to you:** Alerting → Contact points, add your email, and make
   it the default notification policy.
6. **Link it from the admin page:** set `GRAFANA_URL` on `fintwin-api` to the
   dashboard's URL. The Monitoring tab then shows a "Grafana dashboards &
   history" button.

### Limits to know

- **Free tier:** 10,000 active series. Measured locally, the backend exports
  about 280 series at start, and each endpoint and status that gets traffic
  adds about 14 more (11 buckets, count, sum, max). That's roughly 4,000 at full use, plus about 250 from the
  AI service. The backend uses 10 fixed latency buckets instead of a full
  histogram (about 74 per endpoint) to stay well inside the limit.
- **One instance per app.** A scrape reaches whichever instance the load
  balancer picks. If you scale out to 2+ instances, each scrape sees only one of
  them.
- **The AI service sums its uvicorn workers** through
  `PROMETHEUS_MULTIPROC_DIR` (set in the image). Without it, each scrape would
  read one worker at random.

---

## Day to day

```bash
az webapp log tail       -g fintwin -n fintwin-api      # follow logs
az webapp restart        -g fintwin -n fintwin-ai
az webapp show           -g fintwin -n fintwin-web --query state
az webapp config appsettings list -g fintwin -n fintwin-api --output table
```

**Zero-downtime deploys** need a staging slot (Standard or Premium):

```bash
az webapp deployment slot create -g fintwin -n fintwin-api --slot staging
az webapp deployment slot swap   -g fintwin -n fintwin-api --slot staging
```

Deploy to `staging`, check it, then swap. A swap is also the fastest rollback.

**Database migrations** run themselves — Flyway applies anything new when the
backend starts. With slots, warm the staging slot *before* swapping, so
migrations finish while the old version is still serving.

---

## When something is wrong

| Symptom | Where to look |
|---|---|
| Front door returns 502 | `az webapp log tail -n fintwin-web` — usually the backend app is still starting; nginx resolves the upstreams per request, so it recovers on its own |
| App won't start, no logs | Almost always the image pull: check `DOCKER_REGISTRY_SERVER_*` settings |
| Copilot says it's unavailable | The model is still downloading, or `WEBSITES_ENABLE_APP_SERVICE_STORAGE` got turned off — check `az webapp log tail -n fintwin-ai` |
| Copilot times out | The plan's CPU is shared across four apps. P1v3 gives 2 vCPU; answers take 30–60 s |
| Backend or identity exits at startup | `APP_REQUIRE_SECURE_CONFIG=true` refuses dev-default secrets and a missing `MAIL_USERNAME`/`MAIL_PASSWORD` — the log names the setting |
| Everything got slow | `az monitor metrics list --resource <plan-id> --metric MemoryPercentage` — Ollama plus two JVMs is most of 8 GB |
| Grafana shows no data / "service down" alert | `METRICS_TOKEN` differs between the app setting and the scrape job, or the app is restarting. `curl -H "Authorization: Bearer $METRICS_TOKEN" https://fintwin-api.azurewebsites.net/actuator/prometheus` should return text |

---

## What to know before choosing this over the VM

- **Your services get public URLs.** `fintwin-api`, `fintwin-auth` and
  `fintwin-ai` are reachable from the internet. The AI service checks
  `X-Internal-Key`, and the two Java services check JWTs, so they are not
  *open* — but on the VM they were unreachable altogether. Closing this properly
  means VNet integration with private endpoints, which costs more again.
- **Four apps share one plan's CPU and memory.** A heavy statement import and a
  Copilot answer at the same time compete; on the VM they did too, but there you
  can see it with `docker stats`.
- **`/home` is slower than local disk**, which the model loading notices.
- **The combined AI + Ollama image is new and hasn't run in Azure yet.** Expect
  the first deploy to need a look at the logs.
