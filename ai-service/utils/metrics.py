"""Prometheus instruments for the AI service.

The guardrail layer silently discards model output it cannot trust — the
right behaviour for the user, and invisible to the operator unless counted.
These series exist to answer the one question logs cannot: how often is the
model's work actually being used?

Scraped at /metrics (mounted in app.py); the scrape job lives in
ops/prometheus.yml alongside the backend's.
"""
import logging

from prometheus_client import Counter, Histogram

from utils import llm_usage

logger = logging.getLogger(__name__)

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

# ── Token usage, every Ollama call ───────────────────────────────────────────
# The model is self-hosted, so tokens are never billed — they cost CPU time
# (the 20s deadline), shared capacity (one VM) and context window. These
# series come from the exact counts Ollama returns with every response,
# recorded by utils/ollama_client.py. Labelled by feature, never by user: one
# series per user would grow Prometheus without bound.
LLM_FEATURES = ("copilot", "advisor", "coach", "goal_plan", "report",
                "category_suggest", "investments", "other")

LLM_CALLS = Counter(
    "fintwin_ai_llm_calls_total",
    "Ollama calls that returned a response, by feature",
    ["feature"],
)

LLM_TOKENS = Counter(
    "fintwin_ai_llm_tokens_total",
    "Tokens processed by the model, by feature and direction",
    ["feature", "direction"],  # input | output
)

# Generation speed on this box. A drop means the VM is contended (parallel
# requests, another process) or a different model was swapped in.
LLM_TOKENS_PER_SECOND = Histogram(
    "fintwin_ai_llm_tokens_per_second",
    "Output tokens generated per second of generation time",
    ["feature"],
    # Low buckets for a CPU-only VM, high ones for a GPU box (~70-80 tok/s on
    # the dev machine), so both land in a real bucket rather than +Inf.
    buckets=(2.5, 5.0, 10.0, 15.0, 20.0, 30.0, 50.0, 75.0, 100.0, 150.0),
)

# Prompt tokens as a share of num_ctx. Ollama silently drops the *start* of a
# prompt that overflows the window — where the rules live — so observations in
# the top buckets are the measured version of ask()'s chars/3 warning.
LLM_CONTEXT_FILL = Histogram(
    "fintwin_ai_llm_context_fill_ratio",
    "Prompt tokens divided by the context window (num_ctx)",
    ["feature"],
    buckets=(0.25, 0.5, 0.75, 0.9, 1.0),
)


def record_llm_usage(feature: str, body: dict, num_ctx: int) -> None:
    """Record token usage from one non-streaming Ollama response body, in
    Prometheus and in the current request's per-user tally (utils/llm_usage.py).

    Never raises: a metrics bug must not fail the user's request.
    `prompt_eval_count` counts the whole prompt, cached prefix included
    (measured on Ollama 0.30.8: a repeated prompt and a resent conversation
    both report their full size). It is guarded anyway, since a missing count
    must not be recorded as a 0% context fill.
    """
    try:
        if feature not in LLM_FEATURES:
            feature = "other"
        prompt_tokens = int(body.get("prompt_eval_count") or 0)
        output_tokens = int(body.get("eval_count") or 0)
        eval_ns = int(body.get("eval_duration") or 0)

        llm_usage.add(feature, prompt_tokens, output_tokens)
        LLM_CALLS.labels(feature=feature).inc()
        LLM_TOKENS.labels(feature=feature, direction="input").inc(prompt_tokens)
        LLM_TOKENS.labels(feature=feature, direction="output").inc(output_tokens)
        if output_tokens and eval_ns:
            LLM_TOKENS_PER_SECOND.labels(feature=feature).observe(output_tokens / (eval_ns / 1e9))
        if prompt_tokens and num_ctx:
            LLM_CONTEXT_FILL.labels(feature=feature).observe(prompt_tokens / num_ctx)
    except Exception:  # noqa: BLE001 — observability must never break the feature
        logger.debug("Could not record LLM token usage", exc_info=True)


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
for _feature in LLM_FEATURES:
    LLM_CALLS.labels(feature=_feature)
    for _direction in ("input", "output"):
        LLM_TOKENS.labels(feature=_feature, direction=_direction)
