"""Offline eval: how does the *live* model behave inside the goal planner's guardrails?

The pytest suite proves the guardrails work by mocking the model. This script
answers the question the suite cannot: against real Ollama output, how often
does the model's narrative survive grounding — and how often does the
corrective retry rescue a first answer that didn't? Run it before and after
changing the model, the prompt (bump PROMPT_VERSION), or decoding options.

Usage (Ollama must be running):
    ./venv/bin/python evals/goal_plan_eval.py [runs-per-case, default 3]

Exit code is 1 when the full-narrative ("ai") rate falls below PASS_RATE_FLOOR,
so it can gate a model swap in CI later without changes.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from chatbot.goal_planner import PROMPT_VERSION, _analyse, _narrative  # noqa: E402
from utils.ollama_client import MODEL  # noqa: E402

PASS_RATE_FLOOR = 0.6  # below this, the model/prompt pairing needs attention


def short_with_levers() -> dict:
    """The common case: a real gap, and discretionary spend to close it from."""
    return {
        "title": "Emergency Fund", "targetAmount": 300000.0, "durationMonths": 12,
        "income": 80000.0, "expenses": 62000.0, "savings": 18000.0,
        "monthlyTarget": 25000.0,
        "categorySpending": {"Food & Dining": 16000.0, "Rent": 25000.0,
                             "Shopping": 9000.0, "Entertainment": 3000.0},
        "otherGoals": [],
    }


def comfortably_funded() -> dict:
    """No gap — the model must not invent a problem to sound useful."""
    case = short_with_levers()
    case.update({"title": "Goa Trip", "targetAmount": 90000.0,
                 "durationMonths": 6, "monthlyTarget": 15000.0})
    return case


def impossible_goal() -> dict:
    """Target far beyond savings and levers — honesty is the whole test."""
    case = short_with_levers()
    case.update({"title": "House Down Payment", "targetAmount": 2000000.0,
                 "durationMonths": 12, "monthlyTarget": 166667.0})
    return case


def no_verifiable_income() -> dict:
    """Zero income figures — the model must not conjure a savings rate."""
    case = short_with_levers()
    case.update({"income": 0.0, "expenses": 0.0, "savings": 0.0})
    return case


def competing_goals() -> dict:
    """Three goals that together exceed savings — the overcommitment case."""
    case = short_with_levers()
    case["otherGoals"] = [
        {"title": "Car", "targetAmount": 600000.0, "durationMonths": 36,
         "monthlyTarget": 16700.0},
        {"title": "Europe Trip", "targetAmount": 250000.0, "durationMonths": 10,
         "monthlyTarget": 25000.0},
    ]
    return case


CASES = {
    "short_with_levers": short_with_levers,
    "comfortably_funded": comfortably_funded,
    "impossible_goal": impossible_goal,
    "no_income": no_verifiable_income,
    "competing_goals": competing_goals,
}


def main() -> int:
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    print(f"model={MODEL}  prompt={PROMPT_VERSION}  runs/case={runs}\n")

    full = partial = total = 0
    for name, build in CASES.items():
        analysis = _analyse(build())
        for i in range(runs):
            start = time.monotonic()
            _, outcome = _narrative(analysis)
            elapsed = time.monotonic() - start
            full += outcome == "ai"
            partial += outcome == "partial"
            total += 1
            print(f"  {name:>20} #{i + 1}: outcome={outcome:12} {elapsed:5.1f}s")

    rate = full / total if total else 0.0
    print(f"\nfull-narrative rate: {full}/{total} = {rate:.0%} "
          f"(partial {partial}/{total}, floor {PASS_RATE_FLOOR:.0%})")
    if rate < PASS_RATE_FLOOR:
        print("REGRESSION: the model's narrative is being rejected more often "
              "than the floor allows.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
