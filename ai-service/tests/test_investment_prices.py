"""Tests for the /market/prices contract and the price/compounding maths.

The backend sends JPA ids as JSON numbers and money as plain floats; a
mismatch in the request model makes FastAPI reject the whole payload with a
422, which the backend swallows — so the refresh silently no-ops. These tests
pin the contract from the caller's side.
"""
from datetime import date, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient

import app as app_module
from investments.price_service import _compound, refresh_prices
from investments.routes import InvestmentItem, InvestmentRecommendationRequest

client = TestClient(app_module.app)
GOOD_KEY = {"x-internal-key": "test-internal-key"}


# ── Request-model contract ───────────────────────────────────────────────────

def test_investment_item_accepts_numeric_id():
    """The backend sends `id` as a number, not a string."""
    assert InvestmentItem(id=123).id == 123


def test_market_prices_accepts_backend_payload():
    payload = [{
        "id": 42,
        "type": "PPF",
        "tickerCode": None,
        "units": None,
        "investedAmount": 100000.0,
        "interestRate": None,
        "purchaseDate": "2020-01-01",
    }]
    r = client.post("/market/prices", json=payload, headers=GOOD_KEY)
    assert r.status_code == 200
    assert r.json()[0]["id"] == 42


def test_recommendation_request_preserves_liquid_savings():
    """Undeclared fields are dropped by model_dump(), which silently disabled
    the emergency-fund check."""
    req = InvestmentRecommendationRequest(income=1.0, netWorth=99.0, liquidSavings=5.0)
    assert req.model_dump()["liquidSavings"] == 5.0


def test_recommendation_request_preserves_portfolio_context():
    req = InvestmentRecommendationRequest(
        portfolioValue=1000.0, currentAllocation={"Stocks": 60.0}
    )
    dumped = req.model_dump()
    assert dumped["portfolioValue"] == 1000.0
    assert dumped["currentAllocation"] == {"Stocks": 60.0}


# ── Compounding ──────────────────────────────────────────────────────────────

def _one_year_ago():
    return (date.today() - timedelta(days=365)).isoformat()


def test_quarterly_compounding_exceeds_annual():
    annual = _compound(100000, 7, _one_year_ago(), periods_per_year=1)
    quarterly = _compound(100000, 7, _one_year_ago(), periods_per_year=4)
    assert quarterly > annual


def test_fixed_deposit_uses_quarterly_compounding():
    """Indian FDs compound quarterly."""
    purchase = _one_year_ago()
    result = refresh_prices([{
        "id": 1, "type": "Fixed Deposit",
        "investedAmount": 100000, "interestRate": 7, "purchaseDate": purchase,
    }])
    assert result[0]["currentValue"] == _compound(100000, 7, purchase, periods_per_year=4)


def test_ppf_uses_annual_compounding_at_statutory_rate():
    purchase = _one_year_ago()
    result = refresh_prices([{
        "id": 2, "type": "PPF", "investedAmount": 100000, "purchaseDate": purchase,
    }])
    assert result[0]["currentValue"] == _compound(100000, 7.1, purchase, periods_per_year=1)


def test_compound_without_purchase_date_returns_principal():
    assert _compound(50000, 7, None) == 50000


# ── Gold ─────────────────────────────────────────────────────────────────────

def test_gold_applies_india_retail_premium():
    """COMEX-derived prices understate Indian retail gold (duty + GST)."""
    import investments.price_service as ps

    ps._gold_cache.update({"price": None, "day": None})

    class _FakeTicker:
        fast_info = {"last_price": 3110.35}  # → 100 USD/gram

    with patch.object(ps.yf, "Ticker", return_value=_FakeTicker()), \
         patch.object(ps, "_usd_inr", return_value=100.0):
        price = ps._gold_inr_per_gram()

    # 100 USD/gram * 100 INR/USD = 10000 landed, plus the premium
    assert price == 10000 * ps._GOLD_INDIA_PREMIUM
    assert price > 10000

    ps._gold_cache.update({"price": None, "day": None})


# ── Unpriceable types are left untouched ─────────────────────────────────────

def test_real_estate_returns_no_price():
    result = refresh_prices([{"id": 3, "type": "Real Estate", "investedAmount": 5000000}])
    assert result[0]["currentValue"] is None


def test_stock_without_units_returns_no_price():
    result = refresh_prices([{"id": 4, "type": "Stocks", "tickerCode": "TCS", "units": None}])
    assert result[0]["currentValue"] is None


# ── IPO holdings ──────────────────────────────────────────────────────────────

def test_ipo_before_listing_is_worth_what_was_paid():
    from investments.price_service import refresh_prices
    [r] = refresh_prices([{"id": 1, "type": "IPO", "investedAmount": 15000, "units": None, "tickerCode": None}])
    assert r["currentValue"] == 15000


def test_listed_ipo_uses_the_live_price(monkeypatch):
    from investments import price_service
    monkeypatch.setattr(price_service, "_stock_price", lambda t: 130.0)
    [r] = price_service.refresh_prices([{"id": 1, "type": "IPO", "investedAmount": 14800,
                                         "units": 148, "tickerCode": "NEWCO"}])
    assert r["currentValue"] == 19240.0
