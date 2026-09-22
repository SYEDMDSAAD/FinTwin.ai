"""Tests for the copilot tool layer: schemas, dispatcher, and the advisor tool loop."""

import json
from unittest.mock import patch

from chatbot import tools
from chatbot.advisor import generate_financial_advice


# ── Tool schemas ──────────────────────────────────────────────────────────────

def test_tool_schemas_are_well_formed():
    names = [t["function"]["name"] for t in tools.TOOLS]
    assert names == ["get_transactions", "get_budgets", "get_goals", "get_net_worth", "get_portfolio"]
    for t in tools.TOOLS:
        assert t["type"] == "function"
        assert "description" in t["function"]
        assert t["function"]["parameters"]["type"] == "object"


# ── Dispatcher ────────────────────────────────────────────────────────────────

@patch("chatbot.tools.backend_api.get")
def test_get_transactions_passes_filters(mock_get):
    mock_get.return_value = {"totalMatching": 1, "transactions": []}
    out = tools.execute_tool(
        "get_transactions",
        {"category": "Other", "sort": "amount", "limit": 3},
        user_id=8,
    )
    mock_get.assert_called_once_with(
        "/8/transactions",
        {"sort": "amount", "type": "expense", "limit": 3, "months": 3, "category": "Other"},
    )
    assert json.loads(out)["totalMatching"] == 1


@patch("chatbot.tools.backend_api.get")
def test_get_transactions_group_by_passes_through(mock_get):
    mock_get.return_value = {"groupedBy": "merchant", "groups": []}
    tools.execute_tool(
        "get_transactions",
        {"type": "income", "group_by": "merchant"},
        user_id=8,
    )
    mock_get.assert_called_once_with(
        "/8/transactions",
        {"sort": "amount", "type": "income", "limit": 10, "months": 3, "groupBy": "merchant"},
    )


@patch("chatbot.tools.backend_api.get")
def test_get_transactions_invalid_group_by_dropped(mock_get):
    mock_get.return_value = {"totalMatching": 0, "transactions": []}
    tools.execute_tool("get_transactions", {"group_by": "nonsense"}, user_id=8)
    assert "groupBy" not in mock_get.call_args[0][1]


@patch("chatbot.tools.backend_api.get")
def test_parameterless_tools_route_to_right_endpoints(mock_get):
    mock_get.return_value = {}
    tools.execute_tool("get_budgets", {}, user_id=8)
    tools.execute_tool("get_goals", {}, user_id=8)
    tools.execute_tool("get_net_worth", {}, user_id=8)
    tools.execute_tool("get_portfolio", {}, user_id=8)
    called_paths = [c.args[0] for c in mock_get.call_args_list]
    assert called_paths == ["/8/budgets", "/8/goals", "/8/networth", "/8/portfolio"]


def test_unknown_tool_returns_error_json():
    out = json.loads(tools.execute_tool("nope", {}, user_id=8))
    assert "error" in out


@patch("chatbot.tools.backend_api.get", side_effect=RuntimeError("backend down"))
def test_backend_failure_returns_error_json_not_exception(mock_get):
    out = json.loads(tools.execute_tool("get_budgets", {}, user_id=8))
    assert "backend down" in out["error"]


# ── Advisor tool loop ─────────────────────────────────────────────────────────

_BASE_DATA = {"userId": 8, "income": 50000, "expenses": 30000, "savings": 20000,
              "savingsRatio": 40, "financialScore": 70, "categorySpending": {"Other": 45000}}


@patch("chatbot.advisor.chat")
def test_direct_answer_without_tools(mock_chat):
    mock_chat.return_value = {"content": "Your savings ratio is 40%."}
    reply = generate_financial_advice("how is my savings ratio?", _BASE_DATA, "Savings Advisor")
    assert reply == "Your savings ratio is 40%."
    # Tools were offered on the first call
    assert mock_chat.call_args_list[0].kwargs["tools"] is not None


@patch("chatbot.advisor.execute_tool")
@patch("chatbot.advisor.chat")
def test_tool_call_round_trip(mock_chat, mock_exec):
    tool_call_msg = {
        "content": "",
        "tool_calls": [{"function": {"name": "get_transactions",
                                     "arguments": {"category": "Other", "sort": "amount", "limit": 3}}}],
    }
    final_msg = {"content": "Top 3 Other spends: ₹30,123, ₹23,156, ₹9,122."}
    mock_chat.side_effect = [tool_call_msg, final_msg]
    mock_exec.return_value = json.dumps({"transactions": [{"amount": -30123}]})

    reply = generate_financial_advice("top 3 Other transactions", _BASE_DATA, "Budget Coach")

    assert "30,123" in reply
    mock_exec.assert_called_once()
    assert mock_exec.call_args.args[0] == "get_transactions"
    assert mock_exec.call_args.args[2] == 8  # user id flows through
    # Second chat call must include the tool result message
    second_call_messages = mock_chat.call_args_list[1].args[0]
    assert any(m.get("role") == "tool" for m in second_call_messages)


@patch("chatbot.advisor.ask")
def test_no_user_id_falls_back_to_legacy_path(mock_ask):
    mock_ask.return_value = "legacy reply"
    data = {k: v for k, v in _BASE_DATA.items() if k != "userId"}
    reply = generate_financial_advice("hello", data, "Savings Advisor")
    assert reply == "legacy reply"


@patch("chatbot.advisor.ask")
@patch("chatbot.advisor.chat", side_effect=ValueError("tool path broke"))
def test_tool_path_crash_falls_back_to_legacy(mock_chat, mock_ask):
    mock_ask.return_value = "legacy fallback reply"
    reply = generate_financial_advice("hello", _BASE_DATA, "Savings Advisor")
    assert reply == "legacy fallback reply"


@patch("chatbot.advisor.chat", side_effect=RuntimeError("ollama down"))
def test_ollama_down_returns_canned_fallback(mock_chat):
    reply = generate_financial_advice("hello", _BASE_DATA, "Savings Advisor")
    assert "temporary" in reply.lower() or "Temporary" in reply

# ── Time budget: a copilot answer must finish before the backend gives up ────

import requests  # noqa: E402

from chatbot import advisor  # noqa: E402


@patch("chatbot.advisor.ask")
@patch("chatbot.advisor.chat", side_effect=requests.exceptions.ReadTimeout("slow model"))
def test_slow_model_gets_an_honest_answer_not_a_second_long_call(mock_chat, mock_ask):
    reply = generate_financial_advice("where can I save?", _BASE_DATA, "Savings Advisor")

    assert reply == advisor._OUT_OF_TIME
    # falling back to the single-shot path would start another long model call
    mock_ask.assert_not_called()


@patch("chatbot.advisor.execute_tool", return_value=json.dumps({"total": 100}))
@patch("chatbot.advisor.chat")
def test_each_call_gets_only_what_is_left_of_the_budget(mock_chat, mock_exec, monkeypatch):
    clock = iter([0.0, 0.0, 30.0, 30.0])        # budget start, call 1, call 2, ...
    monkeypatch.setattr(advisor.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(advisor, "_CHAT_BUDGET_SECONDS", 80.0)
    mock_chat.side_effect = [
        {"content": "", "tool_calls": [{"function": {"name": "get_monthly_summary", "arguments": {}}}]},
        {"content": "You spent ₹100."},
    ]

    generate_financial_advice("how much did I spend?", _BASE_DATA, "Savings Advisor")

    timeouts = [c.kwargs["timeout"] for c in mock_chat.call_args_list]
    assert timeouts == [80.0, 50.0]


@patch("chatbot.advisor.execute_tool", return_value=json.dumps({"total": 100}))
@patch("chatbot.advisor.chat")
def test_no_new_model_call_once_the_budget_is_nearly_spent(mock_chat, mock_exec, monkeypatch):
    clock = iter([0.0, 0.0, 77.0])              # 3 s left before the second call
    monkeypatch.setattr(advisor.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(advisor, "_CHAT_BUDGET_SECONDS", 80.0)
    mock_chat.side_effect = [
        {"content": "", "tool_calls": [{"function": {"name": "get_monthly_summary", "arguments": {}}}]},
    ]

    reply = generate_financial_advice("how much did I spend?", _BASE_DATA, "Savings Advisor")

    assert reply == advisor._OUT_OF_TIME
    assert mock_chat.call_count == 1


def test_budget_stays_under_the_backends_chat_timeout():
    # backend: ai.service.chat-read-timeout-ms=90000
    assert advisor._CHAT_BUDGET_SECONDS < 90


# ── History self-poisoning guard ──────────────────────────────────────────────

def test_history_drops_exchanges_matching_current_question():
    from chatbot.advisor import _history_messages
    history = [
        {"message": "how many budgets?", "reply": "You have 2 budgets."},
        {"message": "How many GOALS do I have?", "reply": "fabricated goals answer"},
        {"message": "how many goals do i  have?", "reply": "fabricated again"},
    ]
    msgs = _history_messages(history, current_message="how many goals do i have?")
    contents = " ".join(m["content"] for m in msgs)
    assert "fabricated" not in contents
    assert "2 budgets" in contents


def test_history_kept_for_different_question():
    from chatbot.advisor import _history_messages
    history = [{"message": "how many goals?", "reply": "3 goals"}]
    msgs = _history_messages(history, current_message="what did I spend on food?")
    assert any("3 goals" in m["content"] for m in msgs)


# ── Portfolio tool ────────────────────────────────────────────────────────────

@patch("chatbot.tools.backend_api.get")
def test_get_portfolio_passes_a_known_type_and_drops_anything_else(mock_get):
    mock_get.return_value = {}
    tools.execute_tool("get_portfolio", {"type": "Mutual Fund"}, user_id=8)
    tools.execute_tool("get_portfolio", {"type": "Real Estate"}, user_id=8)
    tools.execute_tool("get_portfolio", {}, user_id=8)
    assert [c.args for c in mock_get.call_args_list] == [
        ("/8/portfolio", {"type": "Mutual Fund"}), ("/8/portfolio", None), ("/8/portfolio", None)]


@patch("chatbot.tools.backend_api.get")
def test_tool_results_keep_the_rupee_sign_unescaped(mock_get):
    mock_get.return_value = {"summary": "now worth ₹15,746.39"}
    out = tools.execute_tool("get_portfolio", {}, user_id=8)
    assert "₹15,746.39" in out and "\\u20b9" not in out


_PORTFOLIO = json.dumps({
    "summary": "Portfolio (2 holdings): invested ₹30,000, now worth ₹29,018.16 — a loss of ₹981.84 (-3.27%).",
    "inProfit": ["Parag Parikh Flexi Cap"], "atLoss": ["HDFC Bank"],
}, ensure_ascii=False)


def _portfolio_round(final_text):
    call = {"content": "", "tool_calls": [{"function": {"name": "get_portfolio", "arguments": {}}}]}
    return [call, {"content": final_text}]


@patch("chatbot.advisor.execute_tool", return_value=_PORTFOLIO)
@patch("chatbot.advisor.chat")
def test_portfolio_answers_always_carry_the_caveat(mock_chat, _exec):
    mock_chat.side_effect = _portfolio_round("Your portfolio is worth ₹29,018.16.")
    reply = generate_financial_advice("how can I grow my investments?", _BASE_DATA, "Investment Advisor")
    assert reply.startswith("Your portfolio is worth ₹29,018.16.")      # figure present: no summary added
    assert "not financial advice" in reply


@patch("chatbot.advisor.execute_tool", return_value=_PORTFOLIO)
@patch("chatbot.advisor.chat")
def test_an_answer_missing_the_headline_figure_leads_with_the_summary(mock_chat, _exec):
    mock_chat.side_effect = _portfolio_round("Your investments are doing fine overall.")
    reply = generate_financial_advice("how can I grow my investments?", _BASE_DATA, "Investment Advisor")
    assert reply.startswith("Portfolio (2 holdings): invested ₹30,000, now worth ₹29,018.16")


@patch("chatbot.advisor.execute_tool", return_value=_PORTFOLIO)
@patch("chatbot.advisor.chat")
def test_portfolio_rules_sit_next_to_the_data(mock_chat, _exec):
    mock_chat.side_effect = _portfolio_round("HDFC Bank is down 11.52%, now worth ₹29,018.16.")
    generate_financial_advice("should I sell my HDFC Bank shares?", _BASE_DATA, "Investment Advisor")
    msgs = mock_chat.call_args_list[1].args[0]
    tool_at = next(i for i, m in enumerate(msgs) if m.get("role") == "tool")
    rules = msgs[tool_at + 1]
    assert rules["role"] == "system" and "atLoss" in rules["content"]
    assert "asking whether to buy or sell" in rules["content"]


@patch("chatbot.advisor.chat")
def test_no_caveat_when_the_portfolio_was_not_used(mock_chat):
    mock_chat.return_value = {"content": "Your savings ratio is 40%."}
    reply = generate_financial_advice("how is my savings ratio?", _BASE_DATA, "Savings Advisor")
    assert "financial advice" not in reply


def test_trade_questions_are_recognised():
    from chatbot.advisor import _ASKS_TRADE
    for q in ["Should I buy more HDFC Bank shares?", "should i sell my mutual fund",
              "Which stock should I pick?", "is it a good time to invest?", "sell some of it?"]:
        assert _ASKS_TRADE.search(q), q
    for q in ["How much have I made on my mutual fund?", "Which of my holdings is losing money?"]:
        assert not _ASKS_TRADE.search(q), q


# ── Answer trace ──────────────────────────────────────────────────────────────

@patch("chatbot.advisor.execute_tool", return_value=json.dumps({"budgets": []}))
@patch("chatbot.advisor.chat")
def test_trace_records_the_path_tools_and_outcome(mock_chat, _exec):
    mock_chat.side_effect = [
        {"content": "", "tool_calls": [{"function": {"name": "get_budgets", "arguments": {}}}]},
        {"content": "You have no budgets yet."},
    ]
    trace = {}
    generate_financial_advice("am I within budget?", _BASE_DATA, "Budget Coach", trace)
    assert trace["path"] == "tools" and trace["outcome"] == "answered"
    assert trace["tools"] == [{"name": "get_budgets", "args": {}, "ok": True}]
    assert trace["model"] and isinstance(trace["duration_ms"], int)


@patch("chatbot.advisor.chat", side_effect=RuntimeError("Ollama down"))
def test_trace_says_when_the_fallback_answered(_chat):
    trace = {}
    reply = generate_financial_advice("hi", _BASE_DATA, "Savings Advisor", trace)
    assert reply == advisor._FALLBACK and trace["path"] == "fallback"


def test_chat_route_returns_the_trace():
    from fastapi.testclient import TestClient
    import app as app_module

    with patch("chatbot.routes.generate_financial_advice",
               side_effect=lambda m, d, mode, trace: trace.update({"path": "tools"}) or "ok"):
        r = TestClient(app_module.app).post("/chat", json={"message": "hi", "mode": "Savings Advisor"},
                                            headers={"x-internal-key": "test-internal-key"})
    assert r.json() == {"success": True, "reply": "ok", "trace": {"path": "tools"}}
