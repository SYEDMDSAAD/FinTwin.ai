import logging
from typing import Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from chatbot.report_generator import generate_weekly_report

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Reports"])


class WeeklyReportRequest(BaseModel):
    income:           float
    expenses:         float
    savings:          float
    financialScore:   int
    categorySpending: Dict[str, float] = {}
    goals:            List            = []
    netWorth:         float           = 0.0
    spendingHealth:   str             = ""
    monthlyLeakage:   float           = 0.0
    predictedExpenses: float          = 0.0
    predictedSavings:  float          = 0.0
    riskProfile:      str             = ""
    expectedReturn:   str             = ""


@router.post("/weekly-report")
def weekly_report(data: WeeklyReportRequest):
    try:
        return generate_weekly_report(data.model_dump())
    except Exception as e:
        logger.exception("Weekly report error: %s", e)
        raise HTTPException(status_code=500, detail="Report generation failed. Please retry.")
