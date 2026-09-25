"""Unit tests for investments.recommendation_engine.

Rules choose every allocation, by asset class. The model is called once, for
the two-sentence summary, which is kept only when it is grounded in the facts
and names no product. All ask() calls are mocked, so no test touches Ollama.
"""
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


# ── Healthy path: rules choose the allocation, the model only summarises ────

_HEALTHY = dict(expenses=10000, netWorth=500000, savings=20000, financialScore=80, goalHealth="Healthy")


@patch("investments.recommendation_engine.ask")
def test_healthy_path_allocates_by_asset_class_without_the_model(mock_ask):
    mock_ask.return_value = "Summary text."
    result = generate_investment_recommendation(_base_data(**_HEALTHY))

    assert result["riskProfile"] == "Moderate"
    assert [r["asset"] for r in result["recommendations"]] == [
        "Equity index funds", "Debt funds", "Gold", "Fixed deposit / liquid fund"]
    assert sum(r["allocation"] for r in result["recommendations"]) == 100
    assert result["recommendations"][0]["amount"] == 20000 * 45 / 100
    assert result["expectedReturn"] == "8-11%"
    mock_ask.assert_called_once()          # the summary, never the portfolio


@patch("investments.recommendation_engine.ask")
def test_aggressive_only_when_every_cushion_is_in_place(mock_ask):
    mock_ask.return_value = "Summary text."
    # score 80, savings rate 40%, emergency fund 500000 / 60000 > 1
    result = generate_investment_recommendation(_base_data(income=50000, **_HEALTHY))
    assert result["riskProfile"] == "Aggressive"
    assert result["recommendations"][0]["allocation"] == 60

    # the same person without a full 6-month buffer stays Moderate
    result = generate_investment_recommendation(_base_data(
        income=50000, **{**_HEALTHY, "netWorth": 45000}))
    assert result["riskProfile"] == "Moderate"


@patch("investments.recommendation_engine.ask")
def test_portfolio_score_is_computed_and_bounded(mock_ask):
    mock_ask.return_value = "Summary text."
    result = generate_investment_recommendation(_base_data(**_HEALTHY))
    # 0.4*80 + 0.4*(20/40*100) + 0.2*100 = 32 + 20 + 20
    assert result["portfolioScore"] == 72

    result = generate_investment_recommendation(_base_data(income=20000, **_HEALTHY))
    assert 0 <= result["portfolioScore"] <= 100


@patch("investments.recommendation_engine.ask")
def test_equity_heavy_portfolio_shifts_new_money_to_debt(mock_ask):
    mock_ask.return_value = "Summary text."
    result = generate_investment_recommendation(_base_data(
        portfolioValue=750000, currentAllocation={"Stocks": 90.0, "Gold": 10.0}, **_HEALTHY))
    by_asset = {r["asset"]: r["allocation"] for r in result["recommendations"]}
    assert by_asset["Equity index funds"] == 35
    assert by_asset["Debt funds"] == 40
    assert sum(by_asset.values()) == 100


@patch("investments.recommendation_engine.ask")
def test_grounded_summary_is_kept(mock_ask):
    mock_ask.return_value = ("A moderate allocation suits your 20% savings rate. "
                             "Start by putting ₹9,000 a month into equity index funds.")
    result = generate_investment_recommendation(_base_data(**_HEALTHY))
    assert result["summary"].startswith("A moderate allocation suits your 20%")
    assert result["summarySource"] == "ai"


@patch("investments.recommendation_engine.ask")
def test_summary_with_an_invented_figure_is_replaced(mock_ask):
    mock_ask.return_value = "Invest ₹12,000 a month in equity for 14% returns."
    result = generate_investment_recommendation(_base_data(**_HEALTHY))
    assert "₹12,000" not in result["summary"]
    assert result["summarySource"] == "analysis"
    assert "moderate allocation fits a 20% savings rate" in result["summary"]


@patch("investments.recommendation_engine.ask")
def test_summary_naming_a_product_is_replaced(mock_ask):
    mock_ask.return_value = "Put ₹9,000 a month into the Parag Parikh Flexi Cap fund."
    result = generate_investment_recommendation(_base_data(**_HEALTHY))
    assert "Parag" not in result["summary"]
    assert result["summarySource"] == "analysis"


@patch("investments.recommendation_engine.ask")
def test_model_failure_still_returns_a_full_recommendation(mock_ask):
    mock_ask.side_effect = RuntimeError("Ollama unavailable")
    result = generate_investment_recommendation(_base_data(**_HEALTHY))
    assert result["riskProfile"] == "Moderate"
    assert len(result["recommendations"]) == 4
    assert result["summarySource"] == "analysis"


@patch("investments.recommendation_engine.ask")
def test_summary_call_finishes_inside_the_backend_deadline(mock_ask):
    mock_ask.return_value = "Summary text."
    generate_investment_recommendation(_base_data(**_HEALTHY))
    assert mock_ask.call_args.kwargs["timeout"] <= 15
    assert mock_ask.call_args.kwargs["feature"] == "investments"


# ── monthlyInvestableAmount always present ────────────────────────────────────

@patch("investments.recommendation_engine.ask")
def test_monthly_investable_amount_present_on_all_paths(mock_ask):
    data = _base_data(savings=0)
    result = generate_investment_recommendation(data)
    assert result["monthlyInvestableAmount"] == 0.0


# ── liquidSavings drives the emergency-fund check (not net worth) ─────────────

@patch("investments.recommendation_engine.ask")
def test_liquid_savings_overrides_net_worth_for_emergency_fund(mock_ask):
    """A homeowner with a large net worth but no cash must still be told to
    build an emergency fund."""
    mock_ask.return_value = "Summary text."
    data = _base_data(expenses=50000, netWorth=5000000, liquidSavings=1000,
                      savings=20000, financialScore=80, goalHealth="Healthy")
    result = generate_investment_recommendation(data)

    assert result["riskProfile"] == "Conservative"
    assert result["recommendations"][0]["asset"] == "Emergency Fund"


@patch("investments.recommendation_engine.ask")
def test_zero_liquid_savings_is_not_treated_as_missing(mock_ask):
    """liquidSavings=0 is a real answer, not a reason to fall back to netWorth."""
    mock_ask.return_value = "Summary text."
    data = _base_data(expenses=50000, netWorth=5000000, liquidSavings=0,
                      savings=20000, financialScore=80, goalHealth="Healthy")
    result = generate_investment_recommendation(data)

    assert result["recommendations"][0]["asset"] == "Emergency Fund"


@patch("investments.recommendation_engine.ask")
def test_missing_liquid_savings_still_falls_back_to_net_worth(mock_ask):
    mock_ask.return_value = "Summary text."
    data = _base_data(expenses=50000, netWorth=5000000, savings=20000,
                      financialScore=80, goalHealth="Healthy")
    data.pop("liquidSavings", None)
    result = generate_investment_recommendation(data)

    # netWorth is ample, so the emergency branch is skipped
    assert result["recommendations"][0]["asset"] != "Emergency Fund"


# ── Emergency fund gate: buffer before market-linked investing ────────────────

@patch("investments.recommendation_engine.ask")
def test_partial_emergency_fund_still_prioritises_buffer(mock_ask):
    """3 months of expenses saved (ratio 0.33) is below the 6-month target —
    the buffer is funded before equities."""
    mock_ask.return_value = "Summary text."
    data = _base_data(expenses=50000, liquidSavings=100000, netWorth=100000,
                      savings=20000, financialScore=80, goalHealth="Healthy")
    result = generate_investment_recommendation(data)

    assert result["riskProfile"] == "Conservative"
    assert result["recommendations"][0]["asset"] == "Emergency Fund"


@patch("investments.recommendation_engine.ask")
def test_healthy_emergency_fund_reaches_the_class_allocation(mock_ask):
    mock_ask.return_value = "Summary."
    # 4 months of expenses = ratio 0.67, above the 0.5 gate
    data = _base_data(expenses=50000, liquidSavings=200000, netWorth=200000,
                      savings=20000, financialScore=80, goalHealth="Healthy")
    result = generate_investment_recommendation(data)

    assert result["riskProfile"] == "Moderate"
    assert result["recommendations"][0]["asset"] == "Equity index funds"


@patch("investments.recommendation_engine.ask")
def test_existing_portfolio_is_in_the_summary_facts(mock_ask):
    mock_ask.return_value = "Summary."
    generate_investment_recommendation(_base_data(
        portfolioValue=750000, currentAllocation={"Stocks": 90.0, "Gold": 10.0}, **_HEALTHY))
    prompt = mock_ask.call_args[0][0]
    assert "₹750,000" in prompt and "Stocks 90%" in prompt
    assert "Never name a specific fund" in prompt


@patch("investments.recommendation_engine.ask")
def test_no_portfolio_marks_first_time_investor(mock_ask):
    mock_ask.return_value = "Summary."
    generate_investment_recommendation(_base_data(**_HEALTHY))
    assert "first-time investor" in mock_ask.call_args[0][0]
