# FinTwin AI — Identity Service

**Version:** 1.0  
**Created:** 2026-06-25  
**Service Port:** 8090  
**Base Package:** `com.fintwin.identity`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Why a Separate Identity Service?](#2-why-a-separate-identity-service)
3. [Architecture](#3-architecture)
4. [What It Contains](#4-what-it-contains)
5. [API Endpoints](#5-api-endpoints)
6. [New Features vs. Main Backend](#6-new-features-vs-main-backend)
7. [How It Works — Key Flows](#7-how-it-works--key-flows)
8. [Security Model](#8-security-model)
9. [Database Schema](#9-database-schema)
10. [Configuration](#10-configuration)
11. [Running Locally](#11-running-locally)
12. [Integration with the Rest of the App](#12-integration-with-the-rest-of-the-app)

---

## 1. Overview

The **Identity Service** is a standalone Spring Boot microservice that owns everything related to **who a user is and whether they are allowed in**. It runs on port `8090` alongside the main backend (port `8080`) and the AI service (port `8000`).

Before the identity service existed, authentication was embedded inside the main backend — a common starting point but one that creates problems as an app grows. The identity service extracts auth into its own process with its own lifecycle, so it can be deployed, scaled, and reasoned about independently.

It is responsible for:

- **Registration** — creating accounts with email verification
- **Login** — password + Google OAuth, with optional TOTP 2FA
- **Token lifecycle** — issuing short-lived access tokens (15 min) and long-lived refresh tokens (7 days), rotating them on use, and revoking them on logout
- **Account security** — lockout after repeated failed logins, force-logout, change password
- **Two-factor authentication** — TOTP setup, enable, disable, verification
- **Admin user management** — list, deactivate, promote, impersonate, unlock locked accounts
- **Token introspection** — an internal endpoint other services can call to validate a token without sharing the JWT secret

---

## 2. Why a Separate Identity Service?

### Problem with embedded auth

When auth lives inside the main backend, it shares the same process as business logic — transaction APIs, AI chat, bank sync, analytics. This means:

- A bug in auth can crash the business API, and vice versa
- Scaling the app means scaling auth too (even if auth is not the bottleneck)
- Auth logic is mixed with domain logic, making both harder to test and audit
- Adding new auth features (refresh tokens, lockout, introspect) requires touching the same codebase as transaction processing

### Benefits for FinTwin AI specifically

| Benefit | Why it matters for a fintech app |
|---|---|
| **Independent scaling** | Login traffic spikes (morning rush, marketing campaigns) can be handled without scaling the transaction API |
| **Isolated security surface** | Audit logs, penetration tests, and compliance reviews can focus on one service |
| **Shared JWT contract** | The AI service and main backend both validate tokens locally using the shared `JWT_SECRET` — no service-to-service calls on the hot path |
| **PCI-DSS alignment** | Separating authentication from data processing is a recognized control in PCI-DSS requirement 8 |
| **Future-proofing** | Adding OAuth scopes, social logins, or WebAuthn only touches the identity service |

### What the main backend becomes

With the identity service in place, the main backend is a **resource server**: it receives JWT access tokens, validates them locally using the shared secret, and trusts the claims. It no longer needs to understand registration, password hashing, 2FA, or refresh tokens.

---

## 3. Architecture

```
                          ┌──────────────────────────────┐
                          │           Frontend            │
                          │         (React, :5173)        │
                          └──────────┬───────────────────┘
                                     │
                          ┌──────────▼───────────────────┐
                          │     Nginx Reverse Proxy       │
                          │  (TLS termination, routing)   │
                          └──────┬───────────────┬────────┘
                                 │               │
                 /api/auth/*     │               │  /api/*
                 /api/2fa/*      │               │  (everything else)
                 /api/token/*    │               │
                 /api/admin/*    │               │
                                 ▼               ▼
                   ┌─────────────────┐  ┌────────────────────┐
                   │ Identity Service │  │   Main Backend     │
                   │   Spring Boot    │  │   Spring Boot      │
                   │    port 8090     │  │    port 8080       │
                   └────────┬────────┘  └──────────┬─────────┘
                            │                       │
                            └──────────┬────────────┘
                                       │  (shared DB + shared JWT_SECRET)
                                       ▼
                            ┌────────────────────┐
                            │    PostgreSQL        │
                            │  (users, refresh_   │
                            │   tokens, etc.)      │
                            └────────────────────┘
```

**Key design decisions:**

- **Shared database** — both services read and write the `users` table. The identity service additionally owns `refresh_tokens`. No data duplication, no sync overhead.
- **Shared JWT secret** — access tokens are HMAC-HS256 signed. The main backend validates them locally (no round-trip to identity service per request). This is the standard resource-server pattern.
- **No shared code** — both services are separate Maven modules. The identity service has its own copies of the security utilities (JwtUtil, EncryptionConverter, etc.) under the `com.fintwin.identity` package.

---

## 4. What It Contains

### Directory structure

```
identity-service/
├── Dockerfile
├── .env.example
├── pom.xml
└── src/main/
    ├── java/com/fintwin/identity/
    │   ├── IdentityServiceApplication.java
    │   ├── config/
    │   │   └── GlobalExceptionHandler.java       ← unified error responses
    │   ├── controller/
    │   │   ├── AuthController.java               ← register, login, logout, refresh, 2fa, me
    │   │   ├── TwoFactorController.java          ← TOTP setup, enable, disable, debug
    │   │   ├── TokenController.java              ← /api/token/introspect (internal)
    │   │   ├── AdminUserController.java          ← admin user management (JWT + ADMIN role)
    │   │   └── AdminBootstrapController.java     ← /admin/promote (X-Admin-Key, no JWT)
    │   ├── dto/
    │   │   ├── AuthResponse.java                 ← { accessToken, refreshToken, email, … }
    │   │   ├── LoginRequest.java
    │   │   ├── RegisterRequest.java
    │   │   ├── RefreshTokenRequest.java          ← NEW
    │   │   ├── LogoutRequest.java                ← NEW
    │   │   ├── ChangePasswordRequest.java        ← NEW
    │   │   ├── TokenIntrospectResponse.java      ← NEW
    │   │   ├── UserMeDTO.java                    ← now includes twoFactorEnabled
    │   │   ├── AdminUserDTO.java                 ← now includes failedLoginAttempts, lockedUntil
    │   │   ├── GoogleLoginRequest.java
    │   │   ├── ForgotPasswordRequest.java
    │   │   ├── ResetPasswordRequest.java
    │   │   └── VerifyEmailRequest.java
    │   ├── model/
    │   │   ├── User.java                         ← + failedLoginAttempts, lockedUntil
    │   │   └── RefreshToken.java                 ← NEW
    │   ├── repository/
    │   │   ├── UserRepository.java
    │   │   └── RefreshTokenRepository.java       ← NEW (with revokeAllForUser, purge query)
    │   ├── security/
    │   │   ├── JwtUtil.java                      ← access token 15 min (was 24h); + generateImpersonationToken
    │   │   ├── JwtFilter.java                    ← validates access tokens + force-logout check
    │   │   ├── SecurityConfig.java               ← public/protected route rules + @EnableMethodSecurity
    │   │   ├── RateLimitFilter.java              ← Redis/in-memory, 10 req/min on /auth and /2fa
    │   │   ├── CustomUserDetailsService.java
    │   │   ├── EncryptionConverter.java          ← AES-256/GCM for email, fullName, 2FA secret
    │   │   ├── EmailHashUtil.java                ← HMAC-SHA256 blind index for DB lookups
    │   │   ├── PasswordValidator.java            ← min 8 chars, upper, digit, special
    │   │   └── SecurityUtils.java
    │   └── service/
    │       ├── AuthService.java                  ← core auth logic + account lockout
    │       ├── TokenService.java                 ← NEW: refresh token issuance, rotation, revocation
    │       ├── TwoFactorService.java             ← TOTP RFC 6238, ±1 window, QR generation
    │       ├── EmailService.java                 ← OTP, reset link, temp password emails
    │       └── AdminService.java                 ← stats, list, deactivate, promote, impersonate, unlock
    └── resources/
        ├── application.properties
        └── db/migration/
            └── V1__identity_schema.sql           ← refresh_tokens table + lockout columns
```

---

## 5. API Endpoints

### Public (no JWT required)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Create account, send email verification OTP |
| `POST` | `/api/auth/login` | Password login → `{ accessToken, refreshToken }` or 2FA challenge |
| `POST` | `/api/auth/google` | Google ID token → `{ accessToken, refreshToken }` |
| `POST` | `/api/auth/2fa/login` | Complete 2FA: `{ twoFactorToken, code }` → full tokens |
| `POST` | `/api/auth/refresh` | Exchange refresh token for new access + refresh token pair |
| `POST` | `/api/auth/forgot-password` | Send password reset link to email |
| `POST` | `/api/auth/reset-password` | Set new password using reset token |
| `POST` | `/api/auth/verify-email` | Verify email with 6-digit OTP |
| `POST` | `/api/auth/resend-verification` | Resend email verification OTP |

### Authenticated — any user (JWT required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/me` | Current user info (email, role, onboarding status, 2FA enabled) |
| `POST` | `/api/auth/logout` | Revoke refresh token, invalidate session |
| `POST` | `/api/auth/change-password` | Change password, revoke all sessions |
| `GET` | `/api/2fa/status` | Is 2FA enabled? |
| `POST` | `/api/2fa/setup` | Generate TOTP secret + QR code |
| `POST` | `/api/2fa/enable` | Enable 2FA (verify first code) |
| `POST` | `/api/2fa/disable` | Disable 2FA (verify code) |
| `GET` | `/api/2fa/debug` | Dev helper: expected code + seconds remaining |

### Admin (JWT + ADMIN role)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/stats` | Total users, active, new this week, admins, 2FA adoption |
| `GET` | `/api/admin/users` | Paginated user list with lockout info |
| `GET` | `/api/admin/users/{id}` | Single user detail |
| `PUT` | `/api/admin/users/{id}/deactivate` | Disable account + revoke all sessions |
| `PUT` | `/api/admin/users/{id}/activate` | Re-enable account |
| `PUT` | `/api/admin/users/{id}/role` | Change role (USER / ADMIN) |
| `POST` | `/api/admin/users/promote-by-email` | Promote by email address |
| `PUT` | `/api/admin/users/{id}/force-logout` | Invalidate all sessions |
| `POST` | `/api/admin/users/{id}/reset-password` | Generate temp password, email user |
| `POST` | `/api/admin/users/{id}/impersonate` | Get impersonation token |
| `POST` | `/api/admin/users/{id}/unlock` | Clear lockout (failedAttempts = 0) |

### Internal (X-Internal-Key header)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/token/introspect` | Validate access token, return user claims |

### Bootstrap (X-Admin-Key header, no JWT)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/admin/promote` | First-admin bootstrap (one-time use) |

---

## 6. New Features vs. Main Backend

These features did **not exist** before and are only available through the identity service.

### Refresh Tokens

The main backend issued a single JWT valid for 24 hours. If it was stolen, the attacker had full access for up to a day with no way to revoke it short of admin force-logout.

The identity service introduces a two-token model:

- **Access token** — 15 minutes, stateless JWT. Used on every API request. Short expiry limits the damage window if intercepted.
- **Refresh token** — 7 days, a random UUID stored as `SHA-256(token)` in the `refresh_tokens` table. Used only to get new access tokens. Never sent to the main backend or AI service.

On each refresh, the old token is revoked and a new one is issued (**token rotation**). If a previously used token is ever presented again, it signals a possible theft — the entire token family can be revoked.

### Account Lockout

Previously, an attacker could attempt unlimited password guesses (only rate limiting applied). Now:

- After **5 consecutive failed login attempts**, the account is locked for **15 minutes**
- The `failed_login_attempts` counter resets to 0 on successful login
- Admins can unlock an account immediately via `/api/admin/users/{id}/unlock`
- The lockout fields (`failed_login_attempts`, `locked_until`) are stored on the `users` table so they survive restarts

### Explicit Logout

Previously, logout only cleared `localStorage` in the browser. The JWT itself remained valid until it expired (up to 24h). Now:

1. `POST /api/auth/logout` revokes the refresh token (marked `revoked = true` in the DB)
2. It also sets `lastLogoutAt = now()` on the user record
3. The main backend's `JwtFilter` already checks `lastLogoutAt` — if the access token was issued before this timestamp, it is rejected immediately
4. Combined effect: logout is **immediate** — both the refresh token and the current access token stop working

### Change Password

`POST /api/auth/change-password` (requires current password) does three things atomically:

1. Updates the password hash
2. Revokes **all** active refresh tokens for the user (all devices are logged out)
3. Sets `lastLogoutAt = now()` (existing access tokens are also rejected)

### Token Introspection

`POST /api/token/introspect` lets internal services (main backend, AI service) validate a token and get user claims without needing to hold the JWT secret directly. It also performs the `lastLogoutAt` force-logout check and returns whether the account is enabled.

This is useful for service-to-service validation in a zero-trust setup where not every service should hold the signing key.

---

## 7. How It Works — Key Flows

### Registration

```
Frontend                   Identity Service               Email
   │                              │                         │
   │  POST /api/auth/register     │                         │
   │──────────────────────────────►                         │
   │                              │ validate email, password, consent
   │                              │ hash password (BCrypt strength 12)
   │                              │ encrypt email + fullName (AES-256/GCM)
   │                              │ store email_hash (HMAC-SHA256, for lookups)
   │                              │ save User to DB                   │
   │                              │──── send OTP email ───────────────►
   │◄──────────────────────────────                         │
   │  { message: "Registration    │                         │
   │    successful" }             │                         │
   │                              │                         │
   │  POST /api/auth/verify-email │                         │
   │  { email, otp }              │                         │
   │──────────────────────────────►                         │
   │                              │ SHA-256(otp) == stored hash?
   │                              │ mark emailVerified = true
   │◄──────────────────────────────                         │
   │  { message: "Email verified" }
```

### Login with 2FA

```
Frontend                   Identity Service
   │                              │
   │  POST /api/auth/login        │
   │  { email, password }         │
   │──────────────────────────────►
   │                              │ check lockedUntil (account lockout)
   │                              │ verify BCrypt password
   │                              │ if wrong → increment failedLoginAttempts
   │                              │ if twoFactorEnabled → return tempToken (5 min)
   │◄──────────────────────────────
   │  { requires2FA: true,        │
   │    twoFactorToken: "..." }   │
   │                              │
   │  POST /api/auth/2fa/login    │
   │  { twoFactorToken, code }    │
   │──────────────────────────────►
   │                              │ validate tempToken type == "2fa_pending"
   │                              │ verify TOTP code (±1 window)
   │                              │ issue accessToken (15 min)
   │                              │ issue refreshToken (7 days, store SHA-256 hash)
   │◄──────────────────────────────
   │  { accessToken, refreshToken,│
   │    email, fullName, role }   │
```

### Token Refresh

```
Frontend                   Identity Service
   │                              │
   │  [access token expires]      │
   │                              │
   │  POST /api/auth/refresh      │
   │  { refreshToken }            │
   │──────────────────────────────►
   │                              │ SHA-256(refreshToken) → look up in DB
   │                              │ check: not revoked, not expired
   │                              │ revoke old refresh token
   │                              │ issue new accessToken (15 min)
   │                              │ issue new refreshToken (7 days)
   │◄──────────────────────────────
   │  { accessToken, refreshToken }
   │                              │
   │  [retry original request     │
   │   with new accessToken]      │
```

The frontend's `identityApi` interceptor handles this automatically on any 401 response — the user never sees a login prompt mid-session.

### Logout

```
Frontend               Identity Service          Main Backend
   │                        │                         │
   │  POST /api/auth/logout │                         │
   │  { refreshToken }      │                         │
   │────────────────────────►                         │
   │                        │ mark refreshToken revoked in DB
   │                        │ set lastLogoutAt = now() on User
   │◄────────────────────────                         │
   │  clear localStorage    │                         │
   │                        │                         │
   │  [any request with old accessToken]              │
   │──────────────────────────────────────────────────►
   │                        │ JwtFilter: issuedAt < lastLogoutAt → 401
   │◄──────────────────────────────────────────────────
   │  401 Unauthorized      │                         │
```

### Account Lockout

```
Attacker               Identity Service
   │                        │
   │  POST /api/auth/login  │
   │  { email, wrongPw }    │
   │  × 5 attempts          │──── failedLoginAttempts = 5
   │────────────────────────►     lockedUntil = now + 15 min
   │◄────────────────────────
   │  "Account locked for 14
   │   more minute(s)"      │
   │                        │
   │  [15 min later]        │
   │  POST /api/auth/login  │
   │  { email, correctPw }  │
   │────────────────────────►
   │                        │ lockedUntil in the past → allowed
   │                        │ reset failedLoginAttempts = 0
   │◄────────────────────────
   │  { accessToken, ... }  │
```

---

## 8. Security Model

### Token security

| Property | Value | Rationale |
|---|---|---|
| Access token algorithm | HMAC-HS256 | Industry standard; symmetric key shared between services |
| Access token TTL | 15 minutes | Short window limits theft impact |
| Refresh token TTL | 7 days | Long enough for practical session persistence |
| Refresh token storage | `SHA-256(rawToken)` in DB | Raw token only ever in the HTTP response; DB compromise doesn't expose tokens |
| Refresh token rotation | On every use | Replay of a used token is detectable |
| Force-logout mechanism | `lastLogoutAt` timestamp on User | Works across all services that share the JWT secret |

### Field encryption

All sensitive user fields are AES-256/GCM encrypted at rest:

- `email` — non-deterministic encryption; lookup done via `email_hash` (HMAC-SHA256 blind index)
- `fullName`
- `two_factor_secret`

The encryption key (`FINTWIN_ENCRYPTION_KEY`) is the same across both services and must never be stored in code or version control.

### Password security

- BCrypt with strength 12 (deliberately slow — ~250ms per hash, resistant to GPU brute-force)
- Policy enforced: min 8 chars, uppercase, digit, special character
- Password reset tokens stored as `SHA-256(rawToken)` — same pattern as refresh tokens

### Rate limiting

- `/api/auth/*` and `/api/2fa/*`: **10 requests/minute per IP**
- `/api/token/*`: **30 requests/minute per IP**
- All other routes: **100 requests/minute per IP**
- Redis-backed when `REDIS_URL` is set (correct across replicas); falls back to in-memory for local dev

### 2FA (TOTP)

- RFC 6238 TOTP, 30-second windows
- ±1 window tolerance (accounts for clock drift between client and server)
- QR code generated server-side with ZXing, returned as Base64 PNG
- Secret stored AES-256/GCM encrypted in DB
- Login with 2FA uses a short-lived (5-min) `2fa_pending` temp token — the real access token is never issued until the code is verified

---

## 9. Database Schema

### New table: `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64)  NOT NULL UNIQUE,   -- SHA-256(rawToken)
    issued_at   TIMESTAMP    NOT NULL,
    expires_at  TIMESTAMP    NOT NULL,
    revoked     BOOLEAN      NOT NULL DEFAULT false,
    revoked_at  TIMESTAMP
);

-- Fast lookup by token hash (used on every refresh)
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
-- Fast lookup for revoke-all-for-user (logout, deactivate, password change)
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);
-- Efficient purge of expired active tokens (daily cleanup job)
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at) WHERE revoked = false;
```

### New columns on `users`

```sql
ALTER TABLE users
    ADD COLUMN failed_login_attempts INT       NOT NULL DEFAULT 0,
    ADD COLUMN locked_until           TIMESTAMP;
```

### Flyway strategy

The identity service uses a **separate Flyway history table** (`identity_flyway_history`) so its migrations don't conflict with the main backend's `flyway_schema_history`. The same DDL is mirrored in the main backend's `V6__identity_columns.sql` so Hibernate schema validation (`ddl-auto=validate`) doesn't fail on the main backend side.

### Automated token cleanup

`TokenService` runs a scheduled job every day at 03:00 that deletes expired and revoked refresh tokens:

```java
@Scheduled(cron = "0 0 3 * * *")
void purgeExpiredTokens() {
    refreshTokenRepository.deleteExpiredAndRevoked(LocalDateTime.now());
}
```

---

## 10. Configuration

The identity service is configured via environment variables, following the same pattern as the main backend.

### Required (must match main backend exactly)

| Variable | Description |
|---|---|
| `DB_URL` | PostgreSQL JDBC URL (same database as main backend) |
| `DB_USERNAME` | Database username |
| `DB_PASSWORD` | Database password |
| `JWT_SECRET` | JWT signing key — **must be identical to the main backend's** |
| `FINTWIN_ENCRYPTION_KEY` | AES-256 key (Base64, 32 bytes) — **must be identical to the main backend's** |

### Identity-service specific

| Variable | Default | Description |
|---|---|---|
| `IDENTITY_PORT` | `8090` | HTTP port |
| `ADMIN_KEY` | — | X-Admin-Key for bootstrap admin promotion |
| `INTERNAL_KEY` | — | X-Internal-Key for `/api/token/introspect` |
| `APP_BASE_URL` | `http://localhost:5173` | Used in password reset email links |

### Optional (shared with main backend)

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | — | Enables Google OAuth login |
| `REDIS_URL` | — | Enables distributed rate limiting |
| `MAIL_ENABLED` | `false` | Enables transactional emails |
| `MAIL_HOST` / `MAIL_USERNAME` / `MAIL_PASSWORD` | — | SMTP credentials |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |

---

## 11. Running Locally

### Prerequisites

- Java 21
- Maven 3.9+
- PostgreSQL running with the `fintwin` database (same instance as the main backend)
- The main backend must have already run its migrations (V1–V6) — or the identity service's Flyway will do it on first start

### Start the identity service

```bash
cd identity-service

# Copy and fill in environment variables
cp .env.example .env
# At minimum, set DB_URL, DB_PASSWORD, JWT_SECRET (same as backend/.env), FINTWIN_ENCRYPTION_KEY

# Run
mvn spring-boot:run
# Starts on port 8090
```

### Verify it is up

```bash
curl http://localhost:8090/actuator/health
# {"status":"UP"}

# Register a test user
curl -X POST http://localhost:8090/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test User","email":"test@example.com","password":"Test@1234","consentGiven":true}'

# Login (email not configured → devOtp returned in register response)
curl -X POST http://localhost:8090/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@1234"}'
```

### With Docker Compose

```bash
# From the project root
docker compose up identity-service
```

---

## 12. Integration with the Rest of the App

### Main Backend

The main backend's `JwtFilter` validates access tokens locally — it only needs the shared `JWT_SECRET`. No HTTP call to the identity service per request. The only coupling is:

- **Shared DB** — both services read/write the `users` table. The main backend reads `lastLogoutAt` to implement force-logout.
- **Shared secrets** — `JWT_SECRET` and `FINTWIN_ENCRYPTION_KEY` must be identical in both services' `.env` files.

Optionally, the main backend can call `/api/token/introspect` (with `X-Internal-Key`) to validate a token and get fresh user info. This is useful when you need to check if an account was deactivated mid-session.

### AI Service

The AI service receives JWT access tokens from the frontend (via the main backend as a proxy). It validates them against the same `JWT_SECRET`. No changes were required to the AI service.

### Frontend

The frontend now has two Axios instances:

| Instance | Base URL | Used for |
|---|---|---|
| `API` (default export) | `http://localhost:8080/api` | All business data (transactions, dashboard, AI chat, bank sync) |
| `identityApi` (named export) | `http://localhost:8090/api` | Auth, 2FA, token refresh, change password |

The `identityApi` instance includes an auto-refresh interceptor: if any request returns 401, it automatically calls `POST /api/auth/refresh`, stores the new tokens, and retries the original request. The user never sees a session expiry prompt unless the refresh token itself has expired.

### Nginx (Production)

Nginx routes requests to the correct service based on the path prefix:

```nginx
# Identity service
location ~ ^/api/(auth|2fa|token|admin)(/|$) {
    proxy_pass http://identity-service:8090;
}

# Bootstrap (no JWT, X-Admin-Key only)
location /admin/ {
    proxy_pass http://identity-service:8090;
}

# Everything else → main backend
location /api/ {
    proxy_pass http://backend:8080;
}
```

From the frontend's perspective, everything is still accessed through the same HTTPS domain — the routing is transparent.

---

*For security incidents involving the identity service, refer to [incident-response-plan.md](./incident-response-plan.md).*  
*For the overall security policy, refer to [security-policy.md](./security-policy.md).*
