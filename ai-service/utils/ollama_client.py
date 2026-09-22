import os
import time
import logging
import requests

logger = logging.getLogger(__name__)

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")
# Chat endpoint (tool calling) lives at /api/chat on the same server
OLLAMA_CHAT_URL = os.environ.get(
    "OLLAMA_CHAT_URL", OLLAMA_URL.replace("/api/generate", "/api/chat")
)
MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")
# Keep the model in memory between requests. Ollama's default unloads it after
# 5 idle minutes, and reloading a 3B model adds seconds to the next answer.
KEEP_ALIVE = os.environ.get("OLLAMA_KEEP_ALIVE", "30m")
_MAX_RETRIES = 3
_RETRY_DELAY = 2.0


def ask(prompt: str, max_tokens: int = 512, timeout: float = 120.0,
        num_ctx: int = 2048) -> str:
    """One-shot generation.

    `timeout` is the read budget in seconds and must be set below whatever
    deadline the *caller's* caller enforces: the Spring backend hangs up at
    20s, and a generation that outlives that burns a worker producing text
    nobody will read. A read timeout is deliberately not retried — a
    generation that blew its budget once will blow it again.

    `num_ctx` is the context window. Ollama silently drops the *start* of a
    prompt that exceeds it — for prompts that open with rules, the worst
    possible failure mode — so callers with long prompts must size it, not
    hope. The estimate below is chars/3, deliberately pessimistic for
    figure-dense text.
    """
    if len(prompt) / 3 + max_tokens > num_ctx:
        logger.warning(
            "Prompt (~%d tokens est.) + %d output tokens may exceed num_ctx=%d; "
            "Ollama will silently truncate the start of the prompt",
            len(prompt) // 3, max_tokens, num_ctx)

    payload = {
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "keep_alive": KEEP_ALIVE,
        "options": {"num_ctx": num_ctx, "num_predict": max_tokens, "temperature": 0.3},
    }
    last_exc: Exception | None = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            response = requests.post(OLLAMA_URL, json=payload,
                                     timeout=(3.05, timeout))
            response.raise_for_status()
            return response.json()["response"].strip()
        except requests.exceptions.ConnectionError as e:
            last_exc = e
            logger.warning("Ollama connection failed (attempt %d/%d): %s", attempt, _MAX_RETRIES, e)
            if attempt < _MAX_RETRIES:
                time.sleep(_RETRY_DELAY * attempt)
        except requests.exceptions.HTTPError as e:
            raise RuntimeError(f"Ollama returned HTTP {e.response.status_code}") from e
        except (KeyError, ValueError) as e:
            raise RuntimeError(f"Unexpected Ollama response format: {e}") from e
    raise RuntimeError(f"Ollama unreachable after {_MAX_RETRIES} attempts: {last_exc}")


def chat(messages: list[dict], tools: list[dict] | None = None,
         max_tokens: int = 512, timeout: float = 120.0) -> dict:
    """
    Conversation turn via Ollama's /api/chat, optionally offering tools.
    Returns the assistant message dict — may contain 'tool_calls' when the
    model wants data instead of answering directly.

    `timeout` is the read budget for this one call; callers making several
    calls in a row pass what is left of their overall budget. A read timeout
    raises requests.exceptions.ReadTimeout and is not retried.
    """
    payload = {
        "model": MODEL,
        "messages": messages,
        "stream": False,
        "keep_alive": KEEP_ALIVE,
        # Low temperature: Ollama's default (~0.8) makes a 3B model skip tool
        # calls and invent data on some samples — factual/tool turns need
        # near-greedy decoding.
        "options": {"num_ctx": 4096, "num_predict": max_tokens, "temperature": 0.2},
    }
    if tools:
        payload["tools"] = tools

    last_exc: Exception | None = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            response = requests.post(OLLAMA_CHAT_URL, json=payload, timeout=(3.05, timeout))
            response.raise_for_status()
            return response.json()["message"]
        except requests.exceptions.ConnectionError as e:
            last_exc = e
            logger.warning("Ollama chat connection failed (attempt %d/%d): %s",
                           attempt, _MAX_RETRIES, e)
            if attempt < _MAX_RETRIES:
                time.sleep(_RETRY_DELAY * attempt)
        except requests.exceptions.HTTPError as e:
            raise RuntimeError(f"Ollama returned HTTP {e.response.status_code}") from e
        except (KeyError, ValueError) as e:
            raise RuntimeError(f"Unexpected Ollama response format: {e}") from e
    raise RuntimeError(f"Ollama unreachable after {_MAX_RETRIES} attempts: {last_exc}")
