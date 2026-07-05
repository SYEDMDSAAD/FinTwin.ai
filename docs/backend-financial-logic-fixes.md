# Backend Financial Logic Review & Fixes

**Date:** 2026-07-06
**Branch:** `main`
**Scope:** Domain logic, financial formulas, and real-world correctness across all backend services (`backend/`)
**Companion doc:** [backend-maturity-review.md](backend-maturity-review.md) covers the earlier security/architecture review; this one covers financial-math correctness.

A full review of the backend's financial formulas found that while the engineering
fundamentals were solid (encrypted `BigDecimal` money, ownership checks, audit
logging, circuit breakers), several formulas did not match real-world finance.
Everything below is **implemented** — 11 commits, test suite grown from 48 to 56,
all passing.

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium

---

## Summary of changes

| # | Severity | Fix | Commit |
|---|----------|-----|--------|
| 1 | 🔴 | Transaction dates stored as `LocalDate`, normalized at ingest (migration V10) | `204c237` |
| 2 | 🔴 | Monthly savings vs monthly targets; actual-months divisor everywhere | `0ec8f47` |
| 3 | 🔴 | Budget spend measured against the current month | `a4f8aac` |
| 4 | 🔴 | Real amortized EMI formula | `f4f4437` |
| 5 | 🟠 | Honest debt-score framing + payment-based DTI (migration V11) | `1179e77` |
| 6 | 🟠 | Single source of truth for the financial score | `4445440` |
| 7 | 🟡 | Null-guard sweep + `"Other"` category unification | `ce6f0a0` |
| 8 | 🟡 | Graceful fallbacks when the AI service is down | `08737fa` |
| 9 | 🟡 | Small analytics correctness fixes | `dab30c5` |
| 10 | 🟠 | Category forecast from user's own trend, not invented multipliers | `37cd85c` |
| 11 | 🟡 | Self-transfers excluded from income/expense aggregates | `7edfe69` |

---

## 1. Transaction dates → `LocalDate` (🔴, `204c237`)

**Problem.** `Transaction.date` was a free-text varchar. CSV import stored raw
strings with no validation, while the core 3-month window query compared dates
as *strings* — only valid for ISO values. Rows in `DD/MM/YYYY` or `DD-MM-YYYY`
silently fell out of every financial calculation, and `AnomalyService`'s
unguarded `LocalDate.parse` threw a 500 on them.

**Fix.**
- `Transaction.date` is now `LocalDate`; **migration V10** converts the column,
  normalizing the regional formats known to exist (unrecognizable values become
  `NULL` rather than staying silently corrupt).
- New `util/DateNormalizer` is the single parser for external date strings
  (ISO with optional time suffix, `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY/MM/DD`).
  All ingest points (CSV upload, batch import, manual entry, bank sync, OCR)
  normalize through it; unparseable CSV/import rows are skipped with a warning.
- Repository cutoff parameter is `LocalDate` — a real date comparison.
- JSON contract unchanged: DTOs and ai-service payloads still send ISO strings.

## 2. Monthly units & actual-months divisor (🔴, `0ec8f47`)

**Problem.** The 3-month window's income−expenses total was used interchangeably
as a *monthly* figure and as an *available balance*:
- `GoalPlannerService` compared the 3-month savings total against the *monthly*
  goal target — success probability and goal progress overstated ~3×.
- `AffordabilityService` judged purchases against 3-month cash flow instead of
  what the user actually has.
- Every `/3.0` divisor assumed 3 full months of data; new users with less had
  monthly figures understated by up to 3×.

**Fix.**
- New `util/TransactionMath.monthsPresent()` — divides by the distinct calendar
  months actually present (min 1). Adopted in forecast fallback, category
  forecast, insights, and credit-score annualization.
- Goal probability/health/progress use per-month savings (matching the math
  `OnboardingService` already had right).
- Affordability's available funds come from `NetWorthService`'s savings (the
  user's stated balance when present). Risk uses an emergency-fund ladder:
  fewer than 2 months of predicted expenses remaining after purchase = High,
  2–4 = Medium, above = Low.

## 3. Budgets measured monthly (🔴, `a4f8aac`)

**Problem.** Budget limits are monthly by convention, but `getBudgetStatus`
summed the entire 3-month window against each limit — a ₹10k monthly food
budget with steady ₹8k/month spending showed ₹24k spent and read as permanently
exceeded, also wrongly dragging down the 20-point Budget Discipline score factor.

**Fix.** Spend is filtered to the current calendar month. Regression test added
(prior-month transactions excluded).

## 4. Real EMI formula (🔴, `f4f4437`)

**Problem.** `suggestedEMI = price / months` — flat division with no interest,
understating the real payment ~15% at 14% p.a. over 24 months.

**Fix.** Standard amortization: `P·r·(1+r)ⁿ / ((1+r)ⁿ − 1)` with a configurable
assumed annual rate (`fintwin.affordability.annual-interest-rate`, default 14%
— typical Indian consumer-durable/personal loan). The assumed rate is included
in the API response (`emiAnnualInterestRate`) so the frontend can disclose it.
Unit-tested against the textbook reference value (₹1,00,000 @ 12% × 12 months
= ₹8,884.88).

## 5. Honest debt score + real DTI (🟠, `1179e77`)

**Problem.** The score claimed to be "CIBIL-style" with weights that "mirror
real bureau logic" — but bureaus score payment history, utilization, account
age, mix, and inquiries, none of which this app can see. Separately, "DTI" was
total debt *balance* / annual income with payment-style thresholds: a normal
car loan (~40% of annual income) scored "moderate risk" and any mortgage
(200–400%) bottomed out at 0 points.

**Fix.**
- Reframed as FinTwin's internal Debt & Discipline estimate. `CreditScoreDTO`
  gained a `disclaimer` field **the frontend must display**.
- `Liability` gained optional `interestRate` / `emi` / `termMonths`
  (**migration V11**, encrypted like other money columns).
- With EMIs present: real DTI = monthly payments / monthly income against
  standard lending thresholds (20/36/43/50%). Without: a leverage ratio with
  thresholds calibrated for balances (35/100/250/400% of annual income), so
  financed vehicles and mortgages are no longer automatically punished.

## 6. One financial score (🟠, `4445440`)

**Problem.** Three formulas produced three different scores for the same user:
the 5-factor FinTwin Score (score page), ProfileService's base-40 formula
(profile + score history), and a duplicate of it in
InvestmentRecommendationService.

**Fix.** `FinancialScoreService.calculateScoreFor(User)` is the single,
user-parameterized source of truth; the cached public endpoint, ProfileService,
and InvestmentRecommendationService all delegate to it. `BudgetService` gained
`getBudgetStatusFor(User)` so scoring avoids the request-scoped security
context; the ProfileService dependency is `@Lazy` to break the instantiation
cycle. **Note:** score-history snapshots taken after this commit use the
5-factor formula — values may step relative to older snapshots.

## 7. Null guards + category unification (🟡, `ce6f0a0`)

- A single null-amount transaction threw `NullPointerException` (Double
  auto-unboxing) in seven services — all now guarded.
- `AnalyticsService.getRecurringExpenses` grouped by merchant without a null
  filter (`Collectors.groupingBy` throws on null keys).
- `"Others"` default unified to `"Other"` (TransactionService ×2; one more in
  OnboardingService's seed template caught in commit `dab30c5`).

## 8. AI-service fallbacks (🟡, `08737fa`)

`SpendingCoachService` and `InvestmentRecommendationService` threw raw 500s
when the ai-service was unreachable. Both now return statistical fallbacks in
the same response shape the ai-service produces (verified against its
recommendation engine's contract), with an explicit "AI temporarily
unavailable" message.

## 9. Small analytics fixes (🟡, `dab30c5`)

- InsightService matched hardcoded exact category names — now lowercase-keyed,
  so insights don't silently die if categorization casing shifts.
- AnomalyService divided prior category spend by a fixed 2 even with one prior
  month — now divides by prior months actually present.
- Goal-health thresholds unified via new `util/GoalMath` (planner semantics
  kept: coverage ≥150% Excellent / ≥100% On Track / ≥70% At Risk / else
  Critical); OnboardingService previously used a different bar for the same
  labels.
- Recurring-expense amount is the merchant's average, not an arbitrary first
  transaction.

## 10. Data-driven category forecast (🟠, `37cd85c`)

**Problem.** `getCategoryForecast` applied invented per-category growth
multipliers (Food ×1.15/month, Shopping ×1.20/month — 435–792%/year
annualized) with no basis in any data.

**Fix.** Next month per category = recency-weighted average of the user's own
monthly totals (weights 1..n oldest→newest), excluding the still-incomplete
current month from the baseline when complete months exist.

## 11. Self-transfer exclusion (🟡, `7edfe69`)

**Problem.** Money moving between the user's own accounts counted as income on
one leg and spending on the other, inflating both sides of every ratio.

**Fix.**
- `TransactionMath.isSelfTransfer()`: conservative markers ("self transfer",
  "own account", "transfer to self") plus the `Transfer` category, which
  `CategoryService` now assigns for matching narrations.
- Shared `TransactionMath.income()/expenses()` helpers (null-guarded,
  transfer-excluded) replaced copy-pasted stream sums in ten services;
  NetWorthService's exact BigDecimal sums apply the same exclusion.
- **Deliberate:** credit-card bill payments are NOT excluded — card
  transactions aren't synced separately, so the bill payment is the only
  visible trace of that spending.

---

## Database migrations

| Migration | Change |
|-----------|--------|
| `V10__transaction_date_column.sql` | `transaction.date` varchar → `date`, normalizing `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY/MM/DD`; unknown formats → `NULL` |
| `V11__liability_loan_fields.sql` | `liability.interest_rate` (TEXT, encrypted), `liability.emi` (TEXT, encrypted), `liability.term_months` (integer) |

Both verified against real PostgreSQL via Testcontainers in CI.

## API changes (all additive / non-breaking)

| Endpoint | Change |
|----------|--------|
| Credit score | Response gains `disclaimer` (string) — **must be displayed** |
| Affordability | Response gains `emiAnnualInterestRate`; `suggestedEMI` now includes interest; risk ladder semantics changed |
| Liability create/update | Accepts optional `interestRate`, `emi`, `termMonths` |
| Budget status | `spent`/`remaining`/`exceeded` now reflect the current month only |
| Goals | `successProbability`, `progressPercent`, `availableSavings` now use monthly figures (values drop to realistic levels) |

## Intentional user-visible number changes

- Goal success probabilities and progress drop ~3× to realistic values.
- Budgets show current-month spend instead of a 3-month pile-up.
- Profile score now matches the score page; history snapshots step to the new basis.
- Debt score changes for anyone with liabilities (recalibrated DTI/leverage).

## Known limitations (need new data or product decisions, not code fixes)

- **Affordability's available funds** for bank-connected users still derive
  from cash flow — Setu AA transaction sync doesn't carry account balances.
  Proper fix: consume the AA deposit-summary balance.
- **Goal progress** tracks expected savings, not actual contributions — linking
  transactions to goals is a product design question.
- **Budgets are monthly-only** — a `period` field would be an enhancement.
- **The debt score can never include payment history/utilization** without
  bureau or card data — hence the mandatory disclaimer.

## Follow-ups outside the backend

- **Frontend:** display the credit-score `disclaimer`; disclose the EMI's
  assumed rate; add `interestRate`/`emi`/`termMonths` inputs to the liability
  form (payment-based DTI activates when set); confirm the budget page labels
  limits as monthly.
- **ai-service:** its recommendation engine hardcodes `savings / 3` — the same
  divisor bug fixed backend-side (`recommendation_engine.py`).
