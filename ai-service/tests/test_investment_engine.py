"""Unit tests for investments.recommendation_engine.

Deterministic paths (no savings, low emergency fund, low financial score,
critical goal health) skip the Ollama *portfolio* call, but still call
ask() once for `_generate_summary`. The "Moderate" path calls
investments.recommendation_engine.ask twice (portfolio + summary). All
ask() calls are mocked here so no test touches Ollama/network.
"""
import json
from unittest.mock import patch

from investments.recommendation_engine import generate_investment_recommendation


def _base_data(**overrides):
    data = {
        "income": 100000,
        "expenses": 50000,
        "savings": 50000,
        "financialScore": 80,
        "netWorth": 500000,
        "goalHealth": "Healthy",
    }
    data.update(overrides)
    return data


# ── No savings -> Conservative/None, no Ollama call ──────────────────────────

@patch("investments.recommendation_engine.ask")
def test_no_savings_returns_none_risk_profile(mock_ask):
    mock_ask.return_value = "Summary text."
    data = _base_data(savings=0)
    result = generate_investment_recommendation(data)

    assert result["riskProfile"] == "None"
    assert result["expectedReturn"] == "0%"
    assert result["investmentHorizon"] == "Not Applicable"
    assert result["recommendations"] == []
    assert result["portfolioScore"] == 45
    # Portfolio generation is skipped, but the summary still calls ask() once.
    mock_ask.assert_called_once()


@patch("investments.recommendation_engine.ask")
def test_negative_savings_returns_none_profile(mock_ask):
    mock_ask.return_value = "Summary text."
    data = _base_data(savings=-1000)
    result = generate_investment_recommendation(data)
    assert result["riskProfile"] == "None"
    mock_ask.assert_called_once()


# ── Low emergency fund -> Conservative, no Ollama portfolio call ─────────────

@patch("investments.recommendation_engine.ask")
def test_low_emergency_fund_returns_conservative(mock_ask):
    mock_ask.return_value = "Summary text."
    # emergency_fund_needed = expenses*2 = 100000; net_worth small -> ratio < 0.1
    data = _base_data(expenses=50000, netWorth=5000, savings=20000, financialScore=80, goalHealth="Healthy")
    result = generate_investment_recommendation(data)

    assert result["riskProfile"] == "Conservative"
    assert result["portfolioScore"] == 45
    assert len(result["recommendations"]) == 3
    assert result["recommendations"][0]["asset"] == "Emergency Fund"
    mock_ask.assert_called_once()


# ── Low financial score -> Conservative, no Ollama portfolio call ───────────

@patch("investments.recommendation_engine.ask")
def test_low_financial_score_returns_conservative(mock_ask):
    mock_ask.return_value = "Summary text."
    # Ensure emergency fund ratio is healthy so we reach the financial_score branch
    data = _base_data(expenses=10000, netWorth=500000, savings=20000, financialScore=30, goalHealth="Healthy")
    result = generate_investment_recommendation(data)

    assert result["riskProfile"] == "Conservative"
    assert result["expectedReturn"] == "5-7%"
    assert result["portfolioScore"] == 45
    assert any(r["asset"] == "Fixed Deposit" for r in result["recommendations"])
    mock_ask.assert_called_once()


# ── Critical goal health -> Conservative, no Ollama portfolio call ──────────

@patch("investments.recommendation_engine.ask")
def test_critical_goal_health_returns_conservative(mock_ask):
    mock_ask.return_value = "Summary text."
    data = _base_data(expenses=10000, netWorth=500000, savings=20000, financialScore=80, goalHealth="Critical")
    result = generate_investment_recommendation(data)

    assert result["riskProfile"] == "Conservative"
    assert result["investmentHorizon"] == "Until Goal Completion"
    assert any(r["asset"] == "Goal Funding" for r in result["recommendations"])
    mock_ask.assert_called_once()


# ── Healthy path -> calls Ollama for portfolio + summary ─────────────────────

@patch("investments.recommendation_engine.ask")
def test_healthy_path_uses_ollama_portfolio(mock_ask):
    portfolio_json = json.dumps({
        "riskProfile": "Moderate",
        "expectedReturn": "10-14%",
        "investmentHorizon": "5+ Years",
        "portfolioScore": 82,
        "recommendations": [
            {"asset": "Index Funds", "allocation": 60, "reason": "Growth"},
            {"asset": "Debt Funds", "allocation": 40, "reason": "Stability"},
        ],
    })
    mock_ask.side_effect = [portfolio_json, "Sentence one. Sentence two."]

    data = _base_data(expenses=10000, netWorth=500000, savings=20000, financialScore=80, goalHealth="Healthy")
    result = generate_investment_recommendation(data)

    assert result["riskProfile"] == "Moderate"
    assert result["portfolioScore"] == 82
    assert len(result["recommendations"]) == 2
    # savings arrives as a monthly figure now — no /3
    assert result["recommendations"][0]["amount"] == round(20000 * 60 / 100, 2)
    assert result["summary"] == "Sentence one. Sentence two."
    assert mock_ask.call_count == 2


@patch("investments.recommendation_engine.ask")
def test_healthy_path_clamps_portfolio_score(mock_ask):
    portfolio_json = json.dumps({
        "riskProfile": "Aggressive",
        "recommendations": [{"asset": "Equity", "allocation": 100, "reason": "Growth"}],
        "portfolioScore": 150,
    })
    mock_ask.side_effect = [portfolio_json, "Summary text."]

    data = _base_data(expenses=10000, netWorth=500000, savings=20000, financialScore=80, goalHealth="Healthy")
    result = generate_investment_recommendation(data)

    assert result["portfolioScore"] == 100


@patch("investments.recommendation_engine.ask")
def test_healthy_path_falls_back_when_ollama_raises(mock_ask):
    mock_ask.side_effect = RuntimeError("Ollama unavailable")

    data = _base_data(expenses=10000, netWorth=500000, savings=20000, financialScore=80, goalHealth="Healthy")
    result = generate_investment_recommendation(data)

    assert result["riskProfile"] == "Moderate"
    assert result["portfolioScore"] == 70
    assert len(result["recommendations"]) == 4
    assert any(r["asset"] == "Index Funds (Nifty 50)" for r in result["recommendations"])
    # Summary also falls back to deterministic text since ask() always raises
    assert "portfolio suits" in result["summary"]


@patch("investments.recommendation_engine.ask")
def test_healthy_path_falls_back_when_portfolio_json_invalid(mock_ask):
    mock_ask.side_effect = ["not valid json at all", "Summary text."]

    data = _base_data(expenses=10000, netWorth=500000, savings=20000, financialScore=80, goalHealth="Healthy")
    result = generate_investment_recommendation(data)

    assert result["riskProfile"] == "Moderate"
    assert result["portfolioScore"] == 70


@patch("investments.recommendation_engine.ask")
def test_healthy_path_falls_back_when_recommendations_missing(mock_ask):
    portfolio_json = json.dumps({"riskProfile": "Aggressive", "recommendations": []})
    mock_ask.side_effect = [portfolio_json, "Summary text."]

    data = _base_data(expenses=10000, netWorth=500000, savings=20000, financialScore=80, goalHealth="Healthy")
    result = generate_investment_recommendation(data)

    assert result["riskProfile"] == "Moderate"  # fallback applied
    assert result["portfolioScore"] == 70


# ── monthlyInvestableAmount always present ────────────────────────────────────

@patch("investments.recommendation_engine.ask")
def test_monthly_investable_amount_present_on_all_paths(mock_ask):
    data = _base_data(savings=0)
    result = generate_investment_recommendation(data)
    assert result["monthlyInvestableAmount"] == 0.0
