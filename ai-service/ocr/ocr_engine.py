"""
OCR engine for receipt/bill image processing.

Extracts merchant name and transaction amount from uploaded images.
"""

import io
import logging
import os
import re

from PIL import Image
import pytesseract

logger = logging.getLogger(__name__)

_MAX_FILE_BYTES = int(os.environ.get("OCR_MAX_FILE_BYTES", 10 * 1024 * 1024))  # 10 MB default

_ALLOWED_MODES = {"RGB", "L", "RGBA", "P"}

_MERCHANTS = [m.strip() for m in os.environ.get(
    "OCR_MERCHANTS",
    "Swiggy,Uber,Amazon,Electricity,Paytm,Zomato,PhonePe,Google Pay,Blinkit,Myntra,Flipkart,"
    "BigBasket,Ola,Dunzo,Nykaa,HDFC,ICICI,Axis,SBI,Reliance,DMart,Jio,Airtel,BSNL,BookMyShow",
).split(",") if m.strip()]

# Matches amounts like ₹1,234.56 | Rs.1234 | 1,234.50 | INR 500
_AMOUNT_RE = re.compile(
    r"(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)"
    r"|(?<!\d)([\d]{1,6}(?:,\d{3})*(?:\.\d{1,2})?)(?!\d)",
    re.IGNORECASE,
)

_TOTAL_KEYWORDS = re.compile(
    r"\b(total|grand\s*total|amount\s*due|amount\s*paid|net\s*payable|bill\s*amount)\b",
    re.IGNORECASE,
)


def process_ocr(contents: bytes) -> dict:
    if len(contents) > _MAX_FILE_BYTES:
        return {"merchant": "Unknown", "amount": 0, "raw_text": "", "error": "File too large"}

    try:
        image = Image.open(io.BytesIO(contents))
    except Exception as e:
        logger.warning("Failed to open image: %s", e)
        return {"merchant": "Unknown", "amount": 0, "raw_text": "", "error": "Invalid image file"}

    if image.mode not in _ALLOWED_MODES:
        try:
            image = image.convert("RGB")
        except Exception as e:
            logger.warning("Image conversion failed: %s", e)
            return {"merchant": "Unknown", "amount": 0, "raw_text": "", "error": "Unsupported image format"}

    try:
        grey = image.convert("L")
        # Try structured page mode first; fall back to single block if output is sparse
        text = pytesseract.image_to_string(grey, config="--psm 4")
        if len(text.strip()) < 20:
            text = pytesseract.image_to_string(grey, config="--psm 6")
    except Exception as e:
        logger.error("Tesseract OCR failed: %s", e)
        return {"merchant": "Unknown", "amount": 0, "raw_text": "", "error": "OCR processing failed"}

    amount = _extract_amount(text)
    merchant = _detect_merchant(text)

    return {"merchant": merchant, "amount": amount, "raw_text": text}


def _extract_amount(text: str) -> float:
    lines = text.splitlines()

    # Priority 1: line that contains a "total" keyword
    for line in lines:
        if _TOTAL_KEYWORDS.search(line):
            val = _best_amount_in_line(line)
            if val and val > 0:
                return val

    # Priority 2: largest decimal value on any line (most likely a transaction amount)
    candidates = []
    for m in _AMOUNT_RE.finditer(text):
        raw = (m.group(1) or m.group(2) or "").replace(",", "")
        try:
            val = float(raw)
            if 1.0 <= val <= 500_000:
                candidates.append(val)
        except ValueError:
            continue

    if not candidates:
        return 0.0

    decimal_vals = [v for v in candidates if v != int(v)]
    return round(max(decimal_vals) if decimal_vals else max(candidates), 2)


def _best_amount_in_line(line: str) -> float | None:
    vals = []
    for m in _AMOUNT_RE.finditer(line):
        raw = (m.group(1) or m.group(2) or "").replace(",", "")
        try:
            v = float(raw)
            if 1.0 <= v <= 500_000:
                vals.append(v)
        except ValueError:
            continue
    return max(vals) if vals else None


def _detect_merchant(text: str) -> str:
    lower = text.lower()
    for merchant in _MERCHANTS:
        if merchant.lower() in lower:
            return merchant
    return "Unknown"
