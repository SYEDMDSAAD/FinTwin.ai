"""The real ADK pipeline (Runner, sessions, tools, answer shapes), with a scripted
model in place of Gemini so it runs offline."""
import asyncio
import json

import pytest
from google.adk.models import BaseLlm, LlmResponse
from google.adk.models._capabilities import LlmCapabilities
from google.genai import types

import rules
import usage
from agents import brain, schemas
from flows import consult

PLAN = {"goals": [{"goal": "Goa trip", "amount": 6000}], "buffer": 2500, "weekly": [5500] * 4, "message": "ok"}
STATE = {"budgets": [{"category": "Food", "limit": 6000, "spent": 5750, "essential": False}],
         "goals": [{"title": "Goa trip", "target": 30000, "saved": 12000, "monthly_target": 6000}]}


def _usage(i, o):
    return types.GenerateContentResponseUsageMetadata(prompt_token_count=i, candidates_token_count=o)


def answer(obj, tokens=(120, 30)):
    return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=json.dumps(obj))]),
                       usage_metadata=_usage(*tokens))


def tool_call(name, args=None):
    return LlmResponse(content=types.Content(role="model", parts=[
        types.Part(function_call=types.FunctionCall(name=name, args=args or {}))]), usage_metadata=_usage(50, 5))


class ScriptedLlm(BaseLlm):
    model: str = "scripted"
    native: bool = True          # True: like Gemini on Vertex; False: like the Gemini API (AI Studio)
    script: list = []
    requests: list = []

    @property
    def capabilities(self) -> LlmCapabilities:
        return LlmCapabilities(output_schema_and_tools=self.native)

    async def generate_content_async(self, llm_request, stream=False):
        self.requests.append(llm_request)
        item = self.script.pop(0)
        if isinstance(item, BaseException):
            raise item
        yield item


def texts(request) -> list[str]:
    return [p.text for c in request.contents for p in (c.parts or []) if p.text]


def run(coro):
    return asyncio.run(coro)


def test_an_answer_comes_back_through_the_real_runner():
    llm = ScriptedLlm(script=[answer({"decision": "pause", "message": "This takes Food ₹200 over.",
                                      "show_wishlist": False})])
    tally = usage.start()
    got = run(brain.Brain(model=llm).conversation("scan").ask("FACTS: {}"))
    assert got == schemas.ScanDecision(decision="pause", message="This takes Food ₹200 over.", show_wishlist=False)
    assert tally == {"guard_scan": {"in": 120, "out": 30, "calls": 1}}

    request = llm.requests[0]
    assert request.config.response_mime_type == "application/json"     # Gemini is held to the shape
    assert request.config.response_schema is not None
    assert "Spend Guard" in str(request.config.system_instruction)
    assert request.config.thinking_config.thinking_level == types.ThinkingLevel.LOW
    assert {s.category for s in request.config.safety_settings} == {
        types.HarmCategory.HARM_CATEGORY_HARASSMENT, types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT}
    assert not request.config.tools                     # the scan agent has nothing to call


def test_a_rejected_answer_goes_back_to_the_same_session():
    llm = ScriptedLlm(script=[
        answer({"cuts": [{"kind": "category", "name": "Shopping", "amount": 900}], "message": "₹900 from Shopping."}),
        answer({"cuts": [{"kind": "category", "name": "Shopping", "amount": 900},
                         {"kind": "category", "name": "Entertainment", "amount": 300}],
                "message": "₹900 from Shopping and ₹300 from Entertainment."}),
    ])
    sources = [{"kind": "category", "name": "Shopping", "room": 900, "locked": False},
               {"kind": "category", "name": "Entertainment", "room": 500, "locked": False}]

    def check(a):
        return rules.check_cuts(a, 1200, sources, {1200, 900, 500})[0]

    result, why = run(consult(brain.Brain(model=llm), "rebalance", "FACTS: amount 1200", check,
                              attempts=3, budget_s=10))
    assert why is None and [c["amount"] for c in result] == [900, 300]
    second = texts(llm.requests[1])
    assert second[0] == "FACTS: amount 1200"            # the agent still sees the first question,
    assert any("add up to ₹900, not ₹1,200" in t for t in second)   # its own answer, and why it failed


def test_the_payday_planner_reads_budgets_and_goals_through_its_tools():
    llm = ScriptedLlm(script=[tool_call("get_budgets"), tool_call("get_goals"), answer(PLAN)])
    tally = usage.start()
    got = run(brain.Brain(model=llm).conversation("payday", STATE).ask("FACTS: salary 45000"))
    assert got.buffer == 2500 and got.weekly == [5500] * 4
    declared = {f.name for t in llm.requests[0].config.tools for f in (t.function_declarations or [])}
    assert declared == {"get_budgets", "get_goals"}
    seen = [p.function_response.response for c in llm.requests[2].contents
            for p in (c.parts or []) if p.function_response]
    assert {"budgets": STATE["budgets"]} in seen and {"goals": STATE["goals"]} in seen
    assert tally["guard_payday"]["calls"] == 3


def test_on_ai_studio_the_planner_answers_through_set_model_response():
    llm = ScriptedLlm(native=False, script=[tool_call("get_goals"), tool_call("set_model_response", PLAN)])
    got = run(brain.Brain(model=llm).conversation("payday", STATE).ask("FACTS: salary 45000"))
    assert got == schemas.PaydayPlan.model_validate(PLAN)
    declared = {f.name for t in llm.requests[0].config.tools for f in (t.function_declarations or [])}
    assert "set_model_response" in declared


def test_a_model_failure_becomes_a_fallback_reason():
    llm = ScriptedLlm(script=[RuntimeError("429 RESOURCE_EXHAUSTED")])
    result, why = run(consult(brain.Brain(model=llm), "scan", "FACTS", lambda a: a, attempts=1, budget_s=5))
    assert result is None and why == "model_error:RuntimeError"


def test_sessions_are_deleted_after_each_decision():
    llm = ScriptedLlm(script=[answer({"decision": "go", "message": "", "show_wishlist": False})])
    b = brain.Brain(model=llm)
    run(consult(b, "scan", "FACTS", lambda a: a, attempts=1, budget_s=5))
    _, sessions = b.runner("scan")
    listed = run(sessions.list_sessions(app_name=brain.APP_NAME, user_id="guard"))
    assert listed.sessions == []


def test_parse_accepts_fenced_json_and_rejects_the_wrong_shape():
    assert brain.parse('```json\n{"decision":"go","message":"","show_wishlist":false}\n```',
                       schemas.ScanDecision).decision == "go"
    with pytest.raises(brain.BadAnswer, match="decision"):
        brain.parse('{"decision":"block","message":"","show_wishlist":false}', schemas.ScanDecision)
    with pytest.raises(brain.BadAnswer):
        brain.parse("not json", schemas.ScanDecision)


def test_real_user_data_only_goes_to_vertex(monkeypatch):
    for name in ("GUARD_AI", "GOOGLE_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENAI_USE_VERTEXAI", "GOOGLE_CLOUD_PROJECT"):
        monkeypatch.delenv(name, raising=False)
    assert brain.availability(persona=True) == "ai_not_configured"
    monkeypatch.setenv("GOOGLE_API_KEY", "free-tier-key")
    assert brain.availability(persona=True) is None
    assert brain.availability(persona=False) == "needs_vertex_for_real_data"
    monkeypatch.setenv("GOOGLE_GENAI_USE_VERTEXAI", "TRUE")
    assert brain.availability(persona=False) == "ai_not_configured"     # needs a project too
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "fintwin-guard")
    assert brain.availability(persona=False) is None
    monkeypatch.setenv("GUARD_AI", "off")
    assert brain.availability(persona=False) == "ai_off"
