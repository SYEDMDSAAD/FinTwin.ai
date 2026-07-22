"""Prometheus instruments for the AI service.

The guardrail layer silently discards model output it cannot trust — the
right behaviour for the user, and invisible to the operator unless counted.
These series exist to answer the one question logs cannot: how often is the
model's work actually being used?

Scraped at /metrics (mounted in app.py); the scrape job lives in
ops/prometheus.yml alongside the backend's.
"""
from prometheus_client import Counter, Histogram

# How the coach message on the page was produced. "ai" is the only label where
# the model's prose reached the user; everything else fell back to the
# analysis layer. A rising non-ai share is the earliest sign of model rot.
COACH_GENERATIONS = Counter(
    "fintwin_ai_coach_generations_total",
    "Spending-coach generations, by how the coach message was produced",
    ["result"],  # ai | rejected | parse_failed | llm_error | no_data
)

# Tips the grounding layer refused. Cheap to emit, and the ratio against
# generations is the live measure of how much the model hallucinates on
# real traffic — the number the offline tests cannot know.
COACH_TIPS_DROPPED = Counter(
    "fintwin_ai_coach_tips_dropped_total",
    "Model tips discarded before display",
    ["reason"],  # ungrounded | restated
)

COACH_LLM_LATENCY = Histogram(
    "fintwin_ai_coach_llm_seconds",
    "Wall time of the coach's LLM call, including retries",
    # The Spring backend hangs up at 20s; buckets bracket that deadline so the
    # panel shows how close generations run to it.
    buckets=(1.0, 2.5, 5.0, 10.0, 15.0, 20.0, 30.0),
)

# Goal plans are persisted on the goal, so a bad one keeps being shown long
# after the generation that produced it — unlike the coach, which is recomputed
# on every page load. That makes the fallback share the metric to watch: it is
# the share of goals whose stored plan is not the model's work.
GOAL_PLAN_GENERATIONS = Counter(
    "fintwin_ai_goal_plan_generations_total",
    "Goal-plan generations, by how the narrative was produced",
    ["result"],  # ai | partial | rejected | parse_failed | llm_error
)

# Steps the grounding layer refused, for the same reason as the coach's: the
# offline tests cannot know how often real traffic makes the model invent an
# amount, and the deterministic sections silently paper over it.
GOAL_PLAN_ITEMS_DROPPED = Counter(
    "fintwin_ai_goal_plan_items_dropped_total",
    "Model-written plan items discarded before display",
    ["reason"],  # ungrounded | empty
)

# Second chances given to the model. Retries are invisible in the result
# labels — a retried generation that succeeds counts as "ai" — so without this
# series a prompt regression that doubles the retry rate looks like nothing
# happened, while every plan quietly costs twice the compute.
GOAL_PLAN_RETRIES = Counter(
    "fintwin_ai_goal_plan_retries_total",
    "Corrective second attempts after a rejected first answer",
    ["reason"],  # parse_failed | rejected
)

GOAL_PLAN_LLM_LATENCY = Histogram(
    "fintwin_ai_goal_plan_llm_seconds",
    "Wall time of the goal planner's LLM call, including retries",
    buckets=(1.0, 2.5, 5.0, 10.0, 15.0, 20.0, 30.0),
)

# A labelled counter emits nothing until its first increment, so a fresh pod
# scrapes as "series missing" rather than zero — which breaks rate() and makes
# dashboards lie by omission. Touch every known label value at import time.
for _result in ("ai", "rejected", "parse_failed", "llm_error", "no_data"):
    COACH_GENERATIONS.labels(result=_result)
for _reason in ("ungrounded", "restated"):
    COACH_TIPS_DROPPED.labels(reason=_reason)
for _result in ("ai", "partial", "rejected", "parse_failed", "llm_error"):
    GOAL_PLAN_GENERATIONS.labels(result=_result)
for _reason in ("ungrounded", "empty"):
    GOAL_PLAN_ITEMS_DROPPED.labels(reason=_reason)
for _reason in ("parse_failed", "rejected"):
    GOAL_PLAN_RETRIES.labels(reason=_reason)
