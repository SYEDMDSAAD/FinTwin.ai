"""
Client for the backend's internal AI data API (/internal/ai/**).

Tool calls fetch the user's data on demand instead of the backend
pre-stuffing everything into the prompt. Authenticated service-to-service
with the shared AI_INTERNAL_KEY (same secret the backend uses to call us).
"""

import os
import logging

import requests

logger = logging.getLogger(__name__)

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8080")
_INTERNAL_KEY = os.environ.get("AI_INTERNAL_KEY", "")

_TIMEOUT = 15


def get(path: str, params: dict | None = None) -> dict:
    """GET {BACKEND_URL}/internal/ai{path} → parsed JSON. Raises RuntimeError on failure."""
    url = f"{BACKEND_URL}/internal/ai{path}"
    try:
        resp = requests.get(
            url,
            params=params or {},
            headers={"X-Internal-Key": _INTERNAL_KEY},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.RequestException as e:
        logger.warning("Backend internal API call failed (%s): %s", url, e)
        raise RuntimeError(f"Backend data API unavailable: {e}") from e
