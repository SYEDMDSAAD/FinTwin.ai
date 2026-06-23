# FinTwin.ai — Full Architecture

## Overview

FinTwin.ai is a three-tier fintech application. A React frontend communicates exclusively with a Spring Boot backend, which in turn calls a Python AI service for LLM and ML operations. The backend owns the database and is the single source of truth for all financial data.

```
┌─────────────────────────────────────────────────────────┐
│                     User's Browser                       │
│              React + Vite  (port 5173)                   │
└────────────────────────┬────────────────────────────────┘
                         │  HTTPS / REST (Axios)
                         │  JWT in Authorization header
                         ▼
┌─────────────────────────────────────────────────────────┐
│            Spring Boot Backend  (port 8080)              │
│  Spring Security · JPA · Audit AOP · Field Encryption   │
└──────────┬───────────────────────────┬──────────────────┘
           │  JDBC (PostgreSQL)        │  HTTP + X-Internal-Key
           ▼                           ▼
┌─────────────────┐        ┌──────────────────────────────┐
│   PostgreSQL    │        │  Python FastAPI AI Service    │
│   (port 5432)   │        │  (port 8000) + Ollama LLM    │
└─────────────────┘        └──────────────────────────────┘
```

---

## 1. Frontend

**Runtime:** Node 20 · Vite 8 · React 19  
**Port:** 5173

### Tech Stack

| Library | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| React Router DOM | 7 | Client-side routing |
| Vite | 8 | Build tool + dev server |
| Tailwind CSS | 3.4 | Utility-first styling |
| Axios | 1.16 | HTTP client |
| Recharts | 3.8 | Charts and graphs |
| Framer Motion | 12 | Animations |
| Lucide React | 1.16 | Icon library |
| react-hot-toast | 2.6 | Toast notifications |
| jsPDF + html2canvas | 4.2 / 1.4 | Client-side PDF export |
| react-markdown | 10 | Render AI markdown replies |
| @react-oauth/google | 0.13 | Google Sign-In |

### Directory Layout

```
frontend/src/
├── context/
│   ├── AuthContext.jsx        # JWT storage, login/logout, user state
│   ├── CurrencyContext.jsx    # Selected currency (INR/USD/…)
│   └── ThemeContext.jsx       # Dark/light theme toggle
├── pages/
│   ├── LandingPage.jsx        # Marketing home
│   ├── Login.jsx / Register.jsx
│   ├── OnboardingPage.jsx     # Post-register setup wizard
│   ├── Dashboard.jsx          # Main user dashboard + AI copilot
│   ├── AnalyticsPage.jsx
│   ├── InvestmentsPage.jsx
│   ├── NetWorthPage.jsx / NetWorthManagement.jsx
│   ├── SpendingCoachPage.jsx
│   ├── Profile.jsx
│   ├── ImportsPage.jsx        # CSV / OCR import
│   ├── InsurancePage.jsx
│   ├── BankConnectedPage.jsx  # Setu OAuth callback
│   └── AdminPage.jsx          # Admin panel (ADMIN role only)
├── components/                # 40+ feature components
│   ├── CopilotSection.jsx     # AI chat UI
│   ├── SettingsPage.jsx       # AI preferences, 2FA, notifications
│   └── …
├── services/
│   └── api.js                 # Axios instance, base URL, JWT interceptor
└── main.jsx                   # App entry, router, context providers
```

### Routing

All routes are wrapped in `ProtectedRoute` (redirects to `/login` if no JWT). `AdminRoute` additionally checks `role === "ADMIN"`.

| Path | Component | Guard |
|---|---|---|
| `/` | LandingPage | Public |
| `/login` `/register` | Login / Register | Public |
| `/onboarding` | OnboardingPage | Protected |
| `/dashboard` | Dashboard | Protected |
| `/analytics` | AnalyticsPage | Protected |
| `/investments` | InvestmentsPage | Protected |
| `/net-worth` | NetWorthPage | Protected |
| `/spending-coach` | SpendingCoachPage | Protected |
| `/profile` | Profile | Protected |
| `/imports` | ImportsPage | Protected |
| `/bank-connected` | BankConnectedPage | Protected |
| `/admin` | AdminPage | Admin only |

---

## 2. Backend

**Runtime:** Java 21 · Spring Boot 3.3  
**Port:** 8080  
**Build:** Maven (`mvn spring-boot:run`)

### Tech Stack

| Library | Version | Purpose |
|---|---|---|
| Spring Boot Starter Web | 3.3 | REST controllers, embedded Tomcat |
| Spring Data JPA | 3.3 | ORM + repository pattern |
| PostgreSQL JDBC | — | Database driver |
| Spring Security | 3.3 | Auth filter chain, role-based access |
| JJWT | 0.11.5 | JWT generation and validation |
| BCrypt | (Spring) | Password hashing (strength 12) |
| Bucket4j | 8.14 | Rate limiting (in-memory token bucket) |
| Google API Client | 2.7 | Google OAuth ID-token verification |
| GoogleAuth (TOTP) | 1.5 | TOTP secret generation |
| Spring AOP | 3.3 | `@Audited` cross-cutting audit logging |
| Spring Mail | 3.3 | SMTP email (ticket replies, password reset) |
| OpenCSV | 5.7 | CSV transaction import |
| OpenPDF | 1.3 | Server-side PDF report generation |
| ZXing | 3.5 | QR code generation for 2FA setup |
| Nimbus JOSE+JWT | 9.40 | Setu JWS webhook signature verification |

### Layer Architecture

```
HTTP Request
     │
     ▼
 JwtFilter ──► RateLimitFilter
     │
     ▼
Controller  (HTTP mapping, input validation, response shaping)
     │
     ▼
Service     (business logic, orchestration)
     │
     ├──► Repository  (Spring Data JPA, no custom SQL except @Query)
     │         │
     │         ▼
     │     PostgreSQL
     │
     └──► AIProvider  (interface — delegates to OllamaAIProvider)
               │
               ▼
         Python AI Service
```

### Package Structure

```
com.fintwin/
├── FinTwinApplication.java
├── ai/
│   ├── AIProvider.java              # Interface: chat(message, mode, summary)
│   └── OllamaAIProvider.java        # Impl: calls /chat on Python service
├── audit/
│   ├── Audited.java                 # Annotation for service methods
│   ├── AuditAspect.java             # AOP: intercepts @Audited, logs to AuditLog
│   ├── AuditAsyncConfig.java        # Async executor for non-blocking audit writes
│   ├── AuditLog.java                # Entity
│   ├── AuditLogRepository.java
│   ├── AuditRetentionService.java   # Scheduled: purges logs older than 90 days
│   └── AuditService.java            # Manual log(…) method for service use
├── config/
│   ├── AiServiceConfig.java         # RestTemplate bean + X-Internal-Key interceptor
│   ├── DataSeeder.java              # Dev seed: creates demo user on startup
│   ├── SchedulingConfig.java        # @EnableScheduling
│   └── SecurityStartupValidator.java# Fails fast if JWT_SECRET/ENCRYPTION_KEY missing
├── controller/                      # 30 controllers (HTTP layer only, no repo access)
├── dto/                             # 30 DTOs (no Lombok — builder/constructor pattern)
├── exception/
│   └── GlobalExceptionHandler.java  # @ControllerAdvice: maps exceptions to HTTP codes
├── model/                           # 14 JPA entities
├── repository/                      # 14 Spring Data JPA repositories
├── security/
│   ├── SecurityConfig.java          # Filter chain, CORS, route permissions
│   ├── JwtFilter.java               # Extracts + validates JWT on every request
│   ├── JwtUtil.java                 # sign/validate/extract claims; impersonation tokens
│   ├── RateLimitFilter.java         # Bucket4j: 20 req/min per IP
│   ├── CustomUserDetailsService.java
│   ├── SecurityUtils.java           # getCurrentUserEmail() from SecurityContext
│   ├── EncryptionConverter.java     # AES-256/GCM JPA AttributeConverter (String)
│   ├── EncryptedDoubleConverter.java# AES-256/GCM JPA AttributeConverter (Double)
│   ├── EmailHashUtil.java           # SHA-256 email hash for indexed lookup
│   ├── PasswordValidator.java       # Regex: ≥8 chars, upper+lower+digit+special
│   └── SetuJwsVerifier.java         # Verifies Setu webhook JWS signatures
└── service/                         # 30 services (all business logic lives here)
```

### Controllers → Services Map

| Controller | Service(s) | Routes |
|---|---|---|
| `AuthController` | `AuthService` | `/api/auth/**` |
| `TwoFactorController` | `TwoFactorService` | `/api/2fa/**`, `/api/auth/2fa/login` |
| `TransactionController` | `TransactionService`, `ChatService` | `/api/transactions/**`, `/api/chat/**` |
| `BudgetController` | `BudgetService` | `/api/budgets/**` |
| `FinancialGoalController` | `GoalPlannerService` | `/api/goals/**` |
| `AssetController` | `AssetService` | `/api/assets/**` |
| `LiabilityController` | `LiabilityService` | `/api/liabilities/**` |
| `InvestmentController` | `InvestmentService` | `/api/investments/**` |
| `InvestmentRecommendationController` | `InvestmentRecommendationService` | `/api/investment-recommendations` |
| `NetWorthController` | `NetWorthService` | `/api/networth` |
| `AnalyticsController` | `AnalyticsService` | `/api/analytics/**` |
| `ForecastController` | `ForecastService` | `/api/forecast/**` |
| `InsightController` | `InsightService` | `/api/insights/**` |
| `AnomalyController` | `AnomalyService` | `/api/anomalies/**` |
| `SpendingCoachController` | `SpendingCoachService` | `/api/spending-coach/**` |
| `CreditScoreController` | `CreditScoreService` | `/api/credit-score/**` |
| `FinancialScoreController` | `FinancialScoreService` | `/api/financial-score/**` |
| `AffordabilityController` | `AffordabilityService` | `/api/affordability/**` |
| `ReportController` | `ReportService` | `/api/reports/**` |
| `ProfileController` | `ProfileService` | `/api/profile/**` |
| `OnboardingController` | `OnboardingService` | `/api/onboarding/**` |
| `NotificationController` | `NotificationService` | `/api/notifications/**` |
| `MarketController` | `MarketDataService` | `/api/market/quotes` |
| `BankConnectionController` | `BankConnectionService`, `SetuAAService` | `/api/bank/**` |
| `SetuWebhookController` | `BankConnectionService` | `/api/bank/webhook` |
| `CryptoConnectionController` | `CryptoConnectionService` | `/api/crypto/**` |
| `TicketController` | `TicketService` | `/api/tickets`, `/api/admin/tickets/**` |
| `AdminApiController` | `AdminUserService` | `/api/admin/**` |
| `SecurityAdminController` | `SecurityAdminService` | `/api/admin/security/**` |
| `AdminController` | `AdminUserService`, `EncryptionMigrationService` | `/admin/**` (X-Admin-Key) |

### Database Models

```
User
├── id, email (SHA-256 hashed for index), fullName
├── password (BCrypt-12), role (USER/ADMIN)
├── enabled, onboardingCompleted
├── twoFactorEnabled, twoFactorSecret (encrypted)
├── lastLoginAt, lastLogoutAt, createdAt
└── googleId (encrypted)

Transaction          ← encrypted: amount, description, merchant
Budget               ← encrypted: amount, spent
FinancialGoal        ← encrypted: targetAmount, savedAmount
Asset                ← encrypted: value
Liability            ← encrypted: amount
Investment           ← encrypted: investedAmount, currentValue
ChatHistory          ← encrypted: userMessage, aiReply
BankConnection       ← encrypted: consentId, accountNumber, ifsc
CryptoConnection     ← encrypted: apiKey, apiSecret
Notification
SupportTicket
BlockedIP
FinancialScoreHistory
AuditLog             (no encryption — audit data must be readable)
```

### Security Architecture

```
Incoming request
       │
       ▼
RateLimitFilter — 20 req/min per IP (Bucket4j, in-memory)
       │
       ▼
JwtFilter
  ├── Extracts Bearer token from Authorization header
  ├── Validates signature + expiry (JwtUtil.extractClaims)
  ├── Checks lastLogoutAt < token.iat (force-logout detection)
  └── Sets UsernamePasswordAuthenticationToken in SecurityContext
       │
       ▼
SecurityFilterChain rules
  ├── /api/auth/**              → permitAll
  ├── /api/bank/webhook         → permitAll (Setu — JWS-verified internally)
  ├── /admin/**                 → permitAll (X-Admin-Key verified in controller)
  ├── /api/market/**            → permitAll
  ├── POST /api/tickets         → permitAll
  ├── /api/admin/**             → hasRole("ADMIN") + JWT
  └── everything else           → authenticated JWT required
```

**Field Encryption:** `EncryptionConverter` wraps every sensitive DB column with AES-256/GCM (random IV per write). Key is a 32-byte Base64 value in `FINTWIN_ENCRYPTION_KEY` env var. All financial amounts (Double) use `EncryptedDoubleConverter`.

**2FA:** TOTP (RFC 6238) via HMAC-SHA1. Setup flow returns a QR code (ZXing). Login flow issues a short-lived `2fa_pending` JWT; `POST /api/auth/2fa/login` exchanges it for a full JWT after OTP verification.

**Audit Logging:** `@Audited` annotation on service methods triggers `AuditAspect` (Spring AOP) asynchronously. Records action, resource, IP, user-agent, HTTP method, success/failure. Purged after 90 days by `AuditRetentionService`.

### AI Chat Data Flow

```
Frontend sends: { message, mode }
        │
        ▼
ChatService.chat(message, mode)
  1. Resolve current user via SecurityUtils + UserRepository
  2. FinancialDataAggregatorService.aggregate(user)
     ├── Last 3 months transactions (income / expenses / savings)
     ├── Category and merchant spending maps
     ├── Subscription detection (recurring charges ≥2 times)
     ├── Budget alerts (over-budget categories)
     └── Recent chat history (last 10 exchanges)
  3. AIProvider.chat(message, mode, FinancialSummaryDTO)
     └── OllamaAIProvider → POST aiServiceUrl/chat
           with { message, mode, financialData, X-Internal-Key }
  4. Persist exchange to ChatHistory (encrypted)
  5. Return AI reply
```

---

## 3. AI Service

**Runtime:** Python 3.12 · FastAPI  
**Port:** 8000  
**LLM:** Ollama (phi3:mini, local)

### Module Structure

```
ai-service/
├── app.py                    # FastAPI app, CORS, X-Internal-Key middleware
├── internal_auth.py          # Shared key validation helper
├── utils/
│   └── ollama_client.py      # HTTP client for Ollama REST API
├── chatbot/
│   ├── routes.py             # POST /chat
│   ├── advisor.py            # Builds prompt, calls Ollama, returns reply
│   ├── prompt_engine.py      # System prompt + financial context injection
│   ├── memory.py             # In-process conversation history
│   ├── intent_classifier.py  # Classifies user intent (budget/invest/goal/…)
│   ├── report_generator.py   # Generates financial summary text
│   └── goal_routes.py        # POST /goals/plan
├── forecasting/
│   ├── routes.py             # POST /forecast
│   ├── prophet_forecaster.py # Facebook Prophet time-series forecasting
│   └── xgboost_predictor.py  # XGBoost category-level predictions
├── anomaly_detection/
│   ├── anomaly_engine.py     # IQR / Z-score anomaly detection
│   ├── fraud_detector.py     # Rule-based fraud signals
│   └── risk_analysis.py      # Composite risk score
├── investments/
│   ├── routes.py             # POST /investment-recommendation
│   ├── recommendation_engine.py  # Ollama-powered recommendation
│   └── price_service.py      # Live price refresh
├── spending_coach/
│   ├── routes.py             # POST /spending-coach
│   └── coach_engine.py       # Category analysis + Ollama coaching advice
├── ocr/
│   ├── routes.py             # POST /ocr/extract
│   └── ocr_engine.py         # Tesseract / image-to-transaction parsing
└── report_routes.py          # POST /reports/weekly, /reports/monthly
```

### AI Service Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check (public) |
| POST | `/chat` | Main copilot chat |
| POST | `/goals/plan` | AI goal planning |
| POST | `/forecast` | Expense forecasting (Prophet) |
| POST | `/investment-recommendation` | Portfolio recommendations |
| POST | `/spending-coach` | Spending pattern coaching |
| POST | `/ocr/extract` | Receipt / statement OCR |
| POST | `/reports/weekly` | Weekly summary report |
| POST | `/reports/monthly` | Monthly summary report |

All endpoints except `/` and `/health` require `X-Internal-Key` header matching `AI_INTERNAL_KEY` env var (shared secret with backend).

---

## 4. External Integrations

| Integration | What it does | Auth |
|---|---|---|
| **Setu Account Aggregator** | Bank account consent + fetch (FIP/FIU model) | OAuth2 client credentials; webhooks verified via JWS |
| **Yahoo Finance** | Real-time stock/ETF quotes (`/api/market/quotes`) | Cookie + crumb (managed by `MarketDataService`) |
| **Google OAuth** | Sign-in with Google | ID token verified by Google API Client |
| **Ollama** | Local LLM inference (phi3:mini) | No auth (localhost only) |
| **SMTP (Gmail)** | Ticket replies, password reset emails | STARTTLS, App Password |

---

## 5. Configuration & Environment

### Backend `.env`

```env
DB_URL=jdbc:postgresql://localhost:5432/fintwin
DB_USERNAME=postgres
DB_PASSWORD=postgres

JWT_SECRET=<min 32 chars>
FINTWIN_ENCRYPTION_KEY=<base64 32-byte key>  # openssl rand -base64 32

AI_SERVICE_URL=http://localhost:8000
AI_INTERNAL_KEY=<shared secret>              # openssl rand -hex 32

GOOGLE_CLIENT_ID=<from Google Cloud Console>

CORS_ALLOWED_ORIGINS=http://localhost:5173

# Setu Account Aggregator
SETU_BASE_URL=https://fiu-uat.setu.co
SETU_CLIENT_ID=
SETU_CLIENT_SECRET=
SETU_REDIRECT_URL=http://localhost:5173/bank-connected
SETU_PRODUCT_INSTANCE_ID=

# Bootstrap admin key
ADMIN_KEY=<openssl rand -hex 32>

# Optional email
MAIL_ENABLED=false
MAIL_USERNAME=
MAIL_PASSWORD=
```

### AI Service `.env`

```env
AI_INTERNAL_KEY=<same value as backend>
ALLOWED_ORIGINS=http://localhost:5173
```

### Frontend `.env`

```env
VITE_API_URL=http://localhost:8080
```

---

## 6. Dev Tunnel Setup

Local development with Setu (bank connections) requires publicly accessible URLs.

```
ngrok http 8080 --domain=<static-domain>   # Backend tunnel (stable domain)
cloudflare tunnel run <tunnel-name>        # Frontend tunnel (port 5173)
```

After Cloudflare restart, update:
1. `VITE_API_URL` in frontend `.env`
2. `CORS_ALLOWED_ORIGINS` in backend `.env`
3. `SETU_REDIRECT_URL` in backend `.env`
4. Setu dashboard redirect URL

---

## 7. Key Design Principles

**Controllers own nothing.** Every controller has exactly one service dependency. No controller imports a repository or does business logic.

**Services own the domain.** All DB queries, computations, and external calls happen in services. Controllers only map HTTP → service call → response.

**AI provider is swappable.** `ChatService` depends on `AIProvider` (interface). Switching from Ollama to an enterprise LLM requires only a new `AIProvider` implementation — no changes to any other class.

**Financial data is encrypted at rest.** Every sensitive column uses `EncryptionConverter` (AES-256/GCM). The encryption key never touches the DB. Plaintext is only in JVM memory during request processing.

**Audit trail is automatic.** `@Audited` on any service method triggers asynchronous logging of who did what, from where, and whether it succeeded — without the service author writing any audit code.

**Stateless sessions.** Spring Security is configured `STATELESS`. No server-side sessions. JWT carries identity; `lastLogoutAt` on the `User` entity provides force-logout capability.
