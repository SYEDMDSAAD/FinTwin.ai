"""Token counts for the current request, handed back to the backend.

Same contract as ai-service/utils/llm_usage.py: main.py returns the tally in
the X-LLM-Usage response header as compact JSON,
{"guard_scan": {"in": 812, "out": 143, "calls": 1}}, and the backend's
RestTemplate adds it to the user's daily totals (and enforces the daily
allowance before the next model call). Only counts leave, never text.
Feature names must match [a-z_]{1,32} or the backend ignores them.
"""
from contextvars import ContextVar

USAGE_HEADER = "X-LLM-Usage"

_current: ContextVar[dict | None] = ContextVar("guard_usage", default=None)


def start() -> dict:
    """A fresh tally for this request. Mutated in place so tasks see the same dict."""
    tally: dict = {}
    _current.set(tally)
    return tally


def add(feature: str, tokens_in: int, tokens_out: int, calls: int) -> None:
    tally = _current.get()
    if tally is None:
        return
    row = tally.setdefault(feature, {"in": 0, "out": 0, "calls": 0})
    row["in"] += tokens_in
    row["out"] += tokens_out
    row["calls"] += calls
