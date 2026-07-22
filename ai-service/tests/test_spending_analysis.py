"""Unit tests for spending_coach.analysis — the deterministic layer that runs
before the LLM. Every function here is pure, so no mocking is needed.
"""
from spending_coach.analysis import (
    analyse,
    category_trends,
    classify_category,
    detect_outliers,
    detect_recurring,
    estimate_leakage,
)


def _expense(amount, category, merchant, month, day="05"):
    return {
        "amount": amount,
        "category": category,
        "merchant": merchant,
        "date": f"2026-{month}-{day}",
        "month": f"2026-{month}",
    }


# ── classify_category ────────────────────────────────────────────────────────

def test_classify_category_fixed():
    assert classify_category("Rent") == "fixed"
    assert classify_category("Home Loan EMI") == "fixed"
    assert classify_category("ELECTRICITY BILL") == "fixed"


def test_classify_category_discretionary():
    assert classify_category("Food & Dining") == "discretionary"
    assert classify_category("Shopping") == "discretionary"


def test_classify_category_unknown_label():
    assert classify_category("Crypto") == "unclassified"


# ── detect_recurring ─────────────────────────────────────────────────────────

def test_detect_recurring_finds_stable_monthly_charge():
    expenses = [_expense(499, "Entertainment", "Netflix", m) for m in ("01", "02", "03")]
    recurring = detect_recurring(expenses, months=3)

    assert len(recurring) == 1
    assert recurring[0]["merchant"] == "Netflix"
    assert recurring[0]["typicalAmount"] == 499
    assert recurring[0]["monthsSeen"] == 3


def test_detect_recurring_ignores_variable_amounts():
    # Same merchant every month, but the amounts swing far beyond 25%.
    expenses = [
        _expense(500, "Food", "BigBasket", "01"),
        _expense(2400, "Food", "BigBasket", "02"),
        _expense(1100, "Food", "BigBasket", "03"),
    ]
    assert detect_recurring(expenses, months=3) == []


def test_detect_recurring_ignores_single_month_merchants():
    expenses = [_expense(499, "Entertainment", "Netflix", "01", day=d) for d in ("05", "15")]
    assert detect_recurring(expenses, months=3) == []


def test_detect_recurring_ignores_high_frequency_merchants():
    # Daily coffee is frequency, not a subscription.
    expenses = [_expense(200, "Food", "Cafe", m, day=d)
                for m in ("01", "02") for d in ("04", "11", "18", "25")]
    assert detect_recurring(expenses, months=2) == []


def test_detect_recurring_needs_two_months_of_data():
    expenses = [_expense(499, "Entertainment", "Netflix", "01")]
    assert detect_recurring(expenses, months=1) == []


# ── detect_outliers ──────────────────────────────────────────────────────────

def test_detect_outliers_flags_charge_far_above_category_median():
    expenses = [_expense(1200, "Shopping", "Store", "01", day=d)
                for d in ("01", "02", "03", "04")]
    expenses.append(_expense(9000, "Shopping", "Croma", "01", day="18"))

    outliers = detect_outliers(expenses)
    assert len(outliers) == 1
    assert outliers[0]["merchant"] == "Croma"
    assert outliers[0]["timesTypical"] == 7.5


def test_detect_outliers_ignores_small_absolute_amounts():
    # 10x the median, but ₹300 is noise rather than a finding.
    expenses = [_expense(30, "Food", "Chai", "01", day=d) for d in ("01", "02", "03", "04")]
    expenses.append(_expense(300, "Food", "Chai", "01", day="18"))
    assert detect_outliers(expenses) == []


def test_detect_outliers_uses_the_overall_median_for_a_thin_category():
    # Shopping has one charge, so it has no median of its own — a lone ₹9,000
    # purchase must still be caught against the user's usual ticket.
    expenses = [_expense(400, "Food", "Cafe", "01", day=d) for d in ("01", "02", "03", "04")]
    expenses.append(_expense(9000, "Shopping", "Croma", "01", day="18"))

    outliers = detect_outliers(expenses)
    assert [o["merchant"] for o in outliers] == ["Croma"]
    assert outliers[0]["basis"] == "overall"


def test_detect_outliers_ignores_committed_categories():
    # Rent is large by nature — never a "one-off" worth planning for.
    expenses = [_expense(400, "Food", "Cafe", m, day=d)
                for m in ("01", "02") for d in ("01", "02", "03", "04")]
    expenses += [_expense(24000, "Rent", "Landlord", m) for m in ("01", "02")]
    assert detect_outliers(expenses) == []


def test_detect_outliers_ignores_a_repeat_merchant_in_a_thin_category():
    # A charge that recurs is a habit, not a one-off, even where the category
    # has too little history for a median of its own.
    expenses = [_expense(400, "Food", "Cafe", "01", day=d) for d in ("01", "02", "03", "04")]
    expenses += [_expense(5000, "Fitness", "Gym", m) for m in ("01", "02", "03")]
    assert detect_outliers(expenses) == []


# ── category_trends ──────────────────────────────────────────────────────────

def test_category_trends_compares_latest_to_prior_average():
    monthly = {"Food": {"2026-01": 1000.0, "2026-02": 1000.0, "2026-03": 2000.0}}
    trends = category_trends(monthly, ["2026-01", "2026-02", "2026-03"])

    assert trends[0]["category"] == "Food"
    assert trends[0]["priorAverage"] == 1000
    assert trends[0]["deltaPct"] == 100.0


def test_category_trends_needs_two_months():
    assert category_trends({"Food": {"2026-01": 1000.0}}, ["2026-01"]) == []


# ── analyse ──────────────────────────────────────────────────────────────────

def _four_months():
    tx = []
    for month in ("01", "02", "03", "04"):
        tx.append({"amount": 60000, "category": "Salary", "date": f"2026-{month}-01"})
        tx.append({"amount": -20000, "category": "Rent", "merchant": "Landlord",
                   "date": f"2026-{month}-02"})
        for day in ("06", "13", "20", "27"):
            tx.append({"amount": -600, "category": "Food", "merchant": "Swiggy",
                       "date": f"2026-{month}-{day}"})
    return tx


def test_analyse_splits_fixed_from_discretionary():
    result = analyse(_four_months())

    assert result["months"] == 4
    assert result["monthlyFixed"] == 20000
    assert result["monthlyDiscretionary"] == 2400
    assert result["monthlyIncome"] == 60000


def test_analyse_savings_rate_and_confidence():
    result = analyse(_four_months())

    # 60000 income vs 22400 spend a month.
    assert result["savingsRate"] == 62.7
    # 4 months but only 20 expenses — enough to trend, not enough to be certain.
    assert result["confidence"] == "medium"


def test_analyse_floor_ignores_a_barely_covered_month():
    tx = _four_months()
    # January is half-fetched: a single food charge instead of four. It must not
    # become the floor, or every later month looks wasteful by comparison.
    tx = [t for t in tx if not (t["date"].startswith("2026-01")
                                and t.get("merchant") == "Swiggy"
                                and t["date"] != "2026-01-06")]
    result = analyse(tx)

    assert result["discretionaryFloor"] == 2400


def test_analyse_tolerates_garbage_rows():
    result = analyse([
        {"amount": "not a number", "category": "Food", "date": "2026-01-01"},
        {"amount": None, "date": None},
        {"amount": -500, "date": "2026-01-05"},
    ])

    assert result["transactionCount"] == 1
    assert result["categoryTotals"] == {"Uncategorised": 500.0}


def test_analyse_empty_input():
    result = analyse([])

    assert result["transactionCount"] == 0
    assert result["months"] == 1
    # No income means no savings rate — reported as absent, not as zero.
    assert result["savingsRate"] is None


# ── estimate_leakage ─────────────────────────────────────────────────────────

def _evidence(**overrides):
    base = {
        "monthlyDiscretionary": 10000.0,
        "monthlyHabitual": 10000.0,
        "habitualBaseline": 10000.0,
        "monthlyOutlierExcess": 0.0,
        "discretionaryFloor": 7000.0,
        "recurring": [],
    }
    return {**base, **overrides}


def test_estimate_leakage_measures_spend_above_the_users_own_floor():
    leakage = estimate_leakage(_evidence())

    assert leakage["variable"] == 3000
    assert leakage["monthly"] == 3000
    assert leakage["basis"] == "floor"


def test_estimate_leakage_counts_half_of_cancellable_subscriptions():
    leakage = estimate_leakage(_evidence(recurring=[
        {"category": "Entertainment", "monthlyCost": 1000.0},
        {"category": "Rent", "monthlyCost": 20000.0},  # committed — excluded
    ]))

    assert leakage["subscriptions"] == 500
    assert leakage["monthly"] == 3500


def test_estimate_leakage_adds_one_off_spikes_on_top():
    # Spikes are stripped out of the habitual figures, so they add rather than
    # double-count.
    leakage = estimate_leakage(_evidence(habitualBaseline=8000.0,
                                         monthlyOutlierExcess=2000.0))

    assert leakage["variable"] == 1000
    assert leakage["spikes"] == 2000
    assert leakage["monthly"] == 3000


def test_estimate_leakage_falls_back_to_a_flat_share_without_a_floor():
    leakage = estimate_leakage(_evidence(discretionaryFloor=None))

    assert leakage["monthly"] == 1500
    assert leakage["basis"] == "estimate"


def test_estimate_leakage_never_exceeds_discretionary_spend():
    leakage = estimate_leakage(_evidence(
        monthlyDiscretionary=2000.0,
        monthlyHabitual=2000.0,
        discretionaryFloor=0.0,
        recurring=[{"category": "Shopping", "monthlyCost": 8000.0}],
    ))

    assert leakage["monthly"] == 2000
