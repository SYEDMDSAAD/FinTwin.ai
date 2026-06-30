"""Unit tests for chatbot.prompt_engine — pure string formatting, no mocks needed."""
from chatbot.prompt_engine import (
    build_financial_context,
    format_category_lines,
    format_history_block,
    format_merchant_lines,
)


# ── format_category_lines ────────────────────────────────────────────────────

def test_format_category_lines_empty_dict():
    assert format_category_lines({}) == "  No data"


def test_format_category_lines_sorted_descending():
    result = format_category_lines({"Food": 1000, "Travel": 3000, "Bills": 500})
    lines = result.split("\n")
    assert lines[0] == "  - Travel: ₹3000"
    assert lines[1] == "  - Food: ₹1000"
    assert lines[2] == "  - Bills: ₹500"


def test_format_category_lines_rounds_values():
    result = format_category_lines({"Food": 1234.6})
    assert result == "  - Food: ₹1235"


# ── format_merchant_lines ────────────────────────────────────────────────────

def test_format_merchant_lines_empty_dict():
    assert format_merchant_lines({}) == "  No data"


def test_format_merchant_lines_respects_top_n():
    merchants = {f"Merchant{i}": 100 * i for i in range(1, 10)}
    result = format_merchant_lines(merchants, top_n=3)
    lines = result.split("\n")
    assert len(lines) == 3
    # Highest amounts first
    assert "Merchant9" in lines[0]
    assert "Merchant8" in lines[1]
    assert "Merchant7" in lines[2]


def test_format_merchant_lines_default_top_n_is_5():
    merchants = {f"Merchant{i}": 100 * i for i in range(1, 10)}
    result = format_merchant_lines(merchants)
    lines = result.split("\n")
    assert len(lines) == 5


def test_format_merchant_lines_fewer_than_top_n():
    merchants = {"A": 10, "B": 20}
    result = format_merchant_lines(merchants, top_n=5)
    lines = result.split("\n")
    assert len(lines) == 2


# ── format_history_block ─────────────────────────────────────────────────────

def test_format_history_block_empty_list():
    assert format_history_block([]) == ""


def test_format_history_block_includes_last_n():
    history = [
        {"message": f"msg{i}", "reply": f"reply{i}"} for i in range(5)
    ]
    result = format_history_block(history, last_n=2)
    assert "msg3" in result
    assert "msg4" in result
    assert "msg0" not in result


def test_format_history_block_truncates_reply():
    long_reply = "x" * 200
    history = [{"message": "hi", "reply": long_reply}]
    result = format_history_block(history)
    assert "x" * 120 in result
    assert "x" * 121 not in result


# ── build_financial_context ──────────────────────────────────────────────────

def test_build_financial_context_includes_key_fields():
    data = {
        "income": 50000,
        "expenses": 30000,
        "savings": 20000,
        "savingsRatio": 40,
        "financialScore": 75,
        "topCategory": "Food",
        "categorySpending": {"Food": 10000, "Travel": 5000},
        "merchantSpending": {"Amazon": 3000},
        "budgetAlerts": [],
        "subscriptions": [],
    }
    context = build_financial_context(data)
    assert "₹50,000" in context
    assert "₹30,000" in context
    assert "₹20,000" in context
    assert "40%" in context
    assert "75/100" in context
    assert "Food" in context
    assert "Travel" in context
    assert "Amazon" in context
    assert "Budget Alerts: None" in context
    assert "Recurring Subscriptions: None" in context


def test_build_financial_context_handles_empty_dict():
    context = build_financial_context({})
    assert "₹0" in context
    assert "No data" in context
    assert "Unknown" in context
    assert "Budget Alerts: None" in context


def test_build_financial_context_shows_alerts_and_subscriptions_when_present():
    data = {
        "budgetAlerts": ["Food over budget"],
        "subscriptions": ["Netflix", "Spotify"],
    }
    context = build_financial_context(data)
    assert "Food over budget" in context
    assert "Netflix" in context
    assert "Spotify" in context
