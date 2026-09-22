"""
"Can I afford X?" answered from the user's own figures.

The snapshot handed to the copilot already carries monthly income, expenses
and savings, yet a 3B model routinely asks the user to type them in again —
the one thing that makes an assistant feel like it isn't listening. These
questions are answered here instead, from the data, and the arithmetic is
done in Python.
"""

import re

_ASKS = re.compile(
    r"\b(can|could)\s+i\s+afford\b|\bam\s+i\s+able\s+to\s+afford\b|\bis\s+it\s+affordable\b"
    r"|\bcan\s+i\s+buy\b|\bafford\s+(a|an|this|that|it)\b",
    re.IGNORECASE,
)

# ₹65,000 · 65k · 5 lakh · 1.2 cr · 8 lakhs
_AMOUNT = re.compile(
    r"(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|l|lakh|lakhs|lac|cr|crore|crores)?",
    re.IGNORECASE,
)
_MULTIPLIER = {"k": 1_000, "thousand": 1_000, "l": 100_000, "lakh": 100_000, "lakhs": 100_000,
               "lac": 100_000, "cr": 10_000_000, "crore": 10_000_000, "crores": 10_000_000}


def asks_about_affording(question: str) -> bool:
    return bool(_ASKS.search(question or ""))


def price_in(question: str) -> float | None:
    """The price the user named, if any. Bare numbers under 1000 are ignored —
    "afford a 2 bhk" is not a price."""
    for raw, unit in _AMOUNT.findall(question or ""):
        try:
            value = float(raw.replace(",", ""))
        except ValueError:
            continue
        if unit:
            return value * _MULTIPLIER[unit.lower()]
        if value >= 1000:
            return value
    return None


def inr(amount: float) -> str:
    """Indian digit grouping: ₹12,34,567."""
    n = int(round(abs(amount)))
    s = str(n)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        s = f"{head},{tail}"
    return ("-₹" if amount < 0 else "₹") + s


def _period(data: dict) -> str:
    through = data.get("dataThrough")
    return f" (from your transactions up to {through})" if through else ""


def answer(question: str, data: dict) -> str | None:
    """The reply, or None when there is nothing recorded to answer from."""
    income = float(data.get("income") or 0)
    expenses = float(data.get("expenses") or 0)
    monthly_savings = float(data.get("savings") or (income - expenses))
    if income <= 0 and expenses <= 0:
        return None                                   # nothing imported: let the model say so

    price = price_in(question)
    if price is None:
        lines = [f"On what you've recorded{_period(data)}, you take in about {inr(income)} a month "
                 f"and spend about {inr(expenses)}, leaving {inr(monthly_savings)}."]
        if monthly_savings > 0:
            lines.append(f"A purchase you could cover from a year of that saving is about "
                         f"{inr(monthly_savings * 12)}.")
        lines.append("What does the one you're looking at cost? Tell me the price and I'll work it through.")
        return "\n\n".join(lines)

    if monthly_savings <= 0:
        return (f"{inr(price)} is not affordable on what you've recorded{_period(data)}: you spend "
                f"{inr(expenses)} a month against {inr(income)} coming in, so nothing is left over. "
                f"The gap has to close before a purchase this size makes sense.")

    months = price / monthly_savings
    if income and price < income:
        size = f"{price / income * 100:.0f}% of a month's income"
    elif income:
        size = f"{price / income:.1f} months of your income"
    else:
        size = "more than you record earning"

    if months <= 3:
        verdict = f"about {months:.1f} months of your saving — comfortable"
    elif months <= 12:
        verdict = f"about {months:.0f} months of your saving, so it's within reach if you set it aside"
    elif months <= 36:
        verdict = (f"about {months:.0f} months of everything you save — around "
                   f"{months / 12:.1f} years, so it usually means borrowing")
    else:
        verdict = (f"about {months / 12:.0f} years of everything you save — out of reach "
                   f"without a loan or a change in income")

    return (f"On what you've recorded{_period(data)}: about {inr(income)} in and {inr(expenses)} out "
            f"a month, leaving {inr(monthly_savings)}.\n\n"
            f"{inr(price)} is {size} — {verdict}.\n\n"
            f"This doesn't count what you already have saved or any loan you'd take — "
            f"the Affordability check on the Budgeting page uses your balance and running costs too. "
            f"It isn't financial advice.")
