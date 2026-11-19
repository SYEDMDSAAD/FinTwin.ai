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
import hmac
import json
import logging
import os
import time
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
from store import make_store

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


class CheckBody(Body):
    qr: str = Field(max_length=2048)
    amount: str | float | int | None = None         # for QR codes without an amount


class OutcomeBody(Body):
    eventId: str = Field(max_length=64)
    choice: Literal["paid", "skipped", "wishlist"]
    amount: int | None = Field(default=None, gt=0)  # top-ups: which of the offered amounts


class TopupBody(Body):
    amount: int = Field(gt=0, le=200_000)
    reason: str = Field(default="", max_length=120)
    emergency: bool = False


class EventBody(Body):
    eventId: str = Field(max_length=64)


class RegretBody(EventBody):
    worthIt: bool


class PaydayBody(Body):
    salary: int = Field(gt=0, le=10_000_000)


class PlanBody(Body):
    planId: str = Field(max_length=64)


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
    sources = rules.rebalance_sources(wallet=w, finances=finances, now_dt=now_dt)
    if e["type"] == "scan":      # the overspent category can't pay for itself
        cat = (e.get("category") or "").lower()
        sources = [s for s in sources if not (s["kind"] == "category" and s["name"].lower() == cat)]
    return sources


def _brief(e: dict) -> dict:
    return {
        "id": e["id"], "type": e["type"], "at": e["at"], "amount": e.get("moved") or e["amount"],
        "category": e.get("category"), "payeeName": e.get("payee_name") or e.get("note") or "",
        "decision": e["decision"], "message": e.get("message", ""), "source": e["source"],
        "choice": e.get("choice"), "worthIt": e.get("worth_it"),
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
async def wallet(body: Body):
    now_dt = rules.now()
    return _view(body.userId, _wallet(body.userId, now_dt), now_dt)


@app.post("/guard/check")
async def check(body: CheckBody):
    """A scanned QR code, before paying: go, pause, or not enough money."""
    started, uid, now_dt = time.monotonic(), body.userId, rules.now()
    qr = rules.parse_upi(body.qr)
    # A QR code that carries an amount fixes it; otherwise the user types one
    exact = qr.am if qr.am is not None else rules.clean_amount(body.amount)
    w = _wallet(uid, now_dt)
    finances = await data.load(uid, body.toolToken)
    facts, untrusted, allowed = rules.scan_facts(qr=qr, amount=exact, wallet=w, finances=finances,
                                                 events=store.events(uid), now_dt=now_dt)
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
        "category": facts["category"], "payee": qr.pa, "payee_name": qr.pn[:60], "qr": qr.raw,
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
        if body.choice == "paid":
            if e["decision"] == "insufficient" or e["amount"] > w["balances"]["spending"]:
                raise rules.GuardError("Your spending account doesn't have enough for this. Ask for a top-up first.")
            w["balances"]["spending"] -= e["amount"]
            fields.update(paid_at=now_dt.isoformat(), paid_anyway=e["decision"] == "pause")
            # The merchant's own link, only ever rebuilt from the stored QR code
            out["link"] = rules.handoff_link(rules.parse_upi(e["qr"]), Decimal(e["exact"]))
            out["toRebalance"] = _over_by(e)
        elif body.choice == "skipped":
            if e["decision"] == "pause":
                w["saved_by_pausing"] = w.get("saved_by_pausing", 0) + e["amount"]
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


@app.post("/guard/topup")
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
async def rebalance(body: EventBody):
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
                     over_category=e.get("category") if e["type"] == "scan" else None)
    store.save_wallet(uid, w)
    store.update_event(uid, e["id"], {"rebalanced": True, "rebalanced_at": now_dt.isoformat()})
    return {"wallet": _view(uid, w, now_dt)}


@app.post("/guard/payday")
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
    plan = {"salary": body.salary, "bills": facts["bills"], **result, "source": source, "reason": reason,
            "model": agents.MODEL if source == "ai" else None, "ms": _ms(started),
            "created_at": now_dt.isoformat()}
    plan_id = store.save_plan(uid, plan)
    return {"planId": plan_id, "plan": {**plan, "id": plan_id}}


@app.post("/guard/approve-plan")
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
    return {"wallet": _view(uid, w, now_dt)}


@app.post("/guard/regret")
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
async def wishlist_remove(body: WishBody):
    uid, now_dt = body.userId, rules.now()
    wish_id = rules.valid_id(body.wishId)
    item = next((x for x in store.wishes(uid) if x["id"] == wish_id), None)
    if item is None:
        raise rules.GuardError("That item wasn't found.")
    store.remove_wish(uid, wish_id)
    w = _wallet(uid, now_dt)
    if body.outcome == "dropped":
        w["saved_by_pausing"] = w.get("saved_by_pausing", 0) + item["amount"]
        store.save_wallet(uid, w)
    # Buying runs the item through a normal check, from the QR code stored with it
    buy = {"qr": item["qr"], "amount": item["exact"]} if body.outcome == "bought" and item.get("qr") else None
    return {"wallet": _view(uid, w, now_dt), "buy": buy}


@app.post("/guard/settings")
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
async def demo_reset(body: Body):
    """Starts this user's Spend Guard demo again. Their FinTwin data isn't touched."""
    store.reset(body.userId)
    now_dt = rules.now()
    return _view(body.userId, _wallet(body.userId, now_dt), now_dt)
