# Backend Maturity & Security Review

**Date:** 2026-06-28
**Branch:** `feature/auth-insurance-anomaly`
**Scope:** Full Spring Boot backend (`backend/`) — security, architecture, maturity, subtle correctness issues
**Reviewer model:** Opus 4.8

This document is the **review + change requirements**. No code is changed by this file.
Each item lists: severity, location, the problem, and the specific fix. A phased
remediation plan is at the end.

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low/polish

---

## Implementation status (updated 2026-06-28)

All three phases have been implemented and the full test suite (48 tests) passes.

| Phase | Items | Status |
|-------|-------|--------|
| 1 — Security hardening | C1, C3, H2, M4, M5, M3 | ✅ done (commit `204a128`) |
| 2 — Auth correctness | C2, H1, M1, M2, M6 | ✅ done (commit `73575d3`) |
| 3 — Architecture maturity | H5, H3, H4, L1 | ✅ done (`73575d3` + follow-up) |
| Follow-up | C3 gate wired, H4 all endpoints, H5 ladder removed | ✅ done |

**Smoke-test finding (fixed):**
- 🔴 **Actuator health probes returned 401.** A standalone boot revealed that
  `SecurityConfig` never permitted `/actuator/**`, so `anyRequest().authenticated()`
  rejected `/actuator/health/liveness` and `/actuator/health/readiness` — the exact
  paths the k8s `deployment.yaml` uses for probes. Every pod would have failed
  readiness and never received traffic; Prometheus (`/actuator/prometheus`) was
  also blocked. Fixed by permitting `/actuator/health/**` and `/actuator/prometheus`
  while keeping other actuator endpoints secured. Verified: liveness/readiness/
  prometheus → 200, metrics → 401.

**H3 + mass-assignment (also done):**
- **H3 completed** — `addExpenseByText`/`uploadScreenshot` now persist the
  transaction + score snapshot inside a `TransactionTemplate`, with SMS/AI calls
  moved outside the transaction (no DB connection held across the network).
- **Create-time mass-assignment hardening** — `Asset`/`Liability`/`Budget`/
  `Investment` create paths null any client-supplied `id` so `save()` always
  inserts rather than merging over an arbitrary (possibly other-user) row.

**Follow-up round (also done):**
- **C3 gate wired** into `k8s/configmap.yaml` and `docker-compose.prod.yml`
  (`APP_REQUIRE_SECURE_CONFIG=true`), so the fail-fast check is active in prod.
- **H4 completed** for all entity-returning endpoints: added `AssetDTO`,
  `LiabilityDTO`, `BudgetDTO`, `FinancialGoalDTO`, `ScoreHistoryDTO` (plus the
  earlier `TransactionDTO`). `InvestmentController`/`RoleController` already
  avoided serializing entities. JSON contracts unchanged.
- **H5 completed**: all client-error throws across the services migrated to typed
  exceptions (`Auth`, `Budget`, `Bank`, `Goal`, `Crypto`, `Investment`, `Profile`,
  `TwoFactor`, `Notification`, `Ticket`, `RoleController`). The string-matching
  ladder in `GlobalExceptionHandler` has been **removed** — only the typed handler
  and a generic 500 fallback remain. Genuine upstream/internal failures (email,
  Setu, exchange APIs, OCR, QR) intentionally stay as 500s.

**Deliberately deferred / partial:**
- **H3** applied to pure-DB write methods only. Methods with trailing external
  calls (`addExpenseByText` → SMS, `uploadScreenshot` → AI) were left untransacted
  on purpose: `SmsService`/AI calls are blocking, and wrapping them would hold a DB
  connection across the network call. Making those atomic needs a refactor that
  splits the DB work from the side effect — tracked for a follow-up.
- Entity **request bodies** (e.g. `@RequestBody Asset`) still bind to JPA entities
  on create/update — a separate mass-assignment concern beyond H4's response scope.
- **L2/L3/L4** (EAGER fetch, optimistic locking, flyway pwd default) — **now done
  in Round 5** (see below). **L5/L6** (formatting, money-as-double) intentionally
  left — low value or high churn/risk.

---

## 🔴 CRITICAL

### C1. `/2fa/debug` endpoint leaks the TOTP secret and the live valid code
**File:** `controller/TwoFactorController.java:59-66`, `service/TwoFactorService.java:97-116`

The endpoint returns `secret`, `expectedCode` (the currently-valid 6-digit TOTP),
and `secondsRemaining` for the authenticated user. This **completely defeats 2FA** —
anyone with the user's session (e.g. an XSS-stolen JWT, or the user on a shared
machine) can read the seed and generate codes forever. It also exposes the raw
Base32 secret, which is the long-term credential.

**Fix:** Delete the `/2fa/debug` endpoint and `TwoFactorService.getDebugInfo()`
entirely. If a diagnostic is genuinely needed, gate it behind a `@Profile("dev")`
bean and never ship it in the prod artifact.

---

### C2. Account lockout fields exist but are never enforced on login
**File:** `service/AuthService.java:151-207`, `model/User.java:99-104`

`User` has `failedLoginAttempts` and `lockedUntil` (comment: "managed by
identity-service"), but the main backend's `AuthService.login()` never reads
`lockedUntil` and never increments `failedLoginAttempts`. The only brute-force
control on this path is the IP rate limiter (5/min) — which is bypassable (see C5).
A disabled lockout means credential-stuffing against a single account is feasible.

**Fix:** In `login()`:
1. Reject early if `lockedUntil` is in the future → `423 Locked` / clear message.
2. On bad password, increment `failedLoginAttempts`; when it crosses a threshold
   (e.g. 5), set `lockedUntil = now + 15min` and persist.
3. On successful auth, reset `failedLoginAttempts = 0` and `lockedUntil = null`.

---

### C3. Working production secrets default to publicly-known dev values
**File:** `application.properties:54,74,84`, `config/SecurityStartupValidator.java`

- `jwt.secret` defaults to the hard-coded `FinTwinSuperSecretJwtKeyForProduction2026SecureKey`.
- `encryption.key` falls back to a hard-coded dev AES key (`EncryptionConverter.DEV_KEY_B64`).
- `admin.key` defaults to empty (the only safe default — `isValidAdminKey` rejects blank).

`SecurityStartupValidator` only **logs a warning** for the first two. If `JWT_SECRET`
is unset in prod, the app boots happily with a signing key that is in the source
tree — anyone can **forge a valid ADMIN JWT**. Same exposure for the encryption key
(all "encrypted" PII is decryptable by anyone with the repo).

**Fix:** Make startup **fail-fast in production**. Introduce an explicit
`app.environment` / Spring profile check: when the active profile is `prod`
(or `app.require-secure-config=true`), throw `IllegalStateException` instead of
warning when any of `JWT_SECRET`, `FINTWIN_ENCRYPTION_KEY`, `ADMIN_KEY` is
missing/default. Keep warn-only behaviour for local dev.

---

## 🟠 HIGH

### H1. Brute-force / IP-block evasion via spoofable `X-Forwarded-For`
**File:** `security/RateLimitFilter.java:235-252`

`getClientIp()` trusts **any** RFC1918 source (`10.*`, `172.*`, `192.168.*`,
loopback) as a proxy and then reads the client-supplied `X-Forwarded-For` header,
taking the first token. In most container/k8s networks the pod sees private-range
peers, so an attacker who can reach the service can send a forged `X-Forwarded-For`
to rotate their apparent IP — defeating both the rate limiter (C2's only backstop)
and the `BlockedIP` blocklist.

**Fix:** Replace the hardcoded RFC1918 check with an explicit, configurable
trusted-proxy allowlist (`security.trusted-proxies=...`). Only honour
`X-Forwarded-For` when `remoteAddr` is in that list, and prefer the **rightmost**
untrusted hop rather than the leftmost (client-controlled) one. Default to "trust
nothing" so it uses `remoteAddr` unless explicitly configured.

### H2. Email enumeration on forgot-password / resend-verification
**File:** `service/AuthService.java:297-315` (`forgotPassword`), `exception/GlobalExceptionHandler.java:104-109`

`forgotPassword` throws `"No account found with that email address"` → mapped to
**404**, while a registered email returns 200. This lets an attacker enumerate which
emails have accounts. (`login` correctly returns a generic "Invalid credentials" —
good — but the reset path leaks.)

**Fix:** Always return the same generic 200 response ("If an account exists, a reset
link has been sent.") regardless of whether the email exists. Do the same for
`resendVerification` (it already returns null silently — make the controller
response identical in both branches).

### H3. Missing `@Transactional` on multi-write service methods
**File:** ~34 of ~40 services have **no** `@Transactional` (e.g. `AuthService.register`
does 3 `save()` calls + email send; `TransactionService.addExpenseByText` does
`save()` + `saveScoreSnapshot()` + SMS).

Without a transaction boundary, a failure between writes leaves partial state
(e.g. user row created but verification OTP never persisted, or transaction saved
but score snapshot missing). Each `save()` autocommits independently.

**Fix:** Annotate write methods with `@Transactional` (class-level
`@Transactional` on services, with `@Transactional(readOnly = true)` on pure reads
is the idiomatic pattern). Keep genuinely non-transactional side effects (email/SMS)
**after** commit or via an event listener so a mail failure can't roll back the user.

### H4. Controllers serialize JPA entities directly instead of DTOs
**File:** `service/TransactionService` returns `Transaction` / `List<Transaction>`;
`SecurityAdminService.listBlockedIPs()` returns `List<BlockedIP>`; 8 of 33
controllers import `com.fintwin.model.*`.

Returning entities couples the API contract to the DB schema, risks leaking fields
(mitigated here by `@JsonIgnore` on `user`, but fragile), and — with
`open-in-view=false` — can throw `LazyInitializationException` if any lazy
association is serialized after the transaction closes.

**Fix:** Introduce response DTOs for the entity-returning endpoints (Transaction
already has neighbours like `MonthlyExpenseDTO`; add a `TransactionDTO`). Map in the
service or a small mapper. This is the largest item — can be done incrementally,
endpoint by endpoint.

### H5. Control flow via `new RuntimeException(message)` + string matching
**File:** `exception/GlobalExceptionHandler.java:74-148`, 48 `throw new RuntimeException`
across services.

HTTP status is decided by **exact string comparison** on exception messages
(`"Invalid credentials".equals(msg)`, etc.). A reworded message silently changes
the status code (e.g. a 401 becomes a 500). It's brittle and untestable.

**Fix:** Introduce a small typed-exception hierarchy (e.g. `ApiException(HttpStatus,
String)` plus `NotFoundException`, `UnauthorizedException`, `ConflictException`)
and handle those in `GlobalExceptionHandler`. Replace the string-matching ladder.
`SecurityUtils.getCurrentUserEmail()` should throw `UnauthorizedException` (currently
a bare `RuntimeException` → falls through to 500 instead of 401).

---

## 🟡 MEDIUM

### M1. JwtFilter does 2 user lookups per request and writes non-JSON errors
**File:** `security/JwtFilter.java:127-145`

`loadUserByUsername(email)` then `loadUser(email)` = two `findByEmail` queries on
every authenticated request. Error bodies are plain text (`"JWT Token Expired"`,
`"User Not Found"`) — inconsistent with the JSON errors used everywhere else, and
`"User Not Found"` leaks account existence.

**Fix:** Load the `User` once and adapt it to `UserDetails` (or cache). Emit JSON
(`{"error":"..."}`) with a generic message for all failure branches.

### M2. Redundant JWT parsing per request
**File:** `JwtFilter` (extractEmail + extractClaims + validateToken = 3 parses),
`RateLimitFilter.extractEmailFromBearer` (a 4th parse).

Each call re-parses and re-verifies the signature. At load this is wasted CPU.

**Fix:** Parse claims **once** per request and reuse. Consider passing parsed claims
via a request attribute so RateLimitFilter and JwtFilter don't both parse.

### M3. `printStackTrace()` in service code
**File:** `service/GoalPlannerService.java:473`, `service/ReportService.java:394,613`

Writes to stderr, bypassing the structured logback/Logstash pipeline.
**Fix:** Replace with `log.error("...", e)`.

### M4. Non-constant-time admin-key comparison
**File:** `controller/AdminController.java:78` — `adminKey.equals(key)`

Timing side-channel on a static admin secret. Low practical risk but trivial to fix.
**Fix:** `MessageDigest.isEqual(adminKey.getBytes(UTF_8), key.getBytes(UTF_8))`
after a null/blank guard.

### M5. Duplicate `management.endpoints.web.exposure.include` key
**File:** `application.properties:101` and `:116`

The second declaration silently overrides the first. Confusing; a future edit to the
first line would be a no-op.
**Fix:** Consolidate into a single line (`health,info,metrics,prometheus`).

### M6. No global multipart size limit; screenshot upload unbounded
**File:** `service/TransactionService.uploadScreenshot` (no size/type check, unlike
`uploadCSV` which checks 5 MB + content-type).

**Fix:** Add `spring.servlet.multipart.max-file-size` / `max-request-size` in
properties, and a size + content-type guard in `uploadScreenshot` mirroring `uploadCSV`.

---

## 🟢 LOW / Polish

- **L1.** `EncryptionConverter` creates `new SecureRandom()` on every encrypt
  (`security/EncryptionConverter.java:75`). Use a single static instance.
- **L2.** Most `@ManyToOne` default to EAGER (only 5 of 13 are LAZY). Each entity
  load eagerly joins `User`. Make them `FetchType.LAZY` for consistency once DTOs
  (H4) remove the serialization dependency.
- **L3.** No `@Version` optimistic locking on entities with concurrent updates
  (e.g. `User` during 2FA/phone flows). Consider for write-heavy entities.
- **L4.** `spring.flyway.password` defaults to empty while `spring.datasource.password`
  defaults to `postgres` (`application.properties:5,33`) — inconsistent local default.
- **L5.** Heavy/irregular vertical whitespace in `SecurityConfig`, `JwtFilter`,
  `JwtUtil` hurts readability. Reformat to match the tighter style of newer files.
- **L6.** `Transaction.amount` is `Double` (money as floating point). Encrypted via
  `EncryptedDoubleConverter` so a `BigDecimal` migration is non-trivial — note as a
  known fintech tradeoff, revisit if rounding bugs surface.

---

## What's already solid (no change needed)

- AES-256/**GCM** field encryption with per-value random IV, graceful legacy fallback.
- Setu webhook **detached-JWS verification** against cached JWKS (stale-on-error).
- BCrypt strength 12; CSP + HSTS + frame-deny headers; CORS not wildcard.
- RBAC via `@EnableMethodSecurity` + `FinTwinPermissionEvaluator` ownership checks.
- Stateless JWT with **force-logout** (`lastLogoutAt`) and impersonation audit trail.
- Redis-backed distributed rate limiting with in-memory fallback; fail-open on Redis error.
- Audit aspect for PCI-DSS 10.2 events; Flyway-owned schema with `ddl-auto=validate`.
- Resilience4j circuit breaker on the AI service; HikariCP tuned for Supabase.

---

## Phased remediation plan

**Phase 1 — Security hardening (small, high-value, low-risk):**
C1 (delete debug endpoint), C3 (fail-fast secrets), M4 (constant-time),
H2 (email enumeration), M5 (dup config), M3 (printStackTrace).

**Phase 2 — Auth correctness:**
C2 (account lockout), H1 (trusted-proxy XFF), M1/M2 (JwtFilter cleanup),
M6 (upload limits).

**Phase 3 — Architecture maturity (larger, incremental):**
H5 (typed exceptions), H3 (`@Transactional`), H4 (DTOs), then L-series polish.

Each phase is independently shippable and testable. Recommend doing Phase 1 first as
one commit, since those are the items that matter most for a production deploy.

---

## Round 2 — dependency scan + identity-service review (2026-06-28)

Follow-up pass covering the two blind spots the first review didn't touch:
third-party CVEs and the standalone `identity-service`. All items below are fixed
and verified (backend 48/48 tests pass; both services compile; frontend `npm audit`
clean + builds).

### 🔴 2FA bypass via token-type confusion (BOTH services)
`JwtFilter` authenticated **any** validly-signed JWT with a subject, without checking
the `type` claim. The 5-minute `2fa_pending` temp token issued after the password
step (before the TOTP code) is such a token — so anyone with the password could use
it as a Bearer access token and skip the second factor entirely. The identity
`/api/token/introspect` endpoint had the same gap.
**Fixed:** both `JwtFilter`s and `introspect` now reject `type == "2fa_pending"`.

### 🟠 Dependency CVEs — Spring Boot 3.3.0 → 3.3.13 (both services)
The parent bump pulls patched transitives:
- Tomcat 10.1.24 → **10.1.42** (CVE-2025-24813 partial-PUT RCE, CVE-2024-50379/56337, CVE-2024-38286)
- spring-web 6.1.8 → **6.1.21** (CVE-2024-38816/38819 path traversal)
- logback 1.5.6 → **1.5.18** (CVE-2024-12798/12801)
- netty 4.1.110 → **4.1.122** (CVE-2024-47535, CVE-2025-24970)
- commons-beanutils 1.9.4 → **1.11.0** via explicit override (CVE-2025-48734)

### 🟠 Frontend `npm audit` — 0 vulnerabilities (was 3)
`npm audit fix` resolved form-data (high, CRLF injection), vite (high), and
dompurify (moderate, sanitizer bypass). Lockfile-only change; build still clean.

### 🟡 identity-service hardening
- `introspect` and `admin/promote` key checks → **constant-time** (`MessageDigest.isEqual`);
  `introspect` now **fails closed** when `internal.key` is unset (was open).
- `JwtFilter` error bodies → generic JSON; no longer leaks "User Not Found".

### Still open / notes
- Dependency findings were a **knowledge-based assessment** (model cutoff), not an
  authoritative scanner. Recommend wiring OWASP Dependency-Check or Trivy into CI for
  ongoing, authoritative results.
- **`identity-service` has no test suite** — changes were verified by compile only.
  Adding integration tests (mirroring the backend's Testcontainers setup) is the next
  gap to close.
- `ai-service` (FastAPI) and a git-history secret scan (gitleaks) remain unreviewed.

---

## Round 3 — ai-service (FastAPI) review (2026-06-28)

Reviewed the AI service for security, logic, and maturity. **No critical/high
security holes** — the service is fundamentally sound (internal-key middleware on
all routes, fail-fast on missing key, hardened OCR upload, no RCE primitives,
operator-set OLLAMA_URL so no user-driven SSRF, secrets gitignored). All findings
below are fixed; the HTTP layer now has an 8-test suite (passing).

- **Constant-time internal-key compare** — middleware used `key != _INTERNAL_KEY`;
  now `hmac.compare_digest`.
- **CORS tightened** — it's a server-to-server API, so `allow_credentials` is now
  False and methods/headers are restricted (were `*`).
- **Dead code removed** — `internal_auth.py` (`require_internal_key`) was never
  imported; the middleware does the enforcement.
- **requirements.txt reproducibility** — pandas was pinned `==3.0.3` while the
  tested env runs `2.3.3` (untested major); repinned to installed versions and the
  four `>=` entries are now `==`.
- **Input validation** — `spending_coach` had no Pydantic model (raw `dict[...]` →
  KeyError/500); added a model + error handling. Chat `message` now length-bounded
  (1–4000) to limit prompt-stuffing.
- **Prompt-injection mitigation** — user question is wrapped in `<user_question>`
  delimiters with an explicit "treat as data, not instructions" rule. (Impact was
  already low — output is self-targeted text advice, no actions executed.)
- **report_routes** — removed leftover debug `print`, switched deprecated `.dict()`
  → `model_dump()`, added try/except.
- **Tests + CI** — added `ai-service/tests/` (auth guard + validation, 8 tests) and
  a `requirements-dev.txt`; the AI-service CI workflow now runs pytest (and was
  aligned to Python 3.12 to match the Docker runtime).

**Still open:** `ai-service` Python deps aren't yet covered by an authoritative
CVE scanner in the manual review (Trivy/Dependabot in CI do cover them); a
git-history secret scan (gitleaks) beyond the CI TruffleHog job remains optional.

---

## Round 4 — outbound HTTP robustness (2026-06-28)

A focused pass over the backend's outbound HTTP clients surfaced a robustness gap
the earlier rounds missed (they covered the AI path but not the other third-party
integrations). Items below are fixed and verified (backend compiles).

### 🟠 R4.1 External `RestTemplate`s have no connect/read timeouts
**File:** `service/SetuAAService.java:41`, `service/CryptoConnectionService.java:42`,
`service/SmsService.java:49`

All three create a bare `new RestTemplate()`. Spring's default
`SimpleClientHttpRequestFactory` has **infinite** connect *and* read timeouts, so a
slow or hung third party — Setu Account Aggregator, a crypto exchange API, or the
MSG91 SMS gateway — blocks the calling Tomcat worker thread **indefinitely**. Enough
stuck calls exhaust the request thread pool and the whole backend stops serving,
including health probes. This is the exact failure the AI path already guards against:
`AiServiceConfig.aiRestTemplate` sets connect 3 s / read 20 s and relies on the
circuit breaker to release threads quickly.

**Fix:** Route all outbound third-party calls through a shared timed factory
(`config/HttpClients.externalApi()` — connect 5 s, read 15 s). Longer-term these
could be promoted to injected `@Bean`s like `aiRestTemplate`, but a shared helper
closes the availability gap now with minimal churn (the three services use
field-initialised templates, not constructor injection).

### 🟢 R4.2 `InterruptedException` swallowed without restoring the interrupt flag
**File:** `service/SetuAAService.java:135` (`createFISessionAndWait` poll loop)

`catch (InterruptedException ignored) {}` drops the interrupt, so a shutdown/cancel
signal during the 30 s poll is lost and the loop keeps running. Restore the flag with
`Thread.currentThread().interrupt()` (and stop polling) so cancellation propagates.

### Still open / notes
- **Money as `Double`** (L6) remains the largest deferred maturity item — amounts are
  AES-encrypted TEXT via `EncryptedDoubleConverter`, so a `BigDecimal` migration is a
  data-format change, not just a type change. Revisit if rounding bugs surface.
- The unbounded `findAll()` in `EmailMigrationService` / `EncryptionMigrationService`
  is acceptable: these are one-off admin-triggered migrations, not request-path code.

---

## Round 5 — L2/L3/L4 maturity polish (2026-06-28)

The previously-deferred low-risk maturity items, now implemented and verified
(backend **48/48 tests pass**; schema validates; no `LazyInitializationException`).

### 🟢 L4 — Flyway password default inconsistency
`spring.flyway.password` defaulted to empty while `spring.datasource.password`
defaulted to `postgres`. Aligned both to `${DB_PASSWORD:postgres}` so a fresh local
checkout migrates against the same credentials it connects with.

### 🟢 L3 — Optimistic locking on write-heavy entities
Added `@Version private Long version;` to `User`, `Transaction`, `Asset`,
`Liability`, `Budget`, `FinancialGoal`, `Investment` — the entities with realistic
concurrent writers (e.g. the hourly `ScheduledPriceRefreshService` updating an
`Investment.currentValue` while the user edits it; multi-flow `User` updates).
- New migration `V9__optimistic_locking.sql` adds `version BIGINT NOT NULL DEFAULT 0`
  to the seven tables (idempotent `ADD COLUMN IF NOT EXISTS`; existing rows start at 0).
- `GlobalExceptionHandler` now maps `ObjectOptimisticLockingFailureException` → **409**
  with a "refresh and retry" message instead of a generic 500.

### 🟢 L2 — `EAGER` → `LAZY` on `@ManyToOne user`
Switched the 9 remaining default-`EAGER` associations (`Transaction`, `Asset`,
`Liability`, `Budget`, `FinancialGoal`, `FinancialScoreHistory`, `BankConnection`,
`Notification`, `ChatHistory`) to `FetchType.LAZY`, so loading a row no longer forces
a join to `users` every time. Safe under `open-in-view=false` because every access to
the association is either `getUser().getId()` (served from the FK without initializing
the proxy) or passing the proxy as a `findByUser(...)` query parameter — verified by
grep (no non-id proxy access) and by the full integration-test suite.

### Deliberately still deferred
- **L5** (whitespace/formatting) — cosmetic; would bloat the diff and obscure real
  history. Skip until a file is being edited for other reasons.
- **L6** (money `Double` → `BigDecimal`) — explicitly out of scope for this pass; it
  is a financial-correctness migration across ~20 services + the encrypted converter
  and warrants its own dedicated, well-tested effort.
