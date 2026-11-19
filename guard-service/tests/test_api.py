"""Whole journeys through the API, with a scripted brain in place of Gemini."""
import json
import time

import main
from agents import schemas
from conftest import KEY
from samples import CAFE, GROCER, LATE, ZARA


def pause(message, wishlist=False):
    return schemas.ScanDecision(decision="pause", message=message, show_wishlist=wishlist)


def go():
    return schemas.ScanDecision(decision="go", message="", show_wishlist=False)


def facts_sent(brain, n=0):
    """The FACTS the agent was given on its n-th question."""
    return json.loads(brain.asked[n][1].split("\n")[1])


# ── The front door ───────────────────────────────────────────────────────────

def test_health_is_public_and_everything_else_needs_the_key(api):
    c = api.client
    assert c.get("/health").json() == {"status": "ok"}
    assert c.post("/guard/wallet", json={"userId": 42}).status_code == 403
    assert c.post("/guard/wallet", json={"userId": 42}, headers={"X-Internal-Key": "wrong"}).status_code == 403
    assert c.post("/guard/wallet", json={"userId": 42},
                  headers={"X-Internal-Key": "ключ".encode()}).status_code == 403
    assert c.get("/docs", headers=KEY).status_code == 404


def test_bad_requests_get_a_plain_message(api):
    r = api("check", qr="upi://pay?pa=chaipoint@icici", amount="abc")
    assert r.status_code == 400 and r.json() == {"detail": "Enter an amount in rupees."}
    assert api.client.post("/guard/check", json={"qr": CAFE}, headers=KEY).status_code == 400   # no user
    assert api("check", user_id=-1, qr=CAFE).status_code == 400
    r = api("outcome", eventId="../../etc", choice="paid")
    assert r.status_code == 400 and r.json() == {"detail": "That item wasn't found."}


def test_a_new_user_starts_with_pretend_balances(api):
    w = api("wallet").json()
    assert w["demo"] is True and w["data"] == "persona" and w["ai"] == "ready"
    assert w["balances"] == {"main": 30000, "spending": 5000}
    assert (w["buffer"], w["weekly"], w["daysToAllowance"]) == (3500, 5000, 4)


def test_one_user_cant_reach_anothers_records(api):
    t = api("topup", amount=1000, emergency=True).json()
    r = api("outcome", user_id=7, eventId=t["eventId"], choice="paid")
    assert r.status_code == 400 and r.json() == {"detail": "That item wasn't found."}


# ── Scan & pay ───────────────────────────────────────────────────────────────

def test_groceries_go_straight_through_without_asking_the_ai(api, brain):
    r = api("check", qr=GROCER, amount=1800)
    body = r.json()
    assert (body["decision"], body["source"], body["reason"]) == ("go", "fast_lane", "essential")
    assert brain.asked == [] and "X-LLM-Usage" not in r.headers


def test_the_agent_pauses_and_the_user_pays_anyway(api, brain):
    brain.answers["scan"] = [pause("This takes your Food budget ₹200 over.")]
    r = api("check", qr=CAFE, amount=450)
    assert r.headers["X-LLM-Usage"] == '{"guard_scan":{"in":100,"out":20,"calls":1}}'
    body = r.json()
    assert (body["decision"], body["source"], body["payeeName"]) == ("pause", "ai", "Chai Point")
    _, text, _ = brain.asked[0]
    assert text.startswith("FACTS:") and "UNTRUSTED" in text and "chaipoint@icici" not in text
    assert brain.closed == 1                              # the session was cleaned up

    out = api("outcome", eventId=body["eventId"], choice="paid").json()
    assert out["link"] == CAFE + "&am=450.00"             # the merchant's own link, plus the amount
    assert out["toRebalance"] == 200 and out["wallet"]["balances"]["spending"] == 4550
    again = api("outcome", eventId=body["eventId"], choice="skipped")
    assert again.status_code == 400 and "already" in again.json()["detail"]


def test_a_broken_answer_falls_back_to_the_rules(api, brain, clock):
    clock["now"] = LATE                                   # late, and over budget: the rules pause
    brain.answers["scan"] = [pause("You'll lose ₹9,999 at this rate.")]
    body = api("check", qr=CAFE, amount=450).json()
    assert (body["decision"], body["source"]) == ("pause", "fallback")
    assert "9,999" not in body["message"]
    assert body["reason"] is None              # why the AI fell back isn't shown to the user


def test_a_slow_agent_never_holds_up_a_payment(api, brain, monkeypatch):
    monkeypatch.setitem(main.AGENT_BUDGET, "scan", 0.8)
    brain.answers["scan"] = ["slow"]
    started = time.monotonic()
    body = api("check", qr=CAFE, amount=450).json()
    assert body["source"] == "fallback" and time.monotonic() - started < 3


def test_without_the_ai_the_rules_decide(api, brain):
    brain.ready = "needs_vertex_for_real_data"
    body = api("check", qr=CAFE, amount=450).json()
    assert body["source"] == "fallback" and brain.asked == []
    assert api("wallet").json()["ai"] == "needs_vertex_for_real_data"


def test_not_enough_money_is_said_plainly(api, brain):
    body = api("check", qr=ZARA, amount=6000).json()
    assert body["decision"] == "insufficient" and "₹5,000" in body["message"] and brain.asked == []
    assert api("outcome", eventId=body["eventId"], choice="paid").status_code == 400


def test_wishlist_then_letting_it_go_counts_as_saved(api, brain):
    brain.answers["scan"] = [pause("That's 48% of what's left this week.", wishlist=True)]
    body = api("check", qr=ZARA, amount=2400).json()
    assert body["showWishlist"] is True
    w = api("outcome", eventId=body["eventId"], choice="wishlist").json()["wallet"]
    item = w["wishlist"][0]
    assert (item["name"], item["amount"], item["ready"], item["canBuy"]) == ("Zara", 2400, False, True)
    assert w["balances"]["spending"] == 5000              # nothing was paid
    w = api("wishlist-remove", wishId=item["id"]).json()["wallet"]
    assert w["wishlist"] == [] and w["savedByPausing"] == 2400


def test_buying_from_the_wishlist_goes_through_a_normal_check(api, brain):
    brain.answers["scan"] = [pause("That's 48% of what's left this week.", wishlist=True)]
    body = api("check", qr=ZARA, amount=2400).json()
    item = api("outcome", eventId=body["eventId"], choice="wishlist").json()["wallet"]["wishlist"][0]
    out = api("wishlist-remove", wishId=item["id"], outcome="bought").json()
    assert out["buy"] == {"qr": ZARA, "amount": "2400.00"} and out["wallet"]["savedByPausing"] == 0


def test_regrets_shape_the_next_decision(api, brain):
    brain.answers["scan"] = [pause("This takes your Food budget ₹200 over."), go()]
    first = api("check", qr=CAFE, amount=450).json()
    api("outcome", eventId=first["eventId"], choice="paid")
    assert [c["id"] for c in api("wallet").json()["checkIns"]] == [first["eventId"]]
    assert api("regret", eventId=first["eventId"], worthIt=False).json() == {"ok": True}
    assert api("regret", eventId=first["eventId"], worthIt=True).status_code == 400
    assert api("wallet").json()["checkIns"] == []
    api("check", qr=CAFE, amount=450)
    history = facts_sent(brain, 1)["history"]
    assert history["regrets_same_category"] == 1 and history["visits_here_this_week"] == 1


# ── Top-ups and rebalancing ──────────────────────────────────────────────────

def test_a_top_up_moved_then_rebalanced_after_one_correction(api, brain):
    brain.answers["topup"] = [schemas.TopupDecision(
        decision="approve_less", suggested_amount=1200, message="₹1,200 gets you to your allowance.")]
    t = api("topup", amount=2000, reason="friend's birthday dinner").json()
    assert (t["decision"], t["suggestedAmount"], t["source"]) == ("approve_less", 1200, "ai")
    assert "birthday" in brain.asked[0][1].split("UNTRUSTED")[1]     # the reason goes in as data

    out = api("outcome", eventId=t["eventId"], choice="paid").json()
    assert out["needsUpiId"] is True and out["toRebalance"] == 1200
    assert out["wallet"]["balances"] == {"main": 28800, "spending": 6200} and out["wallet"]["buffer"] == 2300

    brain.answers["rebalance"] = [
        schemas.Cuts(cuts=[schemas.Cut(kind="category", name="Shopping", amount=900)],
                     message="₹900 from Shopping."),
        schemas.Cuts(cuts=[schemas.Cut(kind="category", name="Shopping", amount=900),
                           schemas.Cut(kind="category", name="Entertainment", amount=300)],
                     message="₹900 from Shopping and ₹300 from Entertainment."),
    ]
    r = api("rebalance", eventId=t["eventId"]).json()
    assert (r["source"], r["amount"], len(r["cuts"])) == ("ai", 1200, 2)
    assert "add up to ₹900, not ₹1,200" in brain.asked[-1][1]        # the agent was told what to fix

    w = api("approve-cuts", eventId=t["eventId"]).json()["wallet"]
    assert w["adjustments"] == {"Shopping": -900, "Entertainment": -300}
    assert api("approve-cuts", eventId=t["eventId"]).status_code == 400
    assert api("rebalance", eventId=t["eventId"]).status_code == 400


def test_an_overspend_is_balanced_from_other_categories(api, brain):
    brain.ready = "ai_off"
    body = api("check", qr=CAFE, amount=450).json()
    api("outcome", eventId=body["eventId"], choice="paid")
    r = api("rebalance", eventId=body["eventId"]).json()
    assert r["source"] == "fallback" and sum(c["amount"] for c in r["cuts"]) == 200
    assert "Food" not in {c["name"] for c in r["cuts"]}                # it can't pay for itself
    w = api("approve-cuts", eventId=body["eventId"]).json()["wallet"]
    assert w["adjustments"]["Food"] == 200


def test_the_top_up_link_pays_the_users_own_account(api, brain):
    api("settings", ownUpiId="aarav.spend@okaxis", ownName="Aarav")
    t = api("topup", amount=1000, emergency=True).json()
    out = api("outcome", eventId=t["eventId"], choice="paid").json()
    assert out["link"].startswith("upi://pay?pa=aarav.spend@okaxis&pn=Aarav&am=1000.00&cu=INR")


def test_bill_money_never_moves(api, brain):
    brain.answers["topup"] = [schemas.TopupDecision(decision="approve", message="₹5,000 moves now.")]
    t = api("topup", amount=5000).json()
    assert (t["decision"], t["suggestedAmount"]) == ("approve_less", 3500)     # cut back by the code
    r = api("outcome", eventId=t["eventId"], choice="paid", amount=5000)
    assert r.status_code == 400 and "bill money" in r.json()["detail"]
    r = api("outcome", eventId=t["eventId"], choice="paid", amount=4000)
    assert r.status_code == 400 and "amounts shown" in r.json()["detail"]
    assert api("outcome", eventId=t["eventId"], choice="paid", amount=3500).status_code == 200


def test_emergency_top_ups_skip_the_questions_within_limits(api, brain):
    t = api("topup", amount=1000, emergency=True).json()
    assert (t["decision"], t["source"]) == ("emergency", "rules") and brain.asked == []
    r = api("topup", amount=2000, emergency=True)
    assert r.status_code == 400 and "₹1,500" in r.json()["detail"]


# ── Payday ───────────────────────────────────────────────────────────────────

def plan(**change):
    base = dict(goals=[schemas.GoalShare(goal="Goa trip", amount=6000),
                       schemas.GoalShare(goal="Emergency fund", amount=1000)],
                buffer=2500, weekly=[5250] * 4,
                message="Rent and bills take ₹14,500, and ₹7,000 goes to your goals. You get ₹5,250 a week.")
    return schemas.PaydayPlan(**{**base, **change})


def test_the_payday_plan_from_the_agent_then_approved(api, brain):
    brain.answers["payday"] = [plan()]
    p = api("payday", salary=45000).json()
    assert p["plan"]["source"] == "ai" and p["plan"]["bills"] == 14500
    state = brain.asked[0][2]
    assert {"Food", "Rent"} <= {b["category"] for b in state["budgets"]}
    # The tools see numbers and names only: no user id, no token
    assert set(state) == {"budgets", "goals"}
    assert all(set(b) == {"category", "limit", "spent", "essential"} for b in state["budgets"])
    assert all(set(g) == {"title", "target", "saved", "monthly_target"} for g in state["goals"])

    w = api("approve-plan", planId=p["planId"]).json()["wallet"]
    assert (w["buffer"], w["weekly"]) == (2500, 5250)
    assert w["balances"] == {"main": 14500 + 2500 + 3 * 5250, "spending": 5000 + 5250}
    assert api("approve-plan", planId=p["planId"]).status_code == 400


def test_the_payday_planner_gets_three_tries_then_the_rules_plan(api, brain):
    brain.answers["payday"] = [plan(weekly=[1000] * 4)] * 3
    p = api("payday", salary=45000).json()["plan"]
    assert p["source"] == "fallback" and p["reason"].startswith("rejected:") and len(brain.asked) == 3
    assert p["bills"] + sum(g["amount"] for g in p["goals"]) + p["buffer"] + sum(p["weekly"]) == 45000


# ── Settings and setup ───────────────────────────────────────────────────────

def test_settings_are_checked(api):
    w = api("settings", language="Telugu", ownUpiId="aarav.spend@okaxis", minCheck=200).json()
    assert w["settings"]["language"] == "Telugu" and w["settings"]["minCheck"] == 200
    assert w["settings"]["ownUpiId"] == "aa***@okaxis"
    assert api("settings", language="Klingon").status_code == 400
    assert api("settings", ownUpiId="not a upi id").status_code == 400


def test_demo_reset_starts_again(api):
    api("topup", amount=1000, emergency=True)
    assert api("wallet").json()["recent"]
    w = api("demo-reset").json()
    assert w["recent"] == [] and w["balances"] == {"main": 30000, "spending": 5000}


def test_hello_reports_whether_the_ai_answers(api, brain):
    brain.answers["hello"] = ["Hi from Spend Guard!"]
    r = api("hello").json()
    assert r["ai"] == "ready" and r["greeting"] == "Hi from Spend Guard!" and r["store"] == "MemoryStore"
