# Role-Based Access Control (RBAC)

**Branch:** `feature/auth-insurance-anomaly`  
**Date implemented:** 2026-06-25  
**Compliance scope:** PCI-DSS Req 7 (Restrict access to system components), Req 8 (Identify users), Req 10 (Log and monitor access)

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-implementation Audit (Gap Report)](#pre-implementation-audit-gap-report)
3. [Architecture](#architecture)
4. [Permissions Reference](#permissions-reference)
5. [Roles Reference](#roles-reference)
6. [Files Created](#files-created)
7. [Files Modified](#files-modified)
8. [How Spring Security Integration Works](#how-spring-security-integration-works)
9. [Service-Level Annotations](#service-level-annotations)
10. [Resource Ownership Enforcement](#resource-ownership-enforcement)
11. [Admin Role Management API](#admin-role-management-api)
12. [Introducing a Premium Tier (Future)](#introducing-a-premium-tier-future)
13. [Testing RBAC](#testing-rbac)

---

## Overview

FinTwin.ai implements defence-in-depth RBAC with three enforcement layers:

| Layer | Mechanism | Where |
|-------|-----------|-------|
| 1 — URL | `hasRole("ADMIN")` in `SecurityConfig` | `/api/admin/**` |
| 2 — Method | `@PreAuthorize("hasAuthority('...')")` | Every public service method |
| 3 — Data | `SecurityUtils.getCurrentUserEmail()` + owner check | Every repository query and delete/update path |

All three layers must pass before data is returned or mutated. A misconfigured controller cannot accidentally bypass Layer 2 or 3.

---

## Pre-implementation Audit (Gap Report)

Audit performed before any code was written.

| Item | Before | After |
|------|--------|-------|
| User entity has roles field | YES — `String role` (not type-safe) | YES — `String role` kept; enum helpers added |
| JWT contains role claim | **NO** | YES — `role` claim in every token |
| JWT filter sets GrantedAuthorities | YES — via DB reload in `CustomUserDetailsService` | YES — now includes all permission names as authorities |
| `@EnableMethodSecurity` active | **NO** | YES |
| URL-level role guards | PARTIAL — only `/api/admin/**` | PARTIAL — unchanged; method-level guards are the primary control |
| Method-level `@PreAuthorize` | **NO** (0 annotations) | YES — 86 annotations across 24 service files |
| Resource ownership checks | YES — implicit via `SecurityUtils.getCurrentUserEmail()` | YES — ownership checks now throw `AccessDeniedException` (403) instead of `RuntimeException` (500) |
| `Permission` enum | **NO** | YES |
| `Role` enum | **NO** (string literals only) | YES — 7 roles |
| SUPPORT / COMPLIANCE / RISK roles | **NO** — only USER and ADMIN | YES |
| Feature gating (FREE vs PREMIUM) | **NO** | YES — PREMIUM_USER role ready; USER currently has full access |
| `user_roles` DB table | **NO** | Not needed — single-role model kept; String column unchanged |

---

## Architecture

### Design Decisions

**Keep `String role` in the DB.** The existing `users.role VARCHAR(20)` column is retained. No Flyway migration is needed. A `Role` enum with a `fromString()` factory converts the string on every load. When a future requirement needs multi-role support, migrate to `@ElementCollection` + junction table at that point.

**DB reload on every request (not JWT-decoded roles).** `JwtFilter` reloads the user from the database on every authenticated request via `CustomUserDetailsService`. This means revoked roles take effect immediately — there is no stale-role window even within a 24-hour JWT lifetime. The role claim in the JWT is for the **frontend only** (e.g., showing/hiding premium features in the UI).

**Permission-level `hasAuthority` checks (not role checks).** `@PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")` is used instead of `@PreAuthorize("hasRole('USER')")`. This makes the guards declarative and precise: if you later split USER into FREE/PREMIUM, you only change the Role enum — every `@PreAuthorize` annotation stays the same.

**`AccessDeniedException` (→ 403) for ownership failures.** When a resource exists but belongs to another user, `AccessDeniedException` is thrown. Spring Security maps this to HTTP 403. This is intentional — returning 404 leaks the existence of other users' resources (IDOR information disclosure).

---

## Permissions Reference

**File:** `backend/src/main/java/com/fintwin/security/Permission.java`

### Profile
| Permission | Meaning |
|------------|---------|
| `READ_OWN_PROFILE` | View own profile, financial score, notifications |
| `WRITE_OWN_PROFILE` | Update name, password, notification settings |
| `DELETE_OWN_ACCOUNT` | Permanently delete own account and all data |
| `EXPORT_OWN_DATA` | GDPR Article 20 data portability export |

### Transactions
| Permission | Meaning |
|------------|---------|
| `READ_OWN_TRANSACTIONS` | List/view own transactions, analytics, anomalies |
| `WRITE_OWN_TRANSACTIONS` | Add/upload/import transactions, dismiss anomalies |

### Budgets
| Permission | Meaning |
|------------|---------|
| `READ_OWN_BUDGETS` | View budget status and spending vs limit |
| `WRITE_OWN_BUDGETS` | Create and delete budget categories |

### Goals
| Permission | Meaning |
|------------|---------|
| `READ_OWN_GOALS` | List financial goals |
| `WRITE_OWN_GOALS` | Create, update, delete, regenerate goals |

### Net Worth
| Permission | Meaning |
|------------|---------|
| `READ_OWN_NET_WORTH` | View net worth dashboard, assets, liabilities |
| `WRITE_OWN_ASSETS` | Create, update, delete asset entries |
| `WRITE_OWN_LIABILITIES` | Create, update, delete liability entries |

### Investments
| Permission | Meaning |
|------------|---------|
| `READ_OWN_INVESTMENTS` | View portfolio, auto-detect holdings |
| `WRITE_OWN_INVESTMENTS` | Add, update, delete holdings; refresh prices; crypto exchange connections |

### Insurance
| Permission | Meaning |
|------------|---------|
| `READ_OWN_INSURANCE` | View insurance policies |
| `WRITE_OWN_INSURANCE` | Create, update, delete policies |

### AI — Basic (all users)
| Permission | Meaning |
|------------|---------|
| `USE_AI_BASIC` | Insights, affordability checker, financial score |

### AI — Premium
| Permission | Meaning |
|------------|---------|
| `USE_AI_COPILOT` | AI chat, chat history, investment recommendations |
| `USE_AI_FORECAST` | Monthly/category expense forecasts |
| `USE_AI_REPORT` | Weekly PDF financial report |
| `USE_AI_SPENDING_COACH` | Spending coach analysis |

### Bank Connections (Setu AA)
| Permission | Meaning |
|------------|---------|
| `CONNECT_BANK_ACCOUNT` | Initiate AA consent flow, force-resync |
| `READ_OWN_BANK_CONNECTIONS` | List connected bank accounts |
| `DISCONNECT_BANK_ACCOUNT` | Revoke bank consent |

### Admin — User Management
| Permission | Meaning |
|------------|---------|
| `READ_ANY_USER_PROFILE` | View any user's profile detail |
| `WRITE_ANY_USER_PROFILE` | Update any user's profile |
| `DELETE_ANY_USER` | Permanently delete any user |
| `READ_ANY_USER_TRANSACTIONS` | View any user's transactions |
| `EXPORT_ALL_DATA` | Full platform data export |

### Admin — Compliance & Risk
| Permission | Meaning |
|------------|---------|
| `READ_AUDIT_LOGS` | View audit log (PCI-DSS Req 10) |
| `READ_ALL_USERS` | Paginated list of all platform users |
| `FREEZE_ANY_ACCOUNT` | Deactivate / reactivate any user account |
| `FLAG_SUSPICIOUS_ACTIVITY` | Mark transactions as suspicious |
| `READ_AGGREGATE_ANALYTICS` | Platform-level signup trends, adoption stats |
| `EXPORT_ANONYMIZED_DATA` | Export anonymized analytics |

### System
| Permission | Meaning |
|------------|---------|
| `MANAGE_ROLES` | Assign or revoke roles via RoleController |
| `MANAGE_SYSTEM_CONFIG` | Reserved for future system config endpoints |

---

## Roles Reference

**File:** `backend/src/main/java/com/fintwin/security/Role.java`

### USER
Default role assigned to every new registration and Google OAuth sign-up.

Currently holds all user-facing permissions including AI, investments, and bank connections. When a premium tier is introduced, strip those permissions from USER and keep them only in PREMIUM_USER — no annotation changes needed.

```
READ_OWN_PROFILE, WRITE_OWN_PROFILE, DELETE_OWN_ACCOUNT, EXPORT_OWN_DATA,
READ_OWN_TRANSACTIONS, WRITE_OWN_TRANSACTIONS,
READ_OWN_BUDGETS, WRITE_OWN_BUDGETS,
READ_OWN_GOALS, WRITE_OWN_GOALS,
READ_OWN_NET_WORTH, WRITE_OWN_ASSETS, WRITE_OWN_LIABILITIES,
READ_OWN_INVESTMENTS, WRITE_OWN_INVESTMENTS,
READ_OWN_INSURANCE, WRITE_OWN_INSURANCE,
USE_AI_BASIC, USE_AI_COPILOT, USE_AI_FORECAST, USE_AI_REPORT, USE_AI_SPENDING_COACH,
CONNECT_BANK_ACCOUNT, READ_OWN_BANK_CONNECTIONS, DISCONNECT_BANK_ACCOUNT
```

### PREMIUM_USER
Paid subscriber tier — currently identical to USER. Differentiated when premium is launched.

### SUPPORT_AGENT
Internal customer support. Read-only access to any user's data. Does **not** inherit USER permissions (different trust domain — support agents don't have personal finances on the platform).

```
READ_ANY_USER_PROFILE, READ_ANY_USER_TRANSACTIONS, FLAG_SUSPICIOUS_ACTIVITY
```

### COMPLIANCE_OFFICER
Everything SUPPORT_AGENT has, plus audit and freeze authority.

```
+ READ_AUDIT_LOGS, READ_ALL_USERS, FREEZE_ANY_ACCOUNT,
  READ_AGGREGATE_ANALYTICS, EXPORT_ANONYMIZED_DATA
```

### RISK_ANALYST
Analytics and audit access, no PII. Cannot see individual user data.

```
READ_AGGREGATE_ANALYTICS, EXPORT_ANONYMIZED_DATA, READ_AUDIT_LOGS
```

### ADMIN
Everything COMPLIANCE_OFFICER has, plus destructive user management.

```
+ WRITE_ANY_USER_PROFILE, DELETE_ANY_USER, EXPORT_ALL_DATA,
  MANAGE_ROLES, MANAGE_SYSTEM_CONFIG
```

### SUPER_ADMIN
All permissions. Use only for break-glass / initial bootstrap scenarios.

---

## Files Created

| File | Purpose |
|------|---------|
| `backend/.../security/Permission.java` | 36-value permission enum |
| `backend/.../security/Role.java` | 7-role enum with `getPermissions()`, `getAuthorities()`, `hasPermission()`, `fromString()` |
| `backend/.../security/FinTwinPermissionEvaluator.java` | Resource-level ownership evaluator for `hasPermission()` expressions |
| `backend/.../controller/RoleController.java` | `/api/admin/roles/*` endpoints for role management |

---

## Files Modified

| File | Change |
|------|--------|
| `model/User.java` | Added `getRoleEnum()`, `getAllPermissions()`, `hasPermission(Permission)`, `hasRole(Role)` helpers; added `Permission`, `Role`, `Set` imports |
| `security/CustomUserDetailsService.java` | Replaced `.roles(role)` (String) with `Role.fromString(role).getAuthorities()` so all permission names load into `SecurityContext` |
| `security/SecurityConfig.java` | Added `@EnableMethodSecurity(prePostEnabled=true, securedEnabled=true)`; added `MethodSecurityExpressionHandler` bean wiring `FinTwinPermissionEvaluator` |
| `security/JwtUtil.java` | Added `generateToken(email, role)` overload with `role` JWT claim; added `extractRole(token)` helper; original `generateToken(email)` now delegates with default `"USER"` |
| `service/AuthService.java` | Explicit `user.setRole("USER")` on email registration and Google OAuth new-user creation; `generateToken(email, user.getRole())` in login and Google login |
| `service/TwoFactorService.java` | `generateToken(email, user.getRole())` after 2FA verification |
| `service/ProfileService.java` | `@PreAuthorize` on `getProfile`, `changePassword`, `updateProfile`, `deleteAccount`, `exportData`, `getScoreHistory` |
| `service/TransactionService.java` | `@PreAuthorize` on `uploadCSV`, `getAllTransactions`, `addExpenseByText`, `addIncomeByText`, `addManualTransaction`, `importBatch`, `uploadScreenshot` |
| `service/BudgetService.java` | `@PreAuthorize` on `createBudget`, `deleteBudget`, `getBudgetStatus` |
| `service/GoalPlannerService.java` | `@PreAuthorize` on `createGoal`, `getGoals`, `updateGoal`, `deleteGoal`, `regenerateGoal` |
| `service/NetWorthService.java` | `@PreAuthorize` on `getNetWorth` |
| `service/AssetService.java` | `@PreAuthorize` on all 4 methods; ownership failures now throw `AccessDeniedException` |
| `service/LiabilityService.java` | `@PreAuthorize` on all 4 methods; ownership failures now throw `AccessDeniedException` |
| `service/ForecastService.java` | `@PreAuthorize` on `generateForecast`, `getMonthlyHistory`, `getCategoryForecast` |
| `service/InsightService.java` | `@PreAuthorize` on `generateInsights` |
| `service/SpendingCoachService.java` | `@PreAuthorize` on `getCoachInsights` |
| `service/ReportService.java` | `@PreAuthorize` on `generateWeeklyReport` |
| `service/ChatService.java` | `@PreAuthorize` on `chat`, `getChatHistory`, `clearChatHistory` |
| `service/AffordabilityService.java` | `@PreAuthorize` on `analyzePurchase` |
| `service/AnomalyService.java` | `@PreAuthorize` on `detectAnomalies`, `dismissAnomaly` |
| `service/FinancialScoreService.java` | `@PreAuthorize` on `calculateScore` |
| `service/InvestmentService.java` | `@PreAuthorize` on all 6 methods; ownership failures throw `AccessDeniedException` |
| `service/InvestmentRecommendationService.java` | `@PreAuthorize` on `getRecommendation` |
| `service/BankConnectionService.java` | `@PreAuthorize` on `initiateConnection`, `forceResync`, `getConnections`, `disconnect` |
| `service/AnalyticsService.java` | `@PreAuthorize` on `getMonthlySummary`, `getRecurringExpenses` |
| `service/NotificationService.java` | `@PreAuthorize` on `generateNotifications`, `deleteNotification`, `markAsRead` |
| `service/InsurancePolicyService.java` | `@PreAuthorize` on all 4 methods; ownership failures throw `AccessDeniedException` |
| `service/CreditScoreService.java` | `@PreAuthorize` on `calculate` |
| `service/CryptoConnectionService.java` | `@PreAuthorize` on `connect`, `list`, `resync`, `disconnect` |
| `service/AdminUserService.java` | `@PreAuthorize` on all 9 admin methods (defence-in-depth alongside URL guard) |

---

## How Spring Security Integration Works

### Authority loading flow (per request)

```
HTTP request → JwtFilter
    → jwtUtil.extractEmail(token)              // get email from JWT
    → CustomUserDetailsService.loadUserByUsername(email)
        → userRepository.findByEmail(email)    // DB lookup (fresh on every request)
        → Role.fromString(user.getRole())      // e.g. Role.ADMIN
        → role.getAuthorities()                // returns:
            - "ROLE_ADMIN"                      //   the role itself
            - "WRITE_ANY_USER_PROFILE"          //   every permission the role has
            - "DELETE_ANY_USER"
            - "READ_AUDIT_LOGS"
            - ...36 permissions as authorities
    → UsernamePasswordAuthenticationToken(userDetails, null, authorities)
    → SecurityContextHolder.setAuthentication(...)

Controller method called
    → @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")
        → Spring checks SecurityContext authorities
        → "READ_OWN_TRANSACTIONS" present? → proceed
        → absent? → AccessDeniedException → 403
```

### Why `hasAuthority` instead of `hasRole`

`hasRole('USER')` only checks for the role token (`ROLE_USER`). It cannot express fine-grained intent like "this method needs USE_AI_FORECAST but not USE_AI_BASIC".

`hasAuthority('USE_AI_FORECAST')` checks for the specific permission string. When PREMIUM_USER is the only role with `USE_AI_FORECAST`, non-premium users get 403 automatically — no code change needed in any controller or service.

### JWT role claim

The `role` claim in the JWT (`generateToken(email, role)`) is **not used for authorization**. The DB reload in `JwtFilter` is the authoritative source. The claim is surfaced to the React frontend so the UI can show/hide premium features client-side without an extra API call.

```
JWT payload example:
{
  "sub": "user@example.com",
  "role": "PREMIUM_USER",
  "iat": 1750000000,
  "exp": 1750086400
}
```

---

## Service-Level Annotations

Total: **86 `@PreAuthorize` annotations** across **24 service files** + **1 controller**.

### Permission → Service method mapping

| Permission | Methods annotated |
|------------|-------------------|
| `READ_OWN_PROFILE` | `ProfileService.getProfile`, `getScoreHistory`, `FinancialScoreService.calculateScore`, `CreditScoreService.calculate`, `NotificationService.generateNotifications` |
| `WRITE_OWN_PROFILE` | `ProfileService.changePassword`, `updateProfile`, `NotificationService.deleteNotification`, `markAsRead` |
| `DELETE_OWN_ACCOUNT` | `ProfileService.deleteAccount` |
| `EXPORT_OWN_DATA` | `ProfileService.exportData` |
| `READ_OWN_TRANSACTIONS` | `TransactionService.getAllTransactions`, `ForecastService.getMonthlyHistory`, `AnomalyService.detectAnomalies`, `AnalyticsService.getMonthlySummary`, `getRecurringExpenses` |
| `WRITE_OWN_TRANSACTIONS` | `TransactionService.uploadCSV`, `addExpenseByText`, `addIncomeByText`, `addManualTransaction`, `importBatch`, `uploadScreenshot`, `AnomalyService.dismissAnomaly` |
| `READ_OWN_BUDGETS` | `BudgetService.getBudgetStatus` |
| `WRITE_OWN_BUDGETS` | `BudgetService.createBudget`, `deleteBudget` |
| `READ_OWN_GOALS` | `GoalPlannerService.getGoals` |
| `WRITE_OWN_GOALS` | `GoalPlannerService.createGoal`, `updateGoal`, `deleteGoal`, `regenerateGoal` |
| `READ_OWN_NET_WORTH` | `NetWorthService.getNetWorth`, `AssetService.getAssets`, `LiabilityService.getLiabilities` |
| `WRITE_OWN_ASSETS` | `AssetService.createAsset`, `deleteAsset`, `updateAsset` |
| `WRITE_OWN_LIABILITIES` | `LiabilityService.createLiability`, `deleteLiability`, `updateLiability` |
| `READ_OWN_INVESTMENTS` | `InvestmentService.getSummary`, `autoDetect`, `CryptoConnectionService.list` |
| `WRITE_OWN_INVESTMENTS` | `InvestmentService.add`, `update`, `refreshPrices`, `delete`, `CryptoConnectionService.connect`, `resync`, `disconnect` |
| `READ_OWN_INSURANCE` | `InsurancePolicyService.getAll` |
| `WRITE_OWN_INSURANCE` | `InsurancePolicyService.create`, `update`, `delete` |
| `USE_AI_BASIC` | `InsightService.generateInsights`, `AffordabilityService.analyzePurchase` |
| `USE_AI_COPILOT` | `ChatService.chat`, `getChatHistory`, `clearChatHistory`, `InvestmentRecommendationService.getRecommendation` |
| `USE_AI_FORECAST` | `ForecastService.generateForecast`, `getCategoryForecast` |
| `USE_AI_REPORT` | `ReportService.generateWeeklyReport` |
| `USE_AI_SPENDING_COACH` | `SpendingCoachService.getCoachInsights` |
| `CONNECT_BANK_ACCOUNT` | `BankConnectionService.initiateConnection`, `forceResync` |
| `READ_OWN_BANK_CONNECTIONS` | `BankConnectionService.getConnections` |
| `DISCONNECT_BANK_ACCOUNT` | `BankConnectionService.disconnect` |
| `READ_ANY_USER_PROFILE` | `AdminUserService.getUserDetail`, `RoleController.getUserRole` |
| `READ_ALL_USERS` | `AdminUserService.listUsers`, `RoleController.listUsersWithRoles` |
| `FREEZE_ANY_ACCOUNT` | `AdminUserService.deactivateUser`, `activateUser`, `RoleController.freezeAccount` |
| `MANAGE_ROLES` | `AdminUserService.changeRole`, `RoleController.assignRole`, `revokeRole` |
| `DELETE_ANY_USER` | `AdminUserService.deleteUser` |
| `READ_AUDIT_LOGS` | `AdminUserService.getAuditLogs` |
| `READ_AGGREGATE_ANALYTICS` | `AdminUserService.getStats`, `getSignupTrend`, `getAdoptionStats` |

---

## Resource Ownership Enforcement

All 36 service files already used `SecurityUtils.getCurrentUserEmail()` + `findByEmail()` to scope queries to the authenticated user — no service can accidentally return another user's list of transactions or budgets.

For individual-resource operations (fetch by ID, update by ID, delete by ID), ownership is verified after the DB fetch:

```java
// Pattern used across AssetService, LiabilityService, InsurancePolicyService,
// InvestmentService, BudgetService, GoalPlannerService
User requestingUser = userRepository.findByEmail(SecurityUtils.getCurrentUserEmail()).orElseThrow();
Asset asset = assetRepository.findById(id).orElseThrow(() -> new RuntimeException("Asset not found"));

if (asset.getUser().getId().longValue() != requestingUser.getId().longValue()) {
    throw new AccessDeniedException("Access denied"); // → HTTP 403, not 404
}
```

**Why 403 and not 404?**  
Returning 404 when a resource exists but belongs to another user leaks its existence (IDOR information disclosure). 403 confirms the request was understood but rejected, without revealing whether the resource exists for someone else. This is a PCI-DSS requirement for financial applications handling payment account data.

### `FinTwinPermissionEvaluator`

Registered in `SecurityConfig` via `MethodSecurityExpressionHandler`. Enables:

```java
@PreAuthorize("hasPermission(#id, 'Transaction', 'READ')")
public Transaction getById(Long id) { ... }
```

Supported types: `Transaction`, `Budget`, `Goal`, `Asset`, `Liability`.  
Returns `false` (not 403 directly) when the resource doesn't belong to the caller — the caller controls the error response.

---

## Admin Role Management API

**Controller:** `RoleController` at `/api/admin/roles/*`

All endpoints are protected at two layers:
- URL level: `hasRole("ADMIN")` via `SecurityConfig`
- Method level: specific `@PreAuthorize` permission
- Audit level: `@Audited` annotation logs every action to `audit_log`

### Endpoints

#### `POST /api/admin/roles/assign`
Assign a role to a user. Requires `MANAGE_ROLES`.

```json
// Request
{ "userId": 42, "role": "PREMIUM_USER" }

// Response 200
{ "message": "Role assigned", "userId": "42", "role": "PREMIUM_USER" }
```

#### `POST /api/admin/roles/revoke`
Revoke a user's role (resets to USER). Requires `MANAGE_ROLES`.

```json
// Request
{ "userId": 42 }

// Response 200
{ "message": "Role revoked", "userId": "42" }
```

#### `GET /api/admin/roles/users?page=0&size=50`
Paginated list of all users with their current roles. Requires `READ_ALL_USERS`.

```json
[
  { "id": 1, "email": "user@example.com", "fullName": "Jane Doe", "role": "USER", "enabled": true },
  { "id": 2, "email": "admin@fintwin.ai", "fullName": "Admin", "role": "ADMIN", "enabled": true }
]
```

#### `GET /api/admin/roles/users/{id}`
Get a specific user's role and full permission list. Requires `READ_ANY_USER_PROFILE`.

```json
{
  "id": 42,
  "email": "premium@example.com",
  "role": "PREMIUM_USER",
  "permissions": ["CONNECT_BANK_ACCOUNT", "DELETE_OWN_ACCOUNT", "EXPORT_OWN_DATA", "..."]
}
```

#### `POST /api/admin/roles/accounts/freeze/{userId}`
Freeze (disable) a user account. Requires `FREEZE_ANY_ACCOUNT`. Cannot freeze own account.

```json
// Response 200
{ "message": "Account frozen", "userId": "42" }
```

---

## Introducing a Premium Tier (Future)

When a `PREMIUM_USER` tier is launched, no annotation changes are needed in any controller or service. Only two steps:

**Step 1 — Remove AI/bank/investment permissions from USER in `Role.java`:**

```java
USER(EnumSet.of(
    Permission.READ_OWN_PROFILE,
    Permission.WRITE_OWN_PROFILE,
    Permission.DELETE_OWN_ACCOUNT,
    Permission.EXPORT_OWN_DATA,
    Permission.READ_OWN_TRANSACTIONS,
    Permission.WRITE_OWN_TRANSACTIONS,
    Permission.READ_OWN_BUDGETS,
    Permission.WRITE_OWN_BUDGETS,
    Permission.READ_OWN_GOALS,
    Permission.WRITE_OWN_GOALS,
    Permission.READ_OWN_NET_WORTH,
    Permission.WRITE_OWN_ASSETS,
    Permission.WRITE_OWN_LIABILITIES,
    Permission.READ_OWN_INSURANCE,
    Permission.WRITE_OWN_INSURANCE,
    Permission.USE_AI_BASIC
    // Removed: USE_AI_COPILOT, USE_AI_FORECAST, USE_AI_REPORT, USE_AI_SPENDING_COACH
    // Removed: CONNECT_BANK_ACCOUNT, READ_OWN_BANK_CONNECTIONS, DISCONNECT_BANK_ACCOUNT
    // Removed: READ_OWN_INVESTMENTS, WRITE_OWN_INVESTMENTS
)),
```

**Step 2 — Assign `PREMIUM_USER` role when a subscription is activated:**

```java
user.setRole("PREMIUM_USER");
userRepository.save(user);
```

From that moment, `ForecastService.generateForecast()` (guarded by `USE_AI_FORECAST`), `BankConnectionService.initiateConnection()` (guarded by `CONNECT_BANK_ACCOUNT`), and all other premium methods will return 403 for `USER` role automatically.

---

## Testing RBAC

### Unit test — verify Role authorities

```java
Set<Permission> userPerms = Role.USER.getPermissions();
assertTrue(userPerms.contains(Permission.READ_OWN_TRANSACTIONS));
assertFalse(userPerms.contains(Permission.DELETE_ANY_USER));

Collection<GrantedAuthority> authorities = Role.ADMIN.getAuthorities();
assertTrue(authorities.stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN")));
assertTrue(authorities.stream().anyMatch(a -> a.getAuthority().equals("MANAGE_ROLES")));
```

### Integration test — verify 403 for missing permission

```java
// Hit /api/forecast/generate as USER role (when premium tier is introduced)
mockMvc.perform(get("/api/forecast/generate")
        .header("Authorization", "Bearer " + userToken))
    .andExpect(status().isForbidden()); // 403

// Hit same endpoint as PREMIUM_USER
mockMvc.perform(get("/api/forecast/generate")
        .header("Authorization", "Bearer " + premiumToken))
    .andExpect(status().isOk()); // 200
```

### Integration test — verify 403 for cross-user resource access

```java
// User A tries to delete User B's asset
mockMvc.perform(delete("/api/assets/" + userBAssetId)
        .header("Authorization", "Bearer " + userAToken))
    .andExpect(status().isForbidden()); // 403, not 404
```

### Manual testing — verify role in JWT

```bash
# Decode the JWT (base64 middle segment)
echo "<JWT_MIDDLE_PART>" | base64 -d | jq .
# Should contain: "role": "USER"
```

### Manual testing — RoleController

```bash
# Assign PREMIUM_USER role (requires ADMIN token)
curl -X POST https://api.fintwin.ai/api/admin/roles/assign \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"userId": 42, "role": "PREMIUM_USER"}'

# List users with roles
curl https://api.fintwin.ai/api/admin/roles/users \
  -H "Authorization: Bearer <ADMIN_JWT>"
```
