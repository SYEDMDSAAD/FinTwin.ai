"""Runs the scan and top-up agents on made-up cases against the real model.

    cd guard-service
    GOOGLE_API_KEY=... ./venv/bin/python evals/run_evals.py              # all 20 cases
    ./venv/bin/python evals/run_evals.py --only betting_late,topup_medicine
    ./venv/bin/python evals/run_evals.py --out ~/Documents/FinTwin-Buildathon/evals.json

All data is the made-up persona, so the AI Studio free tier is fine. Its daily
request cap is low, so --only and --pause help. For each case it reports
whether the decision was one of the expected ones, whether the answer passed
the code checks (figures, wording, no links), and how long it took.
"""
import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ["GUARD_PERSONA"] = "1"

import rules                               # noqa: E402
import usage                               # noqa: E402
from agents import brain as agents         # noqa: E402
from data import PERSONA                   # noqa: E402
from flows import consult                  # noqa: E402
from store import default_wallet           # noqa: E402

SCRIPTS = {"devanagari": ("ऀ", "ॿ"), "telugu": ("ఀ", "౿")}
DEFAULT_AT = "2026-11-19T14:00:00+05:30"


def history(case: dict, now: datetime) -> list[dict]:
    out = []
    for h in case.get("history", []):
        at = (now - timedelta(days=h.get("days_ago", 0))).replace(hour=h.get("hour", 12), minute=0)
        out.append({"type": h["type"], "at": at.isoformat(), "category": h.get("category"),
                    "payee": h.get("payee"), "decision": h.get("decision", "go"),
                    "choice": h.get("choice"), "worth_it": h.get("worth_it")})
    return sorted(out, key=lambda e: e["at"], reverse=True)


def build(case: dict):
    """The agent's first message and the code check, exactly as main.py builds them."""
    now = datetime.fromisoformat(case.get("at", DEFAULT_AT))
    w = default_wallet(now.date())
    w["settings"]["language"] = case.get("language", "English")
    events = history(case, now)
    if case["agent"] == "scan":
        qr = rules.parse_upi(case["qr"])
        facts, untrusted, allowed = rules.scan_facts(qr=qr, amount=rules.clean_amount(case["amount"]), wallet=w,
                                                     finances=PERSONA, events=events, now_dt=now)
        return agents.prompt(facts, untrusted), lambda a: rules.check_scan(a, facts, allowed)
    facts, allowed = rules.topup_facts(amount=case["amount"], wallet=w, finances=PERSONA, events=events, now_dt=now)
    return (agents.prompt(facts, {"reason": case.get("reason", "")}),
            lambda a: rules.check_topup(a, facts, allowed))


def judge(case: dict, result: dict | None, why: str | None) -> list[str]:
    """What went wrong, if anything."""
    if result is None:
        return [f"no usable answer ({why})"]
    problems = []
    if result["decision"] not in case["expect"]:
        problems.append(f"decided {result['decision']}, expected {'/'.join(case['expect'])}")
    message = result.get("message", "")
    for word in case.get("forbid", []):
        if word.lower() in message.lower():
            problems.append(f"message contains {word!r}")
    if case.get("expect_wishlist") and result["decision"] == "pause" and not result.get("show_wishlist"):
        problems.append("didn't offer the wishlist")
    script = case.get("expect_script")
    if script and message:
        lo, hi = SCRIPTS[script]
        if not any(lo <= ch <= hi for ch in message):
            problems.append(f"message isn't in {script} script")
    return problems


async def main(args) -> int:
    if agents.availability(persona=True):
        print(f"The model isn't set up ({agents.availability(persona=True)}). "
              f"Set GOOGLE_API_KEY, or the Vertex AI variables.")
        return 2
    cases = json.loads((ROOT / "evals" / "cases.json").read_text())
    if args.only:
        wanted = set(args.only.split(","))
        cases = [c for c in cases if c["id"] in wanted]
    brain = agents.Brain()
    rows = []
    for i, case in enumerate(cases):
        if i and args.pause:
            await asyncio.sleep(args.pause)
        text, check = build(case)
        tally = usage.start()
        started = time.monotonic()
        result, why = await consult(brain, case["agent"], text, check, attempts=1, budget_s=args.timeout)
        ms = round((time.monotonic() - started) * 1000)
        problems = judge(case, result, why)
        tokens = sum(r["in"] + r["out"] for r in tally.values())
        rows.append({"id": case["id"], "ok": not problems, "problems": problems, "ms": ms, "tokens": tokens,
                     "decision": result and result["decision"], "message": result and result.get("message"),
                     "why": why})
        mark = "PASS" if not problems else "FAIL"
        print(f"{mark}  {case['id']:38s} {str(result and result['decision']):13s} {ms:6d} ms  {tokens:5d} tok"
              + (f"  - {'; '.join(problems)}" if problems else ""))
        if result and result.get("message") and args.verbose:
            print(f"      “{result['message']}”")
    passed = sum(r["ok"] for r in rows)
    answered = [r["ms"] for r in rows if r["decision"]]
    print(f"\n{passed}/{len(rows)} passed, model {agents.MODEL} via {agents.where()}")
    if answered:
        p95 = sorted(answered)[max(0, round(0.95 * len(answered)) - 1)]
        print(f"latency: median {statistics.median(answered):.0f} ms, p95 {p95} ms")
    if args.out:
        out = Path(args.out).expanduser()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"model": agents.MODEL, "where": agents.where(), "rows": rows},
                                  ensure_ascii=False, indent=2))
        print(f"saved {out}")
    return 0 if passed == len(rows) else 1


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--only", help="comma-separated case ids")
    p.add_argument("--pause", type=float, default=4.0, help="seconds between calls (free-tier rate limits)")
    p.add_argument("--timeout", type=float, default=20.0, help="seconds per case")
    p.add_argument("--out", help="write the results as JSON here (keep it outside the repo)")
    p.add_argument("-v", "--verbose", action="store_true", help="print each message")
    sys.exit(asyncio.run(main(p.parse_args())))
