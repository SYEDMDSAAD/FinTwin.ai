"""Unit tests for anomaly_detection.risk_analysis — pure Python, no mocks needed."""
from anomaly_detection.risk_analysis import analyse_financial_risk


def test_high_expense_ratio_is_critical():
    # Compounding multiple penalties (expense ratio, savings rate, emergency
    # fund, financial score) so overall health score drops below 40.
    report = analyse_financial_risk(
        income=10000, expenses=9700, savings=300, net_worth=500,
        financial_score=30, budget_utilization=None, active_goal_count=0,
    )
    expense_risks = [r for r in report["risks"] if r["area"] == "Expense Ratio"]
    assert len(expense_risks) == 1
    assert expense_risks[0]["severity"] == "critical"
    assert report["overall_risk"] == "Critical"


def test_high_expense_ratio_alone_is_flagged_critical_severity():
    # Even when overall risk doesn't reach "Critical", the expense-ratio
    # risk item itself must still be flagged "critical" in isolation.
    report = analyse_financial_risk(
        income=10000, expenses=9600, savings=400, net_worth=50000,
        financial_score=70, budget_utilization=None, active_goal_count=0,
    )
    expense_risks = [r for r in report["risks"] if r["area"] == "Expense Ratio"]
    assert len(expense_risks) == 1
    assert expense_risks[0]["severity"] == "critical"


def test_low_savings_rate_is_high_severity():
    # income high enough to avoid critical expense ratio, but savings rate < 5%
    report = analyse_financial_risk(
        income=10000, expenses=7000, savings=300, net_worth=100000,
        financial_score=70, budget_utilization=None, active_goal_count=0,
    )
    savings_risks = [r for r in report["risks"] if r["area"] == "Savings Rate"]
    assert len(savings_risks) == 1
    assert savings_risks[0]["severity"] == "high"


def test_healthy_inputs_give_low_or_moderate_risk():
    report = analyse_financial_risk(
        income=100000, expenses=50000, savings=50000, net_worth=2000000,
        financial_score=85, budget_utilization=None, active_goal_count=2,
    )
    assert report["overall_risk"] in ("Low", "Moderate")
    assert report["score"] >= 60


def test_budget_exceeded_category_shows_in_risks():
    report = analyse_financial_risk(
        income=100000, expenses=50000, savings=50000, net_worth=2000000,
        financial_score=85,
        budget_utilization={"Dining": 120, "Travel": 50},
        active_goal_count=0,
    )
    budget_risks = [r for r in report["risks"] if r["area"] == "Budget: Dining"]
    assert len(budget_risks) == 1
    assert budget_risks[0]["severity"] == "high"
    assert "exceeded" in budget_risks[0]["observation"]
    # Travel at 50% should not appear
    assert [r for r in report["risks"] if r["area"] == "Budget: Travel"] == []


def test_budget_near_limit_is_medium_severity():
    report = analyse_financial_risk(
        income=100000, expenses=50000, savings=50000, net_worth=2000000,
        financial_score=85,
        budget_utilization={"Shopping": 90},
        active_goal_count=0,
    )
    risks = [r for r in report["risks"] if r["area"] == "Budget: Shopping"]
    assert len(risks) == 1
    assert risks[0]["severity"] == "medium"


def test_score_is_clamped_between_0_and_100():
    # Stack as many penalties as possible: critical expense ratio (30) +
    # low savings (20) + critical emergency fund (25) + budget exceeded (10) +
    # low financial score (15) = 100 -> floor at 0
    report = analyse_financial_risk(
        income=10000, expenses=9900, savings=50, net_worth=0,
        financial_score=10,
        budget_utilization={"Food": 150},
        active_goal_count=0,
    )
    assert 0 <= report["score"] <= 100
    assert report["score"] == 0
    assert report["overall_risk"] == "Critical"


def test_score_decreases_as_penalties_increase():
    healthy = analyse_financial_risk(
        income=100000, expenses=50000, savings=50000, net_worth=2000000,
        financial_score=85, budget_utilization=None, active_goal_count=0,
    )
    unhealthy = analyse_financial_risk(
        income=10000, expenses=9000, savings=200, net_worth=1000,
        financial_score=30, budget_utilization=None, active_goal_count=0,
    )
    assert unhealthy["score"] < healthy["score"]


def test_zero_income_does_not_crash():
    report = analyse_financial_risk(
        income=0, expenses=0, savings=0, net_worth=0,
        financial_score=50, budget_utilization=None, active_goal_count=0,
    )
    assert isinstance(report["score"], int)
    assert report["overall_risk"] in ("Low", "Moderate", "High", "Critical")


def test_low_financial_score_adds_risk_item():
    report = analyse_financial_risk(
        income=100000, expenses=50000, savings=50000, net_worth=2000000,
        financial_score=30, budget_utilization=None, active_goal_count=0,
    )
    score_risks = [r for r in report["risks"] if r["area"] == "Financial Score"]
    assert len(score_risks) == 1
    assert score_risks[0]["severity"] == "high"


def test_low_emergency_fund_is_critical():
    report = analyse_financial_risk(
        income=100000, expenses=60000, savings=40000, net_worth=1000,
        financial_score=85, budget_utilization=None, active_goal_count=0,
    )
    ef_risks = [r for r in report["risks"] if r["area"] == "Emergency Fund"]
    assert len(ef_risks) == 1
    assert ef_risks[0]["severity"] == "critical"
