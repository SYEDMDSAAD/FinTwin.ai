import re
from typing import Tuple

# Each intent maps to a list of compiled patterns. First match wins.
# Ordered from most specific to most general.
_INTENT_PATTERNS: list[Tuple[str, list]] = [
    ("FRAUD", [
        re.compile(r"\b(fraud|scam|suspicious|unauthori[sz]ed|hack|stolen|breach|unusual.{0,15}transaction)\b", re.I),
    ]),
    ("SUBSCRIPTIONS", [
        re.compile(r"\b(subscription|recurring|netflix|spotify|prime|cancel.{0,15}(plan|service))\b", re.I),
    ]),
    ("FINANCIAL_SCORE", [
        re.compile(r"\b(financial.?score|credit.?score|improve.{0,15}score|cibil|crisil)\b", re.I),
    ]),
    ("AFFORDABILITY", [
        re.compile(r"\b(afford|can.{0,10}(i|we).{0,10}(buy|get|purchase)|is.{0,15}(worth|good.?deal)|within.{0,10}budget)\b", re.I),
    ]),
    ("PURCHASE", [
        re.compile(r"\b(buy|purchase|order|should.{0,15}(get|buy)|laptop|phone|car|bike|appliance|product)\b", re.I),
    ]),
    ("INVESTMENT", [
        re.compile(r"\b(invest|sip|mutual.?fund|stock|equity|nifty|sensex|portfolio|returns|dividend|etf|nps|ppf)\b", re.I),
    ]),
    ("BUDGET", [
        re.compile(r"\b(budget|overspend|over.{0,10}limit|spending.?limit|cut.{0,15}(expense|cost|spend)|reduce.{0,15}(expense|spend))\b", re.I),
    ]),
    ("SAVINGS", [
        re.compile(r"\b(sav(e|ing|ings)|save.{0,15}more|save.{0,15}money|build.{0,15}(savings|corpus)|emergency.?fund|set.{0,10}aside)\b", re.I),
    ]),
    ("SPENDING", [
        re.compile(r"\b(spend(ing)?|expense|how.{0,15}(much|am).{0,15}spending|where.{0,15}(money|going)|expenditure)\b", re.I),
    ]),
    ("GOAL", [
        re.compile(r"\b(goal|target|plan.{0,15}(for|to)|dream|retirement|house|vacation|wedding|education)\b", re.I),
    ]),
    ("NET_WORTH", [
        re.compile(r"\b(net.?worth|total.{0,15}(assets|wealth)|asset|liability|wealth)\b", re.I),
    ]),
]


def classify_intent(message: str) -> str:
    for intent, patterns in _INTENT_PATTERNS:
        if any(p.search(message) for p in patterns):
            return intent
    return "GENERAL"
