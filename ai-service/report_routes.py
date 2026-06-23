from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, List, Optional

from chatbot.report_generator import generate_weekly_report

print("REPORT ROUTES LOADED")

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
    return generate_weekly_report(data.dict())
