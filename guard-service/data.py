"""The user's budgets and goals, from FinTwin, or a made-up persona for local work.

Real mode: BACKEND_URL is set, and every read goes to the backend's internal
API with the user's tool token. If the backend can't be reached, the facts
say so (data_ok=False) and the decision falls back to the fixed rules. Made-up
numbers are never swapped in for a real user.

Persona mode: GUARD_PERSONA=1, or no BACKEND_URL. For running this service on
a laptop and in tests, with numbers invented for "Aarav, 24, salary ₹45,000".
"""
import asyncio
import copy
import logging
import os
import time
from dataclasses import asdict, dataclass, field

import backend_api
from rules import ESSENTIAL

logger = logging.getLogger(__name__)


@dataclass
class Budget:
    category: str
    limit: int
    spent: int


@dataclass
class Goal:
    title: str
    target: int
    saved: int
    monthly: int


@dataclass
class Finances:
    budgets: list[Budget] = field(default_factory=list)
    goals: list[Goal] = field(default_factory=list)
    data_ok: bool = True          # False when the backend couldn't be read
    persona: bool = False         # True when the numbers are made up

    def budget(self, category: str) -> Budget | None:
        for b in self.budgets:
            if b.category.lower() == category.lower():
                return b
        return None

    def tool_state(self) -> dict:
        """What the Payday Planner's tools can read: numbers and names, nothing else."""
        return {
            "budgets": [{**asdict(b), "essential": b.category in ESSENTIAL} for b in self.budgets],
            "goals": [{"title": g.title, "target": g.target, "saved": g.saved, "monthly_target": g.monthly}
                      for g in self.goals],
        }


PERSONA = Finances(
    budgets=[
        Budget("Food", 6000, 5750),
        Budget("Groceries", 8000, 4200),
        Budget("Shopping", 4000, 3100),
        Budget("Entertainment", 2000, 1500),
        Budget("Transport", 3000, 1800),
        Budget("Health", 2000, 300),
        Budget("Bills", 4500, 4500),
        Budget("Rent", 10000, 10000),
    ],
    goals=[
        Goal("Goa trip", 30000, 12000, 6000),
        Goal("Emergency fund", 50000, 9000, 1000),
    ],
    persona=True,
)


def persona_mode() -> bool:
    return os.environ.get("GUARD_PERSONA") == "1" or not backend_api.configured()


def _int(v) -> int:
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return 0


async def _read(user_id: int, path: str, tool_token: str | None, params: dict | None = None) -> dict:
    """One backend read in a thread, logging how long it took (never what it returned)."""
    started = time.monotonic()
    try:
        return await asyncio.to_thread(backend_api.get, user_id, path, tool_token, params)
    finally:
        logger.info("FinTwin %s read in %.1fs", path, time.monotonic() - started)


# Budgets and goals change slowly, and the goals read recalculates progress from
# every transaction (1–2 s from here). A copy up to a minute old saves that on
# each scan; forget() drops it when Spend Guard itself changes either one.
CACHE_SECONDS = float(os.environ.get("GUARD_DATA_CACHE_SECONDS", "60"))
_cache: dict[int, tuple[float, "Finances"]] = {}


def forget(user_id: int) -> None:
    _cache.pop(int(user_id), None)


async def load(user_id: int, tool_token: str | None) -> Finances:
    """Budgets and goals, read in parallel threads so a slow backend can't stall other requests."""
    if persona_mode():
        return copy.deepcopy(PERSONA)
    hit = _cache.get(int(user_id))
    if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
        return copy.deepcopy(hit[1])
    try:
        budgets_json, goals_json = await asyncio.gather(
            _read(user_id, "/budgets", tool_token),
            _read(user_id, "/goals", tool_token))
        raw_budgets = budgets_json.get("budgets", [])
        raw_goals = goals_json.get("goals", [])
    except (RuntimeError, AttributeError):
        return Finances(data_ok=False)
    budgets = [Budget(str(b.get("category", "Other")), _int(b.get("limit")), _int(b.get("spent")))
               for b in raw_budgets if b.get("category")]
    goals = [Goal(str(g.get("title", "Goal"))[:60], _int(g.get("targetAmount")),
                  _int(g.get("savedSoFar")), _int(g.get("monthlyTarget")))
             for g in raw_goals if g.get("status") != "Completed"]
    finances = Finances(budgets=budgets, goals=goals)
    if len(_cache) > 1000:          # a handful of users in practice; never let it grow
        _cache.clear()
    _cache[int(user_id)] = (time.monotonic(), finances)     # only good reads are kept
    return copy.deepcopy(finances)


async def categorize(user_id: int, name: str, tool_token: str | None) -> tuple[str, str] | None:
    """FinTwin's category for a payee name and how it was chosen (LEARNED when the
    user corrected that payee before), or None in persona mode, for a nameless
    payee, or when the backend can't be reached. The name goes to FinTwin, never
    to the model."""
    if persona_mode() or not name.strip():
        return None
    try:
        got = await _read(user_id, "/categorize", tool_token, {"name": name[:120]})
    except RuntimeError:
        return None
    category, source = str(got.get("category") or ""), str(got.get("source") or "")
    return (category, source) if category else None
