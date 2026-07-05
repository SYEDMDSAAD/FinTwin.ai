"""
Live price fetcher for Indian investments.

Sources:
  Mutual Funds  → mfapi.in (free, no auth, all Indian MFs by AMFI code)
  Stocks        → yfinance (NSE/BSE, append .NS or .BO)
  Gold          → yfinance GC=F (USD/oz) + open.er-api.com (USD→INR)
  FD / PPF / NPS / Bonds → compound interest calculation
"""

import os

import yfinance as yf
import requests
from datetime import date
from typing import List, Dict, Optional

MFAPI_BASE = "https://api.mfapi.in/mf"
FX_API     = "https://open.er-api.com/v6/latest/USD"

# Last-resort fallbacks when the live APIs are unreachable. Env-configurable
# because hardcoded market constants silently go stale.
_FALLBACK_USD_INR       = float(os.environ.get("FALLBACK_USD_INR", "84.0"))
_FALLBACK_GOLD_INR_GRAM = float(os.environ.get("FALLBACK_GOLD_INR_PER_GRAM", "7500.0"))

# Simple in-process cache (reset on each AI service restart)
_fx_cache   = {"rate": None, "day": None}
_gold_cache = {"price": None, "day": None}


def _usd_inr() -> float:
    today = date.today()
    if _fx_cache["day"] == today and _fx_cache["rate"]:
        return _fx_cache["rate"]
    try:
        r = requests.get(FX_API, timeout=8)
        r.raise_for_status()
        rate = r.json()["rates"]["INR"]
        _fx_cache.update({"rate": rate, "day": today})
        return rate
    except Exception:
        return _FALLBACK_USD_INR


def _gold_inr_per_gram() -> float:
    today = date.today()
    if _gold_cache["day"] == today and _gold_cache["price"]:
        return _gold_cache["price"]
    try:
        gold_usd_oz = yf.Ticker("GC=F").fast_info["last_price"]
        price = (gold_usd_oz / 31.1035) * _usd_inr()
        _gold_cache.update({"price": price, "day": today})
        return price
    except Exception:
        return _FALLBACK_GOLD_INR_GRAM


def _mf_nav(scheme_code: str) -> Optional[float]:
    try:
        r = requests.get(f"{MFAPI_BASE}/{scheme_code}", timeout=10)
        r.raise_for_status()
        return float(r.json()["data"][0]["nav"])
    except Exception:
        return None


def _stock_price(ticker: str) -> Optional[float]:
    # Normalise to NSE if no exchange suffix given
    if not ticker.upper().endswith(".NS") and not ticker.upper().endswith(".BO"):
        ticker = ticker.upper() + ".NS"
    try:
        return float(yf.Ticker(ticker).fast_info["last_price"])
    except Exception:
        return None


def _crypto_price_inr(ticker: str) -> Optional[float]:
    # Try direct INR pair first, fall back to USD * rate
    for suffix in ["-INR", "-USD"]:
        sym = ticker.upper() + suffix
        try:
            price = float(yf.Ticker(sym).fast_info["last_price"])
            if suffix == "-USD":
                price *= _usd_inr()
            return price
        except Exception:
            continue
    return None


def _compound(principal: float, rate_pct: float, purchase_date_str: Optional[str]) -> float:
    """Annual compounding of the full principal from the purchase date.

    Two documented approximations:
    - The stored investedAmount may be a SUM of contributions (e.g. detected
      SIPs), all compounded from the earliest date — this OVERSTATES value,
      since later contributions earn interest they never had time for.
    - Indian FDs typically compound quarterly; annual compounding slightly
      UNDERSTATES. The two errors partially offset, but treat the result as
      an estimate, not an accrual.
    """
    if not purchase_date_str:
        return principal
    try:
        purchase = date.fromisoformat(purchase_date_str[:10])
        years = (date.today() - purchase).days / 365.25
        return round(principal * (1 + rate_pct / 100) ** years, 2)
    except Exception:
        return principal


def refresh_prices(investments: List[Dict]) -> List[Dict]:
    results = []
    gold_price = None

    for inv in investments:
        inv_id   = inv.get("id")
        inv_type = (inv.get("type") or "").strip()
        ticker   = inv.get("tickerCode")
        units    = inv.get("units")
        invested = float(inv.get("investedAmount") or 0)
        rate     = inv.get("interestRate")
        purchase = inv.get("purchaseDate")

        current_value = None

        if inv_type == "Mutual Fund":
            if ticker and units:
                nav = _mf_nav(str(ticker))
                if nav:
                    current_value = round(nav * float(units), 2)

        elif inv_type == "Stocks":
            if ticker and units:
                price = _stock_price(str(ticker))
                if price:
                    current_value = round(price * float(units), 2)

        elif inv_type == "Gold":
            if units:
                if gold_price is None:
                    gold_price = _gold_inr_per_gram()
                current_value = round(gold_price * float(units), 2)

        elif inv_type == "Fixed Deposit":
            effective_rate = float(rate) if rate else 7.0
            current_value = _compound(invested, effective_rate, purchase)

        elif inv_type == "PPF":
            current_value = _compound(invested, 7.1, purchase)

        elif inv_type == "NPS":
            current_value = _compound(invested, 9.0, purchase)

        elif inv_type == "Bonds":
            effective_rate = float(rate) if rate else 7.5
            current_value = _compound(invested, effective_rate, purchase)

        elif inv_type == "Crypto":
            if ticker and units:
                price = _crypto_price_inr(str(ticker))
                if price:
                    current_value = round(price * float(units), 2)

        # "Real Estate" and "Other" — no auto-price, leave as None (unchanged)

        results.append({"id": inv_id, "currentValue": current_value})

    return results
