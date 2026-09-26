"""A fixed user for the copilot eval, and a fake /internal/ai backend over it.

The fake applies the same filters and builds the same response shapes as
backend/.../controller/InternalAIController.java, so whatever arguments the
model chooses for a tool, it gets a realistic answer — and because the data
is fixed, every correct figure is known in advance. Figures the cases check
are computed from this data (see copilot_cases.py), never typed by hand.

Priya: salaried in Bengaluru, three months of data (July–September 2026).
"""
from __future__ import annotations

from datetime import date

USER_ID = 8


def inr(v: float) -> str:
    """Indian digit grouping, as the backend's InternalAIController.inr()."""
    paise = round(abs(v) * 100)
    digits, frac = str(paise // 100), paise % 100
    out = "-₹" if v < 0 else "₹"
    for i, ch in enumerate(digits):
        out += ch
        remaining = len(digits) - i - 1
        if remaining == 3 or (remaining > 3 and remaining % 2 == 1):
            out += ","
    if frac:
        out += f".{frac:02d}"
    return out


def _t(day: str, merchant: str, category: str, amount: float) -> dict:
    return {"date": date.fromisoformat(day), "merchant": merchant, "category": category, "amount": amount}


TRANSACTIONS: list[dict] = []
for month, groceries, swiggy, uber, power in (
    ("2026-07", [2150, 2580], [420, 380, 515, 610], [240, 310], 1780),
    ("2026-08", [2890, 2310], [455, 390, 720, 380, 505], [260, 180, 330], 1850),
    ("2026-09", [2640, 2410], [610, 540, 470, 395, 680, 720], [290, 350], 1920),
):
    TRANSACTIONS += [
        _t(f"{month}-01", "NEFT/ACME TECHNOLOGIES PVT LTD/SALARY", "Salary", 85000),
        _t(f"{month}-03", "Landlord Ramesh Kumar", "Housing", -22000),
        _t(f"{month}-05", "Groww SIP", "Investments", -5000),
        _t(f"{month}-08", "BESCOM Electricity", "Bills", -power),
        _t(f"{month}-12", "Netflix", "Entertainment", -649),
    ]
    TRANSACTIONS += [_t(f"{month}-{10 + 7 * i:02d}", "DMart", "Groceries", -a) for i, a in enumerate(groceries)]
    TRANSACTIONS += [_t(f"{month}-{2 + 4 * i:02d}", "Swiggy", "Food", -a) for i, a in enumerate(swiggy)]
    TRANSACTIONS += [_t(f"{month}-{6 + 9 * i:02d}", "Uber", "Transport", -a) for i, a in enumerate(uber)]

TRANSACTIONS += [
    _t("2026-07-19", "Apollo Pharmacy", "Health", -1240),
    _t("2026-08-14", "Croma", "Shopping", -24999),
    _t("2026-08-22", "UPI/9876543210/Rahul Sharma/YESB/412345", "Other", 12000),
    _t("2026-09-17", "Myntra", "Shopping", -3499),
]

BUDGETS = [  # the current month (September), as BudgetService reports it
    {"category": "Food", "limit": 3000.0, "spent": 3415.0, "remaining": -415.0, "exceeded": True},
    {"category": "Shopping", "limit": 5000.0, "spent": 3499.0, "remaining": 1501.0, "exceeded": False},
    {"category": "Transport", "limit": 1500.0, "spent": 640.0, "remaining": 860.0, "exceeded": False},
]

GOALS = {
    "totalGoals": 2, "completedGoals": 1, "ongoingGoals": 1,
    "goals": [
        {"title": "Emergency fund", "status": "Ongoing", "targetAmount": 300000,
         "targetAmountFormatted": "₹3,00,000", "savedSoFar": 120000, "savedSoFarFormatted": "₹1,20,000",
         "durationMonths": 18, "progressPercent": 40.0, "monthlyTarget": 16667.0, "goalHealth": "On Track"},
        {"title": "Goa trip", "status": "Completed", "targetAmount": 40000,
         "targetAmountFormatted": "₹40,000", "savedSoFar": 40000, "savedSoFarFormatted": "₹40,000",
         "durationMonths": 6, "completedOn": "2026-05-30"},
    ],
}

_ASSETS = [{"name": "HDFC savings account", "type": "Cash", "amount": 210000.0}]
_LIABILITIES = [{"name": "Car loan", "type": "Vehicle Loan", "outstanding": 340000.0,
                 "interestRate": 9.5, "emi": 11200.0, "termMonths": 36}]
_INSURANCE = [{"type": "Health", "provider": "Star Health", "premium": 14000.0,
               "frequency": "Yearly", "sumAssured": 500000.0}]
_HOLDINGS = [  # name, type, invested, current, ticker, units
    ("Parag Parikh Flexi Cap", "Mutual Fund", 60000.0, 71400.0, "122639", 812.4),
    ("HDFC Bank", "Stocks", 30000.0, 26550.0, "HDFCBANK.NS", 18),
    ("SBI FD", "Fixed Deposit", 50000.0, 53500.0, None, None),
]


def _pct(gain: float, base: float) -> float:
    return round(gain / base * 10000) / 100.0 if base > 0 else 0.0


def net_worth() -> dict:
    invested = sum(h[2] for h in _HOLDINGS)
    current = sum(h[3] for h in _HOLDINGS)
    assets = sum(a["amount"] for a in _ASSETS)
    liabilities = sum(l["outstanding"] for l in _LIABILITIES)
    return {
        "totalAssets": round(assets), "totalLiabilities": round(liabilities),
        "investmentsInvested": round(invested), "investmentsCurrent": round(current),
        "netWorth": round(assets + current - liabilities),
        "assets": _ASSETS, "liabilities": _LIABILITIES,
        "investments": [{"name": h[0], "type": h[1], "invested": h[2], "currentValue": h[3]} for h in _HOLDINGS],
        "insurance": _INSURANCE,
    }


def portfolio(only_type: str | None = None) -> dict:
    """Same shape as InternalAIController.portfolioBody()."""
    rows = [h for h in _HOLDINGS if not only_type or h[1].lower() == only_type.lower()]
    holdings, by_type = [], {}
    total_inv = total_cur = 0.0
    for name, kind, invested, current, ticker, units in rows:
        total_inv += invested
        total_cur += current
        by_type[kind] = by_type.get(kind, 0) + current
        gain = current - invested
        valuation = ("estimated from the interest rate, not a market price" if kind == "Fixed Deposit"
                     else "market price at the last portfolio refresh")
        row = {"name": name, "type": kind}
        if ticker:
            row["symbol"] = ticker
        if units is not None:
            row["units"] = units
        row.update({"investedFormatted": inr(invested), "currentValueFormatted": inr(current),
                    "gainFormatted": ("+" if gain > 0 else "") + inr(gain),
                    "gainPercent": _pct(gain, invested), "valuation": valuation})
        holdings.append(row)
    holdings.sort(key=lambda h: -h["gainPercent"])
    gain = total_cur - total_inv
    scope = f"{only_type} holdings" if only_type else "Portfolio"
    body = {}
    if only_type:
        body["filteredTo"] = only_type
    body["summary"] = "" if not rows else (
        f"{scope} ({len(rows)} {'holding' if len(rows) == 1 else 'holdings'}): invested {inr(total_inv)}, "
        f"now worth {inr(total_cur)} — {'a gain of ' if gain >= 0 else 'a loss of '}{inr(abs(gain))} "
        f"({'+' if gain > 0 else ''}{_pct(gain, total_inv)}%).")
    body["perHolding"] = [f"{h['name']} ({h['type']}): invested {h['investedFormatted']}, now "
                          f"{h['currentValueFormatted']}, {h['gainFormatted']} ({h['gainPercent']}%)" for h in holdings]
    body["inProfit"] = [h["name"] for h in holdings if h["gainPercent"] > 0]
    body["atLoss"] = [h["name"] for h in holdings if h["gainPercent"] < 0]
    body.update({"holdingCount": len(rows), "totalInvestedFormatted": inr(total_inv),
                 "currentValueFormatted": inr(total_cur),
                 "totalGainFormatted": ("+" if gain > 0 else "") + inr(gain),
                 "totalGainPercent": _pct(gain, total_inv),
                 "allocation": [f"{k}: {round(v / total_cur * 1000) / 10.0 if total_cur else 0}% ({inr(v)})"
                                for k, v in sorted(by_type.items(), key=lambda kv: -kv[1])]})
    if len(holdings) > 1:
        body["bestPerformer"] = f"{holdings[0]['name']} ({holdings[0]['gainPercent']}%)"
        body["worstPerformer"] = f"{holdings[-1]['name']} ({holdings[-1]['gainPercent']}%)"
    body["holdings"] = holdings
    if not rows:
        body["note"] = f"The user has no {only_type} holdings recorded in FinTwin."
    return body


def _counterparty(merchant: str) -> str:
    for part in merchant.split("/"):
        p = part.strip()
        if len(p) >= 3 and p.replace(" ", "").replace(".", "").replace("'", "").replace("&", "").replace("-", "").isalpha() \
                and not (p.isupper() and 3 <= len(p) <= 5):
            return p
    return merchant.strip()


def transactions(category=None, sort="date", type="expense", limit=10, months=3, groupBy=None) -> dict:
    """Same filtering and shapes as InternalAIController.transactions()."""
    limit = min(max(int(limit), 1), 25)
    months = min(max(int(months), 1), 12)
    newest = max(t["date"] for t in TRANSACTIONS)
    y, m = newest.year, newest.month - (months - 1)
    while m <= 0:
        y, m = y - 1, m + 12
    cutoff = date(y, m, 1)
    rows = []
    for t in TRANSACTIONS:
        if t["date"] < cutoff:
            continue
        if type == "expense" and t["amount"] >= 0:
            continue
        if type == "income" and t["amount"] <= 0:
            continue
        if category and t["category"].lower() != str(category).strip().lower():
            continue
        rows.append({"date": t["date"].isoformat(), "merchant": t["merchant"], "category": t["category"],
                     "amount": float(t["amount"]), "amountFormatted": inr(t["amount"])})
    if groupBy in ("merchant", "category"):
        totals: dict[str, list[float]] = {}
        for r in rows:
            name = _counterparty(r["merchant"]) if groupBy == "merchant" else r["category"]
            agg = totals.setdefault(name, [0.0, 0])
            agg[0] += abs(r["amount"])
            agg[1] += 1
        groups = [{groupBy: k, "totalAmount": round(v[0]), "totalAmountFormatted": inr(round(v[0])),
                   "transactionCount": v[1]}
                  for k, v in sorted(totals.items(), key=lambda kv: -kv[1][0])[:limit]]
        return {"totalTransactionsAggregated": len(rows), "groupedBy": groupBy, "groups": groups}
    if sort == "amount":
        rows.sort(key=lambda r: -abs(r["amount"]))
    else:
        rows.sort(key=lambda r: r["date"], reverse=True)
    return {"totalMatching": len(rows), "transactions": rows[:limit]}


def backend_get(path: str, params: dict | None = None, tool_token: str | None = None) -> dict:
    """Drop-in for utils.backend_api.get over the fixture user."""
    params = params or {}
    user, _, endpoint = path.strip("/").partition("/")
    if int(user) != USER_ID:
        raise RuntimeError("Backend data API unavailable: 403")
    if endpoint == "transactions":
        return transactions(**params)
    if endpoint == "budgets":
        return {"budgets": BUDGETS}
    if endpoint == "goals":
        return GOALS
    if endpoint == "networth":
        return net_worth()
    if endpoint == "portfolio":
        return portfolio(params.get("type"))
    raise RuntimeError(f"unknown endpoint {endpoint}")


def financial_data() -> dict:
    """The snapshot the backend's aggregator sends with every copilot request."""
    expenses = [t for t in TRANSACTIONS if t["amount"] < 0]
    income = sum(t["amount"] for t in TRANSACTIONS if t["amount"] > 0) / 3
    spend = sum(-t["amount"] for t in expenses) / 3
    categories: dict[str, float] = {}
    for t in expenses:
        categories[t["category"]] = categories.get(t["category"], 0) + -t["amount"]
    return {
        "userId": USER_ID, "toolToken": "eval-token",
        "income": round(income), "expenses": round(spend), "savings": round(income - spend),
        "savingsRatio": round((income - spend) / income * 100, 1), "financialScore": 68,
        "transactionCount": len(TRANSACTIONS), "topCategory": max(categories, key=categories.get),
        "categorySpending": {k: round(v) for k, v in categories.items()},
        "merchantSpending": {}, "budgetAlerts": ["Food budget exceeded"], "subscriptions": ["Netflix"],
        "conversationHistory": [], "dataFrom": "2026-07-01", "dataThrough": "2026-09-30",
    }
