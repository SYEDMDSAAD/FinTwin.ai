import logging

import pandas as pd
from xgboost import XGBRegressor

logger = logging.getLogger(__name__)

_MIN_TRANSACTIONS = 5
_MIN_MONTHS_FOR_MODEL = 3


def forecast_spending(transactions: list[dict]) -> dict:
    try:
        expenses = [t for t in transactions if float(t.get("amount", 0)) < 0]
        incomes = [t for t in transactions if float(t.get("amount", 0)) > 0]

        if len(expenses) < _MIN_TRANSACTIONS:
            return {
                "predictedExpenses": 0,
                "predictedSavings": 0,
                "expenseGrowth": 0,
                "insight": "Not enough transaction data available for forecasting.",
            }

        df = pd.DataFrame(expenses)
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
        df["date"] = pd.to_datetime(df["date"], format="mixed", dayfirst=True, errors="coerce")
        df = df.dropna(subset=["date", "amount"])

        monthly = (
            df.groupby(df["date"].dt.to_period("M"))["amount"]
            .sum()
            .abs()
            .reset_index()
        )
        monthly.columns = ["year_month", "amount"]
        monthly = monthly.sort_values("year_month").reset_index(drop=True)

        historical_average = float(monthly["amount"].mean())

        if len(monthly) < _MIN_MONTHS_FOR_MODEL:
            predicted_expenses = round(historical_average, 2)
        else:
            monthly["month_index"] = range(1, len(monthly) + 1)
            X = monthly[["month_index"]]
            y = monthly["amount"]

            model = XGBRegressor(
                n_estimators=100,
                max_depth=3,
                learning_rate=0.1,
                objective="reg:squarederror",
            )
            model.fit(X, y)

            next_idx = pd.DataFrame({"month_index": [len(monthly) + 1]})
            predicted_expenses = float(model.predict(next_idx)[0])
            predicted_expenses = max(predicted_expenses, historical_average * 0.5)
            predicted_expenses = round(predicted_expenses, 2)

        avg_income = 0.0
        if incomes:
            income_df = pd.DataFrame(incomes)
            income_df["amount"] = pd.to_numeric(income_df["amount"], errors="coerce")
            income_df["date"] = pd.to_datetime(income_df["date"], format="mixed", dayfirst=True, errors="coerce")
            income_df = income_df.dropna(subset=["date", "amount"])
            if not income_df.empty:
                monthly_income = (
                    income_df.groupby(income_df["date"].dt.to_period("M"))["amount"]
                    .sum()
                    .reset_index()
                )
                avg_income = float(monthly_income["amount"].mean())

        predicted_savings = round(max(avg_income - predicted_expenses, 0), 2)

        expense_growth = (
            round(((predicted_expenses - historical_average) / historical_average) * 100, 2)
            if historical_average > 0
            else 0.0
        )

        if expense_growth > 15:
            insight = "Spending is projected to rise significantly next month. Consider reducing discretionary expenses."
        elif expense_growth > 5:
            insight = "A moderate increase in spending is expected next month."
        elif expense_growth < -5:
            insight = "Spending is expected to decrease. Your financial habits appear to be improving."
        else:
            insight = "Spending is expected to remain relatively stable next month."

        return {
            "predictedExpenses": predicted_expenses,
            "predictedSavings": predicted_savings,
            "expenseGrowth": expense_growth,
            "insight": insight,
        }

    except Exception as e:
        logger.exception("Forecast error: %s", e)
        return {
            "predictedExpenses": 0,
            "predictedSavings": 0,
            "expenseGrowth": 0,
            "insight": "Forecasting failed due to an unexpected error.",
        }
