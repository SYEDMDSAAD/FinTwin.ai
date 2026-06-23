import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from investments.recommendation_engine import generate_investment_recommendation
from investments.price_service import refresh_prices

logger = logging.getLogger(__name__)
router = APIRouter()


class InvestmentRecommendationRequest(BaseModel):
    income: float = 0
    expenses: float = 0
    savings: float = 0
    financialScore: int = 0
    netWorth: float = 0
    goalHealth: Optional[str] = "N/A"


class InvestmentItem(BaseModel):
    id: Optional[str] = None
    type: Optional[str] = None
    tickerCode: Optional[str] = None
    units: Optional[float] = None
    investedAmount: Optional[float] = None
    interestRate: Optional[float] = None
    purchaseDate: Optional[str] = None


@router.post("/investment-recommendation")
def investment_recommendation(data: InvestmentRecommendationRequest):
    try:
        return generate_investment_recommendation(data.model_dump())
    except Exception as e:
        logger.exception("Investment recommendation error: %s", e)
        raise HTTPException(status_code=500, detail="Investment recommendation failed.")


@router.post("/market/prices")
def market_prices(investments: List[InvestmentItem]):
    try:
        return refresh_prices([inv.model_dump() for inv in investments])
    except Exception as e:
        logger.exception("Market prices error: %s", e)
        raise HTTPException(status_code=500, detail="Price refresh failed.")
