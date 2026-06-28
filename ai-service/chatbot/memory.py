"""
Per-user conversation memory for the chatbot.

Two backends:
- Redis (when REDIS_URL is set): shared across all workers and instances.
- In-process dict (fallback): correct only for single-worker, single-instance setups.

The Redis backend stores history as a JSON-serialised list capped at MAX_HISTORY turns,
with a TTL of TTL_SECONDS so inactive sessions clean themselves up.
"""

import json
import os
import threading
import time
from collections import deque
from typing import TypedDict

_MAX_HISTORY  = 10
_TTL_SECONDS  = 3600  # 1 hour of inactivity clears a session
_REDIS_KEY    = "fintwin:chat:history:{user_id}"

# ── Redis backend ─────────────────────────────────────────────────────────────

_redis_client = None
_REDIS_URL = os.environ.get("REDIS_URL", "")

if _REDIS_URL:
    try:
        import redis as _redis_lib
        _redis_client = _redis_lib.from_url(_REDIS_URL, decode_responses=True, socket_timeout=2)
        _redis_client.ping()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            "chatbot/memory: Redis unavailable (%s). Falling back to in-process memory "
            "(NOT suitable for multi-worker/multi-instance deployments).", e
        )
        _redis_client = None

# ── In-process fallback ───────────────────────────────────────────────────────

_lock:  threading.Lock = threading.Lock()
_store: dict[str, dict] = {}  # {user_id: {"history": deque, "last_access": float}}


class Turn(TypedDict):
    message: str
    reply:   str


# ── Public API ────────────────────────────────────────────────────────────────

def get_history(user_id: str) -> list[Turn]:
    if _redis_client:
        return _redis_get(user_id)
    return _local_get(user_id)


def append_turn(user_id: str, message: str, reply: str) -> None:
    if _redis_client:
        _redis_append(user_id, message, reply)
    else:
        _local_append(user_id, message, reply)


def clear_history(user_id: str) -> None:
    if _redis_client:
        try:
            _redis_client.delete(_REDIS_KEY.format(user_id=user_id))
        except Exception:
            pass
    else:
        with _lock:
            _store.pop(user_id, None)


# ── Redis implementation ──────────────────────────────────────────────────────

def _redis_get(user_id: str) -> list[Turn]:
    try:
        raw = _redis_client.get(_REDIS_KEY.format(user_id=user_id))
        return json.loads(raw) if raw else []
    except Exception:
        return []


def _redis_append(user_id: str, message: str, reply: str) -> None:
    try:
        key     = _REDIS_KEY.format(user_id=user_id)
        history = _redis_get(user_id)
        history.append(Turn(message=message, reply=reply))
        if len(history) > _MAX_HISTORY:
            history = history[-_MAX_HISTORY:]
        _redis_client.set(key, json.dumps(history), ex=_TTL_SECONDS)
    except Exception:
        pass


# ── In-process implementation ─────────────────────────────────────────────────

def _local_get(user_id: str) -> list[Turn]:
    with _lock:
        session = _store.get(user_id)
        if session is None:
            return []
        session["last_access"] = time.time()
        return list(session["history"])


def _local_append(user_id: str, message: str, reply: str) -> None:
    _evict_stale()  # bound the in-process store; called outside the (non-reentrant) lock
    with _lock:
        if user_id not in _store:
            _store[user_id] = {"history": deque(maxlen=_MAX_HISTORY), "last_access": time.time()}
        session = _store[user_id]
        session["history"].append(Turn(message=message, reply=reply))
        session["last_access"] = time.time()


def _evict_stale() -> None:
    cutoff = time.time() - _TTL_SECONDS
    with _lock:
        stale = [uid for uid, s in _store.items() if s["last_access"] < cutoff]
        for uid in stale:
            del _store[uid]
