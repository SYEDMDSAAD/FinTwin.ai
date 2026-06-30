"""Unit tests for spending_coach.coach_engine.

Pure-logic helpers (_parse_llm_json, _normalize_tips, _compute_leakage) are
tested directly. generate_spending_coach() mocks spending_coach.coach_engine.ask
to avoid hitting Ollama.
"""
import json
from unittest.mock import patch

from spending_coach.coach_engine import (
    _compute_leakage,
    _normalize_tips,
    _parse_llm_json,
    generate_spending_coach,
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


# ── _compute_leakage ──────────────────────────────────────────────────────────

def test_compute_leakage_known_categories():
    totals = {"Food": 3000, "Entertainment": 1000}
    # food: 3000*0.25=750, entertainment: 1000*0.40=400 -> sum=1150 / 3 = 383.33
    leakage = _compute_leakage(totals)
    assert leakage == round((3000 * 0.25 + 1000 * 0.40) / 3, 2)


def test_compute_leakage_unknown_category_uses_default_rate():
    totals = {"Miscellaneous Stuff": 900}
    leakage = _compute_leakage(totals)
    assert leakage == round(900 * 0.10 / 3, 2)


def test_compute_leakage_case_insensitive_match():
    totals = {"FOOD & DINING": 1500}
    leakage = _compute_leakage(totals)
    # "food" matches first in the dict (insertion order), rate 0.25
    assert leakage == round(1500 * 0.25 / 3, 2)


def test_compute_leakage_empty_dict():
    assert _compute_leakage({}) == 0.0


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
    assert result["tips"] == [
        "Cut Swiggy orders", "Cancel unused Netflix", "Use cheaper Uber pool", "Automate savings"
    ]
    assert result["monthlyLeakage"] > 0
    mock_ask.assert_called_once()


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
