# ai-service — Testing: Done & Remaining

**Date:** 2026-06-28
**Context:** PR #33 hardened the ai-service and added a first test suite. This doc
tracks what that suite covers and what still needs tests.

---

## What exists now (PR #33)

- `ai-service/tests/test_app.py` — **8 tests**, HTTP-layer only:
  - `/health` and `/` are public (no key)
  - internal-key guard returns 403 for missing / wrong `X-Internal-Key`
  - `/ocr` requires the key
  - `/chat` request validation → 422 (missing mode, message too long, empty message)
- `ai-service/tests/conftest.py` — sets `AI_INTERNAL_KEY` / `ALLOWED_ORIGINS` before import.
- `ai-service/pytest.ini` — `pythonpath = .`, `testpaths = tests`.
- `ai-service/requirements-dev.txt` — `pytest`, `httpx`.
- CI (`.github/workflows/ci-ai-service.yml`) runs `pytest tests/` on Python 3.12.

**Run locally:**
```bash
cd ai-service
./venv/bin/pip install -r requirements-dev.txt    # if not already installed
./venv/bin/pytest tests/ -q
```

These tests deliberately avoid Ollama and Tesseract — auth/validation failures
short-circuit before any model/OCR call, so the suite is fast and dependency-free.

---

## What's NOT covered yet (the remaining work)

None of the actual business logic / engines are tested. All of the below is open.

### 1. Chat / advisor path (mock the LLM)
`chatbot/advisor.py`, `chatbot/prompt_engine.py`, `chatbot/intent_classifier.py`.
- Patch `utils.ollama_client.ask` (or `chatbot.advisor.ask`) with `monkeypatch` to
  return a canned string — then assert `/chat` returns `{"success": True, "reply": ...}`.
- Assert the prompt-injection mitigation: a `message` containing
  "ignore previous instructions" is still wrapped in `<user_question>` and the
  system rules are present (test `build_…`/prompt assembly directly).
- Assert the `_FALLBACK` is returned when `ask` raises `RuntimeError`.
- `format_category_lines` / `format_merchant_lines` / `format_history_block` —
  pure functions, easy unit tests (empty dict → "No data", ordering, top-N).

### 2. OCR engine (`ocr/ocr_engine.py`)
- Generate tiny in-memory images with Pillow (`PIL.Image` + `ImageDraw`) containing
  text like "Total ₹1,234.50" and assert `_extract_amount` / `_detect_merchant`.
  (Tesseract must be installed in CI — `apt-get install tesseract-ocr` — or mark
  these `@pytest.mark.skipif` when the binary is absent.)
- Unit-test the parsers directly with raw text (no image) to avoid the Tesseract
  dependency: `_extract_amount("Grand Total ₹999")`, total-keyword priority,
  largest-decimal fallback, out-of-range rejection (`<1` or `>500000`).
- Invalid/oversized input → `{"error": ...}` (route returns 422/413/415).

### 3. Forecasting (`forecasting/prophet_forecaster.py`, `xgboost_predictor.py`)
- Feed synthetic monthly transactions and assert output shape/keys and that an
  empty list raises the 422 validator (`ForecastRequest.must_not_be_empty`).
- These pull heavy deps (statsforecast/xgboost) — keep tests small; consider a
  `slow` marker.

### 4. Investments (`investments/recommendation_engine.py`, `price_service.py`)
- `recommendation_engine` is deterministic logic → unit-test allocation/risk output
  for a few income/savings/score profiles.
- `price_service` calls **yfinance** and an FX HTTP API → patch `yfinance.Ticker`
  and `requests.get` so tests are offline; assert price-map shape and graceful
  handling when a ticker returns nothing.

### 5. Anomaly detection (`anomaly_detection/anomaly_engine.py`, `fraud_detector.py`, `risk_analysis.py`)
- Synthetic transaction sets → assert anomalies flagged / not flagged, score ranges,
  and empty-input handling.

### 6. Spending coach (`spending_coach/coach_engine.py`)
- Now has a Pydantic model (PR #33); test happy path + empty `transactions`.

### 7. Route happy-paths (engines mocked)
For each router (`forecast`, `investment-recommendation`, `market/prices`,
`weekly-report`, `spending-coach`, `goal` routes), add a 200-path test with the
engine patched, asserting the response schema. Pair with the existing 403/422 tests.

### 8. Cross-cutting
- Add `pytest-cov` and a coverage gate (e.g. `--cov=. --cov-fail-under=70`).
- Decide CI policy for tests needing the Tesseract binary (install it in the
  workflow, or skip-if-absent).
- Consider a `slow`/`network` marker so the fast suite stays fast and heavy
  ML/OCR tests run separately.

---

## Suggested order
Pure functions first (prompt_engine formatters, OCR text parsers, recommendation
engine) → then mocked-LLM chat/report → then mocked-network price service →
then route happy-paths → finally coverage gate + CI Tesseract decision.

Pure-function and mocked tests need **no** new infra and give the most coverage
per effort; the OCR-image and forecasting tests are the heaviest and lowest
priority.
