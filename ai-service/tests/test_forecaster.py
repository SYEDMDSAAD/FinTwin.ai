"""The expense forecast: full months only, and no trend from too few of them."""
from datetime import date

import pandas as pd

from forecasting.prophet_forecaster import _predict_next, forecast_expenses
import numpy as np


def _month(year, month, total, n=10):
    """n expense transactions in one month adding up to total."""
    return [{"date": date(year, month, d + 1).isoformat(), "amount": -total / n, "category": "Food"} for d in range(n)]


def test_two_full_months_give_their_average_not_a_trend():
    assert _predict_next(np.array([57619.0, 79529.0])) == 68574.0


def test_one_month_gives_that_month():
    assert _predict_next(np.array([40000.0])) == 40000.0


def test_a_steady_history_forecasts_about_the_same():
    pred = _predict_next(np.array([50000.0, 50000.0, 50000.0, 50000.0]))
    assert 45000 <= pred <= 55000


def test_two_full_months_and_the_current_one_never_project_a_jump():
    today = pd.Timestamp.today()
    prev2, prev1 = today - pd.DateOffset(months=2), today - pd.DateOffset(months=1)
    tx = (_month(prev2.year, prev2.month, 57619) + _month(prev1.year, prev1.month, 79529)
          + _month(today.year, today.month, 10000, n=5))          # unfinished month, left out
    out = forecast_expenses(tx)
    assert out["predictedExpenses"] == 68574.0
