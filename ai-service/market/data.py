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


# ── Prices on a past date ───────────────────────────────────────────────────
# To value money that went in on a given day: units = amount / price that day.
# Buys happen at the day's price if it traded, else the next trading day's —
# weekends, holidays and after-hours orders all settle forward.

_MAX_FORWARD_DAYS = 10


def stock_price_on(symbol: str, on: str) -> dict | None:
    """
    Closing price on `on` (YYYY-MM-DD), or the next trading day's.

    Yahoo's Close is adjusted for splits and bonus issues but not dividends:
    shares bought before a 1:1 bonus are compared at the halved price, so the
    unit count matches what the user holds today.
    """
    import yfinance as yf
    sym = symbol.strip().upper()
    if "." not in sym:
        sym += ".NS"
    day = datetime.strptime(on, "%Y-%m-%d")
    try:
        hist = yf.Ticker(sym).history(start=(day - timedelta(days=5)).strftime("%Y-%m-%d"),
                                      end=(day + timedelta(days=_MAX_FORWARD_DAYS + 1)).strftime("%Y-%m-%d"),
                                      auto_adjust=False)
    except Exception as e:
        logger.info("Price history unavailable for %s: %s", sym, e)
        return None
    if hist is None or hist.empty:
        return None
    rows = [(idx.date(), float(row["Close"])) for idx, row in hist.iterrows()]
    after = [r for r in rows if r[0] >= day.date()]
    # Nothing on or after (today, before the close): the latest trade before
    pick = after[0] if after else rows[-1]
    return {"symbol": sym, "date": pick[0].isoformat(), "price": round(pick[1], 4)}


_HISTORY_CACHE: dict[str, tuple[float, list]] = {}
_HISTORY_TTL_S = 6 * 3600


def _nav_history(code: str) -> list[tuple[datetime, float]]:
    """A fund's NAV history from mfapi.in, oldest first; cached for a few hours."""
    import time
    hit = _HISTORY_CACHE.get(code)
    if hit and time.monotonic() - hit[0] < _HISTORY_TTL_S:
        return hit[1]
    history = None
    for attempt in range(2):                      # mfapi.in sometimes stalls once
        try:
            r = requests.get(MFAPI_URL.format(code=code), timeout=_HISTORY_TIMEOUT)
            r.raise_for_status()
            history = r.json().get("data") or []
            break
        except Exception as e:
            logger.info("NAV history attempt %d failed for %s: %s", attempt + 1, code, e)
    if not history:
        return []
    points = []
    for h in history:
        try:
            points.append((datetime.strptime(h["date"], "%d-%m-%Y"), float(h["nav"])))
        except (KeyError, ValueError):
            continue
    points.sort()
    if len(_HISTORY_CACHE) > 500:
        _HISTORY_CACHE.clear()
    _HISTORY_CACHE[code] = (time.monotonic(), points)
    return points


def fund_monthly_navs(code: str, since: str) -> list[dict]:
    """The last NAV of each month from `since` (YYYY-MM) to now, for a value-over-time chart."""
    start = datetime.strptime(since + "-01", "%Y-%m-%d")
    last: dict[str, float] = {}
    for d, nav in _nav_history(code):
        if d >= start:
            last[d.strftime("%Y-%m")] = nav        # sorted, so the month's last NAV wins
    return [{"month": m, "nav": v} for m, v in sorted(last.items())]


def fund_nav_on(code: str, on: str) -> dict | None:
    """NAV on `on` (YYYY-MM-DD), or the next business day's — the NAV units are allotted at."""
    day = datetime.strptime(on, "%Y-%m-%d")
    points = list(_nav_history(code))
    if not points:
        return None
    points.sort()
    after = [p for p in points if day <= p[0] <= day + timedelta(days=_MAX_FORWARD_DAYS)]
    pick = after[0] if after else next((p for p in reversed(points) if p[0] <= day), None)
    if pick is None:
        return None                               # before the fund existed
    return {"code": str(code), "date": pick[0].date().isoformat(), "nav": pick[1]}



# ── Charts and collections (fund and stock pages) ───────────────────────────

# Same day counts as fund_returns (round(365.25 × years)), so the chart and
# the "past returns" row agree
FUND_RANGES = {"1M": 30, "6M": 183, "1Y": 365, "3Y": 1096, "5Y": 1826, "ALL": None}
_MAX_POINTS = 240


def _thin(points: list, limit: int = _MAX_POINTS) -> list:
    """Every nth point, always keeping the last, so a 20-year chart stays light."""
    if len(points) <= limit:
        return points
    step = len(points) / limit
    out = [points[int(i * step)] for i in range(limit)]
    if out[-1] is not points[-1]:
        out.append(points[-1])
    return out


def fund_history(code: str, rng: str) -> dict:
    """NAVs over a range (1M…ALL) for the fund page's chart, plus when the fund began."""
    points = _nav_history(code)
    if not points:
        return {"code": str(code), "range": rng, "points": [], "since": None, "change": None}
    days = FUND_RANGES.get(rng)
    window = points if days is None else [p for p in points if p[0] >= points[-1][0] - timedelta(days=days)]
    window = window or points[-1:]
    first, last = window[0][1], window[-1][1]
    return {
        "code": str(code), "range": rng,
        "since": points[0][0].date().isoformat(),
        "change": round((last / first - 1) * 100, 2) if first > 0 else None,
        "points": [{"date": d.date().isoformat(), "nav": round(v, 4)} for d, v in _thin(window)],
    }


def fund_nav_series(code: str) -> list[dict]:
    """The full daily NAV series, for the SIP / lump-sum calculator (done in the browser)."""
    return [{"date": d.date().isoformat(), "nav": round(v, 4)} for d, v in _thin(_nav_history(code), 2000)]


STOCK_RANGES = {"1D": ("1d", "5m"), "1W": ("5d", "30m"), "1M": ("1mo", "1d"),
                "1Y": ("1y", "1d"), "5Y": ("5y", "1wk")}
_STOCK_HISTORY_CACHE: dict[str, tuple[float, dict]] = {}


def stock_history(symbol: str, rng: str) -> dict:
    """Prices over a range for the stock page's chart, with the 52-week high and low."""
    import yfinance as yf
    sym = symbol.strip().upper()
    if "." not in sym:
        sym += ".NS"
    key = f"{sym}:{rng}"
    hit = _STOCK_HISTORY_CACHE.get(key)
    ttl = 120 if rng in ("1D", "1W") else 3600
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    period, interval = STOCK_RANGES.get(rng, STOCK_RANGES["1Y"])
    out = {"symbol": sym, "range": rng, "points": [], "high52": None, "low52": None, "change": None}
    try:
        t = yf.Ticker(sym)
        hist = t.history(period=period, interval=interval)
        pts = [{"t": idx.isoformat(), "price": round(float(row["Close"]), 2)} for idx, row in hist.iterrows()]
        out["points"] = _thin(pts)
        if pts and pts[0]["price"] > 0:
            out["change"] = round((pts[-1]["price"] / pts[0]["price"] - 1) * 100, 2)
        year = t.history(period="1y", interval="1d") if rng != "1Y" else hist
        if year is not None and not year.empty:
            out["high52"] = round(float(year["High"].max()), 2)
            out["low52"] = round(float(year["Low"].min()), 2)
    except Exception as e:
        logger.info("Price history unavailable for %s: %s", sym, e)
        return out
    if len(_STOCK_HISTORY_CACHE) > 500:
        _STOCK_HISTORY_CACHE.clear()
    _STOCK_HISTORY_CACHE[key] = (time.time(), out)
    return out


import re as _re
_BROAD_INDEX = _re.compile(r"nifty 50 index|sensex index|next 50|nifty 100 index|midcap 150|smallcap 250|nifty 500 index|total market", _re.I)

# Collections are plain filters on AMFI's own categories. Sorted by a stated
# column (3-year return), never "recommended": a list, not advice.
COLLECTIONS = {
    "index": ("Index funds (broad market)", lambda c, n: "Index Funds" in c and _BROAD_INDEX.search(n) is not None),
    "elss": ("Tax saving (ELSS)", lambda c, n: "ELSS" in c),
    "large-cap": ("Large cap", lambda c, n: c.endswith("Large Cap Fund")),
    "mid-cap": ("Mid cap", lambda c, n: c.endswith("Mid Cap Fund") and "Large" not in c),
    "small-cap": ("Small cap", lambda c, n: c.endswith("Small Cap Fund")),
    "flexi-cap": ("Flexi cap", lambda c, n: "Flexi Cap" in c),
    "liquid": ("Liquid (parking money)", lambda c, n: "Liquid Fund" in c),
    "gold": ("Gold", lambda c, n: "gold" in n.lower() and not c.startswith("Equity")),
}
_COLLECTION_CANDIDATES = 100


def _is_direct_growth(name: str) -> bool:
    n = name.lower()
    return "direct" in n and "growth" in n and "idcw" not in n and "dividend" not in n and "bonus" not in n


def fund_collection(key: str) -> dict | None:
    from concurrent.futures import ThreadPoolExecutor, wait
    spec = COLLECTIONS.get(key)
    if spec is None:
        return None
    title, match = spec
    funds = [f for f in _load_funds().values() if match(f.category, f.name) and _is_direct_growth(f.name)]
    funds.sort(key=lambda f: f.name)
    funds = funds[:_COLLECTION_CANDIDATES]
    returns: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {pool.submit(fund_returns, f.code): f.code for f in funds}
        done, _ = wait(futures, timeout=15)
        for fut in done:
            try:
                returns[futures[fut]] = fut.result()
            except Exception:
                pass
    rows = []
    for f in funds:
        r = returns.get(f.code) or {}
        rows.append({"code": f.code, "name": f.name, "amc": f.amc, "category": f.category,
                     "nav": f.nav, "nav_date": f.nav_date, "returns": r})
    rows.sort(key=lambda x: (x["returns"].get("3y") is None, -(x["returns"].get("3y") or 0)))
    return {"key": key, "title": title, "sortedBy": "3-year return, highest first",
            "note": "A list sorted by past returns, not a recommendation. Direct plans, growth option.",
            "funds": rows}


def collections() -> list[dict]:
    return [{"key": k, "title": t} for k, (t, _) in COLLECTIONS.items()]


_SECTOR_CACHE: dict[str, tuple[float, str | None]] = {}
_SECTOR_TTL = 7 * 24 * 3600       # a company's sector rarely changes


def stock_sectors(symbols: list[str]) -> dict[str, str | None]:
    """Each stock's sector (Yahoo's classification), for the sector split. None when unknown."""
    import yfinance as yf
    out: dict[str, str | None] = {}
    for raw in symbols[:50]:
        sym = raw.strip().upper()
        if not sym:
            continue
        if "." not in sym:
            sym += ".NS"
        hit = _SECTOR_CACHE.get(sym)
        if hit and time.time() - hit[0] < _SECTOR_TTL:
            out[sym] = hit[1]
            continue
        try:
            sector = (yf.Ticker(sym).info or {}).get("sector") or None
        except Exception as e:
            logger.info("Sector unavailable for %s: %s", sym, e)
            out[sym] = None
            continue                              # a failed read isn't cached
        _SECTOR_CACHE[sym] = (time.time(), sector)
        out[sym] = sector
    return out
