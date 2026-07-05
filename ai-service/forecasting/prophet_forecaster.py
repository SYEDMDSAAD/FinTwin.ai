"""
Expense forecaster using statsforecast AutoTheta.

AutoTheta outperforms Prophet on short monthly series (the M3/M4 competition
benchmark case that matches personal finance data — sparse, monthly, no
multi-year seasonality). It also has no compilation step, so it's 10-100x
faster than Prophet on small data.

Fallback chain:
  1. AutoTheta  (statsforecast)
  2. Simple linear trend  (numpy — always available)
"""

import logging

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def _drop_partial_current_month(monthly: pd.DataFrame) -> pd.DataFrame:
    """Exclude the still-incomplete current month from the training series —
    a half-elapsed month reads as a spending drop and drags the forecast
    down. Kept only when it's the sole data point."""
    if len(monthly) < 2:
        return monthly
    current_period = pd.Timestamp.today().to_period("M")
    mask = monthly["ds"].dt.to_period("M") != current_period
    filtered = monthly[mask].reset_index(drop=True)
    return filtered if not filtered.empty else monthly

_MIN_TRANSACTIONS = 5
_MIN_MONTHLY_POINTS = 2


def forecast_expenses(transactions: list[dict]) -> dict:
    try:
        expenses = [t for t in transactions if float(t.get("amount", 0)) < 0]
        incomes  = [t for t in transactions if float(t.get("amount", 0)) > 0]

        if len(expenses) < _MIN_TRANSACTIONS:
            return _response(0, 0, 0, "Not enough transaction data available for forecasting.")

        df = pd.DataFrame(expenses)
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
        df["ds"] = pd.to_datetime(df["date"], format="mixed", dayfirst=True, errors="coerce")
        df = df.dropna(subset=["ds", "amount"])
        df["y"] = df["amount"].abs()

        monthly = (
            df.groupby(pd.Grouper(key="ds", freq="ME"))["y"]
            .sum()
            .reset_index()
        )
        monthly = monthly[monthly["y"] > 0].reset_index(drop=True)
        monthly = _drop_partial_current_month(monthly)

        historical_average = float(monthly["y"].mean()) if not monthly.empty else 0.0

        if len(monthly) < _MIN_MONTHLY_POINTS:
            return _response(
                round(historical_average, 2), 0, 0,
                "Limited history — forecast based on average spending.",
            )

        y = monthly["y"].to_numpy(dtype=float)
        predicted_expenses = _predict_next(y)
        predicted_expenses = max(predicted_expenses, 0.0)

        avg_income = _monthly_avg_income(incomes)
        # Negative savings = on track to overspend — the most important signal
        # a forecast can give; flooring at 0 hid it. Zero only when there's no
        # income data to subtract from.
        predicted_savings = (
            round(avg_income - predicted_expenses, 2) if avg_income > 0 else 0.0
        )

        expense_growth = (
            round(((predicted_expenses - historical_average) / historical_average) * 100, 2)
            if historical_average > 0 else 0.0
        )

        if expense_growth > 15:
            insight = "Spending is projected to rise significantly next month. Consider reducing discretionary expenses."
        elif expense_growth > 5:
            insight = "A moderate increase in spending is expected next month."
        elif expense_growth < -5:
            insight = "Spending is expected to decrease. Your financial habits appear to be improving."
        else:
            insight = "Spending is expected to remain relatively stable next month."

        return _response(round(predicted_expenses, 2), predicted_savings, expense_growth, insight)

    except Exception as e:
        logger.exception("Forecast error: %s", e)
        return _response(0, 0, 0, "Forecasting failed due to an unexpected error.")


def _predict_next(y: np.ndarray) -> float:
    try:
        from statsforecast.models import AutoTheta

        model = AutoTheta(season_length=1)
        model.fit(y=y)
        pred = model.predict(h=1)
        return float(pred["mean"][0])
    except Exception as e:
        logger.warning("AutoTheta failed, using linear trend fallback: %s", e)
        return _linear_trend_next(y)


def _linear_trend_next(y: np.ndarray) -> float:
    x = np.arange(len(y), dtype=float)
    coeffs = np.polyfit(x, y, deg=1)
    return float(np.polyval(coeffs, len(y)))


def _monthly_avg_income(incomes: list[dict]) -> float:
    if not incomes:
        return 0.0
    try:
        inc_df = pd.DataFrame(incomes)
        inc_df["amount"] = pd.to_numeric(inc_df["amount"], errors="coerce")
        inc_df["ds"] = pd.to_datetime(inc_df["date"], format="mixed", dayfirst=True, errors="coerce")
        inc_df = inc_df.dropna(subset=["ds", "amount"])
        if inc_df.empty:
            return 0.0
        monthly = inc_df.groupby(pd.Grouper(key="ds", freq="ME"))["amount"].sum().reset_index()
        monthly = monthly[monthly["amount"] > 0].reset_index(drop=True)
        monthly = _drop_partial_current_month(monthly)
        if monthly.empty:
            return 0.0
        return float(monthly["amount"].mean())
    except Exception:
        return 0.0


def _response(
    predicted_expenses: float,
    predicted_savings: float,
    expense_growth: float,
    insight: str,
) -> dict:
    return {
        "predictedExpenses": predicted_expenses,
        "predictedSavings": predicted_savings,
        "expenseGrowth": expense_growth,
        "insight": insight,
    }
