import logging

from utils.ollama_client import ask

logger = logging.getLogger(__name__)


def _ask_section(prompt: str, max_tokens: int = 130) -> str | None:
    try:
        return ask(prompt, max_tokens=max_tokens).strip()
    except Exception as e:
        logger.warning("Report section LLM error: %s", e)
        return None


def generate_weekly_report(data: dict) -> dict:
    income = float(data.get("income") or 0)
    expenses = float(data.get("expenses") or 0)
    savings = float(data.get("savings") or 0)
    financial_score = data.get("financialScore", 0)
    net_worth = float(data.get("netWorth") or 0)
    spending_health = data.get("spendingHealth", "N/A")
    monthly_leakage = float(data.get("monthlyLeakage") or 0)
    category_spending: dict = data.get("categorySpending") or {}
    goals: list = data.get("goals") or []

    savings_rate = round((savings / income) * 100, 1) if income > 0 else 0

    top_cats = sorted(category_spending.items(), key=lambda x: x[1], reverse=True)[:3]
    top_cats_str = ", ".join(f"{c}: ₹{round(v)}" for c, v in top_cats) if top_cats else "N/A"

    goal_count = len(goals)
    goal_summary = f"{goal_count} active goal(s)" if goal_count else "no active goals"
    if goals:
        goal_details = "; ".join(
            f"₹{g.get('targetAmount', 0)} in {g.get('durationMonths', 0)}m ({g.get('goalHealth', 'N/A')})"
            for g in goals[:3]
            if isinstance(g, dict)
        )
        if goal_details:
            goal_summary += f": {goal_details}"

    profile = (
        f"Income ₹{round(income)} | Expenses ₹{round(expenses)} | Savings ₹{round(savings)} ({savings_rate}%) | "
        f"Score {financial_score}/100 | Net worth ₹{round(net_worth)} | "
        f"Spending health: {spending_health} | Monthly leakage: ₹{round(monthly_leakage)} | "
        f"Top spending: {top_cats_str} | Goals: {goal_summary}"
    )

    summary = _ask_section(
        f"You are FinTwin AI. Write a 2-sentence executive summary for this user's weekly financial report. Use real numbers.\n"
        f"{profile}\n"
        f"Sentence 1: Overall financial health this week.\n"
        f"Sentence 2: The single most important thing to focus on.\n"
        f"Only the 2 sentences, no headers.",
        max_tokens=120,
    ) or (
        f"Your financial health score of {financial_score}/100 reflects a {savings_rate}% savings rate on ₹{round(income)} income. "
        f"Focus on reducing the ₹{round(monthly_leakage)} monthly leakage to improve your net worth of ₹{round(net_worth)}."
    )

    insights = _ask_section(
        f"You are FinTwin AI. Write 2 sharp financial insights for this user based on their data. Each insight is one sentence using actual numbers.\n"
        f"{profile}\n"
        f"Insight 1: A pattern or trend in their spending or saving.\n"
        f"Insight 2: How their goals are tracking.\n"
        f"Only the 2 sentences, no headers, no labels.",
        max_tokens=130,
    ) or (
        f"Your top expense category is {top_cats[0][0] if top_cats else 'discretionary'} at ₹{round(top_cats[0][1]) if top_cats else 0}, "
        f"which accounts for a significant share of your ₹{round(expenses)} total expenses. "
        f"With {goal_summary}, your current savings of ₹{round(savings)}/month need to be allocated strategically."
    )

    risks = _ask_section(
        f"You are FinTwin AI. Identify 2 financial risks for this user. Each risk is one sentence, specific, using actual numbers.\n"
        f"{profile}\n"
        f"Risk 1: A spending or savings risk.\n"
        f"Risk 2: A goal or net worth risk.\n"
        f"Only the 2 sentences, no headers, no labels.",
        max_tokens=120,
    ) or (
        f"A monthly leakage of ₹{round(monthly_leakage)} is silently eroding your savings capacity and could derail your financial goals over time. "
        f"With a spending health of '{spending_health}', your expense-to-income ratio leaves limited buffer for unexpected costs."
    )

    recommendations = _ask_section(
        f"You are FinTwin AI. Give 2 concrete recommendations for this user. Each is one sentence with a specific rupee amount or percentage.\n"
        f"{profile}\n"
        f"Recommendation 1: A spending cut or savings action.\n"
        f"Recommendation 2: An investment or goal action.\n"
        f"Only the 2 sentences, no headers, no labels.",
        max_tokens=130,
    ) or (
        f"Redirect ₹{round(monthly_leakage)} of monthly leakage into a recurring deposit or SIP to compound your savings over time. "
        f"Allocate at least {max(20, round(savings_rate))}% of your ₹{round(income)} income to your active goals to stay on track."
    )

    return {
        "summary": summary,
        "insights": insights,
        "risks": risks,
        "recommendations": recommendations,
        "keyMetrics": {
            "netWorth": net_worth,
            "spendingHealth": spending_health,
            "monthlyLeakage": monthly_leakage,
            "financialScore": financial_score,
        },
    }
