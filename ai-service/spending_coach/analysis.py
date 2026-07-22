"""Deterministic spending analysis that runs *before* the LLM.

The coach used to hand the model a category total and ask it to sound insightful.
Everything here is computed from the transactions themselves, so the model is
given findings to explain rather than numbers to speculate about:

  * per-month series and month-over-month category drift
  * recurring / subscription-style charges detected by merchant cadence
  * one-off outliers relative to each category's own typical ticket
  * fixed vs discretionary split, and the user's own demonstrated spending floor

All functions are pure and side-effect free — no network, no model calls.
"""
import re
from collections import defaultdict
from datetime import date
from statistics import fmean, median

# Categories treated as discretionary (compressible) when splitting the budget.
# Matched as substrings, case-insensitively, against the user's category label.
DISCRETIONARY_HINTS = (
    "food", "dining", "restaurant", "entertainment", "shopping", "subscription",
    "travel", "leisure", "hobby", "gift", "personal", "other",
)

# Categories that are contractual/committed and not realistically cuttable
# month-to-month. Kept explicit so the LLM is never told to "cut rent".
FIXED_HINTS = (
    "rent", "emi", "loan", "insurance", "mortgage", "tax", "fee", "tuition",
    "utility", "utilities", "electricity", "medical", "health",
)


def _amount(t: dict) -> float:
    try:
        return float(t.get("amount", 0) or 0)
    except (TypeError, ValueError):
        return 0.0


def _month_key(t: dict) -> str | None:
    date = str(t.get("date") or "")
    return date[:7] if len(date) >= 7 else None


def _label(value, default: str) -> str:
    text = _clean_text(str(value or ""))
    return text or default


def _clean_text(value: str, limit: int = 120) -> str:
    """Flatten a narration to one bounded line before it can reach a prompt.

    Merchant and category strings come from bank statements and user imports —
    attacker-reachable text that gets embedded verbatim in the LLM prompt. A
    narration carrying newlines could open its own "RULES" section; control
    characters and unbounded length are the same class of problem. This keeps
    the words (they are the data) but removes the structure an injection needs.
    """
    flattened = " ".join(str(value).split())
    cleaned = "".join(c for c in flattened if c.isprintable())
    return cleaned[:limit].strip()


def classify_category(category: str) -> str:
    """'fixed' | 'discretionary' | 'unclassified' for a category label."""
    key = category.lower()
    if any(h in key for h in FIXED_HINTS):
        return "fixed"
    if any(h in key for h in DISCRETIONARY_HINTS):
        return "discretionary"
    return "unclassified"


# Bank narration prefixes, mapped to how a person would describe the payment.
# Real statements arrive as "UPI/DE/814774322101/Veer Walla/VBEJ/69553586",
# never as "Netflix", so the channel is often the only structure available.
CHANNELS = {
    "UPI": "UPI", "CARD": "Card", "POS": "Card", "ATM": "ATM cash",
    "CASH": "Cash", "FT": "Bank transfer", "NEFT": "Bank transfer",
    "IMPS": "Bank transfer", "RTGS": "Bank transfer", "MMT": "Bank transfer",
    "ACH": "Auto-debit", "ECS": "Auto-debit", "SI": "Auto-debit",
}

# Reference fragments that are never a counterparty: bank codes like "ECYG",
# the debit/credit marker, and the long numeric reference itself.
_REFERENCE = re.compile(r"^(?:[A-Z]{2,6}\d*|\d+|DE|CR|DR)$")


def parse_merchant(raw: str) -> tuple[str, str]:
    """Split a bank narration into (counterparty, channel).

    "UPI/DE/814774322101/Veer Walla/VBEJ/69553586" → ("Veer Walla", "UPI").
    A plain merchant name passes through untouched with channel "Other", so
    hand-entered and imported transactions behave the same downstream.
    """
    parts = [p.strip() for p in str(raw or "").split("/") if p.strip()]
    if not parts:
        return "", "Other"

    channel = CHANNELS.get(parts[0].upper(), "Other")

    named = [p for p in parts
             if any(c.isalpha() for c in p)
             and not _REFERENCE.match(p.upper())
             and p.upper() not in CHANNELS]
    # The counterparty is the wordiest fragment — "Veer Walla" over "VBEJ".
    counterparty = max(named, key=len) if named else parts[0]

    return " ".join(counterparty.split()), channel


def _normalise_merchant(merchant: str) -> str:
    return " ".join(merchant.lower().split())


def detect_recurring(expenses: list[dict], months: int) -> list[dict]:
    """Merchants charging a stable amount across distinct months.

    A charge counts as recurring when the same merchant appears in at least two
    distinct months and its amounts cluster within 25% of their median — that
    catches subscriptions and EMIs while rejecting variable spend like groceries
    at the same supermarket.
    """
    if months < 2:
        return []

    by_merchant: dict[str, list[dict]] = defaultdict(list)
    for e in expenses:
        merchant = _normalise_merchant(e["merchant"])
        if merchant:
            by_merchant[merchant].append(e)

    recurring = []
    for merchant, rows in by_merchant.items():
        month_keys = {r["month"] for r in rows if r["month"]}
        if len(month_keys) < 2:
            continue

        amounts = [r["amount"] for r in rows]
        typical = median(amounts)
        if typical <= 0:
            continue
        if any(abs(a - typical) > typical * 0.25 for a in amounts):
            continue

        # One charge per active month is the cadence we can defend; more
        # frequent merchants (daily coffee) are handled as frequency, not
        # subscriptions.
        per_month = len(rows) / len(month_keys)
        if per_month > 1.5:
            continue

        recurring.append({
            "merchant": rows[0]["merchant"],
            "category": rows[0]["category"],
            "typicalAmount": round(typical, 2),
            "monthsSeen": len(month_keys),
            "monthlyCost": round(typical * per_month, 2),
        })

    recurring.sort(key=lambda r: r["monthlyCost"], reverse=True)
    return recurring[:8]


def detect_outliers(expenses: list[dict]) -> list[dict]:
    """One-off charges far above the typical ticket they should be judged by.

    Compared against a median rather than a flat rupee threshold, so a ₹4,000
    restaurant bill flags for a ₹300-per-meal user but not for someone whose
    typical ticket is already ₹3,000. The category's own median is used once
    there are enough charges for it to mean anything; below that the user's
    overall median stands in, so a lone ₹14,500 purchase in a category it
    invented is still caught.
    """
    by_category: dict[str, list[float]] = defaultdict(list)
    for e in expenses:
        by_category[e["category"]].append(e["amount"])

    typical = {c: median(v) for c, v in by_category.items() if v}
    overall = median([e["amount"] for e in expenses]) if expenses else 0

    seen_merchant: dict[str, int] = defaultdict(int)
    for e in expenses:
        seen_merchant[_normalise_merchant(e["merchant"])] += 1

    outliers = []
    for e in expenses:
        # Rent and EMIs are large by nature, not by accident. Flagging them as
        # one-offs invites advice to "plan for" a charge the user already knows
        # about, and they are ruled out as uncuttable everywhere else.
        if classify_category(e["category"]) == "fixed":
            continue

        rows = by_category[e["category"]]
        if len(rows) >= 4:
            baseline, basis = typical[e["category"]], "category"
        elif seen_merchant[_normalise_merchant(e["merchant"])] == 1:
            # Too few charges for the category to have a median of its own, so
            # judge against the user's overall ticket — but only for a merchant
            # they have used exactly once. Anything repeating is a habit.
            baseline, basis = overall, "overall"
        else:
            continue

        # Need a meaningful baseline and a meaningful absolute amount — a ₹90
        # charge against a ₹20 median is noise, not a finding.
        if baseline <= 0 or e["amount"] < 1000:
            continue
        if e["amount"] >= baseline * 3:
            outliers.append({
                "merchant": e["merchant"],
                "category": e["category"],
                "amount": round(e["amount"], 2),
                "date": e.get("date"),
                "timesTypical": round(e["amount"] / baseline, 1),
                "basis": basis,
            })

    outliers.sort(key=lambda o: o["amount"], reverse=True)
    return outliers[:5]


def category_trends(monthly_by_category: dict[str, dict[str, float]],
                    month_keys: list[str]) -> list[dict]:
    """Latest month vs the average of the preceding months, per category."""
    if len(month_keys) < 2:
        return []

    latest, prior = month_keys[-1], month_keys[:-1]
    trends = []
    for category, series in monthly_by_category.items():
        # A category seen in only one month has no trend — a single ₹14,500
        # purchase would otherwise read as "Shopping down 100%" the month after.
        if sum(1 for m in month_keys if series.get(m, 0) > 0) < 2:
            continue

        latest_total = series.get(latest, 0.0)
        prior_months = [series.get(m, 0.0) for m in prior]
        baseline = sum(prior_months) / len(prior_months) if prior_months else 0.0
        if baseline <= 0 and latest_total <= 0:
            continue
        delta = latest_total - baseline
        trends.append({
            "category": category,
            "latestMonth": round(latest_total, 2),
            "priorAverage": round(baseline, 2),
            "deltaPct": round(delta / baseline * 100, 1) if baseline > 0 else None,
            "delta": round(delta, 2),
        })

    # Biggest movers first, in either direction.
    trends.sort(key=lambda t: abs(t["delta"]), reverse=True)
    return trends[:6]


def merchant_frequency(expenses: list[dict], months: int) -> list[dict]:
    """Merchants by monthly spend, with visit count and average ticket."""
    by_merchant: dict[str, list[float]] = defaultdict(list)
    labels: dict[str, str] = {}
    categories: dict[str, str] = {}
    for e in expenses:
        key = _normalise_merchant(e["merchant"])
        if not key:
            continue
        by_merchant[key].append(e["amount"])
        labels.setdefault(key, e["merchant"])
        # First category wins; merchants rarely straddle categories, and the
        # label only exists so callers can tell fixed spend from discretionary.
        categories.setdefault(key, e["category"])

    rows = [{
        "merchant": labels[k],
        "category": categories[k],
        "monthlyTotal": round(sum(v) / months, 2),
        "visitsPerMonth": round(len(v) / months, 1),
        "averageTicket": round(sum(v) / len(v), 2),
    } for k, v in by_merchant.items()]

    rows.sort(key=lambda r: r["monthlyTotal"], reverse=True)
    return rows[:6]


def channel_mix(expenses: list[dict], months: int) -> list[dict]:
    """Monthly spend per payment channel — UPI, card, ATM cash, transfers.

    When a statement lands with every transaction categorised "Other", how the
    money left the account is the only structure there is, and it is genuinely
    actionable: cash withdrawals and UPI drift are different problems.
    """
    totals: dict[str, list[float]] = defaultdict(list)
    for e in expenses:
        totals[e.get("channel") or "Other"].append(e["amount"])

    rows = [{
        "channel": channel,
        "monthlyTotal": round(sum(amounts) / months, 2),
        "share": round(sum(amounts) / sum(sum(v) for v in totals.values()) * 100, 1),
        "count": len(amounts),
    } for channel, amounts in totals.items() if sum(amounts) > 0]

    rows.sort(key=lambda r: r["monthlyTotal"], reverse=True)
    return rows


def largest_charges(expenses: list[dict], limit: int = 5) -> list[dict]:
    """The single biggest payments in the window.

    The one finding that survives every data problem: it needs no categories,
    no merchant matching and no history — just an amount and a date. For a
    statement that arrived as one undifferentiated "Other" blob, this is the
    only concrete thing there is to talk about.
    """
    ranked = sorted(expenses, key=lambda e: e["amount"], reverse=True)[:limit]
    return [{
        "merchant": e["merchant"],
        "category": e["category"],
        "channel": e.get("channel", "Other"),
        "amount": round(e["amount"], 2),
        "date": e.get("date"),
    } for e in ranked]


def concentration(expenses: list[dict], top: int = 5) -> float:
    """What share of spend the few biggest charges account for.

    A high number means the month is decided by a handful of decisions rather
    than by daily drift, which points advice at completely different places.
    """
    total = sum(e["amount"] for e in expenses)
    if total <= 0:
        return 0.0
    biggest = sorted((e["amount"] for e in expenses), reverse=True)[:top]
    return round(sum(biggest) / total * 100, 1)


def data_quality(expenses: list[dict], category_totals: dict[str, float],
                 total_expense: float, income: float,
                 income_by_day: dict[str, float], transfers: int,
                 months: int = 1, income_by_month: dict[str, float] | None = None) -> dict:
    """What the numbers below should not be trusted to mean.

    Imported statements routinely arrive uncategorised, or with a whole
    account history credited on the import date. Both quietly wreck the
    headline figures, so they are reported rather than papered over.
    """
    vague = sum(v for k, v in category_totals.items()
                if k.strip().lower() in ("other", "others", "uncategorised",
                                         "uncategorized", "misc", "miscellaneous"))
    biggest_day, biggest_day_amount = max(income_by_day.items(),
                                          key=lambda kv: kv[1],
                                          default=(None, 0.0))

    caveats = []
    uncategorised_share = round(vague / total_expense * 100, 1) if total_expense > 0 else 0.0
    if uncategorised_share >= 50:
        caveats.append(
            f"{uncategorised_share:.0f}% of spend is uncategorised, so category "
            f"advice is limited — categorise your transactions to sharpen it."
        )

    income_spike_share = round(biggest_day_amount / income * 100, 1) if income > 0 else 0.0

    # Income is only believable as *earnings* when it arrives the way earnings
    # do — every month, at a similar size. The tell for an imported opening
    # balance is not that one *day* is large (a salary is exactly that), but
    # that one *month* holds nearly everything while its neighbours hold
    # almost nothing. Everything derived from income — savings rate, the
    # health verdict, any advice about surplus — is withheld when it looks
    # like an artefact.
    # Measured against the months of data, not the months that happen to carry
    # income: a lone bulk credit sitting in one month of a longer window is the
    # artefact itself, and counting only income-bearing months would let it
    # look like a perfectly regular single payday.
    by_month = income_by_month or {}
    month_share = (max(by_month.values()) / income * 100
                   if income > 0 and by_month else 0.0)
    income_reliable = income > 0 and not (months >= 2 and month_share >= 80)

    if not income_reliable and income > 0:
        caveats.append(
            f"{income_spike_share:.0f}% of recorded income arrived on {biggest_day}, "
            f"which usually means an imported balance rather than earnings. Income, "
            f"savings rate and the health verdict are withheld rather than reported "
            f"from a number that is not earnings."
        )
    elif income <= 0:
        caveats.append(
            "No income recorded in this window, so savings rate and the health "
            "verdict cannot be worked out."
        )

    if transfers:
        caveats.append(f"{transfers} transfer(s) excluded as internal movement.")

    if uncategorised_share >= 50:
        # Naming the limit precisely: the coach excludes transfers by label, and
        # unlabelled money moved between the user's own accounts is therefore
        # still counted as spending.
        caveats.append(
            "Transfers are only excluded when a transaction is categorised as one, "
            "so some of this 'spend' may be money you moved between your own "
            "accounts rather than money you spent."
        )

    return {
        "uncategorisedShare": uncategorised_share,
        "incomeSpikeShare": income_spike_share,
        "incomeSpikeDate": biggest_day if not income_reliable else None,
        "incomeReliable": income_reliable,
        "transfersExcluded": transfers,
        "caveats": caveats,
    }


def estimate_leakage(evidence: dict) -> dict:
    """Recoverable monthly spend, derived from the user's own behaviour.

    Three components, carved so they cannot count the same rupee twice:

      * ``variable`` — the gap between an average month and the cheapest month
        the user has actually lived through, both measured over the same
        unclipped months. They have demonstrated they can run a month at that
        level, so the gap is recoverable by definition rather than assumption.
      * ``spikes`` — the amount by which one-off charges exceeded a normal
        ticket. Excluded from the habitual figures above, so counting it here
        is additive, not double.
      * ``subscriptions`` — half the cost of recurring discretionary charges.
        These are flat every month, so they sit *inside* the floor and are
        invisible to the first component; halving reflects that some
        subscriptions are genuinely wanted.

    Without enough unclipped months there is no floor to compare against, so a
    conservative 15% of habitual spend stands in.
    """
    baseline = evidence["habitualBaseline"]
    floor = evidence["discretionaryFloor"]

    if floor is not None and baseline is not None:
        variable = max(0.0, baseline - floor)
        basis = "floor"
    else:
        variable = evidence["monthlyHabitual"] * 0.15
        basis = "estimate"

    spikes = evidence["monthlyOutlierExcess"]

    subscriptions = sum(
        r["monthlyCost"] for r in evidence["recurring"]
        if classify_category(r["category"]) != "fixed"
    ) * 0.5

    # Can never exceed the discretionary budget it is all drawn from.
    total = min(variable + spikes + subscriptions, evidence["monthlyDiscretionary"])

    return {
        "monthly": round(total, 2),
        "variable": round(variable, 2),
        "spikes": round(spikes, 2),
        "subscriptions": round(subscriptions, 2),
        "basis": basis,
    }


def analyse(transactions: list[dict]) -> dict:
    """Full evidence pack for a transaction window. Never raises on bad input."""
    expenses: list[dict] = []
    income_by_month: dict[str, float] = defaultdict(float)
    income_by_day: dict[str, float] = defaultdict(float)
    income = 0.0
    transfers = 0

    for t in transactions:
        amount = _amount(t)
        month = _month_key(t)
        category = _label(t.get("category"), "Uncategorised")

        # Money moved between the user's own accounts is not spend and not
        # earnings; counting it does nothing but inflate both sides.
        if category.strip().lower() in ("transfer", "transfers", "self transfer"):
            transfers += 1
            continue

        if amount < 0:
            counterparty, channel = parse_merchant(t.get("merchant"))
            expenses.append({
                "amount": abs(amount),
                "category": category,
                "merchant": _clean_text(counterparty) or _label(t.get("merchant"), ""),
                "channel": channel,
                "date": t.get("date"),
                "month": month,
            })
        elif amount > 0:
            income += amount
            if month:
                income_by_month[month] += amount
            if t.get("date"):
                income_by_day[str(t["date"])] += amount

    month_keys = sorted({e["month"] for e in expenses if e["month"]}
                        | set(income_by_month))

    # The month we are living in is only partly spent. Averaging it in drags
    # every "per month" figure down, and comparing against it makes every
    # category look like it is falling. It is dropped from both — but kept in
    # the totals, because it is real money that was really spent.
    current_month = date.today().strftime("%Y-%m")
    complete_keys = [m for m in month_keys if m != current_month] or month_keys
    months = max(1, len(complete_keys))

    total_expense = sum(e["amount"] for e in expenses)

    outliers = detect_outliers(expenses)
    # Identify the flagged charges so habitual spend can be measured without
    # them: a single ₹14,500 purchase should be its own finding, not something
    # that quietly redefines what a normal month costs.
    outlier_keys = {(o["merchant"], o["date"], o["amount"]) for o in outliers}

    def is_outlier(e: dict) -> bool:
        return (e["merchant"], e.get("date"), round(e["amount"], 2)) in outlier_keys

    category_totals: dict[str, float] = defaultdict(float)
    monthly_by_category: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    expense_by_month: dict[str, float] = defaultdict(float)
    fixed_by_month: dict[str, float] = defaultdict(float)
    discretionary_by_month: dict[str, float] = defaultdict(float)
    habitual_by_month: dict[str, float] = defaultdict(float)
    excess_by_month: dict[str, float] = defaultdict(float)
    counts_by_month: dict[str, int] = defaultdict(int)

    for e in expenses:
        month = e["month"]
        category_totals[e["category"]] += e["amount"]
        if month:
            counts_by_month[month] += 1
            monthly_by_category[e["category"]][month] += e["amount"]
            expense_by_month[month] += e["amount"]

        if classify_category(e["category"]) == "fixed":
            if month:
                fixed_by_month[month] += e["amount"]
        elif month:
            # Unclassified spend is treated as compressible: it is the bucket
            # advice can actually act on, and calling it fixed would hide it.
            discretionary_by_month[month] += e["amount"]

            if is_outlier(e):
                baseline = next(o["amount"] / o["timesTypical"] for o in outliers
                                if (o["merchant"], o["date"], o["amount"])
                                == (e["merchant"], e.get("date"), round(e["amount"], 2)))
                excess_by_month[month] += e["amount"] - baseline
                habitual_by_month[month] += baseline
            else:
                habitual_by_month[month] += e["amount"]

    def per_month(series: dict[str, float]) -> float:
        """Average over the months that actually finished."""
        return sum(series.get(m, 0.0) for m in complete_keys) / months

    # Anything expressed as "per month" has to be built from the same finished
    # months, or a fortnight of the current month gets averaged as if it were
    # a whole one.
    settled = [e for e in expenses if e["month"] in set(complete_keys)]

    ordered_categories = dict(sorted(category_totals.items(),
                                     key=lambda kv: kv[1], reverse=True))

    # The user's own demonstrated floor: the cheapest *habitual* month they
    # have actually lived through, judged only on finished months. The floor is
    # only meaningful next to an average drawn from the same set — averaging
    # across the whole window instead let a half-finished month pull the
    # average below the floor and silently zero the gap.
    #
    # A month holding a handful of transactions next to neighbours holding
    # dozens was not a frugal month, it is a month the data only half covers —
    # the first month after a bank connection, typically. Judging a floor by it
    # would call every honest month wasteful.
    typical_count = median(counts_by_month.values()) if counts_by_month else 0
    comparable = [habitual_by_month[m] for m in complete_keys
                  if m in habitual_by_month and counts_by_month[m] >= typical_count * 0.5]

    if len(comparable) >= 2:
        discretionary_floor = min(comparable)
        habitual_baseline = fmean(comparable)
    else:
        discretionary_floor = habitual_baseline = None

    quality = data_quality(expenses, category_totals, total_expense,
                           income, income_by_day, transfers, months, income_by_month)

    # A savings rate computed from an imported balance is not a savings rate.
    savings_rate = (round((income - total_expense) / income * 100, 1)
                    if quality["incomeReliable"] else None)

    confidence = "high" if months >= 3 and len(expenses) >= 30 else \
                 "medium" if months >= 2 and len(expenses) >= 10 else "low"
    if quality["uncategorisedShare"] >= 50 or not quality["incomeReliable"]:
        # Plenty of transactions, almost no meaning: enough to measure how much
        # is going out, not enough to say anything confident about it.
        confidence = "low"

    return {
        "channelTotals": channel_mix(settled, months),
        "largestCharges": largest_charges(settled),
        "concentrationShare": concentration(settled),
        "dataQuality": quality,
        "habitualBaseline": round(habitual_baseline, 2)
                            if habitual_baseline is not None else None,
        "months": months,
        "monthKeys": month_keys,
        "completeMonths": complete_keys,
        "transactionCount": len(expenses),
        # Withheld rather than shown when it is not earnings — a headline
        # figure the page prints is a claim, and this one would be false.
        "monthlyIncome": (round(per_month(income_by_month), 2)
                          if quality["incomeReliable"] else None),
        "monthlyExpense": round(per_month(expense_by_month), 2),
        "savingsRate": savings_rate,
        "categoryTotals": {k: round(v, 2) for k, v in ordered_categories.items()},
        "categoryMonthly": {k: round(per_month(monthly_by_category[k]), 2)
                            for k in ordered_categories},
        "monthlyByCategory": {k: {m: round(x, 2) for m, x in v.items()}
                              for k, v in monthly_by_category.items()},
        "expenseByMonth": {m: round(v, 2) for m, v in sorted(expense_by_month.items())},
        "incomeByMonth": {m: round(v, 2) for m, v in sorted(income_by_month.items())},
        "discretionaryByMonth": {m: round(v, 2)
                                 for m, v in sorted(discretionary_by_month.items())},
        "monthlyFixed": round(per_month(fixed_by_month), 2),
        "monthlyDiscretionary": round(per_month(discretionary_by_month), 2),
        "monthlyHabitual": round(per_month(habitual_by_month), 2),
        "monthlyOutlierExcess": round(per_month(excess_by_month), 2),
        "discretionaryFloor": round(discretionary_floor, 2)
                              if discretionary_floor is not None else None,
        "trends": category_trends(monthly_by_category, complete_keys),
        "recurring": detect_recurring(expenses, months),
        "outliers": outliers,
        "topMerchants": merchant_frequency(settled, months),
        "confidence": confidence,
    }
