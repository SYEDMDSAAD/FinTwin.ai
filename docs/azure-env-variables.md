# Every variable to set in Azure

Written for the App Service setup (four web apps) with **no custom domain** —
the app lives at `https://fintwin-web.azurewebsites.net`. If you take a domain
later, only the five URL values change; they are marked **[URL]** below.

Values are literal: paste them exactly as written. Where a value is yours, the
table says where it comes from — either a one-line command that generates it or
the file on your laptop that already holds it. **Nothing secret is written in
this file, and nothing secret should ever be committed to this repo.**

`scripts/azure-app-service-setup.sh` sets every one of these for you from a
`.env.prod` file. This page is the reference behind that script — for filling in
`.env.prod`, for the Azure portal, and for checking what a running app has.

---

## 1. Five secrets you generate once

Run these four commands, paste each output into `.env.prod`, and keep a copy in
a password manager:

```bash
openssl rand -base64 48    # JWT_SECRET
openssl rand -base64 32    # FINTWIN_ENCRYPTION_KEY
openssl rand -base64 32    # AI_INTERNAL_KEY
openssl rand -base64 32    # ADMIN_KEY
```

| Name | What it does | If you lose it |
|---|---|---|
| `JWT_SECRET` | Signs login tokens. **The backend and identity service must have the same value** | Everyone is logged out. Harmless |
| `FINTWIN_ENCRYPTION_KEY` | Encrypts names, emails, amounts and categories in the database | **Every stored value becomes unreadable. There is no recovery** |
| `AI_INTERNAL_KEY` | The backend's password to the AI service. Same value in both apps | Copilot stops answering until both match again |
| `ADMIN_KEY` | Unlocks the admin bootstrap endpoint | Regenerate freely |

`JWT_SECRET` and `FINTWIN_ENCRYPTION_KEY` **must match what your data was
written with.** Your Supabase database already holds data encrypted with the
keys in `backend/.env` — so for production, copy those two from `backend/.env`
rather than generating new ones. Generate fresh ones only for an empty database.

## 2. Values you copy from `backend/.env`

Already on your laptop, already working:

| Name | Where it is |
|---|---|
| `DB_URL` | `backend/.env` — `jdbc:postgresql://aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require` (the pooler host, not the direct one) |
| `DB_USERNAME` | `backend/.env` — `postgres.<your project ref>` |
| `DB_PASSWORD` | `backend/.env` — your Supabase password |
| `MAIL_USERNAME` | `backend/.env` — the Gmail address that sends OTPs |
| `MAIL_PASSWORD` | `backend/.env` — the Gmail **app password** (16 characters, no spaces) |
| `GOOGLE_CLIENT_ID` | `backend/.env` — ends in `.apps.googleusercontent.com` |

Mail is not optional in production. Without it, sign-up returns the verification
OTP — and "forgot password" the reset link — in the API response, so anyone
could verify or take over an address they do not own. Both Java apps refuse to
start rather than do that.

One thing to change in Google Cloud Console → Credentials → your OAuth client:
add `https://fintwin-web.azurewebsites.net` to **Authorised JavaScript origins**,
or Google sign-in fails in production.

---

## 3. `fintwin-api` — the backend

| Name | Value |
|---|---|
| `WEBSITES_PORT` | `8080` |
| `SERVER_PORT` | `8080` |
| `APP_REQUIRE_SECURE_CONFIG` | `true` |
| `DB_URL` | from `backend/.env` |
| `DB_USERNAME` | from `backend/.env` |
| `DB_PASSWORD` | from `backend/.env` |
| `DB_POOL_MAX` | `20` |
| `DDL_AUTO` | `validate` |
| `SHOW_SQL` | `false` |
| `FLYWAY_ENABLED` | `true` |
| `FLYWAY_BASELINE` | `true` |
| `JWT_SECRET` | your generated/copied value |
| `FINTWIN_ENCRYPTION_KEY` | your generated/copied value |
| `AI_INTERNAL_KEY` | your generated value |
| `ADMIN_KEY` | your generated value |
| `AI_SERVICE_URL` | `https://fintwin-ai.azurewebsites.net` **[URL]** |
| `CORS_ALLOWED_ORIGINS` | `https://fintwin-web.azurewebsites.net` **[URL]** |
| `MAIL_ENABLED` | `true` |
| `MAIL_HOST` | `smtp.gmail.com` |
| `MAIL_PORT` | `587` |
| `MAIL_USERNAME` | from `backend/.env` |
| `MAIL_PASSWORD` | from `backend/.env` |
| `MAIL_FROM` | `FinTwin AI` |
| `GOOGLE_CLIENT_ID` | from `backend/.env` |

The backend needs mail of its own: it sends password-reset links and the replies
you write in the admin Support Tickets tab.

## 4. `fintwin-auth` — the identity service

Sign-up, login, 2FA, refresh tokens. Same database, same two keys.

| Name | Value |
|---|---|
| `WEBSITES_PORT` | `8090` |
| `IDENTITY_PORT` | `8090` |
| `APP_REQUIRE_SECURE_CONFIG` | `true` |
| `DB_URL` | same as the backend |
| `DB_USERNAME` | same as the backend |
| `DB_PASSWORD` | same as the backend |
| `DB_POOL_MAX` | `10` |
| `JWT_SECRET` | **the same value as the backend** |
| `FINTWIN_ENCRYPTION_KEY` | **the same value as the backend** |
| `APP_BASE_URL` | `https://fintwin-web.azurewebsites.net` **[URL]** |
| `CORS_ALLOWED_ORIGINS` | `https://fintwin-web.azurewebsites.net` **[URL]** |
| `MAIL_ENABLED` | `true` |
| `MAIL_HOST` | `smtp.gmail.com` |
| `MAIL_PORT` | `587` |
| `MAIL_USERNAME` | from `backend/.env` |
| `MAIL_PASSWORD` | from `backend/.env` |
| `MAIL_FROM` | `FinTwin AI` |
| `GOOGLE_CLIENT_ID` | from `backend/.env` |
| `ADMIN_KEY` | your generated value |

`APP_BASE_URL` is what password-reset links point at, so it must be the address
users actually open.

## 5. `fintwin-ai` — FastAPI + Ollama

| Name | Value |
|---|---|
| `WEBSITES_PORT` | `8000` |
| `PORT` | `8000` |
| `WEBSITES_ENABLE_APP_SERVICE_STORAGE` | `true` — **leave this on**, or every restart re-downloads 2 GB |
| `WEBSITES_CONTAINER_START_TIME_LIMIT` | `1800` |
| `OLLAMA_MODELS` | `/home/ollama` |
| `OLLAMA_MODEL` | `qwen2.5:3b` |
| `OLLAMA_KEEP_ALIVE` | `30m` |
| `AI_INTERNAL_KEY` | **the same value as the backend** |
| `BACKEND_URL` | `https://fintwin-api.azurewebsites.net` **[URL]** |
| `ALLOWED_ORIGINS` | `https://fintwin-web.azurewebsites.net` **[URL]** |
| `UVICORN_WORKERS` | `2` |

## 6. `fintwin-web` — the front door

nginx serving the React app and proxying `/api` to the other two.

| Name | Value |
|---|---|
| `WEBSITES_PORT` | `8080` |
| `PORT` | `8080` |
| `BACKEND_HOST` | `fintwin-api.azurewebsites.net` **[URL]** — hostname only, no `https://` |
| `IDENTITY_HOST` | `fintwin-auth.azurewebsites.net` **[URL]** — hostname only, no `https://` |

## 7. All four apps — pulling the images

GHCR packages are private by default. Either make the packages public in GitHub,
or set these three on **each** of the four apps:

| Name | Value |
|---|---|
| `DOCKER_REGISTRY_SERVER_URL` | `https://ghcr.io` |
| `DOCKER_REGISTRY_SERVER_USERNAME` | your GitHub username |
| `DOCKER_REGISTRY_SERVER_PASSWORD` | a classic GitHub PAT with `read:packages` |

---

## 8. In GitHub, not Azure

Settings → Secrets and variables → Actions.

| Kind | Name | Value |
|---|---|---|
| Secret | `AZURE_CREDENTIALS` | the JSON from `az ad sp create-for-rbac … --sdk-auth` |
| Variable | `DEPLOY_TARGET` | `appservice` — without this, CI runs the VM deploy job instead |
| Variable | `AZURE_RESOURCE_GROUP` | `fintwin` |
| Variable | `AZURE_APP_PREFIX` | `fintwin` |
| Variable | `PROD_BASE_URL` | `https://fintwin-web.azurewebsites.net` **[URL]** |
| Variable | `VITE_GOOGLE_CLIENT_ID` | the same Google client id — Vite bakes it into the bundle at **build** time, so it has to be here, not in Azure |

`VITE_GOOGLE_CLIENT_ID` is the one variable that is not an app setting. Setting
it in Azure does nothing: by then the JavaScript is already built. Miss it and
everything works except the "Sign in with Google" button.

---

## 9. Leave these unset

They have working defaults or belong to features you are not running yet.
Setting them wrong causes more trouble than leaving them empty.

| Name | Why |
|---|---|
| `REDIS_URL` | There is no Redis on App Service. Empty means in-memory caching and rate limiting, which is correct for one instance per app |
| `SETU_*` | The bank sandbox. Only needed if you keep the demo Connect Bank button working; `SETU_REDIRECT_URL` would become `https://fintwin-web.azurewebsites.net/bank-connected` |
| `INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_SECRET` | Bank alert email import — needs a domain you own, so it stays off |
| `SMS_*` | Phone OTP. No provider configured, and nothing in the beta requires a verified phone |
| `SWAGGER_ENABLED` | Defaults to `false`. Keep it that way in production |
| `ZIPKIN_URL`, `TRACING_SAMPLE_RATE` | Tracing, off by default |
| `SECURITY_ALERTS_*`, `MAX_UPLOAD_SIZE`, `AI_*_TIMEOUT_MS`, `CHAT_BUDGET_SECONDS`, `FALLBACK_USD_INR`, `GOLD_*`, `OCR_MAX_FILE_BYTES` | Tunables whose defaults are what you have been testing with |
| `VITE_API_URL` | Left over. The frontend calls `/api/...` relatively, so it is never read |

---

## 10. Checking what is actually set

```bash
# everything one app has, as a table
az webapp config appsettings list -g fintwin -n fintwin-api --output table

# just the names, to spot what is missing
az webapp config appsettings list -g fintwin -n fintwin-auth --query "[].name" -o tsv

# change one without touching the rest (the app restarts)
az webapp config appsettings set -g fintwin -n fintwin-api --settings MAIL_PORT=587
```

If an app dies on startup, `az webapp log tail -g fintwin -n <app>` prints the
reason. Both Java apps name the exact missing setting before they exit — that is
what `APP_REQUIRE_SECURE_CONFIG=true` buys you:

```
STARTUP ABORTED: insecure configuration in a production profile.
[SECURITY] MAIL_ENABLED/MAIL_USERNAME are not set.
```

### The three mistakes that actually happen

1. **`JWT_SECRET` or `FINTWIN_ENCRYPTION_KEY` differing between the two Java
   apps.** Logins look fine until a request crosses services, and mismatched
   encryption keys make existing rows unreadable.
2. **Setting `VITE_GOOGLE_CLIENT_ID` in Azure instead of GitHub.** It is a build
   variable; Azure never sees it.
3. **`BACKEND_HOST` written as `https://fintwin-api.azurewebsites.net`.** nginx
   wants the bare hostname — with the scheme, every `/api` call 502s.

---

## 11. Key Vault

Optional, and worth doing: it takes the secret *values* out of the App Service
settings blade, so the portal, `az webapp config appsettings list`, and anyone
with Reader access see a reference instead of your database password. The app
never sees the difference — App Service resolves the reference at startup and
hands the value to the container as an ordinary environment variable.

```bash
FINTWIN_ENV_FILE=.env.prod scripts/azure-keyvault-setup.sh
```

That script does everything below. Read on if you would rather do it by hand,
or want to know what it did.

### What goes in the vault

Six secrets. Vault names allow letters, digits and dashes only — no underscores
— so they are not simply the variable names:

| Vault secret | App setting it replaces | Which apps |
|---|---|---|
| `jwt-secret` | `JWT_SECRET` | api, auth |
| `encryption-key` | `FINTWIN_ENCRYPTION_KEY` | api, auth |
| `db-password` | `DB_PASSWORD` | api, auth |
| `ai-internal-key` | `AI_INTERNAL_KEY` | api, ai |
| `admin-key` | `ADMIN_KEY` | api, auth |
| `mail-password` | `MAIL_PASSWORD` | api, auth |

And these only if you switch those features on: `internal-key`,
`setu-client-secret`, `setu-webhook-secret`, `inbound-email-secret`,
`sms-api-key`.

### What stays a plain app setting

Everything else in sections 3–7 — ports, the `azurewebsites.net` URLs,
`OLLAMA_MODEL`, `DDL_AUTO`, `APP_REQUIRE_SECURE_CONFIG`, `MAIL_HOST`,
`MAIL_PORT`, `MAIL_FROM`, `DB_URL`, `DB_USERNAME`. None of it is secret, and a
Key Vault reference is one more thing that can fail at startup.

Three that must **not** move into the vault:

- **`GOOGLE_CLIENT_ID`** — a public client id. It ships inside the JavaScript
  bundle; hiding it in a vault would be theatre.
- **`VITE_GOOGLE_CLIENT_ID`** — a GitHub build variable, baked into the bundle
  before Azure is involved. Azure never reads it.
- **`DOCKER_REGISTRY_SERVER_PASSWORD`** — used to *pull the image*, before the
  app runs, so a reference may not have resolved yet. Leave it as a plain
  setting, or avoid it entirely by making the GHCR packages public.

### Doing it by hand

```bash
# 1. A vault using RBAC rather than the older access policies
az keyvault create -g fintwin -n fintwin-kv -l centralindia \
    --enable-rbac-authorization true

VAULT_ID=$(az keyvault show -g fintwin -n fintwin-kv --query id -o tsv)

# 2. Let yourself write secrets (creating a vault does not grant this)
az role assignment create --role "Key Vault Secrets Officer" \
    --assignee-object-id "$(az ad signed-in-user show --query id -o tsv)" \
    --assignee-principal-type User --scope "$VAULT_ID"

# 3. Store each secret
az keyvault secret set --vault-name fintwin-kv -n jwt-secret --value "<value>"

# 4. Give each app an identity that may read the vault
az webapp identity assign -g fintwin -n fintwin-api
az role assignment create --role "Key Vault Secrets User" \
    --assignee-object-id "$(az webapp identity show -g fintwin -n fintwin-api --query principalId -o tsv)" \
    --assignee-principal-type ServicePrincipal --scope "$VAULT_ID"

# 5. Replace the setting with a reference
az webapp config appsettings set -g fintwin -n fintwin-api --settings \
    JWT_SECRET="@Microsoft.KeyVault(SecretUri=https://fintwin-kv.vault.azure.net/secrets/jwt-secret/)"
```

The trailing slash after the secret name matters: with it, the app always gets
the current version, so rotating a secret does not mean editing app settings.

### Things that bite

- **Role assignments take a minute to propagate.** A 403 right after granting
  access usually means "too soon", not "wrong role". The script sleeps for this.
- **A broken reference fails at startup, not at deploy.** The settings blade
  marks the reference red, and `az webapp log tail` shows the app exiting. Check
  after the first run: `az webapp config appsettings list -g fintwin -n fintwin-api
  --query "[?contains(value,'KeyVault')]" -o table`.
- **Rotation needs a restart.** References resolve when the app starts (and
  refresh within 24 hours). After changing a secret, restart the apps using it.
- **`FINTWIN_ENCRYPTION_KEY` is not rotatable this way.** Existing rows are
  encrypted with the old key; changing it makes them unreadable. Treat the vault
  as the place it is kept, not a place it changes.
- **If you put the vault behind a firewall**, allow trusted Microsoft services,
  or the apps cannot read it.
- **Cost is negligible** — a standard vault is about $0.03 per 10,000
  operations, and four apps starting read a handful each.


│ Vault secret name │        Replaces        │  Used by  │
├───────────────────┼────────────────────────┼───────────┤
│ jwt-secret        │ JWT_SECRET             │ api, auth │
├───────────────────┼────────────────────────┼───────────┤
│ encryption-key    │ FINTWIN_ENCRYPTION_KEY │ api, auth │
├───────────────────┼────────────────────────┼───────────┤
│ db-password       │ DB_PASSWORD            │ api, auth │
├───────────────────┼────────────────────────┼───────────┤
│ ai-internal-key   │ AI_INTERNAL_KEY        │ api, ai   │
├───────────────────┼────────────────────────┼───────────┤
│ admin-key         │ ADMIN_KEY              │ api, auth │
├───────────────────┼────────────────────────┼───────────┤
│ mail-password     │ MAIL_PASSWORD          │ api, auth │