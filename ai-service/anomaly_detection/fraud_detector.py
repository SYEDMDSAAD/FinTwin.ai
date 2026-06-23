"""
Rule-based fraud signal detection for Indian personal finance.

Each check returns a list of signals. The caller decides what to surface.
"""

import logging
from datetime import datetime
from typing import TypedDict

logger = logging.getLogger(__name__)

_LATE_NIGHT_START = 0   # midnight
_LATE_NIGHT_END = 5     # 5 AM
_RAPID_WINDOW_MINUTES = 10
_RAPID_COUNT_THRESHOLD = 3
_LARGE_ROUND_THRESHOLD = 10_000   # ₹10,000+


class FraudSignal(TypedDict):
    transaction_id: str | None
    signal_type: str
    description: str
    severity: str   # "low" | "medium" | "high"
    amount: float


def detect_fraud_signals(transactions: list[dict]) -> list[FraudSignal]:
    signals: list[FraudSignal] = []
    signals.extend(_check_late_night(transactions))
    signals.extend(_check_rapid_succession(transactions))
    signals.extend(_check_large_round_amounts(transactions))
    signals.extend(_check_duplicate_amounts(transactions))
    return signals


def _parse_dt(t: dict) -> datetime | None:
    raw = t.get("date") or t.get("createdAt") or ""
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(str(raw)[:19], fmt)
        except ValueError:
            continue
    return None


def _check_late_night(transactions: list[dict]) -> list[FraudSignal]:
    signals = []
    for t in transactions:
        dt = _parse_dt(t)
        if dt and (_LATE_NIGHT_START <= dt.hour < _LATE_NIGHT_END):
            amount = abs(float(t.get("amount", 0)))
            if amount > 500:
                signals.append(FraudSignal(
                    transaction_id=t.get("id"),
                    signal_type="LATE_NIGHT",
                    description=f"₹{round(amount)} transaction at {dt.strftime('%H:%M')} (late-night window)",
                    severity="medium",
                    amount=amount,
                ))
    return signals


def _check_rapid_succession(transactions: list[dict]) -> list[FraudSignal]:
    timed = []
    for t in transactions:
        dt = _parse_dt(t)
        if dt:
            timed.append((dt, t))

    timed.sort(key=lambda x: x[0])
    signals = []

    for i in range(len(timed)):
        window = [timed[i]]
        for j in range(i + 1, len(timed)):
            delta = (timed[j][0] - timed[i][0]).total_seconds() / 60
            if delta <= _RAPID_WINDOW_MINUTES:
                window.append(timed[j])
            else:
                break
        if len(window) >= _RAPID_COUNT_THRESHOLD:
            total = sum(abs(float(t.get("amount", 0))) for _, t in window)
            signals.append(FraudSignal(
                transaction_id=timed[i][1].get("id"),
                signal_type="RAPID_SUCCESSION",
                description=f"{len(window)} transactions totalling ₹{round(total)} within {_RAPID_WINDOW_MINUTES} minutes",
                severity="high",
                amount=total,
            ))
            break  # report once per cluster
    return signals


def _check_large_round_amounts(transactions: list[dict]) -> list[FraudSignal]:
    signals = []
    for t in transactions:
        amount = abs(float(t.get("amount", 0)))
        if amount >= _LARGE_ROUND_THRESHOLD and amount % 1000 == 0:
            signals.append(FraudSignal(
                transaction_id=t.get("id"),
                signal_type="LARGE_ROUND_AMOUNT",
                description=f"Suspiciously round large amount: ₹{round(amount)}",
                severity="low",
                amount=amount,
            ))
    return signals


def _check_duplicate_amounts(transactions: list[dict]) -> list[FraudSignal]:
    seen: dict[tuple, list] = {}
    for t in transactions:
        amount = abs(float(t.get("amount", 0)))
        merchant = (t.get("merchant") or t.get("description") or "").strip().lower()
        key = (round(amount, 2), merchant)
        seen.setdefault(key, []).append(t)

    signals = []
    for (amount, merchant), group in seen.items():
        if len(group) >= 2 and merchant:
            signals.append(FraudSignal(
                transaction_id=group[0].get("id"),
                signal_type="DUPLICATE_TRANSACTION",
                description=f"₹{round(amount)} charged {len(group)}x by '{merchant}'",
                severity="medium",
                amount=amount * len(group),
            ))
    return signals
