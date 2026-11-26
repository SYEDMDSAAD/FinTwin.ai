"""
Reads an insurance policy or a loan statement PDF and pulls out the fields
FinTwin's forms ask for, so the user checks a filled form instead of typing.

Only the PDF's text is used (first pages, capped), and it is masked by
utils.redact before the model sees it: policy, account, phone and card
numbers never leave this service. The model answers in JSON; every field is
then checked and dropped if it doesn't fit (an unknown type, a negative
amount, a date that isn't a date). Nothing is saved: the user reviews the
filled form and saves it themselves.
"""

import io
import json
import logging
import re
from datetime import date

import pdfplumber
import requests

from utils.llm_client import ask
from utils.redact import redact

logger = logging.getLogger(__name__)

MAX_BYTES = 15 * 1024 * 1024
MAX_PAGES = 4
MAX_CHARS = 12_000

POLICY_TYPES = ["Life", "Health", "Term", "Vehicle", "Home", "Travel", "Critical Illness"]
FREQUENCIES = ["Monthly", "Quarterly", "Half-Yearly", "Annually"]
LOAN_TYPES = ["Home Loan", "Car Loan", "Personal Loan", "Student Loan", "Credit Card",
              "Business Loan", "Medical Debt", "Other"]


class DocumentError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def pdf_text(data: bytes, password: str | None = None) -> str:
    if not data.startswith(b"%PDF"):
        raise DocumentError("not_pdf", "Upload the policy or loan document as a PDF.")
    try:
        pdf = pdfplumber.open(io.BytesIO(data), password=password or "")
    except Exception as e:
        if "password" in type(e).__name__.lower() or "encrypt" in str(e).lower():
            if password:
                raise DocumentError("password_incorrect", "That password didn't open the PDF. Try again.") from None
            raise DocumentError("password_required", "This PDF is password-protected.") from None
        raise DocumentError("unreadable", "This PDF could not be read.") from None
    with pdf:
        parts = [(p.extract_text() or "") for p in pdf.pages[:MAX_PAGES]]
    text = re.sub(r"[ \t]+", " ", "\n".join(parts)).strip()
    if len(text) < 40:
        raise DocumentError("no_text", "This PDF has no readable text (it may be a scan). Fill the form by hand.")
    return text[:MAX_CHARS]


def _prompt(kind: str, text: str) -> str:
    if kind == "policy":
        fields = f"""- "type": one of {json.dumps(POLICY_TYPES)}
- "provider": the insurer's name, like "LIC" or "HDFC Ergo"
- "premium": the premium amount in rupees, a number
- "frequency": how often the premium is paid, one of {json.dumps(FREQUENCIES)}
- "sumAssured": the sum assured or cover amount in rupees, a number
- "renewalDate": the next premium due date or renewal date, as YYYY-MM-DD"""
        what = "an Indian insurance policy document"
    else:
        fields = f"""- "type": one of {json.dumps(LOAN_TYPES)}
- "name": a short name for the loan, like "HDFC home loan"
- "amount": the outstanding principal (amount still owed) in rupees, a number
- "emi": the monthly instalment in rupees, a number
- "interestRate": the annual interest rate in percent, a number
- "termMonths": the number of instalments or months left, a whole number"""
        what = "an Indian loan statement or loan account summary"
    return f"""You read {what} and fill a form from it.

Fields:
{fields}

Use only what the document states. If a field is not clearly stated, use null; never guess. Numbers are plain numbers without commas or currency signs. Masked values like <NUMBER> are hidden on purpose; ignore them.

Document:
\"\"\"
{text}
\"\"\"

Reply with JSON only, with exactly these keys."""


def _num(v, lo=0.0, hi=1e10):
    if isinstance(v, str):
        v = v.replace(",", "").replace("₹", "").strip()
        try:
            v = float(v)
        except ValueError:
            return None
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return float(v) if lo < v <= hi else None


def _pick(v, allowed):
    if not isinstance(v, str):
        return None
    by_lower = {a.lower(): a for a in allowed}
    return by_lower.get(v.strip().lower())


def _text(v, max_len=80):
    if not isinstance(v, str) or not v.strip():
        return None
    return redact(v.strip())[:max_len]


def _date(v):
    if not isinstance(v, str):
        return None
    try:
        d = date.fromisoformat(v.strip()[:10])
    except ValueError:
        return None
    return d.isoformat() if 2000 <= d.year <= 2100 else None


def clean(kind: str, data) -> dict:
    """The model's answer → only fields that fit the form; anything doubtful is dropped."""
    if not isinstance(data, dict):
        return {}
    if kind == "policy":
        out = {
            "type": _pick(data.get("type"), POLICY_TYPES),
            "provider": _text(data.get("provider")),
            "premium": _num(data.get("premium"), hi=1e8),
            "frequency": _pick(data.get("frequency"), FREQUENCIES),
            "sumAssured": _num(data.get("sumAssured"), hi=1e11),
            "renewalDate": _date(data.get("renewalDate")),
        }
    else:
        term = _num(data.get("termMonths"), hi=600)
        out = {
            "type": _pick(data.get("type"), LOAN_TYPES),
            "name": _text(data.get("name")),
            "amount": _num(data.get("amount"), hi=1e10),
            "emi": _num(data.get("emi"), hi=1e8),
            "interestRate": _num(data.get("interestRate"), hi=60),
            "termMonths": int(term) if term is not None else None,
        }
    return {k: v for k, v in out.items() if v is not None}


def extract_fields(kind: str, data: bytes, password: str | None = None) -> dict:
    """{"fields": {...}} for kind "policy" or "loan"."""
    if kind not in ("policy", "loan"):
        raise DocumentError("bad_kind", "Choose a policy or a loan document.")
    text = redact(pdf_text(data, password))
    try:
        raw = ask(_prompt(kind, text), max_tokens=300, timeout=45, temperature=0.0,
                  json_mode=True, feature="document_extract")
    except (RuntimeError, requests.exceptions.RequestException) as e:
        logger.warning("Document reading failed: %s", type(e).__name__)
        raise DocumentError("reader_unavailable", "The document reader is unavailable right now. Try again.") from None
    try:
        parsed = json.loads(raw)
    except ValueError:
        parsed = {}
    return {"fields": clean(kind, parsed)}
