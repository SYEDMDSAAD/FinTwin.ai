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
import os
from dataclasses import asdict, dataclass, field

import backend_api
from rules import ESSENTIAL


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


async def load(user_id: int, tool_token: str | None) -> Finances:
    """Budgets and goals, read in parallel threads so a slow backend can't stall other requests."""
    if persona_mode():
        return copy.deepcopy(PERSONA)
    try:
        budgets_json, goals_json = await asyncio.gather(
            asyncio.to_thread(backend_api.get, user_id, "/budgets", tool_token),
            asyncio.to_thread(backend_api.get, user_id, "/goals", tool_token))
        raw_budgets = budgets_json.get("budgets", [])
        raw_goals = goals_json.get("goals", [])
    except (RuntimeError, AttributeError):
        return Finances(data_ok=False)
    budgets = [Budget(str(b.get("category", "Other")), _int(b.get("limit")), _int(b.get("spent")))
               for b in raw_budgets if b.get("category")]
    goals = [Goal(str(g.get("title", "Goal"))[:60], _int(g.get("targetAmount")),
                  _int(g.get("savedSoFar")), _int(g.get("monthlyTarget")))
             for g in raw_goals if g.get("status") != "Completed"]
    return Finances(budgets=budgets, goals=goals)
