import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from spending_coach.coach_engine import generate_spending_coach

logger = logging.getLogger(__name__)
router = APIRouter()


class SpendingCoachRequest(BaseModel):
    transactions: List[Dict[str, Any]] = []


@router.post("/spending-coach")
def spending_coach(data: SpendingCoachRequest):
    try:
        return generate_spending_coach(data.transactions)
    except Exception as e:
        logger.exception("Spending coach error: %s", e)
        raise HTTPException(status_code=500, detail="Spending coach failed. Please retry.")
