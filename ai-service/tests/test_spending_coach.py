"""Unit tests for spending_coach.coach_engine.

Pure-logic helpers (_parse_llm_json, _normalize_tips) are tested directly.
generate_spending_coach() mocks spending_coach.coach_engine.ask to avoid
hitting Ollama. The analysis layer it sits on has its own suite in
test_spending_analysis.py.
"""
import json
from unittest.mock import patch

from spending_coach.coach_engine import (
    _merge_ai_suggestions,
    _normalize_tips,
    _parse_llm_json,
    generate_spending_coach,
    ground_tips,
)


# ── _parse_llm_json ───────────────────────────────────────────────────────────

def test_parse_llm_json_valid():
    text = '{"coachMessage": "hi", "tips": ["a", "b"]}'
    result = _parse_llm_json(text)
    assert result == {"coachMessage": "hi", "tips": ["a", "b"]}


def test_parse_llm_json_strips_markdown_fences():
    text = '```json\n{"coachMessage": "hi", "tips": []}\n```'
    result = _parse_llm_json(text)
    assert result == {"coachMessage": "hi", "tips": []}


def test_parse_llm_json_extracts_object_from_surrounding_text():
    text = 'Here is your JSON: {"coachMessage": "hi", "tips": []} Thanks!'
    result = _parse_llm_json(text)
    assert result == {"coachMessage": "hi", "tips": []}


def test_parse_llm_json_handles_trailing_commas():
    text = '{"coachMessage": "hi", "tips": ["a", "b",],}'
    result = _parse_llm_json(text)
    assert result == {"coachMessage": "hi", "tips": ["a", "b"]}


def test_parse_llm_json_returns_none_for_garbage():
    assert _parse_llm_json("not json at all, sorry") is None


def test_parse_llm_json_returns_none_for_empty_string():
    assert _parse_llm_json("") is None


# ── _normalize_tips ───────────────────────────────────────────────────────────

def test_normalize_tips_plain_strings():
    tips = ["Save more", "  Spend less  "]
    assert _normalize_tips(tips) == ["Save more", "Spend less"]


def test_normalize_tips_skips_blank_strings():
    tips = ["Save more", "   ", ""]
    assert _normalize_tips(tips) == ["Save more"]


def test_normalize_tips_collapses_dict_with_action_and_reasoning():
    tips = [{"action": "Cut dining", "reasoning": "It's your top category"}]
    assert _normalize_tips(tips) == ["Cut dining It's your top category"]


def test_normalize_tips_dict_with_only_action():
    tips = [{"action": "Cut dining"}]
    assert _normalize_tips(tips) == ["Cut dining"]


def test_normalize_tips_dict_fallback_keys():
    tips = [{"recommendation": "Save 10%"}, {"tip": "Track expenses"}, {"advice": "Budget better"}]
    assert _normalize_tips(tips) == ["Save 10%", "Track expenses", "Budget better"]


def test_normalize_tips_dict_with_no_usable_fields_is_dropped():
    tips = [{"category": "Food"}]
    assert _normalize_tips(tips) == []


def test_normalize_tips_mixed_list():
    tips = ["Plain tip", {"action": "Cut subs"}, {"category": "Food"}]
    assert _normalize_tips(tips) == ["Plain tip", "Cut subs"]


# ── generate_spending_coach ───────────────────────────────────────────────────

def _transactions():
    return [
        {"amount": 50000, "category": "Salary", "date": "2026-01-01"},
        {"amount": -5000, "category": "Food", "merchant": "Swiggy", "date": "2026-01-05"},
        {"amount": -3000, "category": "Travel", "merchant": "Uber", "date": "2026-01-10"},
        {"amount": -2000, "category": "Entertainment", "merchant": "Netflix", "date": "2026-01-15"},
    ]


def test_generate_spending_coach_no_expenses_returns_unknown():
    result = generate_spending_coach([{"amount": 1000, "category": "Salary", "date": "2026-01-01"}])
    assert result["spendingHealth"] == "Unknown"
    assert result["monthlyLeakage"] == 0
    assert result["tips"] == []
    assert "No spending data" in result["coachMessage"]


@patch("spending_coach.coach_engine.ask")
def test_generate_spending_coach_happy_path_with_mocked_llm(mock_ask):
    mock_ask.return_value = json.dumps({
        "coachMessage": "You're doing okay, focus on Food spending.",
        "tips": ["Cut Swiggy orders", "Cancel unused Netflix", "Use cheaper Uber pool", "Automate savings"],
    })
    result = generate_spending_coach(_transactions())

    assert result["spendingHealth"] in ("Excellent", "Good", "Average", "Poor")
    assert result["coachMessage"] == "You're doing okay, focus on Food spending."
    assert result["monthlyLeakage"] > 0
    mock_ask.assert_called_once()

    # Computed recommendations lead; the model's survive as extra suggestions.
    sources = [r["source"] for r in result["recommendations"]]
    assert sources[0] == "analysis"
    assert "ai" in sources
    assert result["tips"], "tips stay populated for the original contract"


@patch("spending_coach.coach_engine.ask")
def test_generate_spending_coach_falls_back_when_ask_raises(mock_ask):
    mock_ask.side_effect = RuntimeError("Ollama unavailable")
    result = generate_spending_coach(_transactions())

    assert result["spendingHealth"] in ("Excellent", "Good", "Average", "Poor")
    assert isinstance(result["tips"], list)
    assert len(result["tips"]) > 0
    assert "savings rate" in result["coachMessage"]
    assert result["monthlyLeakage"] > 0


@patch("spending_coach.coach_engine.ask")
def test_generate_spending_coach_falls_back_when_llm_returns_garbage(mock_ask):
    mock_ask.return_value = "this is not valid json"
    result = generate_spending_coach(_transactions())

    assert isinstance(result["tips"], list)
    assert len(result["tips"]) > 0


@patch("spending_coach.coach_engine.ask")
def test_generate_spending_coach_uses_fallback_tips_when_llm_tips_empty(mock_ask):
    mock_ask.return_value = json.dumps({"coachMessage": "Some message", "tips": []})
    result = generate_spending_coach(_transactions())

    assert result["coachMessage"] == "Some message"
    assert len(result["tips"]) > 0


# ── grounding: the prompt carries the analysis layer's findings ───────────────

def _multi_month_transactions():
    """Four months with a subscription, a rising category and a one-off spike."""
    tx = []
    for month in ("01", "02", "03", "04"):
        tx.append({"amount": 60000, "category": "Salary", "date": f"2026-{month}-01"})
        tx.append({"amount": -20000, "category": "Rent", "merchant": "Landlord",
                   "date": f"2026-{month}-02"})
        tx.append({"amount": -499, "category": "Entertainment", "merchant": "Netflix",
                   "date": f"2026-{month}-03"})
        for day in ("06", "13", "20", "27"):
            tx.append({"amount": -600, "category": "Food", "merchant": "Swiggy",
                       "date": f"2026-{month}-{day}"})
    # March: food doubles, plus a one-off far above the usual ticket.
    tx += [{"amount": -600, "category": "Food", "merchant": "Swiggy", "date": "2026-03-09"}
           for _ in range(4)]
    tx.append({"amount": -9000, "category": "Shopping", "merchant": "Croma",
               "date": "2026-03-18"})
    return tx


@patch("spending_coach.coach_engine.ask")
def test_prompt_is_grounded_in_detected_findings(mock_ask):
    mock_ask.return_value = json.dumps({"coachMessage": "ok", "tips": ["a", "b", "c", "d"]})
    generate_spending_coach(_multi_month_transactions())

    prompt = mock_ask.call_args[0][0]
    assert "Netflix" in prompt              # recurring charge detected
    assert "Croma" in prompt                # outlier detected
    assert "FINDINGS" in prompt
    assert "committed" in prompt            # fixed spend flagged as off-limits


@patch("spending_coach.coach_engine.ask")
def test_committed_spend_is_excluded_from_leakage(mock_ask):
    mock_ask.return_value = json.dumps({"coachMessage": "ok", "tips": ["a"]})
    result = generate_spending_coach(_multi_month_transactions())

    # Rent is ₹20,000/month and must never be counted as recoverable.
    assert 0 < result["monthlyLeakage"] < 20000


# ── ground_tips ──────────────────────────────────────────────────────────────

_PROMPT = """FINDINGS
- Cancellable subscription: Netflix (Entertainment), ₹649 in each of 3 months.
- Swiggy: ₹2,160/month across 4.0 visits, ₹540 average.
- Food & Dining is up 97.2% last month (₹4,260 vs ₹2,160 average before)."""


def test_ground_tips_keeps_tips_citing_figures_from_the_prompt():
    tips = ["Cancel Netflix and keep the ₹649.", "Cap Swiggy at ₹2,160."]
    assert ground_tips(tips, _PROMPT) == tips


def test_ground_tips_drops_invented_figures():
    tips = ["Cancel Netflix and keep the ₹649.", "Cut Swiggy from ₹2,160 to ₹1,400."]
    assert ground_tips(tips, _PROMPT) == ["Cancel Netflix and keep the ₹649."]


def test_ground_tips_keeps_tips_with_no_figures_at_all():
    tips = ["Cancel the subscriptions you no longer watch."]
    assert ground_tips(tips, _PROMPT) == tips


def test_ground_tips_drops_a_restatement_of_an_earlier_tip():
    tips = ["Cancel Netflix to save ₹649.", "Netflix at ₹649 is worth cancelling."]
    assert ground_tips(tips, _PROMPT) == ["Cancel Netflix to save ₹649."]


def test_ground_tips_keeps_a_second_tip_about_a_different_merchant():
    tips = ["Cancel Netflix to save ₹649.", "Cap Swiggy at ₹2,160."]
    assert len(ground_tips(tips, _PROMPT)) == 2


def test_ground_tips_drops_a_real_figure_pinned_to_the_wrong_merchant():
    # The 97.2% is real, but it belongs to Food & Dining, not Netflix.
    tips = ["Netflix is up 97.2% — cancel it."]
    assert ground_tips(tips, _PROMPT) == []


def test_ground_tips_keeps_a_figure_with_its_own_owner():
    tips = ["Food & Dining is up 97.2% — cap it back."]
    assert len(ground_tips(tips, _PROMPT)) == 1


def test_ground_tips_catches_invented_amounts_in_every_rupee_spelling():
    # The prompt writes "₹1,234"; the model does not always. An invented
    # figure is invented in any spelling, and each of these used to slip
    # through the ₹-only pattern.
    for spelling in ("Rs. 3,700", "Rs 3700", "INR 3,700", "3,700 rupees"):
        tips = [f"Cut your Swiggy spend to {spelling} a month."]
        assert ground_tips(tips, _PROMPT) == [], spelling


def test_ground_tips_accepts_real_amounts_in_other_rupee_spellings():
    # A real figure stays real however it is spelt — "Rs. 649" is the ₹649
    # the prompt owns, and must both pass the amount check and keep its owner.
    tips = ["Cancel Netflix and keep the Rs. 649."]
    assert ground_tips(tips, _PROMPT) == tips


def test_ground_tips_wrong_owner_is_caught_across_spellings():
    # Netflix's ₹649 pinned to Swiggy, spelt "Rs 649" — canonicalisation must
    # bring the model's spelling back to the owners map's key.
    tips = ["Swiggy charges Rs 649 every month."]
    assert ground_tips(tips, _PROMPT) == []


# ── _merge_ai_suggestions ────────────────────────────────────────────────────

def _rec(action, rationale=""):
    return {"action": action, "rationale": rationale, "impactPerMonth": 100,
            "effort": "low", "priority": 1, "evidence": "", "source": "analysis"}


def test_merge_ai_suggestions_appends_new_ground():
    merged = _merge_ai_suggestions([_rec("Cancel Netflix")], ["Skip two Swiggy orders."])

    assert [r["source"] for r in merged] == ["analysis", "ai"]
    assert merged[1]["action"] == "Skip two Swiggy orders."
    assert merged[1]["impactPerMonth"] is None


def test_merge_ai_suggestions_skips_what_is_already_covered():
    merged = _merge_ai_suggestions([_rec("Cancel Netflix", "It bills monthly.")],
                                   ["Netflix is worth cancelling."])

    assert len(merged) == 1


def test_merge_ai_suggestions_keeps_computed_recommendations_first():
    merged = _merge_ai_suggestions([_rec("Cancel Netflix")], ["Review Croma purchases."])

    assert merged[0]["impactPerMonth"] == 100
    assert merged[-1]["source"] == "ai"


@patch("spending_coach.coach_engine.ask")
def test_generate_spending_coach_rejects_hallucinated_amounts(mock_ask):
    mock_ask.return_value = json.dumps({
        "coachMessage": "You saved ₹987,654 last month.",
        "tips": ["Move ₹123,456 into a fixed deposit right away."],
    })
    result = generate_spending_coach(_multi_month_transactions())

    assert "987,654" not in result["coachMessage"]
    assert "savings rate" in result["coachMessage"]  # fell back to the real figures
    assert all("123,456" not in tip for tip in result["tips"])


@patch("spending_coach.coach_engine.ask")
def test_tips_survive_for_callers_on_the_original_contract(mock_ask):
    mock_ask.side_effect = RuntimeError("offline")
    result = generate_spending_coach(_multi_month_transactions())

    assert 0 < len(result["tips"]) <= 4
    joined = " ".join(result["tips"])
    assert "Netflix" in joined
    assert "Rent" not in joined  # never advise cutting committed spend


# ── message attribution ──────────────────────────────────────────────────────

@patch("spending_coach.coach_engine.ask")
def test_coach_message_is_attributed_to_the_model_when_it_wrote_it(mock_ask):
    mock_ask.return_value = json.dumps({"coachMessage": "You are doing well.", "tips": []})
    result = generate_spending_coach(_multi_month_transactions())

    assert result["coachMessage"] == "You are doing well."
    assert result["coachMessageSource"] == "ai"


@patch("spending_coach.coach_engine.ask")
def test_coach_message_is_not_credited_to_the_model_when_it_was_rejected(mock_ask):
    """The badge on the page must not claim authorship the model did not have."""
    mock_ask.return_value = json.dumps({
        "coachMessage": "You saved ₹987,654 last month.",  # ungrounded — dropped
        "tips": [],
    })
    result = generate_spending_coach(_multi_month_transactions())

    assert "987,654" not in result["coachMessage"]
    assert result["coachMessageSource"] == "analysis"


@patch("spending_coach.coach_engine.ask")
def test_coach_message_is_not_credited_to_the_model_when_it_is_offline(mock_ask):
    mock_ask.side_effect = RuntimeError("Ollama unavailable")
    assert generate_spending_coach(_multi_month_transactions())["coachMessageSource"] == "analysis"
