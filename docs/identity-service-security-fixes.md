# Identity Service Security Review & Fixes

**Date:** 2026-07-06
**Branch:** `main`
**Scope:** Attacker-focused review of the identity service (`identity-service/`) — token handling, 2FA, lockout, OAuth, rate limiting, admin surface
**Companion docs:** [backend-financial-logic-fixes.md](backend-financial-logic-fixes.md) · [ai-service-financial-logic-fixes.md](ai-service-financial-logic-fixes.md) · [frontend-review-fixes-2026-07.md](frontend-review-fixes-2026-07.md) · [identity-service.md](identity-service.md) (architecture)

The strongest codebase of the four — constant-time key comparisons,
hashed+rotated refresh tokens, fail-closed introspection, atomic lockout via a
separate transaction, typed 2FA temp tokens. A focused attacker review still
found two critical gaps and several high ones. All fixes below are
**implemented** — 4 commits, 15 integration tests passing (Testcontainers,
including the new V2 migration).

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium

---

## Summary of changes

| # | Severity | Fix | Commit |
|---|----------|-----|--------|
| 1 | 🔴 | 2FA setup guard + refresh-token theft detection | `3456991` |
| 2 | 🟠 | Rate-limit XFF spoofing, login timing oracle, Google hardening | `79a6766` |
| 3 | 🟠 | Brute-force caps for 2FA + email OTP, TOTP replay guard (V2) | `4796f1c` |
| 4 | 🟡 | Public-path token passthrough, admin impersonation/reset hardening | `59ac6e9` |

## 1. Criticals (🔴, `3456991`)

**2FA secret overwrite.** `TwoFactorService.setup()` never checked
`twoFactorEnabled` — a stolen *access token* (exactly what 2FA exists to limit
the value of) could call setup and receive a fresh secret in the response,
locking the real user out of their authenticator and letting a
password-holding attacker pass 2FA. Setup now requires 2FA to be disabled
first, which itself demands a current TOTP code.

**Refresh-token theft detection.** Rotation was implemented but replaying a
rotated-out token only returned an error — missing the entire point of
rotation: the legitimate client replaying a stolen-and-used token *is* the
theft signal. Reuse now revokes the user's whole token family and invalidates
outstanding access tokens via `lastLogoutAt`. The revocation runs in
`REQUIRES_NEW` (new `TokenReuseGuard`, mirroring the existing
`LoginAttemptRecorder` pattern) because the `SecurityException` thrown
afterwards would otherwise roll it back.

## 2. Highs (🟠, `79a6766`)

**Rate-limit bypass.** `isTrustedProxy` used `startsWith("172.")` — trusting
`172.32.0.0`–`172.255.255.255`, which is public internet (only 172.16/12 is
private). And when trusted, the limiter keyed on the **leftmost**
X-Forwarded-For entry, which is client-supplied: behind any reverse proxy an
attacker could rotate fake XFF values for a fresh bucket per request,
defeating the login/2FA brute-force limits. Now walks XFF from the right,
keys on the first untrusted hop, and the CIDR check is correct.

**Login timing oracle.** Unknown emails skipped the ~100ms bcrypt compare and
returned measurably faster — reliable account enumeration. Unknown emails now
burn an equivalent bcrypt compare against a startup-generated dummy hash.

**Google login.** (a) The `email_verified` claim was never checked — Google
issues tokens for unverified emails. (b) Pre-registration takeover: an
attacker who registered `victim@example.com` locally (choosing the password)
left a dormant credential on the account the victim later used via Google
login. Google login now requires a verified Google email, and when attaching
to a local account whose email was never verified it rotates the password,
revokes all refresh tokens, and marks the email verified (Google just proved
ownership).

## 3. Brute-force caps + replay guard (🟠, `4796f1c`)

- `completeTwoFactorLogin` allowed unlimited TOTP guessing during the
  5-minute temp-token window (bounded only by the separately-spoofable IP
  limit). TOTP failures now feed the same lockout as password failures
  (5 → 15-minute lock); success resets the counters.
- Accepted TOTP codes stayed valid up to 90s in the ±1-step window — a
  sniffed code could be replayed. The last accepted time-step is persisted
  (**migration V2**, `users.two_factor_last_used_step`) and older-or-equal
  steps are rejected (RFC 6238 §5.2).
- `verifyEmail`'s 6-digit, 10-minute OTP had no attempt cap — wrong guesses
  now feed the lockout too.
- `LoginAttemptRecorder.recordFailure` is now `REQUIRES_NEW`: the new callers
  are `@Transactional` and throw immediately after recording; an ambient
  transaction would roll the increment back — the exact bug the recorder was
  created to prevent on the login path.

## 4. Mediums (🟡, `59ac6e9`)

- **JwtFilter** hard-401'd any request carrying an invalid/expired Bearer —
  including public endpoints. Since the frontend attaches whatever token is
  in storage, a user with an expired stored token couldn't submit the login
  form. Bad tokens on public auth paths now pass through unauthenticated.
- **Impersonation** worked against other ADMIN accounts — blocked.
- **Admin password reset** returned the temporary password in the API
  response even when it was emailed to the user — any admin could quietly
  take over an account. Now returned only when email isn't configured (dev),
  which the admin UI already handles conditionally.

---

## Reviewed and found genuinely good (unchanged)

- Constant-time `MessageDigest.isEqual` for X-Admin-Key and X-Internal-Key;
  introspection fails closed when the key is unset.
- Refresh tokens stored hashed, rotated on use, bulk-revoked on password
  change/reset, purged on schedule.
- Email OTPs and reset tokens stored hashed with expiry; dev OTP exposure
  only when email isn't configured.
- Lockout increments via an atomic UPDATE (with the rollback rationale
  documented in-code).
- `2fa_pending` tokens rejected as access tokens in both JwtFilter and
  introspection; `lastLogoutAt` invalidates old tokens across services.
- BCrypt(12), HSTS + frame-deny, stateless sessions, `@EnableMethodSecurity`,
  encrypted email column with hash for lookup.

## Known remaining considerations (accepted / noted)

- **Register endpoint states "account already exists"** — an enumeration
  channel by design tradeoff (UX); the timing oracle beside it is fixed.
- **Account-lockout DoS** is inherent to lockout: 5 wrong passwords locks any
  account 15 minutes. Mitigated by rate limiting; CAPTCHA would be the next
  step if abused.
- **`GlobalExceptionHandler` returns `RuntimeException` messages to clients**
  — currently curated; keep messages user-facing when adding new throws.
- **`/admin/**` is `permitAll` at the filter level** — secured by the
  in-controller constant-time X-Admin-Key check, which fails closed (503)
  when unset. Documented as a bootstrap-only surface to disable in
  production.
