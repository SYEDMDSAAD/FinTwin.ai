"""
Goal success probability and budget risk scoring.

Replaced the original fake XGBoost (trained on 7 hardcoded rows) with direct
mathematical formulas. The outputs are identical in shape but now reflect the
user's actual numbers rather than a memorised lookup table.
"""

import math


def predict_goal_success(
    income: float,
    expenses: float,
    savings: float,
    target_amount: float,
    duration_months: int,
) -> dict:
    duration_months = max(duration_months, 1)
    monthly_target = target_amount / duration_months

    if monthly_target <= 0:
        return {"successProbability": 100.0, "risk": "Low"}

    ratio = savings / monthly_target

    # Logistic curve: 50% at ratio=0.75, ~95% at ratio=1.5, ~15% at ratio=0.3
    probability = round(100 / (1 + math.exp(-4.0 * (ratio - 0.75))), 1)
    probability = max(5.0, min(99.0, probability))

    if probability >= 85:
        risk = "Low"
    elif probability >= 70:
        risk = "Moderate"
    elif probability >= 50:
        risk = "High"
    else:
        risk = "Critical"

    return {"successProbability": probability, "risk": risk}


def predict_budget_risk(spent: float, limit_amount: float) -> str:
    if limit_amount <= 0:
        return "Unknown"

    usage_pct = (spent / limit_amount) * 100

    if usage_pct >= 100:
        return "Exceeded"
    if usage_pct >= 90:
        return "Critical"
    if usage_pct >= 75:
        return "High"
    if usage_pct >= 50:
        return "Warning"
    return "Safe"
