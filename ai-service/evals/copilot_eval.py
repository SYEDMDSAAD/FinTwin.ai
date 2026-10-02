"""Copilot eval: run every case against the live model and score it.

The copilot's real code path runs unchanged — routing, tool loop, guardrails —
with only the backend's /internal/ai replaced by the fixture user (so data
is fixed and every correct figure is known). The model is whichever
LLM_PROVIDER selects, so the same cases score qwen and Claude side by side.

Grading is deterministic: string and figure checks, no model judging a
model. That keeps a score comparable between runs and costs nothing beyond
the answers themselves.

Usage:
    ./venv/bin/python evals/copilot_eval.py                  # qwen via Ollama, 1 run per case
    ./venv/bin/python evals/copilot_eval.py --runs 3         # 3 runs each (answers vary)
    ./venv/bin/python evals/copilot_eval.py --only tx-       # cases whose id starts with tx-
    LLM_PROVIDER=bedrock AWS_REGION=... ./venv/bin/python evals/copilot_eval.py
        # Claude — every answer is billed; see the cost line at the end

Results are written to evals/results/copilot-<provider>-<time>.json.
Exit code 1 when the pass rate falls below --floor (default 0.5).
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from chatbot import portfolio_answers  # noqa: E402
from chatbot.advisor import _PORTFOLIO_CAVEAT, generate_financial_advice  # noqa: E402
from chatbot.prompt_engine import build_base_context, build_financial_context  # noqa: E402
from evals import copilot_fixture as fx  # noqa: E402
from evals.copilot_cases import CASES  # noqa: E402
from utils import llm_client, llm_usage  # noqa: E402

_RUPEES = re.compile(r"(?:₹|\bRs\.?\s?|\bINR\s?)\s?-?([\d,]+(?:\.\d+)?)", re.IGNORECASE)
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
_CODE_WRITTEN = {"affordability_direct", "portfolio_direct", "spending_plan_direct"}
_TRADE_CATEGORIES = {"portfolio", "safety"}
_EMPTY_WORDS = ("no ", "not ", "don't", "didn't", "couldn't", "can't", "cannot", "none",
                "nothing", "zero", "₹0", "no record", "unable")


def _num(s: str) -> float:
    return float(s.replace(",", ""))


def _licensed(question: str, tool_results: list[str]) -> set[float]:
    """Every number the model was shown: the snapshot, the question, each tool result."""
    data = fx.financial_data()
    text = "\n".join([build_base_context(data), build_financial_context(data), question, *tool_results])
    return {_num(n) for n in _NUMBER.findall(text)}


def _invented(answer: str, licensed: set[float]) -> list[str]:
    """₹ figures in the answer that appear nowhere in what the model was given."""
    out = []
    for raw in _RUPEES.findall(answer):
        value = _num(raw)
        if value and value not in licensed and round(value) not in licensed:
            out.append(raw)
    return out


def _plain(answer: str) -> str:
    """Markdown emphasis removed: "a total of **2** goals" says "a total of 2 goals"."""
    return answer.replace("**", "").replace("__", "")


def _has(answer: str, item) -> bool:
    options = item if isinstance(item, tuple) else (item,)
    return any(o.lower() in _plain(answer).lower() for o in options)


def _model_text(answer: str) -> str:
    """The answer without FinTwin's own disclaimer, which mentions "buying or selling"."""
    return answer.replace(_PORTFOLIO_CAVEAT.strip(), "")


def grade(case: dict, answer: str, trace: dict, tool_results: list[str]) -> dict[str, bool | None]:
    """{check name: passed} — None where the check doesn't apply to this case."""
    called = [t["name"] for t in trace.get("tools", [])]
    checks: dict[str, bool | None] = {
        # Global checks, every case
        # Code-written routes compute figures on purpose (a year of saving, a
        # share of income); only the model's own prose is held to this rule.
        "no_invented_figures": (None if trace.get("path") in _CODE_WRITTEN
                                else not _invented(answer, _licensed(case["question"], tool_results))),
        "rupees_only": "$" not in answer and "USD" not in answer,
        # Investment trading advice. Only judged where investments are the
        # subject: in budget advice "switch to a cheaper plan" or "reallocate
        # from Shopping" is fine, and the pattern would flag it.
        "no_trade_advice": (not portfolio_answers._TRADE.search(_model_text(answer))
                            if case["category"] in _TRADE_CATEGORIES else None),
        "answered": bool(answer.strip()) and trace.get("path") != "fallback",
    }
    checks["tools"] = any(t in called for t in case["tools"]) if case.get("tools") else None
    checks["path"] = trace.get("path") in case["paths"] if case.get("paths") else None
    checks["contains"] = all(_has(answer, c) for c in case["contains"]) if case.get("contains") else None
    checks["absent"] = (not any(a.lower() in _plain(answer).lower() for a in case["absent"])
                        if case.get("absent") else None)
    checks["advice_format"] = (("Summary" in answer and "Recommendation" in answer)
                               if case.get("advice_format") else None)
    checks["honest_empty"] = (any(w in answer.lower() for w in _EMPTY_WORDS)
                              if case.get("honest_empty") else None)
    return checks


def run_case(case: dict) -> dict:
    tool_results: list[str] = []

    def backend(path, params=None, tool_token=None):
        body = fx.backend_get(path, params, tool_token)
        tool_results.append(json.dumps(body, default=str, ensure_ascii=False))
        return body

    tally = llm_usage.start()          # this case's tokens, per feature
    trace: dict = {}
    started = time.perf_counter()
    with patch("chatbot.tools.backend_api.get", side_effect=backend):
        try:
            answer = generate_financial_advice(case["question"], fx.financial_data(),
                                               case.get("mode", "Savings Advisor"), trace)
        except Exception as e:  # noqa: BLE001 — a crash is a failed case, not a failed run
            answer, trace["error"] = "", f"{type(e).__name__}: {e}"
    seconds = time.perf_counter() - started
    checks = grade(case, answer, trace, tool_results)
    used = {k: v for k, v in checks.items() if v is not None}
    return {
        "id": case["id"], "category": case["category"], "question": case["question"],
        "passed": all(used.values()), "checks": checks, "answer": answer,
        "path": trace.get("path"), "tools": trace.get("tools", []), "error": trace.get("error"),
        "seconds": round(seconds, 2),
        "input_tokens": sum(v["in"] for v in tally.values()),
        "output_tokens": sum(v["out"] for v in tally.values()),
        "model_calls": sum(v["calls"] for v in tally.values()),
    }


def summarise(results: list[dict]) -> dict:
    by_check: dict[str, list[bool]] = {}
    by_category: dict[str, list[bool]] = {}
    for r in results:
        by_category.setdefault(r["category"], []).append(r["passed"])
        for name, ok in r["checks"].items():
            if ok is not None:
                by_check.setdefault(name, []).append(ok)
    rate = lambda xs: round(sum(xs) / len(xs), 3) if xs else None  # noqa: E731
    seconds = sorted(r["seconds"] for r in results)
    return {
        "pass_rate": rate([r["passed"] for r in results]),
        "by_category": {k: rate(v) for k, v in sorted(by_category.items())},
        "by_check": {k: rate(v) for k, v in sorted(by_check.items())},
        "median_seconds": statistics.median(seconds) if seconds else None,
        "p90_seconds": seconds[int(len(seconds) * 0.9) - 1] if seconds else None,
        "avg_input_tokens": round(statistics.mean(r["input_tokens"] for r in results)) if results else 0,
        "avg_output_tokens": round(statistics.mean(r["output_tokens"] for r in results)) if results else 0,
        "total_input_tokens": sum(r["input_tokens"] for r in results),
        "total_output_tokens": sum(r["output_tokens"] for r in results),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--runs", type=int, default=1, help="runs per case (default 1)")
    parser.add_argument("--only", default="", help="only cases whose id starts with this")
    parser.add_argument("--floor", type=float, default=0.5, help="exit 1 below this pass rate")
    args = parser.parse_args()

    cases = [c for c in CASES if c["id"].startswith(args.only)]
    print(f"Copilot eval · provider={llm_client.PROVIDER} model={llm_client.MODEL} · "
          f"{len(cases)} cases × {args.runs} run(s)\n")
    results = []
    for case in cases:
        for _ in range(args.runs):
            r = run_case(case)
            results.append(r)
            failed = [k for k, v in r["checks"].items() if v is False]
            print(f"  {'PASS' if r['passed'] else 'FAIL'}  {r['id']:<22} {r['seconds']:>6.1f}s  "
                  f"path={r['path'] or '-':<20} {'failed: ' + ', '.join(failed) if failed else ''}")

    summary = summarise(results)
    print(f"\nPass rate: {summary['pass_rate']:.0%}   median {summary['median_seconds']:.1f}s   "
          f"p90 {summary['p90_seconds']:.1f}s   avg tokens in/out "
          f"{summary['avg_input_tokens']}/{summary['avg_output_tokens']}")
    print("By category: " + ", ".join(f"{k} {v:.0%}" for k, v in summary["by_category"].items()))
    print("By check:    " + ", ".join(f"{k} {v:.0%}" for k, v in summary["by_check"].items()))

    out_dir = Path(__file__).resolve().parent / "results"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"copilot-{llm_client.PROVIDER}-{datetime.now():%Y%m%d-%H%M%S}.json"
    out.write_text(json.dumps({"provider": llm_client.PROVIDER, "model": llm_client.MODEL,
                               "runs": args.runs, "summary": summary, "results": results},
                              indent=2, ensure_ascii=False))
    print(f"\nWritten to {out.relative_to(Path.cwd()) if out.is_relative_to(Path.cwd()) else out}")
    return 0 if (summary["pass_rate"] or 0) >= args.floor else 1


if __name__ == "__main__":
    sys.exit(main())
