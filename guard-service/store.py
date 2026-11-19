"""Where Spend Guard keeps each user's wallet, decisions, wishlist and plans.

GUARD_STORE=firestore uses Firestore (users/{id} holds the wallet, with
events, wishlist and plans as subcollections). Anything else keeps it in
memory, which is fine for a laptop and tests and is lost on restart.

Both stores have the same methods, so the rest of the service never knows
which one it has. Ids from the browser are checked by the caller
(rules.valid_id) before they reach either store.

Prototype note: the wallet's balances are pretend ("demo": True). FinTwin
can't see live bank balances; in real use the user's bank enforces the limit.
"""
import copy
import os
import uuid
from datetime import date, timedelta


def _monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def default_wallet(today: date) -> dict:
    week_start = _monday(today)
    return {
        "demo": True,
        "balances": {"main": 30000, "spending": 5000},
        # Part of the main account free for top-ups; the rest is bill money
        "buffer": 3500,
        "weekly": 5000,
        "week_start": week_start.isoformat(),
        "next_allowance": (week_start + timedelta(days=7)).isoformat(),
        "next_allowance_cut": 0,
        "saved_by_pausing": 0,
        "adjustments": {},          # {"2026-11": {"Food": -450, "goal:Goa trip": -400}}
        "plan": None,
        "settings": {
            "language": "English",
            "min_check": 100,           # payments below this skip the agent
            "max_pauses_per_day": 3,    # so Spend Guard never nags
            "emergency_per_month": 2,
            "emergency_max": 1500,
            "own_upi_id": "",           # the user's spending account; never sent to the model
            "own_name": "",
        },
    }


class MemoryStore:
    def __init__(self):
        self._users: dict[str, dict] = {}

    def _user(self, uid) -> dict:
        return self._users.setdefault(str(uid), {"wallet": None, "events": {}, "wishlist": {}, "plans": {}})

    def wallet(self, uid, today: date) -> dict:
        u = self._user(uid)
        if u["wallet"] is None:
            u["wallet"] = default_wallet(today)
        return copy.deepcopy(u["wallet"])

    def save_wallet(self, uid, wallet: dict) -> None:
        self._user(uid)["wallet"] = copy.deepcopy(wallet)

    def add_event(self, uid, event: dict) -> str:
        eid = uuid.uuid4().hex[:20]
        self._user(uid)["events"][eid] = {**copy.deepcopy(event), "id": eid}
        return eid

    def event(self, uid, eid: str) -> dict | None:
        e = self._user(uid)["events"].get(eid)
        return copy.deepcopy(e) if e else None

    def update_event(self, uid, eid: str, fields: dict) -> None:
        self._user(uid)["events"][eid].update(copy.deepcopy(fields))

    def events(self, uid, limit: int = 200) -> list[dict]:
        rows = sorted(self._user(uid)["events"].values(), key=lambda e: e.get("at", ""), reverse=True)
        return copy.deepcopy(rows[:limit])

    def add_wish(self, uid, item: dict) -> str:
        wid = uuid.uuid4().hex[:20]
        self._user(uid)["wishlist"][wid] = {**copy.deepcopy(item), "id": wid}
        return wid

    def wishes(self, uid) -> list[dict]:
        return sorted(copy.deepcopy(list(self._user(uid)["wishlist"].values())), key=lambda w: w.get("added_at", ""))

    def remove_wish(self, uid, wid: str) -> bool:
        return self._user(uid)["wishlist"].pop(wid, None) is not None

    def save_plan(self, uid, plan: dict) -> str:
        pid = uuid.uuid4().hex[:20]
        self._user(uid)["plans"][pid] = {**copy.deepcopy(plan), "id": pid}
        return pid

    def plan(self, uid, pid: str) -> dict | None:
        p = self._user(uid)["plans"].get(pid)
        return copy.deepcopy(p) if p else None

    def reset(self, uid) -> None:
        self._users.pop(str(uid), None)


class FirestoreStore:
    """Same methods, backed by Firestore. Server-side only: the database's
    security rules can stay at "deny all" because browsers never touch it."""

    def __init__(self):
        from google.cloud import firestore   # imported here so tests don't need credentials
        self._fs = firestore
        self.db = firestore.Client()

    def _doc(self, uid):
        return self.db.collection("users").document(str(uid))

    def wallet(self, uid, today: date) -> dict:
        snap = self._doc(uid).get()
        data = snap.to_dict() if snap.exists else None
        if not data or not data.get("wallet"):
            wallet = default_wallet(today)
            self.save_wallet(uid, wallet)
            return wallet
        return data["wallet"]

    def save_wallet(self, uid, wallet: dict) -> None:
        self._doc(uid).set({"wallet": wallet}, merge=True)

    def add_event(self, uid, event: dict) -> str:
        ref = self._doc(uid).collection("events").document()
        ref.set({**event, "id": ref.id})
        return ref.id

    def event(self, uid, eid: str) -> dict | None:
        snap = self._doc(uid).collection("events").document(eid).get()
        return snap.to_dict() if snap.exists else None

    def update_event(self, uid, eid: str, fields: dict) -> None:
        self._doc(uid).collection("events").document(eid).update(fields)

    def events(self, uid, limit: int = 200) -> list[dict]:
        q = (self._doc(uid).collection("events")
             .order_by("at", direction=self._fs.Query.DESCENDING).limit(limit))
        return [d.to_dict() for d in q.stream()]

    def add_wish(self, uid, item: dict) -> str:
        ref = self._doc(uid).collection("wishlist").document()
        ref.set({**item, "id": ref.id})
        return ref.id

    def wishes(self, uid) -> list[dict]:
        q = self._doc(uid).collection("wishlist").order_by("added_at")
        return [d.to_dict() for d in q.stream()]

    def remove_wish(self, uid, wid: str) -> bool:
        ref = self._doc(uid).collection("wishlist").document(wid)
        if not ref.get().exists:
            return False
        ref.delete()
        return True

    def save_plan(self, uid, plan: dict) -> str:
        ref = self._doc(uid).collection("plans").document()
        ref.set({**plan, "id": ref.id})
        return ref.id

    def plan(self, uid, pid: str) -> dict | None:
        snap = self._doc(uid).collection("plans").document(pid).get()
        return snap.to_dict() if snap.exists else None

    def reset(self, uid) -> None:
        for name in ("events", "wishlist", "plans"):
            for d in self._doc(uid).collection(name).stream():
                d.reference.delete()
        self._doc(uid).delete()


def make_store():
    return FirestoreStore() if os.environ.get("GUARD_STORE") == "firestore" else MemoryStore()
