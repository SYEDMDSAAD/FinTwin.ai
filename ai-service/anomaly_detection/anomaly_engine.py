"""
Statistical anomaly detection for transaction streams.

Detects four anomaly classes:
  1. z_score_spike   — individual transaction far above category mean
  2. category_surge  — this month's category total spikes vs prior months
  3. large_single    — single transaction >> global average
  4. burst           — 5+ transactions on one calendar day
"""

import logging
import statistics
from collections import defaultdict
from typing import TypedDict

logger = logging.getLogger(__name__)

_Z_THRESHOLD   = 2.5   # standard deviations above category mean
_MIN_SAMPLES   = 5     # minimum transactions per category for z-score
_LARGE_RATIO   = 5.0   # multiple of global avg to flag a single tx
_SURGE_RATIO   = 1.8   # category month-on-month ratio to flag
_BURST_COUNT   = 5     # transactions in one day to flag as burst


class AnomalyResult(TypedDict):
    transaction_id: str | None
    amount: float
    category: str
    is_anomaly: bool
    reason: str
    action: str
    severity: str   # "high", "medium", "low"
    anomaly_type: str
    z_score: float


def detect_anomalies(transactions: list[dict]) -> list[AnomalyResult]:
    expenses = [t for t in transactions if float(t.get("amount", 0)) < 0]
    if len(expenses) < _MIN_SAMPLES:
        return []

    results: list[AnomalyResult] = []
    seen_ids: set = set()

    # ── pre-compute per-category lists ───────────────────────────────────
    by_category: dict[str, list[float]] = defaultdict(list)
    for t in expenses:
        cat = (t.get("category") or "Uncategorised").strip()
        by_category[cat].append(abs(float(t["amount"])))

    all_amounts = [abs(float(t["amount"])) for t in expenses]
    global_mean  = statistics.mean(all_amounts)
    global_stdev = statistics.pstdev(all_amounts) or 1.0

    # ── 1. Z-score spike per category ────────────────────────────────────
    for t in expenses:
        amount = abs(float(t.get("amount", 0)))
        cat    = (t.get("category") or "Uncategorised").strip()
        cat_amounts = by_category.get(cat, [])
        tx_id  = t.get("id")

        if len(cat_amounts) >= _MIN_SAMPLES:
            mean  = statistics.mean(cat_amounts)
            stdev = statistics.pstdev(cat_amounts) or 1.0
            ctx   = f"{cat}"
        else:
            mean  = global_mean
            stdev = global_stdev
            ctx   = "all categories"

        z = (amount - mean) / stdev
        if z <= _Z_THRESHOLD:
            continue

        severity = "high" if z >= 4.0 else ("medium" if z >= 3.0 else "low")
        merchant = t.get("merchant") or cat
        reason = (
            f"₹{round(amount):,} at {merchant} is {round(z, 1)} standard deviations "
            f"above the average ₹{round(mean):,} for {ctx}."
        )
        action = _action_for_spike(merchant, amount, mean)

        results.append(AnomalyResult(
            transaction_id=tx_id, amount=amount, category=cat,
            is_anomaly=True, reason=reason, action=action,
            severity=severity, anomaly_type="z_score_spike", z_score=round(z, 2),
        ))
        if tx_id:
            seen_ids.add(tx_id)

    # ── 2. Category monthly surge ─────────────────────────────────────────
    monthly_cat: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for t in expenses:
        date = t.get("date", "")
        month = date[:7] if date else "unknown"
        cat = (t.get("category") or "Uncategorised").strip()
        monthly_cat[month][cat] += abs(float(t["amount"]))

    months = sorted(monthly_cat.keys())
    if len(months) >= 2:
        latest_month = months[-1]
        prior_months = months[:-1]
        for cat, this_amt in monthly_cat[latest_month].items():
            prior_vals = [monthly_cat[m].get(cat, 0.0) for m in prior_months]
            prior_avg = statistics.mean(prior_vals) if prior_vals else 0
            if prior_avg < 500:
                continue
            ratio = this_amt / prior_avg
            if ratio < _SURGE_RATIO:
                continue
            severity = "high" if ratio >= 3.0 else ("medium" if ratio >= 2.3 else "low")
            reason = (
                f"{cat} spending this month is ₹{round(this_amt):,} — "
                f"{round(ratio, 1)}x the prior average of ₹{round(prior_avg):,}/month."
            )
            action = (
                f"Set a monthly cap of ₹{round(prior_avg * 1.2):,} for {cat} "
                f"and review individual transactions in this category."
            )
            results.append(AnomalyResult(
                transaction_id=None, amount=this_amt, category=cat,
                is_anomaly=True, reason=reason, action=action,
                severity=severity, anomaly_type="category_surge", z_score=0.0,
            ))

    # ── 3. Large single transaction ───────────────────────────────────────
    for t in expenses:
        tx_id  = t.get("id")
        if tx_id and tx_id in seen_ids:
            continue
        amount = abs(float(t.get("amount", 0)))
        if amount < 1000:
            continue
        ratio = amount / global_mean if global_mean > 0 else 0
        if ratio < _LARGE_RATIO:
            continue
        cat      = (t.get("category") or "Uncategorised").strip()
        merchant = t.get("merchant") or cat
        severity = "high" if ratio >= 10.0 else ("medium" if ratio >= 7.0 else "low")
        reason = (
            f"₹{round(amount):,} at {merchant} is {round(ratio, 1)}x your average "
            f"transaction size of ₹{round(global_mean):,}."
        )
        action = (
            f"Verify this charge with {merchant} directly. "
            f"If unexpected, raise a dispute with your bank within 30 days."
        )
        results.append(AnomalyResult(
            transaction_id=tx_id, amount=amount, category=cat,
            is_anomaly=True, reason=reason, action=action,
            severity=severity, anomaly_type="large_single", z_score=round(ratio, 2),
        ))

    # ── 4. Spending burst ─────────────────────────────────────────────────
    by_date: dict[str, list[dict]] = defaultdict(list)
    for t in expenses:
        date = t.get("date", "")
        if date:
            by_date[date].append(t)

    for date, txns in by_date.items():
        if len(txns) < _BURST_COUNT:
            continue
        day_total = sum(abs(float(t["amount"])) for t in txns)
        severity  = "high" if len(txns) >= 8 else "medium"
        reason = (
            f"{len(txns)} transactions totalling ₹{round(day_total):,} "
            f"were made on {date} — an unusually concentrated spending day."
        )
        action = (
            "Review each transaction from this date. "
            "Concentrated spending bursts often include impulse purchases "
            "that can be avoided with a 24-hour cooling-off rule."
        )
        results.append(AnomalyResult(
            transaction_id=None, amount=day_total, category="Multiple",
            is_anomaly=True, reason=reason, action=action,
            severity=severity, anomaly_type="burst", z_score=float(len(txns)),
        ))

    # Sort: high → medium → low, then by amount
    _rank = {"high": 0, "medium": 1, "low": 2}
    results.sort(key=lambda a: (_rank.get(a["severity"], 3), -a["amount"]))

    return results


def summarise_anomalies(anomalies: list[AnomalyResult]) -> dict:
    if not anomalies:
        return {"count": 0, "totalAmount": 0, "highSeverity": 0, "anomalies": []}
    return {
        "count":        len(anomalies),
        "totalAmount":  round(sum(a["amount"] for a in anomalies), 2),
        "highSeverity": sum(1 for a in anomalies if a["severity"] == "high"),
        "anomalies":    anomalies,
    }


def _action_for_spike(merchant: str, amount: float, avg: float) -> str:
    overage = round(amount - avg)
    return (
        f"Check if this ₹{round(amount):,} charge at {merchant} is correct. "
        f"It's ₹{overage:,} above your usual spend here. "
        f"If unrecognised, contact your bank immediately."
    )
