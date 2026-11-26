import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from documents.extract import MAX_BYTES, DocumentError, extract_fields

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/documents/extract")
async def extract_document(
    file: UploadFile = File(...),
    kind: str = Form(...),
    password: str | None = Form(default=None),
):
    """Form fields read from a policy or loan PDF, for the user to check. Saves nothing."""
    contents = await file.read(MAX_BYTES + 1)
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=413, detail={"code": "too_large", "message": "That PDF is over 15 MB."})
    try:
        return await run_in_threadpool(extract_fields, kind, contents, password)
    except DocumentError as e:
        status = 503 if e.code == "reader_unavailable" else 422
        raise HTTPException(status_code=status, detail={"code": e.code, "message": e.message})
    except Exception:
        # No file name or contents in the log: these are personal documents
        logger.exception("Document extraction failed")
        raise HTTPException(status_code=422, detail={"code": "unreadable", "message": "This PDF could not be read."})
