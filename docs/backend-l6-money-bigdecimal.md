# L6 — Money `Double` → `BigDecimal` migration

**Date:** 2026-06-28
**Scope:** Backend currency fields and the arithmetic that consumes them.
**Status:** in progress — this doc states the plan; code changes follow it.

This is the last open item from `backend-maturity-review.md` (L6). It was deferred
across earlier rounds because it is the highest-churn change in the backend.

---

## What the problem actually is (and isn't)

The common framing — "money stored as floating point loses precision" — is only
half-true here:

- **Storage is already exact.** `EncryptedDoubleConverter` persists
  `value.toString()` as encrypted **TEXT**, not IEEE-754 bits. `Double.toString`
  emits the shortest round-trippable decimal, so `1234.10` is stored as the string
  `"1234.1"` and parses back exactly. There is **no DB-format change** in this
  migration and **no data backfill** required.
- **The real issues are (a) in-memory arithmetic and (b) domain typing.**
  Summing many `double` amounts accumulates binary-rounding error
  (`0.1 + 0.2 = 0.30000000000000004`), which surfaces in user-facing **totals**
  (net worth, budget remaining, portfolio value, goal progress). And modelling
  currency as `Double` is a fintech smell — `BigDecimal` is the correct type.

So the migration changes the **Java type** and makes **authoritative sums exact**,
while leaving the on-disk format untouched.

---

## Fields in scope (→ `BigDecimal`)

True **currency** amounts:

| Entity | Fields |
|--------|--------|
| `Asset` | `amount` |
| `Liability` | `amount` |
| `Transaction` | `amount` |
| `Investment` | `investedAmount`, `currentValue` |
| `Budget` | `limitAmount` |
| `FinancialGoal` | `targetAmount`, `currentSaved`, `monthlyTarget`, `expectedSaved`, `availableSavings` |

## Fields deliberately left as `Double` (not currency)

These are ratios / percentages / quantities where binary `double` is appropriate and
`BigDecimal` adds nothing:

- `Investment.units` (quantity held), `Investment.interestRate` (%)
- `FinancialGoal.successProbability` (0–1), `FinancialGoal.progressPercent` (%)

---

## Strategy — typed `BigDecimal` storage + a `Double` compatibility view

A naive "change the field type and fix every compile error" pass would touch ~270
call sites across 22 services — **most with no functional benefit**, because the
heavy consumers (forecasting, anomaly z-scores, analytics trends, spending-coach
projections) are statistical **estimates** where `double` is the correct, idiomatic
type and exact decimals are meaningless. Rewriting all of them to `BigDecimal` would
be high-risk churn for zero gain.

Instead, the migration is surgical:

1. **`EncryptedBigDecimalConverter`** — mirror of `EncryptedDoubleConverter` but
   `AttributeConverter<BigDecimal, String>`. Reads legacy strings via
   `new BigDecimal(plain)` (backward compatible — values written by the old Double
   converter are plain decimal strings). The entity **field type becomes
   `BigDecimal`**, so the persisted domain type is now correct.

2. **`Double` compatibility view on each money field.** Alongside the `BigDecimal`
   field, each entity keeps a `Double`-typed `getX()/setX()` pair
   (`amount == null ? null : amount.doubleValue()` and
   `BigDecimal.valueOf(v)`), **plus** exact `getXExact()/setXExact(BigDecimal)`
   accessors. Effect:
   - Estimate/display code and the existing tests keep compiling and behaving
     **identically** — they use the `Double` view. Zero churn, zero behaviour change.
   - `BigDecimal.valueOf(double)` round-trips through `Double.toString`, so the
     persisted string is identical to what the old converter wrote.
   - (Lombok entities — `Transaction` — declare the `Double` accessor manually so
     Lombok doesn't generate a clashing `BigDecimal getAmount()`.)

3. **Authoritative totals use the exact accessors.** The user-facing money
   aggregations are migrated to exact `BigDecimal` math (`reduce(ZERO, add)`,
   `compareTo`, `signum`) via `getXExact()`:
   - `NetWorthService` — assets, liabilities, savings, portfolio value, net worth.
   - `BudgetService` — budget limit vs. spent.
   - `InvestmentService` — portfolio invested / current value / P&L.
   This is where `double` summation accumulated error and where the result is shown
   to the user to the cent.

4. **Ratios / percentages stay `double`.** Goal progress, P&L %, growth rates, etc.
   are inherently fractional; computing them as `double` from exact inputs is correct
   and avoids `BigDecimal.divide` scale/`ArithmeticException` handling.

5. **DTO boundary unchanged.** All DTOs stay `Double`/`double`; authoritative
   services convert `BigDecimal → double` (2dp) at DTO assembly. **No API or frontend
   change.**

---

## Behavioural impact

- **Authoritative totals** (NetWorth, Budget, Investment portfolio) become exact to
  the cent. Differences vs. the old `double` sums are sub-cent and vanish under the
  existing 2dp display rounding, so `NetWorthServiceTest` / `BudgetServiceTest`
  assertions still hold — and now guard exactness.
- **Everything else** — Forecast, Anomaly, Analytics, SpendingCoach, CreditScore,
  FinancialScore, Insight, Report, Goal progress: **no behavioural change** (uses the
  `Double` view, identical math).
- **Tests need no edits** — they build money via `setX(double)`, which the
  compatibility setter still accepts.

## Risk & verification

- Contained: changes are the converter + 6 entities + 3 authoritative services.
  No sweeping multi-service rewrite, so the risk surface is small and reviewable.
- Verified by `mvn test` (48 Testcontainers tests) — NetWorth/Budget have coverage,
  which is exactly where the exact-math change lands.
- **Reversible**: no DB/data-format change; revert the commit to roll back.

## Trade-off accepted

The `Double` compatibility view means money is still readable as `double` in
estimate code. That is intentional: it confines exactness to where it matters
(stored type + authoritative sums) without a 270-site rewrite of code that is
statistical by nature. A future pass could migrate individual estimate services to
the exact accessors if ever needed.

## Out of scope

- DTO/JSON types (stay `Double`).
- The non-currency `Double` fields listed above.
- ai-service (its own numeric stack).
