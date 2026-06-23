import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from chatbot.advisor import generate_financial_advice

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    mode: str
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
