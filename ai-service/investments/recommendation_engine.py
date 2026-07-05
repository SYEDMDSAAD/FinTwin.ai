import json
import logging

from utils.ollama_client import ask

logger = logging.getLogger(__name__)


def generate_investment_recommendation(data: dict) -> dict:
    # income/expenses/savings arrive as MONTHLY figures (the backend divides
    # its window totals by the months actually present before sending).
    income = float(data.get("income") or 0)
    expenses = float(data.get("expenses") or 0)
    savings = float(data.get("savings") or 0)
    financial_score = int(data.get("financialScore") or 0)
    net_worth = float(data.get("netWorth") or 0)
    # Liquid savings (stated balance / transactional flow). Falls back to net
    # worth for older callers — but net worth includes illiquid assets, so a
    # homeowner with no cash could previously skip the emergency-fund branch.
    liquid_savings = float(data.get("liquidSavings") or net_worth)
    goal_health = data.get("goalHealth") or "N/A"

    monthly_savings = round(savings, 2)

    if savings <= 0:
        result = _build_result(
            risk_profile="None",
            expected_return="0%",
            horizon="Not Applicable",
            score=45,
            monthly_savings=monthly_savings,
            recs=[],
        )
        result["summary"] = _generate_summary(income, expenses, savings, net_worth, financial_score, goal_health, result)
        return result

    # 6 months of (monthly) expenses
    emergency_fund_needed = expenses * 6
    emergency_fund_ratio = (liquid_savings / emergency_fund_needed) if emergency_fund_needed > 0 else 1.0

    if emergency_fund_ratio < 0.1:
        result = _build_result(
            risk_profile="Conservative",
            expected_return="4-6%",
            horizon="1-3 Years",
            score=45,
            monthly_savings=monthly_savings,
            recs=[
                {"asset": "Emergency Fund", "allocation": 60, "amount": round(monthly_savings * 0.60, 2),
                 "reason": f"₹{round(monthly_savings * 0.60)}/month to build your 6-month reserve of ₹{round(emergency_fund_needed)}."},
                {"asset": "Fixed Deposit", "allocation": 25, "amount": round(monthly_savings * 0.25, 2),
                 "reason": f"₹{round(monthly_savings * 0.25)}/month in FD earns 6-7% safely while your emergency buffer grows."},
                {"asset": "Liquid Fund", "allocation": 15, "amount": round(monthly_savings * 0.15, 2),
                 "reason": f"₹{round(monthly_savings * 0.15)}/month in liquid fund stays accessible if you need quick cash."},
            ],
        )
        result["summary"] = _generate_summary(income, expenses, savings, net_worth, financial_score, goal_health, result)
        return result

    if financial_score < 50:
        result = _build_result(
            risk_profile="Conservative",
            expected_return="5-7%",
            horizon="2-5 Years",
            score=45,
            monthly_savings=monthly_savings,
            recs=[
                {"asset": "Fixed Deposit", "allocation": 60, "amount": round(monthly_savings * 0.60, 2),
                 "reason": f"₹{round(monthly_savings * 0.60)}/month in FD gives guaranteed returns while your financial score of {financial_score} recovers."},
                {"asset": "Debt Funds", "allocation": 25, "amount": round(monthly_savings * 0.25, 2),
                 "reason": f"₹{round(monthly_savings * 0.25)}/month in debt funds adds 7-8% returns with low volatility."},
                {"asset": "Emergency Fund", "allocation": 15, "amount": round(monthly_savings * 0.15, 2),
                 "reason": f"₹{round(monthly_savings * 0.15)}/month tops up your safety net to improve financial resilience."},
            ],
        )
        result["summary"] = _generate_summary(income, expenses, savings, net_worth, financial_score, goal_health, result)
        return result

    if goal_health == "Critical":
        result = _build_result(
            risk_profile="Conservative",
            expected_return="5-8%",
            horizon="Until Goal Completion",
            score=45,
            monthly_savings=monthly_savings,
            recs=[
                {"asset": "Goal Funding", "allocation": 70, "amount": round(monthly_savings * 0.70, 2),
                 "reason": f"₹{round(monthly_savings * 0.70)}/month redirected to rescue your at-risk financial goals."},
                {"asset": "Debt Funds", "allocation": 30, "amount": round(monthly_savings * 0.30, 2),
                 "reason": f"₹{round(monthly_savings * 0.30)}/month in debt funds maintains stability while goals are funded."},
            ],
        )
        result["summary"] = _generate_summary(income, expenses, savings, net_worth, financial_score, goal_health, result)
        return result

    savings_rate = round((savings / income) * 100, 1) if income > 0 else 0
    monthly_income = round(income, 0)
    monthly_expenses = round(expenses, 0)

    portfolio_prompt = f"""You are a certified financial advisor in India. Return a JSON investment portfolio for this user.

Monthly income: ₹{round(monthly_income)}, Monthly expenses: ₹{round(monthly_expenses)}, Monthly savings: ₹{round(monthly_savings)} ({savings_rate}% rate)
Net worth: ₹{round(net_worth)}, Financial score: {financial_score}/100, Goal health: {goal_health}

Rules:
- riskProfile: Conservative / Moderate / Aggressive based on savings rate and score
- 4-5 Indian instruments, allocations sum to exactly 100
- Each reason: one sentence with the monthly rupee amount (allocation% of ₹{round(monthly_savings)})
- expectedReturn: realistic annual range e.g. "9-13%"
- investmentHorizon: fits the risk profile
- portfolioScore: 0-100

Return ONLY valid JSON, no markdown:
{{"riskProfile":"","expectedReturn":"","investmentHorizon":"","portfolioScore":0,"recommendations":[{{"asset":"","allocation":0,"reason":""}}]}}"""

    try:
        text = ask(portfolio_prompt, max_tokens=350)
        text = text.replace("```json", "").replace("```JSON", "").replace("```", "").strip()
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("No JSON object found in LLM response")
        result = json.loads(text[start:end + 1])
        recs = result.get("recommendations")
        if not isinstance(recs, list) or not recs:
            raise ValueError("Missing or invalid recommendations")
        result.setdefault("expectedReturn", "8-12%")
        result.setdefault("investmentHorizon", "5+ Years")
        # Bound the LLM-supplied score to a sane 0-100.
        try:
            result["portfolioScore"] = max(0, min(100, int(result.get("portfolioScore", 75))))
        except (TypeError, ValueError):
            result["portfolioScore"] = 75
        # Normalize allocations: the prompt asks for a sum of exactly 100, but
        # nothing guarantees the model complies — un-normalized allocations
        # would over- or under-commit the user's monthly savings.
        parsed_allocations = []
        for item in recs:
            try:
                parsed_allocations.append(max(0.0, float(item.get("allocation", 0) or 0)))
            except (TypeError, ValueError):
                parsed_allocations.append(0.0)
        total_allocation = sum(parsed_allocations)
        for item, allocation in zip(recs, parsed_allocations):
            if total_allocation > 0:
                allocation = allocation / total_allocation * 100
            item["allocation"] = round(allocation, 1)
            item["amount"] = round(monthly_savings * allocation / 100, 2)
    except Exception as e:
        logger.warning("Ollama portfolio generation failed, using fallback: %s", e)
        result = _build_result(
            risk_profile="Moderate",
            expected_return="8-12%",
            horizon="5+ Years",
            score=70,
            monthly_savings=monthly_savings,
            recs=[
                {"asset": "Index Funds (Nifty 50)", "allocation": 40, "amount": round(monthly_savings * 0.40, 2),
                 "reason": f"₹{round(monthly_savings * 0.40)}/month in Nifty 50 index funds captures broad market growth at minimal cost."},
                {"asset": "Debt Mutual Funds", "allocation": 25, "amount": round(monthly_savings * 0.25, 2),
                 "reason": f"₹{round(monthly_savings * 0.25)}/month in debt funds cushions the portfolio against equity volatility."},
                {"asset": "Gold ETF", "allocation": 15, "amount": round(monthly_savings * 0.15, 2),
                 "reason": f"₹{round(monthly_savings * 0.15)}/month in Gold ETF hedges against inflation and currency risk."},
                {"asset": "Fixed Deposit", "allocation": 20, "amount": round(monthly_savings * 0.20, 2),
                 "reason": f"₹{round(monthly_savings * 0.20)}/month in FD provides a guaranteed 6-7% return floor."},
            ],
        )

    result["monthlyInvestableAmount"] = monthly_savings
    result["summary"] = _generate_summary(income, expenses, savings, net_worth, financial_score, goal_health, result)
    return result


def _build_result(
    risk_profile: str,
    expected_return: str,
    horizon: str,
    score: int,
    monthly_savings: float,
    recs: list,
) -> dict:
    return {
        "riskProfile": risk_profile,
        "expectedReturn": expected_return,
        "investmentHorizon": horizon,
        "portfolioScore": score,
        "monthlyInvestableAmount": monthly_savings,
        "recommendations": recs,
    }


def _generate_summary(
    income: float,
    expenses: float,
    savings: float,
    net_worth: float,
    financial_score: int,
    goal_health: str,
    result: dict,
) -> str:
    risk_profile = result.get("riskProfile", "Moderate")
    expected_return = result.get("expectedReturn", "8-12%")
    horizon = result.get("investmentHorizon", "5+ Years")
    assets = ", ".join(r["asset"] for r in result.get("recommendations", []))
    savings_rate = round((savings / income) * 100, 1) if income > 0 else 0

    prompt = (
        f"You are a financial advisor. Write exactly 2 short sentences analyzing this investor. "
        f"No headers, no bullet points, no extra text.\n\n"
        f"{risk_profile} investor | Score: {financial_score}/100 | Monthly savings: ₹{round(savings)} ({savings_rate}%) | "
        f"Net worth: ₹{round(net_worth)} | Portfolio: {assets} | Return: {expected_return}\n\n"
        f"Sentence 1: Why this risk profile fits their numbers.\n"
        f"Sentence 2: One concrete action with a specific rupee amount."
    )

    try:
        return ask(prompt, max_tokens=100).strip()
    except Exception as e:
        logger.warning("Summary generation failed: %s", e)
        first_asset = result["recommendations"][0]["asset"] if result.get("recommendations") else "Index Funds"
        return (
            f"A {risk_profile.lower()} portfolio suits your {savings_rate}% savings rate and score of {financial_score}/100, "
            f"targeting {expected_return} over {horizon}. "
            f"Start by investing ₹{round(savings * 0.4)} of your monthly savings into {first_asset} this month."
        )
