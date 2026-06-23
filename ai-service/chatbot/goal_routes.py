from fastapi import APIRouter

from pydantic import BaseModel

from typing import Dict, List, Optional

from chatbot.goal_planner import (
generate_goal_plan
)

router = APIRouter()

# =========================================

# REQUEST MODEL

# =========================================

class GoalPlanRequest(BaseModel):

    title: str

    targetAmount: float

    durationMonths: int

    income: float

    expenses: float

    savings: float

    monthlyTarget: float

    successProbability: float

    categorySpending: Dict[str, float]

    otherGoals: Optional[List[Dict]] = []

# =========================================

# ENDPOINT

# =========================================

@router.post("/goal-plan")

def goal_plan(
data: GoalPlanRequest
):

    plan = generate_goal_plan(
        data.dict()
    )

    return {

        "plan": plan
    }