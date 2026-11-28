"""Gemini-on-Vertex provider: format conversion and behaviour, with a fake client.

No Google call is made. The fake records every request, so these tests pin
what is actually sent to Gemini, and it returns real SDK response objects.
"""
import json
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest
import requests
from google.genai import errors, types
from prometheus_client import REGISTRY

from utils import gemini_client as gc


def _response(*parts, finish=types.FinishReason.STOP, prompt_tokens=120, output_tokens=30,
              thoughts=10, block=None):
    return types.GenerateContentResponse(
        candidates=[types.Candidate(content=types.Content(role="model", parts=list(parts)),
                                    finish_reason=finish)] if parts or finish != types.FinishReason.STOP else [],
        prompt_feedback=types.GenerateContentResponsePromptFeedback(block_reason=block) if block else None,
        usage_metadata=types.GenerateContentResponseUsageMetadata(
            prompt_token_count=prompt_tokens, candidates_token_count=output_tokens,
            thoughts_token_count=thoughts),
    )


def _text(text, thought=False):
    return types.Part(text=text, thought=thought or None)


def _call(name, args=None, call_id=None):
    return types.Part(function_call=types.FunctionCall(name=name, args=args or {}, id=call_id),
                      thought_signature=b"sig")


class _FakeClient:
    def __init__(self, *responses, error=None):
        self.responses = list(responses)
        self.error = error
        self.requests = []
        self.models = MagicMock()
        self.models.generate_content.side_effect = self._generate

    def _generate(self, model, contents, config):
        self.requests.append({"model": model, "contents": contents, "config": config})
        if self.error:
            raise self.error
        return self.responses.pop(0)


def _fake(*responses, error=None):
    client = _FakeClient(*responses, error=error)
    return client, patch.object(gc, "_get_client", return_value=client)


TOOLS = [{"type": "function", "function": {
    "name": "get_budgets", "description": "The user's budgets",
    "parameters": {"type": "object", "properties": {"month": {"type": "string"}}}}}]


# ── Conversion ────────────────────────────────────────────────────────────────

def test_tool_schemas_become_one_gemini_tool():
    [tool] = gc._tools(TOOLS)
    [decl] = tool.function_declarations
    assert decl.name == "get_budgets"
    assert decl.description == "The user's budgets"
    assert decl.parameters_json_schema == TOOLS[0]["function"]["parameters"]
    assert gc._tools(None) is None


def test_a_tool_loop_keeps_the_models_turn_and_pairs_results_by_position():
    raw = types.Content(role="model", parts=[_call("get_budgets", call_id="c1"),
                                             _call("get_goals", call_id="c2")])
    messages = [
        {"role": "system", "content": "You are FinTwin."},
        {"role": "user", "content": "am I on track?"},
        {"role": "assistant", "content": "", "_gemini_content": raw,
         "tool_calls": [{"function": {"name": "get_budgets", "arguments": {}}},
                        {"function": {"name": "get_goals", "arguments": {}}}]},
        {"role": "tool", "content": '{"budgets": []}'},
        {"role": "tool", "content": '{"goals": []}'},
        {"role": "system", "content": "Quote figures exactly."},
    ]
    system, contents = gc._to_gemini(messages)

    assert system == "You are FinTwin."
    assert [c.role for c in contents] == ["user", "model", "user", "user"]
    assert contents[1] is raw                      # sent back unchanged, signatures and all
    results = contents[2].parts
    assert [(p.function_response.name, p.function_response.id) for p in results] == \
        [("get_budgets", "c1"), ("get_goals", "c2")]
    assert results[0].function_response.response == {"result": '{"budgets": []}'}
    # Vertex rejects a turn mixing results and text, so the rule gets its own
    assert contents[3].parts[0].text == "Quote figures exactly."


def test_history_without_raw_content_is_rebuilt_from_the_tool_calls():
    messages = [
        {"role": "user", "content": "budgets?"},
        {"role": "assistant", "content": "Checking.",
         "tool_calls": [{"function": {"name": "get_budgets", "arguments": '{"month": "2026-11"}'}}]},
        {"role": "tool", "content": "{}"},
    ]
    _, contents = gc._to_gemini(messages)
    model = contents[1]
    assert model.parts[0].text == "Checking."
    assert model.parts[1].function_call.name == "get_budgets"
    assert model.parts[1].function_call.args == {"month": "2026-11"}
    assert contents[2].parts[0].function_response.name == "get_budgets"


def test_earlier_chat_turns_and_empty_assistant_turns():
    messages = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": ""},       # nothing to send: dropped
        {"role": "user", "content": "again"},
    ]
    _, contents = gc._to_gemini(messages)
    assert [c.role for c in contents] == ["user"]
    assert [p.text for p in contents[0].parts] == ["hi", "again"]


# ── Requests and answers ──────────────────────────────────────────────────────

def test_ask_goes_to_the_fast_model_without_thinking():
    client, p = _fake(_response(_text("Keep three months of costs aside.")))
    with p:
        out = gc.ask("why an emergency fund?", max_tokens=200, temperature=0.1,
                     json_mode=True, timeout=12, feature="coach")
    assert out == "Keep three months of costs aside."
    req = client.requests[0]
    assert req["model"] == gc.FAST_MODEL == "gemini-3.5-flash-lite"
    assert req["contents"] == "why an emergency fund?"
    config = req["config"]
    assert config.max_output_tokens == 200        # no thinking to make room for
    assert config.thinking_config is None
    assert config.temperature == 0.1
    assert config.response_mime_type == "application/json"
    assert config.http_options.timeout == 12000
    assert config.http_options.retry_options.http_status_codes == [403, 429, 503]


def test_chat_thinks_on_gemini_3_with_the_default_temperature():
    client, p = _fake(_response(_text("ok")))
    with p:
        gc.chat([{"role": "user", "content": "x"}], max_tokens=300)
    req = client.requests[0]
    assert req["model"] == gc.MODEL == "gemini-3.7-flash"
    config = req["config"]
    assert config.thinking_config.thinking_level == types.ThinkingLevel.LOW
    assert config.max_output_tokens == 300 + gc._THINKING_HEADROOM
    assert config.temperature is None              # Google advises against lowering it


def test_gemini_2_gets_a_thinking_budget_and_the_callers_temperature():
    client, p = _fake(_response(_text("ok")))
    with p, patch.object(gc, "FAST_MODEL", "gemini-2.5-flash"):
        gc.ask("x", temperature=0.2)
    config = client.requests[0]["config"]
    assert config.thinking_config.thinking_budget == 1024
    assert config.temperature == 0.2


def test_chat_returns_tool_calls_and_the_raw_turn_without_thoughts():
    client, p = _fake(_response(_text("let me think", thought=True),
                                _call("get_budgets", {"month": "2026-11"}, "c9")))
    with p:
        reply = gc.chat([{"role": "system", "content": "S"}, {"role": "user", "content": "Q"}],
                        tools=TOOLS, feature="copilot")
    assert reply["content"] == ""                  # the model's thinking is never shown
    assert reply["tool_calls"] == [{"id": "c9", "function": {"name": "get_budgets",
                                                            "arguments": {"month": "2026-11"}}}]
    assert reply["_gemini_content"].parts[1].function_call.id == "c9"
    config = client.requests[0]["config"]
    assert config.system_instruction == "S"
    assert config.automatic_function_calling.disable is True


def test_a_safety_block_makes_ask_fail_and_chat_answer_empty():
    _, p = _fake(_response(finish=types.FinishReason.SAFETY),
                 _response(block=types.BlockedReason.SAFETY))
    with p:
        with pytest.raises(RuntimeError, match="no answer"):
            gc.ask("x")
        assert gc.chat([{"role": "user", "content": "x"}]) == {"role": "assistant", "content": ""}


def test_a_timeout_is_a_read_timeout_so_the_features_treat_it_as_out_of_time():
    _, p = _fake(error=httpx.ReadTimeout("slow"))
    with p, pytest.raises(requests.exceptions.ReadTimeout):
        gc.chat([{"role": "user", "content": "x"}], timeout=5)


def test_vertex_running_out_of_our_deadline_is_a_timeout_too():
    _, p = _fake(error=errors.ServerError(504, {"error": {"code": 504, "message": "Deadline expired",
                                                          "status": "DEADLINE_EXCEEDED"}}))
    with p, pytest.raises(requests.exceptions.ReadTimeout):
        gc.ask("x", timeout=15)


def test_api_errors_become_runtime_errors():
    _, p = _fake(error=errors.ClientError(403, {"error": {"code": 403, "message": "billing",
                                                          "status": "PERMISSION_DENIED"}}))
    with p, pytest.raises(RuntimeError, match="HTTP 403"):
        gc.ask("x")


def test_token_usage_counts_thinking_as_output():
    before = REGISTRY.get_sample_value("fintwin_ai_llm_tokens_total",
                                       {"feature": "report", "direction": "output"}) or 0
    _, p = _fake(_response(_text("ok"), output_tokens=77, thoughts=23))
    with p:
        gc.ask("prompt", feature="report")
    after = REGISTRY.get_sample_value("fintwin_ai_llm_tokens_total",
                                      {"feature": "report", "direction": "output"})
    assert after - before == 100


# ── Vertex AI only ────────────────────────────────────────────────────────────

def test_no_project_means_no_client_rather_than_an_api_key(monkeypatch):
    monkeypatch.setattr(gc, "_client", None)
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    with pytest.raises(RuntimeError, match="Vertex AI only"):
        gc._get_client()


def test_the_client_is_vertex_with_the_projects_credentials_even_if_a_key_is_set(monkeypatch):
    monkeypatch.setattr(gc, "_client", None)
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "my-project")
    monkeypatch.setenv("GOOGLE_API_KEY", "not-to-be-used")
    monkeypatch.delenv("GOOGLE_CLOUD_LOCATION", raising=False)
    creds = object()
    with patch("google.auth.default", return_value=(creds, "my-project")), \
            patch("google.genai.Client") as client:
        gc._get_client()
    kwargs = client.call_args.kwargs
    assert kwargs["vertexai"] is True
    assert kwargs["project"] == "my-project"
    assert kwargs["location"] == "global"
    assert kwargs["credentials"] is creds
    assert "api_key" not in kwargs
    monkeypatch.setattr(gc, "_client", None)


def test_gemini_is_the_default_provider():
    env = {k: v for k, v in os.environ.items() if k != "LLM_PROVIDER"}
    out = subprocess.run([sys.executable, "-c", "from utils import llm_client; print(llm_client.PROVIDER)"],
                         cwd=Path(__file__).resolve().parents[1], env=env,
                         capture_output=True, text=True, check=True).stdout.strip()
    assert out == "gemini"


# ── End to end ────────────────────────────────────────────────────────────────

def test_the_copilot_tool_loop_runs_end_to_end_on_gemini():
    """The advisor's real loop, with Gemini answering through this provider."""
    from chatbot import advisor
    client, p = _fake(
        _response(_call("get_budgets", {}, "c1")),
        _response(_text("Food is over budget by ₹1,200.")),
    )
    data = {"userId": 8, "income": 50000, "expenses": 30000, "savings": 20000, "toolToken": "tok"}
    with p, patch.object(advisor, "chat", gc.chat), \
            patch("chatbot.tools.backend_api.get", return_value={"budgets": [{"category": "Food"}]}) as get:
        trace = {}
        reply = advisor.generate_financial_advice("am I within budget?", data, "Budget Coach", trace)

    assert reply == "Food is over budget by ₹1,200."
    assert trace["tools"] == [{"name": "get_budgets", "args": {}, "ok": True}]
    assert get.call_args.args[2] == "tok"
    last = client.requests[1]["contents"][-1]
    assert last.role == "user"
    result = last.parts[0].function_response
    assert (result.name, result.id) == ("get_budgets", "c1")
    assert json.loads(result.response["result"]) == {"budgets": [{"category": "Food"}]}
