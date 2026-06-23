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

    return f"""User Financial Profile (last 3 months):
Monthly Income:    ₹{data.get('income', 0):,}
Monthly Expenses:  ₹{data.get('expenses', 0):,}
Monthly Savings:   ₹{data.get('savings', 0):,}
Savings Ratio:     {data.get('savingsRatio', 0)}%
Financial Score:   {data.get('financialScore', 0)}/100
Top Spend Category: {data.get('topCategory', 'Unknown')}

Spending by Category:
{cat_lines}

Top Merchants:
{merch_lines}

Budget Alerts: {budget_alerts if budget_alerts else 'None'}
Recurring Subscriptions: {subscriptions if subscriptions else 'None'}"""
