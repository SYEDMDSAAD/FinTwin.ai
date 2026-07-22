import json
import logging
import re
import time

from spending_coach.analysis import analyse, classify_category, estimate_leakage
from spending_coach.insights import build_insights, build_recommendations, label
from utils.metrics import COACH_GENERATIONS, COACH_LLM_LATENCY, COACH_TIPS_DROPPED
# The grounding primitives live in utils.grounding — the goal planner runs the
# same check on its own model output, and two copies of a hallucination guard
# means one of them silently rots. Imported under the original private names
# so the rest of this module (and its tests) read unchanged.
from utils.grounding import (
    amounts as _amounts,
    canon_figure as _canon_figure,
    entities as _entities,
    figure_owners as _figure_owners,
    is_grounded,
)
from utils.ollama_client import ask

logger = logging.getLogger(__name__)

# Bumped on any change to _build_prompt's wording or structure, and stamped
# into every response's coverage block — so a shift in grounding-rejection
# rate on the dashboard can be lined up against the prompt that caused it.
PROMPT_VERSION = "2026-07-21.1"

# The Spring backend abandons the call at 20s (AiServiceConfig read timeout)
# and serves its statistical fallback; any generation still running past that
# is compute nobody will see. Budget below it, connect time and JSON overhead
# included.
LLM_TIMEOUT_S = 15.0

# The coach prompt embeds findings built from real bank narrations and can run
# well past the old 2048-token default — which Ollama handles by silently
# dropping the *start* of the prompt, i.e. exactly the rules section.
LLM_NUM_CTX = 4096


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


def ground_tips(tips: list[str], prompt: str) -> list[str]:
    """Drop tips that misuse the analysis layer's figures.

    A 3B model pads a tip it has nothing left to say in three ways: inventing
    arithmetic ("cut ₹14,500 to ₹3,700"), pinning a real figure to the wrong
    merchant, and restating the tip before it. All three are caught here, and
    the emptied slots are refilled from the evidence tips by _top_up().
    """
    allowed = _amounts(prompt)
    owners = _figure_owners(prompt)
    kept: list[str] = []
    covered: set[str] = set()

    for tip in tips:
        if not is_grounded(tip, allowed, owners):
            logger.info("Dropping ungrounded tip: %s", tip)
            COACH_TIPS_DROPPED.labels(reason="ungrounded").inc()
            continue

        entities = _entities(tip)
        if entities and entities <= covered:
            logger.info("Dropping tip restating an earlier one: %s", tip)
            COACH_TIPS_DROPPED.labels(reason="restated").inc()
            continue

        covered |= entities
        kept.append(tip)

    return kept


def _health(savings_rate) -> str:
    """A verdict, or an honest refusal to give one.

    Spending health here means "how much of what you earn do you keep", so
    without trustworthy earnings there is no verdict to give. Printing
    "Excellent" from an imported opening balance would be the page's single
    most confident lie.
    """
    if savings_rate is None:
        return "Unrated"
    if savings_rate >= 30:
        return "Excellent"
    if savings_rate >= 15:
        return "Good"
    if savings_rate >= 5:
        return "Average"
    return "Poor"


def _rupees(value) -> str:
    return f"₹{round(value):,}"


def _findings(evidence: dict, leakage: dict) -> list[str]:
    """The evidence pack as short factual lines the model has to work from.

    Written as prose rather than raw JSON: the 3B model reliably parrots
    numbers it can read in a sentence, and hallucinates less than when it has
    to navigate nested objects.
    """
    lines = []

    # Committed spend is summarised once in the snapshot as off-limits; listing
    # every rent and EMI line here would crowd out the findings advice can act
    # on, and a 3B model tends to seize on the biggest number it can see.
    def actionable(category: str) -> bool:
        return classify_category(category) != "fixed"

    for t in evidence["trends"]:
        if t["deltaPct"] is None or abs(t["deltaPct"]) < 15 or not actionable(t["category"]):
            continue
        direction = "up" if t["delta"] > 0 else "down"
        lines.append(
            f"- {label(t['category'])} is {direction} {abs(t['deltaPct'])}% last month "
            f"({_rupees(t['latestMonth'])} vs {_rupees(t['priorAverage'])} average before)."
        )

    for r in evidence["recurring"]:
        if not actionable(r["category"]):
            continue
        lines.append(
            f"- Cancellable subscription: {r['merchant']} ({r['category']}), "
            f"{_rupees(r['typicalAmount'])} in each of {r['monthsSeen']} months."
        )

    for o in evidence["outliers"]:
        reference = f"typical {o['category']}" if o["basis"] == "category" else "typical"
        lines.append(
            f"- One-off: {_rupees(o['amount'])} at {o['merchant']} on {o['date']}, "
            f"{o['timesTypical']}x their {reference} charge."
        )

    shown = 0
    for m in evidence["topMerchants"]:
        # A merchant visited less than monthly is a purchase, not a habit — it
        # is already covered as a one-off above, and amortising it into a
        # "per month" line invites advice to cut spending that isn't recurring.
        if shown == 3 or not actionable(m["category"]) or m["visitsPerMonth"] < 1:
            continue
        lines.append(
            f"- {m['merchant']}: {_rupees(m['monthlyTotal'])}/month across "
            f"{m['visitsPerMonth']} visits, {_rupees(m['averageTicket'])} average."
        )
        shown += 1

    for c in evidence["channelTotals"][:3]:
        if c["channel"] == "Other":
            continue
        lines.append(
            f"- {c['channel']}: {_rupees(c['monthlyTotal'])}/month, "
            f"{c['share']:.0f}% of all spend across {c['count']} charges."
        )

    if evidence["discretionaryFloor"] is not None:
        # Both figures exclude one-offs and cover the same months, or the
        # comparison measures a spike or a half-month rather than the habit.
        lines.append(
            f"- Day-to-day discretionary spend averages "
            f"{_rupees(evidence['habitualBaseline'])}/month, and their cheapest month "
            f"ran {_rupees(evidence['discretionaryFloor'])}."
        )

    if leakage["subscriptions"] > 0:
        lines.append(
            f"- Cancellable subscriptions total {_rupees(leakage['subscriptions'] * 2)}/month."
        )

    # The client runs a 2048-token context; the findings are ordered strongest
    # first, so truncating here drops the weakest evidence rather than risking
    # a prompt that crowds out the response.
    return lines[:12]


def _build_prompt(evidence: dict, leakage: dict, health: str) -> str:
    findings = _findings(evidence, leakage)
    quality = evidence["dataQuality"]

    if quality["uncategorisedShare"] >= 50:
        # Without categories nothing can be called committed or discretionary,
        # so the model is told the split does not exist rather than handed a
        # ₹0-committed figure it would read as "none of this is rent".
        fixed_note = (
            f"Their transactions are {quality['uncategorisedShare']:.0f}% uncategorised, so "
            f"committed spend (rent, EMI, bills) cannot be told apart from discretionary "
            f"spend. Never describe any amount as discretionary or as safe to cut."
        )
    else:
        fixed_note = (
            f"{_rupees(evidence['monthlyFixed'])}/month is committed (rent, EMI, insurance, "
            f"utilities) and cannot be cut — never suggest touching it. "
            f"{_rupees(evidence['monthlyDiscretionary'])}/month is discretionary; that is the "
            f"only money advice can move."
        )

    if evidence["savingsRate"] is None:
        income_note = ("Income cannot be verified from this data, so there is no savings "
                       "rate and no health verdict. Do not estimate either, and do not "
                       "comment on how much they save or invest.")
    else:
        income_note = (f"Monthly income: {_rupees(evidence['monthlyIncome'])} · "
                       f"Savings rate: {evidence['savingsRate']}% (assessed as {health})")

    coverage = (
        f"Data covers {evidence['months']} month(s) and "
        f"{evidence['transactionCount']} expenses — confidence {evidence['confidence']}."
    )
    hedge = (
        "\nConfidence is low, so hedge: say what the data suggests, not what is certain."
        if evidence["confidence"] == "low" else ""
    )
    caveats = evidence["dataQuality"]["caveats"]
    if caveats:
        # Without this the model reads an import artefact as a triumph and
        # congratulates the user on a 96% savings rate.
        hedge += "\nThe data has known limits: " + " ".join(caveats) + \
                 " Do not celebrate figures these caveats undermine."

    return f"""You are a senior personal finance advisor with 15 years of experience helping Indians build wealth. Speak directly to the user — confident, warm, and precise.

An analysis engine has already examined every transaction. Your job is to explain and act on its findings, NOT to invent new ones. Every number you write must appear below verbatim. Do not compute new figures.

SNAPSHOT
- Monthly spend: {_rupees(evidence['monthlyExpense'])}
- {income_note}
- Recoverable per month: {_rupees(leakage['monthly'])}
- {fixed_note}
- {coverage}

FINDINGS
{chr(10).join(findings) if findings else "- No notable patterns beyond the totals above."}

RULES
- Only the FINDINGS are findings. The committed total is context; never call it a problem, an outlier or a place to cut.
- Never state a number or a percentage that does not appear above. Do not add, subtract or scale figures, and do not invent targets like "cut by 20%".
- Say nothing about a merchant beyond what its finding says.
- Never recommend a specific investment, fund or product. You are not their financial adviser.

Write a coachMessage (2-3 sentences, max 90 words): open with the single strongest finding above, and end with one concrete step for this week tied to a number from the findings.

Write exactly 2 tips, 1-2 sentences each. Each tip must act on a different finding and name that merchant, category or amount. Tell the user exactly what to do — no platitudes like "track your spending" or "make a budget".{hedge}

Return ONLY this JSON (no markdown, no extra text):
{{"coachMessage":"your message here","tips":["tip 1","tip 2"]}}"""


def generate_spending_coach(transactions):
    evidence = analyse(transactions or [])

    if evidence["transactionCount"] == 0:
        COACH_GENERATIONS.labels(result="no_data").inc()
        return {
            "spendingHealth": "Unknown",
            "monthlyLeakage": 0,
            "tips": [],
            "coachMessage": "No spending data available.",
            "coachMessageSource": "analysis",
            "insights": [],
            "recommendations": [],
            "leakageBreakdown": {},
            "snapshot": {},
            "coverage": _coverage(evidence),
        }

    leakage = estimate_leakage(evidence)
    health = _health(evidence["savingsRate"])
    recommendations = build_recommendations(evidence, leakage)
    prompt = _build_prompt(evidence, leakage, health)
    message = ""

    # Exactly one result label per generation, decided where the truth is known.
    outcome = "llm_error"
    try:
        started = time.monotonic()
        try:
            text = ask(prompt, max_tokens=350,
                       timeout=LLM_TIMEOUT_S, num_ctx=LLM_NUM_CTX)
        finally:
            COACH_LLM_LATENCY.observe(time.monotonic() - started)

        parsed = _parse_llm_json(text)
        if not parsed:
            outcome = "parse_failed"
            raise ValueError("Parse failed")

        # The model is asked for two tips and the analysis layer supplies the
        # rest. A 3B model padding to four invents arithmetic and contradicts
        # itself ("cancel Spotify, it is non-cancellable"); two is what it can
        # write well, and the computed recommendations are stronger than its
        # padding because they carry a rupee impact it cannot work out.
        suggestions = ground_tips(_normalize_tips(parsed.get("tips", [])), prompt)[:2]
        recommendations = _merge_ai_suggestions(recommendations, suggestions)

        message = parsed.get("coachMessage", "")
        if message and not is_grounded(message, _amounts(prompt), _figure_owners(prompt)):
            logger.info("Coach message misused the findings, using fallback: %s", message)
            message = ""
        outcome = "ai" if message else "rejected"

    except Exception as e:
        logger.warning("Spending coach LLM/parse failed, using fallback: %s", e)

    COACH_GENERATIONS.labels(result=outcome).inc()

    return {
        "spendingHealth": health,
        "monthlyLeakage": leakage["monthly"],
        "coachMessage": message or _fallback_message(evidence, leakage),
        # The page badges this line by author. When the model's message is
        # rejected or it never answered, the sentence below is written by the
        # analysis layer, and labelling that "AI written" would be a lie about
        # where the user's advice came from.
        "coachMessageSource": "ai" if message else "analysis",
        # Plain sentences for any caller still reading the original contract.
        "tips": [f"{r['action']}. {r['rationale']}".strip(". ").replace("..", ".")
                 for r in recommendations[:4]],
        "insights": build_insights(evidence, leakage),
        "recommendations": recommendations[:6],
        "leakageBreakdown": leakage,
        "snapshot": {
            "monthlyIncome": evidence["monthlyIncome"],
            "monthlyExpense": evidence["monthlyExpense"],
            "monthlyFixed": evidence["monthlyFixed"],
            "monthlyDiscretionary": evidence["monthlyDiscretionary"],
            "savingsRate": evidence["savingsRate"],
            "expenseByMonth": evidence["expenseByMonth"],
            "categoryTotals": dict(list(evidence["categoryTotals"].items())[:6]),
        },
        "coverage": _coverage(evidence),
    }


def _coverage(evidence: dict) -> dict:
    """What the figures are built from, so the page can say so out loud."""
    quality = evidence.get("dataQuality", {})
    return {
        "months": evidence["months"],
        "monthKeys": evidence["monthKeys"],
        "transactions": evidence["transactionCount"],
        "confidence": evidence["confidence"],
        "uncategorisedShare": quality.get("uncategorisedShare", 0.0),
        "caveats": quality.get("caveats", []),
        # Which prompt produced this response — stamped so a quality shift in
        # stored/monitored output can be traced to the prompt change behind it.
        "promptVersion": PROMPT_VERSION,
    }


def _merge_ai_suggestions(recommendations: list[dict], suggestions: list[str]) -> list[dict]:
    """Append the model's suggestions after the computed ones.

    Computed recommendations lead because they carry a rupee impact and a
    ranking; the model's are kept only where they raise something the
    computed set never mentioned, which is where a language model is
    genuinely additive rather than decorative.
    """
    covered = set().union(*(_entities(r["action"] + " " + r["rationale"])
                            for r in recommendations)) if recommendations else set()

    for suggestion in suggestions:
        entities = _entities(suggestion)
        if entities and entities <= covered:
            continue
        covered |= entities
        recommendations.append({
            "action": suggestion,
            "rationale": "",
            "impactPerMonth": None,
            "effort": None,
            "priority": len(recommendations) + 1,
            "evidence": "",
            "source": "ai",
        })

    return recommendations


def _fallback_message(evidence: dict, leakage: dict) -> str:
    """The coach's read when the model has not earned the byline.

    Every clause is gated on the data supporting it: no savings rate without
    verified income, and no promise that committed bills are untouched when
    nothing is categorised well enough to know which bills those are.
    """
    rate = evidence["savingsRate"]
    categorised = evidence["dataQuality"]["uncategorisedShare"] < 50
    parts = []

    if rate is not None:
        verdict = "well above" if rate >= 30 else "close to" if rate >= 20 else "below"
        parts.append(f"Your savings rate stands at {rate}% — {verdict} the "
                     f"recommended 20% benchmark.")
    else:
        parts.append(f"You are spending {_rupees(evidence['monthlyExpense'])} a month. "
                     f"Your income could not be verified from this data, so there is no "
                     f"savings rate to report yet.")

    top = next(iter(evidence["categoryMonthly"]), None)
    if top and categorised:
        parts.append(f"Your largest outflow is {top} at "
                     f"{_rupees(evidence['categoryMonthly'][top])}/month.")

    if leakage["monthly"] > 0:
        # Only claim the committed bills are safe where they can be identified.
        safety = (" without touching your committed bills" if categorised else
                  ", though with your transactions uncategorised this may include "
                  "rent and bills")
        parts.append(f"Roughly {_rupees(leakage['monthly'])} a month is the gap between "
                     f"an average month and your cheapest one{safety}.")

    return " ".join(parts)
