import logging

from utils.ollama_client import ask

logger = logging.getLogger(__name__)


def generate_goal_plan(data: dict) -> str:
    title = data.get("title", "Goal")
    target = float(data.get("targetAmount") or 0)
    months = max(int(data.get("durationMonths") or 1), 1)
    income = float(data.get("income") or 0)
    expenses = float(data.get("expenses") or 0)
    savings = float(data.get("savings") or 0)
    monthly_target = float(data.get("monthlyTarget") or 0)
    probability = float(data.get("successProbability") or 0)
    categories: dict = data.get("categorySpending") or {}
    other_goals: list = data.get("otherGoals") or []

    if monthly_target <= 0:
        monthly_target = target / months

    top_cats = sorted(categories.items(), key=lambda x: x[1], reverse=True)[:3]
    top_cats_str = ", ".join(f"{c}: ₹{round(v)}" for c, v in top_cats) if top_cats else "N/A"

    gap = monthly_target - savings
    feasibility = "feasible" if savings >= monthly_target else f"requires ₹{round(gap)} more per month"

    other_goals_section = ""
    if other_goals:
        total_other_monthly = sum(float(g.get("monthlyTarget") or 0) for g in other_goals)
        total_all_monthly = monthly_target + total_other_monthly
        other_goals_lines = "\n".join(
            f"  - {g.get('title', 'Goal')}: ₹{round(float(g.get('targetAmount') or 0))} "
            f"in {g.get('durationMonths', 0)} months (₹{round(float(g.get('monthlyTarget') or 0))}/month)"
            for g in other_goals
        )
        other_goals_section = (
            f"\nOther active goals:\n{other_goals_lines}\n"
            f"Total monthly savings needed across ALL goals: ₹{round(total_all_monthly)}"
        )

    multi_goal_note = (
        f"  Since the user has multiple goals, include one point on how to prioritise or "
        f"split ₹{round(savings)} of monthly savings across all goals."
        if other_goals else ""
    )

    prompt = (
        f"You are a financial coach. Give a concise savings plan for this goal.\n\n"
        f"Goal: {title}\n"
        f"Target: ₹{round(target)} in {months} months (₹{round(monthly_target)}/month needed)\n"
        f"Monthly income: ₹{round(income)}, expenses: ₹{round(expenses)}, current savings: ₹{round(savings)}\n"
        f"Success probability: {round(probability)}% — {feasibility}\n"
        f"Top spending: {top_cats_str}{other_goals_section}\n\n"
        f"Write 3 to 4 short bullet points (no headers, no markdown). "
        f"Each point must be one sentence giving specific actionable advice using the actual numbers above.{multi_goal_note}"
    )

    try:
        return ask(prompt, max_tokens=220)
    except Exception as e:
        logger.error("Goal planner LLM error: %s", e)
        top_cat_name = top_cats[0][0] if top_cats else "discretionary"
        if savings >= monthly_target:
            stretch = "achievable"
        else:
            stretch = f"a stretch — trim {top_cat_name} spending to close the gap"
        return (
            f"Save ₹{round(monthly_target)} per month to reach ₹{round(target)} in {months} months. "
            f"Your current savings of ₹{round(savings)}/month make this {stretch}. "
            f"Automate your savings transfer on payday to stay consistent."
        )
