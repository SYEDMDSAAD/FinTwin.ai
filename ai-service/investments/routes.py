import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from investments.price_service import refresh_prices

logger = logging.getLogger(__name__)
router = APIRouter()


class InvestmentItem(BaseModel):
    # The backend sends the JPA id as a JSON number; declaring str here makes
    # pydantic v2 reject the whole payload with a 422.
    id: Optional[int] = None
    type: Optional[str] = None
    tickerCode: Optional[str] = None
    units: Optional[float] = None
    investedAmount: Optional[float] = None
    interestRate: Optional[float] = None
    purchaseDate: Optional[str] = None


@router.post("/market/prices")
def market_prices(investments: List[InvestmentItem]):
    try:
        return refresh_prices([inv.model_dump() for inv in investments])
    except Exception as e:
        logger.exception("Market prices error: %s", e)
        raise HTTPException(status_code=500, detail="Price refresh failed.")
