"""Talks to the FinTwin backend's internal API (/internal/ai/**) for one user: reads
their budgets and goals, asks FinTwin's categoriser about a payee, and keeps
Spend Guard's own records there.

Adapted from ai-service/utils/backend_api.py. Every call carries the shared
AI_INTERNAL_KEY and the per-user tool token the backend minted for this
request. This service can pass a token back but can't make one, so it can
only ever read the user the backend is asking about.
"""
import logging
import os

import requests

logger = logging.getLogger(__name__)

BACKEND_URL = os.environ.get("BACKEND_URL", "").rstrip("/")
_INTERNAL_KEY = os.environ.get("AI_INTERNAL_KEY", "")
# Shorter than ai-service's 15 s: a scan check waits on this
_TIMEOUT = float(os.environ.get("BACKEND_TIMEOUT_SECONDS", "6"))


def configured() -> bool:
    return bool(BACKEND_URL)


def get(user_id: int, path: str, tool_token: str, params: dict | None = None) -> dict:
    """GET {BACKEND_URL}/internal/ai/{user_id}{path}. Raises RuntimeError on any failure."""
    if not BACKEND_URL:
        raise RuntimeError("BACKEND_URL is not set")
    url = f"{BACKEND_URL}/internal/ai/{int(user_id)}{path}"
    headers = {"X-Internal-Key": _INTERNAL_KEY, "X-Tool-Token": tool_token or ""}
    try:
        resp = requests.get(url, params=params or {}, headers=headers, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.RequestException as e:
        # The URL holds a user id, so log the path shape only
        logger.warning("Backend internal API call failed (%s): %s", path, type(e).__name__)
        raise RuntimeError("Backend data API unavailable") from e


def put(user_id: int, path: str, tool_token: str, body: dict) -> dict:
    """PUT {BACKEND_URL}/internal/ai/{user_id}{path} with a JSON body. Raises RuntimeError on any failure."""
    if not BACKEND_URL:
        raise RuntimeError("BACKEND_URL is not set")
    url = f"{BACKEND_URL}/internal/ai/{int(user_id)}{path}"
    headers = {"X-Internal-Key": _INTERNAL_KEY, "X-Tool-Token": tool_token or ""}
    try:
        resp = requests.put(url, json=body, headers=headers, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.RequestException as e:
        logger.warning("Backend internal API write failed (%s): %s", path, type(e).__name__)
        raise RuntimeError("Backend data API unavailable") from e
