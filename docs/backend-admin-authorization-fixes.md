# Backend Admin-Surface Security Review & Fixes

**Date:** 2026-07-06
**Branch:** `main`
**Scope:** Application-wide security sweep (backend, identity-service, ai-service, frontend) focused on financial-data protection, with fixes landed on the main backend's admin surface.
**Companion docs:** [identity-service-security-fixes.md](identity-service-security-fixes.md) · [backend-financial-logic-fixes.md](backend-financial-logic-fixes.md) · [rbac.md](rbac.md) · [security-policy.md](security-policy.md)

A full-application audit for data leakage, authorization gaps, admin-action
abuse, and incident readiness. The codebase came out strong — every
finding below was on the main backend's admin surface, and both were variants
of bugs already fixed in the identity-service that had never been applied to
the backend's separate admin path. All fixes are **implemented**, 56 backend
tests passing.

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium

---

## Summary of changes

| # | Severity | Fix | Commit |
|---|----------|-----|--------|
| 1 | 🔴 | Block impersonating ADMIN/SUPER_ADMIN targets (privilege escalation) | `8df413d` |
| 2 | 🟠 | Add method-level `@PreAuthorize` to `resetPassword` + `impersonate` | `8df413d` |
| 3 | 🟠 | Scope impersonation to SUPER_ADMIN only via dedicated `IMPERSONATE_USER` permission | `3430103` |

---

## 1. Impersonation privilege escalation (🔴, `8df413d`)

`AdminUserService.impersonate()` minted a token with the **target user's email
as subject**, but only blocked impersonating yourself or a disabled account. It
did **not** block impersonating another privileged account, so a plain ADMIN
could impersonate a SUPER_ADMIN and act with that account's full authority —
lateral-to-vertical privilege escalation.

This is the same hole closed in the identity-service last session
("impersonation blocked against ADMINs"); the main backend has its own separate
impersonate path that never received the fix.

**Fix:** reject any target whose role is `ADMIN` or `SUPER_ADMIN`.

```java
String targetRole = user.getRole() != null ? user.getRole().toUpperCase() : "USER";
if (targetRole.equals("ADMIN") || targetRole.equals("SUPER_ADMIN"))
    throw new IllegalArgumentException("Cannot impersonate an administrator account.");
```

## 2. Missing method-level authorization (🟠, `8df413d`)

Every sensitive method in `AdminUserService` carries a granular `@PreAuthorize`
(`freeze` → `FREEZE_ANY_ACCOUNT`, `deleteUser` → `DELETE_ANY_USER`, etc.), but
`resetPassword` and `impersonate` — the two highest-impact actions — had none.
They were still gated by the filter-level `hasRole('ADMIN')` on
`/api/v1/admin/**`, so this was defense-in-depth rather than an open hole, but
account takeover and password reset were protected *more weakly* than freezing
an account.

**Fix:** `resetPassword` now requires `WRITE_ANY_USER_PROFILE` (ADMIN already
holds it — behavior unchanged). `impersonate` was scoped further in fix #3.

## 3. Impersonation scoped to SUPER_ADMIN (🟠, `3430103`)

Impersonation is full, silent account takeover of any user — the highest-risk
capability in the system — and was available to every ADMIN. It now requires a
dedicated `IMPERSONATE_USER` permission granted **only** to SUPER_ADMIN.

Because `SUPER_ADMIN` is defined as `EnumSet.allOf(Permission.class)` it picks
up the new permission automatically; ADMIN's explicit permission list does not
include it, so no `Role.java` change was required.

```java
// Permission.java
// Full account takeover — deliberately NOT granted to ADMIN; SUPER_ADMIN only.
IMPERSONATE_USER,
```

```java
// AdminUserService.impersonate()
@PreAuthorize("hasAuthority('IMPERSONATE_USER')")
```

`resetPassword` was deliberately **left** at `WRITE_ANY_USER_PROFILE` (ADMIN
keeps it): a password reset notifies the user and is a normal support action,
unlike silent impersonation.

### Impersonation now has three stacked controls
1. Filter-level `hasRole('ADMIN')` on `/api/v1/admin/**`
2. Method-level `@PreAuthorize("hasAuthority('IMPERSONATE_USER')")` — SUPER_ADMIN only
3. Runtime target-role guard rejecting ADMIN/SUPER_ADMIN targets

> **Operational note:** admin accounts provisioned as `ADMIN` (not
> `SUPER_ADMIN`) lose the impersonation capability. Ensure at least one genuine
> SUPER_ADMIN exists before deploying so the capability isn't stranded.

---

## Reviewed and found genuinely good (unchanged)

- **No IDOR / cross-user data leakage.** Every financial service (`Asset`,
  `Liability`, `Investment`, `Insurance`, `Budget`, `Goal`, `BankConnection`,
  `CryptoConnection`) verifies `entity.getUser().getId()` against the caller
  after `findById` — path IDs are never trusted blindly.
- **Secrets fail-closed in production.** `SecurityStartupValidator` detects
  dev-default JWT/encryption/internal/admin keys and hard-aborts startup when
  `APP_REQUIRE_SECURE_CONFIG=true`, which is set in both `k8s/configmap.yaml`
  and `docker-compose.prod.yml`. No secrets committed (`.env` gitignored, only
  `.env.example` tracked).
- **ai-service locked down.** Requires `X-Internal-Key` via constant-time
  compare on every non-health route, refuses to boot without it, minimal CORS
  (no credentials).
- **No error/stacktrace leakage.** `GlobalExceptionHandler` returns a generic
  message for any uncaught exception; internal details never reach the client.
- **Field encryption** (AES-256/GCM) on PII, **passwords/secrets `@JsonIgnore`'d**
  and never logged, **Setu webhook** verifies JWS signatures, **admin actions
  audit-logged** with admin email + IP + user-agent.

## Known remaining considerations (accepted / noted)

- **Frontend stores JWTs in `localStorage`** (XSS-reachable) — standard SPA
  tradeoff; mitigated by the `default-src 'self'` CSP.
- **`resetPassword` returns the temp password in the response body** only when
  email is unconfigured (dev), the same documented pattern as identity-service.
- **Emails logged at INFO** in `EmailService` — low sensitivity.

---

## Verification

- `mvn test` — **56 backend tests pass**, including `RbacIntegrationTest`
  (exercises method-level authorization, confirming the new annotations are
  active and not over-restrictive).
- Commits `8df413d` and `3430103`, pushed to `origin/main`.
