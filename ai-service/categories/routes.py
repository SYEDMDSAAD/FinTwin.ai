from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from categories.suggest import MAX_PAYEES, suggest

router = APIRouter()


class SuggestRequest(BaseModel):
    payees: list[str] = Field(default_factory=list, max_length=MAX_PAYEES)


@router.post("/categories/suggest")
async def suggest_categories(req: SuggestRequest):
    """A likely category (or null) for each payee name, for the user to confirm."""
    if not req.payees:
        return {"suggestions": {}, "complete": True}
    try:
        return await run_in_threadpool(suggest, req.payees)
    except Exception:
        # No payee names in the log: they can identify the user's contacts
        raise HTTPException(status_code=503, detail="Suggestions are unavailable right now.")
