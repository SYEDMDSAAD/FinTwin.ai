"""Spend Guard's rules: everything that must be right every time, in plain code.

The agents make the judgement calls: pause or not, how much to give, which
budget gives way. This module decides what they are allowed to say and do:

  - reads and checks the QR code; the payee only ever comes from it
  - works out every fact and number the agents see
  - the fast lane: essentials and small payments never wait on the AI
  - checks every agent answer, with a fixed-rule fallback when the AI is
    slow, wrong or down
  - builds UPI links: the merchant's QR link passed on unchanged, or a
    transfer to the user's own account. FinTwin never holds or moves money,
    and never uses "collect" requests (NPCI ended P2P collect on 1 Oct 2025).
"""
import math
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from urllib.parse import parse_qsl, quote, urlsplit
from zoneinfo import ZoneInfo

import grounding

IST = ZoneInfo("Asia/Kolkata")


def now() -> datetime:
    """The time in India. Tests replace this."""
    return datetime.now(IST)


class GuardError(ValueError):
    """A problem to show the user, as written (bad QR code, nothing to approve)."""


class AnswerRejected(ValueError):
    """An agent answer broke a rule. The reason is sent back to the agent to fix."""


# ── Constants ────────────────────────────────────────────────────────────────

MAX_AMOUNT = Decimal("200000")
VPA = re.compile(r"^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$")
_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

# Merchant category codes (the "mc" in a merchant QR) to FinTwin's categories
MCC_CATEGORY = {
    **dict.fromkeys(["5812", "5813", "5814"], "Food"),
    **dict.fromkeys(["5411", "5422", "5441", "5451", "5462", "5499"], "Groceries"),
    **dict.fromkeys(["5912", "8011", "8021", "8062", "8071", "8099"], "Health"),
    **dict.fromkeys(["4111", "4112", "4121", "4131", "5541", "5542"], "Transport"),
    **dict.fromkeys(["3000", "4511", "4722", "7011"], "Travel"),
    **dict.fromkeys(["4814", "4899", "4900"], "Bills"),
    **dict.fromkeys(["6513"], "Rent"),
    **dict.fromkeys(["8211", "8220", "8241", "8299"], "Education"),
    **dict.fromkeys(["7832", "7922", "7991", "7994", "7995"], "Entertainment"),
    **dict.fromkeys(["5311", "5399", "5651", "5661", "5691", "5699", "5732", "5734",
                     "5941", "5944", "5945", "5999"], "Shopping"),
}
# Never paused, never wait on the AI
# (with the other names FinTwin and imported statements use for the same things)
ESSENTIAL = {"Groceries", "Health", "Bills", "Rent", "Transport", "Education",
             "Housing", "Healthcare", "Medical", "Utilities", "Fuel"}
# Things that can sit on a 48-hour wishlist (not food at a counter)
WAITABLE = {"Shopping", "Entertainment", "Travel", "Other"}
# Betting and gambling: never the fast lane, and always paused, whatever the amount
ALWAYS_CHECK_MCC = {"7995"}

# Confirm-shaming is a banned dark pattern (CCPA dark-pattern guidelines, 2023)
_SHAMING = re.compile(
    r"\b(waste|wasting|wasteful|stupid|irresponsible|shame|ashamed|guilt|guilty|lazy|"
    r"foolish|reckless|careless|silly|idiot)\b", re.IGNORECASE)
_PERCENT = re.compile(r"(\d+(?:\.\d+)?)\s?%")
# "R3,500" (a model's slip for ₹, seen from Gemini) passed the figure check unseen, and
# "Rs 3,500" reads inconsistently. Both become "₹3,500" before the checks run.
_RUPEE_PREFIX = re.compile(r"(?<![A-Za-z])(?:Rs\.?|INR|R)\s?(?=\d)")
_LINKISH = re.compile(r"https?://|www\.|upi://|[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}", re.IGNORECASE)
# "450 रुपये", "450 రూపాయలు": rupees written out in the languages users can pick,
# which grounding.amounts (₹, Rs, INR, "rupees") would miss
_LOCAL_RUPEES = re.compile(r"(\d[\d,]*)\s*(?:रुपये|रुपए|रुपया|रु\.?|రూపాయలు|రూపాయి|రూ\.?|ரூபாய்|ரூ\.?|"
                           r"ರೂಪಾಯಿ|ರೂ\.?|രൂപ|টাকা)")


def valid_id(value) -> str:
    """Event, plan and wishlist ids from the browser, before they reach the store."""
    if not isinstance(value, str) or not _ID.match(value):
        raise GuardError("That item wasn't found.")
    return value


def inr(n: int) -> str:
    """₹1,23,456 — Indian digit grouping."""
    s = str(abs(int(n)))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups) + "," + tail
    return ("-" if int(n) < 0 else "") + "₹" + s


# ── Amounts and the QR code ──────────────────────────────────────────────────

def clean_amount(value) -> Decimal:
    if value is None or isinstance(value, bool):
        raise GuardError("Enter an amount in rupees.")
    try:
        d = Decimal(str(value).strip()).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        raise GuardError("Enter an amount in rupees.") from None
    if d <= 0:
        raise GuardError("Enter an amount above ₹0.")
    if d > MAX_AMOUNT:
        raise GuardError("That's above the most Spend Guard checks in one payment (₹2,00,000).")
    return d


def rupees(d: Decimal) -> int:
    return int(d.to_integral_value(rounding=ROUND_HALF_UP))


@dataclass(frozen=True)
class UpiQr:
    raw: str          # the link exactly as scanned
    pa: str           # payee UPI ID: the only place a payee ever comes from
    pn: str           # payee name, untrusted text
    mc: str           # merchant category code, "" for a person
    am: Decimal | None
    tn: str           # note, untrusted text


def clean_text(s: str, limit: int) -> str:
    return "".join(ch for ch in s if ch.isprintable()).strip()[:limit]


def parse_upi(raw) -> UpiQr:
    """A UPI payment link (upi://pay?...) per NPCI's deep-linking format, or GuardError."""
    not_upi = "That isn't a UPI payment QR code."
    if not isinstance(raw, str) or not raw.strip() or len(raw) > 2048:
        raise GuardError(not_upi)
    raw = raw.strip()
    parts = urlsplit(raw)
    if parts.scheme.lower() != "upi" or parts.netloc.lower() != "pay":
        raise GuardError(not_upi)
    try:
        pairs = parse_qsl(parts.query, keep_blank_values=True, max_num_fields=40)
    except ValueError:
        raise GuardError(not_upi) from None
    params: dict[str, str] = {}
    for k, v in pairs:
        k = k.lower()
        # Two payees or two amounts: UPI apps disagree on which one counts, so refuse
        if k in params and k in ("pa", "am", "cu"):
            raise GuardError("This QR code looks damaged. Ask the shop for another one.")
        params.setdefault(k, v)
    pa = params.get("pa", "").strip()
    if not VPA.match(pa):
        raise GuardError("This QR code has no valid UPI ID to pay.")
    if (params.get("cu", "").strip().upper() or "INR") != "INR":
        raise GuardError("Only payments in rupees are supported.")
    mc = params.get("mc", "").strip()
    if not re.fullmatch(r"\d{4}", mc):
        mc = ""
    am = clean_amount(params["am"]) if params.get("am", "").strip() else None
    return UpiQr(raw=raw, pa=pa, pn=clean_text(params.get("pn", ""), 99), mc=mc, am=am,
                 tn=clean_text(params.get("tn", ""), 80))


def category_for(qr: UpiQr) -> str:
    return MCC_CATEGORY.get(qr.mc, "Other")


# Made-up sample shops: never open a UPI app, never become a FinTwin transaction
SAMPLE_SUFFIX = "@sample"


def is_sample(qr: UpiQr) -> bool:
    return qr.pa.lower().endswith(SAMPLE_SUFFIX)


def choose_category(qr: UpiQr, fintwin: tuple[str, str] | None) -> tuple[str, str]:
    """A scanned payee's category, and how it was chosen. The user's own correction
    in FinTwin comes first, then the merchant type the QR code carries, then
    FinTwin's categoriser, else Other. Betting is decided by the merchant code
    alone (ALWAYS_CHECK_MCC), so no category can take it out of the check."""
    if fintwin and fintwin[1] == "LEARNED":
        return fintwin
    if qr.mc in MCC_CATEGORY:
        return MCC_CATEGORY[qr.mc], "MERCHANT_CODE"
    if fintwin and fintwin[0] != "Other" and fintwin[1] != "NONE":
        return fintwin
    return "Other", "NONE"


# ── A payee Spend Guard can't place: ask the user what it's for ──────────────

# What the user can say a payment is for, when FinTwin can't tell who is being
# paid. Each option maps to a category here, in code: the model never picks
# one, so "Rent" goes straight through as an essential and nothing a reason
# says can change how a payment is categorised.
REASON_CATEGORIES = {
    "Food": "Food",
    "Groceries": "Groceries",
    "Shopping": "Shopping",
    "Bills": "Bills",
    "Rent": "Rent",
    "Transport": "Transport",
    "Travel": "Travel",
    "Health": "Health",
    "Education": "Education",
    "Entertainment": "Entertainment",
    "Paying someone back": "People",
    "Something else": "Other",
}
REASON_QUESTION = "Spend Guard can't tell who this is or what it's for. What's this payment for?"
_REASON_IDENTIFIERS = re.compile(
    r"https?://\S+|www\.\S+|upi://\S+|[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}|(?<!\d)\d{10,}(?!\d)", re.IGNORECASE)


def payee_unknown(category: str, source: str) -> bool:
    """FinTwin can't tell what this payment is for: a person, or a payee nothing
    could place (no correction, no merchant code, nothing the categoriser knows)."""
    return source == "NONE" or category == "People"


def scan_category(qr: UpiQr, fintwin: tuple[str, str] | None,
                  purpose: str | None) -> tuple[str, str, bool, str | None]:
    """The category a scan is checked under, how it was chosen, whether FinTwin
    couldn't place the payee, and the user's purpose when that counts (an
    unknown payee and an answer from the fixed list; anything else is ignored)."""
    category, source = choose_category(qr, fintwin)
    unknown = payee_unknown(category, source) and qr.mc not in ALWAYS_CHECK_MCC
    purpose = purpose if unknown and purpose in REASON_CATEGORIES else None
    if purpose:
        category, source = REASON_CATEGORIES[purpose], "USER_REASON"
    return category, source, unknown, purpose


def clean_reason(text) -> str:
    """The user's own words about a payment: printable, at most 120 characters,
    with links, UPI IDs and phone or account numbers taken out. It goes to the
    model only inside the UNTRUSTED block, like a top-up reason."""
    return _REASON_IDENTIFIERS.sub("[removed]", clean_text(str(text or ""), 120)).strip()


# ── UPI links: the only way money moves, and the user's own app moves it ─────

def handoff_link(qr: UpiQr, amount: Decimal) -> str:
    """The merchant's own link, unchanged except for adding the amount when the QR has none."""
    if qr.am is not None:
        return qr.raw
    amt = f"{amount:.2f}"
    if re.search(r"[?&]am=(?=&|$)", qr.raw, re.IGNORECASE):     # a blank am= is filled in
        return re.sub(r"([?&])am=(?=&|$)", lambda m: f"{m.group(1)}am={amt}", qr.raw,
                      count=1, flags=re.IGNORECASE)
    # parse_upi only accepts links with a query (pa is required), so "?" is there
    link = qr.raw + ("" if qr.raw.endswith(("?", "&")) else "&") + f"am={amt}"
    if not re.search(r"[?&]cu=", qr.raw, re.IGNORECASE):
        link += "&cu=INR"
    return link


def self_transfer_link(settings: dict, amount: int) -> str | None:
    """A transfer to the user's own spending account, or None until they've saved its UPI ID."""
    upi = settings.get("own_upi_id") or ""
    if amount <= 0 or not VPA.match(upi):
        return None
    name = settings.get("own_name") or "Me"
    return (f"upi://pay?pa={quote(upi, safe='@.-_')}&pn={quote(name)}&am={int(amount)}.00"
            f"&cu=INR&tn={quote('FinTwin top-up')}")


def mask_upi(upi: str) -> str:
    if not upi or "@" not in upi:
        return ""
    name, handle = upi.split("@", 1)
    return (name[:2] + "***@" + handle) if len(name) > 2 else ("***@" + handle)


# ── A payment handed to the UPI app, waiting to be confirmed ─────────────────

# Tapping Pay only opens the UPI app; the money hasn't moved until the user says
# so or the payment turns up in their transactions. After this many days with
# neither, it counts as not paid.
PENDING_DAYS = 3


def pending_match(event: dict, rows: list[dict]) -> bool:
    """A transaction for this payment: the same amount (to the rupee), on the
    day it was handed over or within PENDING_DAYS after."""
    day = local(event["opened_at"]).date()
    want = Decimal(event["exact"])
    for r in rows:
        try:
            d, amt = date.fromisoformat(str(r["date"])[:10]), abs(Decimal(str(r["amount"])))
        except (KeyError, ValueError, ArithmeticError):
            continue
        if day <= d <= day + timedelta(days=PENDING_DAYS) and abs(amt - want) <= 1:
            return True
    return False


def pending_expired(event: dict, now_dt: datetime) -> bool:
    return now_dt - local(event["opened_at"]) > timedelta(days=PENDING_DAYS)


# ── Time, week and history ───────────────────────────────────────────────────

def is_late(dt: datetime) -> bool:
    return dt.hour >= 22 or dt.hour < 5


def local(iso: str) -> datetime:
    return datetime.fromisoformat(iso).astimezone(IST)


def days_to_allowance(wallet: dict, today: date) -> int:
    return max(0, (date.fromisoformat(wallet["next_allowance"]) - today).days)


def roll_week(wallet: dict, today: date) -> bool:
    """A new week has started: this week's allowance moves in (pretend balances)."""
    changed = False
    while today >= date.fromisoformat(wallet["next_allowance"]):
        base = wallet["weekly"]
        plan = wallet.get("plan")
        if plan and plan.get("week", 0) + 1 < len(plan.get("weekly", [])):
            plan["week"] = plan.get("week", 0) + 1
            base = plan["weekly"][plan["week"]]
        amount = max(0, min(base - wallet.get("next_allowance_cut", 0), wallet["balances"]["main"]))
        wallet["balances"]["main"] -= amount
        wallet["balances"]["spending"] += amount
        wallet["next_allowance_cut"] = 0
        start = date.fromisoformat(wallet["next_allowance"])
        wallet["week_start"] = start.isoformat()
        wallet["next_allowance"] = (start + timedelta(days=7)).isoformat()
        changed = True
    return changed


def history_facts(events: list[dict], *, payee: str | None, category: str | None,
                  now_dt: datetime, week_start: date) -> dict:
    """What the user's own history says, from Spend Guard's decisions (newest first)."""
    today, month = now_dt.date(), now_dt.strftime("%Y-%m")
    visits = pauses_today = regrets_category = regrets_late = 0
    topups_month = emergencies_month = late_topups_regretted = 0
    for e in events:
        at = local(e["at"])
        if e.get("type") == "scan":
            if payee and e.get("payee") == payee and e.get("choice") == "paid" and at.date() >= week_start:
                visits += 1
            if e.get("decision") == "pause" and at.date() == today:
                pauses_today += 1
        if e.get("type") == "topup" and at.strftime("%Y-%m") == month:
            if e.get("decision") == "emergency":
                emergencies_month += 1
            elif e.get("choice") == "paid":
                topups_month += 1
        if e.get("worth_it") is False:
            if category and e.get("category") == category:
                regrets_category += 1
            if is_late(at):
                regrets_late += 1
                if e.get("type") == "topup":
                    late_topups_regretted += 1
    paused = [e for e in events if e.get("type") == "scan" and e.get("decision") == "pause"][:5]
    return {
        "visits_here_this_week": visits,
        "pauses_today": pauses_today,
        "paid_anyway_of_last_5_pauses": sum(1 for e in paused if e.get("choice") == "paid"),
        "regrets_same_category": regrets_category,
        "regrets_late_night": regrets_late,
        "topups_this_month": topups_month,
        "emergencies_this_month": emergencies_month,
        "late_night_topups_regretted": late_topups_regretted,
    }


def main_goal(finances):
    return next((g for g in finances.goals if g.monthly > 0), None)


def delay_days(amount: int, goal) -> int:
    return max(1, math.ceil(amount / (goal.monthly / 30)))


def essentials_weekly(finances) -> int:
    """What a week of groceries, transport and health needs, from the user's budgets."""
    monthly = sum(b.limit for b in finances.budgets if b.category in {"Groceries", "Transport", "Health"})
    return round(monthly / 4.33) if monthly else 1500


def figures(obj) -> set[int]:
    """Every whole number in the facts: the only ₹ figures and percentages an answer may quote."""
    out: set[int] = set()
    if isinstance(obj, bool):
        return out
    if isinstance(obj, int):
        out.add(abs(obj))
    elif isinstance(obj, float):
        out.add(abs(round(obj)))
    elif isinstance(obj, dict):
        for v in obj.values():
            out |= figures(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            out |= figures(v)
    return out


# ── Checking what an agent wrote ─────────────────────────────────────────────

def clean_message(text, allowed: set[int], limit: int = 240) -> str:
    text = _RUPEE_PREFIX.sub("₹", " ".join(str(text or "").split()))
    if len(text) > limit:
        raise AnswerRejected(f"the message is longer than {limit} characters")
    if _SHAMING.search(text):
        raise AnswerRejected("the message shames or blames the user; keep it kind and neutral")
    if _LINKISH.search(text):
        raise AnswerRejected("the message must not contain links or UPI IDs")
    quoted = grounding.amounts(text) | {int(n.replace(",", "")) for n in _LOCAL_RUPEES.findall(text)}
    invented = quoted - allowed
    if invented:
        raise AnswerRejected(f"the message uses rupee amounts that aren't in FACTS: {sorted(invented)}")
    pcts = {round(float(p)) for p in _PERCENT.findall(text)}
    if pcts - allowed:
        raise AnswerRejected(f"the message uses percentages that aren't in FACTS: {sorted(pcts - allowed)}")
    return text


# ── Scan: pause before paying ────────────────────────────────────────────────

def scan_facts(*, qr: UpiQr, amount: Decimal, wallet: dict, finances, events: list[dict],
               now_dt: datetime, category: str | None = None, payee_known: bool = True,
               purpose: str | None = None, reason: str = "") -> tuple[dict, dict, set[int]]:
    """The facts the agent sees, the untrusted text, and the figures a message may quote."""
    amt = rupees(amount)
    category = category or category_for(qr)
    month = now_dt.strftime("%Y-%m")
    adj = wallet.get("adjustments", {}).get(month, {})
    budget = None
    b = finances.budget(category)
    if b and b.limit > 0:
        limit = max(0, b.limit + adj.get(b.category, 0))
        left_after = limit - b.spent - amt
        budget = {"limit": limit, "spent": b.spent, "left_after": left_after,
                  "used_after_pct": round((b.spent + amt) * 100 / limit) if limit else 100,
                  "over_after": left_after < 0}
    week_left = wallet["balances"]["spending"]
    goal = main_goal(finances)
    week_start = date.fromisoformat(wallet["week_start"])
    facts = {
        "mode": "scan",
        "amount": amt,
        "category": category,
        "essential": category in ESSENTIAL,
        "budget": budget,
        "week": {"left": week_left, "left_after": week_left - amt,
                 "days_to_allowance": days_to_allowance(wallet, now_dt.date()),
                 "share_of_left_pct": round(amt * 100 / week_left) if week_left > 0 else 100},
        "goal": {"name": goal.title, "delay_days": delay_days(amt, goal)} if goal else None,
        "time": {"local": now_dt.strftime("%H:%M"), "weekday": now_dt.strftime("%A"),
                 "late_night": is_late(now_dt)},
        "history": history_facts(events, payee=qr.pa, category=category, now_dt=now_dt, week_start=week_start),
        "payee_kind": "merchant" if qr.mc else "person",
        "betting": qr.mc in ALWAYS_CHECK_MCC,
        "language": wallet["settings"].get("language", "English"),
        # When FinTwin couldn't place the payee, what the user said it's for:
        # purpose is one of REASON_CATEGORIES (picked in the app, so it's a fact)
        "payee_known": payee_known,
        "purpose": purpose if purpose in REASON_CATEGORIES else None,
    }
    # A person's name and note stay out of the model; a shop's name is public
    untrusted = {"shop_name": qr.pn, "note": qr.tn} if qr.mc else {"shop_name": "", "note": ""}
    if reason:
        untrusted["reason"] = reason          # the user's own words: data, never instructions
    return facts, untrusted, figures(facts)


def fast_lane(facts: dict, qr: UpiQr, settings: dict) -> str | None:
    """Why this payment skips the AI, or None."""
    if qr.mc in ALWAYS_CHECK_MCC:
        return None
    if facts["essential"]:
        return "essential"
    if facts["amount"] < settings.get("min_check", 100):
        return "small"
    if facts["history"]["pauses_today"] >= settings.get("max_pauses_per_day", 3):
        return "pause_limit"      # no nagging: Spend Guard stops pausing for the day
    return None


def insufficient_message(facts: dict) -> str:
    return (f"Your spending account has {inr(facts['week']['left'])}, so your bank would decline this "
            f"{inr(facts['amount'])} payment. Ask for a top-up if you need it.")


def check_scan(answer, facts: dict, allowed: set[int]) -> dict:
    decision = getattr(answer, "decision", None)
    if decision not in ("go", "pause"):
        raise AnswerRejected("decision must be go or pause")
    if decision == "go" and facts.get("betting"):
        raise AnswerRejected("a betting payment always pauses, whatever the amount")
    message = clean_message(getattr(answer, "message", ""), allowed)
    if decision == "pause" and not message:
        raise AnswerRejected("a pause needs a message that names the trade-off")
    return {"decision": decision,
            "show_wishlist": bool(getattr(answer, "show_wishlist", False)) and decision == "pause"
                             and facts["category"] in WAITABLE,
            "message": message if decision == "pause" else ""}


def fallback_scan(facts: dict) -> dict:
    """Fixed rules when the AI is slow, wrong or down: pause on two signs or more."""
    signs = []
    b = facts["budget"]
    if b and b["over_after"]:
        signs.append("over_budget")
    if facts["time"]["late_night"]:
        signs.append("late_night")
    if facts["history"]["visits_here_this_week"] >= 3:
        signs.append("repeat")
    if facts["week"]["share_of_left_pct"] >= 40:
        signs.append("big")
    if facts["history"]["regrets_same_category"] >= 1:
        signs.append("regret")
    if len(signs) < 2 and not facts.get("betting"):
        return {"decision": "go", "show_wishlist": False, "message": ""}
    if facts.get("betting"):
        first = f"This {inr(facts['amount'])} payment is to a betting merchant."
    elif "over_budget" in signs:
        first = f"This takes your {facts['category']} budget {inr(-b['left_after'])} over."
    elif "big" in signs:
        first = f"{inr(facts['amount'])} is {facts['week']['share_of_left_pct']}% of what's left this week."
    elif "repeat" in signs:
        first = f"You've been here {facts['history']['visits_here_this_week']} times this week."
    else:
        first = "It's late, and late-night spends are the ones people regret most."
    goal = facts.get("goal")
    second = (f" It would push {goal['name']} back about {goal['delay_days']} "
              f"day{'s' if goal['delay_days'] != 1 else ''}.") if goal else ""
    return {"decision": "pause", "show_wishlist": facts["category"] in WAITABLE, "message": first + second}


# ── Top-up: asking for more ──────────────────────────────────────────────────

def topup_facts(*, amount: int, wallet: dict, finances, events: list[dict], now_dt: datetime) -> tuple[dict, set[int]]:
    buffer = wallet["buffer"]
    goal = main_goal(finances)
    facts = {
        "mode": "topup",
        "requested": amount,
        "buffer": buffer,
        "buffer_left_after": buffer - amount,
        "week": {"left": wallet["balances"]["spending"], "weekly_allowance": wallet["weekly"],
                 "days_to_allowance": days_to_allowance(wallet, now_dt.date())},
        "goal": {"name": goal.title, "delay_days": delay_days(amount, goal)} if goal else None,
        "time": {"local": now_dt.strftime("%H:%M"), "weekday": now_dt.strftime("%A"),
                 "late_night": is_late(now_dt)},
        "history": history_facts(events, payee=None, category=None, now_dt=now_dt,
                                 week_start=date.fromisoformat(wallet["week_start"])),
        "language": wallet["settings"].get("language", "English"),
    }
    return facts, figures(facts)


def emergency_refusal(facts: dict, settings: dict) -> str | None:
    """Why an emergency top-up can't skip the questions, or None if it can."""
    if facts["history"]["emergencies_this_month"] >= settings.get("emergency_per_month", 2):
        return "You've used this month's emergency top-ups."
    if facts["requested"] > settings.get("emergency_max", 1500):
        return f"Emergency top-ups go up to {inr(settings.get('emergency_max', 1500))}."
    if facts["requested"] > facts["buffer"]:
        return f"{inr(facts['buffer'])} is the most you can move without touching bill money."
    return None


def check_topup(answer, facts: dict, allowed: set[int]) -> dict:
    decision = getattr(answer, "decision", None)
    if decision not in ("approve", "approve_less", "wait", "wishlist"):
        raise AnswerRejected("decision must be approve, approve_less, wait or wishlist")
    requested, buffer = facts["requested"], facts["buffer"]
    suggested = None
    if decision == "approve_less":
        s = getattr(answer, "suggested_amount", None)
        if not isinstance(s, int) or isinstance(s, bool) or s <= 0 or s >= requested:
            raise AnswerRejected("approve_less needs a whole-rupee suggested_amount below the request")
        suggested = s
    message = clean_message(getattr(answer, "message", ""), allowed | ({suggested} if suggested else set()))
    if not message:
        raise AnswerRejected("the message can't be empty")
    # The buffer is a hard limit, whatever the agent said: bill money never moves
    limit = (suggested if decision == "approve_less" else requested) if decision in ("approve", "approve_less") else 0
    if limit > buffer:
        return clamp_to_buffer(facts)
    return {"decision": decision, "suggested_amount": suggested, "message": message}


def clamp_to_buffer(facts: dict) -> dict:
    buffer = facts["buffer"]
    if buffer <= 0:
        return {"decision": "wait", "suggested_amount": None,
                "message": f"Your buffer is used up, so more money comes with your allowance in "
                           f"{facts['week']['days_to_allowance']} days."}
    return {"decision": "approve_less", "suggested_amount": buffer,
            "message": f"{inr(buffer)} is the most you can move without touching bill money."}


def fallback_topup(facts: dict) -> dict:
    requested, buffer = facts["requested"], facts["buffer"]
    if requested > buffer:
        return clamp_to_buffer(facts)
    if facts["time"]["late_night"] and facts["history"]["late_night_topups_regretted"] >= 1:
        return {"decision": "wait", "suggested_amount": None,
                "message": "It's late, and you've regretted late-night top-ups before. Wait 10 minutes, then decide."}
    return {"decision": "approve", "suggested_amount": None,
            "message": f"{inr(requested)} moves to your spending account, and your buffer keeps "
                       f"{inr(buffer - requested)}."}


def emergency_message(facts: dict) -> str:
    return f"Emergency top-up: {inr(facts['requested'])} moves now, no questions asked."


# ── Rebalance: where an override's money comes from ──────────────────────────

def next_month(now_dt: datetime) -> str:
    y, m = now_dt.year, now_dt.month
    return f"{y + (m == 12)}-{m % 12 + 1:02d}"


# Next month's everyday budgets can give up to this share, so one overspend
# never empties them
NEXT_MONTH_SHARE = 0.5


def rebalance_sources(*, wallet: dict, finances, now_dt: datetime, allow_goals: bool = False) -> list[dict]:
    """Where an overspend can come from: this month's unspent budgets, next
    week's allowance, then next month's everyday budgets. Goal savings are
    locked (protected) unless the user chose to let them give."""
    month = now_dt.strftime("%Y-%m")
    adj = wallet.get("adjustments", {}).get(month, {})
    sources = []
    for b in finances.budgets:
        limit = b.limit + adj.get(b.category, 0)
        sources.append({"kind": "category", "name": b.category, "room": max(0, limit - b.spent),
                        "locked": b.category in ESSENTIAL})
    next_room = max(0, wallet["weekly"] - wallet.get("next_allowance_cut", 0) - essentials_weekly(finances))
    sources.append({"kind": "next_allowance", "name": "Next week's allowance", "room": next_room, "locked": False})
    following = wallet.get("adjustments", {}).get(next_month(now_dt), {})
    everyday = sum(max(0, b.limit + following.get(b.category, 0)) for b in finances.budgets if b.category not in ESSENTIAL)
    already = -sum(v for k, v in following.items() if not k.startswith("goal:") and v < 0)
    sources.append({"kind": "next_month", "name": "Next month's budgets",
                    "room": max(0, int(everyday * NEXT_MONTH_SHARE) - already), "locked": False})
    for g in finances.goals:
        if g.monthly > 0:
            sources.append({"kind": "goal", "name": g.title,
                            "room": max(0, g.monthly + adj.get("goal:" + g.title, 0)), "locked": not allow_goals})
    return sources


def check_cuts(answer, amount: int, sources: list[dict], allowed: set[int]) -> tuple[list[dict], str]:
    cuts = list(getattr(answer, "cuts", None) or [])
    if not cuts:
        raise AnswerRejected("give at least one cut")
    if len(cuts) > 3:
        raise AnswerRejected("use at most 3 cuts")
    by_key = {(s["kind"], s["name"].lower()): s for s in sources}
    seen, out, total = set(), [], 0
    for c in cuts:
        key = (getattr(c, "kind", ""), str(getattr(c, "name", "")).strip().lower())
        s = by_key.get(key)
        if s is None:
            raise AnswerRejected(f"'{getattr(c, 'name', '')}' isn't one of the sources in FACTS")
        if s["locked"]:
            raise AnswerRejected(f"{s['name']} is locked: essentials and bills are never cut")
        if key in seen:
            raise AnswerRejected(f"{s['name']} is used twice")
        a = getattr(c, "amount", None)
        if not isinstance(a, int) or isinstance(a, bool) or a <= 0:
            raise AnswerRejected("every cut needs a whole-rupee amount above 0")
        if a > s["room"]:
            raise AnswerRejected(f"{s['name']} only has {inr(s['room'])} of room")
        seen.add(key)
        total += a
        out.append({"kind": s["kind"], "name": s["name"], "amount": a})
    if total != amount:
        raise AnswerRejected(f"the cuts add up to {inr(total)}, not {inr(amount)}")
    message = clean_message(getattr(answer, "message", ""), allowed | {c["amount"] for c in out})
    return out, message


def proportional_cuts(amount: int, sources: list[dict]) -> list[dict]:
    """Fallback: spread the amount over categories with room, then next week's
    allowance, then next month's budgets, and goals only if they're unlocked."""
    tiers = {"category": 0, "next_allowance": 1, "next_month": 2, "goal": 3}
    usable = [s for s in sources if not s["locked"] and s["room"] > 0]
    remaining, cuts = amount, []
    for tier in (0, 1, 2, 3):
        group = [s for s in usable if tiers[s["kind"]] == tier]
        room = sum(s["room"] for s in group)
        if remaining <= 0 or room <= 0:
            continue
        take = min(remaining, room)
        shares = [take * s["room"] // room for s in group]
        spare = take - sum(shares)
        for i, s in enumerate(group):
            add = min(spare, s["room"] - shares[i])
            shares[i] += add
            spare -= add
        cuts += [{"kind": s["kind"], "name": s["name"], "amount": a} for s, a in zip(group, shares) if a > 0]
        remaining -= take
    if remaining > 0:
        raise GuardError("There's no room left in this month's or next month's plan to cover it.")
    return cuts


def cuts_message(cuts: list[dict]) -> str:
    # Mid-sentence, the allowance reads in lower case ("from next week's allowance")
    parts = [f"{inr(c['amount'])} from {_sentence_name(c)}" for c in cuts]
    joined = parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]
    return f"To keep this month on track: {joined}."


def _sentence_name(cut: dict) -> str:
    if cut["kind"] == "next_allowance":
        return "next week's allowance"
    if cut["kind"] == "next_month":
        return "next month's budgets"
    return cut["name"]


def apply_cuts(wallet: dict, cuts: list[dict], month: str, over_category: str | None = None,
               finances=None, following: str | None = None) -> None:
    """Move the plan: the cuts shrink their sources, and an overspent category
    grows to match. A cut from next month's budgets is spread over its everyday
    budgets in proportion to their size."""
    adj = wallet.setdefault("adjustments", {}).setdefault(month, {})
    if over_category:
        adj[over_category] = adj.get(over_category, 0) + sum(c["amount"] for c in cuts)
    for c in cuts:
        if c["kind"] == "category":
            adj[c["name"]] = adj.get(c["name"], 0) - c["amount"]
        elif c["kind"] == "goal":
            key = "goal:" + c["name"]
            adj[key] = adj.get(key, 0) - c["amount"]
        elif c["kind"] == "next_allowance":
            # That money stays in the main account next week, so it refills the buffer now
            wallet["next_allowance_cut"] = wallet.get("next_allowance_cut", 0) + c["amount"]
            wallet["buffer"] += c["amount"]
        elif c["kind"] == "next_month" and finances is not None and following:
            nxt = wallet["adjustments"].setdefault(following, {})
            limits = {b.category: max(0, b.limit + nxt.get(b.category, 0))
                      for b in finances.budgets if b.category not in ESSENTIAL}
            total = sum(limits.values())
            if total <= 0:
                raise GuardError("Next month has no everyday budgets to take it from.")
            shares = {k: c["amount"] * v // total for k, v in limits.items()}
            spare = c["amount"] - sum(shares.values())
            for k in sorted(limits, key=limits.get, reverse=True):
                if spare <= 0:
                    break
                shares[k] += 1
                spare -= 1
            for k, a in shares.items():
                if a:
                    nxt[k] = nxt.get(k, 0) - a


# ── Payday: splitting the salary ─────────────────────────────────────────────

def payday_facts(*, salary: int, wallet: dict, finances) -> tuple[dict, set[int]]:
    sips = max(0, int(getattr(finances, "sip_monthly", 0) or 0))
    bills = sum(b.limit for b in finances.budgets if b.category in {"Rent", "Bills"}) + sips
    if salary < bills:
        what = "rent, bills and SIPs" if sips else "rent and bills"
        raise GuardError(f"That's less than the {inr(bills)} of {what} in your budgets.")
    facts = {
        "mode": "payday",
        "salary": salary,
        "bills": bills,            # rent and bills budgets, plus SIPs: all leave before spending
        "sips": sips,
        "after_bills": salary - bills,
        "essentials_weekly_floor": essentials_weekly(finances),
        "current_weekly_allowance": wallet["weekly"],
        "language": wallet["settings"].get("language", "English"),
    }
    return facts, figures(facts)


def check_plan(answer, facts: dict, goal_names: list[str], allowed: set[int]) -> dict:
    known = {n.lower(): n for n in goal_names}
    goals, seen = [], set()
    for gs in list(getattr(answer, "goals", None) or []):
        name = str(getattr(gs, "goal", "")).strip()
        if name.lower() not in known:
            raise AnswerRejected(f"'{name}' isn't one of the user's goals")
        if name.lower() in seen:
            raise AnswerRejected(f"{name} is listed twice")
        a = getattr(gs, "amount", None)
        if not isinstance(a, int) or isinstance(a, bool) or a < 0:
            raise AnswerRejected("goal amounts must be whole rupees, 0 or more")
        seen.add(name.lower())
        goals.append({"goal": known[name.lower()], "amount": a})
    buffer = getattr(answer, "buffer", None)
    if not isinstance(buffer, int) or isinstance(buffer, bool) or buffer < 0:
        raise AnswerRejected("buffer must be whole rupees, 0 or more")
    weekly = list(getattr(answer, "weekly", None) or [])
    floor = facts["essentials_weekly_floor"]
    if len(weekly) != 4 or any(not isinstance(w, int) or isinstance(w, bool) for w in weekly):
        raise AnswerRejected("weekly must be exactly four whole-rupee amounts")
    if min(weekly) < floor:
        raise AnswerRejected(f"every week needs at least {inr(floor)} for essentials")
    total = facts["bills"] + sum(g["amount"] for g in goals) + buffer + sum(weekly)
    if total != facts["salary"]:
        raise AnswerRejected(f"the plan adds up to {inr(total)}, not the salary of {inr(facts['salary'])}")
    numbers = {g["amount"] for g in goals} | {buffer, sum(weekly), sum(g["amount"] for g in goals)} | set(weekly)
    message = clean_message(getattr(answer, "message", ""), allowed | numbers, limit=300)
    return {"goals": goals, "buffer": buffer, "weekly": weekly, "message": message}


def fallback_plan(facts: dict, goals: list) -> dict:
    """Bills first; goals get up to their monthly targets within 30% of what's left; a buffer; four even weeks."""
    rest = facts["after_bills"]
    floor = facts["essentials_weekly_floor"]
    buffer = round(rest * 0.08)
    goal_pot = max(0, min(sum(g.monthly for g in goals), round(rest * 0.30), rest - buffer - 4 * floor))
    target = sum(g.monthly for g in goals) or 1
    shares = [goal_pot * g.monthly // target for g in goals]
    if shares:
        shares[0] += goal_pot - sum(shares)
    left = rest - buffer - goal_pot
    if left < 4 * floor:                    # not enough for essentials: the buffer gives way first
        buffer = max(0, buffer - (4 * floor - left))
        left = rest - buffer - goal_pot
    week = left // 4
    weekly = [week, week, week, left - 3 * week]
    return {"goals": [{"goal": g.title, "amount": a} for g, a in zip(goals, shares)],
            "buffer": buffer, "weekly": weekly,
            "message": f"{'Rent, bills and SIPs' if facts.get('sips') else 'Bills'} of {inr(facts['bills'])} come out first. {inr(goal_pot)} goes to your goals, "
                       f"{inr(buffer)} stays as a buffer, and about {inr(week)} a week is yours to spend."}
