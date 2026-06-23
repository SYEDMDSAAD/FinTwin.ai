# FinTwin.ai — Development Session Notes
**Date:** 2026-06-23 / 2026-06-24  
**Scope:** Deployment Scalability → DB Scalability → Release Management

---

## 1. Controller Architecture Cleanup

### Problem
Four controllers still had direct `@Autowired` repository access, violating the service-layer pattern. Business logic and DB access belonged in services.

### Controllers Fixed
| Controller | Problem | Fix |
|---|---|---|
| `TwoFactorController` | Owned `UserRepository`, `JwtUtil`, TOTP logic | Moved all logic to `TwoFactorService` |
| `AdminApiController` | Owned `UserRepository` directly | Delegated to new `AdminUserService` |
| `SecurityAdminController` | Owned `AuditLogRepository`, `BlockedIPRepository`, `UserRepository` | Delegated to new `SecurityAdminService` |
| `AdminController` | Owned `UserRepository` directly | Replaced with `AdminUserService` |

### New Services Created

#### `AdminUserService`
- `getStats()` — uses `countByRole("ADMIN")` instead of `findAll().stream().filter()`
- `listUsers(int page, int size)` — uses `findAll(PageRequest.of(...))` with pagination
- `getSignupTrend()` — uses `findByCreatedAtAfter(since)` instead of `findAll()`
- `getAdoptionStats()` — uses `bankConnectionRepository.countDistinctUsers()` instead of iterating all users
- `getHealth()` — uses `@Qualifier("aiRestTemplate") RestTemplate` bean instead of `new RestTemplate()`

#### `SecurityAdminService`
- `getPosture()`, `getBruteForce()`, `getAccountAttacks()`, `getSuspiciousSessions()`, `getDataAnomalies()`
- `listBlockedIPs()`, `blockIP()`, `unblockIP()`

#### `TwoFactorService` extensions
- `getDebugInfo(email)` — returns TOTP debug info
- `completeTwoFactorLogin(tempToken, codeStr)` — full 2FA login flow moved from controller

### New Repository Methods Added

**`UserRepository`:**
```java
@Query("SELECT COUNT(u) FROM User u WHERE u.role = :role")
long countByRole(@Param("role") String role);

Page<User> findAll(Pageable pageable);

List<User> findByCreatedAtAfter(LocalDateTime date);
```

**`BankConnectionRepository`:**
```java
@Query("SELECT COUNT(DISTINCT b.user.id) FROM BankConnection b")
long countDistinctUsers();
```

---

## 2. Deployment Scalability

### HikariCP Connection Pool (`application.properties`)
```properties
spring.datasource.hikari.pool-name=FintwinPool
spring.datasource.hikari.maximum-pool-size=${DB_POOL_MAX:20}
spring.datasource.hikari.minimum-idle=${DB_POOL_MIN:5}
spring.datasource.hikari.connection-timeout=30000
spring.datasource.hikari.idle-timeout=600000
spring.datasource.hikari.max-lifetime=1800000
spring.datasource.hikari.keepalive-time=60000
```

### Spring Boot Actuator (for Kubernetes probes)
```properties
management.endpoints.web.exposure.include=health,info,metrics
management.endpoint.health.probes.enabled=true
management.health.livenessState.enabled=true
management.health.readinessState.enabled=true
```

### Redis Distributed Rate Limiting (`RateLimitFilter`)
- Uses Lettuce directly (not Spring Data Redis autoconfiguration) — so app starts cleanly when `REDIS_URL` is not set
- Two backends: Redis fixed-window (INCR + EXPIRE) when available, Bucket4j in-memory fallback
- Rate tiers: auth endpoints=5/min, AI endpoints=20/min, general=100/min
- Fails open on Redis error

### AI Service Redis Memory (`ai-service/chatbot/memory.py`)
- Redis backend (`REDIS_URL` env var) with TTL-based key storage
- Falls back to in-process dict
- Public API unchanged: `get_history()`, `append_turn()`, `clear_history()`

### ScheduledPriceRefreshService — Pagination Fix
```java
// Replaced findAll() with paginated batches
do {
    userPage = userRepo.findAll(PageRequest.of(page++, batchSize));
    for (User user : userPage.getContent()) { refreshForUser(user); }
} while (userPage.hasNext());
```
Note: ShedLock needed for multi-replica deduplication (not yet implemented).

### `pom.xml` Dependencies Added
- `spring-boot-starter-actuator`
- `io.lettuce:lettuce-core`
- `org.flywaydb:flyway-core`
- `org.flywaydb:flyway-database-postgresql`

### Docker — `backend/Dockerfile`
- Build stage: `maven:3.9-eclipse-temurin-21-alpine`
- `mvn dependency:go-offline -q` for Maven layer caching
- Non-root user `fintwin`
- JVM flags: `UseContainerSupport`, `MaxRAMPercentage=75.0`, `InitialRAMPercentage=25.0`, `UseG1GC`, `ExitOnOutOfMemoryError`

### `docker-compose.yml` Changes
- Added Redis service (redis:7-alpine, maxmemory 256mb, allkeys-lru eviction, healthcheck)
- Added `REDIS_URL` to backend and ai-service
- Added `UVICORN_WORKERS` to ai-service
- Added `redisdata` volume

### `docker-compose.prod.yml` (new)
Production override. Usage: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
- Registry images via `REGISTRY` and `TAG` env vars
- Resource limits for all 5 services
- `DDL_AUTO=validate`, `DB_POOL_MAX=30`, `UVICORN_WORKERS=4`
- Log rotation with json-file driver

### Kubernetes Manifests (`k8s/` — 17 files)

| File | Description |
|---|---|
| `namespace.yaml` | `fintwin` namespace |
| `configmap.yaml` | Non-sensitive env vars |
| `secret.yaml.template` | Secret template (fill before applying) |
| `postgres/pvc.yaml` | 20Gi PersistentVolumeClaim |
| `postgres/statefulset.yaml` | PostgreSQL StatefulSet (note: use managed DB in production) |
| `postgres/service.yaml` | ClusterIP service |
| `redis/deployment.yaml` | Redis with maxmemory 200mb, liveness probe |
| `redis/service.yaml` | ClusterIP service |
| `backend/deployment.yaml` | 2 replicas, rolling maxUnavailable=0, TopologySpreadConstraints, Actuator probes, preStop sleep 5s |
| `backend/service.yaml` | ClusterIP service |
| `backend/hpa.yaml` | min=2, max=10, CPU 70%, memory 80%, fast scale-up / slow scale-down |
| `ai-service/deployment.yaml` | 1 replica, 2Gi limit |
| `ai-service/service.yaml` | ClusterIP service |
| `ai-service/hpa.yaml` | min=1, max=5, slower scaling |
| `frontend/deployment.yaml` | 2 replicas, 128Mi limit |
| `frontend/service.yaml` | ClusterIP service |
| `frontend/ingress.yaml` | nginx + cert-manager TLS, `/api/` → backend, `/` → frontend |
| `cert-manager-issuer.yaml` | Let's Encrypt ClusterIssuer |

**Key Kubernetes design decisions:**
- `TopologySpreadConstraints` — pods spread across nodes for HA
- `maxUnavailable=0` — zero-downtime rolling deploys
- `preStop: sleep 5` — graceful shutdown (lets in-flight requests finish)
- HPA uses `autoscaling/v2` with both CPU and memory metrics

---

## 3. DB Scalability

### 3.1 Decision: PostgreSQL + Supabase

Chose managed PostgreSQL (Supabase) over NoSQL for FinTwin.ai because:
- Financial data requires ACID compliance
- Relational joins across users/transactions/budgets/goals are natural
- Supabase gives connection pooling, backups, read replicas, and extensions (pg_cron) out of the box
- Can add TimescaleDB for time-series later, Redis for sessions, Cassandra/DynamoDB for audit archive if needed (polyglot persistence)

### 3.2 Supabase Project
- Project: `wfmixqcopbatzbmjzzvv` (Seoul/ap-northeast-2)
- Security settings applied: Data API OFF, pg_cron extension enabled
- Direct connection: `db.wfmixqcopbatzbmjzzvv.supabase.co:5432`

### 3.3 Flyway Setup

**`pom.xml`:**
```xml
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-core</artifactId>
</dependency>
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-database-postgresql</artifactId>
</dependency>
```

**`application.properties`:**
```properties
spring.flyway.enabled=${FLYWAY_ENABLED:true}
spring.flyway.url=${FLYWAY_DB_URL:${DB_URL:jdbc:postgresql://localhost:5432/fintwin}}
spring.flyway.user=${DB_USERNAME:postgres}
spring.flyway.password=${DB_PASSWORD:}
spring.flyway.schemas=public
spring.flyway.baseline-on-migrate=${FLYWAY_BASELINE:false}
spring.flyway.baseline-version=0
spring.flyway.out-of-order=false
spring.jpa.hibernate.ddl-auto=${DDL_AUTO:validate}
```

**`backend/.env`:**
```env
DB_URL=jdbc:postgresql://db.wfmixqcopbatzbmjzzvv.supabase.co:5432/postgres?sslmode=require
DDL_AUTO=validate
FLYWAY_BASELINE=true
```

### 3.4 Migration V1 — Baseline Schema

`backend/src/main/resources/db/migration/V1__baseline.sql`

Creates all 15 tables matching JPA entities exactly (SpringPhysicalNamingStrategy column names):

| Table | Key Columns |
|---|---|
| `users` | id, full_name(512 enc), email(512 enc), password, email_hash(64 UNIQUE), role(20), enabled, two_factor_secret(512 enc), created_at, last_login_at |
| `transaction` | id, date, merchant(400 enc), amount(TEXT enc), category(400 enc), source, external_id, user_id FK |
| `budget` | id, category, limit_amount(TEXT enc), user_id FK |
| `financial_goal` | id, title(400), target_amount(TEXT enc), current_saved(TEXT enc), duration_months(INT), ai_plan(7000 enc), goal_health, created_at(DATE), user_id FK |
| `asset` | id, name(400 enc), amount(TEXT enc), type, user_id FK |
| `liability` | id, name(400 enc), amount(TEXT enc), type, user_id FK |
| `investments` | id, user_id FK NOT NULL, name(512 enc), type, invested_amount(TEXT), current_value(TEXT), purchase_date(DATE), ticker_code(512 enc), units(TEXT), interest_rate(TEXT), notes(1400 enc) |
| `chat_history` | id, role, message(TEXT enc), reply(TEXT enc), timestamp, user_id FK |
| `bank_connection` | id, user_id FK, consent_handle(512), consent_id(512), consent_status, masked_account_number(512), bank_name(512), created_at, last_synced_at |
| `crypto_connections` | id, user_id FK NOT NULL, exchange, api_key(512), api_secret(512), created_at, last_synced_at, sync_status |
| `notification` | id, type, message(4100 enc), read_status(BOOL), created_at, user_id FK |
| `support_tickets` | id, user_email(512 NOT NULL), user_name(200), category(50), message(2000 NOT NULL), status(20 DEFAULT 'OPEN'), admin_note(2000), created_at, resolved_at |
| `financial_score_history` | id, score(INT), month, user_id FK |
| `blocked_ips` | id, ip_address(45 NOT NULL UNIQUE), reason(500), blocked_by(200), blocked_at, expires_at |
| `audit_log` | id, user_id(nullable), action(50 NOT NULL), resource(100 NOT NULL), description(500), ip_address(45), user_agent(512), http_method(10), request_uri(500), timestamp(NOT NULL), success(BOOL NOT NULL), failure_reason(1000) |

### 3.5 Migration V2 — Performance Indexes

`backend/src/main/resources/db/migration/V2__indexes.sql`

32 indexes across all tables. Three tiers:
- **T1 (Correctness)** — queries would full-scan without these
- **T2 (Scale)** — fine at 100 rows, O(n) at 100K+
- **T3 (Covering)** — INCLUDE() eliminates heap reads for hot queries

Key indexes:

```sql
-- users
idx_users_role, idx_users_enabled, idx_users_tfa, idx_users_onboarding, idx_users_created_at

-- transaction (also covers @Table(indexes) since Flyway owns DDL now)
idx_txn_user_date (user_id, date)
idx_txn_user_ext_id (user_id, external_id)
idx_txn_user_date_cat (user_id, date DESC) INCLUDE (amount, category)  -- covering

-- chat
idx_chat_user_ts (user_id, timestamp ASC)

-- notification
idx_notif_user_read (user_id, read_status)

-- blocked_ips
idx_blocked_expires (expires_at) WHERE expires_at IS NOT NULL  -- partial

-- audit_log
idx_audit_failed_login (ip_address, timestamp) WHERE action='LOGIN' AND success=false  -- partial
```

### 3.6 Migration V3 — audit_log Monthly Partitioning

`backend/src/main/resources/db/migration/V3__audit_log_partition.sql`

**Why partition audit_log:** At 100K users × 20 actions/day = 2M rows/day. Without partitioning, PCI-DSS compliance scans and brute-force detection queries scan the full table.

**Critical ordering issue (bug we caught):**
BIGSERIAL creates a sequence OWNED BY the table column. When the table is dropped, the owned sequence is also dropped automatically. Therefore the migration order must be:
1. `DROP TABLE IF EXISTS audit_log` (drops table + its BIGSERIAL-owned sequence)
2. `CREATE SEQUENCE audit_log_id_seq AS BIGINT INCREMENT 50 CACHE 50`
3. `CREATE TABLE audit_log (...PRIMARY KEY (id, timestamp)) PARTITION BY RANGE (timestamp)`

**What V3 does:**
- Creates 13 initial monthly partitions (current month + 12 forward)
- Creates `audit_log_default` catch-all partition
- Creates `audit_log_create_next_partition()` function
- Schedules pg_cron job (5 0 1 * *) to auto-create next month's partition

**AuditLog entity change required:**
```java
// Before (IDENTITY doesn't work on partitioned tables)
@GeneratedValue(strategy = GenerationType.IDENTITY)

// After
@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "audit_log_id_seq")
@SequenceGenerator(name = "audit_log_id_seq", sequenceName = "audit_log_id_seq", allocationSize = 50)
```
`allocationSize=50` must match `INCREMENT 50` in the SQL sequence.

**Future optimization:** AuditRetentionService can `DROP TABLE audit_log_YYYY_MM` instead of `DELETE WHERE timestamp < cutoff` — O(1) vs O(n).

### 3.7 N+1 Fix in SecurityAdminService

Three methods (`getAccountAttacks`, `getSuspiciousSessions`, `getDataAnomalies`) called `userRepository.findById(userId)` inside a stream loop — one DB query per row.

**Fix: `batchLoadUsers()` private method**
```java
private Map<Long, User> batchLoadUsers(List<Object[]> rows) {
    if (rows.isEmpty()) return Collections.emptyMap();
    List<Long> ids = rows.stream()
            .map(r -> ((Number) r[0]).longValue())
            .collect(Collectors.toList());
    return userRepository.findAllById(ids).stream()
            .collect(Collectors.toMap(User::getId, u -> u));
}
```
One `findAllById()` call regardless of result set size.

---

## 4. Bugs Fixed During Session

### 4.1 TwoFactorController — NumberFormatException already caught
`NumberFormatException` extends `IllegalArgumentException`. The broader catch appeared first → compiler error.

**Fix:** Reorder catch blocks — `NumberFormatException` before `IllegalArgumentException`.

### 4.2 Flyway — no password provided
When `spring.flyway.url` is set explicitly, Spring Boot does NOT auto-inherit datasource credentials.

**Fix:** Add `spring.flyway.user` and `spring.flyway.password` explicitly in `application.properties`.

### 4.3 Flyway — non-empty schema, no history table
Supabase `public` schema has default tables. Flyway refuses to run.

**Fix:** `spring.flyway.baseline-on-migrate=true` AND `spring.flyway.baseline-version=0` (version=0 ensures V1/V2/V3 all still run; default version=1 would skip V1).

### 4.4 Wrong Supabase hostname
First attempt: `wfmixqcopbatzbmjzzv` (single v) → DNS not found.
Correct ref: `wfmixqcopbatzbmjzzvv` (double vv).

---

## 5. Release Management

### 5.1 Versioning Convention
Semantic Versioning: `MAJOR.MINOR.PATCH`
- `MAJOR` — breaking API or data model changes requiring migration
- `MINOR` — new backward-compatible features
- `PATCH` — bug fixes, security patches, performance improvements

Both `backend/pom.xml` and `frontend/package.json` bumped to `0.1.0`.

### 5.2 Branching Model
```
main          — production, always deployable, protected
develop       — integration branch for daily development
feature/*     — new features, branch from develop
fix/*         — bug fixes, branch from develop
hotfix/*      — urgent production fixes, branch from main
release/v*    — release preparation, branch from develop
```

### 5.3 `scripts/release.sh`
Automates normal release flow (from `main` or `release/*`):

```bash
./scripts/release.sh patch   # 0.1.0 → 0.1.1
./scripts/release.sh minor   # 0.1.0 → 0.2.0
./scripts/release.sh major   # 0.1.0 → 1.0.0
```

**What it does:**
1. Validates branch is `main` or `release/*`
2. Validates clean working tree
3. Bumps `backend/pom.xml` and `frontend/package.json`
4. Prepends new section to `CHANGELOG.md`
5. `git commit -m "chore: release vX.Y.Z"` + annotated tag
6. Prints push command (you review before pushing)

### 5.4 `scripts/hotfix.sh`
For urgent production fixes that bypass `develop`:

```bash
# Start a hotfix from main
./scripts/hotfix.sh start critical-auth-bypass

# Fix the bug, commit normally, then:
./scripts/hotfix.sh finish
```

**`finish` does:**
- Bumps patch version
- Adds CHANGELOG entry
- Merges to `main` with `--no-ff`
- Tags `vX.Y.Z+1`
- Backports to `develop` if it exists
- Prints push command

### 5.5 `.github/PULL_REQUEST_TEMPLATE.md`
Every GitHub PR auto-shows this checklist:
- No direct repo access in controllers
- No `findAll()` without pagination
- No new N+1 queries
- Flyway migration if schema changed
- PII fields use `@Convert(converter = EncryptionConverter.class)`
- New endpoints have `@PreAuthorize`
- No SQL injection vectors
- Fintech guards: financial precision, audit log entries, rate limiting

### 5.6 `CHANGELOG.md`
Structured release history. v0.1.0 entry documents everything built to date.

---

## 6. Files Created / Modified Summary

| File | Action | Description |
|---|---|---|
| `backend/pom.xml` | Modified | Added Flyway + Actuator + Lettuce deps; version → 0.1.0 |
| `backend/src/main/resources/application.properties` | Modified | Added Flyway config, changed ddl-auto default to validate |
| `backend/.env` | Modified | Supabase DB_URL, DDL_AUTO=validate, FLYWAY_BASELINE=true |
| `backend/src/main/resources/db/migration/V1__baseline.sql` | Created | Complete schema (15 tables) |
| `backend/src/main/resources/db/migration/V2__indexes.sql` | Created | 32 performance indexes |
| `backend/src/main/resources/db/migration/V3__audit_log_partition.sql` | Created | Monthly range partitioning |
| `backend/.../audit/AuditLog.java` | Modified | IDENTITY → SEQUENCE generator |
| `backend/.../service/SecurityAdminService.java` | Modified | N+1 fix via batchLoadUsers() |
| `backend/.../service/AdminUserService.java` | Created | Admin user management service |
| `backend/.../service/TwoFactorService.java` | Modified | Added completeTwoFactorLogin(), getDebugInfo() |
| `backend/.../controller/TwoFactorController.java` | Rewritten | Single TwoFactorService dependency; fixed catch ordering |
| `backend/.../controller/AdminApiController.java` | Rewritten | Single AdminUserService dependency |
| `backend/.../controller/SecurityAdminController.java` | Rewritten | Single SecurityAdminService dependency |
| `backend/.../controller/AdminController.java` | Modified | Replaced UserRepository with AdminUserService |
| `backend/.../repository/UserRepository.java` | Modified | countByRole(), findAll(Pageable), findByCreatedAtAfter() |
| `backend/.../repository/BankConnectionRepository.java` | Modified | countDistinctUsers() |
| `backend/.../service/ScheduledPriceRefreshService.java` | Modified | Paginated batch processing (batchSize=100) |
| `backend/.../security/RateLimitFilter.java` | Rewritten | Redis + Bucket4j dual-backend rate limiting |
| `ai-service/chatbot/memory.py` | Rewritten | Redis + in-process dict dual-backend |
| `backend/Dockerfile` | Rewritten | Multi-stage, non-root, G1GC, MaxRAMPercentage |
| `ai-service/Dockerfile` | Modified | Configurable uvicorn workers |
| `docker-compose.yml` | Modified | Added Redis service + volumes |
| `docker-compose.prod.yml` | Created | Production override with resource limits |
| `k8s/` (17 files) | Created | Full Kubernetes manifest set |
| `ARCHITECTURE.md` | Created | Full application architecture documentation |
| `CHANGELOG.md` | Created | Structured release history, v0.1.0 |
| `scripts/release.sh` | Created | Automated release script |
| `scripts/hotfix.sh` | Created | Hotfix workflow script |
| `.github/PULL_REQUEST_TEMPLATE.md` | Created | PR quality checklist |
| `frontend/package.json` | Modified | version → 0.1.0 |
| `k8s/configmap.yaml` | Modified | Added FLYWAY_DB_URL, FLYWAY_ENABLED, FLYWAY_BASELINE |

---

## 7. What Remains (Next Sessions)

| Area | Status |
|---|---|
| CI/CD — GitHub Actions pipelines | Not started |
| ShedLock for ScheduledPriceRefreshService | Not started (comment added) |
| Read replica support (AbstractRoutingDataSource) | Not started |
| DB backup strategy documentation | Not started |
| Transaction table partitioning | Not started (audit_log done) |
