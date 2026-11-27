"""FinTwin Spend Guard: the API the FinTwin backend calls, POST /guard/<action>.

Browsers never call this service. The Spring backend's GuardController checks
the user's login, the USE_SPEND_GUARD permission and the prototype allowlist,
then calls here with X-Internal-Key, the user's id and a 5-minute tool token
(it overwrites whatever the browser sent for those two). Every route works on
that one user's records only.

Money: FinTwin never holds or moves it. A payment is handed to the user's own
UPI app as the merchant's QR link; a top-up is a link to pay their own
spending account. The balances here are pretend ("demo": true), so the demo
can show a full month on stage.
"""
import asyncio
import functools
from collections import OrderedDict
import hmac
import json
import logging
import os
import time
from types import SimpleNamespace
from datetime import timedelta
from decimal import Decimal
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field

import data
import rules
import usage
from agents import brain as agents
from flows import consult, decide
from store import BackendStore, make_store

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("guard")

_INTERNAL_KEY = os.environ.get("AI_INTERNAL_KEY", "")
if not _INTERNAL_KEY:
    raise RuntimeError("AI_INTERNAL_KEY is not set. Use the same value as the backend's AI_INTERNAL_KEY.")


def _env_float(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


# Every request answers inside the backend's 20-second read timeout
REQUEST_BUDGET = _env_float("GUARD_REQUEST_BUDGET_SECONDS", 17)
AGENT_BUDGET = {
    "scan": _env_float("GUARD_SCAN_SECONDS", 7),
    "topup": _env_float("GUARD_TOPUP_SECONDS", 7),
    "rebalance": _env_float("GUARD_REBALANCE_SECONDS", 14),
    "payday": _env_float("GUARD_PAYDAY_SECONDS", 16),
    "hello": 6,
}
# How soon "Was it worth it?" appears after a paid-anyway payment or a top-up
CHECKIN_AFTER = timedelta(minutes=_env_float("GUARD_CHECKIN_MINUTES", 0))
LANGUAGES = {"English", "Hindi", "Hinglish", "Telugu", "Tamil", "Kannada", "Malayalam", "Marathi", "Bengali"}

app = FastAPI(title="FinTwin Spend Guard", docs_url=None, redoc_url=None, openapi_url=None)
store = make_store()
brain = agents.Brain()

_PUBLIC_PATHS = {"/", "/health"}


@app.middleware("http")
async def internal_key_and_usage(request: Request, call_next):
    path = request.url.path.rstrip("/") or "/"
    if path not in _PUBLIC_PATHS:
        key = request.headers.get("x-internal-key", "")
        # Constant-time, on bytes so a non-ASCII header can't raise
        if not hmac.compare_digest(key.encode(), _INTERNAL_KEY.encode()):
            return Response("Forbidden: missing or invalid internal key", status_code=403)
    tally = usage.start()
    response = await call_next(request)
    if tally:
        response.headers[usage.USAGE_HEADER] = json.dumps(tally, separators=(",", ":"))
    return response


@app.exception_handler(rules.GuardError)
async def _guard_error(_: Request, exc: rules.GuardError):
    return JSONResponse({"detail": str(exc)}, status_code=400)


@app.exception_handler(RequestValidationError)
async def _bad_request(_: Request, exc: RequestValidationError):
    return JSONResponse({"detail": "Something in that request wasn't right."}, status_code=400)


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Request bodies ───────────────────────────────────────────────────────────

class Body(BaseModel):
    model_config = ConfigDict(extra="ignore")
    userId: int = Field(gt=0)                       # set by the backend, never the browser
    toolToken: str | None = Field(default=None, max_length=512)
    # Set by the backend for a visit to the shared demo account (userId is then
    # that visit's own id): made-up data, sample shops only, kept in memory
    demo: bool = False


class CheckBody(Body):
    qr: str = Field(max_length=2048)
    amount: str | float | int | None = None         # for QR codes without an amount
    # When Spend Guard asked what an unknown payee is for: one of
    # rules.REASON_CATEGORIES, and optionally the user's own words
    purpose: str | None = Field(default=None, max_length=40)
    reason: str = Field(default="", max_length=120)


class OutcomeBody(Body):
    eventId: str = Field(max_length=64)
    # "opened": the UPI app was opened for a scan; the payment waits for /confirm
    choice: Literal["opened", "paid", "skipped", "wishlist"]
    amount: int | None = Field(default=None, gt=0)  # top-ups: which of the offered amounts


class TopupBody(Body):
    amount: int = Field(gt=0, le=200_000)
    reason: str = Field(default="", max_length=120)
    emergency: bool = False


class EventBody(Body):
    eventId: str = Field(max_length=64)


class RebalanceBody(EventBody):
    # Goal savings are protected unless the user chooses to let them give
    allowGoals: bool = False


class ConfirmBody(EventBody):
    paid: bool


class UndoBody(EventBody):
    # Set by the FinTwin backend, never by the browser: is the transaction Spend
    # Guard recorded still its own, or has a bank statement taken it over?
    stillProvisional: bool | None = None
    why: Literal["user", "not_in_statement"] = "user"


class RegretBody(EventBody):
    worthIt: bool


class PaydayBody(Body):
    salary: int = Field(gt=0, le=10_000_000)


class PlanBody(Body):
    planId: str = Field(max_length=64)


class GoalShare(BaseModel):
    goal: str = Field(max_length=120)
    amount: int = Field(ge=0, le=10_000_000)


class PlanEditBody(PlanBody):
    """The user's own version of a proposed plan: same salary and bills, their split."""
    goals: list[GoalShare] = Field(default_factory=list, max_length=20)
    buffer: int = Field(ge=0, le=10_000_000)
    weekly: list[int] = Field(min_length=4, max_length=4)


class WishBody(Body):
    wishId: str = Field(max_length=64)
    outcome: Literal["dropped", "bought"] = "dropped"


class SettingsBody(Body):
    language: str | None = Field(default=None, max_length=20)
    minCheck: int | None = Field(default=None, ge=0, le=5000)
    maxPausesPerDay: int | None = Field(default=None, ge=0, le=10)
    ownUpiId: str | None = Field(default=None, max_length=256)
    ownName: str | None = Field(default=None, max_length=40)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _budget(key: str, started: float) -> float:
    """The agent's time limit, cut short if this request has already used time."""
    return max(0.0, min(AGENT_BUDGET[key], REQUEST_BUDGET - (time.monotonic() - started)))


def _ms(started: float) -> int:
    return round((time.monotonic() - started) * 1000)


def _wallet(uid: int, now_dt) -> dict:
    w = store.wallet(uid, now_dt.date())
    if rules.roll_week(w, now_dt.date()):
        store.save_wallet(uid, w)
    return w


def _event(uid: int, event_id: str) -> dict:
    e = store.event(uid, rules.valid_id(event_id))
    if e is None:
        raise rules.GuardError("That item wasn't found.")
    return e


def _over_by(e: dict) -> int:
    """How far a paid scan took its category over budget."""
    b = (e.get("facts") or {}).get("budget")
    if not b or not b.get("over_after"):
        return 0
    return min(e["amount"], -b["left_after"])


def _to_rebalance(e: dict) -> int:
    if e.get("choice") != "paid" or e.get("rebalanced"):
        return 0
    return _over_by(e) if e["type"] == "scan" else e.get("moved", 0)


def _sources(w: dict, finances, now_dt, e: dict) -> list[dict]:
    sources = rules.rebalance_sources(wallet=w, finances=finances, now_dt=now_dt,
                                      allow_goals=bool(e.get("allow_goals")))
    if e["type"] == "scan":      # the overspent category can't pay for itself
        cat = (e.get("category") or "").lower()
        sources = [s for s in sources if not (s["kind"] == "category" and s["name"].lower() == cat)]
    return sources


def _brief(e: dict) -> dict:
    return {
        "id": e["id"], "type": e["type"], "at": e["at"], "amount": e.get("moved") or e["amount"],
        "category": e.get("category"), "payeeName": e.get("payee_name") or e.get("note") or "",
        "decision": e["decision"], "message": e.get("message", ""), "source": e["source"],
        "choice": e.get("choice"), "worthIt": e.get("worth_it"), "detected": e.get("detected"),
        "notInStatement": bool(e.get("not_in_statement")),
        # "I paid" by mistake can be taken back; a payment the bank showed can't
        "canUndo": e["type"] == "scan" and e.get("choice") == "paid" and not e.get("detected"),
        "toRebalance": _to_rebalance(e), "proposedCuts": e.get("proposed_cuts"),
    }


def _view(uid: int, w: dict, now_dt) -> dict:
    events = store.events(uid, limit=60)
    s = w["settings"]
    check_ins = [e for e in events
                 if e.get("choice") == "paid" and e.get("worth_it") is None
                 and (e.get("decision") == "pause" or e["type"] == "topup")
                 and now_dt - rules.local(e.get("paid_at") or e["at"]) >= CHECKIN_AFTER][:3]
    persona = data.persona_mode()
    plan = w.get("plan")
    return {
        "demo": True,
        "balances": w["balances"],
        "buffer": w["buffer"],
        "weekly": plan["weekly"][plan.get("week", 0)] if plan else w["weekly"],
        "weekStart": w["week_start"],
        "nextAllowance": w["next_allowance"],
        "daysToAllowance": rules.days_to_allowance(w, now_dt.date()),
        "nextAllowanceCut": w.get("next_allowance_cut", 0),
        "savedByPausing": w.get("saved_by_pausing", 0),
        "adjustments": w.get("adjustments", {}).get(now_dt.strftime("%Y-%m"), {}),
        "plan": plan,
        "settings": {
            "language": s["language"], "minCheck": s["min_check"],
            "maxPausesPerDay": s["max_pauses_per_day"],
            "emergencyPerMonth": s["emergency_per_month"], "emergencyMax": s["emergency_max"],
            "ownUpiId": rules.mask_upi(s.get("own_upi_id", "")), "ownName": s.get("own_name", ""),
        },
        "wishlist": [{
            "id": x["id"], "name": x["name"], "amount": x["amount"], "category": x["category"],
            "addedAt": x["added_at"], "readyAt": x["ready_at"],
            "ready": now_dt >= rules.local(x["ready_at"]), "canBuy": bool(x.get("qr")),
        } for x in store.wishes(uid)],
        "recent": [_brief(e) for e in events[:12]],
        "checkIns": [_brief(e) for e in check_ins],
        "ai": brain.availability(persona) or "ready",
        "data": "persona" if persona else "fintwin",
    }


def _saved(w: dict, amount: int, now_dt) -> None:
    """Money kept by pausing: a running total, and one per month for the Copilot."""
    w["saved_by_pausing"] = w.get("saved_by_pausing", 0) + amount
    month = now_dt.strftime("%Y-%m")
    by_month = w.setdefault("saved_by_month", {})
    by_month[month] = by_month.get(month, 0) + amount


def summary(uid: int) -> dict:
    """This month in Spend Guard, for FinTwin's Copilot: counts and rupees only,
    never a payee's name or UPI ID. The balances are the pretend wallet's."""
    now_dt = rules.now()
    month = now_dt.strftime("%Y-%m")
    w = store.wallet(uid, now_dt.date())
    events = [e for e in store.events(uid) if (e.get("at") or "").startswith(month)]
    scans = [e for e in events if e["type"] == "scan"]
    pauses = [e for e in scans if e["decision"] == "pause"]
    topups = [e for e in events if e["type"] == "topup"]
    by_category: dict[str, int] = {}
    for e in pauses:
        by_category[e.get("category") or "Other"] = by_category.get(e.get("category") or "Other", 0) + 1
    plan = w.get("plan")
    following = rules.next_month(now_dt)
    adjustments = {m: {k: v for k, v in w.get("adjustments", {}).get(m, {}).items()
                       if not k.startswith("goal:") and v}
                   for m in (month, following)}
    return {
        "month": month,
        # Approved rebalances, so FinTwin's budgets show the same limits
        "budgetAdjustments": {m: a for m, a in adjustments.items() if a},
        "savedByPausingThisMonth": w.get("saved_by_month", {}).get(month, 0),
        "savedByPausingTotal": w.get("saved_by_pausing", 0),
        "paymentsChecked": len(scans),
        "pauses": len(pauses),
        "pausesByCategory": by_category,
        "skippedAfterAPause": sum(1 for e in pauses if e.get("choice") == "skipped"),
        "paidAnywayAfterAPause": sum(1 for e in pauses if e.get("choice") == "paid"),
        "putOnTheWishlist": sum(1 for e in events if e.get("choice") == "wishlist"),
        "wishlistItemsNow": len(store.wishes(uid)),
        "topUpsAsked": len(topups),
        "toppedUpRupees": sum(e.get("moved", 0) for e in topups if e.get("choice") == "paid"),
        "ratedNotWorthIt": sum(1 for e in events if e.get("worth_it") is False),
        "leftToSpendThisWeek": w["balances"]["spending"],
        "weeklyAllowance": plan["weekly"][plan.get("week", 0)] if plan else w["weekly"],
        "bufferForTopUps": w["buffer"],
        "salaryPlan": ({"salary": plan["salary"], "goals": plan["goals"], "approvedAt": plan["approved_at"]}
                       if plan and str(plan.get("approved_at", "")).startswith(month) else None),
        "balancesArePretend": True,
    }


def persisted(handler):
    """With records kept in FinTwin: reads this user's records before the route
    runs, and writes them back afterwards if the route changed them."""
    @functools.wraps(handler)
    async def run(body, *args, **kwargs):
        demo = data.demo_visit.set(bool(body.demo))
        try:
            if body.demo:
                first = body.userId not in _demo_visits
                _demo_visit_seen(body.userId)       # in memory only, never FinTwin
                if first:
                    _seed_demo(body.userId)
                return await handler(body, *args, **kwargs)
            if not isinstance(store, BackendStore):
                return await handler(body, *args, **kwargs)
            await store.open(body.userId, body.toolToken)
            before = store.fingerprint(body.userId)
            try:
                return await handler(body, *args, **kwargs)
            finally:
                if store.fingerprint(body.userId) != before:
                    store.save_soon(body.userId, body.toolToken, lambda: summary(body.userId))
        finally:
            data.demo_visit.reset(demo)
    return run


# Judging (Nov–Dec 2026): a demo visitor who scans a real shop's code gets the real
# hand-off to their own UPI app. Set DEMO_REAL_HANDOFF=0 to show "nothing is paid" instead.
DEMO_REAL_HANDOFF = os.environ.get("DEMO_REAL_HANDOFF", "1") != "0"

# Demo visits live in memory; the oldest are dropped so they can't pile up
MAX_DEMO_VISITS = 500
_demo_visits: OrderedDict[int, None] = OrderedDict()

# A demo visit opens with a week of Spend Guard already behind it, so a judge
# sees every outcome at once: paid, a pause that saved money, a betting pause,
# one waiting to be confirmed, and one the bank statement didn't show.
_DEMO_HISTORY = [
    # days ago, payee, upi, mcc, category, rupees, decision, source, choice, extra
    (4, "Rohan", "rohan@sample", "", "People", 2000, "go", "ai", "paid",
     {"recorded": True, "not_in_statement": True,
      "message": "Paying back a dinner share fits this week."}),
    (3, "Chai Corner", "chaicorner@sample", "5814", "Food", 450, "go", "fast_lane", "paid", {"recorded": True}),
    (2, "Urban Threads", "urbanthreads@sample", "5651", "Shopping", 2400, "pause", "ai", "skipped",
     {"message": "This ₹2,400 would take your Shopping budget ₹1,500 over and push your Goa trip back about 12 days."}),
    (1, "LuckyPlay", "luckyplay@sample", "7995", "Entertainment", 300, "pause", "rules", "skipped",
     {"message": "Betting payments always get a pause, whatever the amount."}),
    (0, "Fresh Mart", "freshmart@sample", "5411", "Groceries", 1800, "go", "fast_lane", "pending", {}),
]


def _seed_demo(uid: int) -> None:
    now_dt = rules.now()
    w = _wallet(uid, now_dt)
    for days, name, upi, mcc, cat, rupees, decision, source, choice, extra in _DEMO_HISTORY:
        at = (now_dt - timedelta(days=days, hours=2)).isoformat()
        qr = f"upi://pay?pa={upi}&pn={name.replace(' ', '%20')}" + (f"&mc={mcc}" if mcc else "")
        e = {"type": "scan", "at": at, "amount": rupees, "exact": f"{rupees}.00", "category": cat,
             "category_source": "BRAND", "payee": upi, "payee_name": name, "qr": qr,
             "decision": decision, "message": "", "show_wishlist": False, "source": source,
             "reason": "small" if source == "fast_lane" else None, "facts": {}, "choice": choice,
             "worth_it": None, "decided_at": at, "opened_at": at, "sample_history": True}
        e.update(extra)
        if choice == "paid":
            e["paid_at"] = at
            w["balances"]["spending"] = max(0, w["balances"]["spending"] - rupees)
        elif choice == "skipped":
            _saved(w, rupees, now_dt)
        store.add_event(uid, e)
    store.save_wallet(uid, w)


def _demo_visit_seen(uid: int) -> None:
    _demo_visits[uid] = None
    _demo_visits.move_to_end(uid)
    while len(_demo_visits) > MAX_DEMO_VISITS:
        old, _ = _demo_visits.popitem(last=False)
        store.reset(old)


@app.on_event("shutdown")
async def _flush_records():
    if isinstance(store, BackendStore):
        await store.drain()


# ── Routes ───────────────────────────────────────────────────────────────────

@app.post("/guard/hello")
async def hello(body: Body):
    """Can Spend Guard reach its model? For setting up, not for users."""
    persona = data.persona_mode()
    why_not = brain.availability(persona)
    greeting = None
    if why_not is None:
        greeting, why_not = await consult(brain, "hello", "Say hello.", lambda a: str(a)[:200],
                                          attempts=1, budget_s=AGENT_BUDGET["hello"])
    return {"ai": why_not or "ready", "where": agents.where(), "model": agents.MODEL,
            "store": type(store).__name__, "data": "persona" if persona else "fintwin",
            "greeting": greeting}


@app.post("/guard/wallet")
@persisted
async def wallet(body: Body):
    now_dt = rules.now()
    w = _wallet(body.userId, now_dt)
    await _settle_pending(body, w, now_dt)
    return _view(body.userId, w, now_dt)


@app.post("/guard/check")
@persisted
async def check(body: CheckBody):
    """A scanned QR code, before paying: go, pause, or not enough money."""
    started, uid, now_dt = time.monotonic(), body.userId, rules.now()
    qr = rules.parse_upi(body.qr)
    # A demo visit may check any code (the made-up persona's money, nothing of
    # anyone's real data); it just never gets a payment link back, see outcome
    # A QR code that carries an amount fixes it; otherwise the user types one
    exact = qr.am if qr.am is not None else rules.clean_amount(body.amount)
    w = _wallet(uid, now_dt)
    finances, fintwin_category = await asyncio.gather(
        data.load(uid, body.toolToken),
        data.categorize(uid, qr.pn or qr.pa.split("@")[0], body.toolToken))
    # FinTwin can't tell who this is: the user says what it's for, and that
    # (a fixed list, mapped in code) decides the category
    category, category_source, unknown, purpose = rules.scan_category(qr, fintwin_category, body.purpose)
    note = rules.clean_reason(body.reason) if purpose else ""
    facts, untrusted, allowed = rules.scan_facts(qr=qr, amount=exact, wallet=w, finances=finances,
                                                 events=store.events(uid), now_dt=now_dt,
                                                 category=category, payee_known=not unknown,
                                                 purpose=purpose, reason=note)
    if (unknown and not purpose and facts["week"]["left_after"] >= 0
            and facts["amount"] >= w["settings"].get("min_check", 100)):
        # Nothing is decided or kept yet: the app asks, then checks again
        return {"decision": "ask_reason", "question": rules.REASON_QUESTION,
                "purposes": list(rules.REASON_CATEGORIES), "source": "rules", "reason": None,
                "amount": str(exact), "rupees": facts["amount"], "category": facts["category"],
                "payeeName": qr.pn, "payeeUpi": qr.pa}
    if facts["week"]["left_after"] < 0:
        result = {"decision": "insufficient", "show_wishlist": False,
                  "message": rules.insufficient_message(facts)}
        source, reason = "rules", "insufficient"
    elif lane := rules.fast_lane(facts, qr, w["settings"]):
        result, source, reason = {"decision": "go", "show_wishlist": False, "message": ""}, "fast_lane", lane
    else:
        result, source, reason = await decide(
            brain, "scan", agents.prompt(facts, untrusted),
            lambda a: rules.check_scan(a, facts, allowed), lambda: rules.fallback_scan(facts),
            persona=finances.persona, data_ok=finances.data_ok, attempts=1,
            budget_s=_budget("scan", started))
    event_id = store.add_event(uid, {
        "type": "scan", "at": now_dt.isoformat(), "amount": facts["amount"], "exact": str(exact),
        "category": facts["category"], "category_source": category_source, "purpose": purpose,
        "payee": qr.pa, "payee_name": qr.pn[:60], "qr": qr.raw,
        "decision": result["decision"], "message": result["message"],
        "show_wishlist": result["show_wishlist"], "source": source, "reason": reason,
        "model": agents.MODEL if source == "ai" else None, "ms": _ms(started),
        "facts": facts, "choice": None, "worth_it": None,
    })
    return {
        "eventId": event_id, "decision": result["decision"], "message": result["message"],
        "showWishlist": result["show_wishlist"], "source": source,
        # Only the fast lane's reason is shown; why the AI fell back stays in the log
        "reason": reason if source == "fast_lane" else None,
        "amount": str(exact), "rupees": facts["amount"], "category": facts["category"],
        "payeeName": qr.pn, "payeeUpi": qr.pa,
        "budget": facts["budget"], "week": facts["week"], "goal": facts["goal"],
    }


@app.post("/guard/outcome")
@persisted
async def outcome(body: OutcomeBody):
    """What the user chose after a check or a top-up answer. Each one is decided once."""
    uid, now_dt = body.userId, rules.now()
    e = _event(uid, body.eventId)
    if e.get("choice") is not None:
        raise rules.GuardError("You've already decided on this one.")
    w = _wallet(uid, now_dt)
    fields = {"choice": body.choice, "decided_at": now_dt.isoformat()}
    out = {"choice": body.choice, "link": None, "toRebalance": 0, "needsUpiId": False}

    if e["type"] == "scan":
        if body.choice in ("opened", "paid"):
            if e["decision"] == "insufficient" or e["amount"] > w["balances"]["spending"]:
                raise rules.GuardError("Your spending account doesn't have enough for this. Ask for a top-up first.")
            # The merchant's own link, only ever rebuilt from the stored QR code
            # The merchant's own link, only ever rebuilt from the stored QR code. A demo
            # gets it for a sample shop (shown as a preview, never opened) and, while
            # DEMO_REAL_HANDOFF is on, for a real code: the visitor's own UPI app opens,
            # and nothing is paid unless they approve it with their PIN.
            qr = rules.parse_upi(e["qr"])
            handoff = not body.demo or rules.is_sample(qr) or DEMO_REAL_HANDOFF
            out["link"] = rules.handoff_link(qr, Decimal(e["exact"])) if handoff else None
            fields.update(opened_at=now_dt.isoformat(), paid_anyway=e["decision"] == "pause")
            if body.choice == "opened":
                # Nothing moves yet: the user may not finish paying
                fields["choice"] = out["choice"] = "pending"
            else:
                _mark_paid(uid, e, w, now_dt, fields, out)
        elif body.choice == "skipped":
            if e["decision"] == "pause":
                _saved(w, e["amount"], now_dt)
        else:
            if e["category"] not in rules.WAITABLE:
                raise rules.GuardError("Only things that can wait go on the wishlist.")
            store.add_wish(uid, {
                "name": e.get("payee_name") or e["category"], "amount": e["amount"],
                "exact": e["exact"], "category": e["category"], "qr": e["qr"], "event_id": e["id"],
                "added_at": now_dt.isoformat(),
                "ready_at": (now_dt + timedelta(hours=48)).isoformat(),
            })
    else:
        if body.choice == "paid":
            offered = {e["amount"]} | ({e["suggested"]} if e.get("suggested") else set())
            default = e["suggested"] if e["decision"] == "approve_less" and e.get("suggested") else e["amount"]
            moved = body.amount or default
            if moved not in offered:
                raise rules.GuardError("Choose one of the amounts shown.")
            if moved > w["buffer"]:
                raise rules.GuardError(f"{rules.inr(w['buffer'])} is the most you can move without "
                                       f"touching bill money.")
            w["balances"]["main"] -= moved
            w["balances"]["spending"] += moved
            w["buffer"] -= moved
            fields.update(paid_at=now_dt.isoformat(), moved=moved)
            out["link"] = rules.self_transfer_link(w["settings"], moved)
            out["needsUpiId"] = out["link"] is None
            out["toRebalance"] = moved
        elif body.choice == "wishlist":
            store.add_wish(uid, {
                "name": e.get("note") or "Top-up", "amount": e["amount"], "exact": None,
                "category": "Other", "qr": None, "event_id": e["id"],
                "added_at": now_dt.isoformat(),
                "ready_at": (now_dt + timedelta(hours=48)).isoformat(),
            })

    store.update_event(uid, e["id"], fields)
    store.save_wallet(uid, w)
    out["wallet"] = _view(uid, w, now_dt)
    return out


def _mark_paid(uid: int, e: dict, w: dict, now_dt, fields: dict, out: dict, detected: bool = False) -> None:
    """A scanned payment that went through: off the spending account, and, when
    the user confirmed it, proposed to FinTwin as a transaction (a detected one
    is already there). Sample shops and the persona are never recorded."""
    w["balances"]["spending"] = max(0, w["balances"]["spending"] - e["amount"])
    fields.update(choice="paid", paid_at=now_dt.isoformat(), detected=detected)
    out.update(choice="paid", toRebalance=_over_by(e))
    qr = rules.parse_upi(e["qr"])
    if not detected and not rules.is_sample(qr) and not data.persona_mode():
        data.forget(uid)            # the new transaction changes a budget's spending
        out["record"] = {"eventId": e["id"], "merchant": (e.get("payee_name") or qr.pa)[:120],
                         "amount": e["exact"], "category": e["category"],
                         "categorySource": e.get("category_source")}
        fields["recorded"] = True


def _mark_not_paid(e: dict, now_dt, fields: dict, out: dict, why: str) -> None:
    fields.update(choice="not_paid", not_paid_at=now_dt.isoformat(), not_paid_why=why)
    out.update(choice="not_paid", toRebalance=0)


@app.post("/guard/confirm")
@persisted
async def confirm(body: ConfirmBody):
    """After the UPI app was opened: did the payment go through?"""
    uid, now_dt = body.userId, rules.now()
    e = _event(uid, body.eventId)
    if e["type"] != "scan" or e.get("choice") != "pending":
        raise rules.GuardError("This payment isn't waiting for an answer.")
    w = _wallet(uid, now_dt)
    fields: dict = {}
    out = {"link": None, "toRebalance": 0}
    if body.paid:
        _mark_paid(uid, e, w, now_dt, fields, out)
    else:
        _mark_not_paid(e, now_dt, fields, out, "user")
    store.update_event(uid, e["id"], fields)
    store.save_wallet(uid, w)
    out["wallet"] = _view(uid, w, now_dt)
    return out


@app.post("/guard/undo-paid")
@persisted
async def undo_paid(body: UndoBody):
    """"I paid" was a mistake, or the statement didn't show the payment and the
    user says it never happened: the money goes back to the spending account and
    the history says not paid. The backend removes the transaction it recorded."""
    uid, now_dt = body.userId, rules.now()
    e = _event(uid, body.eventId)
    if e["type"] != "scan" or e.get("choice") != "paid":
        raise rules.GuardError("Only a payment marked as paid can be taken back.")
    if e.get("detected") or (e.get("recorded") and body.stillProvisional is False):
        raise rules.GuardError("Your bank statement shows this payment, so it stays as paid.")
    w = _wallet(uid, now_dt)
    w["balances"]["spending"] += e["amount"]
    fields: dict = {"not_in_statement": False}
    out = {"link": None, "unrecord": bool(e.get("recorded"))}
    _mark_not_paid(e, now_dt, fields, out, body.why)
    store.update_event(uid, e["id"], fields)
    store.save_wallet(uid, w)
    out["wallet"] = _view(uid, w, now_dt)
    return out


@app.post("/guard/keep-paid")
@persisted
async def keep_paid(body: EventBody):
    """The statement didn't show it, but the user did pay (from another account,
    say): it stays paid and stops asking."""
    uid, now_dt = body.userId, rules.now()
    e = _event(uid, body.eventId)
    if e["type"] != "scan" or e.get("choice") != "paid":
        raise rules.GuardError("Only a payment marked as paid can be kept.")
    store.update_event(uid, e["id"], {"not_in_statement": False, "kept": True})
    w = _wallet(uid, now_dt)
    return {"wallet": _view(uid, w, now_dt)}


async def _settle_pending(body: Body, w: dict, now_dt) -> None:
    """Payments still waiting: paid once one turns up in FinTwin's transactions,
    not paid after PENDING_DAYS with no sign of it. Never on a failed read."""
    uid = body.userId
    waiting = [e for e in store.events(uid) if e.get("type") == "scan" and e.get("choice") == "pending"]
    if not waiting:
        return
    rows = await data.recent_payments(uid, body.toolToken)
    changed = False
    for e in waiting:
        fields: dict = {}
        if rows and rules.pending_match(e, rows):
            _mark_paid(uid, e, w, now_dt, fields, {}, detected=True)
        elif rules.pending_expired(e, now_dt):
            _mark_not_paid(e, now_dt, fields, {}, "not_detected")
        if fields:
            store.update_event(uid, e["id"], fields)
            changed = True
    if changed:
        store.save_wallet(uid, w)


@app.post("/guard/topup")
@persisted
async def topup(body: TopupBody):
    """A request to move more money into the spending account."""
    started, uid, now_dt = time.monotonic(), body.userId, rules.now()
    w = _wallet(uid, now_dt)
    finances = await data.load(uid, body.toolToken)
    facts, allowed = rules.topup_facts(amount=body.amount, wallet=w, finances=finances,
                                       events=store.events(uid), now_dt=now_dt)
    note = rules.clean_text(body.reason, 120)
    if body.emergency:
        # Emergencies skip the questions, within fixed limits the AI can't change
        refusal = rules.emergency_refusal(facts, w["settings"])
        if refusal:
            raise rules.GuardError(refusal + " You can still ask for a normal top-up.")
        result = {"decision": "emergency", "suggested_amount": None, "message": rules.emergency_message(facts)}
        source, reason = "rules", "emergency"
    else:
        result, source, reason = await decide(
            brain, "topup", agents.prompt(facts, {"reason": note}),
            lambda a: rules.check_topup(a, facts, allowed), lambda: rules.fallback_topup(facts),
            persona=finances.persona, data_ok=finances.data_ok, attempts=1,
            budget_s=_budget("topup", started))
    event_id = store.add_event(uid, {
        "type": "topup", "at": now_dt.isoformat(), "amount": body.amount, "note": note[:60],
        "category": None, "decision": result["decision"], "suggested": result["suggested_amount"],
        "message": result["message"], "source": source, "reason": reason,
        "model": agents.MODEL if source == "ai" else None, "ms": _ms(started),
        "facts": facts, "choice": None, "worth_it": None,
    })
    return {"eventId": event_id, "decision": result["decision"], "message": result["message"],
            "suggestedAmount": result["suggested_amount"], "requested": body.amount,
            "buffer": w["buffer"], "source": source}


@app.post("/guard/rebalance")
@persisted
async def rebalance(body: RebalanceBody):
    """Where an overspend or a top-up comes from this month. Proposes; approve-cuts applies."""
    started, uid, now_dt = time.monotonic(), body.userId, rules.now()
    e = _event(uid, body.eventId)
    if e.get("choice") != "paid":
        raise rules.GuardError("Only payments and top-ups you've made can be rebalanced.")
    if e.get("rebalanced"):
        raise rules.GuardError("This one's already been balanced.")
    amount = _to_rebalance(e)        # from the stored record, never from the browser
    if amount <= 0:
        raise rules.GuardError("This stayed inside your plan, so nothing needs to move.")
    w = _wallet(uid, now_dt)
    finances = await data.load(uid, body.toolToken)
    e["allow_goals"] = body.allowGoals
    store.update_event(uid, e["id"], {"allow_goals": body.allowGoals})
    sources = _sources(w, finances, now_dt, e)
    facts = {"mode": "rebalance", "amount": amount,
             "why": "over_budget" if e["type"] == "scan" else "top_up",
             "category": e.get("category"), "sources": sources,
             "language": w["settings"]["language"]}
    allowed = rules.figures(facts)

    def check_answer(answer):
        cuts, message = rules.check_cuts(answer, amount, sources, allowed)
        return {"cuts": cuts, "message": message}

    def fallback():
        cuts = rules.proportional_cuts(amount, sources)
        return {"cuts": cuts, "message": rules.cuts_message(cuts)}

    result, source, reason = await decide(
        brain, "rebalance", agents.prompt(facts), check_answer, fallback,
        persona=finances.persona, data_ok=finances.data_ok, attempts=3,
        budget_s=_budget("rebalance", started))
    store.update_event(uid, e["id"], {"proposed_cuts": result["cuts"], "cuts_message": result["message"],
                                      "cuts_source": source, "cuts_reason": reason})
    return {"eventId": e["id"], "amount": amount, "cuts": result["cuts"],
            "message": result["message"], "source": source}


@app.post("/guard/approve-cuts")
@persisted
async def approve_cuts(body: EventBody):
    uid, now_dt = body.userId, rules.now()
    e = _event(uid, body.eventId)
    cuts = e.get("proposed_cuts")
    if not cuts:
        raise rules.GuardError("There's nothing to approve yet.")
    if e.get("rebalanced"):
        raise rules.GuardError("This one's already been balanced.")
    w = _wallet(uid, now_dt)
    finances = await data.load(uid, body.toolToken)
    # Checked again: the plan may have changed since the suggestion
    room = {(s["kind"], s["name"]): s for s in _sources(w, finances, now_dt, e)}
    for c in cuts:
        s = room.get((c["kind"], c["name"]))
        if s is None or s["locked"] or c["amount"] > s["room"]:
            raise rules.GuardError("Your plan changed since this was suggested. Ask for a new suggestion.")
    rules.apply_cuts(w, cuts, now_dt.strftime("%Y-%m"),
                     over_category=e.get("category") if e["type"] == "scan" else None,
                     finances=finances, following=rules.next_month(now_dt))
    store.save_wallet(uid, w)
    store.update_event(uid, e["id"], {"rebalanced": True, "rebalanced_at": now_dt.isoformat()})
    return {"wallet": _view(uid, w, now_dt)}


@app.post("/guard/payday")
@persisted
async def payday(body: PaydayBody):
    """Splits a salary into bills, goals, a buffer and four weekly allowances. Proposes only."""
    started, uid, now_dt = time.monotonic(), body.userId, rules.now()
    w = _wallet(uid, now_dt)
    finances = await data.load(uid, body.toolToken)
    facts, allowed = rules.payday_facts(salary=body.salary, wallet=w, finances=finances)
    state = finances.tool_state()
    allowed |= rules.figures(state)          # figures the tools showed the agent
    goal_names = [g.title for g in finances.goals]
    result, source, reason = await decide(
        brain, "payday", agents.prompt(facts),
        lambda a: rules.check_plan(a, facts, goal_names, allowed),
        lambda: rules.fallback_plan(facts, finances.goals),
        persona=finances.persona, data_ok=finances.data_ok, attempts=3,
        budget_s=_budget("payday", started), state=state)
    plan = {"salary": body.salary, "bills": facts["bills"], "sips": facts.get("sips", 0), **result, "source": source, "reason": reason,
            "model": agents.MODEL if source == "ai" else None, "ms": _ms(started),
            "created_at": now_dt.isoformat()}
    plan_id = store.save_plan(uid, plan)
    return {"planId": plan_id, "plan": {**plan, "id": plan_id}}


@app.post("/guard/edit-plan")
@persisted
async def edit_plan(body: PlanEditBody):
    """The user sets the split themselves. It passes the same checks as the
    agent's plan (it adds up to the salary, every week covers essentials, only
    their own goals), and becomes a new proposal to approve. No AI involved."""
    uid, now_dt = body.userId, rules.now()
    p = store.plan(uid, rules.valid_id(body.planId))
    if p is None:
        raise rules.GuardError("That plan wasn't found.")
    w = _wallet(uid, now_dt)
    finances = await data.load(uid, body.toolToken)
    facts, _ = rules.payday_facts(salary=p["salary"], wallet=w, finances=finances)
    answer = SimpleNamespace(goals=[SimpleNamespace(goal=g.goal, amount=g.amount) for g in body.goals],
                             buffer=body.buffer, weekly=list(body.weekly), message="")
    try:
        result = rules.check_plan(answer, facts, [g.title for g in finances.goals], set())
    except rules.AnswerRejected as e:
        raise rules.GuardError(f"This plan doesn't work yet: {e}.")
    result["message"] = "Your own split. Approve it to start the month."
    plan = {"salary": p["salary"], "bills": facts["bills"], **result, "source": "user", "reason": "edited",
            "model": None, "ms": 0, "created_at": now_dt.isoformat()}
    plan_id = store.save_plan(uid, plan)
    return {"planId": plan_id, "plan": {**plan, "id": plan_id}}


@app.post("/guard/approve-plan")
@persisted
async def approve_plan(body: PlanBody):
    uid, now_dt = body.userId, rules.now()
    p = store.plan(uid, rules.valid_id(body.planId))
    if p is None:
        raise rules.GuardError("That plan wasn't found.")
    w = _wallet(uid, now_dt)
    current = w.get("plan")
    if current and now_dt - rules.local(current["approved_at"]) < timedelta(days=7):
        raise rules.GuardError("You approved a plan this week already. Reset the demo to try another.")
    weekly = p["weekly"]
    # Pretend bank: the salary lands, goal money leaves for savings, and week 1 moves now
    w["balances"]["main"] = p["bills"] + p["buffer"] + sum(weekly[1:])
    w["balances"]["spending"] += weekly[0]
    w["buffer"] = p["buffer"]
    w["weekly"] = weekly[0]
    w["next_allowance_cut"] = 0
    w["plan"] = {"id": p["id"], "salary": p["salary"], "bills": p["bills"], "goals": p["goals"],
                 "buffer": p["buffer"], "weekly": weekly, "week": 0, "source": p["source"],
                 "approved_at": now_dt.isoformat()}
    store.save_wallet(uid, w)
    out = {"wallet": _view(uid, w, now_dt)}
    # FinTwin earmarks each goal's share for this month (the backend matches the
    # titles to the user's goals). Made-up persona goals are never sent.
    if not data.persona_mode() and p["goals"]:
        data.forget(uid)                    # the earmarks change goal progress
        out["goalPlan"] = {"month": now_dt.strftime("%Y-%m"),
                           "goals": [{"goal": g["goal"], "amount": g["amount"]} for g in p["goals"]]}
    return out


@app.post("/guard/regret")
@persisted
async def regret(body: RegretBody):
    """"Was it worth it?" The answers teach Spend Guard what this user regrets."""
    uid, now_dt = body.userId, rules.now()
    e = _event(uid, body.eventId)
    if e.get("choice") != "paid":
        raise rules.GuardError("Only payments you made can be rated.")
    if e.get("worth_it") is not None:
        raise rules.GuardError("You've already answered this one.")
    store.update_event(uid, e["id"], {"worth_it": body.worthIt, "rated_at": now_dt.isoformat()})
    return {"ok": True}


@app.post("/guard/wishlist-remove")
@persisted
async def wishlist_remove(body: WishBody):
    uid, now_dt = body.userId, rules.now()
    wish_id = rules.valid_id(body.wishId)
    item = next((x for x in store.wishes(uid) if x["id"] == wish_id), None)
    if item is None:
        raise rules.GuardError("That item wasn't found.")
    store.remove_wish(uid, wish_id)
    w = _wallet(uid, now_dt)
    if body.outcome == "dropped":
        _saved(w, item["amount"], now_dt)
        store.save_wallet(uid, w)
    # Buying runs the item through a normal check, from the QR code stored with it
    buy = {"qr": item["qr"], "amount": item["exact"]} if body.outcome == "bought" and item.get("qr") else None
    return {"wallet": _view(uid, w, now_dt), "buy": buy}


@app.post("/guard/settings")
@persisted
async def settings(body: SettingsBody):
    uid, now_dt = body.userId, rules.now()
    w = _wallet(uid, now_dt)
    s = w["settings"]
    if body.language is not None:
        if body.language not in LANGUAGES:
            raise rules.GuardError("That language isn't supported yet.")
        s["language"] = body.language
    if body.minCheck is not None:
        s["min_check"] = body.minCheck
    if body.maxPausesPerDay is not None:
        s["max_pauses_per_day"] = body.maxPausesPerDay
    if body.ownUpiId is not None and body.demo:
        raise rules.GuardError("In the demo, top-ups move pretend money only.")
    if body.ownUpiId is not None:
        upi = body.ownUpiId.strip()
        if upi and not rules.VPA.match(upi):
            raise rules.GuardError("That doesn't look like a UPI ID (name@bank).")
        s["own_upi_id"] = upi
    if body.ownName is not None:
        s["own_name"] = rules.clean_text(body.ownName, 40)
    store.save_wallet(uid, w)
    return _view(uid, w, now_dt)


@app.post("/guard/demo-reset")
@persisted
async def demo_reset(body: Body):
    """Starts this user's Spend Guard demo again. Their FinTwin data isn't touched."""
    store.reset(body.userId)
    if body.demo:
        _seed_demo(body.userId)
    now_dt = rules.now()
    return _view(body.userId, _wallet(body.userId, now_dt), now_dt)
