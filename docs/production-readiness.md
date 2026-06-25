# Production Readiness — Gap Analysis

**FinTwin.ai** | Audit date: 2026-06-25  
This document maps everything already in place against everything still missing for a production-grade Indian fintech product. It is grounded entirely in what was found in the actual codebase — nothing is assumed.

---

## What Is Already Production-Grade

Before the gaps, a clear record of what has already been built correctly:

| Area | Status | Evidence |
|------|--------|----------|
| RBAC | ✅ Complete | 7 roles, 36 permissions, 86 `@PreAuthorize` annotations |
| Identity Service | ✅ Complete | Standalone service on :8090, refresh tokens, lockout, introspect |
| Field Encryption | ✅ Complete | AES-256-GCM on all PII fields via `EncryptionConverter` |
| JWT Auth + 2FA | ✅ Complete | TOTP, temp token, force-logout, impersonation audit trail |
| Security Headers | ✅ Complete | CSP, HSTS (31536000s), X-Frame: DENY, Permissions-Policy in both Spring + nginx |
| HTTPS / TLS | ✅ Complete | TLS 1.2+1.3, OCSP stapling, HTTP→HTTPS redirect in nginx |
| Rate Limiting | ✅ Complete | 20 req/min per IP, Redis-backed, IP blocklist table |
| Audit Logging | ✅ Complete | PCI-DSS Req 10, async writes, monthly partitioning, `@Audited` on every sensitive action |
| Input Validation | ✅ Complete | `spring-boot-starter-validation`, `@Valid` on all controllers, `@NotNull/@Size/@Email` on DTOs |
| Global Error Handling | ✅ Complete | `GlobalExceptionHandler.java` with 7 typed handlers, no stack trace leakage to client |
| HikariCP | ✅ Complete | Pool size 20, idle 5, all timeouts configured |
| DB Indexes | ✅ Complete | 20+ indexes including composites, covering indexes, partial index for failed logins |
| Flyway Migrations | ✅ Complete | V1–V6, baseline support, `ddl-auto=validate` in production |
| K8s Manifests | ✅ Complete | HPA (2–10 pods), liveness/readiness probes, rolling deploy (maxUnavailable=0), graceful shutdown |
| CI/CD | ✅ Complete | 3 path-filtered GitHub Actions workflows, weekly security scan |
| Account Aggregator | ✅ Complete | Setu AA integration, JWS webhook verification, consent management |
| Email Notifications | ✅ Complete | Spring Mail, OTP, password reset, support ticket replies |
| Async Audit Writes | ✅ Correct | `@EnableAsync`, dedicated thread pool (2–5 threads), queue capacity 500 |

---

## What Is Missing — Organized by Priority

---

### TIER 1 — Blockers (Cannot go to production without these)

---

#### 1. Observability Stack — Metrics, Tracing, Structured Logs

**Current state:** Spring Actuator exposes `/health`, `/info`, `/metrics` — but there is no Prometheus scraper, no Grafana dashboard, no distributed tracing, and no structured log format.

**Why it matters:** When something breaks at 2 AM across the backend + AI service + Setu webhook, you have no way to trace the request. You have no dashboard showing error rate spikes, latency percentiles, or DB pool exhaustion. You are operating blind.

**What to build:**

**a) Metrics (Prometheus + Grafana)**

Add to `pom.xml`:
```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

Add to `application.properties`:
```properties
management.endpoints.web.exposure.include=health,info,metrics,prometheus
management.metrics.distribution.percentiles-histogram.http.server.requests=true
management.metrics.distribution.slo.http.server.requests=50ms,100ms,200ms,500ms,1s
```

Add custom counters for business events:
```java
@Component
public class FinTwinMetrics {
    private final Counter loginSuccess;
    private final Counter loginFailure;
    private final Counter transactionCreated;
    private final Timer forecastLatency;

    public FinTwinMetrics(MeterRegistry registry) {
        this.loginSuccess    = registry.counter("auth.login", "result", "success");
        this.loginFailure    = registry.counter("auth.login", "result", "failure");
        this.transactionCreated = registry.counter("transactions.created");
        this.forecastLatency = registry.timer("ai.forecast.latency");
    }
}
```

Add Prometheus scrape config and Grafana deployment to `k8s/monitoring/`.

**b) Distributed Tracing (OpenTelemetry)**

Add to `pom.xml`:
```xml
<dependency>
    <groupId>io.opentelemetry.instrumentation</groupId>
    <artifactId>opentelemetry-spring-boot-starter</artifactId>
    <version>2.x</version>
</dependency>
```

This automatically traces every HTTP request, JDBC query, and Redis call. A `traceId` + `spanId` will propagate from the backend to the AI service call to the Setu webhook — you can see the full chain in Jaeger or Grafana Tempo.

Add to `application.properties`:
```properties
otel.service.name=fintwin-backend
otel.exporter.otlp.endpoint=http://otel-collector:4317
otel.instrumentation.jdbc.enabled=true
otel.instrumentation.spring-data.enabled=true
```

**c) Structured JSON Logging**

Add to `pom.xml`:
```xml
<dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
    <version>8.0</version>
</dependency>
```

Create `src/main/resources/logback-spring.xml`:
```xml
<configuration>
  <springProfile name="prod">
    <appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
      <encoder class="net.logstash.logback.encoder.LogstashEncoder">
        <includeMdcKeyName>traceId</includeMdcKeyName>
        <includeMdcKeyName>spanId</includeMdcKeyName>
        <includeMdcKeyName>userId</includeMdcKeyName>
      </encoder>
    </appender>
    <root level="INFO"><appender-ref ref="JSON"/></root>
  </springProfile>
</configuration>
```

Every log line will be JSON, with the trace ID embedded — log aggregators (Loki, ELK, CloudWatch) can index and query them instantly.

**Effort:** 2–3 days | **Risk if skipped:** Debugging production incidents takes hours instead of minutes.

---

#### 2. Resilience4j — Circuit Breakers, Retries, Timeouts

**Current state:** The AI service (`RestTemplate`) has no timeout configured. If the Ollama/phi3 service hangs, every request that calls it hangs indefinitely, eventually exhausting the HikariCP thread pool and taking down the entire backend.

**What to build:**

Add to `pom.xml`:
```xml
<dependency>
    <groupId>io.github.resilience4j</groupId>
    <artifactId>resilience4j-spring-boot3</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-aop</artifactId>
</dependency>
```

Add to `application.properties`:
```properties
# AI service — open circuit after 5 failures in 10s window, half-open after 30s
resilience4j.circuitbreaker.instances.ai-service.sliding-window-size=10
resilience4j.circuitbreaker.instances.ai-service.failure-rate-threshold=50
resilience4j.circuitbreaker.instances.ai-service.wait-duration-in-open-state=30s
resilience4j.circuitbreaker.instances.ai-service.permitted-number-of-calls-in-half-open-state=3

# Setu API — retry 3 times with 500ms backoff
resilience4j.retry.instances.setu-api.max-attempts=3
resilience4j.retry.instances.setu-api.wait-duration=500ms
resilience4j.retry.instances.setu-api.retry-exceptions=java.net.SocketTimeoutException

# Timeouts
resilience4j.timelimiter.instances.ai-service.timeout-duration=30s
resilience4j.timelimiter.instances.forecast.timeout-duration=45s
```

Annotate affected service methods:
```java
// ForecastService.java
@CircuitBreaker(name = "ai-service", fallbackMethod = "forecastFallback")
@TimeLimiter(name = "ai-service")
@Retry(name = "ai-service")
public ForecastDTO generateForecast() { ... }

private ForecastDTO forecastFallback(Exception ex) {
    // Return cached or rule-based forecast instead of crashing
    return ForecastDTO.empty("AI service temporarily unavailable");
}
```

Also set hard timeouts on the `RestTemplate` bean:
```java
@Bean("aiRestTemplate")
public RestTemplate aiRestTemplate() {
    HttpComponentsClientHttpRequestFactory factory = new HttpComponentsClientHttpRequestFactory();
    factory.setConnectTimeout(Duration.ofSeconds(5));
    factory.setReadTimeout(Duration.ofSeconds(30));
    return new RestTemplate(factory);
}
```

**Effort:** 2 days | **Risk if skipped:** AI service slow-down cascades into full backend outage.

---

#### 3. SMS Notifications (OTP + Transactional Alerts)

**Current state:** OTP is delivered by email only. No SMS. Transaction alerts only exist as in-app notifications.

**Why it matters for India:** RBI and SEBI mandate SMS alerts for account access and fund movements. Indian users expect SMS OTP. Email delivery rates in India are significantly lower than in the West; SMS has near-100% delivery.

**What to build:**

Create `SmsService.java` using MSG91 (most common in Indian fintech) or Gupshup:

```java
@Service
public class SmsService {

    @Value("${sms.provider.api-key:#{null}}")
    private String apiKey;

    @Value("${sms.provider.sender-id:FINTWIN}")
    private String senderId;

    public void sendOtp(String phoneNumber, String otp) {
        if (apiKey == null) { log.warn("SMS not configured"); return; }
        // MSG91 / Gupshup API call
        // Template: "Your FinTwin OTP is {otp}. Valid for 10 minutes. Do not share. -FINTWIN"
    }

    public void sendTransactionAlert(String phoneNumber, double amount, String merchant) {
        // "INR {amount} debited at {merchant}. FinTwin balance updated. -FINTWIN"
    }

    public void sendLoginAlert(String phoneNumber, String ipCity) {
        // "New login to your FinTwin account from {city}. Not you? Call us immediately."
    }
}
```

Add env vars: `SMS_PROVIDER_API_KEY`, `SMS_PROVIDER_SENDER_ID`, `SMS_ENABLED`.

Add `phone` field to `User` entity (encrypted), and `phoneVerified` flag.

Phone verification flow: user enters phone → OTP sent via SMS → user enters OTP → `phoneVerified = true`.

**Effort:** 2 days | **Risk if skipped:** Cannot go live legally in India for financial services.

---

#### 4. KYC Integration

**Current state:** Zero KYC. Users sign up with only an email. No PAN, no Aadhaar, no identity verification.

**Why it matters:** RBI guidelines require KYC for any financial service collecting, storing, or acting on financial data. Without KYC, the app cannot legally process financial data for Indian residents at scale.

**What to build:**

Three levels of KYC (as per RBI's risk-based KYC approach):

**Level 1 — Email + Phone verified (already partial)**
- Email verified ✅
- Phone verified — needs SMS

**Level 2 — PAN verification**
- User enters PAN number
- Verify via Setu PAN Verification API, Signzy, or NSDL sandbox
- Store hashed PAN (never raw)
- Required before allowing export, bank link, or investment features

**Level 3 — Aadhaar eKYC (optional, advanced)**
- Offline Aadhaar XML or Digilocker integration
- Only required if you offer credit or payments

Minimal implementation for an analytics/PFM app:
```java
// KycService.java
public KycStatus verifyPan(String pan, String name, String dob) {
    // Call Setu or Signzy PAN verification API
    // Cross-check name match
    // Store KycStatus.PAN_VERIFIED in user record
}
```

Add to `User`:
- `kycStatus` (NONE / PAN_VERIFIED / FULLY_VERIFIED)
- `panHash` (SHA-256 of PAN, not the raw value)
- `kycCompletedAt`

Gate premium features behind `kycStatus != NONE`.

**Effort:** 3–4 days | **Risk if skipped:** Regulatory non-compliance.

---

### TIER 2 — High Priority (Needed within first month of production)

---

#### 5. Integration & Controller Tests

**Current state:** 3 unit test files cover `BudgetService`, `NetWorthService`, and `TransactionService` with mocked repositories. Zero integration tests. Zero controller tests. Zero E2E tests.

**What to build:**

Add to `pom.xml`:
```xml
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>postgresql</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>junit-jupiter</artifactId>
    <scope>test</scope>
</dependency>
```

**a) Base integration test config** (`AbstractIntegrationTest.java`):
```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
public abstract class AbstractIntegrationTest {
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17")
            .withDatabaseName("fintwin_test");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", postgres::getJdbcUrl);
        r.add("spring.datasource.username", postgres::getUsername);
        r.add("spring.datasource.password", postgres::getPassword);
    }
}
```

**b) Controller tests** (`AuthControllerTest.java`):
```java
// Test: register → verify email → login → get /me
// Test: login with wrong password → 401
// Test: register same email twice → 409
// Test: access /api/transactions without JWT → 401
// Test: USER role accessing /api/admin/** → 403
```

**c) RBAC integration tests** (`RbacIntegrationTest.java`):
```java
// Test: USER cannot call /api/admin/roles/assign → 403
// Test: ADMIN can call /api/admin/roles/assign → 200
// Test: User A cannot delete User B's asset → 403
// Test: User A cannot read User B's transactions → implicit via email scoping
```

**d) Financial flow tests**:
```java
// Test: create transaction → appears in getAllTransactions
// Test: create budget → getBudgetStatus shows correct spend %
// Test: delete account → all related data deleted (GDPR)
```

Target: 80% line coverage on service layer, 100% coverage on auth and RBAC paths.

**Effort:** 1 week | **Risk if skipped:** Regressions in financial calculations ship to production silently.

---

#### 6. Per-User Rate Limiting

**Current state:** `RateLimitFilter` limits 20 req/min per **IP address**. If 100 users share a corporate NAT or VPN (common in India with Jio/Airtel shared IPs), they collectively hit the limit. Conversely, a single authenticated user can make unlimited calls from different IPs.

**What to build:**

Extend `RateLimitFilter` to apply a secondary limit keyed on `userId` after JWT extraction:

```java
// In RateLimitFilter, after JWT is validated and user email is known:
String userKey = "rate:user:" + email;
Bucket userBucket = bucketCache.computeIfAbsent(userKey, k ->
    Bucket.builder()
        .addLimit(Bandwidth.classic(100, Refill.intervally(100, Duration.ofMinutes(1))))
        .build()
);
if (!userBucket.tryConsume(1)) {
    response.setStatus(429);
    response.getWriter().write("User rate limit exceeded");
    return;
}
```

Separate limits per action type are better:
- `/api/transactions/text` (AI call) → 30/min per user
- `/api/chat` → 50/min per user  
- `/api/auth/**` → 5/min per IP (already covers brute force)
- All other authenticated endpoints → 200/min per user

**Effort:** 1 day | **Risk if skipped:** Single user can abuse AI endpoints, driving up Ollama compute cost.

---

#### 7. Spring Cache + Redis for Hot Data

**Current state:** Every profile view, dashboard load, and insight call hits PostgreSQL. Market data (Yahoo Finance proxy) is fetched fresh on every request.

**What to cache:**

Add `spring-boot-starter-cache` + configure Redis (already in the stack):

```java
@Configuration
@EnableCaching
public class CacheConfig {
    @Bean
    public RedisCacheConfiguration cacheConfiguration() {
        return RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(5))
            .disableCachingNullValues();
    }
}
```

Apply selectively:
```java
// MarketDataService — market prices change slowly
@Cacheable(value = "market-data", key = "#symbol")
public Map<String, Object> getQuote(String symbol) { ... }
@CacheEvict(value = "market-data", allEntries = true)
@Scheduled(fixedDelay = 300_000) // every 5 min
public void evictMarketData() {}

// InsightService — insights are computed, expensive
@Cacheable(value = "insights", key = "#email", unless = "#result.isEmpty()")
public List<String> generateInsights() { ... }
// Evict when new transaction is added
@CacheEvict(value = "insights", key = "#user.email")
public Transaction addExpenseByText(...) { ... }

// FinancialScoreService — score changes only when data changes
@Cacheable(value = "score", key = "#email")
public FinancialScoreDTO calculateScore() { ... }
```

**Effort:** 2 days | **Risk if skipped:** PostgreSQL becomes bottleneck at 1000+ concurrent users.

---

#### 8. OpenAPI / Swagger Documentation

**Current state:** No API documentation. Frontend and any future mobile/partner integration must read the source code to understand contracts.

**What to build:**

Add to `pom.xml`:
```xml
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
    <version>2.6.0</version>
</dependency>
```

Add to `application.properties`:
```properties
springdoc.api-docs.path=/api-docs
springdoc.swagger-ui.path=/swagger-ui.html
springdoc.swagger-ui.enabled=false  # disable in prod; enable in dev
springdoc.show-actuator=false
```

Add global config class:
```java
@OpenAPIDefinition(
    info = @Info(
        title = "FinTwin.ai API",
        version = "v1",
        description = "Indian Personal Finance Intelligence Platform",
        contact = @Contact(email = "api@fintwin.ai")
    ),
    security = @SecurityRequirement(name = "bearerAuth")
)
@SecurityScheme(name = "bearerAuth", type = SecuritySchemeType.HTTP, scheme = "bearer")
@Configuration
public class OpenApiConfig {}
```

Annotate controllers with `@Tag`, `@Operation`, `@ApiResponse`. Accessible at `/swagger-ui.html` in dev.

**Effort:** 1 day | **Risk if skipped:** Friction for any future mobile app, partner API, or new team member.

---

#### 9. API Versioning

**Current state:** All endpoints are unversioned (`/api/transactions`). Any breaking change to a response shape breaks the current frontend immediately.

**What to build:**

Add version prefix to all routes:
```
/api/v1/transactions
/api/v1/budgets
/api/v1/auth/login
```

In Spring, use a `RequestMappingHandlerMapping` with a version prefix, or simply add `v1` to all `@RequestMapping` paths:
```java
@RestController
@RequestMapping("/api/v1/transactions")
public class TransactionController { ... }
```

nginx can strip or rewrite the prefix for backward compatibility during migration.

This lets you introduce `/api/v2/transactions` with a new response shape while the old frontend still works on v1 during a phased rollout.

**Effort:** 1 day (refactor) | **Risk if skipped:** Every future response shape change requires a coordinated frontend + backend deploy.

---

#### 10. React Error Boundary + Frontend Error Tracking

**Current state:** No `React.ErrorBoundary` component. If a component throws during render (e.g., bad API response shape), React unmounts the entire app with a blank white screen and no user-visible error message.

**What to build:**

`ErrorBoundary.jsx`:
```jsx
class ErrorBoundary extends React.Component {
    state = { hasError: false, error: null };

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        // Send to Sentry
        Sentry.captureException(error, { extra: info });
    }

    render() {
        if (this.state.hasError) {
            return <ErrorFallback error={this.state.error} onReset={() => this.setState({ hasError: false })} />;
        }
        return this.props.children;
    }
}
```

Wrap each page route in a boundary so one crashing page doesn't unmount the whole app.

**Sentry** (or self-hosted Glitchtip for cost) for both frontend and backend:

Backend (`pom.xml`):
```xml
<dependency>
    <groupId>io.sentry</groupId>
    <artifactId>sentry-spring-boot-starter-jakarta</artifactId>
    <version>7.x</version>
</dependency>
```

Frontend (`package.json`):
```
@sentry/react
```

Sentry captures stack traces, replays the user's session before the crash, and groups errors by fingerprint. You see "500 users hit this error today" before support tickets come in.

**Effort:** 1 day | **Risk if skipped:** Production JavaScript errors are invisible; users get blank screens with no feedback.

---

### TIER 3 — Medium Priority (60–90 days post-launch)

---

#### 11. Async Notification Processing (Message Queue)

**Current state:** Email sends happen synchronously inside service calls. If the SMTP server is slow, the `/api/auth/register` endpoint is slow. There is no retry on email failure.

**What to build:**

Introduce Spring's `@Async` for email first (minimal change):
```java
// EmailService.java
@Async("emailExecutor")
public CompletableFuture<Void> sendVerificationOtpAsync(String email, String name, String otp) {
    sendVerificationOtp(email, name, otp);
    return CompletableFuture.completedFuture(null);
}
```

For larger scale, use Redis Streams (already in stack) or RabbitMQ:

```java
// Publish notification event
redisTemplate.opsForStream().add("notifications", Map.of(
    "type", "EMAIL_OTP",
    "to", email,
    "otp", otp
));

// Consumer (separate thread pool or service)
@StreamListener("notifications")
public void handleNotification(NotificationEvent event) {
    emailService.sendVerificationOtp(event.getTo(), event.getName(), event.getOtp());
}
```

Benefits: registration response is instant; failed emails are retried automatically; SMS and push can be added as additional consumers of the same event.

**Effort:** 2–3 days | **Risk if skipped:** Slow SMTP server degrades user-facing registration latency.

---

#### 12. Background Job Scheduler

**Current state:** `ScheduledPriceRefreshService.java` uses `@Scheduled`. There is no distributed lock — if multiple backend pods are running (HPA can scale to 10), every pod runs the same scheduled job simultaneously, causing duplicate market data refreshes and potential write conflicts.

**What to build:**

Use **ShedLock** for distributed job locking (minimal dependency):
```xml
<dependency>
    <groupId>net.javacrumbs.shedlock</groupId>
    <artifactId>shedlock-spring</artifactId>
</dependency>
<dependency>
    <groupId>net.javacrumbs.shedlock</groupId>
    <artifactId>shedlock-provider-jdbc-template</artifactId>
</dependency>
```

```java
@Scheduled(fixedDelay = 300_000)
@SchedulerLock(name = "priceRefresh", lockAtLeastFor = "PT4M", lockAtMostFor = "PT5M")
public void refreshPrices() { ... }
```

Creates a `shedlock` table in PostgreSQL; only one pod acquires the lock per run.

Add a Flyway migration for the `shedlock` table.

**Effort:** 1 day | **Risk if skipped:** Duplicate jobs cause wasted API calls and potential data corruption at scale.

---

#### 13. Database Query Timeout + Statement-Level Protection

**Current state:** No `statement_timeout` in the JDBC URL or connection properties. A slow query (e.g., a missing index on a new query path) can hold a HikariCP connection for minutes, starving other requests.

**What to add:**

In `application.properties`:
```properties
spring.datasource.hikari.connection-init-sql=SET statement_timeout='30000'
```

Or in the JDBC URL:
```
jdbc:postgresql://host/db?socketTimeout=60&connectTimeout=10
```

This kills any individual query that runs longer than 30 seconds, releasing the connection back to the pool.

Add to Flyway baseline (per-role setting):
```sql
ALTER ROLE fintwin_app SET statement_timeout = '30s';
```

**Effort:** 30 minutes | **Risk if skipped:** One bad query starves the connection pool and takes down the app.

---

#### 14. Feature Flags

**Current state:** Deploying a new feature means all users see it immediately. Rollback requires a full redeploy. A/B testing or gradual rollouts are impossible.

**What to build:**

Minimal implementation without a paid service:

```java
// FeatureFlag enum + config-driven
public enum FeatureFlag {
    PREMIUM_FORECASTING,
    CRYPTO_CONNECTIONS,
    VIDEO_KYC,
    UPI_INTEGRATION
}

@Component
public class FeatureFlags {
    @Value("${features.premium-forecasting:false}")
    private boolean premiumForecasting;

    public boolean isEnabled(FeatureFlag flag) {
        return switch (flag) {
            case PREMIUM_FORECASTING -> premiumForecasting;
            ...
        };
    }
}
```

For user-level flags (gradual rollout to 5% of users), use Redis:
```java
// 5% rollout: hash(userId) % 100 < 5
public boolean isEnabledForUser(FeatureFlag flag, Long userId) {
    String key = "flag:" + flag.name();
    String config = redisTemplate.opsForValue().get(key);
    // config = "rollout:5" → 5% of users
    // config = "enabled" → all users
    // config = "user:42,99,103" → specific user IDs only
}
```

This lets you:
- Soft-launch PREMIUM_FORECASTING to 10% of users
- Give RBAC-assigned BETA_USER role access to unreleased features
- Disable a broken feature in seconds via Redis without redeploy

**Effort:** 2 days | **Risk if skipped:** All feature releases are binary all-or-nothing deploys.

---

#### 15. Soft Delete + Data Retention Policy

**Current state:** `ProfileService.deleteAccount()` hard-deletes the user and all associated data immediately. This is a GDPR "right to erasure" implementation, but it creates two problems:
1. The audit log retains entries with `user_id` FK — if the user is deleted, the FK breaks or the audit row is orphaned.
2. There is no grace period (e.g., 30-day account recovery window that most financial apps provide).

**What to build:**

Add a `deleted_at` timestamp to `users`:
```sql
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;
```

Change `deleteAccount()` to a soft delete:
```java
user.setDeletedAt(LocalDateTime.now());
user.setEnabled(false);
user.setEmail("deleted_" + user.getId() + "@deleted.fintwin.ai"); // PII removed
user.setFullName("Deleted User");
userRepository.save(user);
```

Add a scheduled job that hard-deletes users with `deleted_at < NOW() - INTERVAL '30 days'`.

This satisfies both GDPR Article 17 (erasure within 30 days) and gives users a recovery window.

**Effort:** 1 day | **Risk if skipped:** Deleted users' audit logs have orphaned FKs; no account recovery option.

---

#### 16. Spring Environment Profiles (dev / staging / prod)

**Current state:** Single `application.properties` with env-var overrides. Works, but managing which defaults apply to which environment requires knowing all the env vars.

**What to build:**

Create:
- `application.properties` — shared config, no secrets
- `application-dev.properties` — dev defaults (H2 or local postgres, no TLS, verbose logging, devOtp enabled)
- `application-staging.properties` — staging DB, real Setu sandbox, SMS disabled
- `application-prod.properties` — prod DB, full TLS, JSON logging, all services enabled

Activate with: `SPRING_PROFILES_ACTIVE=prod` in Docker/k8s env.

Each profile file overrides only what changes — the base file holds the structural config.

**Effort:** 1 day | **Risk if skipped:** Dev accidentally uses prod DB credentials; prod uses dev logging verbosity.

---

### TIER 4 — Indian Fintech Specific

---

#### 17. DPDP Act 2023 Compliance (India's Data Protection Law)

India's Digital Personal Data Protection Act 2023 is in force. Key obligations for FinTwin.ai:

| DPDP Requirement | Current State | What to Build |
|------------------|--------------|---------------|
| **Explicit consent** per purpose | `consentGivenAt` stored, but single blanket consent | Granular consent per data category (analytics, AI processing, bank sync) |
| **Data Principal rights** | Export (`exportData`) exists | Add `viewConsent()`, `withdrawConsent()`, `correctData()` endpoints |
| **Grievance officer** | `TicketController` exists | Designate a named grievance officer, add their contact to Privacy Policy |
| **Data fiduciaries** | Not documented | List all third parties (Setu, Google OAuth, SMTP provider) in disclosures |
| **Children** | No age gate | Block users under 18 (add DOB field + validation) |
| **Data localization** | Configurable DB host | Enforce `DB_URL` to point to Indian region; document in deployment guide |
| **Breach notification** | `IncidentResponsePlan.md` exists | Add automated breach detection trigger, 72-hour RBI/CERT-In notification checklist |

**Effort:** 1–2 weeks (legal + engineering jointly) | **Risk if skipped:** Regulatory penalty up to ₹250 crore.

---

#### 18. SEBI Compliance (Investment Features)

FinTwin.ai shows investment recommendations (`InvestmentRecommendationService.java`). Under SEBI regulations:

- Investment advice requires a **SEBI-registered Investment Adviser (IA)** license, or the advice must be clearly marked as **educational/informational only** with a mandatory disclaimer.
- The current AI recommendation response has no disclaimer.

**What to add:**

Add to every AI investment recommendation response:
```json
{
  "recommendation": "...",
  "disclaimer": "This is AI-generated educational content and not SEBI-registered investment advice. Consult a registered financial advisor before making investment decisions. FinTwin.ai is not a SEBI-registered Investment Adviser.",
  "sebiRegistered": false
}
```

Add the disclaimer prominently in the UI wherever investment content is shown.

Long term: if FinTwin grows into active investment advice, apply for SEBI IA registration or partner with a registered IA.

**Effort:** 1 day (tech) + legal review | **Risk if skipped:** SEBI enforcement action.

---

#### 19. UPI Integration (Future Revenue Driver)

**Current state:** UPI transactions are recognized in transaction categorization, but there is no UPI payment initiation.

When FinTwin introduces subscription billing or goal-based saving automation (e.g., "auto-transfer ₹5000 to my FD goal on the 1st of every month"):

- Integrate with **Razorpay** or **PayU** for UPI Autopay (NACH mandates)
- Use the **NPCI's UPI 2.0 API** for P2P transfers (requires partner bank agreement)
- Setu already provides UPI collection APIs

**Effort:** 2–3 weeks when needed | **Risk if skipped:** Cannot monetize or automate savings transfers.

---

#### 20. Credit Bureau Integration

**Current state:** `CreditScoreService.java` calculates a **synthetic credit score** based on the user's own transaction history. This is not a real CIBIL/Equifax score.

**What to build when needed:**

- Integrate with **CIBIL TransUnion API** or **Equifax India API** (requires RBI NBFC license or partner NBFC)
- Or use **Perfios** / **FinBox** as intermediaries
- Display the real bureau score alongside the FinTwin synthetic score
- Clearly label synthetic score as "FinTwin Financial Health Score" to avoid confusion

**Effort:** 3–4 weeks (requires licensing/partnership) | Not a day-1 requirement.

---

## Summary Prioritization

```
TIER 1 — Do before going live
├── Observability (Prometheus + OTel + JSON logs)     2–3 days
├── Resilience4j circuit breakers + timeouts          2 days
├── SMS notifications (MSG91/Gupshup)                 2 days
└── KYC — PAN verification                            3–4 days

TIER 2 — Do within first month
├── Integration tests (Testcontainers)                1 week
├── Per-user rate limiting                            1 day
├── Redis caching (@Cacheable)                        2 days
├── OpenAPI / Swagger docs                            1 day
├── API versioning (/api/v1/)                         1 day
└── React Error Boundary + Sentry                    1 day

TIER 3 — Do within 60–90 days
├── Async email processing                            2 days
├── ShedLock for distributed scheduled jobs          1 day
├── DB statement_timeout                             30 min
├── Feature flags                                    2 days
├── Soft delete + 30-day grace period                1 day
└── Spring environment profiles (dev/staging/prod)   1 day

TIER 4 — Legal/compliance milestones
├── DPDP Act 2023 granular consent + rights          1–2 weeks
├── SEBI disclaimer on investment content            1 day
├── UPI Autopay integration                          2–3 weeks (when needed)
└── Credit bureau integration                        3–4 weeks (when licensed)
```

---

## What You Do NOT Need to Build

To avoid over-engineering, these are explicitly out of scope for a PFM app at this stage:

- **Multi-tenancy** — FinTwin serves individual consumers, not B2B
- **gRPC** — REST is sufficient; gRPC adds complexity for no gain here
- **Event sourcing** — overkill for a personal finance app; standard CRUD with audit log is correct
- **Saga pattern / distributed transactions** — no multi-step distributed writes that require it
- **Service mesh (Istio)** — adds operational overhead before you have the team to run it
- **Custom ML model training** — Ollama/phi3 is the right call; training is a much later stage

---

*Document generated from codebase audit. Every gap listed corresponds to a verified absence in the code. No theoretical additions.*
