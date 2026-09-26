"""Claude-on-Bedrock provider: format conversion and behaviour, with a fake client.

No AWS call is made. The fake records every request, so these tests pin what
is actually sent to Claude, and it returns Claude-shaped responses.
"""
import json
from types import SimpleNamespace
from unittest.mock import patch

import anthropic
import httpx2
import pytest
import requests
from prometheus_client import REGISTRY

from utils import bedrock_client as bc


class _Block:
    def __init__(self, **data):
        self._data = data

    def to_dict(self):
        return dict(self._data)


def _response(*blocks, stop="end_turn", input_tokens=120, output_tokens=30):
    return SimpleNamespace(
        content=[_Block(**b) for b in blocks], stop_reason=stop,
        stop_details=SimpleNamespace(category="cyber") if stop == "refusal" else None,
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens,
                              cache_read_input_tokens=0, cache_creation_input_tokens=0))


class _FakeClient:
    def __init__(self, *responses, error=None):
        self.responses = list(responses)
        self.error = error
        self.requests = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def with_options(self, **_):
        return self

    def _create(self, **params):
        self.requests.append(params)
        if self.error:
            raise self.error
        return self.responses.pop(0)


def _fake(*responses, error=None):
    client = _FakeClient(*responses, error=error)
    return client, patch.object(bc, "_get_client", return_value=client)


# ── Conversion ────────────────────────────────────────────────────────────────

def test_tool_schemas_become_claude_tools():
    tools = [{"type": "function", "function": {"name": "get_budgets", "description": "All budgets",
                                               "parameters": {"type": "object", "properties": {}}}}]
    assert bc._tools(tools) == [{"name": "get_budgets", "description": "All budgets",
                                 "input_schema": {"type": "object", "properties": {}}}]


def test_a_tool_loop_converts_to_paired_tool_use_and_results():
    raw = [{"type": "thinking", "thinking": "", "signature": "sig"},
           {"type": "tool_use", "id": "toolu_1", "name": "get_portfolio", "input": {}}]
    messages = [
        {"role": "system", "content": "RULES"},
        {"role": "user", "content": "how are my stocks?"},
        {"role": "assistant", "content": "", "tool_calls": [{"id": "toolu_1", "function": {"name": "get_portfolio"}}],
         "_anthropic_content": raw},
        {"role": "tool", "content": '{"summary": "..."}'},
        {"role": "system", "content": "Quote the figures exactly."},
    ]
    system, out = bc._to_anthropic(messages)

    assert system == "RULES"
    assert out[0] == {"role": "user", "content": "how are my stocks?"}
    assert out[1] == {"role": "assistant", "content": raw}          # thinking passed back unchanged
    assert out[2]["role"] == "user"
    assert out[2]["content"][0] == {"type": "tool_result", "tool_use_id": "toolu_1", "content": '{"summary": "..."}'}
    assert out[2]["content"][1] == {"type": "text", "text": "Quote the figures exactly."}
    assert len(out) == 3                                               # roles alternate


def test_history_without_raw_content_gets_generated_ids_that_match():
    messages = [
        {"role": "user", "content": "q"},
        {"role": "assistant", "content": "", "tool_calls": [
            {"function": {"name": "get_goals", "arguments": "{}"}},
            {"function": {"name": "get_budgets", "arguments": {}}}]},
        {"role": "tool", "content": "goals"},
        {"role": "tool", "content": "budgets"},
    ]
    _, out = bc._to_anthropic(messages)
    ids = [b["id"] for b in out[1]["content"] if b["type"] == "tool_use"]
    results = [b["tool_use_id"] for b in out[2]["content"]]
    assert ids == results and len(set(ids)) == 2


def test_empty_assistant_turns_are_dropped():
    _, out = bc._to_anthropic([{"role": "user", "content": "a"}, {"role": "assistant", "content": ""},
                               {"role": "user", "content": "b"}])
    assert [m["role"] for m in out] == ["user"]
    assert out[0]["content"] == [{"type": "text", "text": "a"}, {"type": "text", "text": "b"}]


# ── Calls ─────────────────────────────────────────────────────────────────────

def test_ask_sends_what_claude_accepts():
    client, p = _fake(_response({"type": "text", "text": " A short answer. "}))
    with p:
        text = bc.ask("prompt", max_tokens=350, temperature=0.3, num_ctx=4096, feature="coach")
    assert text == "A short answer."
    sent = client.requests[0]
    assert "temperature" not in sent                          # rejected by this model family
    assert sent["max_tokens"] >= 4096                         # room for thinking + answer
    assert sent["output_config"] == {"effort": bc.EFFORT}
    assert sent["model"] == bc.MODEL


def test_chat_returns_tool_calls_and_the_raw_content():
    blocks = [{"type": "thinking", "thinking": "", "signature": "s"},
              {"type": "tool_use", "id": "toolu_9", "name": "get_budgets", "input": {}}]
    client, p = _fake(_response(*blocks, stop="tool_use"))
    with p:
        reply = bc.chat([{"role": "system", "content": "S"}, {"role": "user", "content": "budget?"}],
                        tools=[{"type": "function", "function": {"name": "get_budgets", "parameters": {}}}])
    assert reply["tool_calls"] == [{"id": "toolu_9", "function": {"name": "get_budgets", "arguments": {}}}]
    assert reply["_anthropic_content"] == blocks
    assert client.requests[0]["system"] == "S"
    assert client.requests[0]["tools"][0]["name"] == "get_budgets"


def test_a_refusal_makes_ask_fail_and_chat_answer_empty():
    _, p = _fake(_response({"type": "text", "text": ""}, stop="refusal"))
    with p, pytest.raises(RuntimeError):
        bc.ask("prompt")
    _, p = _fake(_response({"type": "text", "text": ""}, stop="refusal"))
    with p:
        assert bc.chat([{"role": "user", "content": "x"}])["content"] == ""


def test_a_timeout_is_a_read_timeout_so_the_features_treat_it_as_out_of_time():
    timeout = anthropic.APITimeoutError(request=httpx2.Request("POST", "https://example.invalid"))
    _, p = _fake(error=timeout)
    with p, pytest.raises(requests.exceptions.ReadTimeout):
        bc.ask("prompt", timeout=5)


def test_other_api_errors_become_runtime_errors():
    error = anthropic.APIConnectionError(request=httpx2.Request("POST", "https://example.invalid"))
    _, p = _fake(error=error)
    with p, pytest.raises(RuntimeError):
        bc.ask("prompt")


def test_token_usage_is_recorded_like_ollamas():
    before = REGISTRY.get_sample_value("fintwin_ai_llm_tokens_total",
                                       {"feature": "report", "direction": "output"}) or 0
    _, p = _fake(_response({"type": "text", "text": "ok"}, output_tokens=77))
    with p:
        bc.ask("prompt", feature="report")
    after = REGISTRY.get_sample_value("fintwin_ai_llm_tokens_total",
                                      {"feature": "report", "direction": "output"})
    assert after - before == 77


def test_the_copilot_tool_loop_runs_end_to_end_on_bedrock():
    """The advisor's real loop, with Claude answering through the Bedrock provider."""
    from chatbot import advisor
    client, p = _fake(
        _response({"type": "tool_use", "id": "toolu_1", "name": "get_budgets", "input": {}}, stop="tool_use"),
        _response({"type": "text", "text": "Food is over budget by ₹1,200."}),
    )
    data = {"userId": 8, "income": 50000, "expenses": 30000, "savings": 20000, "toolToken": "tok"}
    with p, patch.object(advisor, "chat", bc.chat), \
            patch("chatbot.tools.backend_api.get", return_value={"budgets": [{"category": "Food"}]}) as get:
        trace = {}
        reply = advisor.generate_financial_advice("am I within budget?", data, "Budget Coach", trace)

    assert reply == "Food is over budget by ₹1,200."
    assert trace["tools"] == [{"name": "get_budgets", "args": {}, "ok": True}]
    assert get.call_args.args[2] == "tok"
    second = client.requests[1]["messages"]
    assert second[-1]["content"][0]["type"] == "tool_result"
    assert second[-1]["content"][0]["tool_use_id"] == "toolu_1"
    assert json.loads(second[-1]["content"][0]["content"]) == {"budgets": [{"category": "Food"}]}
