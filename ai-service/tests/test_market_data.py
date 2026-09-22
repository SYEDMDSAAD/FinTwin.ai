"""Discover-page market data: AMFI fund list, returns from NAV history, stocks."""
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

import app as app_module
from market import data

NAVALL = """Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Flexi Cap Fund)

PPFAS Mutual Fund

122639;INF879O01019;-;Parag Parikh Flexi Cap Fund - Regular Plan - Growth;78.1234;21-Sep-2026
122640;INF879O01027;-;Parag Parikh Flexi Cap Fund - Direct Plan - Growth;88.4567;21-Sep-2026

Open Ended Schemes(Debt Scheme - Liquid Fund)

Axis Mutual Fund

112210;INF846K01CX4;-;Axis Liquid Fund - Direct Plan - Growth;2890.11;21-Sep-2026
112211;INF846K01CY2;-;Axis Liquid Fund - Wound up;N.A.;21-Sep-2026
"""


# The format AMFI serves now: plan and option in their own columns
NAVALL_8 = """Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Children\u2019s Fund - Childrens' Fund)

Axis Mutual Fund

135762;INF846K01WO1;-;Axis Children's Fund;Direct Plan;Growth Option;29.9528;21-Sep-2026
135760;INF846K01WK9;-;Axis Children's Fund;Regular Plan;IDCW Option;24.0617;21-Sep-2026
"""


def test_parse_navall_reads_the_current_eight_column_format():
    funds = data.parse_navall(NAVALL_8)
    f = funds["135762"]
    assert f.name == "Axis Children's Fund - Direct Plan - Growth Option"
    assert f.nav == 29.9528 and f.nav_date == "21-Sep-2026"
    assert f.amc == "Axis Mutual Fund" and f.category.startswith("Children")


def test_parse_navall_reads_category_amc_and_skips_dead_schemes():
    funds = data.parse_navall(NAVALL)
    assert set(funds) == {"122639", "122640", "112210"}          # N.A. NAV dropped
    f = funds["122640"]
    assert f.amc == "PPFAS Mutual Fund"
    assert f.category == "Equity Scheme - Flexi Cap Fund"
    assert f.nav == 88.4567 and f.nav_date == "21-Sep-2026" and f.isin == "INF879O01027"
    assert funds["112210"].category == "Debt Scheme - Liquid Fund"


def _with_funds(monkeypatch):
    monkeypatch.setattr(data, "_funds", data.parse_navall(NAVALL))
    monkeypatch.setattr(data, "_funds_loaded_at", 10**12)          # fresh


def test_search_needs_every_word_and_puts_direct_growth_first(monkeypatch):
    _with_funds(monkeypatch)
    hits = data.search_funds("parag flexi")
    assert [h["code"] for h in hits] == ["122640", "122639"]
    assert data.search_funds("parag liquid") == []
    assert data.search_funds("liquid")[0]["amc"] == "Axis Mutual Fund"


def test_returns_are_cagr_from_nav_history():
    # NAV doubled in 3 years -> ~25.99% a year; up 10% in the last year
    history = [
        {"date": "21-09-2026", "nav": "200"},
        {"date": "22-09-2025", "nav": "181.8181"},
        {"date": "21-09-2023", "nav": "100"},
    ]
    r = data.returns_from_history(history)
    assert r["1y"] == 10.0
    assert r["3y"] == 25.99
    assert "5y" not in r                                            # not enough history


def test_a_stalled_history_api_costs_a_number_not_the_request(monkeypatch):
    import requests
    monkeypatch.setattr(data, "_returns_cache", {})
    with patch.object(data.requests, "get", side_effect=requests.exceptions.ReadTimeout()):
        assert data.fund_returns("122640") == {}


def test_stock_search_keeps_indian_equities_only():
    fake = MagicMock()
    fake.quotes = [
        {"symbol": "TMCV.NS", "shortname": "TATA MOTORS", "exchange": "NSI", "quoteType": "EQUITY"},
        {"symbol": "TMCV.BO", "shortname": "Tata Motors", "exchange": "BSE", "quoteType": "EQUITY"},
        {"symbol": "TTM", "shortname": "Tata Motors ADR", "exchange": "NYQ", "quoteType": "EQUITY"},
        {"symbol": "0P0000XVJK.BO", "shortname": "Some fund", "exchange": "BSE", "quoteType": "MUTUALFUND"},
    ]
    with patch("yfinance.Search", return_value=fake):
        hits = data.search_stocks("tata motors")
    assert [(h["symbol"], h["exchange"]) for h in hits] == [("TMCV.NS", "NSE"), ("TMCV.BO", "BSE")]


def test_quotes_add_the_nse_suffix_and_report_change(monkeypatch):
    monkeypatch.setattr(data, "_quote_cache", {})
    ticker = MagicMock()
    ticker.fast_info = {"last_price": 110.0, "previous_close": 100.0}
    with patch("yfinance.Ticker", return_value=ticker) as t:
        q = data.quotes(["tmcv"])
    t.assert_called_with("TMCV.NS")
    assert q == [{"symbol": "TMCV.NS", "price": 110.0, "previousClose": 100.0, "changePct": 10.0}]


client = TestClient(app_module.app)
KEY = {"x-internal-key": "test-internal-key"}


def test_discover_routes_need_the_internal_key_and_answer(monkeypatch):
    _with_funds(monkeypatch)
    assert client.get("/discover/funds/search", params={"q": "parag"}).status_code == 403
    r = client.get("/discover/funds/search", params={"q": "parag"}, headers=KEY)
    assert r.status_code == 200 and r.json()[0]["code"] == "122640"
    monkeypatch.setattr(data, "fund_returns", lambda code: {"1y": 12.3})
    r = client.get("/discover/funds/122640", headers=KEY)
    assert r.json()["returns"] == {"1y": 12.3}
    assert client.get("/discover/funds/999999", headers=KEY).status_code == 404
    assert client.get("/discover/funds/abc", headers=KEY).status_code == 400
