"""
Financial health risk analysis.

Produces a structured risk report from aggregated financial metrics.
Each risk item has a severity level and a suggested action.
"""

from typing import TypedDict


class RiskItem(TypedDict):
    area: str
    severity: str      # "low" | "medium" | "high" | "critical"
    observation: str
    suggestion: str


class RiskReport(TypedDict):
    overall_risk: str
    score: int          # 0–100 (higher = healthier)
    risks: list[RiskItem]


def analyse_financial_risk(
    income: float,
    expenses: float,
    savings: float,
    net_worth: float,
    financial_score: int,
    budget_utilization: dict[str, float] | None = None,
    active_goal_count: int = 0,
) -> RiskReport:
    risks: list[RiskItem] = []
    penalty = 0

    # 1. Expense-to-income ratio
    if income > 0:
        expense_ratio = expenses / income
        if expense_ratio >= 0.95:
            risks.append(RiskItem(
                area="Expense Ratio",
                severity="critical",
                observation=f"Expenses are {round(expense_ratio * 100)}% of income — virtually no buffer.",
                suggestion="Cut at least one major discretionary category immediately.",
            ))
            penalty += 30
        elif expense_ratio >= 0.80:
            risks.append(RiskItem(
                area="Expense Ratio",
                severity="high",
                observation=f"Expenses consume {round(expense_ratio * 100)}% of income.",
                suggestion="Target < 70% expense ratio. Identify top 2 categories to reduce.",
            ))
            penalty += 20
        elif expense_ratio >= 0.65:
            risks.append(RiskItem(
                area="Expense Ratio",
                severity="medium",
                observation=f"Expenses at {round(expense_ratio * 100)}% of income — modest savings room.",
                suggestion="Automate savings before expenses to protect your buffer.",
            ))
            penalty += 10

    # 2. Savings rate
    savings_rate = (savings / income) if income > 0 else 0
    if savings_rate < 0.05:
        risks.append(RiskItem(
            area="Savings Rate",
            severity="high",
            observation=f"Savings rate is only {round(savings_rate * 100, 1)}%.",
            suggestion="Aim for a minimum 10% savings rate — reduce subscriptions and food delivery.",
        ))
        penalty += 20
    elif savings_rate < 0.15:
        risks.append(RiskItem(
            area="Savings Rate",
            severity="medium",
            observation=f"Savings rate of {round(savings_rate * 100, 1)}% is below the recommended 20%.",
            suggestion="Increase SIP or recurring deposit by ₹{} to reach 20%.".format(
                round((0.20 - savings_rate) * income)
            ),
        ))
        penalty += 10

    # 3. Emergency fund coverage (6× monthly expenses)
    monthly_expenses = expenses / 3 if expenses > 0 else 1
    emergency_coverage = net_worth / (monthly_expenses * 6) if monthly_expenses > 0 else 0
    if emergency_coverage < 0.25:
        risks.append(RiskItem(
            area="Emergency Fund",
            severity="critical",
            observation=f"Emergency fund covers only {round(emergency_coverage * 6, 1)} months of expenses.",
            suggestion=f"Build ₹{round(monthly_expenses * 6)} reserve. Redirect discretionary spend to liquid fund.",
        ))
        penalty += 25
    elif emergency_coverage < 0.75:
        risks.append(RiskItem(
            area="Emergency Fund",
            severity="medium",
            observation=f"Emergency fund covers {round(emergency_coverage * 6, 1)} months. Target is 6.",
            suggestion="Top up liquid fund or savings account by ₹{} over 3 months.".format(
                round(monthly_expenses * (6 - emergency_coverage * 6))
            ),
        ))
        penalty += 10

    # 4. Budget utilization per category
    if budget_utilization:
        for category, usage_pct in budget_utilization.items():
            if usage_pct >= 100:
                risks.append(RiskItem(
                    area=f"Budget: {category}",
                    severity="high",
                    observation=f"{category} budget exceeded ({round(usage_pct)}% utilised).",
                    suggestion=f"Pause {category} spending for the rest of the month.",
                ))
                penalty += 10
            elif usage_pct >= 85:
                risks.append(RiskItem(
                    area=f"Budget: {category}",
                    severity="medium",
                    observation=f"{category} budget at {round(usage_pct)}% — will likely exceed limit.",
                    suggestion=f"Limit {category} to ₹ remaining in budget this month.",
                ))
                penalty += 5

    # 5. Financial score
    if financial_score < 40:
        risks.append(RiskItem(
            area="Financial Score",
            severity="high",
            observation=f"Financial score of {financial_score}/100 signals poor overall health.",
            suggestion="Focus on reducing expenses and building consistent savings to recover score.",
        ))
        penalty += 15
    elif financial_score < 60:
        risks.append(RiskItem(
            area="Financial Score",
            severity="medium",
            observation=f"Financial score of {financial_score}/100 has room for improvement.",
            suggestion="Reduce top spending category and increase savings rate by 5%.",
        ))
        penalty += 5

    health_score = max(0, 100 - penalty)

    if health_score >= 80:
        overall = "Low"
    elif health_score >= 60:
        overall = "Moderate"
    elif health_score >= 40:
        overall = "High"
    else:
        overall = "Critical"

    return RiskReport(overall_risk=overall, score=health_score, risks=risks)
