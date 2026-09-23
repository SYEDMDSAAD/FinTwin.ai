"""Executive report generation.

Three things shape this module.

One request, not four. The report used to make a separate LLM call per
section (summary, insights, risks, recommendations), each writing free prose.
The single structured call is not a latency win — measured against qwen2.5:3b
the four-call version ran ~4.3s and this one ~5.4s, both far inside the
backend's 20s read timeout. It is a quality and structure win: the model sees
every section at once, so risks stop restating insights, and one JSON reply
yields titled, severity-tagged findings the UI can rank and lay out. Four
independent prose blobs could not be ranked, badged or ordered.

Grounded figures. A 3B model writing about someone's money invents amounts.
The spending coach and goal planner already route their prose through
utils.grounding; the report did not, so a hallucinated rupee figure went
straight onto an "executive" page. Every generated item is checked against
the figures the prompt licensed, and anything ungrounded is replaced by
computed text rather than shown.

Period comparison. An executive report without a trend is a snapshot. The
caller supplies the previous period, and deltas are computed here so the
model can reference direction and the UI can render it without re-deriving.
"""
import json
import logging

from utils.grounding import amounts, figure_owners, is_grounded
from utils.ollama_client import ask

logger = logging.getLogger(__name__)

# Output budget for the single structured call. Enough for a summary plus six
# titled findings; measured at ~5.4s on qwen2.5:3b, well inside the backend's
# 20s read timeout. Raising it materially would put that budget at risk.
_MAX_TOKENS = 420
# The facts block plus the JSON skeleton runs long; Ollama silently drops the
# START of an over-long prompt, which for a rules-first prompt is the worst
# possible failure, so the window is sized explicitly.
_NUM_CTX = 4096

_SEVERITIES = {"high", "medium", "low"}


def _f(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _pct_change(current: float, previous: float):
    """Percent change, or None when there is no comparable base."""
    if previous is None or previous == 0:
        return None
    return round((current - previous) / abs(previous) * 100, 1)


def _build_trends(current: dict, previous: dict) -> list:
    """Period-over-period movement, comparing like with like.

    Both sides must describe the SAME kind of period — the caller compares the
    last complete month against the one before it. Comparing a 3-month average
    against a single month would report movement that is an artefact of the
    window, not of the user's behaviour.

    Only metrics with a genuine prior reading appear. Net worth has no history
    table, so it is absent rather than invented; a trend nobody measured is
    worse than no trend.

    `goodDirection` tells the UI which way is favourable — a rise in expenses
    and a rise in savings must not both render green.
    """
    if not previous or not current:
        return []

    spec = [
        ("Income", "income", "up"),
        ("Expenses", "expenses", "down"),
        ("Savings", "savings", "up"),
        ("Net Worth", "netWorth", "up"),
        ("Financial Score", "financialScore", "up"),
    ]

    trends = []
    for label, key, good in spec:
        now, prior = _f(current.get(key)), _f(previous.get(key))
        if not prior:
            continue
        change = _pct_change(now, prior)
        if change is None:
            continue
        trends.append({
            "label": label,
            "current": round(now, 2),
            "previous": round(prior, 2),
            "changePercent": change,
            "direction": "up" if now > prior else "down" if now < prior else "flat",
            "goodDirection": good,
        })
    return trends


def _facts_block(ctx: dict) -> str:
    """The licensed figures, one claim per bullet.

    utils.grounding.figure_owners only reads bullet lines — a bullet is one
    claim about one subject, so the figures on it genuinely belong to the
    entities on it. Prose would license any pairing.
    """
    lines = [
        f"- Monthly income: ₹{round(ctx['income'])}",
        f"- Monthly expenses: ₹{round(ctx['expenses'])}",
        f"- Monthly savings: ₹{round(ctx['savings'])} ({ctx['savings_rate']}% savings rate)",
        f"- Financial score: {ctx['financial_score']}/100",
        f"- Net worth: ₹{round(ctx['net_worth'])}",
        f"- Monthly leakage: ₹{round(ctx['monthly_leakage'])}",
        f"- Spending health: {ctx['spending_health']}",
    ]

    if ctx["predicted_expenses"]:
        lines.append(f"- Projected next-month expenses: ₹{round(ctx['predicted_expenses'])}")
    if ctx["predicted_savings"]:
        lines.append(f"- Projected next-month savings: ₹{round(ctx['predicted_savings'])}")

    for category, spend in ctx["top_categories"]:
        lines.append(f"- {category} spending: ₹{round(spend)}")

    for trend in ctx["trends"]:
        lines.append(
            f"- {trend['label']} moved {trend['changePercent']}% "
            f"from ₹{round(trend['previous'])} to ₹{round(trend['current'])}"
            if trend["label"] != "Financial Score"
            else f"- Financial Score moved {trend['changePercent']}% "
                 f"from {round(trend['previous'])} to {round(trend['current'])}"
        )

    for goal in ctx["goals"][:3]:
        if isinstance(goal, dict):
            lines.append(
                f"- Goal: ₹{round(_f(goal.get('targetAmount')))} target in "
                f"{goal.get('durationMonths', 0)} months, "
                f"{round(_f(goal.get('progressPercent')))}% complete "
                f"({goal.get('goalHealth', 'N/A')})"
            )

    return "\n".join(lines)


def _prompt(facts: str) -> str:
    return f"""You are FinTwin AI, writing an executive financial report for an Indian user.

FACTS (these are the only figures you may quote — never invent or derive a number):
{facts}

Write JSON with exactly this shape:
{{"summary":"","insights":[{{"title":"","detail":"","severity":""}}],"risks":[{{"title":"","detail":"","severity":""}}],"recommendations":[{{"title":"","detail":"","severity":""}}]}}

Rules:
- summary: 2 sentences on overall financial health and the single most important focus.
- insights: exactly 2. A pattern in spending, saving or goal progress.
- risks: exactly 2. Something that could go wrong, most serious first.
- recommendations: exactly 2. Each states a concrete action.
- title: at most 6 words, no figures.
- detail: ONE sentence quoting a figure from FACTS exactly as written there.
- severity: "high", "medium" or "low".

Return ONLY the JSON object, no markdown."""


# ── Computed fallbacks (used per-section when the model fails or drifts) ─────

def _computed_summary(ctx: dict) -> str:
    return (
        f"Your financial health score of {ctx['financial_score']}/100 reflects a "
        f"{ctx['savings_rate']}% savings rate on ₹{round(ctx['income'])} monthly income. "
        f"Reducing the ₹{round(ctx['monthly_leakage'])} monthly leakage is the fastest way "
        f"to strengthen your net worth of ₹{round(ctx['net_worth'])}."
    )


def _computed_insights(ctx: dict) -> list:
    top = ctx["top_categories"]
    items = []
    if top:
        category, spend = top[0]
        items.append({
            "title": "Largest spending category",
            "detail": f"{category} spending of ₹{round(spend)} is your biggest single "
                      f"outflow against ₹{round(ctx['expenses'])} monthly expenses.",
            "severity": "medium",
        })
    items.append({
        "title": "Savings rate",
        "detail": f"You are saving ₹{round(ctx['savings'])} a month, a "
                  f"{ctx['savings_rate']}% savings rate.",
        "severity": "low" if ctx["savings_rate"] >= 20 else "medium",
    })
    return items[:2]


def _computed_risks(ctx: dict) -> list:
    items = [{
        "title": "Recurring spending leakage",
        "detail": f"A monthly leakage of ₹{round(ctx['monthly_leakage'])} is quietly "
                  f"eroding your savings capacity.",
        "severity": "high" if ctx["monthly_leakage"] > 0 else "low",
    }]
    if ctx["savings"] <= 0:
        items.append({
            "title": "Spending exceeds income",
            "detail": f"Monthly expenses of ₹{round(ctx['expenses'])} outrun income of "
                      f"₹{round(ctx['income'])}, leaving no buffer.",
            "severity": "high",
        })
    else:
        items.append({
            "title": "Limited expense buffer",
            "detail": f"With spending health rated {ctx['spending_health']}, "
                      f"₹{round(ctx['expenses'])} of monthly expenses leaves little room "
                      f"for an unexpected cost.",
            "severity": "medium",
        })
    return items[:2]


def _computed_recommendations(ctx: dict) -> list:
    return [
        {
            "title": "Redirect the leakage",
            "detail": f"Move ₹{round(ctx['monthly_leakage'])} of monthly leakage into a "
                      f"recurring deposit or SIP so it compounds instead of disappearing.",
            "severity": "high" if ctx["monthly_leakage"] > 0 else "low",
        },
        {
            "title": "Commit savings to goals",
            "detail": f"Allocate your ₹{round(ctx['savings'])} monthly savings against your "
                      f"active goals before it is absorbed by discretionary spending.",
            "severity": "medium",
        },
    ]


# ── Validation ───────────────────────────────────────────────────────────────

def _clean_items(raw, allowed: set, owners: dict, limit: int = 2) -> list:
    """Keep only well-formed items whose figures the prompt licensed."""
    if not isinstance(raw, list):
        return []

    cleaned = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        detail = str(item.get("detail") or "").strip()
        if not title or not detail:
            continue

        # An invented figure on an executive report is worse than plain prose.
        if not is_grounded(detail, allowed, owners):
            logger.info("Report item dropped as ungrounded: %s", detail)
            continue

        severity = str(item.get("severity") or "").strip().lower()
        cleaned.append({
            "title": title,
            "detail": detail,
            "severity": severity if severity in _SEVERITIES else "medium",
        })
        if len(cleaned) == limit:
            break
    return cleaned


def _parse(text: str) -> dict:
    text = text.replace("```json", "").replace("```JSON", "").replace("```", "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in model response")
    return json.loads(text[start:end + 1])


# ── Entry point ──────────────────────────────────────────────────────────────

def generate_weekly_report(data: dict) -> dict:
    income = _f(data.get("income"))
    expenses = _f(data.get("expenses"))
    savings = _f(data.get("savings"))
    net_worth = _f(data.get("netWorth"))
    monthly_leakage = _f(data.get("monthlyLeakage"))
    predicted_expenses = _f(data.get("predictedExpenses"))
    predicted_savings = _f(data.get("predictedSavings"))
    financial_score = data.get("financialScore") or 0
    spending_health = data.get("spendingHealth") or "N/A"
    category_spending: dict = data.get("categorySpending") or {}
    goals: list = data.get("goals") or []
    previous: dict = data.get("previousPeriod") or {}
    # The comparable slice of the current period. Absent it, the headline
    # figures are used — correct only when the caller's previous period is the
    # same shape, so callers that trend should send both.
    current_period: dict = data.get("currentPeriod") or {
        "income": income, "expenses": expenses, "savings": savings,
        "netWorth": net_worth, "financialScore": financial_score,
    }

    savings_rate = round((savings / income) * 100, 1) if income > 0 else 0
    top_categories = sorted(category_spending.items(), key=lambda kv: kv[1], reverse=True)[:3]
    trends = _build_trends(current_period, previous)

    ctx = {
        "income": income,
        "expenses": expenses,
        "savings": savings,
        "savings_rate": savings_rate,
        "net_worth": net_worth,
        "monthly_leakage": monthly_leakage,
        "predicted_expenses": predicted_expenses,
        "predicted_savings": predicted_savings,
        "financial_score": financial_score,
        "spending_health": spending_health,
        "top_categories": top_categories,
        "goals": goals,
        "trends": trends,
    }

    facts = _facts_block(ctx)
    allowed = amounts(facts)
    owners = figure_owners(facts)

    summary = None
    insights = risks = recommendations = []
    degraded = False

    try:
        parsed = _parse(ask(_prompt(facts), max_tokens=_MAX_TOKENS, num_ctx=_NUM_CTX))

        candidate = str(parsed.get("summary") or "").strip()
        if candidate and is_grounded(candidate, allowed, owners):
            summary = candidate
        elif candidate:
            logger.info("Report summary dropped as ungrounded")

        insights = _clean_items(parsed.get("insights"), allowed, owners)
        risks = _clean_items(parsed.get("risks"), allowed, owners)
        recommendations = _clean_items(parsed.get("recommendations"), allowed, owners)
    except Exception as e:
        logger.warning("Report generation failed, using computed report: %s", e)
        degraded = True

    # Per-section fallback: a model that produced two good risks but no usable
    # recommendations should keep the risks rather than lose the whole report.
    if not summary:
        summary = _computed_summary(ctx)
        degraded = True
    if not insights:
        insights = _computed_insights(ctx)
        degraded = True
    if not risks:
        risks = _computed_risks(ctx)
        degraded = True
    if not recommendations:
        recommendations = _computed_recommendations(ctx)
        degraded = True

    # Most serious first — an executive skimming the top of the list should
    # see the worst thing.
    order = {"high": 0, "medium": 1, "low": 2}
    risks.sort(key=lambda r: order.get(r["severity"], 1))

    return {
        "summary": summary,
        "insights": insights,
        "risks": risks,
        "recommendations": recommendations,
        "trends": trends,
        # True when any section fell back to computed prose, so the UI can say
        # so instead of passing template text off as analysis.
        "degraded": degraded,
        "keyMetrics": {
            "netWorth": net_worth,
            "spendingHealth": spending_health,
            "monthlyLeakage": monthly_leakage,
            "financialScore": financial_score,
            "savingsRate": savings_rate,
            "predictedExpenses": predicted_expenses,
            "predictedSavings": predicted_savings,
        },
    }
