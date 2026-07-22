"""Savings-goal plans: deterministic arithmetic, model-written narrative.

The previous version handed a 3B model the raw figures and asked it for "3 to 4
short bullet points". Everything the user then read — the shortfall, the
timeline, which category to cut and by how much — was arithmetic the model did
in its head, unverifiably, at temperature 0.3. It was also the same four
sentences whether the goal was comfortably funded or physically impossible.

Here every number is computed in Python and every number is licensed: the
milestone schedule, the funding levers and the honest revised timeline are
derived from the user's own figures, and the model's only job is the prose
around them. Anything it writes that quotes a figure the prompt did not state
is dropped by the shared grounding guard rather than shown.
"""
import json
import logging
import re
import time

from spending_coach.analysis import classify_category
from utils.grounding import amounts, figure_owners, is_grounded
from utils.metrics import (
    GOAL_PLAN_GENERATIONS,
    GOAL_PLAN_ITEMS_DROPPED,
    GOAL_PLAN_LLM_LATENCY,
    GOAL_PLAN_RETRIES,
)
from utils.ollama_client import ask

logger = logging.getLogger(__name__)

# Bumped on any change to _build_prompt's wording or structure, so a shift in
# the grounding-rejection rate on the dashboard can be lined up against the
# prompt that caused it.
PROMPT_VERSION = "2026-07-22.4"

# The Spring backend abandons the call at 20s and stores its own fallback plan;
# a generation still running past that is compute nobody will ever see. Budget
# below it, connect time and JSON overhead included — and shared across BOTH
# attempts when the first answer earns a corrective retry.
LLM_TIMEOUT_S = 15.0

# A retry is only attempted when at least this much of the budget is left. A
# small model that took 12s to produce garbage will not produce sense in 3s,
# and a retry doomed to time out costs the user the fallback they could have
# had immediately.
RETRY_FLOOR_S = 5.0

# The prompt carries a lever list and a facts block, both figure-dense. Ollama
# handles an over-long prompt by silently dropping its *start* — here, the
# rules — so the window is sized rather than left at the 2048 default.
LLM_NUM_CTX = 4096

# Health thresholds mirror backend GoalMath.health exactly. The card renders
# that verdict as a coloured chip beside this plan; a planner with its own
# thresholds would tell the user "comfortably on track" under a red chip.
_EXCELLENT_COVERAGE = 150
_ON_TRACK_COVERAGE = 100
_AT_RISK_COVERAGE = 70

# What share of a discretionary category is realistically cuttable. Anchored
# low on purpose: a plan that asks someone to halve their food budget gets
# ignored, and an ignored plan saves nothing.
_TRIM_RATE = 0.15

# Below this a lever is noise — it costs the user a habit and returns a
# rounding error, and it crowds a real lever off the card.
_MIN_LEVER_MONTHLY = 200

# What kind of thing the user is saving for, inferred from the title they
# typed. Deterministic keyword matching, not the model: the type changes what
# the plan *says*, so guessing it with the same 3B model the guardrails exist
# to distrust would put the least reliable component in charge of the advice.
# First match wins, so more specific types sit above broader ones.
_GOAL_TYPES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("emergency", ("emergency", "rainy day", "safety net", "contingency", "buffer")),
    ("home", ("home", "house", "flat", "apartment", "property", "plot",
              "down payment", "downpayment")),
    ("vehicle", ("car", "bike", "vehicle", "scooter", "motorcycle")),
    ("travel", ("trip", "travel", "vacation", "holiday", "tour", "honeymoon")),
    ("education", ("education", "college", "university", "degree", "course",
                   "mba", "school", "tuition", "study", "studies")),
    ("wedding", ("wedding", "marriage", "shaadi", "engagement")),
    ("retirement", ("retirement", "retire", "pension")),
    ("gadget", ("phone", "iphone", "laptop", "macbook", "camera", "console",
                "playstation", "gadget")),
)

# One sentence of domain sense per type, spliced into the prompt. Numbers are
# deliberately absent — the grounding guard licenses figures, and guidance
# that smuggled one in would either be rejected or, worse, license it.
_TYPE_GUIDANCE = {
    "emergency": (
        "This is an emergency fund: it must stay instantly withdrawable, so advise "
        "keeping it in a separate account away from daily spending, and warn against "
        "locking it into anything with an exit penalty or market risk."
    ),
    "home": (
        "This is a house purchase: remind them that registration, stamp duty and "
        "furnishing add costs beyond the amount saved, so the target is a floor, "
        "not a ceiling."
    ),
    "vehicle": (
        "This is a vehicle purchase: insurance, registration and running costs "
        "continue after the purchase, so the plan should not leave them at exactly "
        "zero the month they buy."
    ),
    "travel": (
        "This is a trip with a hard date: flights and hotels are paid weeks before "
        "departure, so the money must be ready before the final month, not in it."
    ),
    "education": (
        "This is an education goal: fees arrive as large lump sums on fixed dates, "
        "so map savings to the fee schedule rather than spreading them evenly."
    ),
    "wedding": (
        "This is a wedding: vendors take deposits months ahead and costs routinely "
        "overshoot plans, so build the buffer early rather than at the end."
    ),
    "retirement": (
        "This is retirement saving: the horizon is long and consistency beats "
        "intensity, so protect the monthly habit over any single month's amount."
    ),
    "gadget": (
        "This is a purchase goal: prices of electronics fall and sales recur, so "
        "finishing a month late is cheap — breaking other goals to finish early "
        "is not."
    ),
}


# The same domain sense in the user's voice, for the fallback's "Biggest
# risk" line. Only used when the goal is funded — a goal with a shortfall has
# a concrete numeric risk, and a number beats a theme.
_TYPE_RISKS = {
    "emergency": ("The most likely failure is raiding this fund for things that are "
                  "not emergencies — the first withdrawal makes the second one easier."),
    "home": ("The most likely failure is forgetting that registration, stamp duty and "
             "furnishing land on top of the price — treat the target as a floor."),
    "vehicle": ("The most likely failure is spending the whole fund on the purchase and "
                "meeting insurance and registration with a card."),
    "travel": ("The most likely failure is the calendar — flights and hotels are paid "
               "weeks before you leave, so the real deadline is earlier than the goal's."),
    "education": ("The most likely failure is a fee deadline arriving mid-plan — fees "
                  "come as lump sums on fixed dates, not smooth monthly amounts."),
    "wedding": ("The most likely failure is scope — wedding costs overshoot plans "
                "routinely, and deposits are due months before the date."),
    "retirement": ("The most likely failure is pausing the habit 'for one month' and "
                   "never restarting it — consistency is the whole strategy here."),
    "gadget": ("The most likely failure is buying early on credit — a month's patience "
               "is cheaper than any EMI."),
}


def _goal_type(title: str) -> str | None:
    # Whole-word matching, not substring: "car" lives inside "healthcare" and
    # "scare", and a mistyped goal type produces confidently wrong advice —
    # worse than the generic plan an unmatched title gets.
    key = (title or "").lower()
    for goal_type, hints in _GOAL_TYPES:
        for hint in hints:
            if re.search(rf"\b{re.escape(hint)}\b", key):
                return goal_type
    return None


def _rupees(value) -> str:
    """Indian digit grouping — ₹1,50,000, not ₹150,000.

    The card renders every other amount with toLocaleString("en-IN"), so
    Western grouping inside the plan makes the same number look like a
    different one two lines apart.
    """
    n = round(value)
    sign = "-" if n < 0 else ""
    digits = str(abs(n))
    if len(digits) <= 3:
        return f"{sign}₹{digits}"
    head, tail = digits[:-3], digits[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return f"{sign}₹{','.join(groups)},{tail}"


def _parse_llm_json(text):
    """Salvage the JSON object out of whatever wrapper the model added."""
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


def _verdict(coverage: float) -> str:
    if coverage >= _EXCELLENT_COVERAGE:
        return "Excellent"
    if coverage >= _ON_TRACK_COVERAGE:
        return "On Track"
    if coverage >= _AT_RISK_COVERAGE:
        return "At Risk"
    return "Critical"


def _milestones(target: float, months: int, monthly_target: float) -> list[dict]:
    """Three checkpoints plus the finish line.

    A 60-month goal reviewed only at month 60 has already failed by the time
    anyone looks. Quarter points give the user a date to check against while
    the plan can still be corrected.
    """
    marks = sorted({max(1, round(months * f)) for f in (0.25, 0.5, 0.75)} | {months})
    return [
        {
            "month": m,
            "cumulative": round(min(monthly_target * m, target)),
            "share": round(min(monthly_target * m, target) / target * 100) if target > 0 else 0,
        }
        for m in marks
    ]


def _levers(categories: dict, gap: float) -> list[dict]:
    """Where the shortfall could actually come from, largest first.

    Only discretionary categories: telling someone to trim 15% off rent or an
    EMI is not advice, it is a default. Categories the classifier cannot place
    are left out too — an unclassified bucket is as likely to be a loan
    repayment as a hobby.
    """
    if gap <= 0 or not categories:
        return []

    candidates = []
    for name, spend in categories.items():
        if classify_category(name) != "discretionary":
            continue
        monthly_saving = round(float(spend) * _TRIM_RATE)
        if monthly_saving < _MIN_LEVER_MONTHLY:
            continue
        candidates.append({
            "category": name,
            "monthlySpend": round(float(spend)),
            "trimPercent": round(_TRIM_RATE * 100),
            "monthlySaving": monthly_saving,
            # What stays in the category after the trim. The model reliably
            # narrates a cut as "from ₹16,000 to ₹13,600", so the remainder
            # must be a licensed figure or its favourite phrasing — correct
            # arithmetic included — is rejected as a hallucination.
            "monthlyLeft": round(float(spend)) - monthly_saving,
            "gapShare": min(100, round(monthly_saving / gap * 100)),
        })

    candidates.sort(key=lambda c: c["monthlySaving"], reverse=True)
    return candidates[:3]


def _analyse(data: dict) -> dict:
    """Everything quantitative about the goal, computed once, in one place."""
    title = str(data.get("title") or "Goal").strip()
    target = float(data.get("targetAmount") or 0)
    months = max(int(data.get("durationMonths") or 1), 1)
    income = float(data.get("income") or 0)
    expenses = float(data.get("expenses") or 0)
    savings = float(data.get("savings") or 0)
    monthly_target = float(data.get("monthlyTarget") or 0)
    categories: dict = data.get("categorySpending") or {}
    other_goals: list = data.get("otherGoals") or []

    if monthly_target <= 0:
        monthly_target = target / months

    coverage = (savings / monthly_target * 100) if monthly_target > 0 else 100.0
    gap = max(0.0, monthly_target - savings)

    # What the goal actually costs once every other goal is also funded. A goal
    # that looks affordable alone is the commonest way a plan lies: three
    # "feasible" goals can need more than the user saves.
    committed_elsewhere = sum(float(g.get("monthlyTarget") or 0) for g in other_goals)
    total_commitment = monthly_target + committed_elsewhere
    overcommitted = committed_elsewhere > 0 and savings > 0 and total_commitment > savings

    # The honest alternative to "save more": keep saving what you save now and
    # accept a later date. Only meaningful while the user saves anything.
    realistic_months = None
    if 0 < savings < monthly_target and target > 0:
        realistic_months = int(-(-target // savings))  # ceil

    levers = _levers(categories, gap)
    lever_total = sum(lever["monthlySaving"] for lever in levers)

    return {
        "title": title,
        "goalType": _goal_type(title),
        "target": target,
        "months": months,
        "income": income,
        "expenses": expenses,
        "savings": savings,
        "monthlyTarget": round(monthly_target),
        "coverage": round(coverage),
        "gap": round(gap),
        "verdict": _verdict(coverage),
        "milestones": _milestones(target, months, monthly_target),
        "levers": levers,
        "leverTotal": lever_total,
        # Levers that close the gap turn "save ₹8,000 more somehow" into a
        # to-do list; levers that don't must not be dressed up as a solution.
        "gapClosable": bool(levers) and lever_total >= gap,
        "realisticMonths": realistic_months,
        "otherGoals": other_goals,
        "committedElsewhere": round(committed_elsewhere),
        "totalCommitment": round(total_commitment),
        "overcommitted": overcommitted,
        # Without verifiable income there is no savings rate and no verdict
        # worth printing; the plan says so rather than reading ₹0 as thrift.
        "incomeKnown": income > 0,
    }


# ── Prompt ────────────────────────────────────────────────────────────────────

def _lever_facts(a: dict) -> list[str]:
    """The only prompt lines where a figure belongs to a named subject.

    Ownership is checked per line, so a line must be about one thing. Most of
    the FACTS block is about the goal as a whole ("Required saving: ₹25,000")
    and its leading capitalised word would become a bogus owner — "₹25,000
    belongs to Required" — which then rejects every correct sentence that
    quotes it. Only category lines are handed to figure_owners().
    """
    return [
        f"- {lever['category']}: {_rupees(lever['monthlySpend'])} per month, and "
        f"cutting {lever['trimPercent']}% of it frees {_rupees(lever['monthlySaving'])} "
        f"per month, leaving {_rupees(lever['monthlyLeft'])} for it."
        for lever in a["levers"]
    ]


def _build_prompt(a: dict) -> str:
    """Facts as bullet lines, because a 3B model parrots prose and fumbles JSON.

    Every figure the model is allowed to use appears here, and appears on the
    bullet describing the thing it belongs to — that layout is what lets
    figure_owners() catch a real number pinned to the wrong category.
    """
    facts = [
        f"- Goal: {a['title']}, {_rupees(a['target'])} in {a['months']} months.",
        f"- Required saving: {_rupees(a['monthlyTarget'])} per month.",
    ]

    # Facts are written in second person because the model mirrors whatever
    # voice it reads: "They are short ₹7,000" in FACTS came back as "They are
    # short" in headlines addressed to the user. ("Your"/"you" are already in
    # the grounding guard's non-entity list, so the voice change is free.)
    if a["incomeKnown"]:
        facts.append(
            f"- Your monthly income is {_rupees(a['income'])}, spending is "
            f"{_rupees(a['expenses'])}, leaving {_rupees(a['savings'])} saved per month."
        )
    else:
        facts.append(
            "- Your income cannot be verified from this data, so there is no savings "
            "rate. Do not estimate one and do not comment on how much they earn."
        )

    if a["gap"] > 0:
        facts.append(
            f"- You are short {_rupees(a['gap'])} every month at the current saving rate."
        )
    else:
        headroom = round(a["savings"] - a["monthlyTarget"])
        facts.append(
            f"- Your saving already covers the goal with {_rupees(headroom)} to spare each month."
        )

    facts += _lever_facts(a)

    if a["realisticMonths"]:
        facts.append(
            f"- Saving {_rupees(a['savings'])} per month without any change reaches the "
            f"target in {a['realisticMonths']} months instead of {a['months']}."
        )

    if a["committedElsewhere"] > 0:
        facts.append(
            f"- Your other goals already need {_rupees(a['committedElsewhere'])} per month, "
            f"so all goals together need {_rupees(a['totalCommitment'])} per month."
        )

    multi_goal_rule = (
        "\n- The user has more than one goal, so one step must say how to split or "
        "sequence the money across goals."
        if a["otherGoals"] else ""
    )

    guidance = _TYPE_GUIDANCE.get(a["goalType"])
    type_rule = f"\n- {guidance}" if guidance else ""

    return f"""You are a senior personal finance advisor in India. Speak directly to the user — warm, direct, and specific.

The arithmetic below is already done and already correct. Your job is to tell the user what to DO about it, not to recalculate it.

FACTS
{chr(10).join(facts)}

RULES
- Never write a number or a percentage that does not appear in FACTS. Do not add, subtract or scale any figure.
- Never attach a figure to a category it does not belong to in FACTS.
- Never recommend a specific fund, stock, insurer or product.
- No greetings, no sign-off, no restating the goal amount back at them.{type_rule}{multi_goal_rule}

Write a headline: one sentence, max 20 words, saying plainly whether this goal works at their current saving rate.

Write exactly 2 steps, one sentence each, in the imperative. Each must be something they can do this month, and must name a figure or a category from FACTS. No platitudes like "cut unnecessary expenses" or "make a budget".

Write one risk: the single most likely reason this goal fails, in one sentence.

Return ONLY a JSON object shaped like this (replace the placeholders, and never copy "..." into your answer):
{{"headline":"...","steps":["...","..."],"risk":"..."}}"""


# ── Narrative (model) ─────────────────────────────────────────────────────────

def _fallback_narrative(a: dict) -> dict:
    """A real plan written from the numbers, for when the model can't be used.

    Deliberately not a generic apology: this is what the user sees whenever
    Ollama is down, and a plan is either useful without the model or the
    feature was never grounded to begin with.
    """
    if a["gap"] <= 0:
        headline = (
            f"Your current saving of {_rupees(a['savings'])} a month already covers this goal."
        )
        steps = [
            f"Automate a {_rupees(a['monthlyTarget'])} transfer on salary day so the goal "
            f"is funded before anything else is spent.",
            "Keep the surplus where it is rather than letting monthly spending rise to meet it.",
        ]
        risk = _TYPE_RISKS.get(a["goalType"]) or (
            "The most likely failure here is drift — spending the surplus month by "
            "month until the transfer stops clearing.")
    else:
        headline = (
            f"You are {_rupees(a['gap'])} a month short of the "
            f"{_rupees(a['monthlyTarget'])} this goal needs."
        )
        steps = []
        if a["levers"]:
            top = a["levers"][0]
            steps.append(
                f"Cut {top['trimPercent']}% from {top['category']} to free "
                f"{_rupees(top['monthlySaving'])} a month."
            )
        if a["realisticMonths"]:
            steps.append(
                f"Or keep saving {_rupees(a['savings'])} a month and move the deadline to "
                f"{a['realisticMonths']} months, which needs no change at all."
            )
        if not steps:
            steps.append(
                f"Set up a standing transfer for whatever you can hold every month and "
                f"raise it toward {_rupees(a['monthlyTarget'])} as income allows."
            )
        risk = (f"The most likely failure is treating the {_rupees(a['gap'])} gap as "
                f"something next month will fix.")

    return {"headline": headline, "steps": steps[:2], "risk": risk}


def _evaluate(text: str, a: dict, prompt: str,
              fallback: dict) -> tuple[dict | None, str, str]:
    """Judge one model answer: (narrative | None, outcome, problem).

    A None narrative is a retryable failure, and `problem` is the sentence the
    corrective prompt will quote back — written for the model, in plain words,
    because a 3B model repairs "your answer was not valid JSON" far more often
    than it repairs a stack trace.
    """
    parsed = _parse_llm_json(text)
    if not isinstance(parsed, dict):
        logger.info("Goal planner: unparseable model output")
        return None, "parse_failed", "it was not the single JSON object requested"

    allowed = amounts(prompt)
    owners = figure_owners("\n".join(_lever_facts(a)))

    def keep(value) -> str:
        if not isinstance(value, str) or not value.strip():
            GOAL_PLAN_ITEMS_DROPPED.labels(reason="empty").inc()
            return ""
        # The JSON template's "..." placeholder occasionally leaks into the
        # answer as a literal prefix ("... You are short ₹7,000"). Telling the
        # model not to copy it helps; stripping it is what guarantees it.
        value = re.sub(r"^[\s.…]+", "", value.strip())
        if not value:
            GOAL_PLAN_ITEMS_DROPPED.labels(reason="empty").inc()
            return ""
        if not is_grounded(value, allowed, owners):
            logger.info("Dropping ungrounded goal-plan item: %s", value)
            GOAL_PLAN_ITEMS_DROPPED.labels(reason="ungrounded").inc()
            return ""
        return value

    headline = keep(parsed.get("headline"))
    steps = [s for s in (keep(s) for s in (parsed.get("steps") or [])[:3]) if s]
    risk = keep(parsed.get("risk"))

    if not headline and not steps:
        return None, "rejected", (
            "it used amounts or percentages that do not appear in FACTS, or "
            "attached a figure to the wrong category"
        )

    # A partly-surviving response is still worth showing: the deterministic
    # sections carry the plan, and a computed headline above real model steps
    # reads better than throwing the steps away.
    outcome = "ai" if headline and len(steps) >= 2 else "partial"
    return {
        "headline": headline or fallback["headline"],
        "steps": steps or fallback["steps"],
        "risk": risk or fallback["risk"],
    }, outcome, ""


def _corrective_prompt(prompt: str, bad_text: str, problem: str) -> str:
    """The original prompt plus what went wrong — not a fresh roll of the dice.

    Showing the model its rejected answer is what separates a corrective retry
    from simply sampling twice: the second answer is conditioned on the
    mistake. The rejected text is truncated so a runaway first answer cannot
    push the rules out of the context window.
    """
    return (
        f"{prompt}\n\n"
        f"Your previous answer was rejected because {problem}.\n"
        f"Rejected answer:\n{bad_text[:600]}\n\n"
        f"Answer again. Copy figures exactly as they appear in FACTS, attach them "
        f"only to what they describe there, and return only the JSON object."
    )


def _narrative(a: dict) -> tuple[dict, str]:
    """Model prose where it survives grounding, computed prose where it doesn't.

    One corrective retry when the first answer fails parsing or grounding,
    inside the same total time budget — the backend's deadline does not care
    how many attempts were made. Returns (narrative, outcome); outcome is the
    metric label, decided here because this is the only place that knows how
    much of the model's work actually reached the user.
    """
    prompt = _build_prompt(a)
    fallback = _fallback_narrative(a)
    deadline = time.monotonic() + LLM_TIMEOUT_S

    attempt_prompt = prompt
    outcome = "llm_error"

    for attempt in (1, 2):
        remaining = deadline - time.monotonic()
        try:
            started = time.monotonic()
            try:
                text = ask(attempt_prompt, max_tokens=280,
                           timeout=remaining, num_ctx=LLM_NUM_CTX)
            finally:
                GOAL_PLAN_LLM_LATENCY.observe(time.monotonic() - started)
        except Exception as e:
            logger.warning("Goal planner LLM call failed: %s", e)
            return fallback, "llm_error"

        narrative, outcome, problem = _evaluate(text, a, prompt, fallback)
        if narrative is not None:
            return narrative, outcome

        if attempt == 1 and deadline - time.monotonic() >= RETRY_FLOOR_S:
            GOAL_PLAN_RETRIES.labels(reason=outcome).inc()
            attempt_prompt = _corrective_prompt(prompt, text, problem)
            continue
        break

    return fallback, outcome


# ── Rendering ─────────────────────────────────────────────────────────────────

def _render(a: dict, narrative: dict) -> str:
    """The plan as markdown.

    The stored contract is a single string — the plan is persisted on the goal
    and read by the copilot, exports and the card alike — so the structure
    lives in a fixed heading skeleton the UI styles rather than parses.
    """
    out = [narrative["headline"], ""]

    out.append("### Do this now")
    out += [f"- {step}" for step in narrative["steps"]]
    out.append("")

    # Bullets rather than a markdown table: react-markdown ships without
    # remark-gfm, so a table renders as literal pipes on the card. This shape
    # is parsed back into a milestone track by the UI and still reads correctly
    # anywhere the plan is shown as plain text.
    out.append("### Milestones")
    for m in a["milestones"]:
        out.append(f"- Month {m['month']} — {_rupees(m['cumulative'])} saved ({m['share']}%)")
    out.append("")

    if a["levers"]:
        out.append("### Where the money comes from")
        for lever in a["levers"]:
            out.append(
                f"- **{lever['category']}** — trimming {lever['trimPercent']}% of "
                f"{_rupees(lever['monthlySpend'])} frees **{_rupees(lever['monthlySaving'])}/mo**, "
                f"covering {lever['gapShare']}% of the gap."
            )
        if not a["gapClosable"]:
            # Stating the shortfall that survives every lever is the whole
            # point of listing them; without it the section reads as a solution.
            out.append(
                f"- Together these cover {_rupees(a['leverTotal'])} of the "
                f"{_rupees(a['gap'])} monthly gap."
            )
        out.append("")

    if a["realisticMonths"]:
        out.append("### The honest timeline")
        out.append(
            f"- At {_rupees(a['savings'])}/month with no changes, this goal completes in "
            f"**{a['realisticMonths']} months**, not {a['months']}."
        )
        out.append("")

    if a["overcommitted"]:
        out.append("### Watch out")
        out.append(
            f"- All your goals together need {_rupees(a['totalCommitment'])}/month but you "
            f"save {_rupees(a['savings'])}/month — something has to give."
        )
        out.append("")

    out.append("### Biggest risk")
    out.append(f"- {narrative['risk']}")

    return "\n".join(out).strip()


# ── Entry point ───────────────────────────────────────────────────────────────

def generate_goal_plan(data: dict) -> str:
    a = _analyse(data)
    narrative, outcome = _narrative(a)
    GOAL_PLAN_GENERATIONS.labels(result=outcome).inc()
    return _render(a, narrative)
