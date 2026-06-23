import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from forecasting.prophet_forecaster import forecast_expenses

logger = logging.getLogger(__name__)
router = APIRouter()


class ForecastRequest(BaseModel):
    transactions: List[Dict[str, Any]]

    @field_validator("transactions")
    @classmethod
    def must_not_be_empty(cls, v: list) -> list:
        if not v:
            raise ValueError("transactions list must not be empty")
        return v


@router.post("/forecast")
def forecast(data: ForecastRequest):
    try:
        return forecast_expenses(data.transactions)
    except Exception as e:
        logger.exception("Forecast route error: %s", e)
        raise HTTPException(status_code=500, detail="Forecasting failed. Please retry.")
