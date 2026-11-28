"""Holdings from a Consolidated Account Statement (CAS) PDF.

Two kinds of CAS cover almost everything an Indian investor holds:
  - CAMS / KFintech: every mutual fund folio, with each purchase,
    redemption and dividend since the statement's start date.
  - NSDL / CDSL: shares, ETFs and demat mutual funds in the demat account.

The parsing is casparser's (MIT); no model reads the statement, so nothing
here leaves the service. What goes back to the backend is only the holdings
and their transactions: the investor's name, PAN, email, phone, address and
demat ids are dropped, and folio numbers are cut to their last four digits.
"""
from __future__ import annotations

import io
import logging
import re
from datetime import date
from decimal import Decimal

from documents.extract import MAX_BYTES, DocumentError  # noqa: F401  (MAX_BYTES re-exported for the route)

logger = logging.getLogger(__name__)

# Statement lines that are money moving in or out of the fund: the only ones
# that matter for returns. Taxes and stamp duty come out of the purchase.
CASH_TYPES = {
    "PURCHASE", "PURCHASE_SIP", "REDEMPTION", "SWITCH_IN", "SWITCH_IN_MERGER",
    "SWITCH_OUT", "SWITCH_OUT_MERGER", "DIVIDEND_PAYOUT", "DIVIDEND_REINVEST",
    "STT_TAX", "STAMP_DUTY_TAX", "TDS_TAX", "GIFT_IN", "GIFT_OUT", "REVERSAL",
}
MAX_TRANSACTIONS = 600  # per scheme: decades of monthly SIPs


def _val(e) -> str:
    """An enum member or its value (casparser models store either)."""
    return str(getattr(e, "value", e))


def _num(d: Decimal | None) -> float | None:
    return None if d is None else float(d)


def _iso(d) -> str | None:
    if isinstance(d, date):
        return d.isoformat()
    if isinstance(d, str):
        for fmt in ("%d-%b-%Y", "%Y-%m-%d"):
            try:
                from datetime import datetime
                return datetime.strptime(d, fmt).date().isoformat()
            except ValueError:
                pass
    return None


def _folio_tail(folio: str | None) -> str | None:
    digits = re.sub(r"\D", "", (folio or "").split("/")[0])
    return digits[-4:] if digits else None


def _scheme_name(raw: str) -> str:
    # CAMS prefixes the RTA scheme code: "PP001ZG-Parag Parikh Flexi Cap…"
    name = re.sub(r"^[A-Z0-9]{2,12}-(?=[A-Za-z])", "", raw.strip())
    return re.sub(r"\s+", " ", name)[:200]


def _ticker(symbol: str | None, exchange: str | None) -> str | None:
    if not symbol:
        return None
    return f"{symbol}.BO" if (exchange or "").upper() == "BSE" else f"{symbol}.NS"


def _rta_holdings(cas) -> list[dict]:
    out = []
    for folio in cas.folios:
        for s in folio.schemes:
            units = _num(s.close) or 0.0
            txns = [
                {"date": _iso(t.date), "type": _val(t.type), "amount": _num(t.amount),
                 "units": _num(t.units), "nav": _num(t.nav)}
                for t in s.transactions if _val(t.type) in CASH_TYPES and _iso(t.date)
            ][-MAX_TRANSACTIONS:]
            if units <= 0 and not txns:
                continue
            v = s.valuation
            out.append({
                "kind": "mf", "name": _scheme_name(s.scheme), "isin": s.isin, "amfi": s.amfi,
                "assetClass": s.type, "folio": _folio_tail(folio.folio), "amc": folio.amc,
                "units": units, "nav": _num(v.nav), "navDate": _iso(v.date),
                "value": _num(v.value), "cost": _num(v.cost), "transactions": txns,
            })
    return out


def _demat_holdings(cas) -> list[dict]:
    out = []
    as_of = _iso(cas.statement_period.to)
    for acct in cas.accounts:
        for e in acct.equities:
            if not e.num_shares:
                continue
            out.append({
                "kind": "stock", "name": (e.name or e.isin)[:200], "isin": e.isin,
                "ticker": _ticker(e.symbol, e.exchange), "units": _num(e.num_shares),
                "nav": _num(e.price), "navDate": as_of, "value": _num(e.value), "cost": None,
                "transactions": [],
            })
        for m in acct.mutual_funds:
            if not m.balance:
                continue
            out.append({
                "kind": "mf", "name": (m.name or m.isin)[:200], "isin": m.isin, "amfi": m.amfi,
                "assetClass": m.type, "folio": _folio_tail(m.folio), "units": _num(m.balance),
                "nav": _num(m.nav), "navDate": as_of, "value": _num(m.value),
                "cost": _num(m.total_cost), "transactions": [],
            })
    return out


def read_cas(data: bytes, password: str | None) -> dict:
    if not data.startswith(b"%PDF"):
        raise DocumentError("not_pdf", "Upload the statement as a PDF.")
    if not password:
        raise DocumentError("password_required",
                            "CAS statements are locked. Enter the password: usually your PAN in capitals.")
    try:
        import casparser
        from casparser.exceptions import IncorrectPasswordError, ParserException
    except ImportError:
        raise DocumentError("reader_unavailable", "The statement reader isn't installed.") from None

    try:
        cas = casparser.read_cas_pdf(io.BytesIO(data), password)
    except IncorrectPasswordError:
        raise DocumentError("password_incorrect", "That password didn't open the PDF. Try again.") from None
    except ParserException:
        raise DocumentError("not_a_cas", "This doesn't look like a CAS from CAMS, KFintech, NSDL or CDSL.") from None

    if hasattr(cas, "folios"):
        source, holdings = _val(cas.file_type), _rta_holdings(cas)
        detailed = _val(cas.cas_type) == "DETAILED"
    else:
        source, holdings, detailed = _val(cas.file_type), _demat_holdings(cas), False
    if not holdings:
        raise DocumentError("no_holdings", "No holdings were found in this statement.")
    # Counts only: never names, folios or amounts in the log
    logger.info("CAS read: %s, %d holdings, %d warnings", source, len(holdings), len(cas.parse_warnings))
    return {
        "source": source,
        "detailed": detailed,
        "statementFrom": _iso(cas.statement_period.from_),
        "statementTo": _iso(cas.statement_period.to),
        "holdings": holdings,
    }
