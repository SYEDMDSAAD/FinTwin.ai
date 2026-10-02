"""
"Check my spending patterns" / "how can I save more" answered from the user's
own figures, with every number worked out here.

Left to the model, this went wrong in ways that matter: it listed four lines
of "₹… in Investments" and called investing a risk, quoted category figures
that contradicted each other, and told the user they needed to cut spending to
buy a car "within 12 years" — which is what they'd manage with no change at
all. A 3B model can't be trusted with this arithmetic, so it isn't asked to.

Units: income, expenses and savings arrive as monthly averages, but
categorySpending holds totals for the whole window (up to three months), so
those are divided by the months covered before anything is compared.
"""

import re
from datetime import date

from chatbot.affordability import inr, price_in, remembered_price

_ASKS = re.compile(
    r"\bspending\s+(pattern|habit|trend)s?\b"
    r"|\bwhere\s+(does|is|did|do)\s+(all\s+)?my\s+money\s+go"
    r"|\b(analy[sz]e|review|check|look\s+at)\s+my\s+(spending|expenses|finances|budget)\b"
    r"|\bhow\s+(can|do|could|should|would)\s+i\s+(save|boost|improve|cut|reduce|spend\s+less)\b"
    r"|\b(save|saving)\s+more\b"
    r"|\b(reduce|cut|lower|trim)\s+(down\s+)?(on\s+)?(my\s+)?(spending|expenses|costs)\b"
    r"|\bboost\s+my\s+(finances|savings|saving)\b"
    # "how can I buy the car as soon as possible": a plan, not just a yes/no
    r"|\b(buy|afford|get)\b.*\b(sooner|faster|quicker|quickly|as\s+soon\s+as|asap)\b",
    re.IGNORECASE,
)
# Questions about investments go to the portfolio tools ("how can I improve my
# portfolio?", "how do I save on my SIPs?")
_ABOUT_INVESTING = re.compile(r"\b(invest\w*|portfolio|stocks?|shares?|mutual\s+funds?|funds?|sips?)\b",
                              re.IGNORECASE)
_ABOUT_BUYING = re.compile(r"\b(buy|afford|purchase|sooner|faster|quicker|as\s+soon\s+as)\b", re.IGNORECASE)

# Not spending at all: left out entirely
_NOT_SPENDING = {"transfer", "card payment", "income"}
# Money put away, which the backend's "expenses" includes
_INVESTING = {"investments"}
# Commitments: shown, never suggested as cuts
_COMMITTED = {"rent", "housing", "emi", "bills", "utilities", "health", "education", "insurance"}
# Where a trim is realistic. Groceries and transport are needs, but there is
# usually room in them; food (eating out, delivery) and the rest are wants.
_FLEXIBLE = {"food", "shopping", "entertainment", "travel", "local shops", "groceries", "transport"}
# Neither: money sent to people may be family support; "Other" is unknown
_NEUTRAL = {"people", "other"}

_PAYEE_PREFIX = re.compile(r"^(paid\s+to|payment\s+to|sent\s+to|transfer\s+to)\s+", re.IGNORECASE)

TRIM = 0.25            # "trim by a quarter": large enough to matter, small enough to be real


def asks_for_plan(message: str) -> bool:
    return bool(_ASKS.search(message or "")) and not _ABOUT_INVESTING.search(message or "")


def _months(data: dict) -> int:
    """Calendar months the window covers, as the backend counts them."""
    try:
        start = date.fromisoformat(str(data.get("dataFrom"))[:10])
        end = date.fromisoformat(str(data.get("dataThrough"))[:10])
        return max(1, (end.year - start.year) * 12 + end.month - start.month + 1)
    except (TypeError, ValueError):
        return 1


def _duration(months: float) -> str:
    if months <= 18:
        return f"about {months:.0f} month{'s' if round(months) != 1 else ''}"
    return f"about {months / 12:.1f} years"


def answer(message: str, data: dict) -> str | None:
    """The reply, or None when there is nothing recorded to answer from."""
    income = float(data.get("income") or 0)
    expenses = float(data.get("expenses") or 0)
    if income <= 0 and expenses <= 0:
        return None
    left = float(data.get("savings") if data.get("savings") is not None else income - expenses)
    months = _months(data)

    monthly: dict[str, float] = {}
    for name, total in (data.get("categorySpending") or {}).items():
        try:
            value = float(total) / months
        except (TypeError, ValueError):
            continue
        if value >= 1 and str(name).strip().lower() not in _NOT_SPENDING:
            monthly[str(name)] = value
    if not monthly:
        return None

    kind = lambda c: c.strip().lower()  # noqa: E731
    investing = sum(v for c, v in monthly.items() if kind(c) in _INVESTING)
    spending = {c: v for c, v in monthly.items() if kind(c) not in _INVESTING}
    # The trims shown and their total come from the same list, so the lines add up
    flexible = sorted(((c, v) for c, v in spending.items() if kind(c) in _FLEXIBLE),
                      key=lambda cv: -cv[1])[:6]
    freed = sum(v * TRIM for _, v in flexible)
    put_away = left + investing

    period = ""
    if data.get("dataFrom") and data.get("dataThrough"):
        period = f" ({data['dataFrom']} to {data['dataThrough']})"
    rate = f" ({left / income * 100:.0f}% of what comes in)" if income > 0 else ""
    invested_note = f" ({inr(investing)} of it invested)" if investing else ""
    summary = (f"**In:** {inr(income)} · **Out:** {inr(expenses)}{invested_note} · "
               f"**Left over:** {inr(left)}{rate}")

    # Where it goes
    lines = []
    if investing:
        lines.append(f"- **Investments: {inr(investing)}**. This is saving, not spending, so "
                     f"you actually put away about **{inr(put_away)}** a month.")
    total_spend = sum(spending.values())
    for c, v in sorted(spending.items(), key=lambda cv: -cv[1])[:7]:
        note = {"other": " (not yet categorised; sorting these sharpens this picture)",
                "people": " (money sent to people: rent, family or splitting bills)"}.get(kind(c), "")
        share = f", {v / total_spend * 100:.0f}% of spending" if total_spend else ""
        lines.append(f"- {c}: {inr(v)}{share}{note}")
    breakdown = "**Where it goes each month**\n" + "\n".join(lines)

    # What could be freed
    if flexible and freed >= 100:
        trims = [f"- {c}: {inr(v)} → {inr(v * (1 - TRIM))}, frees **{inr(v * TRIM)}**"
                 for c, v in flexible]
        freeing = ("**Where you could free up money**: trimming your flexible spending by a quarter\n"
                   + "\n".join(trims)
                   + f"\n\nTogether that's about **{inr(freed)} more a month**, taking what's left over "
                     f"from {inr(left)} to {inr(left + freed)}. Rent, EMIs, bills and health aren't "
                     f"counted here.")
    else:
        freeing = ("Most of your spending is commitments (rent, EMIs, bills), so there's little "
                   "flexible spending to trim. The bigger lever is income.")

    # A purchase being saved for: the answer to the question, so it goes first
    price = price_in(message) or remembered_price(message, data.get("conversationHistory"))
    saving_for = None
    if price and (_ABOUT_BUYING.search(message or "") or price_in(message)):
        steps = []
        if left > 0:
            steps.append(f"- Saving what's left over now ({inr(left)} a month): {_duration(price / left)}")
        else:
            steps.append("- Right now nothing is left over each month, so it can't be saved for yet")
        if flexible and freed >= 100 and left + freed > 0:
            steps.append(f"- With the trims below ({inr(left + freed)} a month): "
                         f"{_duration(price / (left + freed))}")
        extra = 5000
        if left + freed + extra > 0:
            steps.append(f"- Trims plus {inr(extra)} more income a month ({inr(left + freed + extra)}): "
                         f"{_duration(price / (left + freed + extra))}")
        if investing and put_away > 0:
            steps.append(f"- If what you invest went towards it too ({inr(put_away)} a month): "
                         f"{_duration(price / put_away)}. That's your call; it would pause your "
                         f"long-term saving.")
        saving_for = f"**Saving for {inr(price)}**\n" + "\n".join(steps)

    if saving_for:
        out = [f"Here's how soon you could get to {inr(price)}, from a monthly average of what "
               f"you've recorded{period}.", summary, saving_for, breakdown, freeing]
    else:
        out = [f"Here's where your money goes, as a monthly average of what you've recorded{period}.",
               summary, breakdown, freeing]

    # Statements name payees "Paid to X"; the name is what matters
    subs = [_PAYEE_PREFIX.sub("", str(s)).strip() for s in (data.get("subscriptions") or []) if s][:6]
    if subs:
        out.append("**Recurring payments:** " + ", ".join(subs)
                   + ". Any you no longer use are an easy saving.")
    alerts = [str(a) for a in (data.get("budgetAlerts") or []) if a]
    if alerts:
        out.append("**Over budget this month:** " + "; ".join(alerts) + ".")

    out.append("This is arithmetic on what you've recorded, not financial advice.")
    return "\n\n".join(out)
