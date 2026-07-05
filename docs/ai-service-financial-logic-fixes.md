# AI-Service Financial Logic Review & Fixes

**Date:** 2026-07-06
**Branch:** `main`
**Scope:** Domain logic, financial formulas, and real-world correctness across the ai-service (`ai-service/`), plus the cross-service payload contract with the backend
**Companion docs:** [backend-financial-logic-fixes.md](backend-financial-logic-fixes.md) (backend round of the same review) · [ai-service-logic-fixes.md](ai-service-logic-fixes.md) (earlier logic pass)

A full review of the ai-service found solid engineering hygiene (internal-key
auth with constant-time comparison, retry/backoff on Ollama, battle-hardened
LLM-JSON parsing, prompt-injection guarding) but the same disease the backend
had — unit confusion — running through every formula, plus a large amount of
dead code. Everything below is **implemented** — 5 commits, backend 56 tests
and ai-service 83 tests passing.

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium

---

## Summary of changes

| # | Severity | Fix | Commit |
|---|----------|-----|--------|
| 1 | 🔴 | Monthly-figure contract between backend and ai-service | `6c84d65` |
| 2 | 🟠 | Dead code deleted; xgboost/scikit-learn/joblib dropped | `381b904` |
| 3 | 🟠 | Emergency fund uses liquid savings; LLM allocations normalized | `0449cf4` |
| 4 | 🟡 | Forecast: partial current month excluded, negative savings allowed | `ad0965a` |
| 5 | 🟡 | Honest report labeling, env-config fallbacks, compounding docs | `c2ebca6` |

---

## 1. Monthly-figure contract (🔴, `6c84d65`)

**Problem.** The backend sent 3-month window totals for
`income`/`expenses`/`savings`, but the ai-service labeled them **"Monthly
Income/Expenses/Savings"** in every LLM prompt:

- `chatbot/prompt_engine.py` — the chatbot's context block, so every chat
  answer reasoned from income ~3× too high.
- `chatbot/goal_planner.py` — goal plans said "Monthly income: ₹{3-month
  total}" and judged feasibility as `savings >= monthly_target` (3-month
  savings vs a monthly target — nearly every goal read as feasible).
- `investments/recommendation_engine.py` and
  `spending_coach/coach_engine.py` divided by a hardcoded `/3` in ~10 places —
  correct only when exactly 3 months of data existed; new users got monthly
  figures understated up to 3×.

**Fix.** The contract is now explicit monthly figures:
- **Backend:** `FinancialDataAggregatorService` (chat), `ReportService`,
  `GoalPlannerService.generateAIPlan`, and `InvestmentRecommendationService`
  all send per-month averages over the months actually present
  (`TransactionMath.monthsPresent`).
- **ai-service:** `recommendation_engine` consumes monthly values directly
  (no `/3`; the emergency fund is now correctly 6× *monthly* expenses);
  `coach_engine` derives months from the transaction dates it already
  receives (`_months_present`), so it needs no contract change at all.

**Backend stragglers caught during the cross-service pass** (also in this commit):
- `FinancialDataAggregatorService.computeScore` and an inline formula in
  `ReportService` were the **4th and 5th** divergent financial-score formulas
  (the backend round consolidated three). Both now delegate to
  `FinancialScoreService.calculateScoreFor`.
- `computeBudgetAlerts` compared 3-month category totals against monthly
  limits — chat routinely told users budgets were "exceeded by 200%". Alerts
  now come from `BudgetService`'s current-month status.
- `ReportService` income/expenses are now transfer-excluded via
  `TransactionMath`, and the coach's fallback-tip income reconstruction uses
  `expenses/(1−rate)` instead of the incorrect `expenses×(1+rate)`.

## 2. Dead code deleted (🟠, `381b904`)

**Problem.** The entire `anomaly_detection/` package — `anomaly_engine.py`
(statistically the best code in the service: proper z-scores with category
fallback), `fraud_detector.py`, `risk_analysis.py` — had **no routes and no
callers**; the backend serves anomaly detection from its own Java
`AnomalyService`. `forecasting/forecast.py` (an XGBoost variant superseded by
the AutoTheta forecaster — and statistically meaningless anyway: a 100-tree
GBM fit on 3 monotone-index points cannot extrapolate, so it just predicted
last month) and `xgboost_predictor.py` (misnamed — contained no XGBoost, only
unused logistic formulas) were equally unreachable. **47 of the 129 tests**
existed solely to validate this unreachable code and burned CI time doing it.

**Fix.** 1,196 lines deleted. With `forecast.py` gone, `xgboost` had no users
at all — removing it drops **`nvidia-nccl-cu12` (303 MB)** from the Docker
image, plus `scikit-learn` and `joblib` (also unused). `statsmodels` is now
pinned explicitly (it was always a statsforecast requirement but missing from
the pin list). Test count: 129 → 82 (83 after the new regression test below),
all meaningful.

## 3. Recommendation hardening (🟠, `0449cf4`)

**Problem A.** The emergency-fund check divided **net worth** by the 6-month
expense target. Net worth includes illiquid assets minus liabilities — a
homeowner with high equity but zero cash skipped the emergency-fund branch
entirely and got an aggressive portfolio recommendation.

**Fix A.** The backend now sends `liquidSavings` (the user's stated balance /
transactional flow from `NetWorthService`); the engine uses it, falling back
to net worth only for older callers.

**Problem B.** The portfolio prompt asks the LLM for allocations that "sum to
exactly 100" but nothing enforced it — a model returning 130 total
overcommitted the user's monthly savings by 30%.

**Fix B.** Allocations are clamped to ≥ 0 and normalized to sum to 100 before
rupee amounts are computed. Regression test: allocations 90+40 normalize to
69.2+30.8 and amounts never exceed monthly savings.

## 4. Forecast correctness (🟡, `ad0965a`)

- The monthly training series included the **still-incomplete current month**,
  which reads as a spending drop and dragged the AutoTheta/linear-trend
  forecast down (same bug class as the backend's category forecast). Now
  excluded whenever complete months exist — from both the expense series and
  the income average used for predicted savings.
- `predictedSavings` was **floored at 0**, hiding the most important signal a
  forecast can give: that the user is on track to overspend. Negative values
  now flow through; zero only when no income data exists.
- Verified end-to-end: two complete ~₹30k months plus a ₹5k partial month
  forecasts ~₹32k (not ~₹22k), and income ₹25k yields `predictedSavings`
  −₹7,000.

## 5. Honesty polish (🟡, `c2ebca6`)

- `report_generator` prompts claimed a "weekly financial report" / "financial
  health this week" over monthly-average data — relabeled to current
  financial health.
- `price_service`'s last-resort market constants (USD/INR 84, gold
  ₹7,500/gram) silently go stale — now env-configurable via
  `FALLBACK_USD_INR` and `FALLBACK_GOLD_INR_PER_GRAM`.
- `_compound` documents its two approximations: summed contributions
  compounded from the earliest purchase date **overstate** (later
  contributions earn interest they never had time for), while annual instead
  of quarterly FD compounding slightly **understates** — an estimate, not an
  accrual.

---

## API / contract changes

| Payload | Change |
|---------|--------|
| `/chat` (via `FinancialSummaryDTO`) | `income`/`expenses`/`savings` are now **monthly** figures |
| `/goal-plan` | `income`/`expenses`/`savings` are now **monthly** figures |
| `/investment-recommendation` | `income`/`expenses`/`savings` now monthly; new `liquidSavings` field; response `allocation` values normalized to sum to 100 |
| `/reports` | `income`/`expenses`/`savings` now monthly (transfer-excluded) |
| `/forecast` | unchanged input (raw transactions); `predictedSavings` may now be **negative** |

Both services must be deployed together for this contract change (they always
are — the ai-service is internal-only behind `X-Internal-Key`).

## What was checked and found genuinely good

- `app.py`: internal-key auth with constant-time comparison, minimal CORS,
  fail-fast on missing key.
- `utils/ollama_client.py`: retries with backoff, distinct error paths per
  failure mode.
- `forecasting/prophet_forecaster.py`: AutoTheta over Prophet is a
  well-reasoned, documented choice for short monthly series.
- `chatbot/advisor.py`: explicit prompt-injection defense
  (`<user_question>` tags + untrusted-input rule).
- `coach_engine`'s three-stage LLM-JSON parsing with trailing-comma repair.
- `chatbot/memory.py`: Redis with TTL and an honest in-process fallback caveat.
- OCR: size caps, mode validation, env-configurable merchant list.

## Known limitations (deliberate, documented)

- **Leakage rates** in the spending coach (25% of Food, 40% of Entertainment,
  etc.) are invented heuristic constants — deterministic by design so the
  figure doesn't change on regenerate, but the percentages have no empirical
  basis. Changing or removing the "leakage" concept is a product decision.
- **FD/PPF/NPS valuation** is an estimate (see `_compound` docstring), not an
  accrual — proper accuracy needs per-contribution records.
- **Frontend follow-ups** from the backend round still apply (credit-score
  disclaimer display, EMI rate disclosure, liability EMI/rate/term form
  fields, and now: negative forecast savings should render as an overspend
  warning rather than being clamped client-side).
