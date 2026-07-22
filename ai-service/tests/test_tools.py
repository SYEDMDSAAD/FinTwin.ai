"""Tests for the copilot tool layer: schemas, dispatcher, and the advisor tool loop."""

import json
from unittest.mock import patch

from chatbot import tools
from chatbot.advisor import generate_financial_advice


# ── Tool schemas ──────────────────────────────────────────────────────────────

def test_tool_schemas_are_well_formed():
    names = [t["function"]["name"] for t in tools.TOOLS]
    assert names == ["get_transactions", "get_budgets", "get_goals", "get_net_worth"]
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
    called_paths = [c.args[0] for c in mock_get.call_args_list]
    assert called_paths == ["/8/budgets", "/8/goals", "/8/networth"]


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
