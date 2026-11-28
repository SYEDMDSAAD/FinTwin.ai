"""Spend Guard connected to the rest of FinTwin: categories, payments that become
transactions, goal earmarks, records kept in FinTwin, and the Copilot's summary."""
import asyncio
import copy
import json
from datetime import date, timedelta

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


def test_the_summary_carries_approved_budget_moves_but_not_goal_ones(api, brain):
    w = main.store.wallet(42, rules.now().date())
    w["adjustments"] = {"2026-11": {"Food": 2000, "Shopping": -1200, "goal:Goa trip": -800},
                        "2026-12": {"Food": -300}}
    main.store.save_wallet(42, w)
    s = main.summary(42)
    assert s["budgetAdjustments"] == {"2026-11": {"Food": 2000, "Shopping": -1200}, "2026-12": {"Food": -300}}


def test_fintwins_limit_is_read_without_spend_guards_own_moves(monkeypatch):
    def get(uid, path, token, params=None):
        if path == "/budgets":
            return {"budgets": [{"category": "Food", "limit": 5000, "spent": 4800, "adjustment": 2000}]}
        return {"goals": []}
    monkeypatch.setattr(data.backend_api, "get", get)
    monkeypatch.setattr(data, "persona_mode", lambda: False)
    data._cache.clear()
    f = asyncio.run(data.load(7, "token"))
    assert f.budgets[0].limit == 3000      # the wallet adds its own 2000 back


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


# ── Tapping Pay only opens the UPI app; the money moves once it's confirmed ──

def _opened(api, brain, amount=2400):
    brain.answers["scan"] = [go()]
    body = api("check", qr=ZARA, amount=amount).json()
    out = api("outcome", eventId=body["eventId"], choice="opened").json()
    return body["eventId"], out


def test_pay_opens_the_app_but_moves_nothing_until_the_user_says_they_paid(api, brain, real):
    eid, out = _opened(api, brain)
    assert out["choice"] == "pending" and out["link"].startswith("upi://pay?pa=zara.store@hdfcbank")
    assert "record" not in out and out["wallet"]["balances"]["spending"] == 5000      # nothing taken yet

    paid = api("confirm", eventId=eid, paid=True).json()
    assert paid["choice"] == "paid" and paid["record"]["amount"] == "2400.00"         # now FinTwin records it
    assert paid["wallet"]["balances"]["spending"] == 2600
    assert api("confirm", eventId=eid, paid=False).status_code == 400                  # decided once


def test_i_didnt_pay_keeps_the_money_and_says_so_in_the_history(api, brain, real):
    eid, _ = _opened(api, brain)
    out = api("confirm", eventId=eid, paid=False).json()
    assert out["choice"] == "not_paid" and "record" not in out
    assert out["wallet"]["balances"]["spending"] == 5000
    assert [e["choice"] for e in out["wallet"]["recent"] if e["id"] == eid] == ["not_paid"]


def test_a_payment_found_in_the_transactions_counts_as_paid_without_recording_it_twice(api, brain, real, monkeypatch, clock):
    eid, _ = _opened(api, brain)
    day = clock["now"].date().isoformat()

    async def found(uid, token):
        return [{"date": day, "amount": -2400.0, "merchant": "ZARA STORE"}]
    monkeypatch.setattr(data, "recent_payments", found)
    w = api("wallet").json()
    e = next(x for x in w["recent"] if x["id"] == eid)
    assert (e["choice"], e["detected"]) == ("paid", True)
    assert w["balances"]["spending"] == 2600            # the bank's row is the record: no second one


def test_no_sign_of_it_after_three_days_means_not_paid_and_a_failed_read_decides_nothing(api, brain, real, monkeypatch, clock):
    eid, _ = _opened(api, brain)

    async def unreadable(uid, token):
        return None
    monkeypatch.setattr(data, "recent_payments", unreadable)
    clock["now"] = clock["now"] + timedelta(days=1)
    assert next(x for x in api("wallet").json()["recent"] if x["id"] == eid)["choice"] == "pending"

    async def nothing(uid, token):
        return []
    monkeypatch.setattr(data, "recent_payments", nothing)
    clock["now"] = clock["now"] + timedelta(days=3)
    w = api("wallet").json()
    assert next(x for x in w["recent"] if x["id"] == eid)["choice"] == "not_paid"


def test_a_pending_payment_matches_only_the_same_amount_in_the_window():
    e = {"opened_at": "2026-11-19T14:00:00+05:30", "exact": "450.00"}
    assert rules.pending_match(e, [{"date": "2026-11-20", "amount": -450.4}])
    assert not rules.pending_match(e, [{"date": "2026-11-20", "amount": -452}])     # a different amount
    assert not rules.pending_match(e, [{"date": "2026-11-18", "amount": -450}])     # before the scan
    assert not rules.pending_match(e, [{"date": "2026-11-23", "amount": -450}])     # too late
    assert not rules.pending_match(e, [{"date": "junk"}, {}])


# ── Taking back "I paid", and a payment the statement didn't show ──

def _paid(api, brain):
    eid, _ = _opened(api, brain)
    return eid, api("confirm", eventId=eid, paid=True).json()


def test_i_paid_by_mistake_can_be_taken_back_and_the_money_returns(api, brain, real):
    eid, paid = _paid(api, brain)
    assert paid["wallet"]["balances"]["spending"] == 2600
    assert next(e for e in paid["wallet"]["recent"] if e["id"] == eid)["canUndo"] is True
    out = api("undo-paid", eventId=eid, stillProvisional=True).json()
    assert out["choice"] == "not_paid" and out["unrecord"] is True          # the backend removes the transaction
    assert out["wallet"]["balances"]["spending"] == 5000
    assert api("undo-paid", eventId=eid).status_code == 400                  # once


def test_a_payment_the_bank_statement_took_over_stays_paid(api, brain, real):
    eid, _ = _paid(api, brain)
    r = api("undo-paid", eventId=eid, stillProvisional=False)
    assert r.status_code == 400 and "bank statement shows" in r.json()["detail"]


def test_kept_payment_stays_paid_and_stops_asking(api, brain, real):
    eid, _ = _paid(api, brain)
    w = api("keep-paid", eventId=eid).json()["wallet"]
    e = next(x for x in w["recent"] if x["id"] == eid)
    assert e["choice"] == "paid" and e["notInStatement"] is False and w["balances"]["spending"] == 2600


def test_a_demo_visit_opens_with_a_week_of_history_to_look_at(api, monkeypatch):
    monkeypatch.delenv("GUARD_PERSONA", raising=False)
    w = api("wallet", userId=10**12 + 77, demo=True).json()
    by_name = {e["payeeName"]: e for e in w["recent"]}
    assert {by_name[n]["choice"] for n in by_name} == {"paid", "skipped", "pending"}
    assert by_name["Rohan"]["notInStatement"] is True and by_name["Fresh Mart"]["choice"] == "pending"
    assert w["savedByPausing"] == 2700 and w["balances"]["spending"] == 5000 - 2450
    # Remove the one the statement didn't show: the money comes back, nothing to unrecord in FinTwin
    out = api("undo-paid", userId=10**12 + 77, demo=True, eventId=by_name["Rohan"]["id"], why="not_in_statement").json()
    assert out["wallet"]["balances"]["spending"] == 5000 - 450
