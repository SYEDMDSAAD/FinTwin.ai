"""
Market data for the Discover page: mutual funds and NSE/BSE stocks.

Funds come from AMFI's own daily NAV file — the official source, one fast
request for every scheme in India — cached for the day. Returns need NAV
history, which AMFI doesn't serve simply, so they come from mfapi.in with a
short timeout: that API is free but sometimes stalls for 25 s, and a slow
answer must cost the user a missing number, never a hung page.

Stocks come from Yahoo Finance via yfinance (search and live quotes).

These are facts — NAV, price, past returns — for the user to look at. Nothing
here recommends what to buy.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta

import requests

logger = logging.getLogger(__name__)

AMFI_URL = "https://www.amfiindia.com/spages/NAVAll.txt"
MFAPI_URL = "https://api.mfapi.in/mf/{code}"

_FUNDS_TTL = 6 * 3600          # AMFI publishes once a day, late evening
_RETURNS_TTL = 12 * 3600
_QUOTE_TTL = 60
_HISTORY_TIMEOUT = 8


@dataclass
class Fund:
    code: str
    name: str
    amc: str
    category: str
    nav: float
    nav_date: str
    isin: str


_funds: dict[str, Fund] = {}
_funds_loaded_at = 0.0
_funds_lock = threading.Lock()
_returns_cache: dict[str, tuple[float, dict]] = {}
_quote_cache: dict[str, tuple[float, dict]] = {}


# ── Funds ───────────────────────────────────────────────────────────────────

def parse_navall(text: str) -> dict[str, Fund]:
    """
    AMFI's NAVAll.txt: section headers ("Open Ended Schemes(Equity Scheme -
    Flexi Cap Fund)"), fund-house lines, and scheme rows. Rows are
    code;ISIN;ISIN;name;plan;option;NAV;date — AMFI split plan and option
    into their own columns — or the older code;ISIN;ISIN;name;NAV;date.
    """
    funds: dict[str, Fund] = {}
    category, amc = "", ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("Scheme Code"):
            continue
        parts = [p.strip() for p in line.split(";")]
        if len(parts) >= 6 and parts[0].isdigit():
            if len(parts) >= 8:
                name = " - ".join(p for p in (parts[3], parts[4], parts[5]) if p and p != "-")
                nav_raw, nav_date = parts[6], parts[7]
            else:
                name, nav_raw, nav_date = parts[3], parts[4], parts[5]
            try:
                nav = float(nav_raw)
            except ValueError:
                continue                       # "N.A." for wound-up schemes
            isin = parts[1] if parts[1] not in ("", "-") else parts[2]
            funds[parts[0]] = Fund(code=parts[0], name=name, amc=amc, category=category,
                                   nav=nav, nav_date=nav_date, isin=isin)
        elif "(" in line and line.endswith(")") and ";" not in line:
            category = line[line.index("(") + 1:-1].strip()
        elif ";" not in line:
            amc = line
    return funds


def _load_funds() -> dict[str, Fund]:
    global _funds, _funds_loaded_at
    with _funds_lock:
        if _funds and time.time() - _funds_loaded_at < _FUNDS_TTL:
            return _funds
        try:
            r = requests.get(AMFI_URL, timeout=20)
            r.raise_for_status()
            r.encoding = "utf-8"               # served without a charset; it is UTF-8
            parsed = parse_navall(r.text)
            if parsed:
                _funds, _funds_loaded_at = parsed, time.time()
        except Exception as e:
            # Keep serving yesterday's list rather than nothing
            logger.warning("AMFI NAV file unavailable: %s", e)
        return _funds


def search_funds(query: str, limit: int = 20) -> list[dict]:
    """Every word of the query must appear in the fund's name, AMC or category."""
    words = [w for w in query.lower().split() if w]
    if not words:
        return []
    hits = []
    for f in _load_funds().values():
        hay = f"{f.name} {f.amc} {f.category}".lower()
        if all(w in hay for w in words):
            # Direct growth plans first — what most people mean by "the fund"
            rank = (0 if "direct" in f.name.lower() else 1, 0 if "growth" in f.name.lower() else 1, f.name)
            hits.append((rank, f))
    hits.sort(key=lambda x: x[0])
    return [asdict(f) for _, f in hits[:limit]]


def fund_details(code: str) -> dict | None:
    fund = _load_funds().get(str(code))
    if not fund:
        return None
    out = asdict(fund)
    out["returns"] = fund_returns(str(code))
    return out


def fund_returns(code: str) -> dict:
    """Trailing 1/3/5-year returns (CAGR, %) from NAV history; {} when unavailable."""
    cached = _returns_cache.get(code)
    if cached and time.time() - cached[0] < _RETURNS_TTL:
        return cached[1]
    try:
        r = requests.get(MFAPI_URL.format(code=code), timeout=_HISTORY_TIMEOUT)
        r.raise_for_status()
        history = r.json().get("data") or []
        returns = returns_from_history(history)
    except Exception as e:
        logger.info("NAV history unavailable for %s: %s", code, e)
        return {}
    _returns_cache[code] = (time.time(), returns)
    return returns


def returns_from_history(history: list[dict]) -> dict:
    """history: [{"date": "21-09-2026", "nav": "29.95"}, ...], newest first."""
    points = []
    for h in history:
        try:
            points.append((datetime.strptime(h["date"], "%d-%m-%Y"), float(h["nav"])))
        except (KeyError, ValueError):
            continue
    if not points:
        return {}
    points.sort()
    latest_date, latest_nav = points[-1]
    out = {}
    for years in (1, 3, 5):
        target = latest_date - timedelta(days=round(365.25 * years))
        # No NAV is published on market holidays: take the nearest one, on
        # either side, within ten days of the target date
        nearest = min(points, key=lambda p: abs((p[0] - target).days))
        if abs((nearest[0] - target).days) > 10:
            continue
        start_nav = nearest[1]
        if start_nav > 0:
            out[f"{years}y"] = round(((latest_nav / start_nav) ** (1 / years) - 1) * 100, 2)
    return out


def latest_nav(code: str) -> float | None:
    fund = _load_funds().get(str(code))
    return fund.nav if fund else None


# ── Stocks ──────────────────────────────────────────────────────────────────

_INDIAN_EXCHANGES = {"NSI": "NSE", "BSE": "BSE", "BOM": "BSE"}


def search_stocks(query: str, limit: int = 10) -> list[dict]:
    import yfinance as yf
    if not query.strip():
        return []
    try:
        quotes = yf.Search(query, max_results=25, news_count=0).quotes
    except Exception as e:
        logger.warning("Stock search failed: %s", e)
        return []
    out, seen = [], set()
    for q in quotes:
        exch = _INDIAN_EXCHANGES.get(q.get("exchange"))
        symbol = q.get("symbol") or ""
        if not exch or q.get("quoteType") not in (None, "EQUITY") or symbol in seen:
            continue
        seen.add(symbol)
        out.append({"symbol": symbol, "name": q.get("longname") or q.get("shortname") or symbol,
                    "exchange": exch})
        if len(out) >= limit:
            break
    return out


def quotes(symbols: list[str]) -> list[dict]:
    import yfinance as yf
    out = []
    for raw in symbols[:50]:
        symbol = raw.strip().upper()
        if not symbol:
            continue
        if "." not in symbol:
            symbol += ".NS"
        cached = _quote_cache.get(symbol)
        if cached and time.time() - cached[0] < _QUOTE_TTL:
            out.append(cached[1])
            continue
        try:
            fi = yf.Ticker(symbol).fast_info
            price = float(fi["last_price"])
            prev = float(fi["previous_close"]) if fi["previous_close"] else None
            q = {"symbol": symbol, "price": round(price, 2),
                 "previousClose": round(prev, 2) if prev else None,
                 "changePct": round((price - prev) / prev * 100, 2) if prev else None}
            _quote_cache[symbol] = (time.time(), q)
            out.append(q)
        except Exception as e:
            logger.info("Quote unavailable for %s: %s", symbol, e)
            out.append({"symbol": symbol, "price": None, "previousClose": None, "changePct": None})
    return out
