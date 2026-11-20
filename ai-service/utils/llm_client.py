"""The one door every AI feature uses to reach a language model.

    LLM_PROVIDER=gemini   (default)  Gemini on Google Cloud's Vertex AI  — utils/gemini_client.py
    LLM_PROVIDER=ollama              qwen2.5:3b through a local Ollama   — utils/ollama_client.py
    LLM_PROVIDER=bedrock             Claude through Amazon Bedrock       — utils/bedrock_client.py

Every provider takes the same arguments and returns the same shapes, so the
seven features (copilot, coach, goal planner, report, categories,
investments, advisor) don't know which model answered. Ollama-only options
(num_ctx, keep_alive) are ignored by the others; each one's own settings live
in its client's environment variables.

The switch is read once at import: changing provider means restarting the
service, so one process never mixes two models' conversations.

Everything sent passes through utils.redact first, whichever provider is set:
email addresses, UPI IDs, phone, card, Aadhaar and account numbers, PANs and
anything shaped like a credential are masked before a model sees them. It is
done here, the one door, so no feature can forget it.
"""
import os

from utils.redact import redact

PROVIDER = os.environ.get("LLM_PROVIDER", "gemini").strip().lower()

if PROVIDER == "gemini":
    from utils import gemini_client as _impl
elif PROVIDER == "bedrock":
    from utils import bedrock_client as _impl
elif PROVIDER == "ollama":
    from utils import ollama_client as _impl
else:
    raise RuntimeError(f"LLM_PROVIDER must be 'gemini', 'ollama' or 'bedrock', not {PROVIDER!r}")

MODEL = _impl.MODEL


def ask(prompt: str, max_tokens: int = 512, timeout: float = 120.0,
        num_ctx: int = 2048, temperature: float = 0.3, json_mode: bool = False,
        feature: str = "other") -> str:
    """One-shot generation: prompt in, text out. See ollama_client.ask()."""
    return _impl.ask(redact(prompt), max_tokens=max_tokens, timeout=timeout, num_ctx=num_ctx,
                     temperature=temperature, json_mode=json_mode, feature=feature)


def chat(messages: list[dict], tools: list[dict] | None = None,
         max_tokens: int = 512, timeout: float = 120.0, feature: str = "other") -> dict:
    """One conversation turn, optionally with tools. See ollama_client.chat().

    Returns the assistant message as a dict: "content" (text) and, when the
    model wants data, "tool_calls" ([{"function": {"name", "arguments"}}]).
    Append it to `messages` unchanged — a provider may carry state in it.
    """
    return _impl.chat(_redacted(messages), tools=tools, max_tokens=max_tokens, timeout=timeout,
                      feature=feature)


def _redacted(messages: list[dict]) -> list[dict]:
    """Copies with text content masked; the caller's list (its history) is left as it was.
    A provider's own raw turn (Gemini's thought signatures) passes through untouched:
    it is the model's earlier answer to already-masked input."""
    out = []
    for m in messages:
        if isinstance(m, dict) and isinstance(m.get("content"), str):
            m = {**m, "content": redact(m["content"])}
        out.append(m)
    return out
