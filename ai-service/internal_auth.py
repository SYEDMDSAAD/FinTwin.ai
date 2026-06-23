"""
Internal API key guard for the AI service.

Every request from Spring Boot carries X-Internal-Key. This dependency
rejects any request that doesn't have the right key, so the AI service
is never callable directly from the internet (assuming it's not port-exposed).
"""

import os
from fastapi import Header, HTTPException, status

_EXPECTED_KEY = os.environ.get("AI_INTERNAL_KEY", "")
if not _EXPECTED_KEY:
    raise RuntimeError(
        "AI_INTERNAL_KEY env var is not set. "
        "Generate with: openssl rand -hex 32 and set the same value in both services."
    )


def require_internal_key(x_internal_key: str = Header(...)) -> None:
    if x_internal_key != _EXPECTED_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing or invalid internal key",
        )
