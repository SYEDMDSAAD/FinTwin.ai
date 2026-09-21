import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from statements.extract import MAX_BYTES, StatementError, extract

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/statements/extract")
async def extract_statement(
    file: UploadFile = File(...),
    password: str | None = Form(default=None),
):
    """
    Returns the statement's table as a grid of strings. The password, when
    given, is used to open the PDF and is never logged or stored.
    """
    contents = await file.read(MAX_BYTES + 1)
    try:
        # PDF layout analysis is CPU-bound; keep it off the event loop
        result = await run_in_threadpool(extract, contents, password)
    except StatementError as e:
        raise HTTPException(status_code=422, detail={"code": e.code, "message": e.message})
    except Exception:
        # No file name or contents in the log: statements are personal data
        logger.exception("Statement extraction failed")
        raise HTTPException(
            status_code=422,
            detail={"code": "unreadable", "message": "This file could not be read."})

    return {"grid": result.grid, "format": result.format, "pages": result.pages}
