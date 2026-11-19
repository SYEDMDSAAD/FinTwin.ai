"""The eval cases stay in step with the code (the evals themselves need a model)."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _evals():
    spec = importlib.util.spec_from_file_location("run_evals", ROOT / "evals" / "run_evals.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_every_eval_case_builds_the_way_main_does():
    evals = _evals()
    cases = json.loads((ROOT / "evals" / "cases.json").read_text())
    assert len(cases) == 20 and len({c["id"] for c in cases}) == 20
    for case in cases:
        text, _ = evals.build(case)
        facts = json.loads(text.split("\n")[1])
        assert facts["mode"] == case["agent"], case["id"]


def test_injected_text_only_ever_sits_inside_the_untrusted_block():
    evals = _evals()
    case = next(c for c in json.loads((ROOT / "evals" / "cases.json").read_text())
                if c["id"] == "injection_in_shop_name")
    text, _ = evals.build(case)
    facts_part, untrusted_part = text.split("UNTRUSTED")
    assert "IGNORE ALL RULES" not in facts_part and "IGNORE ALL RULES" in untrusted_part


def test_the_day_before_the_allowance_is_one_day_out():
    evals = _evals()
    case = next(c for c in json.loads((ROOT / "evals" / "cases.json").read_text())
                if c["id"] == "topup_day_before_allowance")
    facts = json.loads(evals.build(case)[0].split("\n")[1])
    assert facts["week"]["days_to_allowance"] == 1
