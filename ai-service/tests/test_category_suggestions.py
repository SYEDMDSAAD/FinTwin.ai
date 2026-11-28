"""Category suggestions for payees the rules couldn't place."""

import json
from unittest.mock import patch

import requests
from fastapi.testclient import TestClient

import app as app_module
from categories import suggest as s

client = TestClient(app_module.app)
KEY = {"x-internal-key": "test-internal-key"}


def test_only_allowed_categories_survive_in_payee_order():
    raw = json.dumps({"1": "food", "2": "Unknown", "3": "Fitness & Wellness", "4": 7})
    assert s.parse(raw, 5) == ["Food", None, None, None, None]


def test_sure_is_read_per_payee_and_never_for_unknown_or_invented_categories():
    raw = json.dumps({"1": {"category": "Food", "sure": True}, "2": {"category": "Shopping", "sure": False},
                      "3": {"category": "Unknown", "sure": True}, "4": {"category": "Pets", "sure": True},
                      "5": {"category": "Health", "sure": "yes"}})
    assert s.parse_with_sure(raw, 6) == [("Food", True), ("Shopping", False), (None, False),
                                         (None, False), ("Health", False), (None, False)]


def test_the_sure_flag_comes_back_with_the_suggestions():
    raw = json.dumps({"1": {"category": "Food", "sure": True}, "2": {"category": "Shopping", "sure": False}})
    with patch.object(s, "ask", return_value=raw):
        out = s.suggest(["Swiggy", "Krishna Enterprises"])
    assert out["suggestions"] == {"Swiggy": "Food", "Krishna Enterprises": "Shopping"}
    assert out["sure"] == {"Swiggy": True, "Krishna Enterprises": False}


def test_unreadable_model_output_suggests_nothing():
    assert s.parse("not json", 2) == [None, None]
    assert s.parse('["Food"]', 1) == [None]


def test_the_prompt_sees_names_only_never_long_numbers():
    with patch.object(s, "ask", return_value='{"1": "Investments"}') as ask:
        out = s.suggest(["ZERODHA BROKING 9876543210123"])
    prompt = ask.call_args.args[0]
    assert "9876543210123" not in prompt and "1. ZERODHA BROKING" in prompt
    assert ask.call_args.kwargs["json_mode"] is True and ask.call_args.kwargs["temperature"] == 0.0
    # A bare string answer (older format) is never "sure"
    assert out == {"suggestions": {"ZERODHA BROKING 9876543210123": "Investments"},
                   "sure": {"ZERODHA BROKING 9876543210123": False}, "complete": True}


def test_payees_are_asked_in_batches_and_deduplicated():
    payees = [f"Shop {i}" for i in range(20)] + ["Shop 0"]
    with patch.object(s, "ask", side_effect=lambda p, **k: json.dumps({str(i + 1): "Shopping" for i in range(15)})) as ask:
        out = s.suggest(payees)
    assert ask.call_count == 2
    assert len(out["suggestions"]) == 20 and out["complete"]


def test_a_model_failure_returns_what_was_done_and_says_so():
    calls = iter(['{"1": "Food"}', RuntimeError("Ollama down")])

    def fake(prompt, **kw):
        r = next(calls)
        if isinstance(r, Exception):
            raise r
        return r

    payees = ["Cafe A"] + [f"Shop {i}" for i in range(15)]
    with patch.object(s, "BATCH", 1), patch.object(s, "ask", side_effect=fake):
        out = s.suggest(payees)
    assert out["suggestions"] == {"Cafe A": "Food"}
    assert out["complete"] is False


def test_a_timeout_is_handled_like_any_failure():
    with patch.object(s, "ask", side_effect=requests.exceptions.ReadTimeout()):
        assert s.suggest(["Cafe A"]) == {"suggestions": {}, "sure": {}, "complete": False}


def test_route_needs_the_internal_key_and_caps_the_batch():
    assert client.post("/categories/suggest", json={"payees": ["A"]}).status_code == 403
    assert client.post("/categories/suggest", json={"payees": ["x"] * 61}, headers=KEY).status_code == 422
    assert client.post("/categories/suggest", json={"payees": []}, headers=KEY).json() == {"suggestions": {}, "sure": {}, "complete": True}


def test_route_returns_the_suggestions():
    with patch("categories.routes.suggest", return_value={"suggestions": {"Dominos": "Food"}, "complete": True}):
        r = client.post("/categories/suggest", json={"payees": ["Dominos"]}, headers=KEY)
    assert r.status_code == 200 and r.json()["suggestions"] == {"Dominos": "Food"}
