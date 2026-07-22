# FinTwin.ai — Complete System Flow

How the whole system works, feature by feature: which files are involved in the
frontend, identity-service, backend, and ai-service, which APIs they call, how
data moves between them, how it is encrypted, how it is stored in the database,
and how the user ends up seeing decrypted data.

Last updated: 2026-07-12

---

## 1. Big picture — the four services

```
                        Browser (React SPA)
                              │
              Vite dev proxy (dev) / nginx (prod)
                    │                     │
     /api/auth, /api/2fa,           /api/v1/**
     /api/token, /api/admin              │
                    │                     │
        ┌───────────▼─────────┐   ┌───────▼──────────┐     X-Internal-Key      ┌──────────────────┐
        │  identity-service   │   │     backend      │ ──────────────────────► │    ai-service    │
        │  Spring Boot :8090  │   │ Spring Boot :8080│                         │  FastAPI :8000   │
        │  auth, tokens, 2FA  │   │  business logic  │ ◄────────────────────── │  LLM, forecast,  │
        └───────────┬─────────┘   └───────┬──────────┘                         │  OCR, coach      │
                    │                     │                                    └────────┬─────────┘
                    │   same Postgres DB  │                                             │
                    └──────────┬──────────┘                                    Ollama :11434
                               ▼                                               (qwen2.5:3b)
                     PostgreSQL (`fintwin`)          Redis (rate limiting / cache)
```

| Service | Stack | Port | Responsibility |
|---|---|---|---|
| `frontend/` | React + Vite + Tailwind | 5173 | UI. All data via two axios clients in `frontend/src/services/api.js` |
| `identity-service/` | Spring Boot | 8090 | Registration, login, Google OAuth, 2FA, refresh tokens, password flows, account lockout, admin user management |
| `backend/` | Spring Boot | 8080 | All business data: transactions, budgets, goals, net worth, investments, insurance, bank connections, reports, admin metrics, RBAC |
| `ai-service/` | FastAPI (Python) | 8000 | LLM chat, goal planning, Prophet forecasting, OCR, market prices, investment recommendations, spending coach, weekly report text |

**Trust model — how the services trust each other:**

1. **Shared JWT secret.** identity-service issues JWTs
   (`identity-service/.../security/JwtUtil.java`, `jwt.secret` in
   `application.properties`). The backend verifies those same tokens locally
   with its own `backend/.../security/JwtUtil.java` using the **same
   `JWT_SECRET`** — no network call per request. (identity also exposes
   `POST /api/token/introspect` in `TokenController.java` for explicit checks,
   guarded by a shared introspect secret.)
2. **Shared database.** Both Spring services point at the same Postgres
   `fintwin` DB. identity-service reads/writes the `users` and
   `refresh_tokens` tables; the backend reads the same `users` table for
   authorization and owns everything else. Both encrypt the same fields with
   the same `FINTWIN_ENCRYPTION_KEY`, so a user row written by identity is
   readable by the backend and vice-versa.
3. **Internal API key.** The browser never talks to ai-service. Only the
   backend calls it, attaching `X-Internal-Key` via the interceptor in
   `backend/.../config/AiServiceConfig.java` (`aiRestTemplate` bean, 3 s
   connect / 20 s read timeout). ai-service rejects any request without the
   matching key in a constant-time check (`ai-service/app.py`,
   `verify_internal_key` middleware).

---

## 2. Request routing

**Dev** — `frontend/vite.config.js` proxies:
- `/api/v1/**` → `http://localhost:8080` (backend; listed first so it wins)
- `/api/**` → `http://localhost:8090` (identity-service)

**Prod** — `nginx/nginx.conf`:
- `/api/(auth|2fa|token|admin)/**` → `identity-service:8090`
- `/api/**` → `backend:8080`
- `/ai/**` → ai-service (internal)
- everything else → static React build

So the frontend only ever calls relative paths; the two axios clients encode
the split:

```js
// frontend/src/services/api.js
const API        = axios.create({ baseURL: "/api/v1" }); // backend
const identityApi = axios.create({ baseURL: "/api" });   // identity-service
```

Both clients share a request interceptor (`attachToken`) that adds
`Authorization: Bearer <token>` from `localStorage`, and a **global 401
auto-refresh interceptor**: on 401, exactly one `POST /api/auth/refresh` runs;
concurrent failed requests queue and retry with the new token.

---

## 3. Cross-cutting machinery (used by every flow)

### 3.1 Field-level encryption at rest (AES-256/GCM)

Files (mirrored in both Spring services):

| File | Purpose |
|---|---|
| `backend/.../security/EncryptionConverter.java` | JPA `AttributeConverter<String,String>`. Encrypts on write, decrypts on read |
| `backend/.../security/EncryptedBigDecimalConverter.java` | Same, for `BigDecimal` money fields |
| `backend/.../security/EncryptedDoubleConverter.java` | Same, for `double` fields (rates, percentages) |
| `backend/.../security/EmailHashUtil.java` | HMAC-SHA256 blind index so encrypted emails stay searchable |
| `identity-service/.../security/EncryptionConverter.java` + `EmailHashUtil.java` | Identical copies so identity can read/write the shared `users` table |

**Write path:** any entity field annotated
`@Convert(converter = EncryptionConverter.class)` is transparently encrypted
by Hibernate the moment the repository saves it. The converter generates a
random 12-byte IV per value, encrypts with AES-256/GCM (128-bit auth tag),
prepends the IV to the ciphertext, and Base64-encodes the result. That Base64
string is what actually lands in the Postgres column.

**Read path:** when Hibernate hydrates the entity, `convertToEntityAttribute`
Base64-decodes, splits IV + ciphertext, decrypts, and returns plaintext to the
Java object. **Services, controllers and DTOs only ever see plaintext** — the
user sees decrypted data simply because every JPA read decrypts before the DTO
is built and serialized to JSON. Legacy pre-encryption rows are detected and
returned as-is (one-time WARN suggests `POST /admin/migrate-encryption`, which
runs `EncryptionMigrationService.java` to re-save every row encrypted).

**The email problem:** GCM's random IV means the same email encrypts
differently every time, so `WHERE email = ?` can't work on ciphertext.
`EmailHashUtil` computes a *deterministic* HMAC-SHA256 of the lowercased email
(keyed with the same encryption key) into a separate `email_hash` column. All
lookups (`UserRepository.findByEmail…`) actually match on `email_hash`; the
encrypted `email` column is only ever decrypted for display.

**What is encrypted** (every `@Convert` in `backend/.../model/`):
`User` (email, fullName, phone, TOTP secret), `Transaction` (description,
amount, category), `Asset` (name, value), `Liability` (name, amount, interest
rate, EMI), `Investment` (name, quantity, prices, notes), `Budget` (limit),
`FinancialGoal` (title, amounts, rates), `InsurancePolicy` (provider, policy
number, premium, cover), `BankConnection` (consent/session ids, account refs),
`CryptoConnection` (API keys), `ChatHistory` (question, answer),
`Notification` (message), `SupportTicket` (message). Key setup and coverage
history: `docs/`-adjacent migrations `V12__encrypt_insurance_and_ticket.sql`
and memory of the original rollout.

### 3.2 Authentication chain (every protected request)

1. Browser sends `Authorization: Bearer <accessToken>` (attached by
   `api.js`).
2. Backend `security/JwtFilter.java` runs once per request:
   - verifies signature + expiry via `JwtUtil.extractClaims`
   - rejects `type=2fa_pending` temp tokens (can only be exchanged at 2FA login)
   - loads the user via `CustomUserDetailsService` (one DB hit) — rejects if
     the account was disabled, or if the token was issued before
     `lastLogoutAt` (force-logout support)
   - stores impersonation claim `imp_by` for audit attribution
   - populates Spring's `SecurityContext` with the user's authorities.
3. `security/SecurityConfig.java` + `@PreAuthorize` annotations enforce RBAC
   (`security/Role.java`, `Permission.java`,
   `FinTwinPermissionEvaluator.java` — see `docs/rbac.md`).
4. Controllers resolve the current user through `SecurityUtils.java`.

`RateLimitFilter.java` (both Spring services) sits before all this and
throttles per-IP (Redis-backed when available); `BlockedIP.java` +
`SecurityAdminService.java` handle explicit IP blocks.

### 3.3 Audit logging

`backend/.../audit/` — `@Audited` annotation on service methods →
`AuditAspect.java` intercepts → `AuditService` writes an `AuditLog` row
asynchronously (`AuditAsyncConfig`). The `audit_log` table is partitioned by
month (`V3__audit_log_partition.sql`); `AuditRetentionService` prunes old
partitions. Admins read it via `AdminApiController` → dashboard.

### 3.4 Database migrations

Backend: `backend/src/main/resources/db/migration/V1__baseline.sql` … `V12`
(Flyway). identity-service: its own `db/migration/V1__identity_schema.sql`
(refresh_tokens etc.) and `V2__totp_replay_guard.sql`, in a separate Flyway
history so the two services migrate independently against the same DB.

---

## 4. Feature flows

### 4.1 User registration (with email verification)

```
Register.jsx ──POST /api/auth/register──► identity AuthController ──► AuthService.register()
                                                                          │ validate password (PasswordValidator)
                                                                          │ normalize email → EmailHashUtil.hash → duplicate check
                                                                          │ BCrypt-hash password (PasswordEncoder)
                                                                          │ generate 6-digit OTP, hash it, set expiry
                                                                          │ save User (email/fullName encrypted by EncryptionConverter)
                                                                          │ EmailService → SMTP: send OTP mail
Register.jsx ──POST /api/auth/verify-email {email, otp}──► verify OTP hash → user.emailVerified = true
Register.jsx ──POST /api/auth/resend-verification──► re-send if expired
```

- **Frontend:** `pages/Register.jsx` collects fullName/email/password +
  consent checkbox, posts via `identityApi`, then shows the OTP entry step and
  calls `verify-email`. On success it routes to `/login`.
- **Identity files:** `controller/AuthController.java`,
  `service/AuthService.java`, `service/EmailService.java`,
  `security/PasswordValidator.java`, `model/User.java`,
  `repository/UserRepository.java`.
- **Storage:** one row in `users` — `email` (AES-GCM ciphertext),
  `email_hash` (HMAC blind index used for the uniqueness check), `full_name`
  (ciphertext), `password` (BCrypt hash — hashed, *not* encrypted, never
  decryptable), OTP hash + expiry, `consent_given`, `role = USER`.
- Registration is `@Audited` (PCI-DSS 10.2) — an `audit_log` row is written.
- The backend never participates in registration; it sees the new user later
  because both services share the `users` table.

### 4.2 Login (password, 2FA, Google) and session lifecycle

**Password login**

```
Login.jsx ──POST /api/auth/login {email,password}──► identity AuthService.login()
   │  lookup by email_hash → BCrypt compare
   │  lockout check: 5 consecutive failures → locked 15 min (LoginAttemptRecorder)
   │  if 2FA enabled → return short-lived {twoFactorToken, requires2fa:true} and STOP
   │  else → JwtUtil: accessToken (short TTL) + TokenService: refreshToken (hashed, stored in refresh_tokens)
Login.jsx ──GET /api/auth/me──► UserMeDTO (decrypted email/fullName/role)
AuthContext.login(accessToken, user, refreshToken) → localStorage
   → navigate to /dashboard
```

**2FA step** (if enabled): `Login.jsx` posts
`POST /api/auth/2fa/login {twoFactorToken, code}` →
`TwoFactorService.java` verifies the TOTP code against the user's
**encrypted TOTP secret**, with replay-guard (`V2__totp_replay_guard.sql`) —
only then are real tokens issued. The backend's `JwtFilter` explicitly rejects
`2fa_pending` tokens so they can't be used as access tokens.

**Google login:** `Login.jsx` gets a Google credential →
`POST /api/auth/google` → identity verifies the ID token
(`GoogleIdTokenVerifier`), creates-or-finds the user, issues the same token
pair.

**Session refresh (invisible to the user):** any 401 anywhere triggers the
shared interceptor in `api.js` → `POST /api/auth/refresh {refreshToken}` →
identity `TokenService` validates the hashed token, **rotates** it (old one
revoked, new one issued), and `TokenReuseGuard` detects reuse of a rotated
token as theft → revokes the whole token family. New pair replaces the old in
`localStorage`; queued requests replay.

**Logout:** `AuthContext.logout()` → `POST /api/auth/logout {refreshToken}` →
refresh token revoked; backend also supports force-logout via
`lastLogoutAt` (tokens issued before it are rejected by `JwtFilter`).

- **Frontend files:** `pages/Login.jsx`, `context/AuthContext.jsx`,
  `components/ProtectedRoute.jsx` (redirects to `/login` when no token),
  `components/AdminRoute.jsx` (additionally requires admin role).
- **Identity files:** `AuthController`, `AuthService`,
  `LoginAttemptRecorder`, `TokenService`, `TokenReuseGuard`,
  `TwoFactorService`, `JwtUtil`, `model/RefreshToken.java`.
- **Storage:** `refresh_tokens` table stores only a **hash** of each refresh
  token + family id + expiry; access tokens are stateless and never stored.

### 4.3 Password flows

- **Forgot/reset:** `Login.jsx` → `POST /api/auth/forgot-password` →
  identity emails a reset link to `APP_BASE_URL/reset-password?token=…` →
  `pages/ResetPasswordPage.jsx` → `POST /api/auth/reset-password` (token
  hash compared, new password validated + BCrypt-hashed, all refresh tokens
  revoked).
- **Change password (logged in):** `components/ChangePasswordModal.jsx`
  (opened from `SettingsPage.jsx`/`Profile.jsx`) →
  `POST /api/auth/change-password` with old + new password.

### 4.4 Onboarding

```
OnboardingPage.jsx ──POST /api/v1/onboarding/complete (OnboardingRequestDTO)──►
backend OnboardingController → OnboardingService.completeSetup()
   ├─ AssetRepository.save(savings)            ← encrypted name/value
   ├─ InvestmentRepository.save(each holding)  ← encrypted
   ├─ LiabilityRepository.save(each loan)      ← encrypted
   ├─ FinancialGoalRepository.save(each goal)  ← encrypted
   ├─ TransactionRepository.saveAll(seed income/recurring expenses)
   └─ userRepository.save(user with onboardingCompleted = true, profile fields)
```

The wizard (`pages/OnboardingPage.jsx`) collects income, savings, investments,
loans, goals in steps and submits once; the service fans the single DTO out
into the individual encrypted entities. `components/OnboardingChecklist.jsx`
on the dashboard reflects completion state.

### 4.5 Dashboard load (the biggest read path)

`pages/Dashboard.jsx` fires parallel `API.get(...)` calls on mount; each one is
an independent controller → service → repository chain, and **every value the
user sees was decrypted by the JPA converters during entity hydration**:

| UI component (frontend/src/components) | API | Backend chain |
|---|---|---|
| `DashboardHero`, `NetWorthSection` | `GET /api/v1/net-worth` | `NetWorthController` → `NetWorthService` (assets + investments + bank − liabilities; double-count fix keeps categories disjoint) |
| `AnalyticsCards`, `IncomeExpenseSection` | `GET /api/v1/analytics/...` | `AnalyticsController` → `AnalyticsService` (monthly aggregates over decrypted transactions) |
| `FinancialScoreCard` / `FinancialScoreChart` | `GET /api/v1/financial-score` | `FinancialScoreController` → `FinancialScoreService` (single score source; history in `FinancialScoreHistory`) |
| `EnhancedTransactionsTable` | `GET /api/v1/transactions` | `TransactionController` → `TransactionService` → `TransactionRepository` (paginated) |
| `BudgetSection` / `BudgetCard` | `GET /api/v1/budgets/status` | `BudgetController` → `BudgetService` (limit vs. spent per category) |
| `FinancialGoalsSection` | `GET /api/v1/goals` | `FinancialGoalController` → `GoalPlannerService`/`GoalMath` |
| `ForecastCard`, `CategoryForecastCard` | `GET /api/v1/forecast` | `ForecastController` → `ForecastService` → **ai-service `/forecast`** (see 4.8) |
| `AnomalyAlerts` | `GET /api/v1/anomalies` | `AnomalyController` → `AnomalyService` (statistical detection in backend; dismissals stored as `DismissedAnomalyPattern`) |
| `CreditScoreCard` | `GET /api/v1/credit-score` | `CreditScoreController` → `CreditScoreService` |
| `MarketTicker` | `GET /api/v1/market/...` | `MarketController` → `MarketDataService` (parallel fetch, Caffeine-cached) |
| `SmartNotifications` | `GET /api/v1/notifications` | `NotificationController` → `NotificationService` |
| `WeeklyReport` | `GET /api/v1/reports/weekly` | `ReportController` → `ReportService` (see 4.13) |
| `InsightService`-backed insights | `GET /api/v1/insights` | `InsightController` → `InsightService` (Caffeine-cached per user) |

Performance notes: hot aggregates are cached with Caffeine
(`project_performance` work), repositories use fetch-joins to avoid N+1, and
DB indexes live in `V2__indexes.sql`.

### 4.6 Adding data: transactions, quick entry, OCR receipts

**Manual / quick entry:** `components/QuickEntryDropdown.jsx` or the
transactions table → `POST /api/v1/transactions` (`TransactionDTO`) →
`TransactionController` → `TransactionService.save` → encrypted row
(`description`, `amount`, `category` ciphertext; `txn_date` is a plain
`LocalDate` column from `V10` so date filtering still works in SQL).

**Natural-language expense:** the copilot's expense mode routes text like
"spent 450 on groceries" through `ExpenseParserService.java` (with
`OllamaAIProvider` fallback) → creates the transaction.

**Receipt OCR:**

```
OCRSection.jsx / ImportsPage.jsx ──multipart POST /api/v1/transactions/ocr──►
TransactionController → TransactionService (line ~479)
   └─ aiRestTemplate.postForEntity(aiServiceUrl + "/ocr", image, X-Internal-Key)
        └─ ai-service ocr/routes.py → ocr/ocr_engine.py (Tesseract) → parsed merchant/amount/date
   ← backend validates + saves as encrypted Transaction
```

### 4.7 Budgets

`components/BudgetModal.jsx` / `BudgetSection.jsx` →
`POST|PUT /api/v1/budgets` → `BudgetController` → `BudgetService` →
`Budget` entity (`monthlyLimit` encrypted via
`EncryptedBigDecimalConverter`). `GET /budgets/status` computes spend vs.
limit by summing that month's decrypted transactions per category
(`CategoryService` normalizes category names).
`FinancialDataAggregatorService.computeBudgetAlerts` feeds over-budget
warnings into notifications and AI context.

### 4.8 Forecasting (ai-service)

```
ForecastCard.jsx ──GET /api/v1/forecast──► ForecastController → ForecastService
   │ builds monthly history from decrypted transactions (plaintext leaves the DB layer only here, server-side)
   └─ aiRestTemplate.post(aiServiceUrl + "/forecast")   [ForecastService.java:111]
        └─ ai-service forecasting/routes.py → prophet_forecaster.py (Prophet model)
   ← next-month(s) prediction per category → ForecastDTO/CategoryForecastDTO → JSON to browser
```

Only **aggregated numbers** (monthly totals per category) cross the wire to
ai-service — never raw encrypted rows or PII.

### 4.9 AI Copilot chat

```
Dashboard.jsx (owns state) + CopilotSection.jsx (UI, modes from constants/aiModes.js)
   ──POST /api/v1/transactions/chat {message, mode}──►
TransactionController.chat → ChatService
   ├─ FinancialDataAggregatorService.aggregate(user) → FinancialSummaryDTO
   │    (income, spend by category, budgets, goals, net worth — all monthly units)
   ├─ AIProvider (ai/AIProvider.java) → OllamaAIProvider.java:53
   │    aiRestTemplate.post(aiServiceUrl + "/chat", {message, mode, summary})
   │        └─ ai-service chatbot/routes.py → intent_classifier.py → prompt_engine.py
   │             → advisor.py → utils/ollama_client.py → Ollama qwen2.5:3b
   └─ ChatHistoryRepository.save(question + answer, both ENCRYPTED)
   ← markdown answer rendered by ReactMarkdown in CopilotSection
```

History: `GET/DELETE /api/v1/transactions/chat/history` — questions and
answers are stored encrypted in `chat_history` and decrypted on read like
everything else. `chatbot/memory.py` keeps short-term conversational context
on the Python side.

### 4.10 Goals & AI goal planner

CRUD: `FinancialGoalsSection.jsx` → `/api/v1/goals` →
`FinancialGoalController` → `GoalPlannerService` + `util/GoalMath.java`
(progress %, required monthly saving — real EMI/DTI math from the financial
logic fixes). AI plan: `GoalPlannerService.java:450` posts the goal + summary
to ai-service `/goal-plan` (`chatbot/goal_routes.py` → `goal_planner.py`) and
returns a step plan. All goal amounts are stored encrypted.

### 4.11 Investments, market data, recommendations

- **Portfolio CRUD:** `pages/InvestmentsPage.jsx` (+ `PortfolioTab`,
  `MutualFundsTab`, `USStocksTab`, `SIPTracker`) → `/api/v1/portfolio` →
  `InvestmentController` → `InvestmentService`. Holdings encrypted.
- **Live prices:** `InvestmentService.java:228` and the scheduled
  `ScheduledPriceRefreshService.java:101` call ai-service `/market/prices`
  (`investments/price_service.py` wraps yfinance-style lookups);
  `MarketDataService` caches quotes (Caffeine) and fetches in parallel.
- **Recommendations:** `InvestmentRecommendationSection.jsx` →
  `/api/v1/investment-recommendations` → `InvestmentRecommendationService.java:92`
  → ai-service `/investment-recommendation`
  (`investments/recommendation_engine.py`) → risk-profiled suggestions.

### 4.12 Bank & crypto connections (Setu Account Aggregator)

```
BankConnectionSection.jsx ──POST /api/v1/bank/connect──► BankConnectionController
   → BankConnectionService → SetuAAService.createConsent(customerVua)   ← Setu AA REST API
   ← consent URL → browser redirects user to the AA approval page
User approves at bank → Setu calls back:
   POST /api/v1/bank/webhook ──► SetuWebhookController
      │ SetuJwsVerifier.java verifies the JWS signature (authenticity)
      │ idempotency guard (V5__bank_idempotency.sql)
      └─ SetuAAService.createFISession → fetchAllFIData / fetchTransactions
           → imported as encrypted Transactions + BankConnection row
BankConnectedPage.jsx shows the result; consent/session ids stored ENCRYPTED on BankConnection
```

Crypto: `CryptoConnectionController` → `CryptoConnectionService` →
`CryptoConnection` (exchange API keys stored **encrypted**), balances folded
into net worth.

### 4.13 Insurance, reports, notifications

- **Insurance:** `pages/InsurancePage.jsx` → `/api/v1/insurance` →
  `InsuranceController` → `InsurancePolicyService`. Provider, policy number,
  premium, cover amount all encrypted (`V12` migration).
- **Weekly report:** `WeeklyReport.jsx` → `GET /api/v1/reports/weekly` →
  `ReportService` aggregates the week; `ReportService.java:289` asks
  ai-service `POST /reports/weekly-report` (`report_routes.py` →
  `chatbot/report_generator.py`) for the narrative summary. PDF export happens
  client-side (jspdf/html2canvas chunk).
- **Notifications:** generated server-side (budget alerts, anomalies, goal
  milestones) via `NotificationService`, stored with encrypted message text,
  polled by `SmartNotifications.jsx` through `/api/v1/notifications`.
- **Spending coach:** `pages/SpendingCoachPage.jsx` →
  `/api/v1/spending-coach` → `SpendingCoachService.java:101` → ai-service
  `/spending-coach` (`spending_coach/coach_engine.py`) → habit advice.
- **Affordability:** `AffordabilitySection.jsx` → `/api/v1/affordability` →
  `AffordabilityService` ("can I afford X?" against real monthly cash flow).

### 4.14 Profile & settings

`pages/Profile.jsx` + `components/SettingsPage.jsx`:
- `GET/PUT /api/v1/profile` → `ProfileController` → `ProfileService`
  (decrypted `ProfileDTO` out, re-encrypted on save).
- 2FA management UI → identity `/api/2fa/status|setup|enable|disable`
  (`identity TwoFactorController`; setup requires a fresh password check, the
  TOTP secret is stored encrypted on the user row).
- `ChangePasswordModal.jsx` → identity `/api/auth/change-password`.
- `DeleteAccountModal.jsx` → account deletion flow on the backend.
- Currency/theme are client-side contexts (`CurrencyContext.jsx`,
  `ThemeContext.jsx`).

### 4.15 Admin (RBAC-gated)

Frontend: `pages/AdminPage.jsx` behind `AdminRoute.jsx`.

- **User management** lives in **identity-service**: `/api/admin/stats`,
  `/api/admin/users`, promote-by-email, reset-password, unlock,
  **impersonate** (`AdminUserController` → `AdminService`). Impersonation
  issues a token with an `imp_by` claim; the backend's `JwtFilter` surfaces it
  so `AuditAspect` attributes actions to the admin. The frontend keeps the
  impersonated session in `_imp_token`/`_imp_user`
  (`AuthContext.resolveToken`).
- **Business metrics**: backend `/api/v1/admin/metrics`
  (`AdminMetricsController`, DB-backed) and `/api/v1/admin/**`
  (`AdminApiController`: users list, audit log, tickets).
- **Roles/permissions**: `/api/v1/admin/roles` (`RoleController`) — see
  `docs/rbac.md`.
- **Security posture**: `/api/v1/admin/security`
  (`SecurityAdminController` → `SecurityAdminService`): blocked IPs, config
  posture checks (`SecurityStartupValidator` findings), alert status
  (`SecurityAlertService` → Prometheus/Alertmanager → Gmail relay).

### 4.16 Support tickets

Pre-login help (`Login.jsx` line ~73) and `HelpWidget.jsx` post to
`/api/v1/tickets` → `TicketController` → `TicketService` →
`SupportTicket` (message encrypted). Admins triage via the admin API.

---

## 5. One worked example, end to end (encryption lifecycle)

"User adds a ₹2,500 grocery expense and later sees it on the dashboard":

1. `QuickEntryDropdown.jsx` builds `{description: "BigBasket", amount: 2500,
   category: "Groceries", date: "2026-07-12"}` and calls
   `API.post("/transactions", dto)` — `api.js` attaches the JWT.
2. Vite proxy/nginx routes `/api/v1/transactions` to the backend.
3. `JwtFilter` validates the token (signature, expiry, not-disabled,
   not-force-logged-out) and sets the authenticated user.
4. `TransactionController` → `TransactionService.save`: ownership set to the
   current user, category normalized, monthly caches evicted.
5. On `TransactionRepository.save`, Hibernate invokes the converters:
   `description` and `category` → `EncryptionConverter`, `amount` →
   `EncryptedBigDecimalConverter`. Each becomes `Base64(IV ‖
   AES-256-GCM-ciphertext)`. The SQL `INSERT` contains only ciphertext (plus
   plaintext `txn_date` and `user_id` for querying).
6. In Postgres you'd see something like `6yfN…Q==` in the `description`
   column — unreadable without `FINTWIN_ENCRYPTION_KEY`.
7. Dashboard reload → `GET /api/v1/transactions` → repository query filters
   by `user_id`/`txn_date` (plaintext columns), Hibernate hydrates rows, the
   converters decrypt each field, `TransactionDTO` is built from plaintext and
   serialized to JSON over HTTPS.
8. The browser renders "BigBasket ₹2,500 Groceries". At no point did the
   frontend do any crypto — decryption is entirely server-side, and the DB at
   rest never holds financial plaintext.

---

## 6. Deployment & operations (context)

- **Local dev:** `scripts/run.sh` starts the backend with `mvn` (see
  `docs/start-app.md`); identity-service on 8090; `uvicorn app:app` for
  ai-service (needs `AI_INTERNAL_KEY` + Ollama running); `npm run dev` for the
  frontend.
- **Containers/k8s:** `k8s/{backend,frontend,ai-service,postgres,redis,monitoring}`
  manifests; nginx terminates TLS and routes as in §2; HPA + resource limits
  per `docs/production-readiness.md`.
- **Monitoring:** Spring Actuator/Micrometer → Prometheus → Grafana
  (`ops/grafana`), alert rules → Alertmanager → email
  (`SecurityAlertService` covers app-level security alerts).
- **Observability plumbing:** `filter/MdcLoggingFilter.java` adds request ids
  to logs; `config/FinTwinMetrics.java` exposes custom counters (logins,
  registrations, AI latency).
- **CI/CD:** 5 GitHub workflows (3 CI + deploy + security scan) —
  `docs/production-readiness.md` and the release scripts
  (`scripts/release.sh`, `scripts/hotfix.sh`).

## 7. Related docs

- `docs/identity-service.md`, `docs/identity-service-security-fixes.md` — auth deep-dive
- `docs/rbac.md` — roles/permissions matrix
- `docs/security-policy.md`, `docs/infra-transport-hardening.md` — security posture
- `docs/backend-financial-logic-fixes.md`, `docs/ai-service-financial-logic-fixes.md` — money-math contracts
- `docs/start-app.md` — how to run everything locally
