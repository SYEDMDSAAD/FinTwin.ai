from fastapi import APIRouter

from spending_coach.coach_engine import (
    generate_spending_coach
)

router = APIRouter()

@router.post("/spending-coach")
def spending_coach(data: dict):

    return generate_spending_coach(
        data["transactions"]
    )