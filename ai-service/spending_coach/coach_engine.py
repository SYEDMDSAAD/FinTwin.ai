import json
import logging
import re
import pandas as pd
from utils.ollama_client import ask

logger = logging.getLogger(__name__)


def _amount(t: dict) -> float:
    """Coerce a transaction amount to float, tolerating missing/garbage values."""
    try:
        return float(t.get("amount", 0) or 0)
    except (TypeError, ValueError):
        return 0.0


def _parse_llm_json(text):
    text = text.replace("```json", "").replace("```", "").strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]

    for loader in (
        lambda t: json.loads(t),
        lambda t: json.loads(t, strict=False),
        lambda t: json.loads(re.sub(r",\s*([}\]])", r"\1", t), strict=False),
    ):
        try:
            return loader(text)
        except Exception:
            pass
    return None


def _normalize_tips(tips):
    """Accept tips as strings or nested objects and always return plain strings."""
    result = []
    for tip in tips:
        if isinstance(tip, str) and tip.strip():
            result.append(tip.strip())
        elif isinstance(tip, dict):
            # Model returned {category, action, reasoning} — collapse to one sentence
            sentence = (
                tip.get("action")
                or tip.get("recommendation")
                or tip.get("tip")
                or tip.get("advice")
                or ""
            )
            reasoning = tip.get("reasoning") or tip.get("detail") or ""
            if sentence and reasoning:
                result.append(f"{sentence} {reasoning}")
            elif sentence:
                result.append(sentence)
    return [t for t in result if t]


# Deterministic leakage: fixed % of discretionary categories so it never changes on regenerate
_LEAKAGE_RATES = {
    "food": 0.25,
    "dining": 0.25,
    "entertainment": 0.40,
    "shopping": 0.30,
    "others": 0.20,
    "subscriptions": 0.35,
    "transport": 0.15,
}

def _compute_leakage(category_totals: dict) -> float:
    leakage = 0.0
    for cat, total in category_totals.items():
        key = cat.lower()
        for label, rate in _LEAKAGE_RATES.items():
            if label in key:
                leakage += total * rate
                break
        else:
            leakage += total * 0.10  # default 10% for unknown categories
    return round(leakage / 3, 2)  # monthly average (data is 3 months)


def generate_spending_coach(transactions):
    # Normalise defensively: tolerate missing/garbage "amount" and missing
    # "category" rather than raising KeyError/ValueError on malformed input.
    expenses = []
    income = 0.0
    for t in transactions:
        amt = _amount(t)
        if amt < 0:
            row = dict(t)
            row["amount"] = amt
            row["category"] = (t.get("category") or "Uncategorised")
            expenses.append(row)
        elif amt > 0:
            income += amt

    if not expenses:
        return {
            "spendingHealth": "Unknown",
            "monthlyLeakage": 0,
            "tips": [],
            "coachMessage": "No spending data available.",
        }

    df = pd.DataFrame(expenses)
    df["amount"] = df["amount"].abs()

    total_expenses = float(df["amount"].sum())
    savings = income - total_expenses
    savings_rate = round((savings / income * 100), 1) if income > 0 else 0
    tx_count = len(expenses)

    category_totals = (
        df.groupby("category")["amount"].sum()
        .sort_values(ascending=False)
        .round(2)
        .to_dict()
    )

    merchant_totals = {}
    if "merchant" in df.columns:
        merchant_totals = (
            df.groupby("merchant")["amount"].sum()
            .sort_values(ascending=False)
            .head(6)
            .round(2)
            .to_dict()
        )

    # Compute leakage deterministically — never changes on regenerate
    monthly_leakage = _compute_leakage(category_totals)

    # Determine health from savings rate
    if savings_rate >= 30:
        health = "Excellent"
    elif savings_rate >= 15:
        health = "Good"
    elif savings_rate >= 5:
        health = "Average"
    else:
        health = "Poor"

    top_category = list(category_totals.keys())[0] if category_totals else "discretionary"
    top_category_amount = round(list(category_totals.values())[0]) if category_totals else 0
    monthly_expense = round(total_expenses / 3)
    monthly_income = round(income / 3) if income > 0 else 0

    prompt = f"""You are a senior personal finance advisor with 15 years of experience helping Indians build wealth. Speak directly to the user — confident, warm, and precise. Never be vague or generic. Every sentence must reference the user's actual numbers.

USER'S FINANCIAL SNAPSHOT (last 3 months):
- Monthly Income: ₹{monthly_income:,}
- Monthly Expenses: ₹{monthly_expense:,}
- Savings Rate: {savings_rate}%
- Total Transactions: {tx_count}

CATEGORY BREAKDOWN (3-month total, ₹):
{json.dumps(category_totals, indent=2)}

TOP MERCHANTS (3-month total, ₹):
{json.dumps(merchant_totals, indent=2)}

Write a coachMessage (2-3 sentences, max 90 words): Start with a direct assessment of their financial health using their savings rate. Identify the single biggest pattern you see in their spending. End with one concrete next step they can take this week — mention an actual number or category.

Write exactly 4 tips. Each tip must be 1-2 sentences. Reference specific categories or merchants from the data. Be practical — tell the user exactly what to do, not just what to notice. No platitudes like "track your spending" or "make a budget".

Return ONLY this JSON (no markdown, no extra text):
{{"coachMessage":"your message here","tips":["tip 1","tip 2","tip 3","tip 4"]}}"""

    try:
        text = ask(prompt, max_tokens=300)
        parsed = _parse_llm_json(text)

        if parsed:
            tips_raw = parsed.get("tips", [])
            tips = _normalize_tips(tips_raw)
            return {
                "spendingHealth": health,
                "monthlyLeakage": monthly_leakage,
                "coachMessage": parsed.get("coachMessage", ""),
                "tips": tips if tips else _fallback_tips(category_totals, merchant_totals, savings_rate),
            }
        raise ValueError("Parse failed")

    except Exception as e:
        logger.warning("Spending coach LLM/parse failed, using fallback: %s", e)
        top_cat = list(category_totals.keys())[0] if category_totals else "discretionary"
        top_amt = round(list(category_totals.values())[0] / 3) if category_totals else 0
        monthly_exp = round(total_expenses / 3)
        monthly_inc = round(income / 3) if income > 0 else 0
        gap = max(0, round(monthly_inc * 0.20) - round(income * savings_rate / 100 / 3))
        return {
            "spendingHealth": health,
            "monthlyLeakage": monthly_leakage,
            "tips": _fallback_tips(category_totals, merchant_totals, savings_rate),
            "coachMessage": (
                f"Your savings rate stands at {savings_rate}% — "
                f"{'well above' if savings_rate >= 30 else 'below' if savings_rate < 20 else 'close to'} the recommended 20% benchmark. "
                f"Your largest monthly outflow is {top_cat} at ₹{top_amt:,}, which is worth examining closely. "
                f"{'Cutting that category by 15% would free up ₹' + str(round(top_amt * 0.15)) + ' every month.' if top_amt > 0 else 'Review your top categories to find room to save.'}"
            ),
        }


def _fallback_tips(category_totals, merchant_totals, savings_rate):
    tips = []
    cats = list(category_totals.keys())
    amounts = list(category_totals.values())
    merchants = list(merchant_totals.keys())
    m_amounts = list(merchant_totals.values())

    if cats:
        cap = round(amounts[0] / 3 * 0.80)
        tips.append(
            f"{cats[0]} is your top spending category at ₹{round(amounts[0]/3):,}/month on average. "
            f"Set a hard monthly cap of ₹{cap:,} — that's a 20% reduction that compounds over time."
        )
    if len(cats) > 1:
        tips.append(
            f"Your {cats[1]} spend of ₹{round(amounts[1]/3):,}/month is your second-largest category. "
            f"Review this category's transactions and identify 2-3 recurring charges you can eliminate or downgrade."
        )
    if merchants:
        tips.append(
            f"You've spent ₹{round(m_amounts[0]):,} at {merchants[0]} over the last 3 months — roughly ₹{round(m_amounts[0]/3):,}/month. "
            f"Set a monthly limit for this merchant and stop when you hit it."
        )
    if savings_rate < 20:
        shortfall = round((20 - savings_rate) / 100 * (sum(amounts) / 3 + sum(amounts) / 3 * savings_rate / 100))
        tips.append(
            f"At {savings_rate}% savings rate, you're ₹{shortfall:,}/month short of the 20% benchmark. "
            f"Set up an automatic transfer to a separate savings account the day your salary arrives — before you spend."
        )
    else:
        tips.append(
            f"Your {savings_rate}% savings rate is strong. Put the surplus to work — a Nifty 50 index fund SIP "
            f"or a high-yield FD will outperform letting it sit in a savings account."
        )
    return tips
