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


def test_unreadable_model_output_suggests_nothing():
    assert s.parse("not json", 2) == [None, None]
    assert s.parse('["Food"]', 1) == [None]


def test_the_prompt_sees_names_only_never_long_numbers():
    with patch.object(s, "ask", return_value='{"1": "Investments"}') as ask:
        out = s.suggest(["ZERODHA BROKING 9876543210123"])
    prompt = ask.call_args.args[0]
    assert "9876543210123" not in prompt and "1. ZERODHA BROKING" in prompt
    assert ask.call_args.kwargs["json_mode"] is True and ask.call_args.kwargs["temperature"] == 0.0
    assert out == {"suggestions": {"ZERODHA BROKING 9876543210123": "Investments"}, "complete": True}


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
        assert s.suggest(["Cafe A"]) == {"suggestions": {}, "complete": False}


def test_route_needs_the_internal_key_and_caps_the_batch():
    assert client.post("/categories/suggest", json={"payees": ["A"]}).status_code == 403
    assert client.post("/categories/suggest", json={"payees": ["x"] * 61}, headers=KEY).status_code == 422
    assert client.post("/categories/suggest", json={"payees": []}, headers=KEY).json() == {"suggestions": {}, "complete": True}


def test_route_returns_the_suggestions():
    with patch("categories.routes.suggest", return_value={"suggestions": {"Dominos": "Food"}, "complete": True}):
        r = client.post("/categories/suggest", json={"payees": ["Dominos"]}, headers=KEY)
    assert r.status_code == 200 and r.json()["suggestions"] == {"Dominos": "Food"}
