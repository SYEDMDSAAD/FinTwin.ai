"""
Centralized prompt-building utilities shared across chatbot advisors.
"""

from typing import Any


def format_category_lines(category_spending: dict[str, float]) -> str:
    if not category_spending:
        return "  No data"
    return "\n".join(
        f"  - {k}: ₹{round(v)}"
        for k, v in sorted(category_spending.items(), key=lambda x: x[1], reverse=True)
    )


def format_merchant_lines(merchant_spending: dict[str, float], top_n: int = 5) -> str:
    if not merchant_spending:
        return "  No data"
    return "\n".join(
        f"  - {k}: ₹{round(v)}"
        for k, v in sorted(merchant_spending.items(), key=lambda x: x[1], reverse=True)[:top_n]
    )


def format_history_block(conv_history: list[dict[str, Any]], last_n: int = 3) -> str:
    if not conv_history:
        return ""
    lines = "\n".join(
        f"  User: {h.get('message', '')}\n  AI: {h.get('reply', '')[:120]}..."
        for h in conv_history[-last_n:]
    )
    return f"\nPrevious Conversation:\n{lines}"


def build_financial_context(data: dict[str, Any]) -> str:
    cat_lines = format_category_lines(data.get("categorySpending", {}))
    merch_lines = format_merchant_lines(data.get("merchantSpending", {}))
    budget_alerts = data.get("budgetAlerts", [])
    subscriptions = data.get("subscriptions", [])

    # NOTE: income/expenses/savings are MONTHLY AVERAGES; the category and
    # merchant figures are 3-MONTH TOTALS — labeled explicitly so the model
    # never compares them against each other directly.
    return f"""User Financial Profile:
Monthly Income (avg):    ₹{data.get('income', 0):,}
Monthly Expenses (avg):  ₹{data.get('expenses', 0):,}
Monthly Savings (avg):   ₹{data.get('savings', 0):,}
Savings Ratio:     {data.get('savingsRatio', 0)}%
Financial Score:   {data.get('financialScore', 0)}/100
Top Spend Category: {data.get('topCategory', 'Unknown')}

Spending by Category (3-month TOTALS, not monthly):
{cat_lines}

Top Merchants (3-month TOTALS, not monthly):
{merch_lines}

Budget Alerts: {budget_alerts if budget_alerts else 'None'}
Recurring Subscriptions: {subscriptions if subscriptions else 'None'}"""


def _period_line(data: dict[str, Any]) -> str:
    """
    What the figures cover. Statements are often imported months after the
    fact, so "this month" for the app can be months ago for the user — an
    answer that doesn't say so reads as today's position.
    """
    through = data.get("dataThrough")
    if not through:
        return "\n(No transactions recorded yet.)"
    return (f"\nFigures below cover {data.get('dataFrom') or '?'} to {through} — "
            f"the newest transactions on record. Say the period when it matters; "
            f"never present it as today's position.")


def build_base_context(data: dict[str, Any]) -> str:
    """
    Compact snapshot for the tool-calling copilot. Only headline figures —
    details (transactions, budgets, goals, net worth) are fetched on demand
    through tools, never pre-attached.
    """
    cat_lines = format_category_lines(data.get("categorySpending", {}))
    return f"""User Financial Snapshot:{_period_line(data)}
Monthly Income (avg):   ₹{data.get('income', 0):,}
Monthly Expenses (avg): ₹{data.get('expenses', 0):,}
Monthly Savings (avg):  ₹{data.get('savings', 0):,}
Savings Ratio:          {data.get('savingsRatio', 0)}%
Financial Score:        {data.get('financialScore', 0)}/100

Spending by Category (3-month TOTALS, not monthly):
{cat_lines}"""
