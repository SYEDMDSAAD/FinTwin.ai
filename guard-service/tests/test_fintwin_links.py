"""Spend Guard connected to the rest of FinTwin: categories, payments that become
transactions, goal earmarks, records kept in FinTwin, and the Copilot's summary."""
import asyncio
import copy
import json
from datetime import date

import pytest

import data
import main
import rules
import store as store_mod
from agents import schemas
from samples import BETTING, CAFE, GROCER, ZARA
from store import BackendStore

SAMPLE_SHOP = "upi://pay?pa=urbanthreads@sample&pn=Urban%20Threads&mc=5651"


def go():
    return schemas.ScanDecision(decision="go", message="", show_wishlist=False)


def pause(message):
    return schemas.ScanDecision(decision="pause", message=message, show_wishlist=False)


@pytest.fixture
def real(monkeypatch):
    """Real-data mode: FinTwin's answers are faked. real["category"] is what
    FinTwin's categoriser says about the next payee."""
    holder = {"category": None, "asked": []}

    async def load(uid, token):
        f = copy.deepcopy(data.PERSONA)
        f.persona = False
        return f

    async def categorize(uid, name, token):
        holder["asked"].append(name)
        return holder["category"]

    monkeypatch.setattr(data, "persona_mode", lambda: False)
    monkeypatch.setattr(data, "load", load)
    monkeypatch.setattr(data, "categorize", categorize)
    return holder


# ── Categories ───────────────────────────────────────────────────────────────

def test_the_users_own_correction_comes_first_then_the_qr_code_then_fintwin():
    cafe, unknown = rules.parse_upi(CAFE), rules.parse_upi("upi://pay?pa=ravi@ybl&pn=Ravi")
    assert rules.choose_category(cafe, ("Groceries", "LEARNED")) == ("Groceries", "LEARNED")
    assert rules.choose_category(cafe, ("Shopping", "BRAND")) == ("Food", "MERCHANT_CODE")
    assert rules.choose_category(unknown, ("People", "PERSON")) == ("People", "PERSON")
    assert rules.choose_category(unknown, ("Other", "NONE")) == ("Other", "NONE")
    assert rules.choose_category(unknown, None) == ("Other", "NONE")


def test_a_correction_can_skip_the_check_but_betting_always_pauses(api, brain, real):
    real["category"] = ("Groceries", "LEARNED")
    body = api("check", qr=CAFE, amount=450).json()
    assert (body["category"], body["source"], body["reason"]) == ("Groceries", "fast_lane", "essential")
    assert real["asked"] == ["Chai Point"]          # the name went to FinTwin...
    assert brain.asked == []                        # ...and nothing went to the model

    real["category"] = ("Groceries", "LEARNED")     # even if the user filed it as groceries
    brain.answers["scan"] = [pause("This is a betting payment.")]
    assert api("check", qr=BETTING, amount=200).json()["decision"] == "pause"


# ── Payments become transactions ─────────────────────────────────────────────

def test_a_paid_real_payment_is_proposed_to_fintwin(api, brain, real):
    brain.answers["scan"] = [go()]
    body = api("check", qr=ZARA, amount=2400).json()
    out = api("outcome", eventId=body["eventId"], choice="paid").json()
    assert out["record"] == {"eventId": body["eventId"], "merchant": "Zara", "amount": "2400.00",
                             "category": "Shopping", "categorySource": "MERCHANT_CODE"}


def test_sample_shops_skips_and_the_persona_are_never_recorded(api, brain, real, monkeypatch):
    brain.answers["scan"] = [go()]
    body = api("check", qr=SAMPLE_SHOP, amount=2400).json()
    assert "record" not in api("outcome", eventId=body["eventId"], choice="paid").json()

    brain.answers["scan"] = [pause("This takes Shopping over budget.")]
    body = api("check", qr=ZARA, amount=2400).json()
    assert "record" not in api("outcome", eventId=body["eventId"], choice="skipped").json()

    monkeypatch.setattr(data, "persona_mode", lambda: True)
    body = api("check", qr=GROCER, amount=1800).json()
    assert "record" not in api("outcome", eventId=body["eventId"], choice="paid").json()


# ── An approved plan earmarks goal money ─────────────────────────────────────

def plan():
    return schemas.PaydayPlan(goals=[schemas.GoalShare(goal="Goa trip", amount=6000),
                                     schemas.GoalShare(goal="Emergency fund", amount=1000)],
                              buffer=2500, weekly=[5250] * 4,
                              message="Rent and bills take ₹14,500, and ₹7,000 goes to your goals.")


def test_an_approved_plan_proposes_this_months_goal_shares(api, brain, real):
    brain.answers["payday"] = [plan()]
    p = api("payday", salary=45000).json()
    out = api("approve-plan", planId=p["planId"]).json()
    assert out["goalPlan"] == {"month": "2026-11", "goals": [{"goal": "Goa trip", "amount": 6000},
                                                             {"goal": "Emergency fund", "amount": 1000}]}


def test_the_personas_plan_never_reaches_real_goals(api, brain):
    brain.answers["payday"] = [plan()]
    p = api("payday", salary=45000).json()
    assert "goalPlan" not in api("approve-plan", planId=p["planId"]).json()


# ── Records kept in FinTwin ──────────────────────────────────────────────────

@pytest.fixture
def fintwin(monkeypatch):
    """A fake of FinTwin's guard-state endpoints."""
    held = {"state": None, "reads": 0, "writes": [], "down": False}

    def get(uid, path, token, params=None):
        assert path == "/guard-state" and token == "tok"
        if held["down"]:
            raise RuntimeError("Backend data API unavailable")
        held["reads"] += 1
        return {"state": held["state"]}

    def put(uid, path, token, body):
        held["writes"].append(body)
        held["state"] = body["state"]
        return {"saved": True}

    monkeypatch.setattr(store_mod.backend_api, "get", get)
    monkeypatch.setattr(store_mod.backend_api, "put", put)
    return held


def test_records_are_read_once_and_written_back_after_a_change(fintwin, clock, monkeypatch):
    s = BackendStore()
    monkeypatch.setattr(main, "store", s)
    fintwin["state"] = json.dumps({"wallet": {**store_mod.default_wallet(date(2026, 11, 19)), "buffer": 1234},
                                   "events": {}, "wishlist": {}, "plans": {}})

    async def journey():
        await main.wallet(main.Body(userId=42, toolToken="tok"))            # reads, changes nothing
        await main.settings(main.SettingsBody(userId=42, toolToken="tok", minCheck=250))
        await s.drain()

    asyncio.run(journey())
    assert fintwin["reads"] == 1
    assert len(fintwin["writes"]) == 1
    saved = json.loads(fintwin["writes"][0]["state"])
    assert saved["wallet"]["buffer"] == 1234 and saved["wallet"]["settings"]["min_check"] == 250
    assert json.loads(fintwin["writes"][0]["summary"])["month"] == "2026-11"


def test_when_fintwin_cant_be_read_nothing_is_written_over_it(fintwin, clock, monkeypatch):
    s = BackendStore()
    monkeypatch.setattr(main, "store", s)
    fintwin["down"] = True

    async def journey():
        await main.settings(main.SettingsBody(userId=42, toolToken="tok", minCheck=250))
        await s.drain()

    asyncio.run(journey())
    assert fintwin["writes"] == []


def test_only_the_newest_events_are_kept(fintwin):
    s = BackendStore()
    for i in range(200):
        s.add_event(42, {"type": "scan", "at": f"2026-11-19T10:{i // 60:02d}:{i % 60:02d}+05:30"})
    doc = s._document(42)
    assert len(doc["events"]) == BackendStore.KEEP_EVENTS
    assert min(e["at"] for e in doc["events"].values()) == "2026-11-19T10:00:50+05:30"


def test_the_copilots_summary_has_figures_but_no_names(api, brain):
    brain.answers["scan"] = [pause("This takes your Food budget ₹200 over.")]
    body = api("check", qr=CAFE, amount=450).json()
    api("outcome", eventId=body["eventId"], choice="skipped")
    s = main.summary(42)
    assert s["month"] == "2026-11" and s["savedByPausingThisMonth"] == 450
    assert (s["pauses"], s["skippedAfterAPause"], s["pausesByCategory"]) == (1, 1, {"Food": 1})
    text = json.dumps(s)
    assert "Chai" not in text and "@" not in text


def test_the_summary_carries_this_months_approved_plan(api, brain, real):
    brain.answers["payday"] = [plan()]
    p = api("payday", salary=45000).json()
    api("approve-plan", planId=p["planId"])
    s = main.summary(42)
    assert s["salaryPlan"]["salary"] == 45000 and s["weeklyAllowance"] == 5250
    assert [g["goal"] for g in s["salaryPlan"]["goals"]] == ["Goa trip", "Emergency fund"]


# ── A minute-old copy of budgets and goals ───────────────────────────────────

def test_budgets_and_goals_are_read_once_a_minute_and_after_a_change(monkeypatch, clock):
    reads = []

    def get(uid, path, token, params=None):
        reads.append(path)
        if path == "/budgets":
            return {"budgets": [{"category": "Food", "limit": 6000, "spent": 5000}]}
        return {"goals": [{"title": "Travel", "targetAmount": 100000, "savedSoFar": 7400, "monthlyTarget": 8300}]}

    monkeypatch.setattr(data, "persona_mode", lambda: False)
    monkeypatch.setattr(data.backend_api, "get", get)
    first = asyncio.run(data.load(13, "tok"))
    first.goals[0].saved = 0                                  # a caller can't change the kept copy
    again = asyncio.run(data.load(13, "tok"))
    assert sorted(reads) == ["/budgets", "/goals"] and again.goals[0].saved == 7400
    data.forget(13)
    asyncio.run(data.load(13, "tok"))
    assert len(reads) == 4


def test_a_failed_read_is_never_kept(monkeypatch):
    def down(*a, **k):
        raise RuntimeError("Backend data API unavailable")

    monkeypatch.setattr(data, "persona_mode", lambda: False)
    monkeypatch.setattr(data.backend_api, "get", down)
    assert asyncio.run(data.load(13, "tok")).data_ok is False
    assert 13 not in data._cache
