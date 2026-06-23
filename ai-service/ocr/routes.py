import logging

from fastapi import APIRouter, File, HTTPException, UploadFile

from ocr.ocr_engine import process_ocr

logger = logging.getLogger(__name__)
router = APIRouter()

_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff"}
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/ocr")
async def extract_text(file: UploadFile = File(...)):
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{file.content_type}'. Upload a JPEG, PNG, WEBP, BMP, or TIFF image.",
        )

    contents = await file.read()

    if len(contents) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10 MB.")

    try:
        result = process_ocr(contents)
    except Exception as e:
        logger.exception("OCR route error: %s", e)
        raise HTTPException(status_code=500, detail="OCR processing failed. Please retry.")

    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])

    return result
