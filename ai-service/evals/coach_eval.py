"""Offline eval: how does the *live* model behave inside the coach's guardrails?

The pytest suite proves the guardrails work by mocking the model. This script
answers the question the suite cannot: against real Ollama output, how often
does the model's prose survive grounding? Run it before and after changing the
model, the prompt (bump PROMPT_VERSION), or decoding options — a drop in the
"used" rate is a regression even if every unit test still passes.

Usage (Ollama must be running):
    ./venv/bin/python evals/coach_eval.py [runs-per-case, default 3]

Exit code is 1 when the message pass-rate falls below PASS_RATE_FLOOR, so it
can gate a model swap in CI later without changes.
"""
import random
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from spending_coach.coach_engine import PROMPT_VERSION, generate_spending_coach  # noqa: E402
from utils.ollama_client import MODEL  # noqa: E402

PASS_RATE_FLOOR = 0.6  # below this, the model/prompt pairing needs attention


def _month_start(offset: int) -> date:
    first = date.today().replace(day=1)
    for _ in range(offset):
        first = (first - timedelta(days=1)).replace(day=1)
    return first


def salaried_three_months() -> list[dict]:
    """Regular salary, rent, a subscription, one spike: the happy path."""
    rng = random.Random(7)
    txns = []
    for m in (3, 2, 1):
        start = _month_start(m)
        txns.append({"amount": 85000, "category": "Income",
                     "merchant": "ACME Corp Salary", "date": str(start.replace(day=28))})
        txns.append({"amount": -30000, "category": "Rent",
                     "merchant": "Landlord", "date": str(start.replace(day=2))})
        txns.append({"amount": -649, "category": "Entertainment",
                     "merchant": "Netflix", "date": str(start.replace(day=5))})
        for d in range(8, 26, 3):
            txns.append({"amount": -rng.randint(200, 900), "category": "Food & Dining",
                         "merchant": "Swiggy", "date": str(start.replace(day=d))})
    txns.append({"amount": -14500, "category": "Shopping",
                 "merchant": "Croma", "date": str(_month_start(1).replace(day=15))})
    return txns


def uncategorised_import() -> list[dict]:
    """A statement dump: everything 'Other', bank narrations for merchants."""
    rng = random.Random(11)
    txns = []
    for m in (3, 2, 1):
        start = _month_start(m)
        txns.append({"amount": 60000, "category": "Other",
                     "merchant": f"NEFT/CR/SAL{m}/EMPLOYER", "date": str(start.replace(day=1))})
        for d in range(2, 28, 2):
            txns.append({"amount": -rng.randint(150, 2500), "category": "Other",
                         "merchant": f"UPI/DE/{rng.randint(10**11, 10**12)}/Some Vendor/XKCD",
                         "date": str(start.replace(day=d))})
    return txns


def unreliable_income() -> list[dict]:
    """Bulk credit on one day — the verdict must be withheld, not narrated."""
    txns = salaried_three_months()
    txns = [t for t in txns if t["amount"] < 0]
    txns.append({"amount": 5_000_000, "category": "Other",
                 "merchant": "Imported balance", "date": str(_month_start(2).replace(day=24))})
    return txns


CASES = {
    "salaried": salaried_three_months,
    "uncategorised": uncategorised_import,
    "unreliable_income": unreliable_income,
}


def main() -> int:
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    print(f"model={MODEL}  prompt={PROMPT_VERSION}  runs/case={runs}\n")

    used = total = 0
    for name, build in CASES.items():
        txns = build()
        for i in range(runs):
            start = time.monotonic()
            result = generate_spending_coach(txns)
            elapsed = time.monotonic() - start
            ai = result["coachMessageSource"] == "ai"
            ai_recs = sum(1 for r in result["recommendations"] if r.get("source") == "ai")
            used += ai
            total += 1
            print(f"  {name:>18} #{i + 1}: message={'ai' if ai else 'FALLBACK':8} "
                  f"ai-recs-kept={ai_recs}  {elapsed:5.1f}s  health={result['spendingHealth']}")

    rate = used / total if total else 0.0
    print(f"\nmessage pass-rate: {used}/{total} = {rate:.0%} (floor {PASS_RATE_FLOOR:.0%})")
    if rate < PASS_RATE_FLOOR:
        print("REGRESSION: the model's prose is being rejected more often than the floor allows.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
