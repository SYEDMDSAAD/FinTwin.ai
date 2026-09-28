"""Token usage of the current request, handed back to the backend.

The AI service doesn't know which user a request is for — the backend does,
from the JWT. So each request tallies the tokens its model calls used, per
feature, and a middleware in app.py returns the tally in the X-LLM-Usage
response header. The backend's RestTemplate interceptor reads it and adds it
to that user's daily totals (ai_token_usage), shown on the admin page.

Header value: compact JSON, {"coach": {"in": 812, "out": 143, "calls": 1}}.
Only counts leave this service, never prompt or answer text.
"""
import json
from contextvars import ContextVar

USAGE_HEADER = "X-LLM-Usage"

_current: ContextVar[dict | None] = ContextVar("llm_usage", default=None)


def start() -> dict:
    """Begin a fresh tally for this request and return it.

    The dict is mutated in place, never replaced: the endpoint runs in a copy
    of this context (a task, or a worker thread for sync routes), so a new
    value set there would not reach the middleware — a shared dict does.
    """
    tally: dict = {}
    _current.set(tally)
    return tally


def add(feature: str, input_tokens: int, output_tokens: int) -> None:
    """Add one model call to the current request's tally, if one is open."""
    tally = _current.get()
    if tally is None:
        return
    entry = tally.setdefault(feature, {"in": 0, "out": 0, "calls": 0})
    entry["in"] += input_tokens
    entry["out"] += output_tokens
    entry["calls"] += 1


def header_value(tally: dict) -> str:
    return json.dumps(tally, separators=(",", ":"))
