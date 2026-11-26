"""The rules that must hold every time, whatever the AI says."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace as NS

import pytest

import rules
from data import PERSONA
from samples import BETTING, CAFE, GROCER, LATE, NOON, PERSON, ZARA
from store import default_wallet


def wallet():
    return default_wallet(NOON.date())


def scan(raw, amount, now=NOON, events=(), w=None):
    qr = rules.parse_upi(raw)
    w = w or wallet()
    facts, untrusted, allowed = rules.scan_facts(qr=qr, amount=rules.clean_amount(amount), wallet=w,
                                                 finances=PERSONA, events=list(events), now_dt=now)
    return qr, w, facts, untrusted, allowed


def topup(amount, now=NOON, events=()):
    w = wallet()
    facts, allowed = rules.topup_facts(amount=amount, wallet=w, finances=PERSONA, events=list(events), now_dt=now)
    return w, facts, allowed


def sources():
    return rules.rebalance_sources(wallet=wallet(), finances=PERSONA, now_dt=NOON)


# ── The QR code ──────────────────────────────────────────────────────────────

def test_reads_a_merchant_qr_code():
    qr = rules.parse_upi(CAFE + "&am=450.00&tn=Order%2012")
    assert (qr.pa, qr.pn, qr.mc, qr.am, qr.tn) == ("chaipoint@icici", "Chai Point", "5814", Decimal("450.00"), "Order 12")
    assert rules.category_for(qr) == "Food"


@pytest.mark.parametrize("raw", [
    "https://pay.example.com/?pa=shop@icici", "upi://mandate?pa=shop@icici", "upi://pay?pn=NoPayee",
    "upi://pay?pa=not-a-upi-id", "", None, "upi://pay?pa=shop@icici&am=-5", "upi://pay?pa=shop@icici&am=abc",
])
def test_refuses_anything_but_a_upi_payment(raw):
    with pytest.raises(rules.GuardError):
        rules.parse_upi(raw)


def test_refuses_a_qr_code_with_two_payees():
    with pytest.raises(rules.GuardError, match="damaged"):
        rules.parse_upi("upi://pay?pa=shop@icici&pa=someone.else@ybl")


def test_refuses_other_currencies_and_huge_amounts():
    with pytest.raises(rules.GuardError, match="rupees"):
        rules.parse_upi("upi://pay?pa=shop@icici&cu=USD")
    with pytest.raises(rules.GuardError, match="2,00,000"):
        rules.parse_upi("upi://pay?pa=shop@icici&am=250000")


# ── UPI links ────────────────────────────────────────────────────────────────

def test_a_qr_code_with_an_amount_is_handed_on_unchanged():
    raw = CAFE + "&am=450.00"
    assert rules.handoff_link(rules.parse_upi(raw), Decimal("450.00")) == raw


def test_only_the_amount_and_currency_are_ever_added():
    raw = "upi://pay?pa=chaipoint@icici&pn=Chai%20Point&mc=5814"
    assert rules.handoff_link(rules.parse_upi(raw), Decimal("120")) == raw + "&am=120.00&cu=INR"
    blank = "upi://pay?pa=chaipoint@icici&am=&cu=INR"
    assert rules.handoff_link(rules.parse_upi(blank), Decimal("99.5")) == "upi://pay?pa=chaipoint@icici&am=99.50&cu=INR"


def test_a_top_up_link_pays_only_the_users_own_account():
    s = wallet()["settings"]
    assert rules.self_transfer_link(s, 500) is None
    s["own_upi_id"] = "aarav.spend@okaxis"
    link = rules.self_transfer_link(s, 500)
    assert link.startswith("upi://pay?pa=aarav.spend@okaxis&") and "&am=500.00&cu=INR" in link


@pytest.mark.parametrize("n,text", [(0, "₹0"), (999, "₹999"), (1200, "₹1,200"), (123456, "₹1,23,456"),
                                    (10_000_000, "₹1,00,00,000"), (-450, "-₹450")])
def test_rupees_use_indian_grouping(n, text):
    assert rules.inr(n) == text


@pytest.mark.parametrize("bad", ["../x", "a/b", "", "x" * 65, None, 7])
def test_ids_from_the_browser_are_checked(bad):
    with pytest.raises(rules.GuardError):
        rules.valid_id(bad)


# ── What an agent may write ──────────────────────────────────────────────────

def test_messages_may_only_quote_figures_from_the_facts():
    allowed = {450, 200, 3}
    assert rules.clean_message("This takes  Food ₹200 over.", allowed) == "This takes Food ₹200 over."
    with pytest.raises(rules.AnswerRejected, match="3700"):
        rules.clean_message("You could save Rs. 3,700 this month.", allowed)
    with pytest.raises(rules.AnswerRejected, match="percentages"):
        rules.clean_message("Cut Food by 20%.", allowed)
    with pytest.raises(rules.AnswerRejected, match="900"):
        rules.clean_message("यह 900 रुपये ज़्यादा है।", allowed)
    with pytest.raises(rules.AnswerRejected, match="900"):
        rules.clean_message("ఇది 900 రూపాయలు ఎక్కువ.", allowed)


def test_messages_never_shame_and_never_carry_links():
    with pytest.raises(rules.AnswerRejected, match="shames"):
        rules.clean_message("Another wasteful coffee?", set())
    with pytest.raises(rules.AnswerRejected, match="links"):
        rules.clean_message("Pay at upi://pay?pa=shop@icici instead", set())
    with pytest.raises(rules.AnswerRejected, match="links"):
        rules.clean_message("Send it to ravi@okaxis", set())
    with pytest.raises(rules.AnswerRejected, match="longer"):
        rules.clean_message("word " * 60, set())


# ── Scan ─────────────────────────────────────────────────────────────────────

def test_scan_facts_for_a_cafe_that_goes_over_budget():
    _, _, f, untrusted, allowed = scan(CAFE, 450)
    assert f["category"] == "Food" and f["essential"] is False and f["payee_kind"] == "merchant"
    assert f["budget"] == {"limit": 6000, "spent": 5750, "left_after": -200, "used_after_pct": 103, "over_after": True}
    assert f["week"] == {"left": 5000, "left_after": 4550, "days_to_allowance": 4, "share_of_left_pct": 9}
    assert f["goal"] == {"name": "Goa trip", "delay_days": 3}
    assert untrusted == {"shop_name": "Chai Point", "note": ""}
    assert {450, 200, 6000, 5750, 4550, 9, 3} <= allowed


def test_a_stray_rupee_prefix_is_fixed_and_still_checked():
    assert rules.clean_message("You have R3,500 in your buffer.", {3500}) == "You have ₹3,500 in your buffer."
    assert rules.clean_message("Rs. 450 more than planned.", {450}) == "₹450 more than planned."
    with pytest.raises(rules.AnswerRejected, match="9999"):
        rules.clean_message("That's R9,999 over.", {3500})          # was waved through before


def test_a_persons_name_and_upi_id_never_reach_the_model():
    _, _, f, untrusted, _ = scan(PERSON, 2000)
    assert f["payee_kind"] == "person" and f["category"] == "Other"
    assert untrusted == {"shop_name": "", "note": ""}
    assert "Ravi" not in str(f) and "9876543210" not in str(f) and "rent" not in str(f)


def test_a_payee_is_unknown_when_fintwin_cant_place_it_or_its_a_person():
    assert rules.payee_unknown("Other", "NONE") and rules.payee_unknown("People", "PERSON")
    assert not rules.payee_unknown("Food", "MERCHANT_CODE") and not rules.payee_unknown("Rent", "LEARNED")
    # Every purpose maps to a category FinTwin records as it is
    assert set(rules.REASON_CATEGORIES.values()) <= {
        "Food", "Groceries", "Shopping", "Entertainment", "Transport", "Travel", "Bills", "Rent",
        "Health", "Education", "People", "Other"}


def test_a_reason_loses_links_upi_ids_and_long_numbers_and_stays_untrusted():
    assert rules.clean_reason("Dinner with ravi@okaxis, 9876543210, https://x.co/a\x00") == \
        "Dinner with [removed], [removed], [removed]"
    assert rules.clean_reason("a" * 500) == "a" * 120 and rules.clean_reason(None) == ""
    qr = rules.parse_upi(PERSON)
    f, untrusted, _ = rules.scan_facts(qr=qr, amount=rules.clean_amount(2000), wallet=wallet(), finances=PERSONA,
                                       events=[], now_dt=NOON, category="Shopping", payee_known=False,
                                       purpose="Shopping", reason="new shoes")
    assert (f["payee_known"], f["purpose"], f["category"]) == (False, "Shopping", "Shopping")
    assert untrusted == {"shop_name": "", "note": "", "reason": "new shoes"} and "new shoes" not in str(f)
    f, _, _ = rules.scan_facts(qr=qr, amount=rules.clean_amount(2000), wallet=wallet(), finances=PERSONA,
                               events=[], now_dt=NOON, purpose="Anything")
    assert f["purpose"] is None                        # only the app's fixed list counts


def test_essentials_and_small_payments_skip_the_ai_but_betting_never_does():
    settings = wallet()["settings"]
    qr, _, f, _, _ = scan(GROCER, 1800)
    assert rules.fast_lane(f, qr, settings) == "essential"
    qr, _, f, _, _ = scan(CAFE, 60)
    assert rules.fast_lane(f, qr, settings) == "small"
    qr, _, f, _, _ = scan(BETTING, 50)
    assert rules.fast_lane(f, qr, settings) is None
    qr, _, f, _, _ = scan(CAFE, 450)
    assert rules.fast_lane(f, qr, settings) is None


def test_after_three_pauses_in_a_day_spend_guard_stops_pausing():
    events = [{"type": "scan", "decision": "pause", "choice": "skipped",
               "at": NOON.replace(hour=h).isoformat()} for h in (9, 10, 11)]
    qr, w, f, _, _ = scan(CAFE, 450, events=events)
    assert f["history"]["pauses_today"] == 3
    assert rules.fast_lane(f, qr, w["settings"]) == "pause_limit"


def test_a_grounded_pause_is_accepted():
    _, _, f, _, allowed = scan(CAFE, 450)
    answer = NS(decision="pause", message="This takes your Food budget ₹200 over.", show_wishlist=True)
    assert rules.check_scan(answer, f, allowed) == {
        "decision": "pause", "message": "This takes your Food budget ₹200 over.",
        "show_wishlist": False}          # food at a counter can't wait two days


def test_a_pause_with_an_invented_figure_is_rejected():
    _, _, f, _, allowed = scan(CAFE, 450)
    with pytest.raises(rules.AnswerRejected):
        rules.check_scan(NS(decision="pause", message="That's ₹9,999 on coffee.", show_wishlist=False), f, allowed)
    with pytest.raises(rules.AnswerRejected):
        rules.check_scan(NS(decision="block", message="", show_wishlist=False), f, allowed)


def test_fallback_pauses_on_two_signs_and_not_on_one():
    _, _, f, _, _ = scan(ZARA, 2400)                # over budget and 48% of the week
    out = rules.fallback_scan(f)
    assert out["decision"] == "pause" and out["show_wishlist"] is True
    assert out["message"].startswith("This takes your Shopping budget ₹1,500 over.")
    _, _, f, _, _ = scan(CAFE, 450)                 # over budget only
    assert rules.fallback_scan(f)["decision"] == "go"
    _, _, f, _, _ = scan(CAFE, 450, now=LATE)       # over budget, and late
    assert rules.fallback_scan(f)["decision"] == "pause"


def test_betting_is_always_paused_by_the_fallback():
    _, _, f, _, _ = scan(BETTING, 500)
    assert f["betting"] is True
    out = rules.fallback_scan(f)
    assert out["decision"] == "pause" and out["message"].startswith("This ₹500 payment is to a betting merchant.")


def test_a_bet_always_pauses_even_when_the_agent_says_go():
    _, _, f, _, allowed = scan(BETTING, 100)
    with pytest.raises(rules.AnswerRejected, match="betting"):
        rules.check_scan(NS(decision="go", message="", show_wishlist=False), f, allowed)
    answer = NS(decision="pause", message="This ₹100 payment is to a betting merchant.", show_wishlist=False)
    assert rules.check_scan(answer, f, allowed)["decision"] == "pause"


# ── Top-up ───────────────────────────────────────────────────────────────────

def test_a_top_up_never_goes_past_the_buffer():
    _, f, allowed = topup(5000)
    out = rules.check_topup(NS(decision="approve", suggested_amount=None, message="₹5,000 moves now."), f, allowed)
    assert out["decision"] == "approve_less" and out["suggested_amount"] == 3500


def test_approve_less_has_to_be_less():
    _, f, allowed = topup(2000)
    with pytest.raises(rules.AnswerRejected):
        rules.check_topup(NS(decision="approve_less", suggested_amount=2500, message="₹2,500 then."), f, allowed)
    out = rules.check_topup(NS(decision="approve_less", suggested_amount=1200,
                               message="₹1,200 gets you to your allowance."), f, allowed)
    assert out == {"decision": "approve_less", "suggested_amount": 1200, "message": "₹1,200 gets you to your allowance."}


def test_emergency_top_ups_have_fixed_limits():
    w, f, _ = topup(1000)
    assert rules.emergency_refusal(f, w["settings"]) is None
    w, f, _ = topup(2000)
    assert "₹1,500" in rules.emergency_refusal(f, w["settings"])
    used = [{"type": "topup", "decision": "emergency", "choice": "paid",
             "at": NOON.replace(day=d).isoformat()} for d in (3, 10)]
    w, f, _ = topup(500, events=used)
    assert "used" in rules.emergency_refusal(f, w["settings"])


def test_fallback_suggests_waiting_late_at_night_after_a_regret():
    regretted = [{"type": "topup", "decision": "approve", "choice": "paid", "worth_it": False,
                  "at": LATE.replace(day=12).isoformat()}]
    _, f, _ = topup(800, now=LATE, events=regretted)
    assert rules.fallback_topup(f)["decision"] == "wait"
    _, f, _ = topup(800)
    assert rules.fallback_topup(f)["decision"] == "approve"


# ── Rebalance ────────────────────────────────────────────────────────────────

def test_essentials_and_bills_are_locked():
    s = {x["name"]: x for x in sources()}
    assert s["Groceries"]["locked"] and s["Rent"]["locked"] and s["Bills"]["locked"]
    assert not s["Shopping"]["locked"]
    assert (s["Shopping"]["room"], s["Entertainment"]["room"], s["Food"]["room"]) == (900, 500, 250)
    assert s["Next week's allowance"]["room"] == 5000 - rules.essentials_weekly(PERSONA) == 1998
    assert s["Goa trip"]["room"] == 6000
    # Half of next month's everyday budgets (Food, Shopping, Entertainment)
    assert s["Next month's budgets"]["room"] == 6000 and not s["Next month's budgets"]["locked"]


def test_goal_savings_are_protected_unless_the_user_unlocks_them():
    assert all(x["locked"] for x in sources() if x["kind"] == "goal")
    unlocked = rules.rebalance_sources(wallet=wallet(), finances=PERSONA, now_dt=NOON, allow_goals=True)
    assert not any(x["locked"] for x in unlocked if x["kind"] == "goal")


def test_good_cuts_are_accepted():
    src = sources()
    answer = NS(cuts=[NS(kind="category", name="shopping", amount=900),
                      NS(kind="category", name="Entertainment", amount=300)],
                message="₹900 from Shopping and ₹300 from Entertainment.")
    cuts, _ = rules.check_cuts(answer, 1200, src, rules.figures({"amount": 1200, "sources": src}))
    assert cuts == [{"kind": "category", "name": "Shopping", "amount": 900},
                    {"kind": "category", "name": "Entertainment", "amount": 300}]


@pytest.mark.parametrize("cuts,why", [
    ([("category", "Groceries", 1200)], "locked"),
    ([("category", "Shopping", 1000), ("category", "Food", 200)], "room"),
    ([("category", "Shopping", 900)], "add up"),
    ([("category", "Pets", 1200)], "isn't one of"),
    ([("category", "Shopping", 600), ("category", "shopping", 600)], "twice"),
    ([], "at least one"),
])
def test_bad_cuts_are_rejected(cuts, why):
    answer = NS(cuts=[NS(kind=k, name=n, amount=a) for k, n, a in cuts], message="Done.")
    with pytest.raises(rules.AnswerRejected, match=why):
        rules.check_cuts(answer, 1200, sources(), set())


def test_fallback_cuts_take_from_categories_then_next_month_and_never_goals():
    cuts = rules.proportional_cuts(1200, sources())
    assert sum(c["amount"] for c in cuts) == 1200 and {c["kind"] for c in cuts} == {"category"}
    cuts = rules.proportional_cuts(5000, sources())
    assert sum(c["amount"] for c in cuts) == 5000 and cuts[-1]["kind"] == "next_month"
    assert "goal" not in {c["kind"] for c in cuts}
    with pytest.raises(rules.GuardError):
        rules.proportional_cuts(1_000_000, sources())
    # Only when the user unlocked them do goals give, and only last
    unlocked = rules.rebalance_sources(wallet=wallet(), finances=PERSONA, now_dt=NOON, allow_goals=True)
    cuts = rules.proportional_cuts(12000, unlocked)
    assert sum(c["amount"] for c in cuts) == 12000 and cuts[-1]["kind"] == "goal"


def test_a_cut_from_next_month_is_spread_over_its_everyday_budgets():
    w = wallet()
    rules.apply_cuts(w, [{"kind": "next_month", "name": "Next month's budgets", "amount": 1200}],
                     "2026-11", over_category="Food", finances=PERSONA, following="2026-12")
    assert w["adjustments"]["2026-11"] == {"Food": 1200}
    # 6000 : 4000 : 2000
    assert w["adjustments"]["2026-12"] == {"Food": -600, "Shopping": -400, "Entertainment": -200}
    assert rules.next_month(rules.now().replace(year=2026, month=12)) == "2027-01"


def test_approved_cuts_move_this_months_plan():
    w = wallet()
    rules.apply_cuts(w, [{"kind": "category", "name": "Shopping", "amount": 150},
                         {"kind": "next_allowance", "name": "Next week's allowance", "amount": 50}],
                     "2026-11", over_category="Food")
    assert w["adjustments"]["2026-11"] == {"Food": 200, "Shopping": -150}
    assert w["next_allowance_cut"] == 50 and w["buffer"] == 3550


def test_the_cuts_message_reads_as_a_sentence():
    one = [{"kind": "next_allowance", "name": "Next week's allowance", "amount": 1500}]
    three = [{"kind": "category", "name": "Entertainment", "amount": 500},
             {"kind": "category", "name": "Food", "amount": 250}, *one]
    assert rules.cuts_message(one) == "To keep this month on track: ₹1,500 from next week's allowance."
    assert rules.cuts_message(three) == ("To keep this month on track: ₹500 from Entertainment, ₹250 from Food "
                                         "and ₹1,500 from next week's allowance.")


# ── Payday ───────────────────────────────────────────────────────────────────

def plan_answer(**change):
    base = dict(goals=[NS(goal="Goa trip", amount=6000), NS(goal="Emergency fund", amount=1000)],
                buffer=2500, weekly=[5250] * 4,
                message="Rent and bills take ₹14,500, and ₹7,000 goes to your goals.")
    return NS(**{**base, **change})


def test_a_plan_that_adds_up_is_accepted():
    facts, allowed = rules.payday_facts(salary=45000, wallet=wallet(), finances=PERSONA)
    assert facts["bills"] == 14500 and facts["essentials_weekly_floor"] == 3002
    plan = rules.check_plan(plan_answer(), facts, ["Goa trip", "Emergency fund"], allowed)
    assert plan["buffer"] == 2500 and plan["weekly"] == [5250] * 4


@pytest.mark.parametrize("change,why", [
    ({"weekly": [5250] * 3}, "four"),
    ({"weekly": [2000, 2000, 2000, 15000]}, "at least"),
    ({"buffer": 3000}, "adds up"),
    ({"goals": [NS(goal="New car", amount=7000)]}, "isn't one of"),
    ({"message": "You'll save ₹99,999 by March."}, "aren't in FACTS"),
])
def test_a_plan_that_breaks_a_rule_is_rejected(change, why):
    facts, allowed = rules.payday_facts(salary=45000, wallet=wallet(), finances=PERSONA)
    with pytest.raises(rules.AnswerRejected, match=why):
        rules.check_plan(plan_answer(**change), facts, ["Goa trip", "Emergency fund"], allowed)


def test_the_fallback_plan_adds_up_and_covers_essentials():
    facts, _ = rules.payday_facts(salary=45000, wallet=wallet(), finances=PERSONA)
    plan = rules.fallback_plan(facts, PERSONA.goals)
    total = facts["bills"] + sum(g["amount"] for g in plan["goals"]) + plan["buffer"] + sum(plan["weekly"])
    assert total == 45000 and min(plan["weekly"]) >= facts["essentials_weekly_floor"]


def test_a_salary_below_the_bills_is_refused():
    with pytest.raises(rules.GuardError, match="rent and bills"):
        rules.payday_facts(salary=12000, wallet=wallet(), finances=PERSONA)


# ── Weeks ────────────────────────────────────────────────────────────────────

def test_a_new_week_moves_the_allowance_once():
    w = wallet()
    monday = date.fromisoformat(w["next_allowance"])
    assert rules.roll_week(w, monday) is True
    assert w["balances"] == {"main": 25000, "spending": 10000} and w["week_start"] == monday.isoformat()
    assert rules.roll_week(w, monday) is False


def test_an_approved_plan_sets_each_weeks_allowance():
    w = wallet()
    w["plan"] = {"weekly": [5000, 4000, 4000, 4500], "week": 0}
    rules.roll_week(w, date.fromisoformat(w["next_allowance"]))
    assert w["plan"]["week"] == 1 and w["balances"] == {"main": 26000, "spending": 9000}


def test_a_typed_upi_id_is_checked_like_a_scanned_code():
    """The page turns a typed UPI ID into a plain link (format.js upiLinkFor)."""
    qr = rules.parse_upi("upi://pay?pa=ravi.kumar@okicici&pn=Ravi%20%26%20Sons&cu=INR")
    assert (qr.pa, qr.pn, qr.mc, qr.am) == ("ravi.kumar@okicici", "Ravi & Sons", "", None)
    link = rules.handoff_link(qr, Decimal("650"))
    assert link.startswith(qr.raw) and link.endswith("am=650.00")


def test_other_names_for_essentials_are_locked_too():
    for name in ("Housing", "Healthcare", "Utilities"):
        assert name in rules.ESSENTIAL
