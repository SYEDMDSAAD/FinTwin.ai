"""
Masks identifiers and secrets in text before it leaves this service: in every
prompt and message sent to the language model, and in every log line.

What goes: email addresses, UPI IDs, Indian mobile numbers, card numbers,
Aadhaar numbers, PANs, long account or reference numbers, and anything shaped
like a credential (a JWT, a bearer token, a Google API key, "password: ...").

What stays: rupee amounts, dates, percentages, merchant and category names.
Answers are checked against the figures they were given, so a masked amount
would break them; no amount a person would have runs to 11 digits, and the
patterns below never touch a figure written with a ₹ sign or Indian commas.

None of these is needed to answer a money question: "how much did I pay Rahul"
works from the name, never from Rahul's UPI ID or phone number.
"""
import contextvars
import logging
import os
import re
import sys

# Order matters: longer, more specific shapes first, so a card number isn't
# half-eaten by the phone pattern.
_RULES: list[tuple[re.Pattern, str]] = [
    # Credentials
    (re.compile(r"\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}"), "<TOKEN>"),                     # JWT
    (re.compile(r"(?i)\bbearer\s+[\w.~+/=-]{12,}"), "Bearer <TOKEN>"),
    (re.compile(r"\bAIza[\w-]{30,}"), "<API_KEY>"),                                      # Google API key
    (re.compile(r"\b(?:sk|pk|rk)[-_](?:live|test|ant|proj)?[-_]?[A-Za-z0-9_-]{16,}"), "<API_KEY>"),
    (re.compile(r"(?i)\b(password|passwd|pwd|passcode|pin|otp|cvv|mpin|secret|api[_ -]?key)"
                r"(\s*(?:is|:|=)\s*)\S+"), r"\1\2<REDACTED>"),
    # Contact details and UPI handles
    (re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"), "<EMAIL>"),
    (re.compile(r"[\w.-]{2,}@[a-zA-Z]{2,}\b(?!\.\w)"), "<UPI_ID>"),
    # Government and card numbers
    (re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), "<PAN>"),
    (re.compile(r"(?<![\d₹,.])\d{4}(?:[ -]\d{4}){2,3}(?:[ -]?\d{1,3})?(?!\d|[,.]\d)"),
     "<CARD_OR_ID>"),                                                                  # Aadhaar 4-4-4, card 4-4-4-4
    (re.compile(r"(?<![\d₹,.])[2-9]\d{11}(?!\d|[,.]\d)"), "<AADHAAR>"),
    (re.compile(r"(?<![\d₹,.])(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d|[,.]\d)"), "<PHONE>"),
    (re.compile(r"(?<![\d₹,.])\d{11,19}(?!\d|[,.]\d)"), "<NUMBER>"),                       # account / card
]


def redact(text):
    """The text with identifiers and secrets masked. Non-strings pass through."""
    if not isinstance(text, str) or not text:
        return text
    for pattern, mask in _RULES:
        text = pattern.sub(mask, text)
    return text


class RedactingFilter(logging.Filter):
    """Logging filter: the formatted message is masked before any handler sees it."""

    def filter(self, record: logging.LogRecord) -> bool:
        # Arguments are masked one by one and keep their shape: some formatters
        # (uvicorn's access log) read record.args themselves.
        if isinstance(record.msg, str):
            record.msg = redact(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(_mask_arg(a) for a in record.args)
        elif isinstance(record.args, dict):
            record.args = {k: _mask_arg(v) for k, v in record.args.items()}
        if record.exc_info and record.exc_info[1] is not None and not record.exc_text:
            # Exception messages carry request data too (a URL with a UPI ID, say)
            record.exc_text = redact(logging.Formatter().formatException(record.exc_info))
        return True


def _mask_arg(value):
    if value is None or isinstance(value, (bool, int, float)):
        return value              # numbers keep their type for %d
    return redact(value if isinstance(value, str) else str(value))


# The backend's trace id for the request being served, so one problem can be
# followed from the backend's log line (traceId=...) into this service's.
trace_id: contextvars.ContextVar[str] = contextvars.ContextVar("trace_id", default="-")


def trace_id_from(headers) -> str:
    """W3C traceparent (00-<trace>-<span>-<flags>) as the backend sends it, else X-Request-Id."""
    parent = headers.get("traceparent", "")
    parts = parent.split("-")
    if len(parts) == 4 and len(parts[1]) == 32:
        return parts[1]
    rid = headers.get("x-request-id", "")
    return rid[:64] if re.fullmatch(r"[\w-]{1,64}", rid or "") else "-"


class _TraceIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.trace_id = trace_id.get()
        return True


_FORMAT = "%(asctime)s %(levelname)s %(name)s traceId=%(trace_id)s - %(message)s"


def install_log_redaction() -> None:
    """Every handler masks its lines and carries the trace id.

    Without this the service had no handler of its own: INFO lines (tool calls,
    rejected answers) were dropped, and warnings went out through Python's
    last-resort handler, unmasked. Safe to call more than once.
    """
    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter(_FORMAT))
        root.addHandler(handler)
        root.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())
    handlers = list(root.handlers)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        handlers += logging.getLogger(name).handlers
    for handler in handlers:
        if not any(isinstance(f, RedactingFilter) for f in handler.filters):
            handler.addFilter(_TraceIdFilter())
            handler.addFilter(RedactingFilter())
