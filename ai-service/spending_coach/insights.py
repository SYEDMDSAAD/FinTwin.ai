"""Turns the evidence pack into insight cards and ranked recommendations.

Everything here is deterministic. The model contributes prose and at most a
couple of extra suggestions; the findings, the rupee impact of acting on them
and the order they are shown in are all computed.

An insight is something true about the user's spending. A recommendation is
something to do about it, carrying the monthly rupee impact of doing it, so
the page can rank by what is actually worth the user's attention.
"""
from spending_coach.analysis import classify_category

# Effort is about what the user has to change, not what we have to compute:
# cancelling a subscription is one click; eating out less is a month of habit.
EFFORT_ONE_OFF = "low"
EFFORT_HABIT = "medium"


def rupees(value) -> str:
    return f"₹{round(value):,}"


def _actionable(category: str) -> bool:
    return classify_category(category) != "fixed"


VAGUE = ("other", "others", "uncategorised", "uncategorized", "misc", "miscellaneous")


def label(category: str) -> str:
    """What to call a category out loud.

    A statement import labels almost everything "Other", and a card reading
    "Other down 34%" tells the user nothing — naming it uncategorised at least
    points at the reason the coach cannot say more.
    """
    return "Uncategorised spending" if category.strip().lower() in VAGUE else category


def build_insights(evidence: dict, leakage: dict) -> list[dict]:
    """Findings worth showing, strongest first.

    Each card carries a `tone` the page colours by: 'warn' for something
    heading the wrong way, 'good' for something going right, 'info' for
    structure the user should simply know about.
    """
    cards: list[dict] = []

    for t in evidence["trends"]:
        if t["deltaPct"] is None or abs(t["deltaPct"]) < 15 or not _actionable(t["category"]):
            continue
        rising = t["delta"] > 0
        cards.append({
            "kind": "trend",
            "title": f"{label(t['category'])} {'up' if rising else 'down'} "
                     f"{abs(t['deltaPct']):.0f}% last month",
            "detail": f"{rupees(t['latestMonth'])} against a "
                      f"{rupees(t['priorAverage'])} average before.",
            "amount": abs(t["delta"]),
            "tone": "warn" if rising else "good",
        })

    cancellable = [r for r in evidence["recurring"] if _actionable(r["category"])]
    for r in cancellable[:3]:
        cards.append({
            "kind": "subscription",
            "title": f"{r['merchant']} bills you every month",
            "detail": f"{rupees(r['typicalAmount'])} in each of {r['monthsSeen']} months "
                      f"— {rupees(r['monthlyCost'] * 12)} a year.",
            "amount": r["monthlyCost"],
            "tone": "info",
        })

    for o in evidence["outliers"][:3]:
        cards.append({
            "kind": "outlier",
            "title": f"{rupees(o['amount'])} one-off at {o['merchant']}",
            "detail": f"{o['timesTypical']}x a typical charge, on {o['date']}.",
            "amount": o["amount"],
            "tone": "warn",
        })

    if evidence["habitualBaseline"] is not None:
        gap = evidence["habitualBaseline"] - evidence["discretionaryFloor"]
        cards.append({
            "kind": "rhythm",
            "title": f"Your months swing by {rupees(gap)}",
            "detail": f"An average month runs {rupees(evidence['habitualBaseline'])} of "
                      f"day-to-day spend; your cheapest ran "
                      f"{rupees(evidence['discretionaryFloor'])}.",
            "amount": gap,
            "tone": "warn" if gap > 0 else "good",
        })

    biggest = evidence["largestCharges"]
    if biggest:
        top = biggest[0]
        cards.append({
            "kind": "largest",
            "title": f"Biggest single charge: {rupees(top['amount'])}",
            "detail": f"{top['merchant'] or 'Unnamed payee'} on {top['date']}, "
                      f"paid by {top['channel'].lower()}.",
            "amount": top["amount"],
            "tone": "info",
        })

    share = evidence["concentrationShare"]
    if share >= 40 and len(biggest) >= 3:
        cards.append({
            "kind": "concentration",
            "title": f"{share:.0f}% of your spend is {len(biggest)} payments",
            "detail": "A handful of decisions set your month, rather than daily drift — "
                      "which is where the leverage is.",
            "amount": share,
            "tone": "warn",
        })

    months = list(evidence["expenseByMonth"].items())
    if len(months) >= 2:
        (prev_month, prev_total), (last_month, last_total) = months[-2], months[-1]
        if prev_total > 0 and last_month in evidence["completeMonths"]:
            change = (last_total - prev_total) / prev_total * 100
            if abs(change) >= 10:
                cards.append({
                    "kind": "total",
                    "title": f"Total spend {'up' if change > 0 else 'down'} "
                             f"{abs(change):.0f}% in {last_month}",
                    "detail": f"{rupees(last_total)} against {rupees(prev_total)} the "
                              f"month before.",
                    "amount": abs(last_total - prev_total),
                    "tone": "warn" if change > 0 else "good",
                })

    for c in evidence["channelTotals"][:3]:
        if c["channel"] == "Other":
            continue
        cards.append({
            "kind": "channel",
            "title": f"{c['share']:.0f}% of spend goes out by {c['channel']}",
            "detail": f"{rupees(c['monthlyTotal'])}/month across {c['count']} charges.",
            "amount": c["monthlyTotal"],
            "tone": "info",
        })

    # With most spend uncategorised, a fixed/discretionary split is an artefact
    # of missing labels rather than a fact about the user's budget.
    if evidence["monthlyFixed"] > 0 and evidence["dataQuality"]["uncategorisedShare"] < 50:
        committed = evidence["monthlyFixed"]
        total = committed + evidence["monthlyDiscretionary"]
        cards.append({
            "kind": "mix",
            "title": f"{rupees(committed)}/month is committed",
            "detail": f"{committed / total * 100:.0f}% of your spend is rent, EMI and bills. "
                      f"The other {rupees(evidence['monthlyDiscretionary'])} is what advice "
                      f"can move.",
            "amount": committed,
            "tone": "info",
        })

    return cards[:8]


def build_recommendations(evidence: dict, leakage: dict) -> list[dict]:
    """Actions with the monthly rupee impact of taking them, ranked by impact.

    Impact is what the user keeps if they act, not what they spend today —
    cancelling a ₹649 subscription saves ₹649, but pulling a category back to
    its own prior average saves only the increase.
    """
    recs: list[dict] = []

    for r in (x for x in evidence["recurring"] if _actionable(x["category"])):
        recs.append({
            "action": f"Cancel or downgrade {r['merchant']}",
            "rationale": f"It has charged {rupees(r['typicalAmount'])} in each of the last "
                         f"{r['monthsSeen']} months. If you have not used it this month, "
                         f"that is {rupees(r['monthlyCost'] * 12)} a year for nothing.",
            "impactPerMonth": round(r["monthlyCost"], 2),
            "effort": EFFORT_ONE_OFF,
            "evidence": f"{r['merchant']} · {rupees(r['typicalAmount'])} × {r['monthsSeen']} months",
            "source": "analysis",
        })

    for t in evidence["trends"]:
        if t["deltaPct"] is None or t["deltaPct"] < 15 or not _actionable(t["category"]):
            continue
        recs.append({
            "action": f"Pull {label(t['category'])} back to {rupees(t['priorAverage'])}",
            "rationale": f"It jumped {t['deltaPct']:.0f}% last month to "
                         f"{rupees(t['latestMonth'])}. Returning to your own prior average "
                         f"keeps {rupees(t['delta'])} in your account.",
            "impactPerMonth": round(t["delta"], 2),
            "effort": EFFORT_HABIT,
            "evidence": f"{t['category']} · {rupees(t['latestMonth'])} vs "
                        f"{rupees(t['priorAverage'])}",
            "source": "analysis",
        })

    for o in evidence["outliers"][:2]:
        monthly = o["amount"] / max(1, evidence["months"])
        recs.append({
            "action": f"Budget ahead for purchases like {o['merchant']}",
            "rationale": f"The {rupees(o['amount'])} charge on {o['date']} was "
                         f"{o['timesTypical']}x a typical one. Setting "
                         f"{rupees(monthly)} aside monthly absorbs the next one without "
                         f"denting a single month.",
            "impactPerMonth": round(monthly, 2),
            "effort": EFFORT_HABIT,
            "evidence": f"{o['merchant']} · {rupees(o['amount'])} on {o['date']}",
            "source": "analysis",
        })

    quality = evidence["dataQuality"]
    if quality["uncategorisedShare"] >= 50:
        # Ranked above everything with a rupee figure: until this is done the
        # coach is reading a statement it cannot interpret, and every category
        # number below it is describing a label rather than a habit.
        recs.append({
            "action": f"Categorise the {quality['uncategorisedShare']:.0f}% of spend "
                      f"sitting in 'Other'",
            "rationale": "Almost none of your transactions carry a category, so the coach "
                         "can see how much you spend but not on what. Categorising them — "
                         "or letting the app learn your merchants — turns this page from "
                         "totals into advice.",
            "impactPerMonth": None,
            "effort": EFFORT_ONE_OFF,
            "evidence": f"{quality['uncategorisedShare']:.0f}% of spend uncategorised",
            "prerequisite": True,
            "source": "analysis",
        })

    biggest = evidence["largestCharges"]
    if evidence["concentrationShare"] >= 40 and len(biggest) >= 3:
        smallest_of_the_big = biggest[-1]["amount"]
        recs.append({
            "action": f"Put a second pair of eyes on anything over "
                      f"{rupees(smallest_of_the_big)}",
            "rationale": f"Your {len(biggest)} largest payments are "
                         f"{evidence['concentrationShare']:.0f}% of everything you spend, "
                         f"the biggest being {rupees(biggest[0]['amount'])} to "
                         f"{biggest[0]['merchant'] or 'an unnamed payee'}. A rule that big "
                         f"payments wait a day covers most of your budget in one habit.",
            "impactPerMonth": None,
            "effort": EFFORT_ONE_OFF,
            "evidence": f"Top {len(biggest)} charges · "
                        f"{evidence['concentrationShare']:.0f}% of spend",
            "source": "analysis",
        })

    cash = next((c for c in evidence["channelTotals"] if c["channel"] == "ATM cash"), None)
    if cash and cash["share"] >= 15:
        recs.append({
            "action": "Trace where the ATM cash goes",
            "rationale": f"{rupees(cash['monthlyTotal'])}/month leaves as cash "
                         f"({cash['share']:.0f}% of spend), where no category or merchant "
                         f"can see it. Withdraw once a week instead of on demand and the "
                         f"amount becomes a decision rather than a habit.",
            # Visibility, not a saving — putting a rupee figure here would be
            # inventing a number the transactions never showed.
            "impactPerMonth": None,
            "effort": EFFORT_HABIT,
            "evidence": f"ATM cash · {rupees(cash['monthlyTotal'])}/month",
            "source": "analysis",
        })

    holds_at_floor = leakage["variable"] > 0 and evidence["discretionaryFloor"] is not None
    if holds_at_floor:
        recs.append({
            "action": f"Hold day-to-day spend at {rupees(evidence['discretionaryFloor'])}",
            "rationale": f"That is what your cheapest month actually cost, against an "
                         f"average of {rupees(evidence['habitualBaseline'])}. You have "
                         f"already lived a month at that number.",
            "impactPerMonth": round(leakage["variable"], 2),
            "effort": EFFORT_HABIT,
            "evidence": f"Cheapest month {rupees(evidence['discretionaryFloor'])} vs average "
                        f"{rupees(evidence['habitualBaseline'])}",
            "source": "analysis",
        })

    # Anything measured against income is only offered when the income figure
    # is real earnings. Advice built on an imported balance is advice built on
    # nothing, however confidently it reads.
    rate = evidence["savingsRate"]
    if rate is not None and 0 < rate < 20 and evidence["monthlyIncome"]:
        shortfall = (20 - rate) / 100 * evidence["monthlyIncome"]
        recs.append({
            "action": "Automate a transfer on salary day",
            "rationale": f"At {rate}% you are {rupees(shortfall)}/month short of the 20% "
                         f"benchmark. Moving it the day your salary lands beats trying not "
                         f"to spend it.",
            "impactPerMonth": round(shortfall, 2),
            "effort": EFFORT_ONE_OFF,
            "evidence": f"Savings rate {rate}% vs 20% benchmark",
            "source": "analysis",
        })

    # Prerequisites first — they gate the quality of everything under them —
    # then by rupee impact, with the actions that buy visibility rather than
    # money last. A recommendation without a figure is never ranked above one
    # that has earned a number.
    recs.sort(key=lambda r: (
        not r.get("prerequisite"),
        -(r["impactPerMonth"] if r["impactPerMonth"] is not None else -1),
    ))
    for position, rec in enumerate(recs, start=1):
        rec.setdefault("prerequisite", False)
        rec["priority"] = position
    return recs
