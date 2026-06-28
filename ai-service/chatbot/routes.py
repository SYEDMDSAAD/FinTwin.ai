import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from chatbot.advisor import generate_financial_advice

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatRequest(BaseModel):
    # Bounded length to limit prompt-stuffing / resource abuse.
    message: str = Field(..., min_length=1, max_length=4000)
    mode: str = Field(..., max_length=64)
    financialData: Optional[Dict[str, Any]] = None


@router.post("/chat")
def chat_ai(data: ChatRequest):
    try:
        reply = generate_financial_advice(
            data.message,
            data.financialData or {},
            data.mode,
        )
        return {"success": True, "reply": reply}
    except Exception as e:
        logger.exception("Chat endpoint error: %s", e)
        raise HTTPException(status_code=500, detail="AI service error. Please retry.")
