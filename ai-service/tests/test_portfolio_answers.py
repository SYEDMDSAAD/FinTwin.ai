"""Portfolio answers built from the figures, and checks on the model's own answers."""

import json
from unittest.mock import patch

import pytest

from chatbot import portfolio_answers as pa
from chatbot.advisor import generate_financial_advice

DATA = {
    "summary": "Portfolio (3 holdings): invested ₹40,000, now worth ₹39,718.16 — a loss of ₹281.84 (-0.7%).",
    "perHolding": ["SBI FD (Fixed Deposit): invested ₹10,000, now ₹10,700, +₹700 (7.0%)",
                   "Parag Parikh Flexi Cap (Mutual Fund): invested ₹15,000, now ₹15,746.39, +₹746.39 (4.98%)",
                   "HDFC Bank (Stocks): invested ₹15,000, now ₹13,271.77, -₹1,728.23 (-11.52%)"],
    "inProfit": ["SBI FD", "Parag Parikh Flexi Cap"], "atLoss": ["HDFC Bank"],
    "holdingCount": 3,
    "allocation": ["Mutual Fund: 39.6% (₹15,746.39)", "Stocks: 33.4% (₹13,271.77)", "Fixed Deposit: 26.9% (₹10,700)"],
    "bestPerformer": "SBI FD (7.0%)", "worstPerformer": "HDFC Bank (-11.52%)",
    "holdings": [
        {"name": "SBI FD", "type": "Fixed Deposit", "valuation": "estimated from the interest rate, not a market price"},
        {"name": "Parag Parikh Flexi Cap", "type": "Mutual Fund", "valuation": "market price at the last portfolio refresh"},
        {"name": "HDFC Bank", "type": "Stocks", "valuation": "market price at the last portfolio refresh"},
    ],
}


# ── Routing ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("question, expected", [
    ("How are my investments doing?", ("overview", None)),
    ("how is my portfolio performing", ("overview", None)),
    ("How much have I made on my mutual fund?", ("overview", "Mutual Fund")),
    ("What's my total return on stocks?", ("overview", "Stocks")),
    ("Which of my holdings is losing money?", ("losing", None)),
    ("Are any of my stocks in loss?", ("losing", "Stocks")),
    ("which investments are in profit", ("gaining", None)),
    ("What is my best performing investment?", ("best_worst", None)),
    ("Show me my portfolio allocation", ("allocation", None)),
    ("list my holdings", ("overview", None)),
])
def test_plain_data_questions_are_routed(question, expected):
    assert pa.route(question) == expected


@pytest.mark.parametrize("question", [
    "Should I buy more HDFC Bank shares?",       # a trade decision
    "How can I diversify my portfolio?",         # advice
    "Why is my mutual fund down?",               # needs reasoning
    "Which fund will do best next year?",        # a prediction
    "How much did I spend on food last month?",  # not about investments
    "How much have I earned this month?",        # income, not returns
    "Which holdings are not losing money?",      # negation: leave to the model
])
def test_everything_else_goes_to_the_model(question):
    assert pa.route(question) is None


# ── Answers from the figures ──────────────────────────────────────────────────

def test_losing_lists_only_holdings_at_a_loss():
    out = pa.compose("losing", DATA)
    assert out.startswith("1 of your holdings is at a loss:\n- HDFC Bank (Stocks): invested ₹15,000")
    assert "SBI FD (Fixed" not in out and "Parag Parikh" not in out
    assert "now worth ₹39,718.16" in out


def test_gaining_names_every_holding_in_profit_and_flags_estimates():
    out = pa.compose("gaining", DATA)
    assert "2 of your holdings are in profit" in out
    assert "SBI FD is estimated from the interest rate" in out


def test_overview_has_every_holding_and_the_split():
    out = pa.compose("overview", DATA)
    for line in DATA["perHolding"]:
        assert line in out
    assert "By type: Mutual Fund: 39.6% (₹15,746.39)" in out


def test_nothing_at_a_loss_says_so():
    data = {**DATA, "atLoss": []}
    assert pa.compose("losing", data).startswith("None of your holdings are at a loss right now.")


def test_no_holdings_passes_on_the_note():
    empty = {"holdingCount": 0, "note": "The user has no Gold holdings recorded in FinTwin."}
    assert pa.compose("overview", empty) == empty["note"]


# ── Checking the model's answer ───────────────────────────────────────────────

@pytest.mark.parametrize("answer", [
    "The SBI FD has gained slightly, but the Parag Parikh Flexi Cap Mutual Fund is at a loss.",
    "Your Fixed Deposit (FD) also shows a small loss, which might not be ideal.",   # by type, not name
    "HDFC Bank has performed well with a solid gain.",
])
def test_contradictions_are_caught(answer):
    assert pa.contradicts(answer, DATA)


@pytest.mark.parametrize("answer", [
    "HDFC Bank has lost 11.52% while Parag Parikh Flexi Cap gained 4.98%.",
    "Your mutual fund is in profit and there are no losses reported for it.",
    "Portfolio (3 holdings): invested ₹40,000, now worth ₹39,718.16 — a loss of ₹281.84 (-0.7%).",
    "SBI FD and Parag Parikh Flexi Cap are up; HDFC Bank is down 11.52%.",
])
def test_correct_statements_pass(answer):
    assert not pa.contradicts(answer, DATA)


def test_trade_advice_is_cut_and_the_list_renumbered():
    answer = ("**Summary**\nHDFC Bank is down 11.52%. Consider selling it to recoup losses.\n\n"
              "**Recommendations**\n1. Consider selling the HDFC Bank holdings.\n"
              "2. Review your risk tolerance.\n3. Reallocate funds into mutual funds.\n4. Keep monitoring.")
    out = pa.strip_trade_advice(answer)
    assert "sell" not in out.lower() and "realloca" not in out.lower()
    assert "HDFC Bank is down 11.52%." in out
    assert "1. Review your risk tolerance.\n2. Keep monitoring." in out


def test_a_section_left_empty_loses_its_heading():
    answer = "HDFC Bank is down 11.52% this year.\n\n**Recommendations**\n1. Sell HDFC Bank.\n2. Exit the position.\n\n**Verdict**\nIt's your call."
    out = pa.strip_trade_advice(answer)
    assert "**Recommendations**" not in out and "**Verdict**" in out


def test_check_rebuilds_a_contradicting_answer_from_the_figures():
    out, kept = pa.check("Your Parag Parikh Flexi Cap fund is losing money badly.", DATA, "overview")
    assert not kept
    assert out == pa.compose("overview", DATA)


def test_check_keeps_a_clean_answer():
    answer = "HDFC Bank is down 11.52%, so it's worth deciding how long you plan to hold it."
    assert pa.check(answer, DATA) == (answer, True)


# ── Through the advisor ───────────────────────────────────────────────────────

_BASE = {"userId": 8, "income": 60000, "expenses": 40000, "savings": 20000,
         "savingsRatio": 33, "financialScore": 70, "categorySpending": {}}
_DATA_JSON = json.dumps(DATA, ensure_ascii=False)


@patch("chatbot.advisor.chat")
@patch("chatbot.advisor.execute_tool", return_value=_DATA_JSON)
def test_a_plain_question_never_reaches_the_model(mock_exec, mock_chat):
    reply = generate_financial_advice("Which of my holdings is losing money?", _BASE, "Investment Advisor")
    mock_chat.assert_not_called()
    mock_exec.assert_called_once_with("get_portfolio", {}, 8)
    assert reply.startswith("1 of your holdings is at a loss")
    assert "not financial advice" in reply


@patch("chatbot.advisor.chat")
@patch("chatbot.advisor.execute_tool", return_value=_DATA_JSON)
def test_a_type_question_fetches_only_that_type(mock_exec, mock_chat):
    generate_financial_advice("How much have I made on my mutual fund?", _BASE, "Investment Advisor")
    mock_exec.assert_called_once_with("get_portfolio", {"type": "Mutual Fund"}, 8)


@patch("chatbot.advisor.chat")
@patch("chatbot.advisor.execute_tool", return_value=json.dumps({"error": "backend down"}))
def test_if_the_data_fetch_fails_the_model_path_takes_over(mock_exec, mock_chat):
    mock_chat.return_value = {"content": "Sorry, I couldn't see your portfolio."}
    generate_financial_advice("How are my investments doing?", _BASE, "Investment Advisor")
    mock_chat.assert_called()


@patch("chatbot.advisor.execute_tool", return_value=_DATA_JSON)
@patch("chatbot.advisor.chat")
def test_an_advice_answer_that_contradicts_the_data_is_replaced(mock_chat, _exec):
    mock_chat.side_effect = [
        {"content": "", "tool_calls": [{"function": {"name": "get_portfolio", "arguments": {}}}]},
        {"content": "To diversify, note that your SBI FD is at a loss, so add more equity."},
    ]
    reply = generate_financial_advice("How can I diversify my portfolio?", _BASE, "Investment Advisor")
    assert "SBI FD is at a loss" not in reply
    assert reply.startswith(DATA["summary"])
    assert "not financial advice" in reply


@patch("chatbot.advisor.execute_tool", return_value=_DATA_JSON)
@patch("chatbot.advisor.chat")
def test_an_advice_answer_loses_its_trade_lines_but_keeps_the_rest(mock_chat, _exec):
    mock_chat.side_effect = [
        {"content": "", "tool_calls": [{"function": {"name": "get_portfolio", "arguments": {}}}]},
        {"content": "Your portfolio is worth ₹39,718.16 across three types.\n1. Sell HDFC Bank.\n2. Add a gold fund for balance."},
    ]
    reply = generate_financial_advice("How can I diversify my portfolio?", _BASE, "Investment Advisor")
    assert "Sell HDFC" not in reply
    assert "1. Add a gold fund for balance." in reply
    assert "buying or selling" in reply          # the caveat survives the trade filter
