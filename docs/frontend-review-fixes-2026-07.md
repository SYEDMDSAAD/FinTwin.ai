# Frontend Review & Fixes — July 2026

**Date:** 2026-07-06
**Branch:** `main`
**Scope:** UI/UX, correctness, and consumption of the new backend/ai-service contracts (`frontend/`)
**Companion docs:** [backend-financial-logic-fixes.md](backend-financial-logic-fixes.md) · [ai-service-financial-logic-fixes.md](ai-service-financial-logic-fixes.md) · [frontend-review-fixes.md](frontend-review-fixes.md) (earlier pass)

A full review found solid modern foundations — lazy routes with per-route
error boundaries, per-page render tests, zero XSS vectors, toast-based
feedback — but two correctness bugs that misrepresented money, one broken
session flow, and none of the recent backend contract changes consumed.
All fixes below are **implemented** — 6 commits, 36 tests passing, lint clean.

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium

---

## Summary of changes

| # | Severity | Fix | Commit |
|---|----------|-----|--------|
| 1 | 🔴 | Token refresh on main-backend 401s (not just identity) | `a666b05` |
| 2 | 🔴 | Currency formatter preserves sign; INR-only until real FX | `9e76886` |
| 3 | 🟠 | Consume new backend contract fields (6 components) | `b4a570a` |
| 4 | 🟡 | Consistent en-IN formatting for all money displays | `6dae1ff` |
| 5 | 🟡 | Aggregated dashboard load errors; backend band authoritative | `80fe386` |

## 1. Session refresh for the main API client (🔴, `a666b05`)

The refresh-and-retry interceptor was registered only on the identity axios
client — the main backend client's 401 handler went straight to logout.
Since nearly all traffic goes to the main backend, the refresh token was
effectively useless: sessions hard-ended at access-token expiry, dumping the
user to `/login` mid-task.

The refresh interceptor is now a shared factory registered on **both**
clients, with global refresh state so a token expiry surfacing as many
concurrent 401s (the dashboard fires ~15 parallel fetches) triggers exactly
one refresh call; the rest queue and retry with the new token.

## 2. Honest currency formatting (🔴, `9e76886`)

- The Settings currency picker offered USD/EUR/GBP but swapped **only the
  symbol** — a user selecting USD saw their ₹50,000 balance rendered as
  "$50,000", an ~84× misrepresentation. All amounts are INR-denominated end
  to end, so non-INR options are removed until a real exchange-rate pipeline
  exists; legacy non-INR selections persisted in localStorage reset to INR.
- `fmt()` passed every value through `Math.abs`, silently stripping negative
  signs — overspend, losses, and the newly-negative `predictedSavings` all
  rendered as positives. The sign now survives formatting.

## 3. Contract consumption (🟠, `b4a570a`)

The backend/ai-service rounds shipped fields the frontend ignored:

| Contract field | Now |
|---|---|
| Credit score `disclaimer` (mandatory) | Rendered on the card, above the footer |
| Credit score fetch failure | Error state — previously displayed a fake "**0** out of 900 — Poor" |
| Negative `predictedSavings` | Red "**PROJECTED OVERSPEND**" card with explanation — previously "₹-7,000" in green |
| `emiMonths` + `emiAnnualInterestRate` | Shown under the suggested EMI ("24 months at an assumed 14% p.a.") |
| `canAffordOutright` / `monthsToSave` | Guidance line under the affordability result |
| Liability `emi` / `interestRate` / `termMonths` | Optional form inputs — filling the EMI activates the payment-based DTI |
| Monthly budget semantics | "Monthly limit (₹)" placeholder; "spent this month" on the card |

## 4. en-IN number formatting (🟡, `6dae1ff`)

24 call sites formatted rupee amounts with bare `toLocaleString()` (device
locale) while 50 used `"en-IN"` — a US-locale browser mixed 1,000,000 and
10,00,000 grouping on the same page. All money/count displays now use
`en-IN`; datetime stamps intentionally keep the device locale.

## 5. Dashboard error aggregation + band dedup (🟡, `80fe386`)

- A backend outage raised ~15 separate error toasts (one per parallel fetch),
  re-stacking every 30 seconds from the notification poll. Load failures
  within a short window are now aggregated — 3+ failures produce one summary
  toast; stable toast ids prevent stacking. Action toasts are untouched.
- `CreditScoreCard` duplicated the 300–900 band thresholds the backend also
  computes; the backend's `band`/`bandColor` are now authoritative.

---

## Deliberately deferred — needs a dedicated session with visual verification

These are structural changes where blind refactoring without running the app
and checking every screen would risk regressions disproportionate to their
benefit:

1. **Dashboard decomposition** — 2,012 lines, ~15 fetches, dozens of state
   variables. The concrete user harm (toast storm) is fixed; splitting the
   component is a mechanical but large refactor best done with the dev
   server open.
2. **Styling consolidation** — three paradigms coexist (inline style objects,
   Tailwind utilities, CSS classes). Converging on one is an app-wide visual
   rewrite; there are no visual regression tests to catch mistakes.
3. **Mobile/responsive pass** — Dashboard has almost no responsive
   breakpoints in JSX; mobile currently leans on `BottomNav` + CSS. Needs
   real viewport testing, not code reading.
4. **Tokens in localStorage** — a standard SPA tradeoff (XSS-stealable), not
   a bug. Moving to httpOnly cookies is an architecture change spanning the
   identity-service and every auth flow.

## What was checked and found genuinely good

- Lazy-loaded routes with `Suspense` + per-route `ErrorBoundary`.
- Concurrent-refresh queue design (single refresh, queued retries).
- Zero `dangerouslySetInnerHTML` / `alert()` / leftover `console.log`; all
  images have `alt`; 66 aria/role usages.
- `AuthContext` tolerates corrupt localStorage instead of white-screening.
- Per-page render smoke tests for all 17 pages; lint + tests gated in CI.
