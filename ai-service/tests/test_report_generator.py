"""Tests for the executive report generator.

The report is the one surface that presents itself as an "executive" document,
so two properties matter more than the prose: every figure it quotes must be
one the caller supplied, and a model failure must degrade section by section
rather than blanking the page.
"""
import json
from unittest.mock import patch

from chatbot.report_generator import generate_weekly_report


def _data(**overrides):
    data = {
        "income": 100000,
        "expenses": 62000,
        "savings": 38000,
        "financialScore": 72,
        "netWorth": 850000,
        "spendingHealth": "Moderate",
        "monthlyLeakage": 4200,
        "predictedExpenses": 64000,
        "predictedSavings": 36000,
        "categorySpending": {"Food & Dining": 18000, "Transport": 9000},
        "goals": [{"targetAmount": 500000, "durationMonths": 24,
                   "progressPercent": 31, "goalHealth": "On Track"}],
        "currentPeriod": {"income": 100000, "expenses": 62000, "savings": 38000,
                          "netWorth": 0, "financialScore": 72},
        "previousPeriod": {"income": 98000, "expenses": 58000, "savings": 40000,
                           "netWorth": 0, "financialScore": 69},
    }
    data.update(overrides)
    return data


def _model_reply(**overrides):
    reply = {
        "summary": "Your score of 72/100 rests on savings of ₹38000 a month. "
                   "Cutting the ₹4200 leakage matters most.",
        "insights": [
            {"title": "Food dominates outflow",
             "detail": "Food & Dining spending of ₹18000 is your largest category.",
             "severity": "medium"},
            {"title": "Healthy savings rate",
             "detail": "You save ₹38000 each month.", "severity": "low"},
        ],
        "risks": [
            {"title": "Leakage compounds",
             "detail": "Monthly leakage of ₹4200 erodes savings.", "severity": "high"},
            {"title": "Expenses climbing",
             "detail": "Monthly expenses of ₹62000 are rising.", "severity": "medium"},
        ],
        "recommendations": [
            {"title": "Automate the leak",
             "detail": "Redirect ₹4200 into a SIP.", "severity": "high"},
            {"title": "Fund the goal",
             "detail": "Commit ₹38000 monthly savings to goals.", "severity": "medium"},
        ],
    }
    reply.update(overrides)
    return json.dumps(reply)


# ── One request, not four ────────────────────────────────────────────────────

@patch("chatbot.report_generator.ask")
def test_report_makes_a_single_llm_call(mock_ask):
    """One reply keeps the sections coherent with each other and structured."""
    mock_ask.return_value = _model_reply()
    generate_weekly_report(_data())
    assert mock_ask.call_count == 1


# ── Structured output ────────────────────────────────────────────────────────

@patch("chatbot.report_generator.ask")
def test_sections_are_structured_items(mock_ask):
    mock_ask.return_value = _model_reply()
    result = generate_weekly_report(_data())

    assert result["degraded"] is False
    for section in ("insights", "risks", "recommendations"):
        assert len(result[section]) == 2
        for item in result[section]:
            assert item["title"] and item["detail"]
            assert item["severity"] in {"high", "medium", "low"}


@patch("chatbot.report_generator.ask")
def test_risks_are_ordered_most_severe_first(mock_ask):
    mock_ask.return_value = _model_reply(risks=[
        {"title": "Minor", "detail": "You save ₹38000 each month.", "severity": "low"},
        {"title": "Serious", "detail": "Monthly leakage of ₹4200 erodes savings.",
         "severity": "high"},
    ])
    result = generate_weekly_report(_data())
    assert [r["severity"] for r in result["risks"]] == ["high", "low"]


# ── Grounding ────────────────────────────────────────────────────────────────

@patch("chatbot.report_generator.ask")
def test_invented_amounts_are_rejected(mock_ask):
    mock_ask.return_value = _model_reply(insights=[
        {"title": "Invented rent", "detail": "Your rent of ₹31500 is too high.",
         "severity": "high"},
        {"title": "Also invented", "detail": "A ₹77000 shortfall looms.",
         "severity": "high"},
    ])
    result = generate_weekly_report(_data())

    text = json.dumps(result["insights"])
    assert "31500" not in text
    assert "77000" not in text
    assert result["degraded"] is True


@patch("chatbot.report_generator.ask")
def test_invented_percentages_are_rejected(mock_ask):
    """A made-up target percentage reads exactly like a measurement."""
    mock_ask.return_value = _model_reply(recommendations=[
        {"title": "Cut hard", "detail": "Reduce spending by 47% this month.",
         "severity": "high"},
    ])
    result = generate_weekly_report(_data())
    assert "47%" not in json.dumps(result["recommendations"])


@patch("chatbot.report_generator.ask")
def test_ungrounded_summary_falls_back_to_computed(mock_ask):
    mock_ask.return_value = _model_reply(
        summary="You saved ₹99999 last month, which is excellent.")
    result = generate_weekly_report(_data())

    assert "99999" not in result["summary"]
    assert "72/100" in result["summary"]
    assert result["degraded"] is True


@patch("chatbot.report_generator.ask")
def test_grounded_items_survive_alongside_rejected_ones(mock_ask):
    """Filtering is per item, so one bad finding does not discard a good one."""
    mock_ask.return_value = _model_reply(recommendations=[
        {"title": "Invented", "detail": "Free up ₹55000 immediately.", "severity": "high"},
        {"title": "Real", "detail": "Redirect ₹4200 into a SIP.", "severity": "high"},
    ])
    result = generate_weekly_report(_data())

    titles = [r["title"] for r in result["recommendations"]]
    assert "Real" in titles
    assert "Invented" not in titles


# ── Degradation ──────────────────────────────────────────────────────────────

@patch("chatbot.report_generator.ask")
def test_model_failure_still_returns_a_full_report(mock_ask):
    mock_ask.side_effect = RuntimeError("ollama down")
    result = generate_weekly_report(_data())

    assert result["degraded"] is True
    assert result["summary"]
    assert result["insights"] and result["risks"] and result["recommendations"]
    assert result["keyMetrics"]["netWorth"] == 850000


@patch("chatbot.report_generator.ask")
def test_unparseable_response_degrades(mock_ask):
    mock_ask.return_value = "not json at all"
    result = generate_weekly_report(_data())
    assert result["degraded"] is True
    assert result["summary"]


# ── Trends ───────────────────────────────────────────────────────────────────

@patch("chatbot.report_generator.ask")
def test_trends_compare_current_against_previous(mock_ask):
    mock_ask.return_value = _model_reply()
    result = generate_weekly_report(_data())

    by_label = {t["label"]: t for t in result["trends"]}
    assert by_label["Income"]["changePercent"] == 2.0
    assert by_label["Expenses"]["direction"] == "up"
    assert by_label["Savings"]["direction"] == "down"


@patch("chatbot.report_generator.ask")
def test_trend_sentiment_is_metric_specific(mock_ask):
    """Expenses up and savings up are both 'up'; only one is good news."""
    mock_ask.return_value = _model_reply()
    result = generate_weekly_report(_data())

    by_label = {t["label"]: t for t in result["trends"]}
    assert by_label["Expenses"]["goodDirection"] == "down"
    assert by_label["Savings"]["goodDirection"] == "up"


@patch("chatbot.report_generator.ask")
def test_metric_without_prior_reading_is_omitted(mock_ask):
    """Net worth has no history table, so it must not appear as a trend."""
    mock_ask.return_value = _model_reply()
    result = generate_weekly_report(_data())
    assert "Net Worth" not in {t["label"] for t in result["trends"]}


@patch("chatbot.report_generator.ask")
def test_no_previous_period_yields_no_trends(mock_ask):
    mock_ask.return_value = _model_reply()
    data = _data()
    data.pop("previousPeriod")
    result = generate_weekly_report(data)
    assert result["trends"] == []


# ── Projections reach the model ──────────────────────────────────────────────

@patch("chatbot.report_generator.ask")
def test_projections_are_licensed_figures(mock_ask):
    """predictedExpenses/predictedSavings were accepted but never used."""
    mock_ask.return_value = _model_reply()
    generate_weekly_report(_data())

    prompt = mock_ask.call_args[0][0]
    assert "₹64000" in prompt
    assert "₹36000" in prompt


@patch("chatbot.report_generator.ask")
def test_zero_income_does_not_divide_by_zero(mock_ask):
    mock_ask.side_effect = RuntimeError("down")
    result = generate_weekly_report(_data(income=0, savings=0))
    assert result["keyMetrics"]["savingsRate"] == 0
