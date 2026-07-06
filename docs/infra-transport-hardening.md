# Infrastructure Transport & Segmentation Hardening

**Date:** 2026-07-06
**Branch:** `main`
**Scope:** Deployment-layer security — TLS in transit, encryption at rest, network segmentation, and making misconfiguration visible to admins at runtime.
**Companion docs:** [backend-admin-authorization-fixes.md](backend-admin-authorization-fixes.md) · [security-policy.md](security-policy.md) · [production-readiness.md](production-readiness.md)

Follows the application-layer audit. The field-level encryption fixes protect
data **inside** the database rows; this pass looks at the transport and storage
**around** them. External traffic was already properly TLS-terminated; the gaps
were all on internal service-to-service hops and network isolation.

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium

---

## Audit findings

### TLS in transit

| Hop | Status | Detail |
|---|--------|--------|
| Internet → cluster | ✅ Encrypted | nginx ingress + cert-manager/Let's Encrypt, `ssl-redirect: true`. |
| Backend ↔ Postgres | 🟠 Plaintext | `DB_URL` had no `sslmode=require`; in-cluster traffic unencrypted. |
| Backend ↔ AI service | 🟠 Plaintext | `AI_SERVICE_URL=http://ai-service:8000` — internal key + financial payloads in the clear. |
| Backend ↔ Redis | 🟡 Plaintext + no auth | `redis://redis-service:6379`, no `requirepass`, no password. |

The app's config comments are correct that an *external* managed DB should use
`?sslmode=require`. The gap is specifically the **in-cluster** path, where no
pod-to-pod traffic was encrypted — made worse by the absence of any
`NetworkPolicy` (see below).

### Encryption at rest

- 🟡 **In-cluster Postgres unconfirmed.** `postgres-pvc` uses
  `storageClassName: ""` (cluster default), so at-rest encryption depends on
  whether that default StorageClass encrypts. The manifest itself recommends a
  managed DB (RDS / Cloud SQL / Supabase) — all of which encrypt at rest by
  default. **In the recommended deployment this is covered; in the bundled
  in-cluster path it is not guaranteed.**

### Adjacent

- **No `NetworkPolicy`** anywhere — zero segmentation; any compromised pod could
  reach Postgres, Redis, and the AI service directly.
- **`/actuator` + `/admin` routed at the public ingress.** `/actuator/prometheus`
  is `permitAll` → publicly scrapeable metrics (minor info leak).
  `/admin/**` bootstrap endpoints are internet-reachable, gated only by the
  constant-time `X-Admin-Key` (fails closed, so not open — just more exposed
  than necessary).

---

## Fixed in this pass

### 1. Network segmentation — `k8s/network-policies.yaml` (new)

Default-deny **ingress** across the `fintwin` namespace, then explicit allows for
the real flows only:

- Postgres ← backend (5432)
- Redis ← backend (6379)
- AI service ← backend (8000)
- Backend ← ingress-nginx + Prometheus (8080)
- Frontend ← ingress-nginx (80)
- Prometheus ← Grafana (9090)

Egress is left open (DNS + outbound to Setu / Yahoo Finance / SMTP / Let's
Encrypt keep working without a large allow matrix). **Requires an enforcing CNI**
(Calico, Cilium, Weave, or the managed EKS/GKE/AKS equivalents) — plain
kubenet/flannel will not enforce these.

### 2. Redis authentication

- `k8s/redis/deployment.yaml` — `--requirepass $(REDIS_PASSWORD)`, sourced from
  the `fintwin-secrets` secret (never literal in the manifest). Health probes
  authenticate via `REDISCLI_AUTH`.
- `k8s/secret.yaml.template` — adds `REDIS_PASSWORD` and a password-bearing
  `REDIS_URL` (`redis://:<password>@redis-service:6379`).
- `k8s/configmap.yaml` — `REDIS_URL` removed (it now carries a credential and
  lives in the Secret; the backend's `envFrom` secretRef supersedes the
  ConfigMap).

### 3. Misconfiguration is now visible in the admin dashboard

The main ask: *if anything is wrong, the admin dashboard should get it.*
`GET /api/v1/admin/security/posture` now inspects security-sensitive runtime
config and returns a `configIssues` array (severity + area + detail), plus a
`configIssueCount`. Critical config issues force `riskLevel: HIGH` even when no
live attack is in progress — a deployment on dev defaults can no longer read
"LOW risk."

Checks surfaced: dev-default JWT secret, unset encryption key, unset AI internal
key, unset admin key, DB without `sslmode=require`, plaintext `http://` AI URL,
Redis URL without a password, CORS still allowing localhost. This mirrors the
startup-time `SecurityStartupValidator` but makes the state queryable at runtime
instead of only appearing in boot logs.

> **Frontend note:** the admin security view should render `configIssues` as a
> panel (red for CRITICAL, amber for HIGH/MEDIUM). The data is already in the
> `posture` response — no new endpoint needed.

---

## Still open — remaining TLS-in-transit work (item 3)

Encrypting the two internal hops is a **bigger lift** and is deliberately left as
a documented follow-up rather than half-applied, because a naive change breaks
connectivity (`sslmode=require` fails unless Postgres actually presents a cert).

### Backend ↔ Postgres
- **Managed DB (recommended):** set `DB_URL` / `FLYWAY_DB_URL` with
  `?sslmode=require` (RDS/Cloud SQL/Supabase all present valid certs). Lowest
  effort, closes the gap immediately. **Do this if using a managed DB.**
- **In-cluster Postgres:** mount a server cert/key into the StatefulSet, start
  with `ssl=on ssl_cert_file=... ssl_key_file=...`, then add `?sslmode=require`
  (or `verify-full` with the CA) to `DB_URL`. cert-manager can issue an internal
  cert. Do **not** add `sslmode=require` before Postgres has a cert — it will
  refuse to connect.

### Backend ↔ AI service
- **Service mesh (cleanest):** Linkerd or Istio gives automatic mTLS for all
  in-cluster traffic with no app changes — also covers the Redis/Postgres hops.
  Recommended if more than one internal hop needs encrypting.
- **Direct TLS:** terminate HTTPS on the FastAPI side (uvicorn `--ssl-keyfile`
  / `--ssl-certfile` or a sidecar) and switch `AI_SERVICE_URL` to `https://`.
  The backend `RestTemplate` must then trust the internal CA.

### At-rest (in-cluster Postgres)
- Set `postgres-pvc.storageClassName` to a StorageClass with encryption enabled
  (`gp3` on EKS, an encrypted PD class on GKE), or move to a managed DB.

### Ingress exposure
- Drop the `/actuator` route from the public ingress (keep Prometheus scraping
  in-cluster only), and restrict `/admin` to an internal path / IP allowlist —
  the `X-Admin-Key` gate stays as defense in depth.

Until these land, `configIssues` in the admin posture will keep flagging the DB
and AI-service hops whenever they're plaintext, so the state stays visible.

---

## Verification

- Backend: `mvn test` — **56 tests pass** (posture change is additive; compiles
  and runs clean).
- `k8s/network-policies.yaml` and `k8s/redis/deployment.yaml` validated as
  well-formed YAML. **Not applied to a live cluster** — apply behind an enforcing
  CNI and confirm pods still reach their dependencies before relying on the
  policies.
