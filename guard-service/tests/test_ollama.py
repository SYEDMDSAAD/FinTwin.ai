"""The local model path: what reaches Ollama, what comes back, and when real data may go to it."""
import asyncio
import json

import httpx
import pytest

from agents import brain, ollama_llm, prompts, schemas

PLAN = {"goals": [{"goal": "Goa trip", "amount": 6000}], "buffer": 2500, "weekly": [5500] * 4, "message": "ok"}
STATE = {"budgets": [{"category": "Food", "limit": 6000, "spent": 5750, "essential": False}],
         "goals": [{"title": "Goa trip", "target": 30000, "saved": 12000, "monthly_target": 6000}]}


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def ollama(monkeypatch):
    """A fake Ollama: replies are queued, request bodies are recorded."""
    seen, replies = [], []

    def handler(request):
        seen.append(json.loads(request.content))
        return httpx.Response(200, json=replies.pop(0))

    real = httpx.AsyncClient
    monkeypatch.setattr(ollama_llm.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    return seen, replies


def said(obj):
    return {"message": {"role": "assistant", "content": json.dumps(obj)}, "prompt_eval_count": 90, "eval_count": 20}


def called(name, args=None):
    return {"message": {"role": "assistant", "content": "",
                        "tool_calls": [{"function": {"name": name, "arguments": args or {}}}]},
            "prompt_eval_count": 50, "eval_count": 5}


def test_a_scan_sends_the_instructions_facts_and_answer_shape(ollama):
    seen, replies = ollama
    replies.append(said({"decision": "go", "message": "", "show_wishlist": False}))
    got = run(brain.Brain(model="ollama/qwen-test").conversation("scan").ask("FACTS: {}"))
    assert got.decision == "go"
    body = seen[0]
    assert body["model"] == "qwen-test" and body["stream"] is False
    system, user = body["messages"]
    assert system["role"] == "system" and prompts.LOCAL_CHECKS["scan"] in system["content"]
    assert user == {"role": "user", "content": "FACTS: {}"}
    assert set(body["format"]["properties"]) == {"decision", "message", "show_wishlist"}


def test_a_local_top_up_must_always_name_an_amount(ollama):
    seen, replies = ollama
    replies.append(said({"decision": "approve_less", "suggested_amount": 800, "message": "ok"}))
    got = run(brain.Brain(model="ollama/qwen-test").conversation("topup").ask("FACTS: {}"))
    assert got.suggested_amount == 800
    assert "suggested_amount" in seen[0]["format"]["required"]
    assert schemas.TopupDecision.model_fields["suggested_amount"].is_required() is False   # Gemini's is unchanged


def test_the_planner_reads_its_tools_and_answers_through_set_model_response(ollama):
    seen, replies = ollama
    replies += [called("get_goals"), called("set_model_response", PLAN)]
    got = run(brain.Brain(model="ollama/qwen-test").conversation("payday", STATE).ask("FACTS: salary 45000"))
    assert got == schemas.PaydayPlan.model_validate(PLAN)
    assert {t["function"]["name"] for t in seen[0]["tools"]} >= {"get_budgets", "get_goals", "set_model_response"}
    assert "format" not in seen[0]
    tool_reply = [m for m in seen[1]["messages"] if m["role"] == "tool"]
    assert tool_reply and json.loads(tool_reply[0]["content"]) == {"goals": STATE["goals"]}


def test_an_ollama_error_becomes_a_model_error(monkeypatch):
    real = httpx.AsyncClient
    monkeypatch.setattr(ollama_llm.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(lambda r: httpx.Response(500)), **kw))
    with pytest.raises(brain.ModelError):
        run(brain.Brain(model="ollama/qwen-test").conversation("scan").ask("FACTS: {}"))


@pytest.mark.parametrize("address, local", [
    ("http://127.0.0.1:11434", True), ("http://localhost:11434", True), ("http://[::1]:11434", True),
    ("http://10.0.0.5:11434", False), ("https://ollama.example.com", False), ("http://127.0.0.1.example.com", False),
])
def test_only_this_machine_counts_as_local(address, local):
    assert ollama_llm.is_local(address) is local


def test_real_data_goes_to_a_local_model_only_on_this_machine(monkeypatch):
    monkeypatch.setattr(brain, "MODEL", "ollama/qwen2.5:3b")
    for name in ("GUARD_AI", "GOOGLE_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENAI_USE_VERTEXAI"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("OLLAMA_URL", "http://127.0.0.1:11434")
    assert brain.availability(persona=False) is None and brain.where() == "local"
    monkeypatch.setenv("OLLAMA_URL", "http://10.0.0.5:11434")
    assert brain.availability(persona=False) == "needs_vertex_for_real_data"
    assert brain.availability(persona=True) is None and brain.where() == "remote_ollama"
    monkeypatch.setenv("GUARD_AI", "off")
    assert brain.availability(persona=False) == "ai_off"
