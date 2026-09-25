"""Token usage recorded from Ollama responses.

Ollama is mocked at the HTTP layer, so these tests check that ask()/chat()
read the counts Ollama returns, that recording never breaks a request, and
that each request's tally reaches the backend in the X-LLM-Usage header.
"""
import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from prometheus_client import REGISTRY

import app as app_module
from utils import llm_usage, ollama_client
from utils.metrics import record_llm_usage

OLLAMA_BODY = {
    "response": "  hello  ",
    "message": {"role": "assistant", "content": "hi"},
    "prompt_eval_count": 1024,
    "eval_count": 100,
    "eval_duration": 5_000_000_000,  # 5 s in nanoseconds -> 20 tokens/s
}


def _sample(name, **labels):
    return REGISTRY.get_sample_value(name, labels) or 0.0


def _tokens(feature, direction):
    return _sample("fintwin_ai_llm_tokens_total", feature=feature, direction=direction)


def _mock_post(body):
    response = MagicMock()
    response.json.return_value = body
    response.raise_for_status.return_value = None
    return patch.object(ollama_client.requests, "post", return_value=response)


def test_ask_records_tokens_for_its_feature():
    before_in, before_out = _tokens("coach", "input"), _tokens("coach", "output")
    before_calls = _sample("fintwin_ai_llm_calls_total", feature="coach")

    with _mock_post(OLLAMA_BODY):
        assert ollama_client.ask("prompt", num_ctx=2048, feature="coach") == "hello"

    assert _tokens("coach", "input") - before_in == 1024
    assert _tokens("coach", "output") - before_out == 100
    assert _sample("fintwin_ai_llm_calls_total", feature="coach") - before_calls == 1


def test_ask_observes_speed_and_context_fill():
    speed_before = _sample("fintwin_ai_llm_tokens_per_second_sum", feature="report")
    fill_count_before = _sample("fintwin_ai_llm_context_fill_ratio_count", feature="report")
    half_full_before = _sample("fintwin_ai_llm_context_fill_ratio_bucket", feature="report", le="0.5")

    with _mock_post(OLLAMA_BODY):
        ollama_client.ask("prompt", num_ctx=2048, feature="report")

    assert _sample("fintwin_ai_llm_tokens_per_second_sum", feature="report") - speed_before == pytest.approx(20.0)
    assert _sample("fintwin_ai_llm_context_fill_ratio_count", feature="report") - fill_count_before == 1
    # 1024 / 2048 = 0.5 lands in the le=0.5 bucket
    assert _sample("fintwin_ai_llm_context_fill_ratio_bucket", feature="report", le="0.5") - half_full_before == 1


def test_chat_records_against_its_4096_window():
    fill_before = _sample("fintwin_ai_llm_context_fill_ratio_sum", feature="copilot")

    with _mock_post(OLLAMA_BODY):
        assert ollama_client.chat([{"role": "user", "content": "hi"}], feature="copilot")["content"] == "hi"

    assert _sample("fintwin_ai_llm_context_fill_ratio_sum", feature="copilot") - fill_before == pytest.approx(0.25)


def test_missing_counts_record_the_call_but_skip_ratios():
    calls_before = _sample("fintwin_ai_llm_calls_total", feature="advisor")
    fill_before = _sample("fintwin_ai_llm_context_fill_ratio_count", feature="advisor")
    speed_before = _sample("fintwin_ai_llm_tokens_per_second_count", feature="advisor")

    record_llm_usage("advisor", {"response": "cached"}, 2048)

    assert _sample("fintwin_ai_llm_calls_total", feature="advisor") - calls_before == 1
    assert _sample("fintwin_ai_llm_context_fill_ratio_count", feature="advisor") == fill_before
    assert _sample("fintwin_ai_llm_tokens_per_second_count", feature="advisor") == speed_before


def test_unknown_feature_is_folded_into_other():
    before = _tokens("other", "output")
    record_llm_usage("made_up_feature", {"eval_count": 7}, 2048)
    assert _tokens("other", "output") - before == 7


def test_malformed_body_never_raises():
    record_llm_usage("coach", {"eval_count": "not a number"}, 2048)
    record_llm_usage("coach", None, 2048)  # type: ignore[arg-type]


def test_ask_default_feature_is_other():
    before = _tokens("other", "input")
    with _mock_post(OLLAMA_BODY):
        ollama_client.ask("prompt")
    assert _tokens("other", "input") - before == 1024


# ── Per-request tally, returned to the backend in X-LLM-Usage ────────────────

_KEY = {"x-internal-key": "test-internal-key"}


# Test-only routes: one sync (runs in a worker thread) and one async, so both
# ways FastAPI runs an endpoint are shown to carry the tally back.
@app_module.app.post("/_test/llm-usage-sync")
def _usage_sync():
    ollama_client.ask("p", feature="coach")
    ollama_client.ask("p", feature="coach")
    ollama_client.chat([{"role": "user", "content": "x"}], feature="copilot")
    return {"ok": True}


@app_module.app.post("/_test/llm-usage-async")
async def _usage_async():
    ollama_client.ask("p", feature="report")
    return {"ok": True}


_client = TestClient(app_module.app)


def test_sync_route_returns_per_feature_tally_in_header():
    with _mock_post(OLLAMA_BODY):
        r = _client.post("/_test/llm-usage-sync", headers=_KEY)
    assert r.status_code == 200
    assert json.loads(r.headers[llm_usage.USAGE_HEADER]) == {
        "coach": {"in": 2048, "out": 200, "calls": 2},
        "copilot": {"in": 1024, "out": 100, "calls": 1},
    }


def test_async_route_returns_tally_in_header():
    with _mock_post(OLLAMA_BODY):
        r = _client.post("/_test/llm-usage-async", headers=_KEY)
    assert json.loads(r.headers[llm_usage.USAGE_HEADER]) == {"report": {"in": 1024, "out": 100, "calls": 1}}


def test_tally_does_not_leak_between_requests():
    with _mock_post(OLLAMA_BODY):
        _client.post("/_test/llm-usage-sync", headers=_KEY)
        r = _client.post("/_test/llm-usage-async", headers=_KEY)
    assert set(json.loads(r.headers[llm_usage.USAGE_HEADER])) == {"report"}


def test_no_header_without_model_calls():
    assert llm_usage.USAGE_HEADER not in _client.get("/health").headers


def test_calls_outside_a_request_are_ignored_by_the_tally():
    # Evals and scripts call the model with no request open: nothing to attribute.
    llm_usage.add("coach", 10, 5)  # must not raise
