"""Investment allocation guidance: rules decide, the model only explains.

Every allocation here is chosen by rules and described by asset class (equity
index funds, debt funds, gold, deposits), never by a named scheme, stock or
fund house. Naming instruments, and inventing return figures or scores, is
what the model did when it wrote the portfolio itself: for an Indian finance
app that is close to personal investment advice, which is SEBI-regulated, and
a 3B model's numbers were never grounded in anything. The model now writes
only the two-sentence summary, from bullet facts, and the summary is checked
with the same grounding guard as the spending coach before it is shown.
"""
import logging
import re

from utils.grounding import amounts, figure_owners, is_grounded
from utils.llm_client import ask

logger = logging.getLogger(__name__)

# The backend waits 20 s for this call; the summary must finish well inside it.
LLM_TIMEOUT_S = 15.0

# Long-run allocations per profile, by asset class. Returns are illustrative
# long-run ranges for the mix (the page labels them so), not forecasts.
_PROFILES = {
    "Moderate": {
        "expected_return": "8-11%",
        "horizon": "5+ Years",
        "mix": [
            ("Equity index funds", 45, "broad-market equity at low cost, for long-term growth"),
            ("Debt funds", 30, "steadier returns that cushion equity swings"),
            ("Gold", 10, "a hedge that tends to hold value when equities fall"),
            ("Fixed deposit / liquid fund", 15, "money you can reach quickly without market risk"),
        ],
    },
    "Aggressive": {
        "expected_return": "10-13%",
        "horizon": "7+ Years",
        "mix": [
            ("Equity index funds", 60, "broad-market equity at low cost, for long-term growth"),
            ("Debt funds", 20, "steadier returns that cushion equity swings"),
            ("Gold", 10, "a hedge that tends to hold value when equities fall"),
            ("Fixed deposit / liquid fund", 10, "money you can reach quickly without market risk"),
        ],
    },
}

# Holding types (as the portfolio stores them) that count as equity when
# judging whether an existing portfolio is already equity-heavy.
_EQUITY_TYPES = {"stocks", "mutual fund", "ipo", "equity"}
_EQUITY_HEAVY_PCT = 70
_REBALANCE_POINTS = 10

# A summary naming a fund house, bank, broker or scheme is product advice,
# whatever its numbers say, so it is rejected like an ungrounded one.
_PRODUCT_NAMES = re.compile(
    r"\b(scheme|AMC|fund house|Ltd|Limited|Parag|Parikh|Axis|HDFC|ICICI|SBI|Nippon|Mirae|"
    r"Kotak|Tata|Aditya|Birla|UTI|Quant|Motilal|Oswal|DSP|Franklin|Edelweiss|Zerodha|"
    r"Groww|Upstox|Paytm Money|Coin|Kuvera|Nifty\s?Bees)\b",
    re.IGNORECASE,
)


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
    # `is not None` so a legitimate zero balance doesn't trigger the fallback.
    raw_liquid = data.get("liquidSavings")
    liquid_savings = float(raw_liquid) if raw_liquid is not None else net_worth
    goal_health = data.get("goalHealth") or "N/A"
    portfolio_value = float(data.get("portfolioValue") or 0)
    current_allocation = data.get("currentAllocation") or {}

    monthly_savings = round(savings, 2)
    savings_rate = round((savings / income) * 100, 1) if income > 0 else 0
    # 6 months of (monthly) expenses
    emergency_fund_needed = expenses * 6
    emergency_fund_ratio = (liquid_savings / emergency_fund_needed) if emergency_fund_needed > 0 else 1.0

    facts = {
        "savings_rate": savings_rate, "financial_score": financial_score,
        "liquid_savings": liquid_savings, "emergency_fund_needed": emergency_fund_needed,
        "portfolio_value": portfolio_value, "current_allocation": current_allocation,
    }

    if savings <= 0:
        result = _build_result("None", "0%", "Not Applicable", 45, monthly_savings, [])
        return _with_summary(result, facts)

    # Below ~3 months of expenses (half the 6-month target), the buffer comes
    # first — standard advisory practice funds the emergency reserve before
    # committing savings to market-linked instruments.
    if emergency_fund_ratio < 0.5:
        result = _build_result(
            "Conservative", "4-6%", "1-3 Years", 45, monthly_savings,
            [
                {"asset": "Emergency Fund", "allocation": 60, "amount": round(monthly_savings * 0.60, 2),
                 "reason": f"₹{round(monthly_savings * 0.60)}/month to build your 6-month reserve of ₹{round(emergency_fund_needed)}."},
                {"asset": "Fixed Deposit", "allocation": 25, "amount": round(monthly_savings * 0.25, 2),
                 "reason": f"₹{round(monthly_savings * 0.25)}/month in fixed deposits stays safe while your emergency buffer grows."},
                {"asset": "Liquid Fund", "allocation": 15, "amount": round(monthly_savings * 0.15, 2),
                 "reason": f"₹{round(monthly_savings * 0.15)}/month in a liquid fund stays accessible if you need quick cash."},
            ],
        )
        return _with_summary(result, facts)

    if financial_score < 50:
        result = _build_result(
            "Conservative", "5-7%", "2-5 Years", 45, monthly_savings,
            [
                {"asset": "Fixed Deposit", "allocation": 60, "amount": round(monthly_savings * 0.60, 2),
                 "reason": f"₹{round(monthly_savings * 0.60)}/month in fixed deposits keeps returns predictable while your financial score of {financial_score} recovers."},
                {"asset": "Debt Funds", "allocation": 25, "amount": round(monthly_savings * 0.25, 2),
                 "reason": f"₹{round(monthly_savings * 0.25)}/month in debt funds adds steadier returns with low volatility."},
                {"asset": "Emergency Fund", "allocation": 15, "amount": round(monthly_savings * 0.15, 2),
                 "reason": f"₹{round(monthly_savings * 0.15)}/month tops up your safety net to improve financial resilience."},
            ],
        )
        return _with_summary(result, facts)

    if goal_health == "Critical":
        result = _build_result(
            "Conservative", "5-8%", "Until Goal Completion", 45, monthly_savings,
            [
                {"asset": "Goal Funding", "allocation": 70, "amount": round(monthly_savings * 0.70, 2),
                 "reason": f"₹{round(monthly_savings * 0.70)}/month redirected to rescue your at-risk financial goals."},
                {"asset": "Debt Funds", "allocation": 30, "amount": round(monthly_savings * 0.30, 2),
                 "reason": f"₹{round(monthly_savings * 0.30)}/month in debt funds maintains stability while goals are funded."},
            ],
        )
        return _with_summary(result, facts)

    profile = _profile(financial_score, savings_rate, emergency_fund_ratio)
    mix = _complement(_PROFILES[profile]["mix"], current_allocation)
    recs = [
        {"asset": asset, "allocation": allocation,
         "amount": round(monthly_savings * allocation / 100, 2),
         "reason": f"₹{round(monthly_savings * allocation / 100)}/month ({allocation}%): {why}."}
        for asset, allocation, why in mix
    ]
    result = _build_result(
        profile, _PROFILES[profile]["expected_return"], _PROFILES[profile]["horizon"],
        _portfolio_score(financial_score, savings_rate, emergency_fund_ratio), monthly_savings, recs,
    )
    return _with_summary(result, facts)


def _profile(financial_score: int, savings_rate: float, emergency_ratio: float) -> str:
    """Aggressive only when every cushion is in place; Moderate otherwise."""
    if financial_score >= 75 and savings_rate >= 30 and emergency_ratio >= 1.0:
        return "Aggressive"
    return "Moderate"


def _portfolio_score(financial_score: int, savings_rate: float, emergency_ratio: float) -> int:
    """How ready this user is to invest, 0-100, from three measured inputs.

    40% financial score, 40% savings rate (40% or more scores full), 20%
    emergency-fund coverage (a full 6 months scores full). Computed, never
    taken from the model, so the same data always gives the same score.
    """
    rate_part = min(max(savings_rate, 0) / 40, 1.0) * 100
    buffer_part = min(max(emergency_ratio, 0), 1.0) * 100
    return max(0, min(100, round(0.4 * financial_score + 0.4 * rate_part + 0.2 * buffer_part)))


def _equity_share(current_allocation: dict) -> float:
    return sum(float(v or 0) for k, v in current_allocation.items() if str(k).lower() in _EQUITY_TYPES)


def _complement(mix: list, current_allocation: dict) -> list:
    """Lean new money away from what the existing portfolio already overweights.

    An equity-heavy portfolio moves some of the new equity share into debt,
    so fresh savings rebalance rather than concentrate further.
    """
    if not current_allocation or _equity_share(current_allocation) < _EQUITY_HEAVY_PCT:
        return list(mix)
    out = []
    for asset, allocation, why in mix:
        if asset == "Equity index funds":
            out.append((asset, allocation - _REBALANCE_POINTS,
                        why + ", reduced because your portfolio is already mostly equity"))
        elif asset == "Debt funds":
            out.append((asset, allocation + _REBALANCE_POINTS,
                        why + ", increased to balance your equity-heavy portfolio"))
        else:
            out.append((asset, allocation, why))
    return out


def _build_result(risk_profile: str, expected_return: str, horizon: str, score: int,
                  monthly_savings: float, recs: list) -> dict:
    return {
        "riskProfile": risk_profile,
        "expectedReturn": expected_return,
        "investmentHorizon": horizon,
        "portfolioScore": score,
        "monthlyInvestableAmount": monthly_savings,
        "recommendations": recs,
    }


# ── Summary: the model's only job, grounded ─────────────────────────────────

def _facts_block(result: dict, facts: dict) -> tuple[str, str]:
    """(all FACTS lines, the lines whose figures may be owned).

    Only the savings-rate line and the allocation lines feed figure_owners():
    they are the lines where a percentage belongs to a named subject. The
    other lines would make their leading word ("Monthly") the owner of their
    figure — the same split the goal planner uses.
    """
    lines = [
        f"- Risk profile: {result['riskProfile']}.",
        f"- Monthly savings available to invest: ₹{round(result['monthlyInvestableAmount']):,}.",
    ]
    rate_line = f"- Savings rate: {facts['savings_rate']:g}%. Financial score: {facts['financial_score']}/100."
    lines.append(rate_line)
    if facts["emergency_fund_needed"] > 0:
        lines.append(f"- Emergency fund: ₹{round(facts['liquid_savings']):,} saved of "
                     f"₹{round(facts['emergency_fund_needed']):,} recommended (6 months of expenses).")
    if facts["portfolio_value"] > 0 and facts["current_allocation"]:
        mix = ", ".join(f"{k} {round(float(v))}%" for k, v in facts["current_allocation"].items())
        lines.append(f"- Existing portfolio: ₹{round(facts['portfolio_value']):,} ({mix}).")
    else:
        lines.append("- Existing portfolio: none; this is a first-time investor.")
    allocation = [
        f"- {r['asset']}: {r['allocation']}% of savings, ₹{round(r['amount']):,}/month."
        for r in result["recommendations"]
    ]
    return "\n".join(lines + allocation), "\n".join([rate_line] + allocation)


def _summary_prompt(facts_block: str) -> str:
    return f"""You are explaining an investment allocation to an Indian user. The allocation below is already decided by rules. Explain it; do not change it.

FACTS
{facts_block}

RULES
- Never write a number or a percentage that does not appear in FACTS.
- Never name a specific fund, scheme, stock, bank, broker or fund house. Talk about asset classes only.
- Never promise or predict returns.

Write exactly 2 short sentences, plain text, no headers or bullets:
Sentence 1: why this risk profile fits their numbers.
Sentence 2: the first thing to do this month, using a figure from FACTS."""


def _computed_summary(result: dict, facts: dict) -> str:
    profile = result["riskProfile"]
    recs = result["recommendations"]
    if profile == "None" or not recs:
        return ("There is nothing left over to invest on the figures recorded. "
                "Closing the gap between income and spending comes before investing.")
    first = recs[0]
    return (f"A {profile.lower()} allocation fits a {facts['savings_rate']:g}% savings rate and a "
            f"financial score of {facts['financial_score']}/100. "
            f"Start with ₹{round(first['amount']):,} a month to {first['asset'].lower()}.")


def _acceptable(text: str, facts_block: str, allocation_lines: str) -> bool:
    if not text or _PRODUCT_NAMES.search(text):
        return False
    return is_grounded(text, amounts(facts_block), figure_owners(allocation_lines))


def _with_summary(result: dict, facts: dict) -> dict:
    facts_block, allocation_lines = _facts_block(result, facts)
    summary = ""
    try:
        text = ask(_summary_prompt(facts_block), max_tokens=120, timeout=LLM_TIMEOUT_S,
                   num_ctx=2048, temperature=0.2, feature="investments").strip()
        if _acceptable(text, facts_block, allocation_lines):
            summary = text
        else:
            logger.info("Investment summary rejected: ungrounded figure or a named product")
    except Exception as e:  # noqa: BLE001 — any model failure falls back to the computed summary
        logger.warning("Investment summary generation failed: %s", e)
    result["summary"] = summary or _computed_summary(result, facts)
    # Where the summary came from, like the coach's coachMessageSource
    result["summarySource"] = "ai" if summary else "analysis"
    return result
