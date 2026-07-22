"""Unit tests for chatbot.goal_planner.

Every test that reaches generate_goal_plan() patches chatbot.goal_planner.ask,
so nothing here needs a running Ollama. The point of most of them is the
opposite of "did the model answer": it is that the plan stays correct and
useful when the model answers badly, or not at all.
"""
import json
from unittest.mock import patch

from chatbot.goal_planner import (
    _analyse,
    _build_prompt,
    _fallback_narrative,
    _goal_type,
    _levers,
    _milestones,
    _parse_llm_json,
    _verdict,
    generate_goal_plan,
)


def _goal(**overrides):
    base = {
        "title": "Emergency Fund",
        "targetAmount": 300000.0,
        "durationMonths": 12,
        "income": 80000.0,
        "expenses": 62000.0,
        "savings": 18000.0,
        "monthlyTarget": 25000.0,
        "successProbability": 72.0,
        "categorySpending": {"Food & Dining": 16000.0, "Rent": 25000.0,
                             "Shopping": 9000.0},
        "otherGoals": [],
    }
    base.update(overrides)
    return base


# ── _parse_llm_json ───────────────────────────────────────────────────────────

def test_parse_llm_json_strips_code_fences():
    text = '```json\n{"headline": "hi", "steps": ["a"], "risk": "r"}\n```'
    assert _parse_llm_json(text) == {"headline": "hi", "steps": ["a"], "risk": "r"}


def test_parse_llm_json_tolerates_trailing_comma():
    assert _parse_llm_json('{"headline": "hi", "steps": ["a"],}')["headline"] == "hi"


def test_parse_llm_json_returns_none_on_garbage():
    assert _parse_llm_json("I cannot help with that.") is None


# ── _verdict — must not disagree with the card's health chip ──────────────────

def test_verdict_matches_backend_goalmath_thresholds():
    assert _verdict(150) == "Excellent"
    assert _verdict(149) == "On Track"
    assert _verdict(100) == "On Track"
    assert _verdict(99) == "At Risk"
    assert _verdict(70) == "At Risk"
    assert _verdict(69) == "Critical"


# ── _milestones ───────────────────────────────────────────────────────────────

def test_milestones_end_exactly_on_target():
    marks = _milestones(300000, 12, 25000)
    assert marks[-1]["month"] == 12
    assert marks[-1]["cumulative"] == 300000
    assert marks[-1]["share"] == 100


def test_milestones_never_overshoot_the_target():
    # Rounding the monthly target up (the backend uses Math.ceil) must not
    # produce a milestone claiming they save more than the goal is worth.
    marks = _milestones(100000, 3, 33334)
    assert all(m["cumulative"] <= 100000 for m in marks)


def test_milestones_deduplicate_on_short_goals():
    months = [m["month"] for m in _milestones(50000, 1, 50000)]
    assert months == [1]


# ── _levers ───────────────────────────────────────────────────────────────────

def test_levers_exclude_committed_categories():
    levers = _levers({"Rent": 25000.0, "Food & Dining": 16000.0}, gap=7000)
    assert [lever["category"] for lever in levers] == ["Food & Dining"]


def test_levers_drop_amounts_too_small_to_matter():
    assert _levers({"Entertainment": 900.0}, gap=7000) == []


def test_levers_empty_when_there_is_no_gap():
    assert _levers({"Food & Dining": 16000.0}, gap=0) == []


def test_lever_gap_share_is_capped_at_100():
    lever = _levers({"Food & Dining": 100000.0}, gap=1000)[0]
    assert lever["gapShare"] == 100


# ── _analyse ──────────────────────────────────────────────────────────────────

def test_analyse_reports_the_monthly_shortfall():
    a = _analyse(_goal())
    assert a["gap"] == 7000
    assert a["verdict"] == "At Risk"


def test_analyse_offers_a_realistic_timeline_when_short():
    a = _analyse(_goal())
    # 300000 / 18000 = 16.7 → 17 months, not the requested 12.
    assert a["realisticMonths"] == 17


def test_analyse_offers_no_timeline_when_already_funded():
    a = _analyse(_goal(savings=40000.0))
    assert a["gap"] == 0
    assert a["realisticMonths"] is None
    assert a["verdict"] == "Excellent"


def test_analyse_survives_zero_savings_without_dividing_by_it():
    a = _analyse(_goal(income=0.0, expenses=0.0, savings=0.0))
    assert a["realisticMonths"] is None
    assert a["incomeKnown"] is False
    assert a["verdict"] == "Critical"


def test_analyse_flags_goals_that_collectively_exceed_savings():
    a = _analyse(_goal(otherGoals=[{"title": "Car", "monthlyTarget": 12000.0}]))
    assert a["committedElsewhere"] == 12000
    assert a["totalCommitment"] == 37000
    assert a["overcommitted"] is True


def test_analyse_derives_monthly_target_when_backend_omits_it():
    a = _analyse(_goal(monthlyTarget=0))
    assert a["monthlyTarget"] == 25000


def test_analyse_marks_gap_unclosable_when_levers_fall_short():
    a = _analyse(_goal())
    assert a["gapClosable"] is False  # 2400 + 1350 < 7000


# ── _goal_type ────────────────────────────────────────────────────────────────

def test_goal_type_matches_common_titles():
    assert _goal_type("Emergency Fund") == "emergency"
    assert _goal_type("Trip to Goa") == "travel"
    assert _goal_type("New car") == "vehicle"
    assert _goal_type("House Down Payment") == "home"
    assert _goal_type("Daughter's MBA") == "education"


def test_goal_type_requires_whole_words():
    # "car" inside "healthcare" must not classify this as a vehicle.
    assert _goal_type("Healthcare fund") is None
    assert _goal_type("Scarf collection") is None


def test_goal_type_unmatched_titles_get_no_type():
    assert _goal_type("My big dream") is None
    assert _goal_type("") is None


def test_type_guidance_reaches_the_prompt():
    prompt = _build_prompt(_analyse(_goal(title="Emergency Fund")))
    assert "instantly withdrawable" in prompt
    generic = _build_prompt(_analyse(_goal(title="My big dream")))
    assert "instantly withdrawable" not in generic


def test_type_guidance_never_introduces_figures():
    # Guidance is spliced into a prompt whose figures license the model's
    # output; a number inside guidance would silently expand that license.
    from chatbot.goal_planner import _TYPE_GUIDANCE
    from utils.grounding import amounts
    for guidance in _TYPE_GUIDANCE.values():
        assert amounts(guidance) == set()
        assert "%" not in guidance


# ── Grounding precision ───────────────────────────────────────────────────────
# Failure shapes taken from live qwen2.5:3b output during the offline eval.

@patch("chatbot.goal_planner.ask")
def test_imperative_opener_does_not_veto_a_correct_figure(mock_ask):
    # "Adjust" is capitalised only because it opens the sentence; the ₹2,400
    # genuinely belongs to the (lowercased) food and dining mentioned after it.
    mock_ask.return_value = json.dumps({
        "headline": "You are short ₹7,000 every month at the current saving rate.",
        "steps": ["Adjust food and dining by cutting ₹2,400 a month.",
                  "Automate ₹18,000 on salary day."],
        "risk": "The gap stays.",
    }, ensure_ascii=False)
    plan = generate_goal_plan(_goal())
    assert mock_ask.call_count == 1
    assert "Adjust food and dining by cutting ₹2,400 a month." in plan


@patch("chatbot.goal_planner.ask")
def test_known_wrong_subject_is_still_rejected(mock_ask):
    # Precision is relaxed only for unknown capitalised words — a figure
    # pinned to a different *known* category must still be caught.
    mock_ask.return_value = json.dumps({
        "headline": "This goal needs attention.",
        "steps": ["Shopping costs you ₹2,400 a month, so cut it."],
        "risk": "Nothing changes.",
    }, ensure_ascii=False)
    plan = generate_goal_plan(_goal())
    assert "Shopping costs you ₹2,400" not in plan


@patch("chatbot.goal_planner.ask")
def test_post_trim_remainder_is_a_licensed_figure(mock_ask):
    # The model's favourite phrasing for a cut is "from ₹16,000 to ₹13,600";
    # the remainder is now stated in FACTS so correct arithmetic survives.
    mock_ask.return_value = json.dumps({
        "headline": "You are short ₹7,000 every month at the current saving rate.",
        "steps": ["Cut Food & Dining from ₹16,000 to ₹13,600 a month.",
                  "Automate ₹18,000 on salary day."],
        "risk": "The gap stays.",
    }, ensure_ascii=False)
    plan = generate_goal_plan(_goal())
    assert "Cut Food & Dining from ₹16,000 to ₹13,600 a month." in plan


# ── Corrective retry ──────────────────────────────────────────────────────────

@patch("chatbot.goal_planner.ask")
def test_rejected_first_answer_earns_one_corrective_retry(mock_ask):
    # ensure_ascii=False: real model output writes ₹ itself, not \u20b9.
    bad = json.dumps({"headline": "Save ₹99,999 every month.",
                      "steps": ["Move ₹88,888 now."], "risk": "None."},
                     ensure_ascii=False)
    good = json.dumps({
        "headline": "You are ₹7,000 a month short of what this goal needs.",
        "steps": ["Cut 15% from Food & Dining to free ₹2,400 a month.",
                  "Automate ₹18,000 on salary day."],
        "risk": "The gap quietly becomes permanent.",
    }, ensure_ascii=False)
    mock_ask.side_effect = [bad, good]
    plan = generate_goal_plan(_goal())
    assert mock_ask.call_count == 2
    assert "₹99,999" not in plan
    assert "Cut 15% from Food & Dining to free ₹2,400 a month." in plan
    # The second call must carry the correction, not just re-roll the dice.
    retry_prompt = mock_ask.call_args_list[1].args[0]
    assert "rejected" in retry_prompt
    assert "₹99,999" in retry_prompt  # the model is shown its own mistake


@patch("chatbot.goal_planner.ask")
def test_retry_happens_at_most_once(mock_ask):
    bad = json.dumps({"headline": "Save ₹99,999 every month.",
                      "steps": ["Move ₹88,888 now."], "risk": "None."})
    mock_ask.side_effect = [bad, bad, bad]
    plan = generate_goal_plan(_goal())
    assert mock_ask.call_count == 2
    assert "₹99,999" not in plan
    assert "### Milestones" in plan  # fallback still ships a full plan


@patch("chatbot.goal_planner.ask")
def test_partial_survival_is_kept_without_retry(mock_ask):
    # A grounded headline with ungrounded steps is usable as-is; retrying
    # would spend the remaining budget to replace something already shown.
    mock_ask.return_value = json.dumps({
        "headline": "You are ₹7,000 a month short of what this goal needs.",
        "steps": ["Move ₹88,888 somewhere."], "risk": "None of this is real: ₹1."})
    plan = generate_goal_plan(_goal())
    assert mock_ask.call_count == 1
    assert "You are ₹7,000 a month short of what this goal needs." in plan
    assert "₹88,888" not in plan


@patch("chatbot.goal_planner.ask")
def test_unparseable_output_is_retried_with_the_parse_problem_named(mock_ask):
    mock_ask.side_effect = ["I think you should save more money!",
                            json.dumps({
                                "headline": "You are ₹7,000 a month short of what this goal needs.",
                                "steps": ["Cut 15% from Food & Dining to free ₹2,400 a month.",
                                          "Automate ₹18,000 on salary day."],
                                "risk": "The gap stays."})]
    plan = generate_goal_plan(_goal())
    assert mock_ask.call_count == 2
    assert "JSON" in mock_ask.call_args_list[1].args[0]
    assert "Cut 15% from Food & Dining" in plan


@patch("chatbot.goal_planner.ask")
def test_leaked_json_placeholder_is_stripped_from_prose(mock_ask):
    mock_ask.return_value = json.dumps({
        "headline": "... You are short ₹7,000 every month at the current saving rate.",
        "steps": ["... Cut 15% from Food & Dining to free ₹2,400 a month.",
                  "…Automate ₹18,000 on salary day."],
        "risk": "...",  # placeholder copied verbatim → empty after stripping
    }, ensure_ascii=False)
    plan = generate_goal_plan(_goal())
    assert "You are short ₹7,000 every month at the current saving rate." in plan
    assert "..." not in plan.split("###")[0]  # headline carries no ellipsis
    assert "Cut 15% from Food & Dining to free ₹2,400 a month." in plan
    # An all-placeholder risk falls back to the computed one.
    assert "### Biggest risk\n- The most likely failure" in plan


# ── Fallback ──────────────────────────────────────────────────────────────────

def test_fallback_plan_is_specific_not_generic():
    narrative = _fallback_narrative(_analyse(_goal()))
    assert "₹7,000" in narrative["headline"]
    assert any("Food & Dining" in step for step in narrative["steps"])
    assert narrative["steps"]


def test_fallback_plan_for_a_funded_goal_does_not_invent_a_shortfall():
    narrative = _fallback_narrative(_analyse(_goal(savings=40000.0)))
    assert "short" not in narrative["headline"].lower()


def test_fallback_risk_is_type_aware_for_funded_goals():
    funded_emergency = _analyse(_goal(title="Emergency Fund", savings=40000.0))
    assert "not emergencies" in _fallback_narrative(funded_emergency)["risk"]
    # A goal with a shortfall keeps the numeric risk — a figure beats a theme.
    short_emergency = _analyse(_goal(title="Emergency Fund"))
    assert "₹7,000" in _fallback_narrative(short_emergency)["risk"]


# ── Grounding ─────────────────────────────────────────────────────────────────

@patch("chatbot.goal_planner.ask")
def test_invented_amounts_never_reach_the_plan(mock_ask):
    mock_ask.return_value = json.dumps({
        "headline": "You need to find ₹99,999 more every month.",
        "steps": ["Cancel your ₹4,321 subscriptions today.",
                  "Move ₹8,765 into a recurring deposit."],
        "risk": "You might overspend by ₹55,555.",
    })
    plan = generate_goal_plan(_goal())
    for invented in ("99,999", "4,321", "8,765", "55,555"):
        assert invented not in plan


@patch("chatbot.goal_planner.ask")
def test_grounded_output_is_used_verbatim(mock_ask):
    mock_ask.return_value = json.dumps({
        "headline": "You are ₹7,000 a month short of what this goal needs.",
        "steps": ["Cut 15% from Food & Dining to free ₹2,400 a month.",
                  "Set the transfer to ₹18,000 on salary day."],
        "risk": "The gap quietly becomes permanent if nothing changes.",
    })
    plan = generate_goal_plan(_goal())
    assert "You are ₹7,000 a month short of what this goal needs." in plan
    assert "Cut 15% from Food & Dining to free ₹2,400 a month." in plan


@patch("chatbot.goal_planner.ask")
def test_figure_pinned_to_the_wrong_category_is_dropped(mock_ask):
    # ₹2,400 is Food & Dining's saving, not Shopping's.
    mock_ask.return_value = json.dumps({
        "headline": "This goal needs work.",
        "steps": ["Cut Shopping to free ₹2,400 a month."],
        "risk": "Nothing changes.",
    })
    plan = generate_goal_plan(_goal())
    assert "Cut Shopping to free ₹2,400" not in plan


# ── End to end ────────────────────────────────────────────────────────────────

@patch("chatbot.goal_planner.ask")
def test_plan_falls_back_to_a_full_document_when_ollama_is_down(mock_ask):
    mock_ask.side_effect = RuntimeError("Ollama unreachable")
    plan = generate_goal_plan(_goal())
    assert "### Milestones" in plan
    assert "### Do this now" in plan
    assert "### Biggest risk" in plan
    assert "₹7,000" in plan


@patch("chatbot.goal_planner.ask")
def test_plan_states_the_shortfall_levers_cannot_close(mock_ask):
    mock_ask.side_effect = RuntimeError("down")
    plan = generate_goal_plan(_goal())
    assert "of the ₹7,000 monthly gap" in plan


@patch("chatbot.goal_planner.ask")
def test_funded_goal_omits_the_funding_and_timeline_sections(mock_ask):
    mock_ask.side_effect = RuntimeError("down")
    plan = generate_goal_plan(_goal(savings=40000.0))
    assert "### Where the money comes from" not in plan
    assert "### The honest timeline" not in plan
    assert "### Milestones" in plan


@patch("chatbot.goal_planner.ask")
def test_plan_never_recommends_cutting_rent(mock_ask):
    mock_ask.side_effect = RuntimeError("down")
    plan = generate_goal_plan(_goal())
    assert "Rent" not in plan


@patch("chatbot.goal_planner.ask")
def test_prompt_refuses_to_invent_a_savings_rate_without_income(mock_ask):
    mock_ask.side_effect = RuntimeError("down")
    prompt = _build_prompt(_analyse(_goal(income=0.0, expenses=0.0, savings=0.0)))
    assert "cannot be verified" in prompt
    assert "₹0" not in prompt
