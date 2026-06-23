import os
import time
import logging
import requests

logger = logging.getLogger(__name__)

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")
MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")
_MAX_RETRIES = 3
_RETRY_DELAY = 2.0


def ask(prompt: str, max_tokens: int = 512) -> str:
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"num_ctx": 2048, "num_predict": max_tokens},
    }
    last_exc: Exception | None = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            response = requests.post(OLLAMA_URL, json=payload, timeout=120)
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
