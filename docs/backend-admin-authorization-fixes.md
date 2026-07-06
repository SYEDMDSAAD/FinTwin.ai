# Backend Admin-Surface Security Review & Fixes

**Date:** 2026-07-06
**Branch:** `main`
**Scope:** Application-wide security sweep (backend, identity-service, ai-service, frontend) focused on financial-data protection, with fixes landed on the main backend's admin surface.
**Companion docs:** [identity-service-security-fixes.md](identity-service-security-fixes.md) · [backend-financial-logic-fixes.md](backend-financial-logic-fixes.md) · [rbac.md](rbac.md) · [security-policy.md](security-policy.md)

A full-application audit for data leakage, authorization gaps, admin-action
abuse, and incident readiness. The codebase came out strong. Findings #1–#3 are
admin-surface authorization gaps — two of them variants of bugs already fixed in
the identity-service that had never reached the backend's separate admin path.
Finding #4 is an encryption-at-rest coverage gap surfaced by re-checking the
"all PII is encrypted" claim field-by-field instead of trusting it. All fixes
are **implemented**, 56 backend tests passing.

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium

---

## Summary of changes

| # | Severity | Fix | Commit |
|---|----------|-----|--------|
| 1 | 🔴 | Block impersonating ADMIN/SUPER_ADMIN targets (privilege escalation) | `8df413d` |
| 2 | 🟠 | Add method-level `@PreAuthorize` to `resetPassword` + `impersonate` | `8df413d` |
| 3 | 🟠 | Scope impersonation to SUPER_ADMIN only via dedicated `IMPERSONATE_USER` permission | `3430103` |
| 4 | 🟠 | Encrypt `InsurancePolicy` (premium/sum-assured/provider/notes) + `SupportTicket.message` — were plaintext at rest | `b9fa95b` |

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

## 4. Encryption-at-rest coverage gap (🟠, `b9fa95b`)

A field-by-field audit of every entity — prompted by re-checking the "all PII is
encrypted" claim rather than trusting it — found that **`InsurancePolicy` was
never brought into the AES-256/GCM field-encryption scheme**. Every other
financial entity (`Transaction`, `Asset`, `Liability`, `Investment`,
`FinancialGoal`, `Budget`, `BankConnection`, `CryptoConnection`) encrypts its
amount and name columns; insurance did not. These sat as **cleartext** in the
database:

- `premium` — premium amount
- `sumAssured` — coverage amount
- `provider` — insurer name
- `notes` — free text (up to 1400 chars)

It was a missed annotation, not a design choice: the V4 migration comments
already read `premium TEXT -- AES-GCM encrypted Double` and
`notes ... -- AES-GCM encrypted`, but the entity had no `@Convert`, and
`EncryptionMigrationService` never listed the repository. `SupportTicket.message`
(free text a user may paste sensitive detail into) had the same gap.

**Fix:**
- `@Convert(converter = EncryptionConverter.class)` on `InsurancePolicy`'s four
  fields and `SupportTicket.message`.
- **V12 migration** widens `provider`, `notes`, and `message` from bounded
  VARCHAR to `TEXT` — ciphertext is ~35% larger than plaintext and would
  otherwise overflow.
- Both repositories added to `EncryptionMigrationService` so existing plaintext
  rows re-encrypt on `POST /admin/migrate-encryption` (and transparently on the
  next save via the converter's legacy-plaintext fallback path).

`SupportTicket.userEmail` was deliberately **left** plaintext: it's the reply-to
routing key and must stay admin-readable. None of the encrypted fields are ever
used in a `WHERE` clause (insurance is queried only by `user`; tickets by
`status`), so encryption breaks no lookups.

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
- **Field encryption** (AES-256/GCM) on financial columns across all entities —
  now including `InsurancePolicy` and `SupportTicket.message` after fix #4;
  applied via JPA `@Convert` with a transparent legacy-plaintext fallback and a
  one-shot re-encryption endpoint. **Passwords/secrets `@JsonIgnore`'d** and
  never logged, **Setu webhook** verifies JWS signatures, **admin actions
  audit-logged** with admin email + IP + user-agent.

> **Scope of this claim:** encryption here is *application-level field
> encryption* (specific DB columns are ciphertext). It does **not** by itself
> cover TLS-in-transit (app↔DB, app↔ai-service) or full-disk/at-rest encryption
> of the database volume — those are deployment-infra concerns verified
> separately, not in application code.

## Known remaining considerations (accepted / noted)

- **Frontend stores JWTs in `localStorage`** (XSS-reachable) — standard SPA
  tradeoff; mitigated by the `default-src 'self'` CSP.
- **`resetPassword` returns the temp password in the response body** only when
  email is unconfigured (dev), the same documented pattern as identity-service.
- **Emails logged at INFO** in `EmailService` — low sensitivity.
- **`SupportTicket.userEmail`, `FinancialScoreHistory`, `DismissedAnomalyPattern.merchant`,
  `BlockedIP.*` remain plaintext** — intentional: email is the reply-to routing
  key; the others are non-sensitive (a score integer, a merchant string,
  security metadata).
- **IDOR review was sampled, not exhaustive.** Ownership guards were verified on
  every financial service and were consistent and correct; this is strong
  evidence of the pattern but not a proof across all ~35 controllers.

---

## Verification

- `mvn test` — **56 backend tests pass**, including `RbacIntegrationTest`
  (exercises method-level authorization, confirming the new annotations are
  active and not over-restrictive).
- Commits `8df413d` and `3430103`, pushed to `origin/main`.
