import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from chatbot.report_generator import generate_weekly_report

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Reports"])


class PeriodFigures(BaseModel):
    """One month's figures, for period-over-period comparison.

    Both sides of a comparison must be the same shape of period, so callers
    that want trends send currentPeriod alongside previousPeriod rather than
    letting the 3-month headline averages stand in for a single month.
    """
    income:         float = 0.0
    expenses:       float = 0.0
    savings:        float = 0.0
    netWorth:       float = 0.0
    financialScore: float = 0.0


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
    # Without these the report is a snapshot with no trend — the one thing an
    # executive report exists to show.
    currentPeriod:    Optional[PeriodFigures] = None
    previousPeriod:   Optional[PeriodFigures] = None


@router.post("/weekly-report")
def weekly_report(data: WeeklyReportRequest):
    try:
        return generate_weekly_report(data.model_dump())
    except Exception as e:
        logger.exception("Weekly report error: %s", e)
        raise HTTPException(status_code=500, detail="Report generation failed. Please retry.")
