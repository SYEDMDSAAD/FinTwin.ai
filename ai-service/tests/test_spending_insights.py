"""Unit tests for spending_coach.insights and the analysis pieces that feed it:
bank-narration parsing, payment channels and data-quality caveats.
"""
from spending_coach.analysis import analyse, estimate_leakage, parse_merchant
from spending_coach.insights import build_insights, build_recommendations


# ── parse_merchant ───────────────────────────────────────────────────────────

def test_parse_merchant_extracts_counterparty_and_channel_from_a_upi_narration():
    assert parse_merchant("UPI/DE/814774322101/Veer Walla/VBEJ/69553586") == ("Veer Walla", "UPI")


def test_parse_merchant_maps_channel_aliases():
    assert parse_merchant("FT/DE/167701549249/Krish Yohannan/ECYG/18410061")[1] == "Bank transfer"
    assert parse_merchant("ATM/CR/652405995636/Jayan Ray/JHWZ/27907180")[1] == "ATM cash"
    assert parse_merchant("CARD/DE/045794251195/Ritvik Hayre/CVRY/41914087")[1] == "Card"


def test_parse_merchant_handles_a_narration_with_no_channel_prefix():
    assert parse_merchant("785573824278/Devansh Khosla/KYCD/25166664") == \
           ("Devansh Khosla", "Other")


def test_parse_merchant_passes_a_plain_name_through():
    assert parse_merchant("Netflix") == ("Netflix", "Other")


def test_parse_merchant_collapses_double_spaces():
    assert parse_merchant("FT/DE/032523944300/Yuvraj  Wason/OSLF/52339801")[0] == "Yuvraj Wason"


def test_parse_merchant_tolerates_empty_input():
    assert parse_merchant("") == ("", "Other")
    assert parse_merchant(None) == ("", "Other")


# ── channels and transfers in analyse() ──────────────────────────────────────

def _statement():
    """Three months of narration-style rows, as a real bank import arrives."""
    tx = [{"amount": 90000, "category": "Income", "date": f"2026-{m}-01",
           "merchant": f"FT/CR/8815097150{m}/Elakshi Ray/OGQW/94265795"}
          for m in ("05", "06", "07")]
    for m in ("05", "06", "07"):
        tx.append({"amount": -20000, "category": "Rent", "date": f"2026-{m}-02",
                   "merchant": f"FT/DE/1677015492{m}/Krish Yohannan/ECYG/18410061"})
        for d in ("07", "14", "21"):
            tx.append({"amount": -4000, "category": "Other", "date": f"2026-{m}-{d}",
                       "merchant": f"ATM/DE/79396627{m}{d}/Self/DIMJ/20447298"})
        tx.append({"amount": -1500, "category": "Other", "date": f"2026-{m}-09",
                   "merchant": f"UPI/DE/8147743221{m}/Veer Walla/VBEJ/69553586"})
    return tx


def test_analyse_reports_the_payment_channel_mix():
    result = analyse(_statement())
    channels = {c["channel"]: c for c in result["channelTotals"]}

    # July is the month we are in, so only May and June count towards a rate.
    assert channels["ATM cash"]["count"] == 6
    assert channels["ATM cash"]["monthlyTotal"] == 12000
    assert channels["Bank transfer"]["monthlyTotal"] == 20000


def test_analyse_groups_a_repeat_counterparty_across_narrations():
    # The reference number differs every month; the counterparty does not.
    result = analyse(_statement())
    assert any(r["merchant"] == "Veer Walla" for r in result["recurring"])


def test_analyse_excludes_transfers_from_both_sides():
    tx = _statement() + [
        {"amount": -50000, "category": "Transfer", "date": "2026-06-15", "merchant": "Self"},
        {"amount": 50000, "category": "Transfer", "date": "2026-06-15", "merchant": "Self"},
    ]
    result = analyse(tx)

    assert result["dataQuality"]["transfersExcluded"] == 2
    assert result["monthlyExpense"] == analyse(_statement())["monthlyExpense"]


# ── data quality ─────────────────────────────────────────────────────────────

def test_data_quality_measures_the_uncategorised_share():
    quality = analyse(_statement())["dataQuality"]

    # ₹40,500 of ₹100,500 is "Other" — reported, but under the warning line.
    assert quality["uncategorisedShare"] == 40.3
    assert quality["caveats"] == []


def test_data_quality_warns_when_categories_are_mostly_missing():
    # What a raw statement import actually looks like before categorisation.
    tx = [{"amount": -5000, "category": "Other", "date": f"2026-06-{d:02d}",
           "merchant": f"UPI/DE/8147743221{d}/Payee {d}/VBEJ/6955358{d}"}
          for d in range(1, 10)]
    quality = analyse(tx)["dataQuality"]

    assert quality["uncategorisedShare"] == 100.0
    assert any("uncategorised" in c for c in quality["caveats"])


def test_data_quality_flags_a_bulk_income_import():
    # A whole account history credited on one day is not a salary.
    tx = _statement() + [{"amount": 3000000, "category": "Other",
                          "date": "2026-06-24", "merchant": "Opening balance"}]
    result = analyse(tx)
    quality = result["dataQuality"]

    assert quality["incomeSpikeDate"] == "2026-06-24"
    assert quality["incomeReliable"] is False
    assert any("imported balance" in c for c in quality["caveats"])
    # Withheld rather than reported from an artefact.
    assert result["savingsRate"] is None
    assert result["monthlyIncome"] is None


def test_a_monthly_salary_is_not_mistaken_for_an_import():
    """One credit a month is what a salary looks like — it must stay reliable."""
    tx = [{"amount": 90000, "category": "Salary", "date": f"2026-{m}-01",
           "merchant": "Employer"} for m in ("05", "06")]
    tx += [{"amount": -3000, "category": "Food", "date": f"2026-{m}-1{d}",
            "merchant": "Swiggy"} for m in ("05", "06") for d in ("0", "5")]
    result = analyse(tx)

    assert result["dataQuality"]["incomeReliable"] is True
    assert result["savingsRate"] == 93.3


def test_a_single_month_of_data_does_not_condemn_its_one_salary_credit():
    tx = [{"amount": 50000, "category": "Salary", "date": "2026-05-01", "merchant": "Employer"},
          {"amount": -5000, "category": "Food", "date": "2026-05-05", "merchant": "Swiggy"}]
    result = analyse(tx)

    # Inside one month a salary *is* one day holding all the income.
    assert result["dataQuality"]["incomeReliable"] is True
    assert result["savingsRate"] == 90.0


def test_data_quality_stays_quiet_on_clean_data():
    tx = [{"amount": 90000, "category": "Salary", "date": f"2026-{m}-01", "merchant": "Employer"}
          for m in ("05", "06", "07")]
    tx += [{"amount": -3000, "category": "Food", "date": f"2026-{m}-1{d}", "merchant": "Swiggy"}
           for m in ("05", "06", "07") for d in ("0", "5")]
    assert analyse(tx)["dataQuality"]["caveats"] == []


# ── the leakage window bug this all surfaced ─────────────────────────────────

def test_monthly_figures_ignore_the_month_still_in_progress():
    """Averages must divide by finished months only.

    The window always ends inside the current month, so including it averaged
    a fortnight of spending as though it were a whole month and understated
    every "per month" figure on the page.
    """
    from datetime import date

    this_month = date.today().strftime("%Y-%m")
    tx = [{"amount": -10000, "category": "Food", "date": "2026-05-10",
           "merchant": "Swiggy"},
          {"amount": -10000, "category": "Food", "date": "2026-06-10",
           "merchant": "Swiggy"},
          {"amount": -400, "category": "Food", "date": f"{this_month}-02",
           "merchant": "Swiggy"}]
    result = analyse(tx)

    assert result["completeMonths"] == ["2026-05", "2026-06"]
    assert result["monthlyExpense"] == 10000  # not ₹6,800 across three months


def test_trends_are_not_measured_against_a_month_still_in_progress():
    from datetime import date

    this_month = date.today().strftime("%Y-%m")
    tx = [{"amount": -5000, "category": "Food", "date": "2026-05-10", "merchant": "A"},
          {"amount": -9000, "category": "Food", "date": "2026-06-10", "merchant": "A"},
          {"amount": -100, "category": "Food", "date": f"{this_month}-01", "merchant": "A"}]

    trends = analyse(tx)["trends"]

    # June against May — not "Food down 99%" because the month just started.
    assert trends[0]["latestMonth"] == 9000
    assert trends[0]["priorAverage"] == 5000


def test_leakage_survives_a_half_finished_final_month():
    """A partial current month must not zero the gap it is measured against.

    Averaging habitual spend across the whole window while taking the floor
    from complete months only dragged the average below the floor, and the
    page showed ₹0 recoverable on three months of real spending.
    """
    tx = []
    for m, spend in (("05", 12000), ("06", 8000), ("07", 500)):
        tx.append({"amount": 90000, "category": "Salary", "date": f"2026-{m}-01",
                   "merchant": "Employer"})
        tx.append({"amount": -spend, "category": "Food", "date": f"2026-{m}-05",
                   "merchant": "Swiggy"})

    evidence = analyse(tx)
    leakage = estimate_leakage(evidence)

    # May and June are the comparable months: average ₹10,000, cheapest ₹8,000.
    assert evidence["habitualBaseline"] == 10000
    assert evidence["discretionaryFloor"] == 8000
    assert leakage["variable"] == 2000
    assert leakage["monthly"] > 0


# ── insights ─────────────────────────────────────────────────────────────────

def _evidence_and_leakage(tx=None):
    evidence = analyse(_statement() if tx is None else tx)
    return evidence, estimate_leakage(evidence)


def test_build_insights_returns_cards_with_a_tone():
    cards = build_insights(*_evidence_and_leakage())

    assert cards
    assert all({"kind", "title", "detail", "tone"} <= set(c) for c in cards)
    assert all(c["tone"] in ("warn", "good", "info") for c in cards)


def test_build_insights_surfaces_the_channel_mix():
    cards = build_insights(*_evidence_and_leakage())
    assert any(c["kind"] == "channel" and "ATM cash" in c["title"] for c in cards)


def test_build_insights_names_the_biggest_single_charge():
    tx = [{"amount": -400, "category": "Other", "date": f"2026-05-{d:02d}",
           "merchant": f"UPI/DE/8147743221{d}/Payee {d}/VBEJ/6955358{d}"}
          for d in range(1, 9)]
    tx.append({"amount": -95000, "category": "Other", "date": "2026-05-18",
               "merchant": "CARD/DE/045794251195/Ritvik Hayre/CVRY/41914087"})

    cards = build_insights(*_evidence_and_leakage(tx))
    largest = next(c for c in cards if c["kind"] == "largest")

    assert "₹95,000" in largest["title"]
    assert "Ritvik Hayre" in largest["detail"]
    assert "card" in largest["detail"]


def test_build_insights_flags_spend_concentrated_in_a_few_payments():
    tx = [{"amount": -100, "category": "Other", "date": f"2026-05-{d:02d}",
           "merchant": f"Small {d}"} for d in range(1, 20)]
    tx += [{"amount": -50000, "category": "Other", "date": f"2026-05-2{d}",
            "merchant": f"Big {d}"} for d in range(1, 4)]

    cards = build_insights(*_evidence_and_leakage(tx))
    assert any(c["kind"] == "concentration" for c in cards)


def test_build_insights_relabels_the_catch_all_category():
    """"Other down 34%" tells the user nothing about their spending."""
    tx = []
    for month, amount in (("05", -9000), ("06", -3000)):
        for d in range(1, 5):
            tx.append({"amount": amount / 4, "category": "Other",
                       "date": f"2026-{month}-{d:02d}", "merchant": f"Payee {month}{d}"})

    cards = build_insights(*_evidence_and_leakage(tx))
    trend = next(c for c in cards if c["kind"] == "trend")

    assert trend["title"].startswith("Uncategorised spending")
    assert "Other" not in trend["title"]


def test_build_insights_reports_the_total_month_over_month_move():
    tx = []
    for month, amount in (("05", -2000), ("06", -6000)):
        for d in range(1, 5):
            tx.append({"amount": amount / 4, "category": f"Cat {d}",
                       "date": f"2026-{month}-{d:02d}", "merchant": f"Payee {month}{d}"})

    cards = build_insights(*_evidence_and_leakage(tx))
    total = next(c for c in cards if c["kind"] == "total")

    assert "up 200%" in total["title"]
    assert total["tone"] == "warn"


def test_build_insights_caps_the_card_count():
    assert len(build_insights(*_evidence_and_leakage())) <= 8


def test_build_insights_on_empty_data():
    assert build_insights(*_evidence_and_leakage([])) == []


# ── recommendations ──────────────────────────────────────────────────────────

def test_recommendations_are_ranked_by_monthly_impact():
    recs = build_recommendations(*_evidence_and_leakage())

    quantified = [r["impactPerMonth"] for r in recs if r["impactPerMonth"] is not None]
    assert quantified == sorted(quantified, reverse=True)
    assert [r["priority"] for r in recs] == list(range(1, len(recs) + 1))


def test_recommendations_put_unquantified_actions_last():
    recs = build_recommendations(*_evidence_and_leakage())

    figures = [r["impactPerMonth"] is not None for r in recs if not r["prerequisite"]]
    # Once the figures stop, they do not start again.
    assert figures == sorted(figures, reverse=True)


def test_categorising_is_ranked_above_anything_with_a_figure():
    """Until categories exist the coach is reading labels, not habits."""
    tx = [{"amount": -5000, "category": "Other", "date": f"2026-{m}-{d:02d}",
           "merchant": f"UPI/DE/8147743221{d}/Payee {d}/VBEJ/6955358{d}"}
          for m in ("05", "06") for d in range(1, 8)]
    tx += [{"amount": 90000, "category": "Salary", "date": f"2026-{m}-01",
            "merchant": "Employer"} for m in ("05", "06")]

    evidence = analyse(tx)
    recs = build_recommendations(evidence, estimate_leakage(evidence))

    assert recs[0]["prerequisite"] is True
    assert "Categorise" in recs[0]["action"]
    assert recs[0]["impactPerMonth"] is None


def test_recommendations_carry_evidence_and_effort():
    recs = build_recommendations(*_evidence_and_leakage())

    assert recs
    for rec in recs:
        assert rec["evidence"]
        assert rec["effort"] in ("low", "medium", "high")
        assert rec["source"] == "analysis"


def test_recommendations_flag_heavy_cash_use():
    recs = build_recommendations(*_evidence_and_leakage())
    assert any("ATM cash" in r["evidence"] for r in recs)


def test_recommendations_never_target_committed_spend():
    recs = build_recommendations(*_evidence_and_leakage())
    assert all("Krish Yohannan" not in r["action"] for r in recs)


# ── advice is never built on income that is not earnings ─────────────────────

def _imported_balance_statement():
    """A statement import: months of spending, one bulk credit, no categories."""
    tx = [{"amount": -8000 - d * 100 - (2000 if m == "06" else 0), "category": "Other",
           "date": f"2026-{m}-{d:02d}",
           "merchant": f"UPI/DE/8147743221{d}/Payee {m}{d}/VBEJ/6955358{d}"}
          for m in ("05", "06") for d in range(1, 10)]
    tx.append({"amount": 5000000, "category": "Other", "date": "2026-06-24",
               "merchant": "042108065709/Opening Balance/GPGL/01785760"})
    return tx


def test_no_health_verdict_without_verifiable_income():
    from spending_coach.coach_engine import generate_spending_coach
    from unittest.mock import patch

    with patch("spending_coach.coach_engine.ask", side_effect=RuntimeError("offline")):
        result = generate_spending_coach(_imported_balance_statement())

    assert result["spendingHealth"] == "Unrated"
    assert result["snapshot"]["savingsRate"] is None
    assert result["snapshot"]["monthlyIncome"] is None
    assert "savings rate" in result["coachMessage"]  # explains the absence
    assert "%" not in result["coachMessage"].split("savings rate")[0]


def test_no_investment_advice_is_ever_recommended():
    """The coach is not a licensed adviser and must not name products."""
    evidence, leakage = _evidence_and_leakage(_imported_balance_statement())
    text = " ".join(r["action"] + " " + r["rationale"]
                    for r in build_recommendations(evidence, leakage))

    for product in ("SIP", "index", "Nifty", "fund", "FD", "deposit"):
        assert product.lower() not in text.lower(), f"recommended a product: {product}"


def test_recoverable_spend_is_not_called_safe_to_cut_when_uncategorised():
    from spending_coach.coach_engine import _fallback_message

    evidence, leakage = _evidence_and_leakage(_imported_balance_statement())
    message = _fallback_message(evidence, leakage)

    assert "without touching your committed bills" not in message
    assert "rent and bills" in message


def test_confidence_drops_when_the_data_cannot_support_conclusions():
    evidence = analyse(_imported_balance_statement())
    assert evidence["confidence"] == "low"


def test_uncategorised_spend_is_flagged_as_possibly_being_transfers():
    quality = analyse(_imported_balance_statement())["dataQuality"]
    assert any("moved between your own" in c for c in quality["caveats"])
