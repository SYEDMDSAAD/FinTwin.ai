# ai-service — Logic/Maturity Fixes (2026-06-28)

Full read-through of every ai-service engine for logic correctness and
industrial-grade robustness. **Overall the codebase is mature** — defensive
`.get()` access, LLM fallbacks, div-by-zero guards, and edge handling are already
the norm in most modules. This pass fixed the handful of real gaps + a few
cleanups. **No tests were added in this pass** (by request); the test backlog is
in [`ai-service-testing-remaining.md`](./ai-service-testing-remaining.md), with
fix-specific regression tests listed at the bottom of this doc.

---

## Fixes applied

| # | File | Issue | Fix | Severity |
|---|------|-------|-----|----------|
| 1 | `spending_coach/coach_engine.py` | Unguarded `t["amount"]` and `df.groupby("category")` — a transaction missing `amount`/`category`, or a non-numeric amount, raised `KeyError`/`ValueError` → route 500. Every other engine handles this defensively. | Added `_amount()` coercion helper; normalise rows (numeric amount, default category `"Uncategorised"`) before building the DataFrame. | 🟠 robustness |
| 2 | `spending_coach/coach_engine.py` | `print("Coach Error", …)` for errors; no module logger. | Added `logging` + `logger.warning(...)`. | 🟡 maturity |
| 3 | `chatbot/goal_routes.py` | Deprecated Pydantic v1 `.dict()`. | `model_dump()`. | 🟡 maturity |
| 4 | `investments/price_service.py` | `requests.get(...)` for mfapi NAV + USD→INR FX had no `raise_for_status()` — an HTTP 4xx/5xx error body could be parsed as data. | Added `r.raise_for_status()` before `.json()` on both calls (already wrapped in try/except → clean fallback). | 🟠 robustness |
| 5 | `investments/recommendation_engine.py` | LLM `portfolioScore` passed through unbounded; `recommendations` assumed to be a list; non-numeric `allocation` would crash. | Bound score to 0–100; validate `recommendations` is a non-empty list; coerce `allocation` to float. (All inside the existing try → deterministic fallback on failure.) | 🟡 robustness |
| 6 | `anomaly_detection/anomaly_engine.py` | Redundant local `from collections import defaultdict as dd` shadowing the module-level import (and `dd` unused). | Removed. | 🟢 cleanup |
| 7 | `anomaly_detection/risk_analysis.py` | Broken suggestion string: `"Limit {category} to ₹ remaining in budget…"` (dangling `₹ remaining` placeholder). | Reworded to a coherent sentence using `usage_pct`. | 🟢 correctness |
| 8 | `chatbot/memory.py` | `_evict_stale()` was defined but never called → the in-process (Redis-less) fallback store grew unbounded. | Call `_evict_stale()` in `_local_append` (outside the non-reentrant lock). | 🟡 leak (dev fallback) |

### Reviewed and deliberately left as-is (already mature)
- `chatbot/advisor.py`, `prompt_engine.py`, `intent_classifier.py`, `report_generator.py`,
  `goal_planner.py` — defensive access, per-section LLM fallbacks, loggers. Good.
- `forecasting/prophet_forecaster.py` (AutoTheta → linear-trend fallback) and
  `xgboost_predictor.py` (pure logistic math, edge-guarded). Good.
- `anomaly_engine.py` statistics (pstdev-or-1 guard, min-samples, global fallback,
  severity ranking). Good.
- `ocr/ocr_engine.py` (type/size/mode guards, bounded parsing) — already hardened in PR #33.
- `fraud_detector._check_rapid_succession` reports once for the whole list (not strictly
  "per cluster" as its comment says). Left unchanged — behaviour is defensible (surfaces
  the first rapid burst) and changing it risks overlapping-cluster noise. Noted for later.

---

## Verification (this pass)
- `py_compile` clean on all changed files.
- Existing PR #33 suite (8 tests) still green.
- Manual sanity: `generate_spending_coach([...malformed rows...])` no longer raises and
  returns the expected keys; empty input → `spendingHealth: "Unknown"`.

---

## Tests still to add (after these fixes)

The full backlog is in `ai-service-testing-remaining.md`. The fixes above specifically
warrant these **regression tests** (none added yet):

1. **coach_engine robustness** — `generate_spending_coach` with: rows missing `amount`,
   non-numeric `amount`, missing `category`, and `[]` → asserts no exception + correct
   keys / `"Unknown"` health. (Patch `utils.ollama_client.ask` so it's offline.)
2. **price_service** — patch `requests.get` to return a 500; assert `_mf_nav`/`_usd_inr`
   fall back (None / 84.0) instead of raising. Patch `yfinance.Ticker` for stock/gold/crypto.
3. **recommendation_engine** — feed a stubbed `ask` returning JSON with
   `portfolioScore: 250` and a string `allocation`; assert score is clamped to 100 and
   amounts compute; feed non-JSON → assert deterministic fallback shape.
4. **risk_analysis** — over-budget category (`usage_pct >= 85`) → assert the new
   suggestion wording (no `"₹ remaining"`).
5. **memory** — append many distinct `user_id`s with `last_access` in the past →
   assert `_evict_stale` prunes them from `_store`.
6. **anomaly/forecasting/goal** — happy-path output-shape tests with `ask` mocked.

Run locally: `cd ai-service && ./venv/bin/pytest tests/ -q`
